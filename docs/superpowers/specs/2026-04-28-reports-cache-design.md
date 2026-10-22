# Client Reports Pre-Warm Cache — Design Spec

**Date:** 2026-04-28
**Author:** Manu (via brainstorming session)
**Status:** Approved (pending spec review)
**Related:** Sales Summary cache (`src/lib/sales-cache.ts`, `/api/cron/refresh-sales`) — this design extends the same pattern to the Client Reports section.

## 1. Goal

Make every Client Reports page (Overview, Period Comparative, Inventory, Share of Voice, Subscribe & Save, Advertising Audit) render instantly when a user opens it, by pre-querying the underlying Redshift metrics every 6 hours and caching the responses in Supabase. Monthly Reports is explicitly out of scope.

Today, opening any of these pages triggers 5–15s Redshift queries per card/chart/table. The Sales Summary page solved this with a 6h cron + Supabase cache and now loads in <500ms; this spec applies the same approach to the rest of the Client Reports section.

## 2. Decisions Locked In

| Question | Decision |
|---|---|
| Date range scope | MTD + current ISO week + previous ISO week + last full month (4 ranges per client) |
| Cron architecture | One orchestrator cron + 7 fan-out worker endpoints with their own 300s budgets |
| Cache table | New dedicated `reports_cache` table, mirroring `sales_summary_cache` shape (24h TTL, `?refresh=true` bypass, cache-first reads, write-through on miss) |
| Drill-down endpoints | Cache-on-demand with same 24h TTL (no cron pre-warm) |
| Manual refresh button | Yes — one per section, calls all that section's endpoints with `?refresh=true` |
| Cold-start UX | Existing loading skeletons keep showing while live Redshift query runs; stale-while-revalidate punted to a later iteration |

## 3. Architecture

```
Vercel cron every 6h → /api/cron/refresh-reports (orchestrator)
                       │ fans out 7 parallel fetches
                       ▼
                  /api/internal/refresh/<worker>  (7 workers, 300s each)
                       │ loops 17 clients × 4 ranges × N routes
                       │ calls /api/reports/<route>?refresh=true
                       ▼
                  reports_cache (Supabase, 24h TTL)
                       ▲
                       │ cache-first read
                  /api/reports/<route> (10 routes, identical wrapper)
                       ▲
                       │
                  user opens /reports/<section> page
```

**Failure mode:** if cron fails or hasn't run yet, every endpoint still works — first user request hits live Redshift and writes through. Cache is purely an optimization layer.

## 4. Data Model

### 4.1 New table

`reports_cache` — same shape as `sales_summary_cache`:

```ts
// src/lib/db/schema.ts
export const reportsCache = pgTable("reports_cache", {
  id: serial("id").primaryKey(),
  cacheType: varchar("cache_type", { length: 64 }).notNull(),
  cacheKey: text("cache_key").notNull(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("reports_cache_type_key_idx").on(t.cacheType, t.cacheKey),
}));
```

Migration: one new Drizzle migration adds the table + unique index. No data to migrate.

### 4.2 `cacheType` values

Pre-warmed by cron:
- `report-overview`
- `report-keywords`
- `report-campaigns`
- `report-product-performance`
- `report-period-comparative`
- `report-inventory`
- `report-share-of-voice`
- `report-subscribe-save`
- `report-advertising-audit`
- `report-keywords-gaps`

Cache-on-demand (drill-downs, no cron pre-warm):
- `report-share-of-voice-keyword`
- `report-subscribe-save-asin`

### 4.3 Cache-key formats

| `cacheType` | Key format |
|---|---|
| Dated routes (8) | `${accountId}\|${start}\|${end}` |
| `report-inventory` | `${accountId}` (no dates — inventory is a snapshot) |
| `report-share-of-voice-keyword` | `${accountId}\|${start}\|${end}\|${keyword}` |
| `report-subscribe-save-asin` | `${accountId}\|${start}\|${end}\|${asin}` |

`accountId` is normalized: `accountId.split(",").map(s => s.trim()).sort().join(",")` — prevents duplicate cache rows for the same logical client when callers pass IDs in different orders. Matches sales-cache pattern.

### 4.4 TTL

24 hours (`MAX_AGE_MS = 24 * 60 * 60 * 1000`). Cron runs every 6h, so cache stays continuously warm. Rows older than 24h are treated as cache misses and trigger a fresh Redshift query.

## 5. Date Range Computation

Computed once per cron run by the orchestrator, passed to all workers in the fan-out body so every section caches the same 4 ranges. `startOfWeek`, `addDays`, and `fmt` below are inline helpers (no new dependency — match the date-math pattern in `src/app/api/cron/refresh-sales/route.ts`):

