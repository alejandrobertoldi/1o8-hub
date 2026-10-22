# Case Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-client Case Study page to 1o8Hub — scrollable dark/gold report with auto-pulled data sections (SnS, Sales, PPC), manual visual sections, PDF export, and portal read-only view.

**Architecture:** Snapshot document model — admin generates a case study by pulling Redshift/ppcSnapshots data into frozen JSONB sections stored in Postgres. A shared `CaseStudyView` component renders the dark/gold page for admin view, portal view, and Puppeteer PDF.

**Tech Stack:** Next.js App Router, Drizzle ORM, Postgres (Supabase), Redshift (via `queryRedshift`), Recharts, Puppeteer + `@sparticuz/chromium`, Vitest

---

## File Map

**New files:**
- `src/lib/db/schema.ts` — modified: add `caseStudies`, `caseStudySections` tables; add `clientLogoUrl` to `aac`
- `src/lib/case-study/types.ts` — TypeScript types for all section content shapes
- `src/lib/case-study/queries/ppc.ts` — pull PPC data from `ppcSnapshots` table
- `src/lib/case-study/queries/sns.ts` — pull SnS data from Redshift
- `src/lib/case-study/queries/sales.ts` — pull Sales data from Redshift
- `src/lib/case-study/generate.ts` — orchestrator: calls queries, writes sections to DB
- `src/app/api/case-studies/route.ts` — POST (create + generate)
- `src/app/api/case-studies/[id]/route.ts` — GET, DELETE
- `src/app/api/case-studies/[id]/refresh/route.ts` — POST (re-pull data sections)
- `src/app/api/case-studies/[id]/sections/[sectionId]/route.ts` — PATCH (update visual section content)
- `src/app/api/case-studies/[id]/pdf/route.ts` — GET → Puppeteer PDF download
- `src/components/case-study/case-study-charts.tsx` — Recharts wrappers (SnS timeline, Sales monthly, PPC)
- `src/components/case-study/case-study-cover.tsx` — Cover section renderer
- `src/components/case-study/case-study-section-visual.tsx` — Visual sections (Storefront, Brand Story, Listing, A+, Store BTP)
- `src/components/case-study/case-study-section-data.tsx` — Data sections (SnS, Sales, PPC)
- `src/components/case-study/case-study-view.tsx` — Shared full-page renderer
- `src/components/case-study/case-study-generate-modal.tsx` — Date range + section toggles modal
- `src/components/case-study/case-study-edit-modal.tsx` — Visual section copy/image editor
- `src/app/clients/[clientIdCode]/case-study/page.tsx` — Admin view page
- `src/app/clients/[clientIdCode]/case-study/page-meta.tsx` — PageMetaSlot for admin view
- `src/app/portal/case-study/page.tsx` — Portal read-only page (uses session clientIdCode)

**Modified files:**
- `src/app/clients/[clientIdCode]/layout.tsx` — add "Case Study" tab

---

## Task 1: Schema Changes

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Read the current end of schema.ts to find the right insertion point**

```bash
tail -50 /Users/manu/1o8Hub/src/lib/db/schema.ts
```

- [ ] **Step 2: Add `clientLogoUrl` field to `aac` table**

In `src/lib/db/schema.ts`, inside the `aac` pgTable definition, add after `powerbiEmbedUrl`:

```typescript
    clientLogoUrl: text("client_logo_url"),
```

- [ ] **Step 3: Add case study tables at the end of schema.ts**

Append before the final type export block:

```typescript
// ─── Case Studies ─────────────────────────────────────────────────────

export const caseStudyStatusEnum = pgEnum("case_study_status", ["draft", "published"]);

export const caseStudies = pgTable(
  "case_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull().unique(),
    title: text("title").notNull(),
    dateRangeStart: date("date_range_start").notNull(),
    dateRangeEnd: date("date_range_end").notNull(),
    sectionsEnabled: text("sections_enabled").array().notNull(),
    status: caseStudyStatusEnum("status").notNull().default("draft"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cs_client").on(t.clientIdCode),
    index("idx_cs_status").on(t.status),
  ]
);

export const caseStudySections = pgTable(
  "case_study_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseStudyId: uuid("case_study_id")
      .notNull()
      .references(() => caseStudies.id, { onDelete: "cascade" }),
    sectionType: text("section_type").notNull(),
    sortOrder: integer("sort_order").notNull(),
    content: jsonb("content").notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_css_case_study").on(t.caseStudyId),
  ]
);

export type CaseStudy = typeof caseStudies.$inferSelect;
export type NewCaseStudy = typeof caseStudies.$inferInsert;
export type CaseStudySection = typeof caseStudySections.$inferSelect;
export type NewCaseStudySection = typeof caseStudySections.$inferInsert;
```

- [ ] **Step 4: Push schema to database (DEV DB IS PROD — confirm before running)**

```bash
npm run db:push
```

Expected: prints the new tables and applies them. Confirm when prompted.

- [ ] **Step 5: Verify build still compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no new TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(case-study): add caseStudies + caseStudySections schema tables"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/lib/case-study/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/case-study/types.ts

