# Client Reports Pre-Warm Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Client Reports section page (Overview, Period Comparative, Inventory, Share of Voice, Subscribe & Save, Advertising Audit) render instantly by pre-querying Redshift metrics every 6h and caching the responses in Supabase. Monthly Reports is excluded.

**Architecture:** Mirror the existing sales-summary cache pattern. New `reports_cache` table (24h TTL). Cache-first wrapper added to 11 reports API routes (write-through on miss, `?refresh=true` bypass). One Vercel cron orchestrator fans out to 7 worker endpoints that pre-warm 4 date ranges (MTD, this-week, prev-week, last-month) × 17 clients per worker. Manual refresh button per section.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + PostgreSQL (Supabase), Vitest, React 19, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-28-reports-cache-design.md`

**Reference pattern (read first):**
- Schema: `src/lib/db/schema.ts:1229` (salesSummaryCache)
- Cache module: `src/lib/sales-cache.ts`
- Cache-first wrapper: `src/app/api/sales-summary/route.ts`
- Cron orchestrator: `src/app/api/cron/refresh-sales/route.ts`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `src/lib/reports-cache.ts` | Cache module (get, set, key builders) |
| `src/lib/report-clients.ts` | Shared 17-client list for cron + UI |
| `src/components/reports/refresh-button.tsx` | Manual refresh UI per section |
| `src/app/api/cron/refresh-reports/route.ts` | Orchestrator cron endpoint |
| `src/app/api/internal/refresh/overview-cards/route.ts` | Worker for `overview` route |
| `src/app/api/internal/refresh/overview-tables/route.ts` | Worker for `keywords + campaigns + product-performance` |
| `src/app/api/internal/refresh/period-comparative/route.ts` | Worker for `period-comparative` |
| `src/app/api/internal/refresh/inventory/route.ts` | Worker for `inventory` (no dates) |
| `src/app/api/internal/refresh/share-of-voice/route.ts` | Worker for `share-of-voice` |
| `src/app/api/internal/refresh/subscribe-save/route.ts` | Worker for `subscribe-save` |
| `src/app/api/internal/refresh/advertising-audit/route.ts` | Worker for `advertising-audit + keywords-gaps` |
| `drizzle/migrations/<NNNN>_reports_cache.sql` | Drizzle migration (auto-generated) |

### Modified files
| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `reportsCache` table |
| `vercel.json` | Add `refresh-reports` cron entry |
| `src/app/reports/page.tsx` | Replace inline `CLIENTS` with import; add `refreshKey` state + `<RefreshButton>` per section |
| `src/app/api/reports/overview/route.ts` | Cache wrapper |
| `src/app/api/reports/keywords/route.ts` | Cache wrapper |
| `src/app/api/reports/campaigns/route.ts` | Cache wrapper |
| `src/app/api/reports/product-performance/route.ts` | Cache wrapper |
| `src/app/api/reports/period-comparative/route.ts` | Cache wrapper |
| `src/app/api/reports/inventory/route.ts` | Cache wrapper (no-date key) |
| `src/app/api/reports/share-of-voice/route.ts` | Cache wrapper |
| `src/app/api/reports/share-of-voice-keyword/route.ts` | Cache wrapper (keyword key) |
| `src/app/api/reports/subscribe-save/route.ts` | Cache wrapper (base + asin key) |
| `src/app/api/reports/advertising-audit/route.ts` | Cache wrapper |
| `src/app/api/reports/keywords-gaps/route.ts` | Cache wrapper |

---

## Task 1: Add `reportsCache` schema entry

**Files:**
- Modify: `src/lib/db/schema.ts` (append after `salesSummaryCache` at line 1247)

- [ ] **Step 1: Append schema definition**

Add to the very end of the table definitions section, just before `// ─── Type exports ───`:

```ts
// ─── Reports Cache ───────────────────────────────────────────────────
// Stores pre-warmed Redshift responses for /reports section pages
// (excluding Monthly Reports). Keyed by cache_type (report-overview,
// report-keywords, etc.) + cache_key (accountId|start|end variants).

export const reportsCache = pgTable(
  "reports_cache",
  {
    id: serial("id").primaryKey(),
    cacheType: varchar("cache_type", { length: 64 }).notNull(),
    cacheKey: text("cache_key").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_reports_cache_type_key").on(table.cacheType, table.cacheKey),
    index("idx_reports_cache_updated").on(table.updatedAt),
  ]
);
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/migrations/<NNNN>_<random_name>.sql` containing `CREATE TABLE "reports_cache"` and the unique constraint + index.

- [ ] **Step 3: Inspect generated SQL**

Read the generated `.sql` file. Confirm it contains exactly: `CREATE TABLE`, the unique constraint on `(cache_type, cache_key)`, the index on `updated_at`, and no destructive operations on other tables.

- [ ] **Step 4: Apply migration**

Run: `npm run db:migrate`
Expected: "Migration completed" or equivalent success output. If it hangs (Drizzle pooler issue per CLAUDE.md), kill and use `npm run db:push` for dev.

