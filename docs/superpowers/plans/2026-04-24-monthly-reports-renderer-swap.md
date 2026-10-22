# Monthly Reports Renderer Swap (V1.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Monthly Reports renderer with the A4 print-ready React template at `/Users/manu/1o8Hub/1o8hub-report/` and ship a server-side PDF endpoint so reviewers can download a branded PDF to attach to the client email.

**Architecture:** Copy the template into `src/components/monthly-report/`, scope its CSS to `/reports/monthly/**`, add a thin adapter (`build-report-data.ts`) that maps orchestrator output to the template's `Report` contract, delete the old `render-html/` and `render-react/` layers, and add a `POST /api/reports/monthly/pdf` endpoint that renders the template via `puppeteer-core` + `@sparticuz/chromium`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Drizzle + postgres (Supabase), `@google-cloud/bigquery`, Redshift via Intentwise Spectrum externals, `puppeteer-core` + `@sparticuz/chromium`, Vitest, `jsonwebtoken`.

**Spec:** `docs/superpowers/specs/2026-04-24-monthly-reports-renderer-swap-design.md`.

**Worktree:** `/Users/manu/1o8Hub/.worktrees/monthly-reports/` — all paths below are relative to this directory unless noted otherwise.

---

## Prerequisites

Before starting, verify:

- [ ] `git status` shows clean working tree on `feat/monthly-reports`.
- [ ] `npm run test` — 73/73 tests currently pass.
- [ ] `npm run build` — typechecks clean.
- [ ] Template directory exists at `/Users/manu/1o8Hub/1o8hub-report/` (outside the worktree, at repo root).

---

## Task 1: Scaffold template into `src/components/monthly-report/`

Copy the subset of the template we need for V1 (cover, toc, kpis, mom, appendix + shell + charts + styles + defaults + types). Skip the sections we're deferring (ExecSummary, Highlights, Risks, Channels, Financials, Team, Goals) and the old Supabase `loader.ts` which doesn't fit our data path.

**Files:**
- Copy from: `/Users/manu/1o8Hub/1o8hub-report/`
- To: `src/components/monthly-report/`

- [ ] **Step 1: Create the target directory structure**

```bash
mkdir -p src/components/monthly-report/shell
mkdir -p src/components/monthly-report/charts
mkdir -p src/components/monthly-report/sections
mkdir -p src/components/monthly-report/styles
```

- [ ] **Step 2: Copy files we keep**

```bash
cp /Users/manu/1o8Hub/1o8hub-report/components/Report.tsx              src/components/monthly-report/Report.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/shell/PageShell.tsx     src/components/monthly-report/shell/PageShell.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/shell/SectionHead.tsx   src/components/monthly-report/shell/SectionHead.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/charts/LineChart.tsx    src/components/monthly-report/charts/LineChart.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/charts/BarChart.tsx     src/components/monthly-report/charts/BarChart.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/charts/ComparisonChart.tsx src/components/monthly-report/charts/ComparisonChart.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/charts/Donut.tsx        src/components/monthly-report/charts/Donut.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/charts/Spark.tsx        src/components/monthly-report/charts/Spark.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/sections/CoverPage.tsx  src/components/monthly-report/sections/CoverPage.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/sections/TOCPage.tsx    src/components/monthly-report/sections/TOCPage.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/sections/KPIPage.tsx    src/components/monthly-report/sections/KPIPage.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/sections/MoMPage.tsx    src/components/monthly-report/sections/MoMPage.tsx
cp /Users/manu/1o8Hub/1o8hub-report/components/sections/AppendixPage.tsx src/components/monthly-report/sections/AppendixPage.tsx
cp /Users/manu/1o8Hub/1o8hub-report/lib/types.ts                       src/components/monthly-report/types.ts
cp /Users/manu/1o8Hub/1o8hub-report/lib/defaults.ts                    src/components/monthly-report/defaults.ts
cp /Users/manu/1o8Hub/1o8hub-report/styles/report.css                  src/components/monthly-report/styles/report.css
```

- [ ] **Step 3: Update import paths in copied files**

The copied files import from `'../../lib/types'` and `'../../lib/defaults'`. Our new layout has types/defaults at `src/components/monthly-report/types.ts` — one level up from `sections/`, same level as `shell/`.

For each file in `src/components/monthly-report/sections/*.tsx`:

```bash
# Replace ../../lib/types → ../types
# Replace ../../lib/defaults → ../defaults
sed -i '' 's|../../lib/types|../types|g' src/components/monthly-report/sections/*.tsx
sed -i '' 's|../../lib/defaults|../defaults|g' src/components/monthly-report/sections/*.tsx
```

For `Report.tsx` (which imports from `./sections/…` and `../lib/…`):
```bash
sed -i '' 's|../lib/types|./types|g' src/components/monthly-report/Report.tsx
sed -i '' 's|../lib/defaults|./defaults|g' src/components/monthly-report/Report.tsx
```

- [ ] **Step 4: Remove the section imports we're not using**

