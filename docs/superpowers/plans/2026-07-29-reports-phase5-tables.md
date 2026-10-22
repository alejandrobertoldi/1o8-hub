# Reports Phase 5 — Data Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the v2 shell's `keywords` and `campaigns` sections with two data tables (Sponsored Products keywords + campaign performance) built on one shared `MetricTable` primitive.

**Architecture:** A new lifted `useKeywords` hook (mirroring `useOverview`/`useCampaigns`) feeds a keyword section; the campaign section reuses the already-lifted `useCampaigns().data.rowsByName`. Both raw shapes normalize to a single `MetricRow`; all filter/sort/totals/CSV logic is pure and TDD'd in `table-derivations.ts`; a presentational `MetricTable` renders both, differing only by column config + first column + filters.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5.9, Tailwind v4, Vitest 4. Existing primitives: `Surface`, `TableToolbar`, `HeatCell`, `ProgressBar`, `status-bands` (`classifyRoas`/`classifyAcos`), `kpi-derivations` formatters.

## Global Constraints

- Typecheck with `npx tsc --noEmit`. **NEVER** `next build` (PORT 3000 is the user's dev server).
- Tests: `npx vitest run <path>`. Green vitest can hide TS errors — always run `tsc` before claiming compile.
- No new endpoints; no per-component fetch. All data enters via shell-lifted hooks. Sections degrade independently across the 3 states (skeleton / populated / explicit "data unavailable").
- Emphasis color = `palette.accent` (`var(--mf-orange)` hub / `var(--portal-accent)` portal). NEVER orange on portal. Data/heat colors are shared and unchanged.
- One task per commit; commit only on the user's explicit per-action OK. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `git add` with explicit pathspecs on BOTH add and commit — never `git add .`.
- TDD only on pure logic. Table/hook DOM verified by `tsc` + visual dogfood — NEVER fake DOM/SVG assertions.

---

### Task 1: Keyword types + `useKeywords` hook

**Files:**
- Create: `src/components/reports/v2/primitives/keywords.ts`
- Create: `src/components/reports/v2/use-keywords.ts`

**Interfaces:**
- Consumes: the existing `GET /api/reports/keywords` response (`{ keywords: [...] }`).
- Produces: `KeywordRow`, `KeywordsResponse`, and `useKeywords(accountId?, start?, end?, refreshKey?) → { data: KeywordsResponse | null; loading: boolean; requestKey: string }`.

- [ ] **Step 1: Write `primitives/keywords.ts`**

```ts
/** One aggregated keyword row from GET /api/reports/keywords.
 *  Field names + units verified against src/app/api/reports/keywords/route.ts. */
export interface KeywordRow {
  keyword: string;
  campaignType: string;
  matchType: string;      // raw from Redshift (e.g. "BROAD" | "PHRASE" | "EXACT")
  isBrand: boolean;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adConversions: number;
  adImpressions: number;
  acos: number;           // PERCENT POINTS (spend/rev*100); 0 when ad revenue is 0
  roas: number;           // ratio; 0 when ad spend is 0
  cpc: number;
  ctr: number;            // percent points (not rendered by the table)
  cvr: number;            // percent points
}

export interface KeywordsResponse {
  keywords: KeywordRow[];
}
```

- [ ] **Step 2: Write `use-keywords.ts`** (structural mirror of `use-campaigns.ts`)

```ts
"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { useEffect, useState } from "react";
import type { KeywordsResponse } from "./primitives/keywords";

export interface KeywordsState {
  data: KeywordsResponse | null;
  loading: boolean;
  requestKey: string;
}

/** Single source of the keywords fetch for a surface. Called ONCE by the shell;
 *  its result feeds the Keyword analysis table (and, later, decision support).
 *  Mirrors useOverview/useCampaigns so a surface issues exactly one fetch per endpoint. */
export function useKeywords(accountId?: string, start?: string, end?: string, refreshKey = 0): KeywordsState {
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: KeywordsResponse | null } | null>(null);

  useEffect(() => {
    if (!accountId || !start || !end) return;
    let ignore = false;
    fetch(`/api/reports/keywords?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => { if (!ignore) setResult({ key: requestKey, data: d }); })
      .catch(() => { if (!ignore) setResult({ key: requestKey, data: null }); });
    return () => { ignore = true; };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;
  return { data, loading, requestKey };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "not-connected-card"`
Expected: no NEW errors referencing `keywords.ts` / `use-keywords.ts` (pre-existing sales-summary test error is ignored).

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/v2/primitives/keywords.ts src/components/reports/v2/use-keywords.ts
git commit -m "feat(reports-v2): useKeywords lifted fetch + KeywordRow types (phase 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure table derivations (TDD core)

**Files:**
- Create: `src/components/reports/v2/primitives/table-derivations.ts`
- Test: `src/components/reports/v2/primitives/table-derivations.test.ts`

**Interfaces:**
- Consumes: `KeywordRow` (Task 1), `CampaignRow` (`primitives/campaigns.ts`), `classifyRoas`/`classifyAcos`/`Band` (`primitives/status-bands.ts`).
- Produces: `MetricRow`; `keywordToMetricRow`, `campaignToMetricRow`; `roasBandOf`, `acosBandOf`; `BandFilter`, `FilterOpts`, `filterRows`; `sortRows`; `computeTotals`; `CsvColumn`, `toCsv`.

- [ ] **Step 1: Write the failing tests** (`table-derivations.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import type { KeywordRow } from "./keywords";
import type { CampaignRow } from "./campaigns";
import {
  keywordToMetricRow, campaignToMetricRow, roasBandOf, acosBandOf,
  filterRows, sortRows, computeTotals, toCsv, type MetricRow, type CsvColumn,
} from "./table-derivations";