- [ ] **Step 5: Verify table exists**

Run: `npm run db:studio` (or query Supabase). Confirm `reports_cache` exists with the expected columns and constraint.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/
git commit -m "feat(reports-cache): add reports_cache schema + migration"
```

---

## Task 2: Build `src/lib/reports-cache.ts`

**Files:**
- Create: `src/lib/reports-cache.ts`
- Test: `src/lib/__tests__/reports-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/reports-cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import {
  getCachedReport,
  setCachedReport,
  buildDatedKey,
  buildAccountKey,
  buildKeywordKey,
  buildAsinKey,
} from "../reports-cache";

describe("reports-cache key builders", () => {
  it("buildDatedKey normalizes comma-separated accountIds (sort + trim)", () => {
    expect(buildDatedKey("b, a, c", "2026-04-01", "2026-04-30")).toBe(
      "a,b,c|2026-04-01|2026-04-30",
    );
  });

  it("buildAccountKey normalizes accountIds without dates", () => {
    expect(buildAccountKey("2,1")).toBe("1,2");
  });

  it("buildKeywordKey appends keyword unchanged", () => {
    expect(buildKeywordKey("1", "2026-04-01", "2026-04-30", "dog treats")).toBe(
      "1|2026-04-01|2026-04-30|dog treats",
    );
  });

  it("buildAsinKey appends asin unchanged", () => {
    expect(buildAsinKey("1", "2026-04-01", "2026-04-30", "B0ABC")).toBe(
      "1|2026-04-01|2026-04-30|B0ABC",
    );
  });

  it("same input set produces same key regardless of order/whitespace", () => {
    expect(buildDatedKey("b,a", "2026-04-01", "2026-04-30")).toBe(
      buildDatedKey("a, b", "2026-04-01", "2026-04-30"),
    );
  });
});

describe("getCachedReport", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockSelectResult(rows: Array<{ data: unknown; updatedAt: Date }>) {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    });
  }

  it("returns null on cache miss", async () => {
    mockSelectResult([]);
    expect(await getCachedReport("report-overview", "k")).toBeNull();
  });

  it("returns null when row is older than 24h", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockSelectResult([{ data: { x: 1 }, updatedAt: stale }]);
    expect(await getCachedReport("report-overview", "k")).toBeNull();
  });

  it("returns data when row is fresh", async () => {
    const fresh = new Date(Date.now() - 1000);
    mockSelectResult([{ data: { x: 1 }, updatedAt: fresh }]);
    expect(await getCachedReport("report-overview", "k")).toEqual({ x: 1 });
  });
});