export const SECTION_TYPES = [
  "cover",
  "storefront",
  "brand_story",
  "product_listing",
  "aplus",
  "store_btp",
  "sns",
  "sales",
  "ppc",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, string> = {
  cover: "Cover",
  storefront: "Storefront",
  brand_story: "Brand Story",
  product_listing: "Product Listing",
  aplus: "A+ Content",
  store_btp: "Amazon Store & BTP",
  sns: "Subscribe & Save",
  sales: "Sales",
  ppc: "PPC Performance",
};

export const DATA_SECTIONS: SectionType[] = ["sns", "sales", "ppc"];
export const VISUAL_SECTIONS: SectionType[] = [
  "cover", "storefront", "brand_story", "product_listing", "aplus", "store_btp",
];

// ─── Visual section content ────────────────────────────────────────────

export interface CoverContent {
  tagline: string;
  clientLogoUrl: string;
  heroImageUrls: string[];
}

export interface VisualSectionContent {
  copy: string;
  statCallout?: string;
  imageUrls: string[];
}

export interface StoreBtpContent {
  copy: string;
  imageUrls: string[];
  visitors?: number;
  salesTotal?: number;
  orders?: number;
  storeQuality?: string;
  promotionsActive?: number;
}

// ─── Data section content ──────────────────────────────────────────────

export interface SnsTimelinePoint {
  date: string;
  value: number;
  yearAgo: number | null;
}

export interface SnsContent {
  copy: string;
  totalSubscriptions: number;
  revenueTotal: number;
  momGrowth: number | null;
  timeline: SnsTimelinePoint[];
}

export interface SalesMonthlyStat {
  month: string;
  revenue: number;
  orders: number;
}

export interface SalesContent {
  copy: string;
  statCallout: string;
  lifetimeRevenue: number;
  totalOrders: number;
  totalUnits: number;
  avgOrderValue: number;
  salesByMonth: SalesMonthlyStat[];
}

export interface PpcChartPoint {
  date: string;
  spend: number;
  sales: number;
  acos: number;
}

export interface PpcPeriodData {
  spend: number;
  sales: number;
  acos: number;
  ntb: number;
  chart: PpcChartPoint[];
}

export interface PpcContent {
  copy: string;
  statCallout: string;
  lifetime: PpcPeriodData;
  ytd: PpcPeriodData;
}

// ─── Section content union ─────────────────────────────────────────────

export type SectionContent =
  | CoverContent
  | VisualSectionContent
  | StoreBtpContent
  | SnsContent
  | SalesContent
  | PpcContent;

export interface CaseStudySectionData {
  id: string;
  sectionType: SectionType;
  sortOrder: number;
  content: SectionContent;
}

export interface CaseStudyData {
  id: string;
  clientIdCode: string;
  clientName: string;
  title: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  sectionsEnabled: SectionType[];
  status: "draft" | "published";
  generatedAt: string | null;
  sections: CaseStudySectionData[];
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep "case-study/types" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/case-study/types.ts
git commit -m "feat(case-study): add TypeScript types for section content"
```

---

## Task 3: PPC Query

**Files:**
- Create: `src/lib/case-study/queries/ppc.ts`
- Create: `src/lib/case-study/queries/ppc.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/case-study/queries/ppc.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { fetchPpcContent } from "./ppc";

const mockSelect = vi.mocked(db.select);

function makeChain(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    then: undefined as unknown,
  };
  return chain;
}

describe("fetchPpcContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero-valued content when no snapshots exist", async () => {
    mockSelect.mockReturnValue(makeChain([]) as ReturnType<typeof db.select>);
    const result = await fetchPpcContent("TEST_CLIENT", "2024-01-01", "2024-12-31");
    expect(result.lifetime.spend).toBe(0);
    expect(result.lifetime.sales).toBe(0);
    expect(result.ytd.spend).toBe(0);
    expect(result.lifetime.chart).toEqual([]);
  });

  it("extracts summary fields from latest snapshot", async () => {
    const mockSnapshot = {
      summary: {
        spend: 64207.27,
        sales: 156910.87,
        acos: 40.92,
        ntb: 18505.70,
      },
      data: [],
    };
    mockSelect.mockReturnValue(makeChain([mockSnapshot]) as ReturnType<typeof db.select>);
    const result = await fetchPpcContent("TEST_CLIENT", "2024-01-01", "2024-12-31");
    expect(result.lifetime.spend).toBe(64207.27);
    expect(result.lifetime.acos).toBe(40.92);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/case-study/queries/ppc.test.ts 2>&1 | tail -15
```

Expected: FAIL — `fetchPpcContent` not found.

- [ ] **Step 3: Implement the query**

```typescript
// src/lib/case-study/queries/ppc.ts
import { db } from "@/lib/db";
import { ppcSnapshots } from "@/lib/db/schema";
import { eq, and, lte, gte, desc } from "drizzle-orm";
import type { PpcContent, PpcPeriodData, PpcChartPoint } from "../types";

const EMPTY_PERIOD: PpcPeriodData = { spend: 0, sales: 0, acos: 0, ntb: 0, chart: [] };

function extractPeriod(snapshot: { summary: unknown; data: unknown } | null): PpcPeriodData {
  if (!snapshot) return EMPTY_PERIOD;
  const s = snapshot.summary as Record<string, number> | null;
  if (!s) return EMPTY_PERIOD;
  const rawData = (snapshot.data ?? []) as Array<Record<string, unknown>>;
  const chart: PpcChartPoint[] = rawData.map((r) => ({
    date: String(r.date ?? ""),
    spend: Number(r.spend ?? 0),
    sales: Number(r.sales ?? 0),
    acos: Number(r.acos ?? 0),
  }));
  return {
    spend: Number(s.spend ?? 0),
    sales: Number(s.sales ?? 0),
    acos: Number(s.acos ?? 0),
    ntb: Number(s.ntb ?? 0),
    chart,
  };
}

export async function fetchPpcContent(
  clientIdCode: string,
  _dateStart: string,
  _dateEnd: string
): Promise<PpcContent> {
  const rows = await db
    .select()
    .from(ppcSnapshots)
    .where(eq(ppcSnapshots.clientIdCode, clientIdCode))
    .orderBy(desc(ppcSnapshots.snapshotDate))
    .limit(10);

  const lifetime = rows.find((r) => r.reportType === "lifetime") ?? null;
  const ytd = rows.find((r) => r.reportType === "ytd") ?? null;

  return {
    copy: "",
    statCallout: "",
    lifetime: extractPeriod(lifetime as { summary: unknown; data: unknown } | null),
    ytd: extractPeriod(ytd as { summary: unknown; data: unknown } | null),
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/case-study/queries/ppc.test.ts 2>&1 | tail -10
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/case-study/queries/ppc.ts src/lib/case-study/queries/ppc.test.ts
git commit -m "feat(case-study): PPC query from ppcSnapshots"
```

---

## Task 4: SnS Query

**Files:**
- Create: `src/lib/case-study/queries/sns.ts`
- Create: `src/lib/case-study/queries/sns.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/case-study/queries/sns.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));

import { queryRedshift } from "@/lib/redshift";
import { fetchSnsContent } from "./sns";

const mockQueryRedshift = vi.mocked(queryRedshift);

describe("fetchSnsContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero content when Redshift returns empty", async () => {
    mockQueryRedshift.mockResolvedValue([]);
    const result = await fetchSnsContent("111111", "2024-01-01", "2024-12-31");
    expect(result.totalSubscriptions).toBe(0);
    expect(result.revenueTotal).toBe(0);
    expect(result.momGrowth).toBeNull();
    expect(result.timeline).toEqual([]);
  });

  it("calculates totalSubscriptions from latest data point", async () => {
    const rows = [
      { end_date: "2024-11-01", active_subscriptions: 700 },
      { end_date: "2024-12-01", active_subscriptions: 796 },
    ];
    mockQueryRedshift.mockResolvedValue(rows);
    const result = await fetchSnsContent("111111", "2024-01-01", "2024-12-31");
    expect(result.totalSubscriptions).toBe(796);
    expect(result.timeline).toHaveLength(2);
  });

  it("calculates momGrowth when two months exist", async () => {
    const rows = [
      { end_date: "2024-11-01", active_subscriptions: 573 },
      { end_date: "2024-12-01", active_subscriptions: 796 },
    ];
    mockQueryRedshift.mockResolvedValue(rows);
    const result = await fetchSnsContent("111111", "2024-01-01", "2024-12-31");
    // (796 - 573) / 573 * 100 ≈ 38.92
    expect(result.momGrowth).toBeCloseTo(38.92, 1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/case-study/queries/sns.test.ts 2>&1 | tail -10
```

Expected: FAIL — `fetchSnsContent` not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/case-study/queries/sns.ts
import { queryRedshift } from "@/lib/redshift";
import type { SnsContent, SnsTimelinePoint } from "../types";

export async function fetchSnsContent(
  accountId: string,
  dateStart: string,
  dateEnd: string
): Promise<SnsContent> {
  const rows = await queryRedshift<{ end_date: string; active_subscriptions: number }>(
    `
    SELECT
      TO_CHAR(end_date::DATE, 'YYYY-MM-DD') AS end_date,
      COALESCE(SUM(active_subscriptions::FLOAT), 0)::BIGINT AS active_subscriptions
    FROM "amazon_source_data"."replenishment_offer_metrics"
    WHERE account_id = $1::BIGINT
      AND end_date::DATE >= $2::DATE
      AND end_date::DATE <= $3::DATE
    GROUP BY end_date::DATE
    ORDER BY end_date::DATE
    `,
    [accountId, dateStart, dateEnd]
  ).catch(() => []);

  if (rows.length === 0) {
    return { copy: "", totalSubscriptions: 0, revenueTotal: 0, momGrowth: null, timeline: [] };
  }

  const timeline: SnsTimelinePoint[] = rows.map((r) => ({
    date: r.end_date,
    value: Number(r.active_subscriptions),
    yearAgo: null,
  }));

  const latest = Number(rows[rows.length - 1].active_subscriptions);
  const prev = rows.length >= 2 ? Number(rows[rows.length - 2].active_subscriptions) : null;
  const momGrowth = prev && prev > 0 ? ((latest - prev) / prev) * 100 : null;

  return {
    copy: "",
    totalSubscriptions: latest,
    revenueTotal: 0,
    momGrowth,
    timeline,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/case-study/queries/sns.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/case-study/queries/sns.ts src/lib/case-study/queries/sns.test.ts
git commit -m "feat(case-study): SnS query from Redshift replenishment_offer_metrics"
```

---

## Task 5: Sales Query

**Files:**
- Create: `src/lib/case-study/queries/sales.ts`
- Create: `src/lib/case-study/queries/sales.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/case-study/queries/sales.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));

import { queryRedshift } from "@/lib/redshift";
import { fetchSalesContent } from "./sales";

const mockQueryRedshift = vi.mocked(queryRedshift);

describe("fetchSalesContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zeros when Redshift is empty", async () => {
    mockQueryRedshift.mockResolvedValue([]);
    const result = await fetchSalesContent("111111", "2024-01-01", "2024-12-31");
    expect(result.lifetimeRevenue).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.salesByMonth).toEqual([]);
  });

  it("aggregates monthly rows into salesByMonth", async () => {
    const rows = [
      { month: "2024-01", ordered_revenue: 10000, total_order_items: 340, ordered_units: 400 },
      { month: "2024-02", ordered_revenue: 15000, total_order_items: 500, ordered_units: 600 },
    ];
    mockQueryRedshift.mockResolvedValue(rows);
    const result = await fetchSalesContent("111111", "2024-01-01", "2024-12-31");
    expect(result.lifetimeRevenue).toBe(25000);
    expect(result.totalOrders).toBe(840);
    expect(result.salesByMonth).toHaveLength(2);
    expect(result.salesByMonth[0]).toEqual({ month: "2024-01", revenue: 10000, orders: 340 });
  });

  it("calculates avgOrderValue", async () => {
    const rows = [
      { month: "2024-01", ordered_revenue: 30000, total_order_items: 1000, ordered_units: 1200 },
    ];
    mockQueryRedshift.mockResolvedValue(rows);
    const result = await fetchSalesContent("111111", "2024-01-01", "2024-12-31");
    expect(result.avgOrderValue).toBeCloseTo(30, 1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/case-study/queries/sales.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/case-study/queries/sales.ts
import { queryRedshift } from "@/lib/redshift";
import type { SalesContent, SalesMonthlyStat } from "../types";

export async function fetchSalesContent(
  accountId: string,
  dateStart: string,
  dateEnd: string
): Promise<SalesContent> {
  const rows = await queryRedshift<{
    month: string;
    ordered_revenue: number;
    total_order_items: number;
    ordered_units: number;
  }>(
    `
    SELECT
      TO_CHAR(report_date::DATE, 'YYYY-MM') AS month,
      COALESCE(SUM(ordered_revenue), 0) AS ordered_revenue,
      COALESCE(SUM(total_order_items), 0) AS total_order_items,
      COALESCE(SUM(ordered_units), 0) AS ordered_units
    FROM (
      SELECT report_date, account_id,
        COALESCE(MAX(ordered_revenue), 0) AS ordered_revenue,
        COALESCE(MAX(total_order_items), 0) AS total_order_items,
        COALESCE(MAX(ordered_units), 0) AS ordered_units
      FROM "intentwise_ecommerce_graph"."account_summary"
      WHERE account_id = $1::BIGINT
        AND report_date >= $2::DATE
        AND report_date <= $3::DATE
      GROUP BY report_date, account_id
    ) daily
    GROUP BY TO_CHAR(report_date::DATE, 'YYYY-MM')
    ORDER BY month ASC
    `,
    [accountId, dateStart, dateEnd]
  ).catch(() => []);

  if (rows.length === 0) {
    return {
      copy: "",
      statCallout: "",
      lifetimeRevenue: 0,
      totalOrders: 0,
      totalUnits: 0,
      avgOrderValue: 0,
      salesByMonth: [],
    };
  }

  const salesByMonth: SalesMonthlyStat[] = rows.map((r) => ({
    month: r.month,
    revenue: Number(r.ordered_revenue),
    orders: Number(r.total_order_items),
  }));

  const lifetimeRevenue = salesByMonth.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = salesByMonth.reduce((s, r) => s + r.orders, 0);
  const totalUnits = rows.reduce((s, r) => s + Number(r.ordered_units), 0);
  const avgOrderValue = totalOrders > 0 ? lifetimeRevenue / totalOrders : 0;

  return {
    copy: "",
    statCallout: "",
    lifetimeRevenue,
    totalOrders,
    totalUnits,
    avgOrderValue,
    salesByMonth,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/case-study/queries/sales.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/case-study/queries/sales.ts src/lib/case-study/queries/sales.test.ts
git commit -m "feat(case-study): Sales query from Redshift account_summary"
```

---

## Task 6: Generation Orchestrator

**Files:**
- Create: `src/lib/case-study/generate.ts`
- Create: `src/lib/case-study/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/case-study/generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./queries/ppc", () => ({
  fetchPpcContent: vi.fn().mockResolvedValue({
    copy: "", statCallout: "",
    lifetime: { spend: 0, sales: 0, acos: 0, ntb: 0, chart: [] },
    ytd: { spend: 0, sales: 0, acos: 0, ntb: 0, chart: [] },
  }),
}));

vi.mock("./queries/sns", () => ({
  fetchSnsContent: vi.fn().mockResolvedValue({
    copy: "", totalSubscriptions: 796, revenueTotal: 0, momGrowth: 38.92, timeline: [],
  }),
}));

vi.mock("./queries/sales", () => ({
  fetchSalesContent: vi.fn().mockResolvedValue({
    copy: "", statCallout: "",
    lifetimeRevenue: 303329, totalOrders: 10204, totalUnits: 11065,
    avgOrderValue: 29.73, salesByMonth: [],
  }),
}));

import { buildDataSections } from "./generate";

describe("buildDataSections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only sections that are in sectionsEnabled", async () => {
    const result = await buildDataSections(
      "TEST_CLIENT", "999", "2024-01-01", "2024-12-31",
      ["sns", "ppc"]
    );
    const types = result.map((s) => s.sectionType);
    expect(types).toContain("sns");
    expect(types).toContain("ppc");
    expect(types).not.toContain("sales");
  });

  it("returns all data sections when all are enabled", async () => {
    const result = await buildDataSections(
      "TEST_CLIENT", "999", "2024-01-01", "2024-12-31",
      ["sns", "sales", "ppc"]
    );
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/case-study/generate.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/case-study/generate.ts
import { db } from "@/lib/db";
import { aac, caseStudies, caseStudySections, spApiCredentials } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchPpcContent } from "./queries/ppc";
import { fetchSnsContent } from "./queries/sns";
import { fetchSalesContent } from "./queries/sales";
import type { SectionType, SectionContent } from "./types";
import { DATA_SECTIONS } from "./types";

function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}

export async function resolveAccountId(clientIdCode: string): Promise<string | null> {
  const rows = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  if (!rows[0]) return null;
  const raw = parseRawData(rows[0].rawData);
  return raw.IntentwiseID ?? null;
}

interface SectionDraft {
  sectionType: SectionType;
  content: SectionContent;
}

export async function buildDataSections(
  clientIdCode: string,
  accountId: string,
  dateStart: string,
  dateEnd: string,
  sectionsEnabled: SectionType[]
): Promise<SectionDraft[]> {
  const enabled = new Set(sectionsEnabled.filter((s) => DATA_SECTIONS.includes(s)));
  const results: SectionDraft[] = [];

  const [sns, sales, ppc] = await Promise.all([
    enabled.has("sns") ? fetchSnsContent(accountId, dateStart, dateEnd) : null,
    enabled.has("sales") ? fetchSalesContent(accountId, dateStart, dateEnd) : null,
    enabled.has("ppc") ? fetchPpcContent(clientIdCode, dateStart, dateEnd) : null,
  ]);

  if (sns) results.push({ sectionType: "sns", content: sns });
  if (sales) results.push({ sectionType: "sales", content: sales });
  if (ppc) results.push({ sectionType: "ppc", content: ppc });

  return results;
}

export function buildVisualSectionDefaults(
  sectionsEnabled: SectionType[]
): SectionDraft[] {
  const visualTypes: SectionType[] = [
    "cover", "storefront", "brand_story", "product_listing", "aplus", "store_btp",
  ];
  return visualTypes
    .filter((t) => sectionsEnabled.includes(t))
    .map((t) => ({
      sectionType: t,
      content: t === "cover"
        ? { tagline: "", clientLogoUrl: "", heroImageUrls: [] }
        : { copy: "", imageUrls: [] },
    }));
}

export async function generateCaseStudySections(
  caseStudyId: string,
  clientIdCode: string,
  accountId: string,
  dateStart: string,
  dateEnd: string,
  sectionsEnabled: SectionType[]
): Promise<void> {
  const dataSections = await buildDataSections(
    clientIdCode, accountId, dateStart, dateEnd, sectionsEnabled
  );
  const visualSections = buildVisualSectionDefaults(sectionsEnabled);

  const allSections = [...visualSections, ...dataSections];
  const ordered = sectionsEnabled
    .map((type, i) => {
      const draft = allSections.find((s) => s.sectionType === type);
      if (!draft) return null;
      return { caseStudyId, sectionType: type, sortOrder: i, content: draft.content };
    })
    .filter(Boolean) as Array<{ caseStudyId: string; sectionType: string; sortOrder: number; content: Record<string, unknown> }>;

  if (ordered.length === 0) return;

  await db.delete(caseStudySections).where(eq(caseStudySections.caseStudyId, caseStudyId));
  await db.insert(caseStudySections).values(ordered);
  await db
    .update(caseStudies)
    .set({ generatedAt: new Date(), updatedAt: new Date() })
    .where(eq(caseStudies.id, caseStudyId));
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run src/lib/case-study/generate.test.ts 2>&1 | tail -10
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/case-study/generate.ts src/lib/case-study/generate.test.ts
git commit -m "feat(case-study): generation orchestrator"
```

---

## Task 7: API Routes — CRUD

**Files:**
- Create: `src/app/api/case-studies/route.ts`
- Create: `src/app/api/case-studies/[id]/route.ts`
- Create: `src/app/api/case-studies/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/case-studies/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/case-study/generate", () => ({
  resolveAccountId: vi.fn().mockResolvedValue("999999"),
  generateCaseStudySections: vi.fn().mockResolvedValue(undefined),
}));

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { POST } from "../route";

const mockSession = vi.mocked(getAuthSession);
const mockDb = vi.mocked(db);

function makeChain(result: unknown) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("POST /api/case-studies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/case-studies", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession.mockResolvedValue({ user: { role: "admin" } } as never);
    const req = new Request("http://localhost/api/case-studies", {
      method: "POST",
      body: JSON.stringify({ clientIdCode: "TEST" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("creates a case study and returns 201 on valid input", async () => {
    mockSession.mockResolvedValue({ user: { role: "admin" } } as never);
    const newStudy = {
      id: "uuid-1",
      clientIdCode: "TEST_CLIENT",
      title: "Test Case Study",
      dateRangeStart: "2024-01-01",
      dateRangeEnd: "2024-12-31",
      sectionsEnabled: ["cover", "sns"],
      status: "draft",
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select.mockReturnValue(makeChain([]) as ReturnType<typeof db.select>);
    mockDb.insert.mockReturnValue(makeChain([newStudy]) as ReturnType<typeof db.insert>);
    const req = new Request("http://localhost/api/case-studies", {
      method: "POST",
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        title: "Test Case Study",
        dateRangeStart: "2024-01-01",
        dateRangeEnd: "2024-12-31",
        sectionsEnabled: ["cover", "sns"],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/app/api/case-studies/__tests__/route.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement POST route**

```typescript
// src/app/api/case-studies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { caseStudies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveAccountId, generateCaseStudySections } from "@/lib/case-study/generate";
import type { SectionType } from "@/lib/case-study/types";
import { SECTION_TYPES } from "@/lib/case-study/types";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clientIdCode, title, dateRangeStart, dateRangeEnd, sectionsEnabled } = body;

  if (
    typeof clientIdCode !== "string" || !clientIdCode ||
    typeof title !== "string" || !title ||
    typeof dateRangeStart !== "string" || !dateRangeStart ||
    typeof dateRangeEnd !== "string" || !dateRangeEnd ||
    !Array.isArray(sectionsEnabled) || sectionsEnabled.length === 0
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validSections = (sectionsEnabled as unknown[]).filter(
    (s): s is SectionType => typeof s === "string" && SECTION_TYPES.includes(s as SectionType)
  );

  // One case study per client — check for existing
  const existing = await db
    .select({ id: caseStudies.id })
    .from(caseStudies)
    .where(eq(caseStudies.clientIdCode, clientIdCode))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A case study already exists for this client. Delete it first to regenerate." },
      { status: 409 }
    );
  }

  const [created] = await db
    .insert(caseStudies)
    .values({
      clientIdCode,
      title,
      dateRangeStart,
      dateRangeEnd,
      sectionsEnabled: validSections,
      status: "draft",
    })
    .returning();

  const accountId = await resolveAccountId(clientIdCode);
  if (accountId) {
    await generateCaseStudySections(
      created.id, clientIdCode, accountId, dateRangeStart, dateRangeEnd, validSections
    );
  }

  return NextResponse.json(created, { status: 201 });
}
```

- [ ] **Step 4: Implement GET + DELETE route**

```typescript
// src/app/api/case-studies/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, caseStudies, caseStudySections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { CaseStudyData, SectionType } from "@/lib/case-study/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [cs] = await db
    .select()
    .from(caseStudies)
    .where(eq(caseStudies.id, id))
    .limit(1);

  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sections = await db
    .select()
    .from(caseStudySections)
    .where(eq(caseStudySections.caseStudyId, id));

  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, cs.clientIdCode))
    .limit(1);

  const data: CaseStudyData = {
    id: cs.id,
    clientIdCode: cs.clientIdCode,
    clientName: client?.clientName ?? cs.clientIdCode,
    title: cs.title,
    dateRangeStart: cs.dateRangeStart,
    dateRangeEnd: cs.dateRangeEnd,
    sectionsEnabled: cs.sectionsEnabled as SectionType[],
    status: cs.status,
    generatedAt: cs.generatedAt?.toISOString() ?? null,
    sections: sections
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        id: s.id,
        sectionType: s.sectionType as SectionType,
        sortOrder: s.sortOrder,
        content: s.content as never,
      })),
  };

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(caseStudies).where(eq(caseStudies.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status?: string; title?: string };

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status === "draft" || body.status === "published") update.status = body.status;
  if (typeof body.title === "string" && body.title) update.title = body.title;

  await db.update(caseStudies).set(update).where(eq(caseStudies.id, id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/app/api/case-studies/__tests__/route.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/case-studies/route.ts src/app/api/case-studies/[id]/route.ts src/app/api/case-studies/__tests__/route.test.ts
git commit -m "feat(case-study): CRUD API routes"
```

---

## Task 8: Refresh + Section Update Routes

**Files:**
- Create: `src/app/api/case-studies/[id]/refresh/route.ts`
- Create: `src/app/api/case-studies/[id]/sections/[sectionId]/route.ts`

- [ ] **Step 1: Implement refresh route**

```typescript
// src/app/api/case-studies/[id]/refresh/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { caseStudies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveAccountId, generateCaseStudySections } from "@/lib/case-study/generate";
import type { SectionType } from "@/lib/case-study/types";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [cs] = await db
    .select()
    .from(caseStudies)
    .where(eq(caseStudies.id, id))
    .limit(1);

  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const accountId = await resolveAccountId(cs.clientIdCode);
  if (!accountId) {
    return NextResponse.json({ error: "No Intentwise account ID found for this client" }, { status: 422 });
  }

  await generateCaseStudySections(
    cs.id,
    cs.clientIdCode,
    accountId,
    cs.dateRangeStart,
    cs.dateRangeEnd,
    cs.sectionsEnabled as SectionType[]
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement section update route**

```typescript
// src/app/api/case-studies/[id]/sections/[sectionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { caseStudySections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sectionId } = await params;

  const body = await req.json() as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(caseStudySections)
    .where(eq(caseStudySections.id, sectionId))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const merged = { ...(existing.content as Record<string, unknown>), ...body };

  await db
    .update(caseStudySections)
    .set({ content: merged, updatedAt: new Date() })
    .where(eq(caseStudySections.id, sectionId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep "case-stud" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/case-studies/[id]/refresh/route.ts src/app/api/case-studies/[id]/sections/[sectionId]/route.ts
git commit -m "feat(case-study): refresh data + section update API routes"
```

---

## Task 9: PDF Route

**Files:**
- Create: `src/app/api/case-studies/[id]/pdf/route.ts`

- [ ] **Step 1: Implement PDF route**

This reuses the exact `resolveExecPath` pattern from `src/app/api/reports/monthly/pdf/drive/route.ts`.

```typescript
// src/app/api/case-studies/[id]/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, caseStudies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { existsSync } from "fs";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;

const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

async function resolveExecPath(): Promise<string> {
  if (process.platform !== "darwin") {
    const chromium = (await import("@sparticuz/chromium")).default;
    const path = await chromium.executablePath();
    if (path) return path;
  }
  for (const p of LOCAL_CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error("No Chrome executable found.");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [cs] = await db
    .select()
    .from(caseStudies)
    .where(eq(caseStudies.id, id))
    .limit(1);

  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, cs.clientIdCode))
    .limit(1);

  const clientName = (client?.clientName ?? cs.clientIdCode).replace(/[^a-zA-Z0-9-_]/g, "-");

  const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : "http://localhost:3000";

  const printUrl = `${origin}/clients/${cs.clientIdCode}/case-study?print=1&id=${id}`;

  const execPath = await resolveExecPath();
  const browser = await puppeteer.launch({
    executablePath: execPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  let pdf: Buffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector("[data-case-study-ready]", { timeout: 20_000 });
    pdf = Buffer.from(
      await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } })
    );
  } finally {
    await browser.close();
  }

  const filename = `${clientName}-case-study.pdf`;
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep "pdf" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/case-studies/[id]/pdf/route.ts
git commit -m "feat(case-study): Puppeteer PDF export route"
```

---

## Task 10: Charts Components

**Files:**
- Create: `src/components/case-study/case-study-charts.tsx`

- [ ] **Step 1: Create charts component**

```tsx
// src/components/case-study/case-study-charts.tsx
"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import type { SnsTimelinePoint, SalesMonthlyStat, PpcChartPoint } from "@/lib/case-study/types";

interface SnsChartProps {
  timeline: SnsTimelinePoint[];
}

export function SnsTimelineChart({ timeline }: SnsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={timeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
        <XAxis dataKey="date" tick={{ fill: "#ffffff80", fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
        <YAxis tick={{ fill: "#ffffff80", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#1e2030", border: "none" }} labelStyle={{ color: "#fff" }} />
        <Line type="monotone" dataKey="value" stroke="#E8A700" strokeWidth={2} dot={false} name="2024" />
        <Line type="monotone" dataKey="yearAgo" stroke="#4d82ff" strokeWidth={1.5} dot={false} name="2023" strokeDasharray="4 2" />
        <Legend wrapperStyle={{ color: "#ffffff80", fontSize: 12 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface SalesChartProps {
  salesByMonth: SalesMonthlyStat[];
}

export function SalesMonthlyChart({ salesByMonth }: SalesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={salesByMonth} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
        <XAxis dataKey="month" tick={{ fill: "#ffffff80", fontSize: 11 }} />
        <YAxis tick={{ fill: "#ffffff80", fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: "#1e2030", border: "none" }}
          formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
        />
        <Bar dataKey="revenue" fill="#E8A700" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface PpcChartProps {
  chart: PpcChartPoint[];
  label: string;
}

export function PpcLineChart({ chart, label }: PpcChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
        <XAxis dataKey="date" tick={{ fill: "#ffffff80", fontSize: 10 }} />
        <YAxis tick={{ fill: "#ffffff80", fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "#1e2030", border: "none" }} />
        <Line type="monotone" dataKey="spend" stroke="#4d82ff" strokeWidth={2} dot={false} name="Spend" />
        <Line type="monotone" dataKey="sales" stroke="#E8A700" strokeWidth={2} dot={false} name="Sales" />
        <Legend wrapperStyle={{ color: "#ffffff80", fontSize: 12 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "case-study-charts" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/case-study/case-study-charts.tsx
git commit -m "feat(case-study): Recharts chart components (SnS, Sales, PPC)"
```

---

## Task 11: Cover + Visual Section Components

**Files:**
- Create: `src/components/case-study/case-study-cover.tsx`
- Create: `src/components/case-study/case-study-section-visual.tsx`

- [ ] **Step 1: Create cover component**

```tsx
// src/components/case-study/case-study-cover.tsx
import type { CoverContent } from "@/lib/case-study/types";

interface Props {
  clientName: string;
  content: CoverContent;
}

export function CaseStudyCover({ clientName, content }: Props) {
  return (
    <section className="relative min-h-[480px] bg-[#2d2f3e] flex flex-col">
      {/* Hero image strip */}
      {content.heroImageUrls.length > 0 && (
        <div className="absolute inset-0 flex">
          {content.heroImageUrls.slice(0, 3).map((url, i) => (
            <div key={i} className="flex-1 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover opacity-70" />
            </div>
          ))}
        </div>
      )}

      {/* Overlay */}
      <div className="relative z-10 flex flex-col md:flex-row items-start justify-between p-10 gap-8 min-h-[480px]">
        {/* Left: client card */}
        <div className="bg-white rounded-2xl p-8 max-w-xs shadow-xl">
          {content.clientLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.clientLogoUrl} alt={clientName} className="max-h-16 mb-4" />
          ) : (
            <p className="font-bold text-xl text-gray-900 mb-4">{clientName}</p>
          )}
          {content.tagline && (
            <p className="text-gray-600 text-sm text-center">{content.tagline}</p>
          )}
          <div className="border-t border-dashed border-gray-300 mt-4" />
        </div>

        {/* Top left: Amazon Case Study label */}
        <div className="absolute top-8 left-10">
          <p className="text-white text-2xl font-light tracking-wide">amazon</p>
          <p className="text-white text-5xl font-extrabold tracking-tight uppercase">CASE STUDY</p>
        </div>

        {/* 108 Agency badge */}
        <div className="absolute top-8 right-10 bg-white rounded-full w-24 h-24 flex items-center justify-center shadow-xl">
          <div className="text-center">
            <span className="text-3xl font-black text-black leading-none">1</span>
            <span className="inline-block w-4 h-4 bg-[#E8A700] rounded-full mx-0.5 align-middle" />
            <span className="text-3xl font-black text-black leading-none">8</span>
            <p className="text-[8px] font-bold tracking-widest text-black uppercase">AGENCY</p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create visual section component**

```tsx
// src/components/case-study/case-study-section-visual.tsx
import type { VisualSectionContent, StoreBtpContent } from "@/lib/case-study/types";
import { SECTION_LABELS } from "@/lib/case-study/types";
import type { SectionType } from "@/lib/case-study/types";

interface Props {
  sectionType: SectionType;
  content: VisualSectionContent | StoreBtpContent;
}

export function CaseStudySectionVisual({ sectionType, content }: Props) {
  const label = SECTION_LABELS[sectionType];
  const imageUrls = content.imageUrls ?? [];

  return (
    <section className="bg-[#f0f0f5] py-16 px-10">
      {/* Image mosaic */}
      {imageUrls.length > 0 && (
        <div className={`grid gap-4 mb-8 ${imageUrls.length === 1 ? "grid-cols-1" : imageUrls.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {imageUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="w-full rounded-lg shadow-md object-cover max-h-64" />
          ))}
        </div>
      )}

      {/* Label + copy */}
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">{label}</h2>
        {"statCallout" in content && content.statCallout && (
          <p className="text-gray-500 text-base mb-2">{content.statCallout}</p>
        )}
        {content.copy && (
          <p className="text-gray-600 text-sm leading-relaxed">{content.copy}</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/case-study/case-study-cover.tsx src/components/case-study/case-study-section-visual.tsx
git commit -m "feat(case-study): Cover and visual section components"
```

---

## Task 12: Data Section Components

**Files:**
- Create: `src/components/case-study/case-study-section-data.tsx`

- [ ] **Step 1: Create data section component**

```tsx
// src/components/case-study/case-study-section-data.tsx
import type { SnsContent, SalesContent, PpcContent } from "@/lib/case-study/types";
import { SnsTimelineChart, SalesMonthlyChart, PpcLineChart } from "./case-study-charts";

// ─── Yellow panel tab ──────────────────────────────────────────────────
function PanelTab({ label }: { label: string }) {
  return (
    <div className="bg-[#E8A700] text-black font-bold text-sm px-5 py-2 rounded-t-xl inline-block">
      {label}
    </div>
  );
}

function DataPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <PanelTab label={label} />
      <div className="bg-white rounded-b-xl rounded-tr-xl shadow-lg p-5">{children}</div>
    </div>
  );
}

// ─── SnS section ───────────────────────────────────────────────────────
export function SnsSection({ content }: { content: SnsContent }) {
  return (
    <section className="bg-[#2d2f3e] py-16 px-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        {/* Left: copy */}
        <div>
          <p className="text-[#E8A700] text-4xl font-extrabold uppercase mb-1">Case Study</p>
          <p className="text-[#E8A700] text-2xl font-semibold mb-6">Subscribe &amp; Save (SNS)</p>
          <div className="w-12 border-t-2 border-white/30 mb-6" />
          {content.copy && <p className="text-white/80 text-sm leading-relaxed">{content.copy}</p>}
        </div>

        {/* Right: panels */}
        <div className="flex flex-col gap-6">
          <DataPanel label="Overview">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Total Subscriptions</p>
                <p className="text-2xl font-bold text-gray-900">{content.totalSubscriptions.toLocaleString()}</p>
              </div>
              {content.momGrowth !== null && (
                <div>
                  <p className="text-gray-500">MoM Growth</p>
                  <p className="text-2xl font-bold text-green-600">▲ {content.momGrowth.toFixed(2)}%</p>
                </div>
              )}
            </div>
          </DataPanel>
          <DataPanel label="Subscriptions Count">
            <SnsTimelineChart timeline={content.timeline} />
          </DataPanel>
        </div>
      </div>
    </section>
  );
}

// ─── Sales section ─────────────────────────────────────────────────────
export function SalesSection({ content }: { content: SalesContent }) {
  return (
    <section className="bg-[#2d2f3e] py-16 px-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-[#E8A700] text-4xl font-extrabold uppercase mb-1">Case Study</p>
          <p className="text-[#E8A700] text-2xl font-semibold mb-6">Sales</p>
          <div className="w-12 border-t-2 border-white/30 mb-6" />
          {content.copy && <p className="text-white/80 text-sm leading-relaxed mb-6">{content.copy}</p>}
          {content.statCallout && (
            <div className="border border-[#E8A700] rounded-lg p-4 flex items-start gap-3">
              <span className="text-[#E8A700] text-2xl">🎯</span>
              <p className="text-white text-sm leading-relaxed">{content.statCallout}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <DataPanel label="Lifetime Sale">
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <p className="text-gray-500">Total Revenue</p>
                <p className="text-xl font-bold">${content.lifetimeRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Orders</p>
                <p className="text-xl font-bold">{content.totalOrders.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Units Sold</p>
                <p className="text-xl font-bold">{content.totalUnits.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Avg. Order Value</p>
                <p className="text-xl font-bold">${content.avgOrderValue.toFixed(2)}</p>
              </div>
            </div>
          </DataPanel>
          <DataPanel label="Sales and Orders by month">
            <SalesMonthlyChart salesByMonth={content.salesByMonth} />
          </DataPanel>
        </div>
      </div>
    </section>
  );
}

// ─── PPC section ───────────────────────────────────────────────────────
function PpcStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-white text-xl font-bold">{value}</p>
      <p className="text-white/50 text-xs uppercase tracking-wide">{label}</p>
    </div>
  );
}

export function PpcSection({ content }: { content: PpcContent }) {
  const { lifetime, ytd } = content;
  return (
    <section className="bg-[#2d2f3e] py-16 px-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-[#E8A700] text-4xl font-extrabold uppercase mb-1">Case Study</p>
          <p className="text-[#E8A700] text-2xl font-semibold mb-6">PPC performance</p>
          <div className="w-12 border-t-2 border-white/30 mb-6" />
          {content.copy && <p className="text-white/80 text-sm leading-relaxed mb-6">{content.copy}</p>}
          {content.statCallout && (
            <div className="bg-[#E8A700] rounded-lg p-4">
              <p className="text-black font-bold text-sm">{content.statCallout}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <DataPanel label="Lifetime">
            <div className="grid grid-cols-4 gap-2 mb-3 bg-[#2d2f3e] rounded-lg p-3">
              <PpcStat label="Spend" value={`$${(lifetime.spend / 1000).toFixed(1)}k`} />
              <PpcStat label="Sales" value={`$${(lifetime.sales / 1000).toFixed(1)}k`} />
              <PpcStat label="ACOS" value={`${lifetime.acos.toFixed(2)}%`} />
              <PpcStat label="NTB" value={`$${(lifetime.ntb / 1000).toFixed(1)}k`} />
            </div>
            {lifetime.chart.length > 0 && <PpcLineChart chart={lifetime.chart} label="Lifetime" />}
          </DataPanel>
          <DataPanel label="Year to Date">
            <div className="grid grid-cols-4 gap-2 mb-3 bg-[#2d2f3e] rounded-lg p-3">
              <PpcStat label="Spend" value={`$${(ytd.spend / 1000).toFixed(1)}k`} />
              <PpcStat label="Sales" value={`$${(ytd.sales / 1000).toFixed(1)}k`} />
              <PpcStat label="ACOS" value={`${ytd.acos.toFixed(2)}%`} />
              <PpcStat label="NTB" value={`$${(ytd.ntb / 1000).toFixed(1)}k`} />
            </div>
            {ytd.chart.length > 0 && <PpcLineChart chart={ytd.chart} label="YTD" />}
          </DataPanel>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "section-data" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/case-study/case-study-section-data.tsx
git commit -m "feat(case-study): SnS, Sales, PPC data section components"
```

---

## Task 13: Case Study View (Shared)

**Files:**
- Create: `src/components/case-study/case-study-view.tsx`

- [ ] **Step 1: Create shared view component**

```tsx
// src/components/case-study/case-study-view.tsx
"use client";

import type { CaseStudyData, SectionType } from "@/lib/case-study/types";
import type { CoverContent, VisualSectionContent, StoreBtpContent, SnsContent, SalesContent, PpcContent } from "@/lib/case-study/types";
import { CaseStudyCover } from "./case-study-cover";
import { CaseStudySectionVisual } from "./case-study-section-visual";
import { SnsSection, SalesSection, PpcSection } from "./case-study-section-data";

interface Props {
  data: CaseStudyData;
}

const VISUAL_TYPES: SectionType[] = ["storefront", "brand_story", "product_listing", "aplus", "store_btp"];

export function CaseStudyView({ data }: Props) {
  return (
    <div data-case-study-ready className="bg-[#2d2f3e] min-h-screen">
      {data.sections.map((section) => {
        const { sectionType, content } = section;

        if (sectionType === "cover") {
          return (
            <CaseStudyCover
              key={section.id}
              clientName={data.clientName}
              content={content as CoverContent}
            />
          );
        }

        if (VISUAL_TYPES.includes(sectionType)) {
          return (
            <CaseStudySectionVisual
              key={section.id}
              sectionType={sectionType}
              content={content as VisualSectionContent | StoreBtpContent}
            />
          );
        }

        if (sectionType === "sns") {
          return <SnsSection key={section.id} content={content as SnsContent} />;
        }

        if (sectionType === "sales") {
          return <SalesSection key={section.id} content={content as SalesContent} />;
        }

        if (sectionType === "ppc") {
          return <PpcSection key={section.id} content={content as PpcContent} />;
        }

        return null;
      })}

      {/* End marker */}
      <div className="bg-[#2d2f3e] py-24 text-center">
        <p className="text-white text-4xl font-bold">end</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/case-study/case-study-view.tsx
git commit -m "feat(case-study): shared CaseStudyView renderer"
```

---

## Task 14: Modals (Generate + Edit)

**Files:**
- Create: `src/components/case-study/case-study-generate-modal.tsx`
- Create: `src/components/case-study/case-study-edit-modal.tsx`

- [ ] **Step 1: Create generate modal**

```tsx
// src/components/case-study/case-study-generate-modal.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SECTION_TYPES, SECTION_LABELS } from "@/lib/case-study/types";
import type { SectionType } from "@/lib/case-study/types";

interface Props {
  clientIdCode: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const DEFAULT_SECTIONS: SectionType[] = ["cover", "storefront", "brand_story", "product_listing", "aplus", "sales", "ppc"];

export function CaseStudyGenerateModal({ clientIdCode, clientName, open, onOpenChange, onCreated }: Props) {
  const [title, setTitle] = useState(`Amazon Case Study — ${clientName}`);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [selected, setSelected] = useState<SectionType[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (type: SectionType) => {
    setSelected((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleCreate = async () => {
    if (!dateStart || !dateEnd) { setError("Date range required"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/case-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, title, dateRangeStart: dateStart, dateRangeEnd: dateEnd, sectionsEnabled: selected }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? "Failed to generate");
        return;
      }
      onCreated();
      onOpenChange(false);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Case Study</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="cs-title">Title</Label>
            <Input id="cs-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cs-start">Date From</Label>
              <Input id="cs-start" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cs-end">Date To</Label>
              <Input id="cs-end" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Sections</Label>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected.includes(type)}
                    onCheckedChange={() => toggle(type)}
                  />
                  {SECTION_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create edit modal**

```tsx
// src/components/case-study/case-study-edit-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CaseStudySectionData, SectionType } from "@/lib/case-study/types";
import { SECTION_LABELS } from "@/lib/case-study/types";

interface Props {
  section: CaseStudySectionData | null;
  caseStudyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const TEXT_FIELDS: Partial<Record<SectionType, Array<{ key: string; label: string; multiline?: boolean }>>> = {
  cover: [
    { key: "tagline", label: "Tagline" },
    { key: "clientLogoUrl", label: "Client Logo URL" },
    { key: "heroImageUrls", label: "Hero Image URLs (one per line)", multiline: true },
  ],
  storefront: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "imageUrls", label: "Image URLs (one per line)", multiline: true },
  ],
  brand_story: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "imageUrls", label: "Image URLs (one per line)", multiline: true },
  ],
  product_listing: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "statCallout", label: "Stat Callout" },
    { key: "imageUrls", label: "Image URLs (one per line)", multiline: true },
  ],
  aplus: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "statCallout", label: "Stat Callout" },
    { key: "imageUrls", label: "Image URLs (one per line)", multiline: true },
  ],
  store_btp: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "imageUrls", label: "Image URLs (one per line)", multiline: true },
    { key: "visitors", label: "Store Visitors" },
    { key: "salesTotal", label: "Store Sales ($)" },
    { key: "orders", label: "Orders" },
    { key: "storeQuality", label: "Store Quality Rating" },
    { key: "promotionsActive", label: "Active Promotions" },
  ],
  sns: [{ key: "copy", label: "Copy", multiline: true }],
  sales: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "statCallout", label: "Stat Callout", multiline: true },
  ],
  ppc: [
    { key: "copy", label: "Copy", multiline: true },
    { key: "statCallout", label: "Stat Callout", multiline: true },
  ],
};