const kw = (o: Partial<KeywordRow>): KeywordRow => ({
  keyword: "k", campaignType: "SP", matchType: "BROAD", isBrand: false,
  adSpend: 0, adRevenue: 0, adClicks: 0, adConversions: 0, adImpressions: 0,
  acos: 0, roas: 0, cpc: 0, ctr: 0, cvr: 0, ...o,
});
const mr = (o: Partial<MetricRow>): MetricRow => ({
  name: "r", adSpend: 0, adRevenue: 0, acos: 0, roas: 0, avgCpc: 0,
  impressions: 0, clicks: 0, conversions: 0, cvr: 0, ...o,
});

describe("row mappers", () => {
  it("keywordToMetricRow remaps field names", () => {
    const r = keywordToMetricRow(kw({ keyword: "shoes", cpc: 1.5, adImpressions: 100, adClicks: 20, adConversions: 4, matchType: "EXACT" }));
    expect(r.name).toBe("shoes");
    expect(r.avgCpc).toBe(1.5);
    expect(r.impressions).toBe(100);
    expect(r.clicks).toBe(20);
    expect(r.conversions).toBe(4);
    expect(r.matchType).toBe("EXACT");
  });
  it("campaignToMetricRow uses campaignName, falling back to em-dash", () => {
    const base: CampaignRow = { campaignName: "Brand", adSpend: 5, adRevenue: 20, acos: 25, roas: 4, avgCpc: 0.5, impressions: 9, clicks: 3, conversions: 1, cvr: 33 };
    expect(campaignToMetricRow(base).name).toBe("Brand");
    expect(campaignToMetricRow({ ...base, campaignName: undefined }).name).toBe("—");
  });
});

describe("band helpers (zero-revenue ACoS → none)", () => {
  it("roasBandOf mirrors classifyRoas", () => {
    expect(roasBandOf(5)).toBe("good");
    expect(roasBandOf(3)).toBe("warn");
    expect(roasBandOf(1)).toBe("bad");
    expect(roasBandOf(0)).toBe("none");
  });
  it("acosBandOf treats 0 (zero-revenue) as none, not good", () => {
    expect(acosBandOf(0)).toBe("none");
    expect(acosBandOf(20)).toBe("good");
    expect(acosBandOf(40)).toBe("warn");
    expect(acosBandOf(80)).toBe("bad");
  });
});

describe("filterRows", () => {
  const rows = [
    mr({ name: "Alpha", matchType: "BROAD", roas: 5, acos: 20 }),
    mr({ name: "beta", matchType: "EXACT", roas: 1, acos: 80 }),
    mr({ name: "Gamma", matchType: "BROAD", roas: 3, acos: 40 }),
  ];
  it("search is case-insensitive on name", () => {
    expect(filterRows(rows, { search: "ALPHA" }).map((r) => r.name)).toEqual(["Alpha"]);
  });
  it("matchType filter (all = passthrough)", () => {
    expect(filterRows(rows, { matchType: "BROAD" }).map((r) => r.name)).toEqual(["Alpha", "Gamma"]);
    expect(filterRows(rows, { matchType: "all" })).toHaveLength(3);
  });
  it("roasBand + acosBand predicates compose (AND)", () => {
    expect(filterRows(rows, { roasBand: "good" }).map((r) => r.name)).toEqual(["Alpha"]);
    expect(filterRows(rows, { acosBand: "bad" }).map((r) => r.name)).toEqual(["beta"]);
    expect(filterRows(rows, { matchType: "BROAD", roasBand: "warn" }).map((r) => r.name)).toEqual(["Gamma"]);
  });
});