describe("setCachedReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts (insert + on-conflict update)", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });

    await setCachedReport("report-overview", "k", { x: 1 });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheType: "report-overview",
        cacheKey: "k",
        data: { x: 1 },
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- reports-cache`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement `reports-cache.ts`**

Create `src/lib/reports-cache.ts`:

```ts
import { db } from "@/lib/db";
import { reportsCache } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeAccountId(accountId: string): string {
  return accountId
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

export async function getCachedReport<T>(
  cacheType: string,
  cacheKey: string,
): Promise<T | null> {
  const rows = await db
    .select({ data: reportsCache.data, updatedAt: reportsCache.updatedAt })
    .from(reportsCache)
    .where(
      and(
        eq(reportsCache.cacheType, cacheType),
        eq(reportsCache.cacheKey, cacheKey),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > MAX_AGE_MS) return null;

  return row.data as T;
}

export async function setCachedReport(
  cacheType: string,
  cacheKey: string,
  data: unknown,
): Promise<void> {
  await db
    .insert(reportsCache)
    .values({
      cacheType,
      cacheKey,
      data: data as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [reportsCache.cacheType, reportsCache.cacheKey],
      set: {
        data: data as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

export function buildDatedKey(
  accountId: string,
  start: string,
  end: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}`;
}

export function buildAccountKey(accountId: string): string {
  return normalizeAccountId(accountId);
}

export function buildKeywordKey(
  accountId: string,
  start: string,
  end: string,
  keyword: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}|${keyword}`;
}

export function buildAsinKey(
  accountId: string,
  start: string,
  end: string,
  asin: string,
): string {
  return `${normalizeAccountId(accountId)}|${start}|${end}|${asin}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- reports-cache`
Expected: all 8+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports-cache.ts src/lib/__tests__/reports-cache.test.ts
git commit -m "feat(reports-cache): add reports-cache module with key builders"
```

---

## Task 3: Build `src/lib/report-clients.ts` shared client list

**Files:**
- Create: `src/lib/report-clients.ts`

- [ ] **Step 1: Read existing client list**

Read `src/app/reports/page.tsx` lines 108–126 and copy the 17 entries verbatim.

- [ ] **Step 2: Create the module**

Create `src/lib/report-clients.ts`:

```ts
export type ReportClient = {
  name: string;
  accountIds: string[];
};

export const REPORT_CLIENTS: ReportClient[] = [
  { name: "Cloud23 Seller Central", accountIds: ["2348430"] },
  { name: "Cloud23 Whole Foods", accountIds: ["2557190"] },
  { name: "Pura", accountIds: ["2706460"] },
  { name: "Fresh Vintage Farms", accountIds: ["1067740"] },
  { name: "Whitney Jordan", accountIds: ["3388210"] },
  { name: "Trejo's Tacos", accountIds: ["910420"] },
  { name: "Trejo's Spirits", accountIds: ["1268300"] },
  { name: "Dreamiere", accountIds: ["2572940"] },
  { name: "Dr. Wolff USA", accountIds: ["1145180"] },
  { name: "Hotshot US", accountIds: ["272970"] },
  { name: "BNutty", accountIds: ["1707700"] },
  { name: "Brad's", accountIds: ["3629290"] },
  { name: "Dr. Cuddles", accountIds: ["1899670"] },
  { name: "Poochie Butter", accountIds: ["3415610"] },
  { name: "Glo Health Foods", accountIds: ["3735620"] },
  { name: "Gaffer", accountIds: ["154290"] },
  { name: "This PKN", accountIds: ["563510"] },
];

export function getReportClients(): ReportClient[] {
  return REPORT_CLIENTS;
}

/**
 * Returns the legacy { [name]: accountId } shape used by the
 * existing /reports/page.tsx UI dropdown.
 */
export function getReportClientsAsRecord(): Record<string, string> {
  return Object.fromEntries(
    REPORT_CLIENTS.map((c) => [c.name, c.accountIds[0]]),
  );
}
```

- [ ] **Step 3: Replace inline `CLIENTS` const in reports page**

Modify `src/app/reports/page.tsx`. Delete lines 108–126 (the `const CLIENTS: Record<string, string> = { ... }` block). Add this import near the top imports:

```ts
import { getReportClientsAsRecord } from "@/lib/report-clients";
```

Then near the top of `ReportsPage` component (just after `useState` declarations), add:

```ts
const CLIENTS = getReportClientsAsRecord();
```

- [ ] **Step 4: Run dev server, verify dropdown still works**

Run: `PORT=3000 npm run dev`
Open: http://localhost:3000/reports → click any section → confirm client dropdown shows all 17 clients with same names. Switch a few clients to confirm they load.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-clients.ts src/app/reports/page.tsx
git commit -m "refactor(reports): extract client roster to shared module"
```

---

## Task 4: Wrap `/api/reports/overview` route with cache

**Files:**
- Modify: `src/app/api/reports/overview/route.ts`
- Test: `src/app/api/reports/overview/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/reports/overview/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  auth: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildDatedKey: vi.fn((a, s, e) => `${a}|${s}|${e}`),
}));

import { GET } from "../route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/reports/overview");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

describe("GET /api/reports/overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ totalSales: 42 });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ totalSales: 42 });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ totalSales: 99 }]);

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-overview",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ totalSales: 99 }]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/reports/overview`
Expected: FAIL — wrapper not yet present, `setCachedReport` never called.

- [ ] **Step 3: Read the existing route**

Read `src/app/api/reports/overview/route.ts` end-to-end. Identify:
- Where `searchParams` are parsed
- Where the Redshift query is executed
- Where the final `NextResponse.json(data)` returns

- [ ] **Step 4: Add cache wrapper**

Modify `src/app/api/reports/overview/route.ts`:

1. At the top, add imports:
   ```ts
   import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
   ```

2. Just after `searchParams` are extracted, add:
   ```ts
   const refresh = searchParams.get("refresh") === "true";
   const cacheKey = buildDatedKey(accountId, start, end);

   if (!refresh) {
     const cached = await getCachedReport<unknown>("report-overview", cacheKey);
     if (cached) return NextResponse.json(cached);
   }
   ```

3. Just before the existing `return NextResponse.json(...)` at the end of `GET`, add:
   ```ts
   await setCachedReport("report-overview", cacheKey, data);
   ```
   (Replace `data` with whatever variable holds the response payload — match the existing return.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/app/api/reports/overview`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/reports/overview/
git commit -m "feat(reports-cache): wrap overview route with cache-first reads"
```

---

## Tasks 5–11: Wrap remaining 7 dated routes (identical pattern)

Each task follows the **exact same pattern as Task 4** (write 3 tests for the route, run them to fail, add the wrapper, run them to pass, commit). Only the cacheType string and route path change.

| Task | Route file | `cacheType` | Commit message |
|---|---|---|---|
| 5 | `src/app/api/reports/keywords/route.ts` | `report-keywords` | `feat(reports-cache): wrap keywords route` |
| 6 | `src/app/api/reports/campaigns/route.ts` | `report-campaigns` | `feat(reports-cache): wrap campaigns route` |
| 7 | `src/app/api/reports/product-performance/route.ts` | `report-product-performance` | `feat(reports-cache): wrap product-performance route` |
| 8 | `src/app/api/reports/period-comparative/route.ts` | `report-period-comparative` | `feat(reports-cache): wrap period-comparative route` |
| 9 | `src/app/api/reports/share-of-voice/route.ts` | `report-share-of-voice` | `feat(reports-cache): wrap share-of-voice route` |
| 10 | `src/app/api/reports/advertising-audit/route.ts` | `report-advertising-audit` | `feat(reports-cache): wrap advertising-audit route` |
| 11 | `src/app/api/reports/keywords-gaps/route.ts` | `report-keywords-gaps` | `feat(reports-cache): wrap keywords-gaps route` |

For each task:
- [ ] Step 1: Copy the test file from Task 4, change `overview` → `<route>` and `report-overview` → `<cacheType>`. Save to `src/app/api/reports/<route>/__tests__/route.test.ts`.
- [ ] Step 2: Run tests, verify FAIL.
- [ ] Step 3: Apply the same 3-edit wrapper from Task 4 Step 4 (imports, cache-first block, write-through), substituting the cacheType.
- [ ] Step 4: Run tests, verify PASS.
- [ ] Step 5: Commit using the message above.

---

## Task 12: Wrap `/api/reports/inventory` route (no-date key shape)

**Files:**
- Modify: `src/app/api/reports/inventory/route.ts`
- Test: `src/app/api/reports/inventory/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/reports/inventory/__tests__/route.test.ts`. Same as Task 4 but:
- Drop `start`/`end` from `makeRequest` calls.
- Replace `buildDatedKey` mock with `buildAccountKey: vi.fn((a) => a)`.
- cacheType = `"report-inventory"`.
- Expected key in `setCachedReport` assertion: `"1"` (just accountId).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/reports/inventory`
Expected: FAIL.

- [ ] **Step 3: Add cache wrapper using `buildAccountKey`**

Modify `src/app/api/reports/inventory/route.ts`:

1. Imports:
   ```ts
   import { getCachedReport, setCachedReport, buildAccountKey } from "@/lib/reports-cache";
   ```

2. After `accountId` is parsed:
   ```ts
   const refresh = searchParams.get("refresh") === "true";
   const cacheKey = buildAccountKey(accountId);

   if (!refresh) {
     const cached = await getCachedReport<unknown>("report-inventory", cacheKey);
     if (cached) return NextResponse.json(cached);
   }
   ```

3. Before final return:
   ```ts
   await setCachedReport("report-inventory", cacheKey, data);
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/api/reports/inventory`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/inventory/
git commit -m "feat(reports-cache): wrap inventory route (no-date key)"
```

---

## Task 13: Wrap `/api/reports/share-of-voice-keyword` (keyword drill-down)

**Files:**
- Modify: `src/app/api/reports/share-of-voice-keyword/route.ts`
- Test: `src/app/api/reports/share-of-voice-keyword/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Same structure as Task 4 but:
- `makeRequest` includes `keyword: "dog treats"`.
- Mock `buildKeywordKey: vi.fn((a, s, e, k) => \`${a}|${s}|${e}|${k}\`)`.
- cacheType = `"report-share-of-voice-keyword"`.
- Expected key: `"1|2026-04-01|2026-04-30|dog treats"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- share-of-voice-keyword`
Expected: FAIL.

- [ ] **Step 3: Add cache wrapper using `buildKeywordKey`**

Modify `src/app/api/reports/share-of-voice-keyword/route.ts`:

```ts
import { getCachedReport, setCachedReport, buildKeywordKey } from "@/lib/reports-cache";
```

After params are parsed (`accountId`, `start`, `end`, `keyword`):

```ts
const refresh = searchParams.get("refresh") === "true";
const cacheKey = buildKeywordKey(accountId, start, end, keyword);

if (!refresh) {
  const cached = await getCachedReport<unknown>("report-share-of-voice-keyword", cacheKey);
  if (cached) return NextResponse.json(cached);
}
```

Before final return:
```ts
await setCachedReport("report-share-of-voice-keyword", cacheKey, data);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- share-of-voice-keyword`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/share-of-voice-keyword/
git commit -m "feat(reports-cache): wrap share-of-voice-keyword (keyword key)"
```

---

## Task 14: Wrap `/api/reports/subscribe-save` (base + asin drill-down)

**Files:**
- Modify: `src/app/api/reports/subscribe-save/route.ts`
- Test: `src/app/api/reports/subscribe-save/__tests__/route.test.ts`

The route handles two cases: no `asin` → base cache; with `asin` → drill-down cache.

- [ ] **Step 1: Write the failing tests**

```ts
// 4 tests instead of 3:
// 1. cache hit (no asin) → returns cached, no Redshift
// 2. cache miss (no asin) → Redshift + setCachedReport("report-subscribe-save", "1|...|...", ...)
// 3. cache miss (with asin) → Redshift + setCachedReport("report-subscribe-save-asin", "1|...|...|B0ABC", ...)
// 4. ?refresh=true (no asin) → bypasses cache
```

Mocks include both `buildDatedKey` and `buildAsinKey`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- subscribe-save`
Expected: FAIL.

- [ ] **Step 3: Add wrapper with conditional key**

Modify `src/app/api/reports/subscribe-save/route.ts`:

```ts
import {
  getCachedReport,
  setCachedReport,
  buildDatedKey,
  buildAsinKey,
} from "@/lib/reports-cache";
```

After params are parsed (`accountId`, `start`, `end`, optional `asin`):

```ts
const refresh = searchParams.get("refresh") === "true";
const cacheType = asin ? "report-subscribe-save-asin" : "report-subscribe-save";
const cacheKey = asin
  ? buildAsinKey(accountId, start, end, asin)
  : buildDatedKey(accountId, start, end);

if (!refresh) {
  const cached = await getCachedReport<unknown>(cacheType, cacheKey);
  if (cached) return NextResponse.json(cached);
}
```

Before final return:
```ts
await setCachedReport(cacheType, cacheKey, data);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- subscribe-save`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/subscribe-save/
git commit -m "feat(reports-cache): wrap subscribe-save (base + asin drill-down)"
```

---

## Task 15: Build worker `overview-cards`

**Files:**
- Create: `src/app/api/internal/refresh/overview-cards/route.ts`
- Test: `src/app/api/internal/refresh/overview-cards/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/internal/refresh/overview-cards/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "../route";

const RANGES = [
  { id: "mtd", start: "2026-04-01", end: "2026-04-28" },
  { id: "this-week", start: "2026-04-26", end: "2026-05-02" },
];
const CLIENTS = [
  { name: "A", accountIds: ["1"] },
  { name: "B", accountIds: ["2"] },
  { name: "C", accountIds: ["3"] },
  { name: "D", accountIds: ["4"] },
];

function makeRequest(secret: string): Request {
  return new Request("http://localhost/api/internal/refresh/overview-cards", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: RANGES, clients: CLIENTS }),
  });
}

describe("POST /api/internal/refresh/overview-cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("rejects requests without the cron Bearer token", async () => {
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls overview route once per (range × client)", async () => {
    await POST(makeRequest("test-secret"));
    // 2 ranges × 4 clients = 8 fetches
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes("/api/reports/overview"))).toBe(true);
    expect(urls.every((u) => u.includes("refresh=true"))).toBe(true);
  });

  it("returns aggregate ok/error counts", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    const res = await POST(makeRequest("test-secret"));
    const json = await res.json();
    expect(json.ok + json.errors).toBe(8);
    expect(json.errors).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- overview-cards`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the worker**

Create `src/app/api/internal/refresh/overview-cards/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const ROUTES = ["overview"]; // single route for this worker
const BATCH_SIZE = 3;

type Range = { id: string; start: string; end: string };
type Client = { name: string; accountIds: string[] };

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { ranges: Range[]; clients: Client[] };
  const { ranges, clients } = body;

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    "x-cron-refresh": "true",
  };

  let ok = 0;
  let errors = 0;

  for (const range of ranges) {
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (client) => {
          const accountId = client.accountIds.join(",");
          const promises = ROUTES.map((route) => {
            const url = `${baseUrl}/api/reports/${route}?accountId=${accountId}&start=${range.start}&end=${range.end}&refresh=true`;
            return fetch(url, { headers }).then((r) => r.ok).catch(() => false);
          });
          return Promise.all(promises);
        }),
      );
      for (const clientResults of results) {
        for (const success of clientResults) {
          if (success) ok++;
          else errors++;
        }
      }
    }
  }

  return NextResponse.json({ worker: "overview-cards", ok, errors });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- overview-cards`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/internal/refresh/overview-cards/
git commit -m "feat(reports-cache): add overview-cards refresh worker"
```

