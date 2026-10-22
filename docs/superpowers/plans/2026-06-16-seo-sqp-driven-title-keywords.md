# SQP-Driven Title Keyword Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make S6.2 title generation rank keywords by actual purchases (Search Query Performance) instead of Helium 10 search volume, and surface a per-ASIN SQP ranking table in the SEO Manager UI.

**Architecture:** A pure ranking module (`src/lib/seo/sqp.ts`) resolves a SEO project → Intentwise `account_id` (existing `getIntentwiseAccountId`) → per-ASIN SQP rows (existing `fetchSqpData` against Redshift), ranks queries by `asin_purchase_count`, and picks the top-selling ASIN as the family title signal. A read endpoint serves this to the UI; the existing title-generation route imports the same module to build its keyword prompt. No MCP, no schema migration, no new env vars. SQP-unavailable cases fall back to today's Helium 10 path.

**Tech Stack:** Next.js 16 App Router (route handlers), Drizzle ORM, Redshift (`pg`), Vitest, React 19 + Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-16-seo-sqp-driven-title-keywords-design.md`

**Reused existing code (do NOT reimplement):**
- `src/lib/ppc-queries.ts:76-91` — `SqpRow` interface
- `src/lib/ppc-queries.ts:187-207` — `fetchSqpData(accountId, startDate, endDate): Promise<SqpRow[]>`
- `src/lib/forecast-redshift.ts:13-29` — `getIntentwiseAccountId(clientIdCode): Promise<number | null>`
- `src/lib/db/schema.ts` — `seoProjects` (has `clientIdCode`, `id`), `seoAsins` (has `projectId`, `asin`)
- `src/app/api/seo/projects/[id]/load/route.ts` — auth + route-handler pattern to copy

**Test command:** `npm run test -- <file>` (Vitest). Build: `npm run build`. Dev: `PORT=3000 npm run dev`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/seo/sqp.ts` (new) | Types + pure ranking/window/prompt helpers + `getProjectSqp` glue |
| `src/lib/seo/sqp.test.ts` (new) | Unit tests for all pure helpers |
| `src/app/api/seo/projects/[id]/sqp/route.ts` (new) | `GET` endpoint returning `getProjectSqp` output for the UI |
| `src/app/api/seo/projects/[id]/sqp/route.test.ts` (new) | Endpoint shape test (module mocked) |
| `src/app/api/seo/claude/seo/route.ts` (modify) | Inject SQP-ranked keywords into the `titles` prompt; H10 fallback |
| `src/app/seo/[id]/seo/page.tsx` (modify) | Fetch SQP + render collapsible per-ASIN table above "Keywords — Titles" |

---

## Task 1: Types + pure ranking & window helpers

**Files:**
- Create: `src/lib/seo/sqp.ts`
- Test: `src/lib/seo/sqp.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/seo/sqp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { SqpRow } from "@/lib/ppc-queries";
import { rankByPurchases, groupByAsin, pickLeadAsin, lastNFullWeeks } from "./sqp";

function row(p: Partial<SqpRow>): SqpRow {
  return {
    account_id: 1, asin: "A1", search_query: "q", search_query_volume: 0,
    asin_impression_count: 0, asin_impression_share: 0,
    asin_click_count: 0, asin_click_share: 0,
    asin_cart_add_count: 0, asin_cart_add_share: 0,
    asin_purchase_count: 0, asin_purchase_share: 0,
    start_date: "2026-04-19", end_date: "2026-06-13", ...p,
  };
}

describe("rankByPurchases", () => {
  it("sorts by purchases desc, tie-breaks on cart-adds then volume", () => {
    const out = rankByPurchases([
      row({ search_query: "low", asin_purchase_count: 1 }),
      row({ search_query: "high", asin_purchase_count: 9 }),
      row({ search_query: "tieA", asin_purchase_count: 5, asin_cart_add_count: 2, search_query_volume: 100 }),
      row({ search_query: "tieB", asin_purchase_count: 5, asin_cart_add_count: 2, search_query_volume: 500 }),
    ]);
    expect(out.map(r => r.search_query)).toEqual(["high", "tieB", "tieA", "low"]);
  });
});

describe("groupByAsin", () => {
  it("groups rows by asin", () => {
    const g = groupByAsin([row({ asin: "A1" }), row({ asin: "A2" }), row({ asin: "A1" })]);
    expect(Object.keys(g).sort()).toEqual(["A1", "A2"]);
    expect(g.A1).toHaveLength(2);
  });
});

describe("pickLeadAsin", () => {
  it("returns the asin with the highest total purchases", () => {
    const lead = pickLeadAsin({
      A1: [row({ asin: "A1", asin_purchase_count: 2 }), row({ asin: "A1", asin_purchase_count: 3 })],
      A2: [row({ asin: "A2", asin_purchase_count: 10 })],
    });
    expect(lead).toBe("A2");
  });
  it("returns null when every total is zero", () => {
    expect(pickLeadAsin({ A1: [row({ asin: "A1", asin_purchase_count: 0 })] })).toBeNull();
  });
});

describe("lastNFullWeeks", () => {
  it("returns the last n complete Sun-Sat weeks ending on the most recent completed Saturday", () => {
    // 2026-06-16 is a Tuesday; last completed week ends Sat 2026-06-13
    const w = lastNFullWeeks(8, new Date(Date.UTC(2026, 5, 16)));
    expect(w.endDate).toBe("2026-06-13");
    expect(w.startDate).toBe("2026-04-19"); // 8 weeks back, a Sunday
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/seo/sqp.test.ts`
Expected: FAIL — `Cannot find module './sqp'` / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/seo/sqp.ts`:

```ts
import type { SqpRow } from "@/lib/ppc-queries";