```ts
const now = new Date();

// MTD: 1st of current month → today
const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
const mtdEnd   = now;

// Current ISO week: Sunday → Saturday containing today
const currentSunday  = startOfWeek(now);
const currentSaturday = addDays(currentSunday, 6);

// Previous ISO week
const prevSunday  = addDays(currentSunday, -7);
const prevSaturday = addDays(prevSunday, 6);

// Last full month: 1st → last day of previous month
const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

const ranges = [
  { id: "mtd",        start: fmt(mtdStart),       end: fmt(mtdEnd) },
  { id: "this-week",  start: fmt(currentSunday),  end: fmt(currentSaturday) },
  { id: "prev-week",  start: fmt(prevSunday),     end: fmt(prevSaturday) },
  { id: "last-month", start: fmt(lastMonthStart), end: fmt(lastMonthEnd) },
];
```

**Edge cases acknowledged:**
- MTD on the 1st of a month → `start === end` (single-day query). Some routes may return empty; matches what the page would show anyway.
- `currentSaturday` lies in the future when run mid-week → Redshift returns partial-week data. Same behavior as today's live page.
- MTD overlaps with `this-week` and `prev-week` in the first week of a month → expected; each is a separate cache key.

**Why not YoY / week-before-prev:** unlike sales-summary, the reports section components don't render side-by-side year-over-year columns. Period Comparative computes its own comparison server-side from the single `start/end` it receives. Pre-warming YoY adds zero perceptible benefit.

## 6. Cron + Worker Fan-out

### 6.1 Orchestrator

`src/app/api/cron/refresh-reports/route.ts`:

```ts
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // 1. Auth: require Bearer ${CRON_SECRET}
  // 2. Compute the 4 ranges (Section 5)
  // 3. Load client list via getReportClients()
  // 4. fetch() all 7 workers in parallel with refresh=true; pass {ranges, clients} in body
  // 5. await Promise.allSettled() — collect per-worker status
  // 6. return { workers: [{ name, status, durationMs, count }], ranges, timestamp }
}
```

### 6.2 Workers

7 worker endpoints under `/api/internal/refresh/`:

| Worker file | Routes pre-warmed | Volume per run |
|---|---|---|
| `overview-cards/route.ts` | overview | 1 × 4 × 17 = 68 |
| `overview-tables/route.ts` | keywords, campaigns, product-performance | 3 × 4 × 17 = 204 |
| `period-comparative/route.ts` | period-comparative | 68 |
| `inventory/route.ts` | inventory | 17 (no date dimension) |
| `share-of-voice/route.ts` | share-of-voice | 68 |
| `subscribe-save/route.ts` | subscribe-save | 68 |
| `advertising-audit/route.ts` | advertising-audit, keywords-gaps | 136 |

Total per cron run: **629 cache writes**.

Each worker:
- Has `export const maxDuration = 300`.
- Accepts POST body `{ ranges: Range[], clients: ClientInfo[] }`.
- Auth: requires `Authorization: Bearer ${CRON_SECRET}`.
- Loop pattern (matches sales-summary `BATCH_SIZE=3`):

```ts
for (const range of ranges) {
  for (let i = 0; i < clients.length; i += 3) {
    const batch = clients.slice(i, i + 3);
    await Promise.all(batch.map(async (client) => {
      for (const route of myRoutes) {
        await fetch(`${baseUrl}/api/reports/${route}?accountId=${id}&start=${range.start}&end=${range.end}&refresh=true`, {
          headers: { Authorization: `Bearer ${cronSecret}`, "x-cron-refresh": "true" },
        });
      }
    }));
  }
}
```

Heaviest worker `overview-tables`: 3 routes × 4 ranges × 17 clients ÷ 3 batch parallelism × ~10s per Redshift query ≈ 230s. Comfortably under 300s.

### 6.3 Shared client list

New module `src/lib/report-clients.ts` exports the 17-client roster currently hardcoded in `src/app/reports/page.tsx` lines 108–126. Both the cron and the UI import from this module so they cannot drift.

```ts
// src/lib/report-clients.ts
export type ReportClient = { name: string; accountIds: string[] };
export const REPORT_CLIENTS: ReportClient[] = [
  { name: "Cloud23 Seller Central", accountIds: ["2348430"] },
  // ...all 17 clients
];
export function getReportClients(): ReportClient[] { return REPORT_CLIENTS; }
```

### 6.4 Vercel cron config

Add one entry to `vercel.json`:

```json
{ "path": "/api/cron/refresh-reports", "schedule": "15 */6 * * *" }
```

Schedule offset by 15 minutes from `refresh-sales` (`0 */6 * * *`) to spread Redshift load. Total cron entries: 9 (Vercel Pro allows up to 40).

## 7. Per-Route Cache Wrapping

All 10 reports API routes get the same wrapper applied (~13 lines added per route, no Redshift query logic changes).

### 7.1 Wrapper pattern