In `src/components/monthly-report/Report.tsx`, delete these imports (sections we're deferring):
```tsx
// DELETE:
import { ExecSummaryPage } from './sections/ExecSummaryPage';
import { HighlightsPage } from './sections/HighlightsPage';
import { RisksPage } from './sections/RisksPage';
import { ChannelPage } from './sections/ChannelPage';
import { FinancialsPage } from './sections/FinancialsPage';
import { TeamPage } from './sections/TeamPage';
import { GoalsPage } from './sections/GoalsPage';
```

And delete the matching entries from the `SECTIONS` record. Keep only: `cover`, `toc`, `kpis`, `mom`, `appendix`. (We'll add `products` in Task 4.)

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: PASS (Report.tsx compiles with only the 5 sections we kept).

- [ ] **Step 6: Commit**

```bash
git add src/components/monthly-report/
git commit -m "feat(monthly-reports): scaffold A4 template into src/components/monthly-report"
```

---

## Task 2: Extend template types for `products` section

Add a new `SectionId` and a `products` data slot to the template's type surface.

**Files:**
- Modify: `src/components/monthly-report/types.ts`

- [ ] **Step 1: Edit `types.ts` — add `'products'` to the section union**

```ts
export type SectionId =
  | 'cover'
  | 'toc'
  | 'execSummary'
  | 'kpis'
  | 'mom'
  | 'highlights'
  | 'risks'
  | 'channels'
  | 'products'         // NEW
  | 'financials'
  | 'team'
  | 'goals'
  | 'appendix';

export const ALL_SECTIONS: SectionId[] = [
  'cover', 'toc', 'execSummary', 'kpis', 'mom',
  'highlights', 'risks', 'channels', 'products',   // NEW
  'financials', 'team', 'goals', 'appendix',
];
```

- [ ] **Step 2: Edit `types.ts` — add `products` field + `ProductRow` interface**

Append after the `Channel` interface:

```ts
// ---------- Products ---------------------------------------------------------

export interface ProductRow {
  asin: string;
  title: string;
  sku: string;
  sessions: number;
  units: number;
  sales: number;
  cvr: number | null;
  buyBox: number | null;
}
```

And extend `Report`:

```ts
export interface Report {
  meta: ReportMeta;
  sections: SectionId[];

  execSummary?: ExecSummaryData;
  kpis?: KPI[];
  mom?: MoMData;
  highlights?: Highlight[];
  risks?: Risk[];
  channels?: Channel[];
  products?: ProductRow[];   // NEW
  financials?: FinancialsData;
  team?: TeamMember[];
  goals?: Goal[];
  appendix?: AppendixData;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/monthly-report/types.ts
git commit -m "feat(monthly-reports): add 'products' section to template types"
```

---

## Task 3: Write `ProductsPage.tsx`

Single A4 page. Template-styled pivot table. Reuses `classifyMetric` from `src/lib/monthly-report/thresholds.ts` for CVR / buy-box color bands.

**Files:**
- Create: `src/components/monthly-report/sections/ProductsPage.tsx`
- Test: `src/components/monthly-report/sections/ProductsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/monthly-report/sections/ProductsPage.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductsPage } from "./ProductsPage";
import type { Report } from "../types";

function makeReport(rows: Report["products"]): Report {
  return {
    meta: {
      client: "Dr. Cuddles",
      month: "March 2026",
      period: "01 Mar – 31 Mar",
      lead: "Manu Lancharro",
      issued: "Apr 24, 2026",
      reportId: "2026-03-dr-cuddles",
    },
    sections: ["products"],
    products: rows,
  };
}

describe("ProductsPage", () => {
  it("renders rows sorted by sales desc with grand total", () => {
    const data = makeReport([
      { asin: "A1", title: "Small widget", sku: "SKU-A", sessions: 100, units: 5,  sales: 50,  cvr: 5,  buyBox: 90 },
      { asin: "B2", title: "Big widget",   sku: "SKU-B", sessions: 200, units: 40, sales: 400, cvr: 20, buyBox: 98 },
    ]);
    render(<ProductsPage data={data} num={5} total={6} />);
    const rowOrder = screen.getAllByRole("row").map(r => r.textContent ?? "");
    // header + B2 (higher sales) + A1 + grand total
    expect(rowOrder[1]).toContain("Big widget");
    expect(rowOrder[2]).toContain("Small widget");
    expect(rowOrder[3]).toMatch(/TOTAL/);
  });

  it("caps at top 20 and shows overflow note", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      asin: `A${i}`, title: `P${i}`, sku: `S${i}`,
      sessions: 1, units: 1, sales: 1000 - i, cvr: 5, buyBox: 90,
    }));
    render(<ProductsPage data={makeReport(many)} num={5} total={6} />);
    expect(screen.getByText(/Showing top 20 of 25 ASINs/i)).toBeInTheDocument();
  });

  it("applies good/warn/bad bands to CVR and buy-box cells", () => {
    const data = makeReport([
      { asin: "A1", title: "X", sku: "S", sessions: 100, units: 5, sales: 50, cvr: 15, buyBox: 98 }, // good/good
      { asin: "B2", title: "Y", sku: "S", sessions: 100, units: 5, sales: 40, cvr: 3,  buyBox: 70 }, // bad/bad
    ]);
    const { container } = render(<ProductsPage data={data} num={5} total={6} />);
    expect(container.querySelectorAll("td.good").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("td.bad").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/monthly-report/sections/ProductsPage.test.tsx`
Expected: FAIL — `Cannot find module './ProductsPage'`.

- [ ] **Step 3: Implement `ProductsPage.tsx`**

```tsx
// src/components/monthly-report/sections/ProductsPage.tsx
import React from "react";
import type { Report, ProductRow } from "../types";
import { classifyMetric, THRESHOLDS } from "@/lib/monthly-report/thresholds";

const DOLLAR = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const INT = new Intl.NumberFormat("en-US");
const PCT = (v: number | null) => v === null ? "—" : `${v.toFixed(1)}%`;

function sum<T>(xs: T[], pick: (t: T) => number): number {
  return xs.reduce((a, t) => a + pick(t), 0);
}

export function ProductsPage({ data, num, total }: { data: Report; num: number; total: number }) {
  const allRows = data.products ?? [];
  if (allRows.length === 0) return null;

  const sorted = [...allRows].sort((a, b) => b.sales - a.sales);
  const top = THRESHOLDS.report.topProducts;
  const rows = sorted.slice(0, top);
  const overflow = sorted.length > top ? sorted.length : 0;

  const grand = {
    sessions: sum(sorted, r => r.sessions),
    units: sum(sorted, r => r.units),
    sales: sum(sorted, r => r.sales),
  };

  return (
    <div className="page">
      <div className="page-body">
        <span className="section-num">{String(num).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        <h2 className="section-title">Product performance</h2>
        <p className="section-deck">
          Per-ASIN breakdown sorted by sales. CVR and buy-box cells use thresholds from the monthly-report config.
        </p>

        <div className="pivot-wrap">
          <table className="pivot">
            <thead>
              <tr>
                <th>Product</th>
                <th>Sessions</th>
                <th>Units</th>
                <th>Sales</th>
                <th>CVR</th>
                <th>Buy-box</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: ProductRow) => (
                <tr key={r.asin}>
                  <td title={r.title}>{r.title}</td>
                  <td>{INT.format(r.sessions)}</td>
                  <td>{INT.format(r.units)}</td>
                  <td>{DOLLAR.format(r.sales)}</td>
                  <td className={classifyMetric(r.cvr, "cvr")}>{PCT(r.cvr)}</td>
                  <td className={classifyMetric(r.buyBox, "buyBox")}>{PCT(r.buyBox)}</td>
                </tr>
              ))}
              <tr className="grand">
                <td>TOTAL</td>
                <td>{INT.format(grand.sessions)}</td>
                <td>{INT.format(grand.units)}</td>
                <td>{DOLLAR.format(grand.sales)}</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {overflow > 0 && (
          <p className="section-foot">Showing top {top} of {overflow} ASINs.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into Report.tsx**

```tsx
// src/components/monthly-report/Report.tsx — add import + entry
import { ProductsPage } from './sections/ProductsPage';

// In the SECTIONS record, add:
products:    ({ data, num, total }) => data.products && <ProductsPage data={data} num={num} total={total} />,
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/components/monthly-report/sections/ProductsPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/monthly-report/sections/ProductsPage.tsx \
        src/components/monthly-report/sections/ProductsPage.test.tsx \
        src/components/monthly-report/Report.tsx
git commit -m "feat(monthly-reports): add ProductsPage section to template"
```

---

## Task 4: Add scoped CSS layout

Import `report.css` only in `/reports/monthly/**` so template styles can't leak.

**Files:**
- Create: `src/app/reports/monthly/layout.tsx`

- [ ] **Step 1: Create the layout file**

```tsx
// src/app/reports/monthly/layout.tsx
import "@/components/monthly-report/styles/report.css";

export default function MonthlyReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Add print-hiding rule for chrome**

Edit `src/components/monthly-report/styles/report.css`. At the bottom, inside or adjacent to the existing `@media print { … }` block, add:

```css
@media print {
  .report-chrome { display: none !important; }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/reports/monthly/layout.tsx src/components/monthly-report/styles/report.css
git commit -m "feat(monthly-reports): scope template CSS to /reports/monthly route tree"
```

---

## Task 5: Add `fetchRevenueSeries` query

Six-month revenue rollup from the same `account_summary` table the headline KPIs use.

**Files:**
- Modify: `src/lib/monthly-report/queries/account.ts`
- Test: `src/lib/monthly-report/queries/account.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/monthly-report/queries/account.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));

import { queryRedshift } from "@/lib/redshift";
import { fetchRevenueSeries } from "./account";

describe("fetchRevenueSeries", () => {
  beforeEach(() => { vi.mocked(queryRedshift).mockReset(); });

  it("returns 6 months ending at periodStart, oldest→newest, gap-filled", async () => {
    // Redshift returns only 3 months; the other 3 must be zero-filled.
    vi.mocked(queryRedshift).mockResolvedValueOnce([
      { month_start: "2026-01-01", revenue: "1000" },
      { month_start: "2026-02-01", revenue: "2000" },
      { month_start: "2026-03-01", revenue: "3000" },
    ] as any);

    const out = await fetchRevenueSeries("1899670", "2026-03-01");

    expect(out.length).toBe(6);
    expect(out.map(r => r.month)).toEqual(["OCT", "NOV", "DEC", "JAN", "FEB", "MAR"]);
    expect(out.map(r => r.revenue)).toEqual([0, 0, 0, 1000, 2000, 3000]);
  });

  it("coerces string revenue values to numbers", async () => {
    vi.mocked(queryRedshift).mockResolvedValueOnce([
      { month_start: "2026-03-01", revenue: "4200" },
    ] as any);
    const out = await fetchRevenueSeries("1899670", "2026-03-01");
    expect(typeof out.find(r => r.month === "MAR")!.revenue).toBe("number");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/monthly-report/queries/account.test.ts`
Expected: FAIL — `fetchRevenueSeries is not a function`.

- [ ] **Step 3: Implement `fetchRevenueSeries`**

Append to `src/lib/monthly-report/queries/account.ts`:

```ts
const MONTH_LABELS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/**
 * Six months of monthly revenue ending at `periodStart`, oldest→newest.
 * Missing months are gap-filled with zero so the caller gets a dense series.
 */
export async function fetchRevenueSeries(
  accountId: string,
  periodStart: string,   // YYYY-MM-01
): Promise<Array<{ month: string; revenue: number }>> {
  const [y, m] = periodStart.split("-").map(Number);
  // Inclusive range: (periodStart - 5 months) … periodStart
  const startDate = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of periodStart month

  const rows = await queryRedshift<{ month_start: string; revenue: number | string }>(
    `
    SELECT
      date_trunc('month', report_date)::date AS month_start,
      COALESCE(SUM(product_sales), 0) AS revenue
    FROM intentwise_ecommerce_graph.account_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY 1
    ORDER BY 1 ASC
  `,
    [accountId, startDate, endDate],
  );

  const byKey = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.month_start).slice(0, 7);   // YYYY-MM
    byKey.set(key, Number(r.revenue));
  }

  const out: Array<{ month: string; revenue: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({
      month: MONTH_LABELS[d.getUTCMonth()],
      revenue: byKey.get(key) ?? 0,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/monthly-report/queries/account.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/queries/account.ts src/lib/monthly-report/queries/account.test.ts
git commit -m "feat(monthly-reports): add fetchRevenueSeries for MoM line chart"
```

---

## Task 6: Write `build-report-data.ts` adapter

Pure function. Orchestrator output → template's `Report` object.

**Files:**
- Create: `src/lib/monthly-report/build-report-data.ts`
- Test: `src/lib/monthly-report/build-report-data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/monthly-report/build-report-data.test.ts
import { describe, it, expect } from "vitest";
import { buildReportData } from "./build-report-data";
import type { HeadlineResult, ProductsResult, MonthlyPeriod, ClientContext } from "./types";

const client: ClientContext = { name: "Dr. Cuddles", accountId: "1899670", slug: "dr-cuddles" };
const period: MonthlyPeriod = {
  period: "2026-03",
  start: "2026-03-01",
  end: "2026-03-31",
  prevStart: "2026-02-01",
  prevEnd: "2026-02-28",
  label: "March 2026",
};
const headline: HeadlineResult = {
  current: { sales: 124000, units: 2800, sessions: 0, pageviews: 0, orderItems: 3000, cvr: 8.1, buyBox: 94, aov: 44 },
  previous: { sales: 100000, units: 2400, sessions: 0, pageviews: 0, orderItems: 2600, cvr: 7.2, buyBox: 92, aov: 42 },
  deltas: { sales: 0.24, units: 0.166, sessions: null, cvr: 0.125, buyBox: 0.021, aov: 0.047 },
};
const products: ProductsResult = {
  rows: [
    { asin: "A1", parent: "P1", title: "Kit", sku: "SKU-A", sessions: 100, units: 50, sales: 2000, orderItems: 55, cvr: 8, buyBox: 95, aov: 40 },
  ],
  nTotal: 1,
};
const revenueSeries = [
  { month: "OCT", revenue: 80000 },
  { month: "NOV", revenue: 85000 },
  { month: "DEC", revenue: 95000 },
  { month: "JAN", revenue: 90000 },
  { month: "FEB", revenue: 100000 },
  { month: "MAR", revenue: 124000 },
];

describe("buildReportData", () => {
  it("builds a complete Report when all inputs present", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.meta.client).toBe("Dr. Cuddles");
    expect(r.meta.month).toBe("March 2026");
    expect(r.meta.lead).toBe("Manu Lancharro");
    expect(r.meta.reportId).toBe("2026-03-dr-cuddles");
    expect(r.sections).toEqual(["cover", "toc", "kpis", "mom", "products", "appendix"]);
    expect(r.kpis?.length).toBeGreaterThanOrEqual(4);
    expect(r.mom?.revenueSeries.length).toBe(6);
    expect(r.mom?.table.length).toBeGreaterThan(0);
    expect(r.products?.length).toBe(1);
    expect(r.appendix?.contactLine).toMatch(/@/);
  });

  it("omits 'products' section when products is null", () => {
    const r = buildReportData({ client, period, headline, products: null, revenueSeries, lead: "Manu Lancharro" });
    expect(r.sections).not.toContain("products");
    expect(r.products).toBeUndefined();
  });

  it("renders null-delta rows when previous month missing", () => {
    const noPrev: HeadlineResult = { ...headline, previous: null, deltas: { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null } };
    const r = buildReportData({ client, period, headline: noPrev, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.mom?.table.every(row => row.delta === "—")).toBe(true);
  });

  it("uses brand gold as default accent", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.meta.accent).toBe("#F7BF1D");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/monthly-report/build-report-data.test.ts`
Expected: FAIL — `Cannot find module './build-report-data'`.

- [ ] **Step 3: Implement `build-report-data.ts`**

```ts
// src/lib/monthly-report/build-report-data.ts
import type {
  Report, KPI, MoMTableRow, ProductRow as TplProductRow, SectionId,
} from "@/components/monthly-report/types";
import type {
  HeadlineResult, ProductsResult, MonthlyPeriod, ClientContext,
} from "./types";

export interface BuildInput {
  client: ClientContext;
  period: MonthlyPeriod;
  headline: HeadlineResult | null;
  products: ProductsResult | null;
  revenueSeries: Array<{ month: string; revenue: number }>;
  lead: string;
}

const DOLLAR = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}
function fmtDelta(d: number | null): string {
  if (d === null) return "—";
  const sign = d >= 0 ? "+" : "";
  return `${sign}${(d * 100).toFixed(1)}%`;
}
function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return n >= 10000 ? `$${COMPACT.format(n)}` : DOLLAR.format(n);
}
function direction(delta: number | null, goodIsUp = true): "up" | "down" | "flat" {
  if (delta === null || Math.abs(delta) < 0.005) return "flat";
  const isUp = delta > 0;
  return (isUp === goodIsUp) ? "up" : "down";
}

function humanPeriod(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", timeZone: "UTC" });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function issuedToday(): string {
  return new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function buildKpis(h: HeadlineResult): KPI[] {
  const c = h.current;
  const d = h.deltas;
  return [
    { label: "Sales",    value: fmtMoney(c.sales),           delta: fmtDelta(d.sales),   direction: direction(d.sales),   foot: "Product sales, current month", highlight: true },
    { label: "Units",    value: INT.format(c.units),         delta: fmtDelta(d.units),   direction: direction(d.units),   foot: "Total units sold",              highlight: true },
    { label: "AOV",      value: fmtMoney(c.aov ?? 0),        delta: fmtDelta(d.aov),     direction: direction(d.aov),     foot: "Average order value",           highlight: true },
    { label: "CVR",      value: fmtPct(c.cvr),               delta: fmtDelta(d.cvr),     direction: direction(d.cvr),     foot: "Sessions → orders",             highlight: true },
    { label: "Buy-box",  value: fmtPct(c.buyBox),            delta: fmtDelta(d.buyBox),  direction: direction(d.buyBox),  foot: "Weighted by sessions" },
    { label: "Order items", value: INT.format(c.orderItems), delta: "—",                 direction: "flat",               foot: "Includes quantity > 1" },
  ];
}

function buildMoMTable(h: HeadlineResult): MoMTableRow[] {
  const rows: Array<[string, number | null, number | null, number | null, boolean]> = [
    ["Sales",   h.current.sales,       h.previous?.sales ?? null,       h.deltas.sales,   true],
    ["Units",   h.current.units,       h.previous?.units ?? null,       h.deltas.units,   true],
    ["AOV",     h.current.aov,         h.previous?.aov ?? null,         h.deltas.aov,     true],
    ["CVR",     h.current.cvr,         h.previous?.cvr ?? null,         h.deltas.cvr,     true],
    ["Buy-box", h.current.buyBox,      h.previous?.buyBox ?? null,      h.deltas.buyBox,  true],
  ];
  return rows.map(([metric, curr, prev, delta, goodIsUp]) => {
    const fmt = metric === "Sales" || metric === "AOV"
      ? (v: number | null) => v === null ? "—" : fmtMoney(v)
      : metric === "CVR" || metric === "Buy-box"
      ? (v: number | null) => fmtPct(v)
      : (v: number | null) => v === null ? "—" : INT.format(v);
    return {
      metric,
      prev: fmt(prev),
      curr: fmt(curr),
      delta: fmtDelta(delta),
      deltaDirection: direction(delta, goodIsUp),
    };
  });
}

function narrative(h: HeadlineResult, client: string): string {
  if (!h.previous) {
    return `First-month data for ${client}. No previous-month comparison available.`;
  }
  const salesDelta = fmtDelta(h.deltas.sales);
  const bbDelta = fmtDelta(h.deltas.buyBox);
  return `Revenue ${salesDelta} vs previous month. Buy-box moved ${bbDelta}. CVR landed at ${fmtPct(h.current.cvr)}.`;
}

function buildProducts(p: ProductsResult): TplProductRow[] {
  return p.rows.map(r => ({
    asin: r.asin, title: r.title, sku: r.sku,
    sessions: r.sessions, units: r.units, sales: r.sales,
    cvr: r.cvr, buyBox: r.buyBox,
  }));
}

export function buildReportData(inp: BuildInput): Report {
  const { client, period, headline, products, revenueSeries, lead } = inp;

  const sections: SectionId[] = ["cover", "toc"];
  if (headline) sections.push("kpis", "mom");
  if (products && products.rows.length > 0) sections.push("products");
  sections.push("appendix");

  return {
    meta: {
      client: client.name,
      month: period.label,
      period: humanPeriod(period.start, period.end),
      lead,
      issued: issuedToday(),
      reportId: `${period.period}-${client.slug}`,
      accent: "#F7BF1D",
    },
    sections,
    kpis: headline ? buildKpis(headline) : undefined,
    mom: headline ? {
      revenueSeries: revenueSeries.map(p => ({ label: p.month, value: p.revenue })),
      revenueTargetSeries: [],
      cacSeries: [],
      table: buildMoMTable(headline),
      narrative: narrative(headline, client.name),
    } : undefined,
    products: products && products.rows.length > 0 ? buildProducts(products) : undefined,
    appendix: {
      methodology: "Figures from Seller Central business reports via Intentwise Redshift. Period is the full calendar month.",
      sources: [
        ["Sales, units, sessions, CVR, buy-box", "Intentwise / Seller Central business reports"],
        ["Per-ASIN breakdown", "Intentwise product_summary rollup"],
      ],
      glossary: [
        ["CVR", "Conversion rate — orders divided by sessions."],
        ["Buy-box", "Percentage of eligible page views where the seller held the buy-box."],
        ["AOV", "Average order value — sales divided by orders."],
      ],
      changelog: [],
      contactLine: `${lead} · account@1o8.agency`,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/monthly-report/build-report-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/build-report-data.ts src/lib/monthly-report/build-report-data.test.ts
git commit -m "feat(monthly-reports): add build-report-data adapter for template shape"
```

---

## Task 7: Update orchestrator to return `{report, skipped}`

**Files:**
- Modify: `src/lib/monthly-report/orchestrator.ts`
- Modify: `src/lib/monthly-report/orchestrator.test.ts`
- Modify: `src/lib/monthly-report/index.ts`

- [ ] **Step 1: Rewrite `orchestrator.ts`**

Replace the existing file contents with:

```ts
// src/lib/monthly-report/orchestrator.ts
import type {
  ClientContext, HeadlineResult, MonthlyPeriod, ReportConfig, SectionKey,
} from "./types";
import type { Report } from "@/components/monthly-report/types";
import { fetchAccountRollup, fetchRevenueSeries } from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { buildHeadlineResult } from "./analyzers/headline-kpis";
import { analyzeProducts } from "./analyzers/products";
import { buildReportData } from "./build-report-data";

export interface ReportPayload {
  report: Report;
  headline: HeadlineResult | null;
  skipped: SectionKey[];
}

export async function generateReport(
  client: ClientContext,
  period: MonthlyPeriod,
  config: ReportConfig,
  lead = "Manu Lancharro",
): Promise<ReportPayload> {
  const [curr, prev, revenueSeries] = await Promise.all([
    fetchAccountRollup(client.accountId, period.start, period.end),
    fetchAccountRollup(client.accountId, period.prevStart, period.prevEnd),
    fetchRevenueSeries(client.accountId, period.start),
  ]);
  const headline = buildHeadlineResult(curr, prev);

  let products = null;
  const skipped: SectionKey[] = [];
  if (config.enabled.products) {
    const rows = await fetchProductRows(client.accountId, period.start, period.end);
    products = analyzeProducts(rows);
    if (!products) skipped.push("products");
  } else {
    skipped.push("products");
  }
  // B2B always skipped in V1 (stub analyzer returns null).
  skipped.push("b2b");

  const report = buildReportData({ client, period, headline, products, revenueSeries, lead });
  return { report, headline, skipped };
}
```

- [ ] **Step 2: Rewrite `orchestrator.test.ts`**

Replace with:

```ts
// src/lib/monthly-report/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./queries/account", () => ({
  fetchAccountRollup: vi.fn(),
  fetchRevenueSeries: vi.fn(),
}));
vi.mock("./queries/products", () => ({
  fetchProductRows: vi.fn(),
}));

import { fetchAccountRollup, fetchRevenueSeries } from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { generateReport } from "./orchestrator";

const client = { name: "Dr. Cuddles", accountId: "1899670", slug: "dr-cuddles" };
const period = {
  period: "2026-03", start: "2026-03-01", end: "2026-03-31",
  prevStart: "2026-02-01", prevEnd: "2026-02-28", label: "March 2026",
};

describe("generateReport", () => {
  beforeEach(() => {
    vi.mocked(fetchAccountRollup).mockReset();
    vi.mocked(fetchRevenueSeries).mockReset();
    vi.mocked(fetchProductRows).mockReset();
  });

  it("returns a Report matching the template contract", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue({
      product_sales: 124000, product_quantity: 2800, total_order_items: 3000, ad_revenue: 0, ad_spend: 0,
    });
    vi.mocked(fetchRevenueSeries).mockResolvedValue([
      { month: "OCT", revenue: 80000 }, { month: "NOV", revenue: 85000 }, { month: "DEC", revenue: 95000 },
      { month: "JAN", revenue: 90000 }, { month: "FEB", revenue: 100000 }, { month: "MAR", revenue: 124000 },
    ]);
    vi.mocked(fetchProductRows).mockResolvedValue([
      { asin: "A1", parent_asin: "P1", title: "Kit", sku: "SKU-A", sessions: 100, units: 50, sales: 2000, order_items: 55 } as any,
    ]);

    const payload = await generateReport(client, period, { enabled: { products: true, b2b: true } });
    expect(payload.report.meta.client).toBe("Dr. Cuddles");
    expect(payload.report.sections).toContain("products");
    expect(payload.skipped).toContain("b2b");
    expect(payload.headline).not.toBeNull();
  });

  it("marks 'products' as skipped when config disables it", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);

    const payload = await generateReport(client, period, { enabled: { products: false, b2b: true } });
    expect(payload.skipped).toContain("products");
    expect(vi.mocked(fetchProductRows)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Update `index.ts` barrel**

```ts
// src/lib/monthly-report/index.ts
export { generateReport } from "./orchestrator";
export { resolveConfig, ALL_SECTION_KEYS } from "./config";
export { resolvePeriod, lastCompletedMonth, slugify } from "./period";
export type {
  MonthlyPeriod,
  ReportConfig,
  ClientContext,
  SectionKey,
  AnalyzerResult,
  HeadlineResult,
  ProductsResult,
  B2bResult,
} from "./types";
```

Note: `SECTIONS` export removed — registry is deleted in Task 17.

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/lib/monthly-report/orchestrator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/orchestrator.ts src/lib/monthly-report/orchestrator.test.ts src/lib/monthly-report/index.ts
git commit -m "feat(monthly-reports): orchestrator returns template Report shape"
```

---

## Task 8: Update `POST /api/reports/monthly` response shape

**Files:**
- Modify: `src/app/api/reports/monthly/route.ts`
- Modify: `src/app/api/reports/monthly/route.test.ts`

- [ ] **Step 1: Edit `route.ts`**

Replace the `try { ... } catch` block with:

```ts
  try {
    const config = await resolveConfig(clientCode);
    const payload = await generateReport(client, period, config);
    return NextResponse.json({
      report: payload.report,
      skipped: payload.skipped,
    });
  } catch (err) {
    const msg = getErrorMessage(err);
    const retryable = /redshift|econn|timeout|network/i.test(msg);
    return NextResponse.json(
      { error: msg, retryable },
      { status: retryable ? 502 : 500 },
    );
  }
```

The `html`, `headline`, `sections`, and `filename` keys are removed.

- [ ] **Step 2: Update `route.test.ts`**

Open `src/app/api/reports/monthly/route.test.ts`. Find the assertion block that checks the response payload. Replace with:

```ts
expect(json.report).toBeDefined();
expect(json.report.meta.client).toBe("Dr. Cuddles");
expect(json.report.sections).toEqual(expect.arrayContaining(["cover", "toc", "appendix"]));
expect(json.skipped).toBeInstanceOf(Array);
// Fields removed in V1.1:
expect(json.html).toBeUndefined();
expect(json.filename).toBeUndefined();
```

Update any other stale assertions that reference `html`, `filename`, or `sections` (the orchestrator-output list, not the template's).

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/app/api/reports/monthly/route.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/monthly/route.ts src/app/api/reports/monthly/route.test.ts
git commit -m "feat(monthly-reports): API returns {report, skipped} (template shape)"
```

---

## Task 9: Swap `/reports/monthly` preview to `<Report>`

**Files:**
- Modify: `src/app/reports/monthly/page.tsx`

- [ ] **Step 1: Edit `page.tsx`**

Replace the existing `ReportPreview` usage and `Download HTML` button with:

```tsx
// Top of file:
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report as ReportData } from "@/components/monthly-report/types";
import type { SectionKey } from "@/lib/monthly-report";

// Replace ApiResponse:
interface ApiResponse {
  report: ReportData;
  skipped: SectionKey[];
}

// Replace the `download()` function with:
async function downloadPdf() {
  setDownloading(true);
  try {
    const res = await fetch("/api/reports/monthly/pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientCode, period }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      setError(errJson.error ?? `PDF generation failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientCode}-${period}-1o8-monthly.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    setDownloading(false);
  }
}
```

Add `const [downloading, setDownloading] = useState(false);` alongside the other state hooks.

Replace the preview + download block:

```tsx
{data && (
  <>
    <div className="report-chrome flex items-center justify-between mb-6">
      <div className="text-xs text-muted-foreground">
        {data.skipped.length > 0 && <>Skipped: {data.skipped.join(", ")}</>}
      </div>
      <button
        onClick={downloadPdf}
        disabled={downloading}
        className="border border-border rounded-md px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
      >
        {downloading ? "Generating PDF…" : "Download PDF"}
      </button>
    </div>
    <ReportView data={data.report} />
  </>
)}
```

Also wrap the sticky header in `<div className="sticky … report-chrome">…</div>` so the `@media print` rule hides it.

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Run: `PORT=3000 npm run dev`
Navigate to http://localhost:3000/reports/monthly
Pick Dr. Cuddles + last completed month → Generate.
Verify: preview renders as the new template (cover page, KPI strip, MoM chart, products table, appendix). No JS errors in console.

- [ ] **Step 4: Commit**

```bash
git add src/app/reports/monthly/page.tsx
git commit -m "feat(monthly-reports): render template preview and wire Download PDF"
```

---

## Task 10: Install Puppeteer deps and configure Vercel function

**Files:**
- Modify: `package.json`
- Modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Install packages**

```bash
npm install puppeteer-core@^23 @sparticuz/chromium@^131 jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Edit `vercel.json`**

Add the `/api/reports/monthly/pdf` function to the `functions` block (create the block if it doesn't exist):

```json
{
  "functions": {
    "src/app/api/reports/monthly/pdf/route.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

Merge with any existing `functions` entries. Leave the rest of `vercel.json` untouched.

- [ ] **Step 3: Update `.env.example`**

Append:

```
# Monthly report PDF rendering
# Secret used to sign short-lived JWTs that carry the report payload into
# the internal print route. Required on every environment.
MONTHLY_REPORT_JWT_SECRET=change-me

# Local dev only: macOS full Chrome path (skip @sparticuz/chromium locally).
# /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
PUPPETEER_EXECUTABLE_PATH=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vercel.json .env.example
git commit -m "chore(monthly-reports): add puppeteer-core + @sparticuz/chromium deps"
```

---

## Task 11: Add JWT sign/verify helpers

**Files:**
- Create: `src/lib/monthly-report/pdf-token.ts`
- Test: `src/lib/monthly-report/pdf-token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/monthly-report/pdf-token.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { signReportToken, verifyReportToken } from "./pdf-token";

describe("pdf-token", () => {
  beforeAll(() => {
    process.env.MONTHLY_REPORT_JWT_SECRET = "test-secret";
  });

  it("round-trips a report payload", () => {
    const payload = { foo: "bar", n: 42 };
    const token = signReportToken(payload);
    const decoded = verifyReportToken<typeof payload>(token);
    expect(decoded.foo).toBe("bar");
    expect(decoded.n).toBe(42);
  });

  it("rejects an invalid token", () => {
    expect(() => verifyReportToken("not.a.token")).toThrow();
  });

  it("rejects when secret is missing", () => {
    const token = signReportToken({ foo: "bar" });
    const orig = process.env.MONTHLY_REPORT_JWT_SECRET;
    delete process.env.MONTHLY_REPORT_JWT_SECRET;
    try {
      expect(() => verifyReportToken(token)).toThrow(/secret/i);
    } finally {
      process.env.MONTHLY_REPORT_JWT_SECRET = orig;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/monthly-report/pdf-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pdf-token.ts`**

```ts
// src/lib/monthly-report/pdf-token.ts
import jwt from "jsonwebtoken";

function getSecret(): string {
  const s = process.env.MONTHLY_REPORT_JWT_SECRET;
  if (!s) throw new Error("MONTHLY_REPORT_JWT_SECRET is not set");
  return s;
}

export function signReportToken(payload: object): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "5m", algorithm: "HS256" });
}

export function verifyReportToken<T>(token: string): T {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as T;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/lib/monthly-report/pdf-token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/monthly-report/pdf-token.ts src/lib/monthly-report/pdf-token.test.ts
git commit -m "feat(monthly-reports): add short-lived JWT helpers for print route"
```

---

## Task 12: Internal print route

Server component that Puppeteer navigates to.

**Files:**
- Create: `src/app/reports/monthly/print/page.tsx`

- [ ] **Step 1: Implement the route**

```tsx
// src/app/reports/monthly/print/page.tsx
import { notFound } from "next/navigation";
import { verifyReportToken } from "@/lib/monthly-report/pdf-token";
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report } from "@/components/monthly-report/types";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) notFound();

  let report: Report;
  try {
    report = verifyReportToken<{ report: Report }>(token).report;
  } catch {
    notFound();
  }

  return (
    <>
      <ReportView data={report} />
      <div data-report-ready="true" />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/reports/monthly/print/page.tsx
git commit -m "feat(monthly-reports): internal print route with signed-token guard"
```

---

## Task 13: PDF API route

**Files:**
- Create: `src/app/api/reports/monthly/pdf/route.ts`
- Create: `src/app/api/reports/monthly/pdf/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/reports/monthly/pdf/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({ user: { role: "admin" } })),
}));
vi.mock("@/lib/monthly-report", () => ({
  generateReport: vi.fn(),
  resolveConfig: vi.fn(async () => ({ enabled: { products: true, b2b: true } })),
  resolvePeriod: vi.fn((p: string) => ({
    period: p, start: `${p}-01`, end: `${p}-28`,
    prevStart: `${p}-01`, prevEnd: `${p}-01`, label: "Test",
  })),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
  lastCompletedMonth: vi.fn(() => "2099-12"),
}));
vi.mock("@/lib/monthly-report/pdf-token", () => ({
  signReportToken: vi.fn(() => "fake.jwt.token"),
}));

const pdfBuffer = Buffer.from("fake-pdf-bytes");
const browserMock = {
  newPage: vi.fn(async () => ({
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    pdf: vi.fn(async () => pdfBuffer),
  })),
  close: vi.fn(),
};
vi.mock("puppeteer-core", () => ({
  default: { launch: vi.fn(async () => browserMock) },
}));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: vi.fn(async () => "/fake/chromium"), headless: true },
}));