describe("sortRows", () => {
  const rows = [mr({ name: "a", adSpend: 10 }), mr({ name: "b", adSpend: 30 }), mr({ name: "c", adSpend: 20 })];
  it("desc + asc by numeric key", () => {
    expect(sortRows(rows, "adSpend", "desc").map((r) => r.name)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "adSpend", "asc").map((r) => r.name)).toEqual(["a", "c", "b"]);
  });
  it("is stable for equal values (preserves input order)", () => {
    const eq = [mr({ name: "x", roas: 4 }), mr({ name: "y", roas: 4 }), mr({ name: "z", roas: 4 })];
    expect(sortRows(eq, "roas", "desc").map((r) => r.name)).toEqual(["x", "y", "z"]);
  });
});

describe("computeTotals", () => {
  it("sums additives and recomputes ratios from the sums", () => {
    const rows = [
      mr({ adSpend: 10, adRevenue: 40, clicks: 20, conversions: 4, impressions: 100 }),
      mr({ adSpend: 30, adRevenue: 30, clicks: 30, conversions: 3, impressions: 200 }),
    ];
    const t = computeTotals(rows);
    expect(t.name).toBe("Total");
    expect(t.adSpend).toBe(40);
    expect(t.adRevenue).toBe(70);
    expect(t.impressions).toBe(300);
    expect(t.roas).toBeCloseTo(70 / 40, 6);
    expect(t.acos).toBeCloseTo((40 / 70) * 100, 6);
    expect(t.avgCpc).toBeCloseTo(40 / 50, 6);
    expect(t.cvr).toBeCloseTo((7 / 50) * 100, 6);
  });
  it("guards divide-by-zero and empty input", () => {
    const t = computeTotals([]);
    expect(t.adSpend).toBe(0);
    expect(t.roas).toBe(0);
    expect(t.acos).toBe(0);
    expect(t.avgCpc).toBe(0);
    expect(t.cvr).toBe(0);
  });
});

describe("toCsv", () => {
  const cols: CsvColumn[] = [
    { header: "Keyword", value: (r) => r.name },
    { header: "Ad Spend", value: (r) => r.adSpend },
  ];
  it("emits a header row then one line per row, CRLF-joined", () => {
    const csv = toCsv(cols, [mr({ name: "shoes", adSpend: 12.5 })]);
    expect(csv).toBe("Keyword,Ad Spend\r\nshoes,12.5");
  });
  it("RFC-4180 quotes fields containing comma, quote, or newline", () => {
    const csv = toCsv(cols, [mr({ name: 'a,"b"\nc', adSpend: 1 })]);
    expect(csv).toBe('Keyword,Ad Spend\r\n"a,""b""\nc",1');
  });
  it("header-only when no rows", () => {
    expect(toCsv(cols, [])).toBe("Keyword,Ad Spend");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/reports/v2/primitives/table-derivations.test.ts`
Expected: FAIL — module `./table-derivations` not found / exports undefined.

- [ ] **Step 3: Write `table-derivations.ts`**

```ts
import { classifyRoas, classifyAcos, type Band } from "./status-bands";
import type { KeywordRow } from "./keywords";
import type { CampaignRow } from "./campaigns";

/** Normalized table row — both keyword and campaign shapes map to this so the
 *  MetricTable primitive and all pure logic stay generic over one type. */
export interface MetricRow {
  name: string;
  matchType?: string;   // keyword tables only
  adSpend: number;
  adRevenue: number;
  acos: number;         // percent points
  roas: number;         // ratio
  avgCpc: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;          // percent points
}

export function keywordToMetricRow(k: KeywordRow): MetricRow {
  return {
    name: k.keyword,
    matchType: k.matchType,
    adSpend: k.adSpend,
    adRevenue: k.adRevenue,
    acos: k.acos,
    roas: k.roas,
    avgCpc: k.cpc,
    impressions: k.adImpressions,
    clicks: k.adClicks,
    conversions: k.adConversions,
    cvr: k.cvr,
  };
}

export function campaignToMetricRow(c: CampaignRow): MetricRow {
  return {
    name: c.campaignName ?? "—",
    adSpend: c.adSpend,
    adRevenue: c.adRevenue,
    acos: c.acos,
    roas: c.roas,
    avgCpc: c.avgCpc,
    impressions: c.impressions,
    clicks: c.clicks,
    conversions: c.conversions,
    cvr: c.cvr,
  };
}

/** ROAS band. classifyRoas already maps 0/null → none. */
export function roasBandOf(roas: number): Band {
  return classifyRoas(roas);
}
/** ACoS band. The route collapses zero-ad-revenue to acos=0, which must read as
 *  "—"/none rather than a green "good ≤25%" (spec §9). Mirror kpi-derivations. */
export function acosBandOf(acos: number): Band {
  return classifyAcos(acos === 0 ? null : acos);
}

export type BandFilter = Band | "all";

export interface FilterOpts {
  search?: string;
  matchType?: string;      // "all" or a specific match type
  roasBand?: BandFilter;
  acosBand?: BandFilter;
}

export function filterRows(rows: MetricRow[], opts: FilterOpts): MetricRow[] {
  const q = (opts.search ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (opts.matchType && opts.matchType !== "all" && r.matchType !== opts.matchType) return false;
    if (opts.roasBand && opts.roasBand !== "all" && roasBandOf(r.roas) !== opts.roasBand) return false;
    if (opts.acosBand && opts.acosBand !== "all" && acosBandOf(r.acos) !== opts.acosBand) return false;
    return true;
  });
}

/** Plain stable numeric sort (matches the current dashboards). */
export function sortRows(rows: MetricRow[], key: keyof MetricRow, dir: "asc" | "desc"): MetricRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = a.r[key];
      const bv = b.r[key];
      const an = typeof av === "number" ? av : 0;
      const bn = typeof bv === "number" ? bv : 0;
      if (an !== bn) return (an - bn) * sign;
      return a.i - b.i; // stable
    })
    .map((x) => x.r);
}