```ts
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";

export async function GET(req: NextRequest) {
  // ... existing auth/param parsing unchanged ...
  const accountId = searchParams.get("accountId") ?? "";
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const refresh = searchParams.get("refresh") === "true";

  const cacheKey = buildDatedKey(accountId, start, end);

  // ── cache-first ──
  if (!refresh) {
    const cached = await getCachedReport<OverviewResponse>("report-overview", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  // ── existing Redshift query logic unchanged ──
  const data = await /* existing query */;

  // ── write through ──
  await setCachedReport("report-overview", cacheKey, data);

  return NextResponse.json(data);
}
```

### 7.2 Inventory route specifics

`/api/reports/inventory` has no `start`/`end` query params (it's a snapshot endpoint). Wrapper uses `buildAccountKey(accountId)` instead of `buildDatedKey`.

### 7.3 Drill-down route specifics

`share-of-voice-keyword` and `subscribe-save?asin=X` accept extra params (`keyword`, `asin`). Wrappers use the corresponding extended key builders. They are NOT pre-warmed by cron — only cached on the user's first request and reused for 24h.

### 7.4 Cache module

New file `src/lib/reports-cache.ts`. Exports:
- `getCachedReport<T>(cacheType: string, cacheKey: string): Promise<T | null>` (24h TTL check)
- `setCachedReport(cacheType: string, cacheKey: string, data: unknown): Promise<void>` (upsert)
- `buildDatedKey(accountId: string, start: string, end: string): string`
- `buildAccountKey(accountId: string): string`
- `buildKeywordKey(accountId, start, end, keyword): string`
- `buildAsinKey(accountId, start, end, asin): string`

All `accountId` arguments normalized via shared helper (sort + trim comma-separated IDs).

### 7.5 `?refresh=true` security

The reports routes do not enforce `Authorization` on `?refresh=true` calls — any logged-in user can trigger a refresh. Worst case: the user re-warms cache earlier than the cron, which is harmless. The internal worker endpoints (`/api/internal/refresh/*`) and the orchestrator cron DO enforce `Authorization: Bearer ${CRON_SECRET}` and reject everything else.

## 8. UI: Manual Refresh Button

### 8.1 Component

New component `src/components/reports/refresh-button.tsx`:

- Props: `{ section: ReportSection, accountId: string, start: string, end: string, onRefreshed: () => void }`.
- Maps section → list of endpoints to refresh:
  ```
  overview          → overview, keywords, campaigns, product-performance
  period-comparative → period-comparative
  inventory         → inventory  (no start/end)
  share-of-voice    → share-of-voice
  subscribe-save    → subscribe-save
  advertising-audit → advertising-audit, keywords-gaps
  ```
- On click: fires `fetch(`/api/reports/${endpoint}?...&refresh=true`)` for each endpoint in parallel, disables button + shows spinner until all settle.
- Toast on success ("Refreshed N endpoints in 12.4s") and on error.
- After completion calls `onRefreshed()`.

### 8.2 Integration in reports page

`src/app/reports/page.tsx`:
- Add `refreshKey` state (number, bumped on refresh).
- Pass `refreshKey` to every section component as a prop, including in the dependency array of their internal `useEffect` fetches.
- Render `<RefreshButton>` inside each section's `<PageMetaSlot>` block (right of the existing date controls).

### 8.3 Visual treatment

Small gold-bordered pill matching the existing date-mode toggle style ("Refresh ↻"). Conforms to `DESIGN.md` (gold accent for hub).

### 8.4 Auto-warm policy

The 6h cron is the only auto-warm. Section pages do NOT trigger refreshes on mount or on date change — they read the cache like any other request. This keeps Redshift load predictable and matches the user's stated requirement that data is ready before the user opens the page.

## 9. Testing

Mirrors existing test pattern (`src/app/api/sales-summary/__tests__/`, vitest with `vi.mock` for `@/lib/auth-db`, `@/lib/db`, `@/lib/redshift`).

### 9.1 Unit tests — `src/lib/__tests__/reports-cache.test.ts`

- `getCachedReport` returns null on cache miss
- `getCachedReport` returns null when row is older than 24h (TTL boundary)
- `getCachedReport` returns data when row is fresh
- `setCachedReport` upserts (insert + on-conflict update both work)
- Key builders normalize comma-separated `accountId` (sort + trim, dedupe — same input set produces same key)

### 9.2 Route wrapper tests — one per route (10 files)

For each of the 10 reports routes:
- Cache hit: returns cached data without calling Redshift mock
- Cache miss: calls Redshift, writes through, returns data
- `?refresh=true`: bypasses cache (Redshift called even when cache fresh), writes through

Inventory route uses no-date key shape; drill-down routes use extended key builders.

### 9.3 Cron orchestrator test — `src/app/api/cron/refresh-reports/__tests__/route.test.ts`

- Rejects request without `Authorization: Bearer ${CRON_SECRET}`
- Computes the 4 ranges correctly (mtd, this-week, prev-week, last-month) for a fixed mocked `now`
- Fans out to all 7 workers (assert `fetch` called 7 times with right URLs)
- Returns aggregate status from `Promise.allSettled`

### 9.4 Worker test — one shared parametrized test for all 7 workers

- Auth check (rejects non-cron requests)
- Iterates all clients × all ranges × all routes for that worker
- Batches in groups of 3 (asserts no more than 3 in-flight fetches at a time)

### 9.5 Manual integration smoke test (post-deploy)

Documented in spec; not automated:
1. Hit `/api/cron/refresh-reports` with the cron secret.
2. Wait for `Promise.allSettled` to return.
3. Open each section in the browser; confirm response time < 500ms (cache hit).

### 9.6 Coverage target

All new code covered (lib + workers + cron + wrapper additions). Existing Redshift query logic in each route is unchanged and has its own existing tests we don't touch.

## 10. Files Touched

### New
- `src/lib/reports-cache.ts` (~80 LOC)
- `src/lib/report-clients.ts` (~30 LOC)
- `src/app/api/cron/refresh-reports/route.ts` (~80 LOC)
- `src/app/api/internal/refresh/overview-cards/route.ts` (~60 LOC)
- `src/app/api/internal/refresh/overview-tables/route.ts` (~60 LOC)
- `src/app/api/internal/refresh/period-comparative/route.ts` (~50 LOC)
- `src/app/api/internal/refresh/inventory/route.ts` (~50 LOC)
- `src/app/api/internal/refresh/share-of-voice/route.ts` (~50 LOC)
- `src/app/api/internal/refresh/subscribe-save/route.ts` (~50 LOC)
- `src/app/api/internal/refresh/advertising-audit/route.ts` (~60 LOC)
- `src/components/reports/refresh-button.tsx` (~80 LOC)
- `drizzle/migrations/<NNNN>_reports_cache.sql` (~15 LOC)
- Test files (~12 new files, ~600 LOC total)

### Modified
- `src/lib/db/schema.ts` (+~15 LOC — `reportsCache` table)
- `src/app/reports/page.tsx` (+~20 LOC — `refreshKey` state, pass to section components, render button per section, replace inline `CLIENTS` const with import)
- `src/app/api/reports/overview/route.ts` (+~13 LOC — wrapper)
- `src/app/api/reports/keywords/route.ts` (+~13 LOC)
- `src/app/api/reports/campaigns/route.ts` (+~13 LOC)
- `src/app/api/reports/product-performance/route.ts` (+~13 LOC)
- `src/app/api/reports/period-comparative/route.ts` (+~13 LOC)
- `src/app/api/reports/inventory/route.ts` (+~13 LOC, no-date key)
- `src/app/api/reports/share-of-voice/route.ts` (+~13 LOC)
- `src/app/api/reports/subscribe-save/route.ts` (+~16 LOC, two key shapes — base + asin drill-down)
- `src/app/api/reports/advertising-audit/route.ts` (+~13 LOC)
- `src/app/api/reports/keywords-gaps/route.ts` (+~13 LOC)
- `src/app/api/reports/share-of-voice-keyword/route.ts` (+~13 LOC, keyword key shape)
- `vercel.json` (+1 cron entry)

**Estimated total:** ~1,400 LOC (mostly tests; ~700 LOC production code).

## 11. Out of Scope / Future Work

- **Stale-while-revalidate UX** — serve stale cache instantly + refresh in background. Punted; current loading skeletons stay.
- **Pre-warm of arbitrary custom date ranges** — falls through to live Redshift on first hit (same as sales-summary).
- **Cache invalidation on Redshift data changes** — relies on 24h TTL + 6h cron. Not pushed via webhook.
- **Per-client toggling** — all 17 clients always pre-warmed. No "warm only active clients" logic.
- **Monthly Reports** — explicitly excluded by the user; that section has its own caching/print pipeline.

## 12. Open Risks

- **Worker timeout on `overview-tables`** — projected ~230s vs 300s limit. If real Redshift latency exceeds projection, mitigate by either bumping `BATCH_SIZE` from 3 → 5 (more Redshift pressure but workers get headroom) or splitting `overview-tables` further into per-route workers.
- **Redshift concurrent query limit** — 7 workers × 3 batched clients × N routes-in-parallel could hit ~20+ concurrent Redshift queries. If we see throttling, reduce `BATCH_SIZE` per worker or stagger worker start times.
- **Cron secret leak** — same risk as the existing `refresh-sales` cron. Mitigated by Vercel env var handling.
- **Drift between `report-clients.ts` and reality** — adding a new client requires editing the file. Acceptable for now (rare event); future work could read from the `clients` DB table directly.