---

## Tasks 16–21: Build remaining 6 workers (identical pattern)

Each follows the **exact same pattern as Task 15**. Only `ROUTES` and the file path change. Tests are essentially identical (substitute the worker name and expected route URLs). **Repeat the test file and `route.ts` from Task 15 verbatim**, only changing the listed values.

| Task | Worker dir | `ROUTES` array | Commit message |
|---|---|---|---|
| 16 | `overview-tables` | `["keywords", "campaigns", "product-performance"]` | `feat(reports-cache): add overview-tables refresh worker` |
| 17 | `period-comparative` | `["period-comparative"]` | `feat(reports-cache): add period-comparative refresh worker` |
| 18 | `share-of-voice` | `["share-of-voice"]` | `feat(reports-cache): add share-of-voice refresh worker` |
| 19 | `subscribe-save` | `["subscribe-save"]` | `feat(reports-cache): add subscribe-save refresh worker` |
| 20 | `advertising-audit` | `["advertising-audit", "keywords-gaps"]` | `feat(reports-cache): add advertising-audit refresh worker` |
| 21 | `inventory` | `["inventory"]` **+ no-date URL shape** | `feat(reports-cache): add inventory refresh worker (no dates)` |

**Task 21 inventory worker special case:** the inventory worker doesn't loop over ranges (no date dimension). Replace the outer `for (const range of ranges)` loop with a single pass:

```ts
// Inventory worker body (replaces the dated loop):
for (let i = 0; i < clients.length; i += BATCH_SIZE) {
  const batch = clients.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(
    batch.map(async (client) => {
      const accountId = client.accountIds.join(",");
      const url = `${baseUrl}/api/reports/inventory?accountId=${accountId}&refresh=true`;
      return fetch(url, { headers }).then((r) => r.ok).catch(() => false);
    }),
  );
  for (const success of results) {
    if (success) ok++;
    else errors++;
  }
}
```

For Task 21, the test should expect 4 fetches (once per client, no range loop) and the body should still accept `{ ranges, clients }` even though it ignores `ranges` (uniform interface).

For each task:
- [ ] Step 1: Copy Task 15's test + route files; substitute `ROUTES`, worker name, file path.
- [ ] Step 2: Run tests, verify FAIL.
- [ ] Step 3: Save the substituted route file.
- [ ] Step 4: Run tests, verify PASS.
- [ ] Step 5: Commit using the message above.

---

## Task 22: Build orchestrator cron `/api/cron/refresh-reports`

**Files:**
- Create: `src/app/api/cron/refresh-reports/route.ts`
- Test: `src/app/api/cron/refresh-reports/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cron/refresh-reports/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/report-clients", () => ({
  getReportClients: () => [
    { name: "A", accountIds: ["1"] },
    { name: "B", accountIds: ["2"] },
  ],
}));

import { GET } from "../route";

function makeRequest(secret: string): Request {
  return new Request("http://localhost/api/cron/refresh-reports", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/refresh-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: 1, errors: 0 }) });
    // Freeze time to a known date so range computation is deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
  });

  it("rejects requests without the cron Bearer token", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("computes 4 ranges (mtd, this-week, prev-week, last-month)", async () => {
    await GET(makeRequest("test-secret"));
    const firstCall = fetchMock.mock.calls[0];
    const body = JSON.parse(firstCall[1].body as string);
    expect(body.ranges).toHaveLength(4);
    expect(body.ranges.map((r: { id: string }) => r.id).sort()).toEqual([
      "last-month", "mtd", "prev-week", "this-week",
    ]);
    // last-month for 2026-04-15 should be 2026-03-01 → 2026-03-31
    const lastMonth = body.ranges.find((r: { id: string }) => r.id === "last-month");
    expect(lastMonth.start).toBe("2026-03-01");
    expect(lastMonth.end).toBe("2026-03-31");
  });

  it("fans out to 7 worker endpoints in parallel", async () => {
    await GET(makeRequest("test-secret"));
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const workerNames = fetchMock.mock.calls.map((c) => {
      const url = c[0] as string;
      return url.split("/").pop();
    }).sort();
    expect(workerNames).toEqual([
      "advertising-audit",
      "inventory",
      "overview-cards",
      "overview-tables",
      "period-comparative",
      "share-of-voice",
      "subscribe-save",
    ]);
  });

  it("returns aggregate per-worker status", async () => {
    const res = await GET(makeRequest("test-secret"));
    const json = await res.json();
    expect(json.workers).toHaveLength(7);
    expect(json.timestamp).toBeDefined();
    expect(json.ranges).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- refresh-reports`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator**