export function computeTotals(rows: MetricRow[]): MetricRow {
  const sum = (sel: (r: MetricRow) => number) => rows.reduce((acc, r) => acc + sel(r), 0);
  const adSpend = sum((r) => r.adSpend);
  const adRevenue = sum((r) => r.adRevenue);
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.clicks);
  const conversions = sum((r) => r.conversions);
  return {
    name: "Total",
    adSpend,
    adRevenue,
    acos: adRevenue !== 0 ? (adSpend / adRevenue) * 100 : 0,
    roas: adSpend !== 0 ? adRevenue / adSpend : 0,
    avgCpc: clicks !== 0 ? adSpend / clicks : 0,
    impressions,
    clicks,
    conversions,
    cvr: clicks !== 0 ? (conversions / clicks) * 100 : 0,
  };
}

export interface CsvColumn {
  header: string;
  value: (r: MetricRow) => string | number;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: CsvColumn[], rows: MetricRow[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/reports/v2/primitives/table-derivations.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "not-connected-card"`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/v2/primitives/table-derivations.ts src/components/reports/v2/primitives/table-derivations.test.ts
git commit -m "feat(reports-v2): table derivations — MetricRow map/filter/sort/totals/CSV, TDD (phase 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `MetricTable` shared primitive

**Files:**
- Create: `src/components/reports/v2/primitives/metric-table.tsx`
- Create: `src/components/reports/v2/primitives/download-csv.ts`

**Interfaces:**
- Consumes: `MetricRow`, `roasBandOf`, `acosBandOf` (Task 2); `SurfacePalette` (`palette.ts`); `Surface`, `TableToolbar`, `HeatCell`, `ProgressBar` (existing primitives).
- Produces: `MetricColumn`, `MetricTable` (component); `downloadCsv(filename, csv)`.

- [ ] **Step 1: Write `download-csv.ts`** (DOM glue — verified by dogfood, not unit tests)

```ts
/** Trigger a client-side CSV download from an already-built CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Write `metric-table.tsx`**

```tsx
"use client";
import type { ReactNode } from "react";
import type { SurfacePalette } from "./palette";
import { type MetricRow, roasBandOf, acosBandOf } from "./table-derivations";
import { Surface } from "./surface";
import { TableToolbar } from "./table-toolbar";
import { HeatCell } from "./heat-cell";
import { ProgressBar } from "./progress-bar";

export interface MetricColumn {
  key: keyof MetricRow;
  label: string;
  fmt: (n: number) => string;
  heat?: "roas" | "acos";   // render body cell via HeatCell
  bar?: boolean;            // render body cell as ProgressBar + value (CVR)
  tooltip?: string;         // metric definition → title= on the <th>
}

const CHARCOAL_900 = "var(--mf-charcoal-900)";

function SortIcon({ active, dir, accent }: { active: boolean; dir: "asc" | "desc"; accent: string }) {
  if (!active) return <span className="ml-1 opacity-40">↕</span>;
  return <span className="ml-1" style={{ color: accent }}>{dir === "desc" ? "↓" : "↑"}</span>;
}

function BodyCell({ row, col, palette }: { row: MetricRow; col: MetricColumn; palette: SurfacePalette }) {
  const raw = row[col.key] as number;
  if (col.heat === "roas") return <HeatCell band={roasBandOf(raw)}>{col.fmt(raw)}</HeatCell>;
  if (col.heat === "acos") return <HeatCell band={acosBandOf(raw)}>{col.fmt(raw)}</HeatCell>;
  if (col.bar) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <ProgressBar pct={raw} palette={palette} />
        <span className="tabular-nums">{col.fmt(raw)}</span>
      </span>
    );
  }
  return <>{col.fmt(raw)}</>;
}

export function MetricTable({
  rows, columns, firstColumnLabel, totalsRow,
  sortKey, sortDir, onSort, palette,
  search, onSearch, searchPlaceholder, filters, count, onExportCsv, emptyLabel,
}: {
  rows: MetricRow[];
  columns: MetricColumn[];
  firstColumnLabel: string;
  totalsRow: MetricRow | null;
  sortKey: keyof MetricRow;
  sortDir: "asc" | "desc";
  onSort: (key: keyof MetricRow) => void;
  palette: SurfacePalette;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  count: string;
  onExportCsv: () => void;
  emptyLabel: string;
}) {
  const exportBtn = (
    <button
      type="button"
      onClick={onExportCsv}
      className="h-9 rounded-[9px] border border-mf-line bg-white px-3 text-xs font-semibold text-mf-ink hover:bg-mf-ghost"
    >
      Export CSV
    </button>
  );
  return (
    <Surface>
      <TableToolbar
        search={search}
        onSearch={onSearch}
        searchPlaceholder={searchPlaceholder}
        filters={<>{filters}{exportBtn}</>}
        count={count}
      />
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1160px] border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: CHARCOAL_900 }}>
              <th
                className="sticky left-0 z-20 px-4 py-2.5 text-left font-bold uppercase tracking-wide text-white"
                style={{ background: CHARCOAL_900 }}
              >
                {firstColumnLabel}
              </th>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  onClick={() => onSort(col.key)}
                  title={col.tooltip}
                  aria-sort={col.key === sortKey ? (sortDir === "desc" ? "descending" : "ascending") : undefined}
                  className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-right font-bold uppercase tracking-wide text-white"
                >
                  {col.label}
                  <SortIcon active={col.key === sortKey} dir={sortDir} accent={palette.accent} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="border-b border-mf-line odd:bg-white even:bg-mf-ghost hover:bg-mf-line/40">
                <td
                  className="sticky left-0 z-10 max-w-[240px] truncate bg-inherit px-4 py-2.5 font-semibold text-mf-ink"
                  title={row.name}
                >
                  {row.name}
                </td>
                {columns.map((col) => (
                  <td key={String(col.key)} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-mf-ink">
                    <BodyCell row={row} col={col} palette={palette} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-mf-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
          {totalsRow && rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10">
              <tr
                className="font-bold text-white"
                style={{ background: CHARCOAL_900, borderTop: `2px solid ${palette.accent}` }}
              >
                <td className="sticky left-0 z-20 px-4 py-2.5 text-left" style={{ background: CHARCOAL_900 }}>Total</td>
                {columns.map((col) => (
                  <td key={String(col.key)} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {col.fmt(totalsRow[col.key] as number)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Surface>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "not-connected-card"`
Expected: no new errors. (If `bg-mf-charcoal-900` / `bg-mf-ghost` were referenced as Tailwind utilities and one is unwired, tsc won't catch it — this task uses inline `style` for charcoal-900 precisely to avoid that; `mf-ghost`/`mf-line` are already used by `HeatCell`/`chip`, so they are wired.)

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/v2/primitives/metric-table.tsx src/components/reports/v2/primitives/download-csv.ts
git commit -m "feat(reports-v2): MetricTable primitive (sticky header/first-col, heat/bar cells, total row, CSV) (phase 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Keyword analysis section + shell wiring

**Files:**
- Create: `src/components/reports/v2/keyword-analysis-section.tsx`
- Modify: `src/components/reports/v2/performance-overview-v2.tsx`

**Interfaces:**
- Consumes: `useKeywords` (Task 1), `MetricTable`/`MetricColumn` (Task 3), all `table-derivations` exports (Task 2), `downloadCsv` (Task 3), `kpi-derivations` formatters, `getSurfacePalette`.
- Produces: `KeywordAnalysisSection({ surface, keywords, loading, requestKey })`.

- [ ] **Step 1: Write `keyword-analysis-section.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { KeywordsResponse } from "./primitives/keywords";
import { Surface } from "./primitives/surface";
import { MetricTable, type MetricColumn } from "./primitives/metric-table";
import { downloadCsv } from "./primitives/download-csv";
import {
  keywordToMetricRow, filterRows, sortRows, computeTotals, toCsv,
  type MetricRow, type BandFilter, type CsvColumn,
} from "./primitives/table-derivations";
import { fmtCurrencyCompact, fmtPct, fmtRoas, fmtInt } from "./primitives/kpi-derivations";

const COLUMNS: MetricColumn[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrencyCompact, tooltip: "Total advertising spend." },
  { key: "adRevenue", label: "Ad Revenue", fmt: fmtCurrencyCompact, tooltip: "Sales attributed to advertising." },
  { key: "acos", label: "ACoS", fmt: (n) => fmtPct(n), heat: "acos", tooltip: "Advertising Cost of Sales = ad spend ÷ ad revenue." },
  { key: "roas", label: "ROAS", fmt: fmtRoas, heat: "roas", tooltip: "Return on Ad Spend = ad revenue ÷ ad spend." },
  { key: "avgCpc", label: "Avg. CPC", fmt: fmtCurrencyCompact, tooltip: "Average cost per click." },
  { key: "impressions", label: "Impressions", fmt: fmtInt },
  { key: "clicks", label: "Clicks", fmt: fmtInt },
  { key: "conversions", label: "Conversions", fmt: fmtInt },
  { key: "cvr", label: "CVR", fmt: (n) => fmtPct(n), bar: true, tooltip: "Conversion rate = conversions ÷ clicks." },
];

const CSV_COLUMNS: CsvColumn[] = [
  { header: "Keyword", value: (r) => r.name },
  { header: "Match type", value: (r) => r.matchType ?? "" },
  ...COLUMNS.map((c) => ({ header: c.label, value: (r: MetricRow) => r[c.key] as number })),
];

const BAND_OPTIONS: { value: BandFilter; label: string }[] = [
  { value: "all", label: "All ROAS" },
  { value: "good", label: "Healthy" },
  { value: "warn", label: "Watch" },
  { value: "bad", label: "At risk" },
];

function Select({ value, onChange, options, aria }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; aria: string;
}) {
  return (
    <select
      aria-label={aria}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-[9px] border border-mf-line bg-white px-2 text-xs text-mf-ink"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function KeywordAnalysisSection({ surface, keywords, loading, requestKey }: {
  surface: SurfaceKind;
  keywords: KeywordsResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  const palette = getSurfacePalette(surface);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof MetricRow>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [matchType, setMatchType] = useState("all");
  const [roasBand, setRoasBand] = useState<BandFilter>("all");
  const [acosBand, setAcosBand] = useState<BandFilter>("all");

  const allRows = useMemo(() => (keywords?.keywords ?? []).map(keywordToMetricRow), [keywords]);
  const matchTypes = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.matchType).filter((m): m is string => Boolean(m)))),
    [allRows],
  );
  const visible = useMemo(
    () => sortRows(filterRows(allRows, { search, matchType, roasBand, acosBand }), sortKey, sortDir),
    [allRows, search, matchType, roasBand, acosBand, sortKey, sortDir],
  );
  const totals = useMemo(() => (visible.length ? computeTotals(visible) : null), [visible]);

  const onSort = (key: keyof MetricRow) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const onExportCsv = () => downloadCsv(`keywords-${requestKey || "export"}.csv`, toCsv(CSV_COLUMNS, visible));

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load the keyword table.</div></Surface>;
  }
  if (loading) {
    return <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />;
  }
  if (!keywords || !Array.isArray(keywords.keywords)) {
    return <Surface title="Keyword analysis"><div className="p-[18px] text-mf-muted">Data unavailable for this period.</div></Surface>;
  }

  const filters = (
    <>
      <Select aria="Filter by match type" value={matchType} onChange={setMatchType}
        options={[{ value: "all", label: "All match types" }, ...matchTypes.map((m) => ({ value: m, label: m }))]} />
      <Select aria="Filter by ROAS band" value={roasBand} onChange={(v) => setRoasBand(v as BandFilter)} options={BAND_OPTIONS} />
      <Select aria="Filter by ACoS band" value={acosBand} onChange={(v) => setAcosBand(v as BandFilter)}
        options={[{ value: "all", label: "All ACoS" }, { value: "good", label: "Healthy" }, { value: "warn", label: "Watch" }, { value: "bad", label: "At risk" }]} />
    </>
  );

  return (
    <MetricTable
      rows={visible}
      columns={COLUMNS}
      firstColumnLabel="Keyword"
      totalsRow={totals}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      palette={palette}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search keyword…"
      filters={filters}
      count={`${visible.length} keyword${visible.length === 1 ? "" : "s"}`}
      onExportCsv={onExportCsv}
      emptyLabel={allRows.length === 0 ? "No keywords for this period." : "No keywords match your filters."}
    />
  );
}
```

- [ ] **Step 2: Wire into the shell** — `performance-overview-v2.tsx`

Add imports near the other section imports:
```tsx
import { KeywordAnalysisSection } from "./keyword-analysis-section";
import { useKeywords } from "./use-keywords";
```
Add the lifted fetch after the `useCampaigns` line (~line 37):
```tsx
  // Third fetch per surface: keywords (Keyword analysis table + later decision support).
  const { data: keywords, loading: keywordsLoading } = useKeywords(accountId, start, end, refreshKey);
```
Add to the `sectionContent` map:
```tsx
    keywords: <KeywordAnalysisSection surface={surface} keywords={keywords} loading={keywordsLoading} requestKey={requestKey} />,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "not-connected-card"`
Expected: no new errors.

- [ ] **Step 4: Visual dogfood** (auth-flaky — ASK USER to eyeball)

Ask the user to open the preview (`/reports/v2-preview`, account 1707700) in their real browser and confirm the Keyword analysis section: sticky header + first column on horizontal scroll, ACoS/ROAS heat colors, CVR progress bars, working search + 3 filters + sort + Export CSV + total row, and the skeleton/"data unavailable"/empty states. Wait for the endpoints (~20s Redshift-slow) before judging.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/v2/keyword-analysis-section.tsx src/components/reports/v2/performance-overview-v2.tsx
git commit -m "feat(reports-v2): Keyword analysis table mounted into shell (useKeywords lifted) (phase 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Campaign detail section + shell wiring

**Files:**
- Create: `src/components/reports/v2/campaign-detail-section.tsx`
- Modify: `src/components/reports/v2/performance-overview-v2.tsx`

**Interfaces:**
- Consumes: `CampaignsResponse` (`primitives/campaigns.ts`, already lifted via `useCampaigns` in the shell), `MetricTable` (Task 3), `table-derivations` (Task 2), `downloadCsv`, formatters.
- Produces: `CampaignDetailSection({ surface, campaigns, loading, requestKey })`.

- [ ] **Step 1: Write `campaign-detail-section.tsx`** (same shape as Task 4, minus the match-type filter; maps `rowsByName`)

```tsx
"use client";
import { useMemo, useState } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { CampaignsResponse } from "./primitives/campaigns";
import { Surface } from "./primitives/surface";
import { MetricTable, type MetricColumn } from "./primitives/metric-table";
import { downloadCsv } from "./primitives/download-csv";
import {
  campaignToMetricRow, filterRows, sortRows, computeTotals, toCsv,
  type MetricRow, type BandFilter, type CsvColumn,
} from "./primitives/table-derivations";
import { fmtCurrencyCompact, fmtPct, fmtRoas, fmtInt } from "./primitives/kpi-derivations";

const COLUMNS: MetricColumn[] = [
  { key: "adSpend", label: "Ad Spend", fmt: fmtCurrencyCompact, tooltip: "Total advertising spend." },
  { key: "adRevenue", label: "Ad Revenue", fmt: fmtCurrencyCompact, tooltip: "Sales attributed to advertising." },
  { key: "acos", label: "ACoS", fmt: (n) => fmtPct(n), heat: "acos", tooltip: "Advertising Cost of Sales = ad spend ÷ ad revenue." },
  { key: "roas", label: "ROAS", fmt: fmtRoas, heat: "roas", tooltip: "Return on Ad Spend = ad revenue ÷ ad spend." },
  { key: "avgCpc", label: "Avg. CPC", fmt: fmtCurrencyCompact, tooltip: "Average cost per click." },
  { key: "impressions", label: "Impressions", fmt: fmtInt },
  { key: "clicks", label: "Clicks", fmt: fmtInt },
  { key: "conversions", label: "Conversions", fmt: fmtInt },
  { key: "cvr", label: "CVR", fmt: (n) => fmtPct(n), bar: true, tooltip: "Conversion rate = conversions ÷ clicks." },
];

const CSV_COLUMNS: CsvColumn[] = [
  { header: "Campaign", value: (r) => r.name },
  ...COLUMNS.map((c) => ({ header: c.label, value: (r: MetricRow) => r[c.key] as number })),
];

function Select({ value, onChange, options, aria }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; aria: string;
}) {
  return (
    <select
      aria-label={aria}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-[9px] border border-mf-line bg-white px-2 text-xs text-mf-ink"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function CampaignDetailSection({ surface, campaigns, loading, requestKey }: {
  surface: SurfaceKind;
  campaigns: CampaignsResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  const palette = getSurfacePalette(surface);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof MetricRow>("adSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [roasBand, setRoasBand] = useState<BandFilter>("all");
  const [acosBand, setAcosBand] = useState<BandFilter>("all");

  const allRows = useMemo(() => (campaigns?.rowsByName ?? []).map(campaignToMetricRow), [campaigns]);
  const visible = useMemo(
    () => sortRows(filterRows(allRows, { search, roasBand, acosBand }), sortKey, sortDir),
    [allRows, search, roasBand, acosBand, sortKey, sortDir],
  );
  const totals = useMemo(() => (visible.length ? computeTotals(visible) : null), [visible]);

  const onSort = (key: keyof MetricRow) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const onExportCsv = () => downloadCsv(`campaigns-${requestKey || "export"}.csv`, toCsv(CSV_COLUMNS, visible));

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load the campaign table.</div></Surface>;
  }
  if (loading) {
    return <div className="h-64 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />;
  }
  if (!campaigns || !Array.isArray(campaigns.rowsByName)) {
    return <Surface title="Campaign & product detail"><div className="p-[18px] text-mf-muted">Data unavailable for this period.</div></Surface>;
  }

  const filters = (
    <>
      <Select aria="Filter by ROAS band" value={roasBand} onChange={(v) => setRoasBand(v as BandFilter)}
        options={[{ value: "all", label: "All ROAS" }, { value: "good", label: "Healthy" }, { value: "warn", label: "Watch" }, { value: "bad", label: "At risk" }]} />
      <Select aria="Filter by ACoS band" value={acosBand} onChange={(v) => setAcosBand(v as BandFilter)}
        options={[{ value: "all", label: "All ACoS" }, { value: "good", label: "Healthy" }, { value: "warn", label: "Watch" }, { value: "bad", label: "At risk" }]} />
    </>
  );

  return (
    <MetricTable
      rows={visible}
      columns={COLUMNS}
      firstColumnLabel="Campaign"
      totalsRow={totals}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      palette={palette}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search campaign…"
      filters={filters}
      count={`${visible.length} campaign${visible.length === 1 ? "" : "s"}`}
      onExportCsv={onExportCsv}
      emptyLabel={allRows.length === 0 ? "No campaigns for this period." : "No campaigns match your filters."}
    />
  );
}
```

- [ ] **Step 2: Wire into the shell** — `performance-overview-v2.tsx`

Add import:
```tsx
import { CampaignDetailSection } from "./campaign-detail-section";
```
Add to the `sectionContent` map (reuses the already-lifted `campaigns`/`campaignsLoading`):
```tsx
    campaigns: <CampaignDetailSection surface={surface} campaigns={campaigns} loading={campaignsLoading} requestKey={requestKey} />,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "not-connected-card"`
Expected: no new errors.

- [ ] **Step 4: Visual dogfood** (ASK USER to eyeball)

Ask the user to confirm the Campaign & product detail table renders with the same behaviors (sticky header/first-col, heat cells, CVR bars, ROAS/ACoS filters, sort, search, CSV, total row) and the 3 states, on both hub + portal stacks in the preview.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/v2/campaign-detail-section.tsx src/components/reports/v2/performance-overview-v2.tsx
git commit -m "feat(reports-v2): Campaign detail table mounted into shell (reuses useCampaigns) (phase 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `2026-07-29-reports-phase5-tables-design.md` + parent §9/§12/§16):
- Two tables (keyword + campaign) → Tasks 4, 5. ✓
- Shared `MetricTable` primitive → Task 3. ✓
- `useKeywords` lifted fetch; campaign table reuses `useCampaigns` → Tasks 1, 4, 5. ✓
- Sticky header + sticky first column; zebra; hover; total row (`--mf-charcoal-900` + accent border) → Task 3. ✓
- Toolbar inside table: search + filters + count + CSV → Tasks 3, 4, 5. ✓
- Heat cells ACoS/ROAS with zero-revenue → none; CVR progress bar + value → Tasks 2, 3. ✓
- Filters: keyword match type + ROAS band + ACoS band; campaign ROAS + ACoS → Tasks 4, 5. ✓
- Sort (all numeric columns) + CSV export from filtered rows → Tasks 2, 3, 4, 5. ✓
- Metric tooltips (ACoS/ROAS/CPC/CVR via `title=`) → Task 3 (`col.tooltip`), 4, 5. ✓
- 3 states (skeleton / populated / data-unavailable) + in-table empty → Tasks 4, 5. ✓
- Accessibility: numeric value visible in every heat cell (non-color signal); `aria-sort`; `aria-label` on filters; semantic `<table>/<thead>/<tfoot>` → Task 3. ✓
- Product table deferred (locked) — intentionally not covered. ✓
- Column chooser / saved views / pagination / expandable rows / XLSX — intentionally deferred (not dead-scaffolded), config-driven `MetricColumn[]` is the seam. ✓

**Placeholder scan:** No TBD/TODO; every step has real code. ✓

**Type consistency:** `MetricRow`, `MetricColumn`, `BandFilter`, `CsvColumn`, `keywordToMetricRow`/`campaignToMetricRow`, `filterRows`/`sortRows`/`computeTotals`/`toCsv`, `roasBandOf`/`acosBandOf`, `downloadCsv`, `useKeywords` — names and signatures identical across Tasks 1–5. `MetricTable` prop names match the call sites in Tasks 4/5. `col.fmt: (n:number)=>string` accepts the `number|null`-tolerant formatters (contravariant-safe). ✓

**Deviation from design doc:** `sortRows` is a plain stable numeric sort (matches the current dashboards). The design doc's earlier "none/zero pushed to bottom regardless of dir" clause was dropped as over-engineering not present in the existing tables — noted in the design doc §5.