import { POST } from "./route";
import { generateReport } from "@/lib/monthly-report";

function makeReq(body: object) {
  return new Request("http://x/api/reports/monthly/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/reports/monthly/pdf", () => {
  beforeEach(() => {
    process.env.MONTHLY_REPORT_JWT_SECRET = "test-secret";
    vi.mocked(generateReport).mockReset();
  });

  it("returns application/pdf on success", async () => {
    vi.mocked(generateReport).mockResolvedValueOnce({
      report: { meta: { client: "Dr. Cuddles" }, sections: [] } as any,
      headline: null,
      skipped: [],
    });

    const res = await POST(makeReq({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.headers.get("content-disposition")).toMatch(/\.pdf/);
  });

  it("returns 500 with friendly error when Chromium launch fails", async () => {
    vi.mocked(generateReport).mockResolvedValueOnce({
      report: {} as any, headline: null, skipped: [],
    });
    const puppeteer = (await import("puppeteer-core")).default;
    vi.mocked(puppeteer.launch).mockRejectedValueOnce(new Error("boom"));

    const res = await POST(makeReq({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/PDF renderer unavailable/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/app/api/reports/monthly/pdf/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `route.ts`**

```ts
// src/app/api/reports/monthly/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getAuthSession } from "@/lib/auth-db";
import {
  generateReport, resolveConfig, resolvePeriod, slugify, lastCompletedMonth,
} from "@/lib/monthly-report";
import { signReportToken } from "@/lib/monthly-report/pdf-token";
import { badRequest, forbidden, notFound, unauthorized, getErrorMessage } from "@/lib/api-utils";

const CLIENTS_BY_CODE: Record<string, string> = {
  "2348430": "Cloud23 Seller Central", "2557190": "Cloud23 Whole Foods",
  "2706460": "Pura", "1067740": "Fresh Vintage Farms", "3388210": "Whitney Jordan",
  "910420": "Trejo's Tacos", "1268300": "Trejo's Spirits", "2572940": "Dreamiere",
  "1145180": "Dr. Wolff USA", "272970": "Hotshot US", "1707700": "BNutty",
  "3629290": "Brad's", "1899670": "Dr. Cuddles", "3415610": "Poochie Butter",
  "3735620": "Glo Health Foods", "154290": "Gaffer", "563510": "This PKN",
};

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return forbidden();

  let body: { clientCode?: unknown; period?: unknown };
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  const rawPeriod = typeof body.period === "string" ? body.period : "";
  if (!clientCode) return badRequest("Missing clientCode");
  if (!rawPeriod) return badRequest("Missing period");

  const maxPeriod = lastCompletedMonth();
  if (rawPeriod > maxPeriod) return badRequest(`Period ${rawPeriod} not complete`);

  let period;
  try { period = resolvePeriod(rawPeriod); } catch (err) { return badRequest(getErrorMessage(err, "Invalid period")); }

  const clientName = CLIENTS_BY_CODE[clientCode];
  if (!clientName) return notFound(`Unknown client code ${clientCode}`);
  const client = { name: clientName, accountId: clientCode, slug: slugify(clientName) };

  let payload;
  try {
    const config = await resolveConfig(clientCode);
    payload = await generateReport(client, period, config);
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }

  const token = signReportToken({ report: payload.report });
  const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : "http://localhost:3000";
  const printUrl = `${origin}/reports/monthly/print?token=${encodeURIComponent(token)}`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: execPath,
      headless: true,
    });
    const page = await browser.newPage();
    // Carry the reviewer's session cookie so middleware doesn't 302 the print route.
    const cookie = req.headers.get("cookie");
    if (cookie) {
      await page.setExtraHTTPHeaders({ cookie });
    }
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector("[data-report-ready]", { timeout: 15_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    const filename = `${client.slug}-${period.period}-1o8-monthly.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[monthly-pdf] render failed:", err);
    return NextResponse.json({ error: "PDF renderer unavailable" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/app/api/reports/monthly/pdf/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Manual smoke test**

```bash
# Ensure MONTHLY_REPORT_JWT_SECRET is set in .env.local.
# Set PUPPETEER_EXECUTABLE_PATH to your local Chrome for dev speed.
PORT=3000 npm run dev
```
Navigate to /reports/monthly → Generate → click Download PDF → PDF downloads. Open it; matches preview.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/reports/monthly/pdf/route.ts src/app/api/reports/monthly/pdf/route.test.ts
git commit -m "feat(monthly-reports): POST /api/reports/monthly/pdf via puppeteer-core"
```

---

## Task 14: Delete the old `render-html/` layer

**Files:**
- Delete: `src/lib/monthly-report/render-html/` (entire directory)

- [ ] **Step 1: Remove the directory**

```bash
rm -rf src/lib/monthly-report/render-html/
```

- [ ] **Step 2: Typecheck + test**

```bash
npm run build
npm run test
```
Both must pass. If anything references the deleted files, fix the import (usually another file that was supposed to be updated in Task 7 or 8).

- [ ] **Step 3: Commit**

```bash
git add -A src/lib/monthly-report/render-html/
git commit -m "chore(monthly-reports): remove old render-html layer (replaced by template)"
```

---

## Task 15: Delete the old `render-react/` layer

**Files:**
- Delete: `src/lib/monthly-report/render-react/`

- [ ] **Step 1: Remove the directory**

```bash
rm -rf src/lib/monthly-report/render-react/
```

- [ ] **Step 2: Typecheck + test**

```bash
npm run build
npm run test
```
Both must pass.

- [ ] **Step 3: Commit**

```bash
git add -A src/lib/monthly-report/render-react/
git commit -m "chore(monthly-reports): remove old render-react preview (replaced by template)"
```

---

## Task 16: Delete `registry.ts`

**Files:**
- Delete: `src/lib/monthly-report/registry.ts`

- [ ] **Step 1: Remove the file**

```bash
rm src/lib/monthly-report/registry.ts
```

- [ ] **Step 2: Typecheck + test**

```bash
npm run build
npm run test
```
Both must pass. If a file still imports `SECTIONS` or `SectionDef` from the registry, update it to reference `ALL_SECTION_KEYS` from `config.ts` instead (used only by the config UI).

- [ ] **Step 3: Commit**

```bash
git add -A src/lib/monthly-report/registry.ts
git commit -m "chore(monthly-reports): drop registry.ts (template handles section map)"
```

---

## Task 17: Full-suite verification

- [ ] **Step 1: Run the full test suite**

```bash
npm run test
```
Expected: all tests pass. Record the count (should be ≈73 before, new count after adds/deletes; roughly similar or slightly higher).

- [ ] **Step 2: Run typecheck**

```bash
npm run build
```
Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: PASS (or only pre-existing warnings).

- [ ] **Step 4: Manual QA (from spec §Manual QA)**

Work through the checklist in the spec — `docs/superpowers/specs/2026-04-24-monthly-reports-renderer-swap-design.md` § "Manual QA checklist". Each step must pass; any failure becomes a new task before shipping.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(monthly-reports): post-swap fixups from QA checklist"
```
(Skip this step if QA passes without edits.)

---

## Rollout checklist

- [ ] Set `MONTHLY_REPORT_JWT_SECRET` in Vercel Project Settings → Environment Variables (Production + Preview).
  ```bash
  openssl rand -hex 32  # generate a strong secret
  ```
- [ ] Verify `vercel.json` changes appear in the next deploy preview (Functions tab shows 1024 MB / 60 s).
- [ ] Deploy preview URL → run manual QA against it (steps 1–6 of spec QA).
- [ ] Remove the local `PUPPETEER_EXECUTABLE_PATH` from `.env.local` before merging (keep it unset on Vercel).
- [ ] Update `primer.md` next-step: V1.1 merged; v1.2 is the email-send pipeline.

---

## Out-of-scope reminders

These are called out in the spec as explicit non-goals. Do NOT pick them up here:

1. Email send via Resend + Gmail draft — v1.2.
2. Lift `CLIENTS` map to the DB.
3. Per-client `lead` / `accent` in DB.
4. B2B wiring (query exists, unwired).
5. Per-ASIN 6-month sparkline.
6. Multi-page Products table.