/** Sort SQP rows by purchases desc; tie-break cart-adds desc, then volume desc. */
export function rankByPurchases(rows: SqpRow[]): SqpRow[] {
  return [...rows].sort(
    (a, b) =>
      b.asin_purchase_count - a.asin_purchase_count ||
      b.asin_cart_add_count - a.asin_cart_add_count ||
      b.search_query_volume - a.search_query_volume
  );
}

/** Group SQP rows by their ASIN. */
export function groupByAsin(rows: SqpRow[]): Record<string, SqpRow[]> {
  const out: Record<string, SqpRow[]> = {};
  for (const r of rows) (out[r.asin] ??= []).push(r);
  return out;
}

/** The ASIN with the highest total purchases, or null if every total is 0. */
export function pickLeadAsin(perAsin: Record<string, SqpRow[]>): string | null {
  let best: string | null = null;
  let bestTotal = 0;
  for (const [asin, rows] of Object.entries(perAsin)) {
    const total = rows.reduce((s, r) => s + r.asin_purchase_count, 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = asin;
    }
  }
  return bestTotal > 0 ? best : null;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The last `n` complete Sun-Sat weeks, ending on the most recently COMPLETED
 * Saturday (the Saturday before the current week's Sunday). Pure: `today` is
 * injected so it is deterministic in tests.
 */
export function lastNFullWeeks(n: number, today: Date): { startDate: string; endDate: string } {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const endSat = new Date(d);
  endSat.setUTCDate(d.getUTCDate() - dow - 1); // Saturday before this week's Sunday
  const startSun = new Date(endSat);
  startSun.setUTCDate(endSat.getUTCDate() - (n * 7 - 1));
  return { startDate: fmt(startSun), endDate: fmt(endSat) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/seo/sqp.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/sqp.ts src/lib/seo/sqp.test.ts
git commit -m "feat(seo): pure SQP ranking + week-window helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ProjectSqp` type, `assembleProjectSqp`, and `buildTitleKeywordBlock`

**Files:**
- Modify: `src/lib/seo/sqp.ts`
- Test: `src/lib/seo/sqp.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/seo/sqp.test.ts`:

```ts
import { assembleProjectSqp, buildTitleKeywordBlock, type ProjectSqp } from "./sqp";

const WINDOW = { startDate: "2026-04-19", endDate: "2026-06-13", weeks: 8 };

describe("assembleProjectSqp", () => {
  it("filters to family ASINs, ranks per ASIN, and picks the lead ASIN", () => {
    const rows = [
      row({ asin: "A1", search_query: "charcoal for dogs", asin_purchase_count: 3 }),
      row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9 }),
      row({ asin: "OTHER", search_query: "noise", asin_purchase_count: 99 }), // not in family
    ];
    const out = assembleProjectSqp(["A1", "A2"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.leadAsin).toBe("A2");
    expect(out.titleQueries[0].search_query).toBe("dog poison kit");
    expect(Object.keys(out.perAsin).sort()).toEqual(["A1", "A2"]);
  });

  it("returns no-sqp-rows when the family has no purchases", () => {
    const out = assembleProjectSqp(["A1"], [row({ asin: "A1", asin_purchase_count: 0 })], WINDOW);
    expect(out).toEqual({ available: false, reason: "no-sqp-rows" });
  });
});

describe("buildTitleKeywordBlock", () => {
  it("uses SQP purchase-ranked queries when available", () => {
    const sqp: ProjectSqp = {
      available: true, window: WINDOW, leadAsin: "A2",
      perAsin: { A2: [row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9, search_query_volume: 660 })] },
      titleQueries: [row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9, search_query_volume: 660 })],
    };
    const block = buildTitleKeywordBlock(sqp, [{ KeywordText: "ignored", KeywordSearchVolume: 1 }]);
    expect(block).toContain("Search Query Performance");
    expect(block).toContain("dog poison kit");
    expect(block).toContain("purchases: 9");
    expect(block).not.toContain("ignored");
  });

  it("falls back to Helium 10 keywords when SQP unavailable", () => {
    const block = buildTitleKeywordBlock(
      { available: false, reason: "no-account-mapping" },
      [{ KeywordText: "dog first aid kit", KeywordSearchVolume: 8814 }]
    );
    expect(block).toContain("Helium 10");
    expect(block).toContain("dog first aid kit (SV: 8814)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/seo/sqp.test.ts`
Expected: FAIL — `assembleProjectSqp` / `buildTitleKeywordBlock` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/seo/sqp.ts`:

```ts
export interface SqpWindow {
  startDate: string;
  endDate: string;
  weeks: number;
}

export type ProjectSqp =
  | { available: false; reason: "no-account-mapping" | "redshift-error" | "no-sqp-rows" }
  | {
      available: true;
      window: SqpWindow;
      leadAsin: string;
      perAsin: Record<string, SqpRow[]>;
      titleQueries: SqpRow[];
    };

/** Pure assembly: filter to the family, rank per ASIN, choose the lead ASIN. */
export function assembleProjectSqp(
  familyAsins: string[],
  rows: SqpRow[],
  window: SqpWindow
): ProjectSqp {
  const family = new Set(familyAsins);
  const inFamily = rows.filter((r) => family.has(r.asin));
  const grouped = groupByAsin(inFamily);
  const perAsin: Record<string, SqpRow[]> = {};
  for (const [asin, rs] of Object.entries(grouped)) perAsin[asin] = rankByPurchases(rs);
  const leadAsin = pickLeadAsin(perAsin);
  if (!leadAsin) return { available: false, reason: "no-sqp-rows" };
  return { available: true, window, leadAsin, perAsin, titleQueries: perAsin[leadAsin] };
}

export interface TitleKw {
  KeywordText: string;
  KeywordSearchVolume: number;
}

/** Build the "Approved Title Keywords" prompt block from SQP (preferred) or Helium 10. */
export function buildTitleKeywordBlock(sqp: ProjectSqp, titleKws: TitleKw[]): string {
  if (sqp.available) {
    const lines = sqp.titleQueries
      .slice(0, 8)
      .map((r) => `- ${r.search_query} (purchases: ${r.asin_purchase_count}, volume: ${r.search_query_volume})`)
      .join("\n");
    return `Source: Search Query Performance (SQP) — ranked by actual purchases for the top-selling ASIN ${sqp.leadAsin}. Put the HIGHEST-converting query phrase right after the brand and keep it contiguous.\n${lines}`;
  }
  const lines = titleKws.map((k) => `- ${k.KeywordText} (SV: ${k.KeywordSearchVolume})`).join("\n");
  return `Source: Helium 10 search volume (no SQP data for this account). Put the HIGHEST-volume keyword first.\n${lines}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/seo/sqp.test.ts`
Expected: PASS (all tests, Task 1 + Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/sqp.ts src/lib/seo/sqp.test.ts
git commit -m "feat(seo): assembleProjectSqp + title keyword prompt block (SQP/H10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `getProjectSqp` glue (DB + Redshift)

**Files:**
- Modify: `src/lib/seo/sqp.ts`

This is thin glue over already-tested pure functions + already-tested external calls; verified by typecheck/build rather than a unit test (mocking `db` + Redshift here adds brittleness with no logic coverage gain — the logic lives in Task 2's pure functions).

- [ ] **Step 1: Add imports at the top of `src/lib/seo/sqp.ts`**

Add below the existing `import type { SqpRow }` line:

```ts
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchSqpData } from "@/lib/ppc-queries";
import { getIntentwiseAccountId } from "@/lib/forecast-redshift";
```

- [ ] **Step 2: Append `getProjectSqp` to `src/lib/seo/sqp.ts`**

```ts
/**
 * Resolve a SEO project to its per-ASIN SQP, ranked by purchases.
 * Returns `{ available: false, reason }` for any miss (no account mapping,
 * Redshift error, or zero purchases) so callers fall back to Helium 10.
 */
export async function getProjectSqp(
  projectId: string,
  opts: { weeks?: number } = {}
): Promise<ProjectSqp> {
  const weeks = opts.weeks ?? 8;

  const [project] = await db
    .select({ clientIdCode: seoProjects.clientIdCode })
    .from(seoProjects)
    .where(eq(seoProjects.id, projectId))
    .limit(1);
  if (!project?.clientIdCode) return { available: false, reason: "no-account-mapping" };

  const accountId = await getIntentwiseAccountId(project.clientIdCode);
  if (!accountId) return { available: false, reason: "no-account-mapping" };

  const asinRows = await db
    .select({ asin: seoAsins.asin })
    .from(seoAsins)
    .where(eq(seoAsins.projectId, projectId));
  const familyAsins = asinRows.map((a) => a.asin).filter(Boolean) as string[];
  if (familyAsins.length === 0) return { available: false, reason: "no-sqp-rows" };

  const window = { ...lastNFullWeeks(weeks, new Date()), weeks };

  let rows: SqpRow[];
  try {
    rows = await fetchSqpData(accountId, window.startDate, window.endDate);
  } catch {
    return { available: false, reason: "redshift-error" };
  }

  return assembleProjectSqp(familyAsins, rows, window);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `src/lib/seo/sqp.ts`.
(If the project has no `tsc` script and this is slow, defer to the `npm run build` in Task 5 — but prefer running it here.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/seo/sqp.ts
git commit -m "feat(seo): getProjectSqp — resolve project to ranked SQP via Redshift

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Read endpoint `GET /api/seo/projects/[id]/sqp`

**Files:**
- Create: `src/app/api/seo/projects/[id]/sqp/route.ts`
- Test: `src/app/api/seo/projects/[id]/sqp/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/seo/projects/[id]/sqp/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/seo/sqp", () => ({ getProjectSqp: vi.fn() }));

import { GET } from "./route";
import { getProjectSqp } from "@/lib/seo/sqp";
import { getAuthSession } from "@/lib/auth-db";

function makeReq() {
  return new Request("http://localhost/api/seo/projects/p1/sqp") as any;
}
const ctx = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/seo/projects/[id]/sqp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    (getAuthSession as any).mockResolvedValueOnce(null);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns the getProjectSqp payload", async () => {
    (getProjectSqp as any).mockResolvedValueOnce({ available: false, reason: "no-account-mapping" });
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "no-account-mapping" });
    expect(getProjectSqp).toHaveBeenCalledWith("p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/api/seo/projects/\[id\]/sqp/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/seo/projects/[id]/sqp/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getProjectSqp } from "@/lib/seo/sqp";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const sqp = await getProjectSqp(id);
    return NextResponse.json(sqp);
  } catch {
    return NextResponse.json({ available: false, reason: "redshift-error" }, { status: 200 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/api/seo/projects/\[id\]/sqp/route.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/seo/projects/[id]/sqp/route.ts" "src/app/api/seo/projects/[id]/sqp/route.test.ts"
git commit -m "feat(seo): GET /api/seo/projects/[id]/sqp read endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Inject SQP keywords into the title-generation prompt

**Files:**
- Modify: `src/app/api/seo/claude/seo/route.ts`

The prompt-block logic is already unit-tested via `buildTitleKeywordBlock` (Task 2). This task wires it in. Verify with `npm run build`.

- [ ] **Step 1: Add the import**

At the top of `src/app/api/seo/claude/seo/route.ts`, with the other `@/lib` imports, add:

```ts
import { getProjectSqp, buildTitleKeywordBlock, type ProjectSqp } from "@/lib/seo/sqp";
```

- [ ] **Step 2: Fetch SQP once, before the `switch (batch)` block**

`src/app/api/seo/claude/seo/route.ts:574` defines `const titleKws = distributed.title.slice(0, 8);`. Immediately AFTER that line, add:

```ts
  // SQP-driven title keywords (falls back to Helium 10 when unavailable)
  let projectSqp: ProjectSqp = { available: false, reason: "no-account-mapping" };
  if (projectId && batch === "titles") {
    try {
      projectSqp = await getProjectSqp(projectId);
    } catch {
      projectSqp = { available: false, reason: "redshift-error" };
    }
  }
  const titleKeywordBlock = buildTitleKeywordBlock(projectSqp, titleKws);
```

- [ ] **Step 3: Use the block in the titles user prompt**

In the `case "titles":` user prompt (`src/app/api/seo/claude/seo/route.ts:762-764`), replace these three lines:

```ts
Approved Title Keywords (RESERVED — split across Title + Item Highlight, do NOT use in bullets/description/backend):
Put the HIGHEST-priority keywords in the 75-char Title; flow the remainder into the 125-char Item Highlight. Cover ALL of them across the two fields.
${titleKws.map((k: any) => `- ${k.KeywordText} (SV: ${k.KeywordSearchVolume})`).join("\n")}
```

with:

```ts
Approved Title Keywords (RESERVED — split across Title + Item Highlight, do NOT use in bullets/description/backend):
Put the HIGHEST-priority keywords in the 75-char Title; flow the remainder into the 125-char Item Highlight. Cover ALL of them across the two fields.
${titleKeywordBlock}
```

- [ ] **Step 4: Build to verify the wiring typechecks**

Run: `npm run build`
Expected: build succeeds; no type errors in `src/app/api/seo/claude/seo/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seo/claude/seo/route.ts
git commit -m "feat(seo): rank title keywords by SQP purchases in titles prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Per-ASIN SQP ranking table in the S6.2 UI

**Files:**
- Modify: `src/app/seo/[id]/seo/page.tsx`

No unit test (large client component); verified by `npm run build` + manual render in dev.

- [ ] **Step 1: Add SQP state**

After `src/app/seo/[id]/seo/page.tsx:223` (`const [keywords, setKeywords] = useState<any[]>([]);`), add:

```tsx
  const [sqp, setSqp] = useState<any>(null);
```

- [ ] **Step 2: Fetch SQP in the load effect**

In the load `useEffect` that calls the `/load?phase=...` endpoints (around `src/app/seo/[id]/seo/page.tsx:323`), add a non-blocking fetch. Place it just after the `Promise.all([...])` of load calls resolves (do not block the main load on it):

```tsx
        // Per-ASIN SQP ranking (non-blocking; falls back silently if unavailable)
        fetch(`/api/seo/projects/${projectId}/sqp`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setSqp(d))
          .catch(() => setSqp({ available: false, reason: "redshift-error" }));
```

- [ ] **Step 3: Add the render helper**

Immediately ABOVE `function renderKeywordUsage(bk: BatchKey) {` (`src/app/seo/[id]/seo/page.tsx:1173`), add:

```tsx
  function queryInContent(phrase: string): boolean {
    const p = phrase.toLowerCase();
    return rows.some((r) =>
      String((r as any).Title || "").toLowerCase().includes(p) ||
      String((r as any).ItemHighlight || "").toLowerCase().includes(p)
    );
  }

  function renderSqpTables() {
    if (!sqp) return null;
    if (!sqp.available) {
      return (
        <div className="mb-3 text-[10px] text-muted-foreground">
          No SQP for this account — titles use Helium 10 volume{sqp.reason ? ` (${sqp.reason})` : ""}.
        </div>
      );
    }
    const asins: string[] = Object.keys(sqp.perAsin);
    return (
      <details className="mb-4" open>
        <summary className="text-xs font-bold text-foreground/80 cursor-pointer">
          SQP — Purchases (last {sqp.window?.weeks ?? 8} wks)
        </summary>
        <div className="mt-2 space-y-3">
          {asins.map((asin) => (
            <div key={asin}>
              <div className="text-[10px] font-bold text-foreground/70 mb-1">
                {asin}
                {asin === sqp.leadAsin && (
                  <span className="ml-2 rounded bg-[#E8A700]/20 px-1.5 py-0.5 text-[9px] text-[#E8A700]">
                    drives title
                  </span>
                )}
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-0.5 pr-2">Query</th>
                    <th className="py-0.5 pr-2 text-right">Volume</th>
                    <th className="py-0.5 pr-2 text-right">Purchases</th>
                    <th className="py-0.5 pr-2 text-right">Purch%</th>
                    <th className="py-0.5 pr-2 text-right">Cart%</th>
                    <th className="py-0.5 pr-2 text-right">Click%</th>
                    <th className="py-0.5 pr-2 text-right">Impr%</th>
                    <th className="py-0.5 pr-2">In title</th>
                  </tr>
                </thead>
                <tbody>
                  {sqp.perAsin[asin].slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="py-0.5 pr-2">{r.search_query}</td>
                      <td className="py-0.5 pr-2 text-right">{Number(r.search_query_volume).toLocaleString()}</td>
                      <td className="py-0.5 pr-2 text-right font-semibold">{r.asin_purchase_count}</td>
                      <td className="py-0.5 pr-2 text-right">{(Number(r.asin_purchase_share) * 100).toFixed(1)}</td>
                      <td className="py-0.5 pr-2 text-right">{(Number(r.asin_cart_add_share) * 100).toFixed(1)}</td>
                      <td className="py-0.5 pr-2 text-right">{(Number(r.asin_click_share) * 100).toFixed(1)}</td>
                      <td className="py-0.5 pr-2 text-right">{(Number(r.asin_impression_share) * 100).toFixed(1)}</td>
                      <td className="py-0.5 pr-2">{queryInContent(r.search_query) ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </details>
    );
  }
```

- [ ] **Step 4: Render the tables for the titles batch only**

Inside `renderKeywordUsage` (`src/app/seo/[id]/seo/page.tsx:1173`), as the FIRST thing returned in the JSX wrapper (just before the existing `<h3>...Keywords — {label}</h3>` at line ~1231), add the SQP tables for the titles batch. Find the outer returned container element and insert at its top:

```tsx
        {bk === "titles" && renderSqpTables()}
```

(If `renderKeywordUsage` returns a fragment/`<div>`, this line goes immediately inside it, before the `Keywords — {label}` heading block.)

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: build succeeds; no type/JSX errors in `page.tsx`.

- [ ] **Step 6: Manual render verification (REQUIRED — proof, not just build)**

```bash
PORT=3000 npm run dev
```

Open a SEO project whose client has Intentwise data (e.g. the ReadyRESCUE / Dr Cuddles account) at `/seo/<projectId>/seo`, go to S6 → S6.2 Titles, and confirm:
- A collapsible "SQP — Purchases (last 8 wks)" section renders above "Keywords — Titles".
- One table per ASIN, rows sorted by Purchases desc, the top-selling ASIN badged "drives title".
- For a client with NO Intentwise mapping, the one-line "No SQP for this account…" notice shows instead.
- Generating titles for the SQP-available project produces a title whose lead phrase matches the top converting query.

Capture the result (screenshot or note) before marking done.

- [ ] **Step 7: Commit**

```bash
git add "src/app/seo/[id]/seo/page.tsx"
git commit -m "feat(seo): per-ASIN SQP ranking table in S6.2 Titles view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run test -- src/lib/seo/sqp.test.ts "src/app/api/seo/projects/[id]/sqp/route.test.ts"` — all green
- [ ] `npm run build` — clean
- [ ] Manual S6.2 render confirmed for both SQP-available and SQP-unavailable clients (Task 6 Step 6)
- [ ] Do NOT push/merge — hand back for the user's explicit push decision
```