function contentToForm(content: Record<string, unknown>): Record<string, string> {
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(content)) {
    if (Array.isArray(v)) form[k] = v.join("\n");
    else if (v !== null && v !== undefined) form[k] = String(v);
  }
  return form;
}

function formToPayload(
  sectionType: SectionType,
  form: Record<string, string>
): Record<string, unknown> {
  const arrayKeys = new Set(["heroImageUrls", "imageUrls"]);
  const numberKeys = new Set(["visitors", "salesTotal", "orders", "promotionsActive"]);
  const payload: Record<string, unknown> = {};
  const fields = TEXT_FIELDS[sectionType] ?? [];
  for (const { key } of fields) {
    const val = form[key] ?? "";
    if (arrayKeys.has(key)) {
      payload[key] = val.split("\n").map((s) => s.trim()).filter(Boolean);
    } else if (numberKeys.has(key)) {
      payload[key] = val ? Number(val) : undefined;
    } else {
      payload[key] = val;
    }
  }
  return payload;
}

export function CaseStudyEditModal({ section, caseStudyId, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (section) setForm(contentToForm(section.content as Record<string, unknown>));
  }, [section]);

  if (!section) return null;

  const fields = TEXT_FIELDS[section.sectionType] ?? [];

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = formToPayload(section.sectionType, form);
      const res = await fetch(`/api/case-studies/${caseStudyId}/sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setError("Failed to save"); return; }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit — {SECTION_LABELS[section.sectionType]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fields.map(({ key, label, multiline }) => (
            <div key={key}>
              <Label htmlFor={`edit-${key}`}>{label}</Label>
              {multiline ? (
                <Textarea
                  id={`edit-${key}`}
                  rows={4}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`edit-${key}`}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/case-study/case-study-generate-modal.tsx src/components/case-study/case-study-edit-modal.tsx
git commit -m "feat(case-study): generate and edit modals"
```

---

## Task 15: Admin Page + Layout Tab

**Files:**
- Create: `src/app/clients/[clientIdCode]/case-study/page.tsx`
- Create: `src/app/clients/[clientIdCode]/case-study/page-meta.tsx`
- Modify: `src/app/clients/[clientIdCode]/layout.tsx`

- [ ] **Step 1: Read layout.tsx before editing**

```bash
cat /Users/manu/1o8Hub/src/app/clients/\[clientIdCode\]/layout.tsx
```

- [ ] **Step 2: Add Case Study tab to TABS array in layout.tsx**

In `src/app/clients/[clientIdCode]/layout.tsx`, add to the `TABS` array:

```typescript
  { label: "Case Study", href: "/case-study" },
```

Also add `case-study` to the hideTabs condition:

```typescript
  const hideTabs = pathname.startsWith(`${base}/onboarding`) || pathname.startsWith(`${base}/timeline`);
```

No change needed here — case study has its own tab so tabs should NOT be hidden for it.

- [ ] **Step 3: Create page-meta**

```tsx
// src/app/clients/[clientIdCode]/case-study/page-meta.tsx
"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";

export function CaseStudyMeta() {
  return <PageMetaSlot><span className="text-sm font-medium">Case Study</span></PageMetaSlot>;
}
```

- [ ] **Step 4: Create admin page**

```tsx
// src/app/clients/[clientIdCode]/case-study/page.tsx
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, RefreshCw, Download, Globe, EyeOff, Trash2 } from "lucide-react";
import { CaseStudyView } from "@/components/case-study/case-study-view";
import { CaseStudyGenerateModal } from "@/components/case-study/case-study-generate-modal";
import { CaseStudyEditModal } from "@/components/case-study/case-study-edit-modal";
import type { CaseStudyData, CaseStudySectionData } from "@/lib/case-study/types";
import { VISUAL_SECTIONS } from "@/lib/case-study/types";

export default function CaseStudyPage() {
  const { clientIdCode } = useParams<{ clientIdCode: string }>();
  const searchParams = useSearchParams();
  const isPrint = searchParams.get("print") === "1";

  const [data, setData] = useState<CaseStudyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editSection, setEditSection] = useState<CaseStudySectionData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Find case study by clientIdCode via list endpoint
      const res = await fetch(`/api/case-studies?clientIdCode=${clientIdCode}`);
      if (res.ok) {
        const json = await res.json() as { id: string } | null;
        if (json?.id) {
          const detail = await fetch(`/api/case-studies/${json.id}`);
          if (detail.ok) setData(await detail.json());
          else setData(null);
        } else {
          setData(null);
        }
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [clientIdCode]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    if (!data) return;
    setRefreshing(true);
    await fetch(`/api/case-studies/${data.id}/refresh`, { method: "POST" });
    await load();
    setRefreshing(false);
  };

  const handlePublishToggle = async () => {
    if (!data) return;
    const newStatus = data.status === "published" ? "draft" : "published";
    await fetch(`/api/case-studies/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  };

  const handleDelete = async () => {
    if (!data || !confirm("Delete this case study?")) return;
    await fetch(`/api/case-studies/${data.id}`, { method: "DELETE" });
    setData(null);
  };

  if (isPrint && data) return <CaseStudyView data={data} />;

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;

  if (!data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <p className="text-muted-foreground">No case study yet for this client.</p>
        <Button onClick={() => setGenerateOpen(true)}>Generate Case Study</Button>
        <CaseStudyGenerateModal
          clientIdCode={clientIdCode}
          clientName={clientIdCode}
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          onCreated={load}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Admin toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{data.title}</span>
          <Badge variant={data.status === "published" ? "default" : "secondary"}>
            {data.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {data.dateRangeStart} → {data.dateRangeEnd}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/case-studies/${data.id}/pdf`} download>
              <Download className="w-4 h-4 mr-1" /> Export PDF
            </a>
          </Button>
          <Button size="sm" variant={data.status === "published" ? "outline" : "default"} onClick={handlePublishToggle}>
            {data.status === "published" ? (
              <><EyeOff className="w-4 h-4 mr-1" /> Unpublish</>
            ) : (
              <><Globe className="w-4 h-4 mr-1" /> Publish</>
            )}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Edit buttons overlaid on visual sections */}
      <div className="relative">
        <CaseStudyView data={data} />
        {/* Edit overlays on visual sections */}
        <div className="absolute top-0 left-0 w-full pointer-events-none">
          {data.sections
            .filter((s) => VISUAL_SECTIONS.includes(s.sectionType))
            .map((s) => (
              <div key={s.id} className="pointer-events-auto absolute" style={{ top: `${s.sortOrder * 480}px`, right: "16px" }}>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shadow-lg"
                  onClick={() => setEditSection(s)}
                >
                  <Pencil className="w-3 h-3 mr-1" /> Edit
                </Button>
              </div>
            ))}
        </div>
      </div>

      <CaseStudyEditModal
        section={editSection}
        caseStudyId={data.id}
        open={!!editSection}
        onOpenChange={(open) => { if (!open) setEditSection(null); }}
        onSaved={load}
      />
    </div>
  );
}
```

> **Note on edit button positioning:** The absolute positioning above is a rough approximation. A better pattern is to wrap each section in a relative container and show an edit button on hover. Revisit if the overlay feels wrong after testing.

- [ ] **Step 5: Add list endpoint to GET /api/case-studies**

The admin page fetches `/api/case-studies?clientIdCode=X` to find the case study ID. Add a GET handler to `src/app/api/case-studies/route.ts`:

```typescript
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) return NextResponse.json(null);

  const [cs] = await db
    .select({ id: caseStudies.id })
    .from(caseStudies)
    .where(eq(caseStudies.clientIdCode, clientIdCode))
    .limit(1);

  return NextResponse.json(cs ?? null);
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no new TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/clients/\[clientIdCode\]/case-study/page.tsx \
        src/app/clients/\[clientIdCode\]/case-study/page-meta.tsx \
        src/app/clients/\[clientIdCode\]/layout.tsx \
        src/app/api/case-studies/route.ts
git commit -m "feat(case-study): admin page + layout tab + GET list endpoint"
```

---

## Task 16: Portal Page

**Files:**
- Create: `src/app/portal/case-study/page.tsx`

- [ ] **Step 1: Create portal page**

```tsx
// src/app/portal/case-study/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import type { CaseStudyData } from "@/lib/case-study/types";
import { CaseStudyView } from "@/components/case-study/case-study-view";

export default function PortalCaseStudyPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<CaseStudyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    const clientIdCode = session.user.clientIdCode;
    if (!clientIdCode) { setLoading(false); setNotFound(true); return; }

    fetch(`/api/case-studies?clientIdCode=${clientIdCode}`)
      .then((r) => r.json())
      .then(async (cs: { id: string } | null) => {
        if (!cs?.id) { setNotFound(true); return; }
        const detail = await fetch(`/api/case-studies/${cs.id}`);
        if (!detail.ok) { setNotFound(true); return; }
        const json = await detail.json() as CaseStudyData;
        if (json.status !== "published") { setNotFound(true); return; }
        setData(json);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [session, status]);

  if (status === "loading" || loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  if (notFound || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No case study available yet.
      </div>
    );
  }

  return <CaseStudyView data={data} />;
}
```

- [ ] **Step 2: Update portal GET route to allow portal (client-role) users**

In `src/app/api/case-studies/[id]/route.ts`, the GET handler currently checks only for a session. Clients with `role === "client"` can also hit this endpoint but must only see published case studies matching their own `clientIdCode`. Add this check after the auth check:

```typescript
  // Client-role users can only see their own published case study
  if (session.user.role === "client") {
    if (cs.clientIdCode !== session.user.clientIdCode) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (cs.status !== "published") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
```

Insert this block AFTER the `if (!cs)` check and BEFORE building the response.

- [ ] **Step 3: Verify full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: builds clean.

- [ ] **Step 4: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass rate as baseline (9 pre-existing failures, all others pass).

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/case-study/page.tsx src/app/api/case-studies/[id]/route.ts
git commit -m "feat(case-study): portal read-only page with published-only gate"
```

---

## Manual Smoke Test (after all tasks complete)

1. Start dev server: `PORT=3000 npm run dev`
2. Navigate to any client → click **Case Study** tab
3. Click **Generate Case Study** → set date range → select sections → Generate
4. Verify the dark/gold page renders with empty visual sections and (if client has Intentwise/PPC data) populated data sections
5. Click **Edit** on a visual section → add copy + image URLs → Save → confirm the section updates
6. Click **Refresh Data** → confirm it re-runs without error
7. Click **Export PDF** → confirm a PDF downloads
8. Click **Publish** → log in as a client-role user → navigate to `/portal/case-study` → confirm the case study is visible and read-only
9. Click **Unpublish** → confirm `/portal/case-study` returns "No case study available"

---

## Notes for Implementer

- **`store_btp` data source:** Amazon Stores Insights data is not yet in Redshift. `store_btp` is a manual section — admin enters copy, image URLs, and stats manually via the Edit modal.
- **Edit button overlay:** The pixel-based absolute positioning in the admin page is approximate. Test visually and adjust as needed; consider switching to per-section hover overlays if it looks wrong.
- **`session.user.clientIdCode`:** Ensure the NextAuth session type includes `clientIdCode` on the user object. If TypeScript complains, add it to the session type in `src/lib/auth.ts` (or wherever the type is augmented).
- **`npm run db:push`:** Confirm the schema push with the team — this hits the production Supabase instance.