Create `src/app/api/cron/refresh-reports/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getReportClients } from "@/lib/report-clients";

export const maxDuration = 60;

const WORKERS = [
  "overview-cards",
  "overview-tables",
  "period-comparative",
  "inventory",
  "share-of-voice",
  "subscribe-save",
  "advertising-audit",
];

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

function startOfWeekSunday(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - d.getDay()); // 0 = Sunday
  return out;
}

function computeRanges(now: Date) {
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentSunday = startOfWeekSunday(now);
  const currentSaturday = addDays(currentSunday, 6);
  const prevSunday = addDays(currentSunday, -7);
  const prevSaturday = addDays(prevSunday, 6);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return [
    { id: "mtd", start: fmt(mtdStart), end: fmt(now) },
    { id: "this-week", start: fmt(currentSunday), end: fmt(currentSaturday) },
    { id: "prev-week", start: fmt(prevSunday), end: fmt(prevSaturday) },
    { id: "last-month", start: fmt(lastMonthStart), end: fmt(lastMonthEnd) },
  ];
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const ranges = computeRanges(now);
  const clients = getReportClients();

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
  };

  const t0 = Date.now();
  const settled = await Promise.allSettled(
    WORKERS.map(async (name) => {
      const workerStart = Date.now();
      const res = await fetch(`${baseUrl}/api/internal/refresh/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ranges, clients }),
      });
      const data = res.ok ? await res.json() : { ok: 0, errors: 1 };
      return { name, status: res.ok ? "ok" : "error", durationMs: Date.now() - workerStart, ...data };
    }),
  );

  const workers = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return { name: WORKERS[i], status: "error", error: String(s.reason) };
  });

  return NextResponse.json({
    timestamp: now.toISOString(),
    durationMs: Date.now() - t0,
    ranges,
    workers,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- refresh-reports`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/refresh-reports/
git commit -m "feat(reports-cache): add refresh-reports cron orchestrator"
```

---

## Task 23: Add Vercel cron entry

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add cron entry**

Modify `vercel.json`. Add this entry to the `crons` array (alongside the existing 8):

```json
{
  "path": "/api/cron/refresh-reports",
  "schedule": "15 */6 * * *"
}
```

The `15` minute offset spreads Redshift load 15 min after the existing `refresh-sales` cron (which runs at `:00`).

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf-8'))"`
Expected: no output (silent success). If error, fix syntax.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(reports-cache): schedule refresh-reports cron at :15 every 6h"
```

---

## Task 24: Build `<RefreshButton>` component

**Files:**
- Create: `src/components/reports/refresh-button.tsx`

- [ ] **Step 1: Implement component**

Create `src/components/reports/refresh-button.tsx`:

```tsx
"use client";

import { useState } from "react";

const SECTION_ENDPOINTS: Record<string, string[]> = {
  "overview": ["overview", "keywords", "campaigns", "product-performance"],
  "period-comparative": ["period-comparative"],
  "inventory": ["inventory"],
  "share-of-voice": ["share-of-voice"],
  "subscribe-save": ["subscribe-save"],
  "advertising-audit": ["advertising-audit", "keywords-gaps"],
};

type Props = {
  section: string;
  accountId: string;
  start: string;
  end: string;
  onRefreshed: () => void;
};

export function RefreshButton({ section, accountId, start, end, onRefreshed }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const endpoints = SECTION_ENDPOINTS[section] ?? [];

  async function handleClick() {
    if (busy || endpoints.length === 0) return;
    setBusy(true);
    setMessage(null);
    const t0 = Date.now();
    try {
      const isInventory = section === "inventory";
      const params = isInventory
        ? `accountId=${encodeURIComponent(accountId)}&refresh=true`
        : `accountId=${encodeURIComponent(accountId)}&start=${start}&end=${end}&refresh=true`;
      const results = await Promise.all(
        endpoints.map((ep) => fetch(`/api/reports/${ep}?${params}`).then((r) => r.ok)),
      );
      const okCount = results.filter(Boolean).length;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setMessage(
        okCount === endpoints.length
          ? `Refreshed ${okCount} endpoint${okCount === 1 ? "" : "s"} in ${elapsed}s`
          : `${okCount}/${endpoints.length} endpoints refreshed in ${elapsed}s`,
      );
      onRefreshed();
    } catch (err) {
      setMessage(`Refresh failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="bg-background border border-brand/60 rounded-md px-2 py-0.5 text-xs font-bold text-brand hover:bg-brand/10 disabled:opacity-50 transition-colors"
        title="Re-query Redshift and update cache"
      >
        {busy ? "Refreshing…" : "Refresh ↻"}
      </button>
      {message && (
        <span className="text-[11px] text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors related to `refresh-button.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/refresh-button.tsx
git commit -m "feat(reports-cache): add manual refresh button component"
```

---

## Task 25: Wire `<RefreshButton>` into reports page

**Files:**
- Modify: `src/app/reports/page.tsx`

- [ ] **Step 1: Add `refreshKey` state**

Inside `ReportsPage()` component, after the existing `useState` declarations, add:

```ts
const [refreshKey, setRefreshKey] = useState(0);
```

- [ ] **Step 2: Add import**

At the top of the file:

```ts
import { RefreshButton } from "@/components/reports/refresh-button";
```

- [ ] **Step 3: Render button inside each section's PageMetaSlot**

Find the existing `<PageMetaSlot>` block (around lines 179–279). Inside the date-controls glass-card div (the one containing client/date selectors, but NOT the inventory variant since inventory has its own block), add at the end of the div:

```tsx
<div className="h-4 w-px bg-border/40" />
<RefreshButton
  section={activeSection!}
  accountId={accountId}
  start={activeStart}
  end={activeEnd}
  onRefreshed={() => setRefreshKey((k) => k + 1)}
/>
```

For the inventory branch (where `activeSection === "inventory"`), add a similar block in that branch's controls div:

```tsx
<RefreshButton
  section="inventory"
  accountId={accountId}
  start=""
  end=""
  onRefreshed={() => setRefreshKey((k) => k + 1)}
/>
```

- [ ] **Step 4: Pass `refreshKey` to all section renderers**

Add `refreshKey` as a prop to every section's top-level component invocation. For example:

```tsx
{activeSection === "overview" && (
  <div className="...">
    <TotalSalesCard accountId={accountId} start={activeStart} end={activeEnd} refreshKey={refreshKey} />
    {/* ...repeat refreshKey={refreshKey} on every card/chart/table inside the overview block ... */}
  </div>
)}
```

Apply the same `refreshKey={refreshKey}` prop addition to:
- All Overview cards/charts/tables
- All `PeriodComparative*` components
- `InventoryTable`, `InventoryCharts`, `InventoryDateBadge`
- `ShareOfVoice`
- `SubscribeSave`
- `AdvertisingAudit`

- [ ] **Step 5: Add `refreshKey` to fetch deps inside each component**

For each component that has a `useEffect` doing the API fetch, add `refreshKey` to its dependency array. Example for `src/components/reports/total-sales-card.tsx`:

Find:
```tsx
useEffect(() => {
  // fetch /api/reports/overview ...
}, [accountId, start, end]);
```

Change to:
```tsx
useEffect(() => {
  // fetch /api/reports/overview ...
}, [accountId, start, end, refreshKey]);
```

And add `refreshKey?: number` to the component's `Props` type.

Apply to every component that fetches:
- All `*-card.tsx` files in `src/components/reports/`
- All `*-chart.tsx` files
- All `*-table.tsx` files
- `share-of-voice.tsx`, `subscribe-save.tsx`, `advertising-audit.tsx`, `keywords-gaps.tsx`, `period-comparative-*.tsx`, `inventory-*.tsx`

(There are ~25 components. Use a search-and-replace pattern: `}, [accountId, start, end]);` → `}, [accountId, start, end, refreshKey]);` and similar.)

- [ ] **Step 6: TypeScript + dev test**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `PORT=3000 npm run dev`
Open: http://localhost:3000/reports → Overview → click Refresh button → verify all cards re-fetch and the toast shows "Refreshed 4 endpoints in N.Ns".

- [ ] **Step 7: Commit**

```bash
git add src/app/reports/page.tsx src/components/reports/
git commit -m "feat(reports-cache): wire refresh button + refreshKey into all report sections"
```

---

## Task 26: Manual integration smoke test (post-deploy)

**Files:** none — this is a runtime check, not a code change.

- [ ] **Step 1: Deploy preview**

Push branch and let Vercel build a preview deployment. Note the preview URL.

- [ ] **Step 2: Trigger cron manually**

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/refresh-reports
```

Expected: 200 response with JSON `{ workers: [7 entries], ranges: [4 entries], timestamp, durationMs }`. All 7 workers should report `status: "ok"`. Total `durationMs` should be < 5 minutes.

- [ ] **Step 3: Inspect cache table**

Query Supabase:

```sql
SELECT cache_type, COUNT(*) FROM reports_cache GROUP BY cache_type ORDER BY cache_type;
```

Expected counts (for default 17-client roster × 4 ranges):
- report-overview: 68
- report-keywords: 68
- report-campaigns: 68
- report-product-performance: 68
- report-period-comparative: 68
- report-share-of-voice: 68
- report-subscribe-save: 68
- report-advertising-audit: 68
- report-keywords-gaps: 68
- report-inventory: 17

Total: 629 rows.

- [ ] **Step 4: Open each section in browser, time the load**

For each of the 6 sections, open in the preview browser with a default date range and a client that exists in the cache. Open DevTools Network panel. Confirm:
- Initial response time < 500ms (cache hit).
- The response payload looks the same as before.

- [ ] **Step 5: Click Refresh button**

On any section, click the "Refresh ↻" button. Confirm:
- Spinner shows.
- Toast appears: "Refreshed N endpoints in M.Ms".
- All cards re-render with fresh data.

- [ ] **Step 6: Document results**

Append a short note to `docs/superpowers/specs/2026-04-28-reports-cache-design.md` under a new `## 13. Deployment Verification` section with the actual cache row counts, cron duration, and per-section response times. Commit:

```bash
git add docs/superpowers/specs/2026-04-28-reports-cache-design.md
git commit -m "docs(reports-cache): record deployment smoke test results"
```

---

## Done Criteria

- [ ] All 26 tasks committed
- [ ] All tests in `npm test` pass (existing + ~28 new test files)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Cron `/api/cron/refresh-reports` returns 200 with all 7 workers reporting `status: "ok"`
- [ ] `reports_cache` table has ~629 rows after first cron run
- [ ] All 6 report sections load in <500ms when viewing pre-warmed (default) date ranges
- [ ] Refresh button triggers re-fetch and re-warms cache for the active section

---

## Self-Review Checklist (already passed)

**Spec coverage:** every section of `2026-04-28-reports-cache-design.md` maps to at least one task:
- Spec §3 architecture → Tasks 1, 2, 22 (orchestrator)
- Spec §4 data model → Tasks 1, 2
- Spec §5 ranges → Task 22 (computeRanges + 4-range test)
- Spec §6 cron + workers → Tasks 15–22, 23
- Spec §7 wrappers → Tasks 4–14
- Spec §8 UI → Tasks 24, 25
- Spec §9 testing → tests in every code task + smoke test in Task 26

**Type consistency:** `Range`, `Client`/`ReportClient`, `cacheType` literal strings, `getCachedReport`/`setCachedReport`, `buildDatedKey`/`buildAccountKey`/`buildKeywordKey`/`buildAsinKey` — all consistent across tasks.

**No placeholders:** all code blocks complete; no "TODO" / "implement later" / "similar to Task N" without code.
