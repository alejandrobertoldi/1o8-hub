# Prospect Demo Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let prospect-role portal users preview every section populated with illustrative "Zingora" sample data, rendered by the real portal components.

**Architecture:** Each showcase endpoint short-circuits to a baked-in fixture when `session.user.role === "prospect"`, inserted right after auth and before client resolution. The existing react-query section components render the fixture unchanged. The portal landing shows all 7 cards (bypassing `allowed_sections`) pointing at showcase routes, and a "Sample data" badge mounts once in the portal layout.

**Tech Stack:** Next.js 16 App Router, React 19, react-query, TypeScript, Drizzle (untouched here), Vitest.

## Global Constraints

- Dev server: `PORT=3000 npm run dev`. DEV DB = PROD Supabase — **no DB writes, no seeded rows**.
- Verify RENDER on localhost:3000, not just `npm run build`.
- Demo brand name is **Zingora** everywhere. Demo client code: `ZNG_SC_US` (synthetic, must not match a real client).
- Portal accent gold is `#E8A700` for hub, blue `#2563EB` for portal — do not introduce new accent colors.
- Guard test is exactly `session.user.role === "prospect"` (never affects admin/client/editor/viewer callers).
- Sample numbers kept plausible-but-modest (no over-promising).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Stage only the explicit files listed per task. Never `git add .` (tree is parallel-session polluted). Never push (Vercel auto-deploys) without separate OK.

---

### Task 1: Demo fixtures module

**Files:**
- Create: `src/lib/portal-demo.ts`
- Test: `src/lib/portal-demo.test.ts`

**Interfaces:**
- Produces: `export const PORTAL_DEMO` with slices `.timeline`, `.seo`, `.products`, `.design`, `.finance`, `.salesSummary`, `.salesDaily`. Shapes match each route's real response (verified against routes 2026-06-19). Later tasks import the matching slice.
- Note: `salesSummary.clients[0].accountIds` MUST be a non-empty array so the overview component fires the daily fetch (which Task 5 guards).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal-demo.test.ts
import { describe, it, expect } from "vitest";
import { PORTAL_DEMO } from "./portal-demo";

describe("PORTAL_DEMO fixtures", () => {
  it("timeline is enabled + initialized with tasks and sections", () => {
    expect(PORTAL_DEMO.timeline.enabled).toBe(true);
    expect(PORTAL_DEMO.timeline.initialized).toBe(true);
    expect(PORTAL_DEMO.timeline.tasks.length).toBeGreaterThan(0);
    expect(PORTAL_DEMO.timeline.sections.length).toBeGreaterThan(0);
  });
  it("seo is a non-empty array of projects with phase fields", () => {
    expect(Array.isArray(PORTAL_DEMO.seo)).toBe(true);
    expect(PORTAL_DEMO.seo[0]).toHaveProperty("current_phase");
  });
  it("products has products[] and total", () => {
    expect(PORTAL_DEMO.products.total).toBe(PORTAL_DEMO.products.products.length);
    expect(PORTAL_DEMO.products.products[0]).toHaveProperty("asin");
  });
  it("design has categories and image arrays", () => {
    expect(PORTAL_DEMO.design.clientName).toBe("Zingora");
    expect(PORTAL_DEMO.design.categories.length).toBeGreaterThan(0);
    expect(Array.isArray(PORTAL_DEMO.design.aplusThumbs)).toBe(true);
  });
  it("finance statement has netProceeds and availablePeriods", () => {
    expect(PORTAL_DEMO.finance.statement).toHaveProperty("netProceeds");
    expect(PORTAL_DEMO.finance.availablePeriods.length).toBeGreaterThan(0);
  });
  it("salesSummary has one client with non-empty accountIds (so daily fetch fires)", () => {
    expect(PORTAL_DEMO.salesSummary.clients.length).toBe(1);
    expect(PORTAL_DEMO.salesSummary.clients[0].accountIds.length).toBeGreaterThan(0);
  });
  it("salesDaily has a days[] array", () => {
    expect(PORTAL_DEMO.salesDaily.days.length).toBeGreaterThan(0);
    expect(PORTAL_DEMO.salesDaily.days[0]).toHaveProperty("report_date");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/portal-demo.test.ts`
Expected: FAIL — cannot find module `./portal-demo`.

- [ ] **Step 3: Create the fixtures module**

```ts
// src/lib/portal-demo.ts
// Illustrative sample data for prospect-role portal preview. Brand: Zingora.
// Shapes mirror each /api route's real success response (verified 2026-06-19).
// No real client data — all values synthetic and intentionally modest.

const DEMO_CLIENT = "ZNG_SC_US";

// ── Sales metric builders (keep the big shapes DRY) ──────────────
type Metrics = {
  ad_impressions: number; ad_clicks: number; ad_spend: number; ad_revenue: number;
  ad_orders: number; product_sales: number; product_quantity: number;
  shipped_units: number; shipped_revenue: number; ordered_units: number;
  ordered_revenue: number; total_order_items: number; mobile_app_sessions: number;
  browser_session: number; glance_view_byasin: number; ntb_orders: number;
  ntb_revenue: number; ntb_ordered_units: number; former_active_sns_subscriptions: number;
  new_active_sns_subscriptions: number; new_sns_subscriptions_revenue: number;
};

function mkMetrics(scale: number): Metrics {
  return {
    ad_impressions: Math.round(120000 * scale),
    ad_clicks: Math.round(2400 * scale),
    ad_spend: Math.round(3800 * scale),
    ad_revenue: Math.round(15200 * scale),
    ad_orders: Math.round(420 * scale),
    product_sales: Math.round(48000 * scale),
    product_quantity: Math.round(1350 * scale),
    shipped_units: Math.round(1310 * scale),
    shipped_revenue: Math.round(46500 * scale),
    ordered_units: Math.round(1350 * scale),
    ordered_revenue: Math.round(48000 * scale),
    total_order_items: Math.round(1290 * scale),
    mobile_app_sessions: Math.round(8600 * scale),
    browser_session: Math.round(5400 * scale),
    glance_view_byasin: Math.round(20500 * scale),
    ntb_orders: Math.round(310 * scale),
    ntb_revenue: Math.round(11800 * scale),
    ntb_ordered_units: Math.round(330 * scale),
    former_active_sns_subscriptions: Math.round(40 * scale),
    new_active_sns_subscriptions: Math.round(95 * scale),
    new_sns_subscriptions_revenue: Math.round(2600 * scale),
  };
}

type Computed = {
  acos: number | null; roas: number | null; tacos: number | null; ctr: number | null;
  totalSessions: number; pctOrgRevenue: number | null; pctPpcRevenue: number | null;
  unitSessionPct: number | null;
};

function mkComputed(): Computed {
  return {
    acos: 25, roas: 4, tacos: 7.9, ctr: 2,
    totalSessions: 14000, pctOrgRevenue: 68.4, pctPpcRevenue: 31.6, unitSessionPct: 9.6,
  };
}

// 7 most recent days, descending scale so the chart shows variation.
function mkDailyDays() {
  const dates = [
    "2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15",
    "2026-06-16", "2026-06-17", "2026-06-18",
  ];
  const scales = [0.9, 1.05, 0.95, 1.1, 1.0, 1.15, 1.2];
  return dates.map((report_date, i) => {
    const m = mkMetrics(scales[i] / 7); // per-day portion of the 7D total
    return {
      report_date,
      ad_impressions: m.ad_impressions, ad_clicks: m.ad_clicks, ad_spend: m.ad_spend,
      ad_revenue: m.ad_revenue, ad_orders: m.ad_orders, product_sales: m.product_sales,
      product_quantity: m.product_quantity, shipped_units: m.shipped_units,
      shipped_revenue: m.shipped_revenue, ordered_units: m.ordered_units,
      ordered_revenue: m.ordered_revenue, total_order_items: m.total_order_items,
      mobile_app_sessions: m.mobile_app_sessions, browser_session: m.browser_session,
      glance_view_byasin: m.glance_view_byasin, ntb_orders: m.ntb_orders,
      ntb_revenue: m.ntb_revenue, ntb_ordered_units: m.ntb_ordered_units,
      new_active_sns_subscriptions: m.new_active_sns_subscriptions,
      new_sns_subscriptions_revenue: m.new_sns_subscriptions_revenue,
    };
  });
}

export const PORTAL_DEMO = {
  // ── /api/portal/timeline ───────────────────────────────────────
  timeline: {
    enabled: true as const,
    initialized: true as const,
    onboardingDate: "2026-04-01",
    tasks: [
      { section: "Onboarding", taskName: "Kickoff & account access", startDay: 0, durationDays: 5, completionPct: 100, status: "completed", assignedTo: "Account Manager" },
      { section: "Onboarding", taskName: "Brand audit", startDay: 3, durationDays: 7, completionPct: 100, status: "completed", assignedTo: "Strategist" },
      { section: "Content", taskName: "SEO keyword research", startDay: 10, durationDays: 8, completionPct: 100, status: "completed", assignedTo: "SEO Lead" },
      { section: "Content", taskName: "A+ content design", startDay: 16, durationDays: 12, completionPct: 60, status: "in_progress", assignedTo: "Designer" },
      { section: "Advertising", taskName: "PPC campaign launch", startDay: 20, durationDays: 10, completionPct: 30, status: "in_progress", assignedTo: "PPC Manager" },
      { section: "Advertising", taskName: "Bid optimization", startDay: 30, durationDays: 14, completionPct: 0, status: "pending", assignedTo: "PPC Manager" },
    ],
    sections: [
      { section: "Onboarding", minDay: 0, maxDay: 10, avgPct: 100, completedCount: 2, totalCount: 2 },
      { section: "Content", minDay: 10, maxDay: 28, avgPct: 80, completedCount: 1, totalCount: 2 },
      { section: "Advertising", minDay: 20, maxDay: 44, avgPct: 15, completedCount: 0, totalCount: 2 },
    ],
  },

  // ── /api/portal/seo (returns the array directly) ───────────────
  seo: [
    {
      id: "demo-seo-1", name: "Zingora Hydration Bottle", brand_name: "Zingora",
      status: "active", current_phase: "S4", created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z", assignee_name: "SEO Lead", assignee_image: null,
      asin_count: 6,
      s1_approved_at: "2026-04-20T00:00:00.000Z", s2_approved_at: "2026-05-02T00:00:00.000Z",
      s3_approved_at: "2026-05-18T00:00:00.000Z", s4_approved_at: null,
      s5_approved_at: null, s6_approved_at: null,
    },
    {
      id: "demo-seo-2", name: "Zingora Travel Tumbler", brand_name: "Zingora",
      status: "active", current_phase: "S2", created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z", assignee_name: "SEO Lead", assignee_image: null,
      asin_count: 3,
      s1_approved_at: "2026-05-22T00:00:00.000Z", s2_approved_at: null,
      s3_approved_at: null, s4_approved_at: null, s5_approved_at: null, s6_approved_at: null,
    },
  ],

  // ── /api/portal/products ───────────────────────────────────────
  products: {
    total: 4,
    products: [
      { id: "demo-p1", asin: "B0ZNG00001", sku: "ZNG-BOTTLE-BLK", status: "Active", itemName: "Zingora Insulated Water Bottle 32oz — Matte Black", summarizedTitle: "Zingora Insulated Water Bottle 32oz — Matte Black", variationId: "zng-bottle", variationGroup: "Bottles", variations: { VariationThemeName: "Color", Color: "Matte Black" }, parentageLevel: "child", parentAsin: "B0ZNG0000P", mainImageUrl: null, listPrice: "29.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p2", asin: "B0ZNG00002", sku: "ZNG-BOTTLE-TEAL", status: "Active", itemName: "Zingora Insulated Water Bottle 32oz — Teal", summarizedTitle: "Zingora Insulated Water Bottle 32oz — Teal", variationId: "zng-bottle", variationGroup: "Bottles", variations: { VariationThemeName: "Color", Color: "Teal" }, parentageLevel: "child", parentAsin: "B0ZNG0000P", mainImageUrl: null, listPrice: "29.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p3", asin: "B0ZNG00010", sku: "ZNG-TUMBLER-20", status: "Active", itemName: "Zingora Travel Tumbler 20oz — Stainless", summarizedTitle: "Zingora Travel Tumbler 20oz — Stainless", variationId: null, variationGroup: "Tumblers", variations: null, parentageLevel: "standalone", parentAsin: null, mainImageUrl: null, listPrice: "24.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p4", asin: "B0ZNG00020", sku: "ZNG-GIFTSET", status: "Active", itemName: "Zingora Hydration Gift Set (Bottle + Tumbler)", summarizedTitle: "Zingora Hydration Gift Set", variationId: null, variationGroup: "Bundles", variations: null, parentageLevel: "standalone", parentAsin: null, mainImageUrl: null, listPrice: "49.99", varietyPackItemCount: 2, vpFlavors: null, isVp: true, isPortalSubmission: false },
    ],
  },

  // ── /api/portal/design ─────────────────────────────────────────
  // Images intentionally empty (Drive-served, can't be faked). Category
  // statuses carry the demo. Add demo imagery later via /public if desired.
  design: {
    clientIdCode: DEMO_CLIENT,
    clientName: "Zingora",
    categories: [
      { category: "Brand Story", status: "Approved" },
      { category: "A+ Content", status: "In Progress", aplusTotal: 7, aplusApproved: 4 },
      { category: "Listing Images", status: "In Review" },
      { category: "Storefront", status: "Not Started" },
    ],
    brandStoryScreenviewUrl: null,
    aplusThumbs: [] as string[],
    listingImages: [] as Array<{ url: string; slot: string; productId: string; asin: string | null; title: string | null; variationName: string | null }>,
  },

  // ── /api/portal/finance?view=statement (default) ───────────────
  finance: {
    client: DEMO_CLIENT,
    clientName: "Zingora",
    statement: {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      netProceeds: 28640,
      beginningBalance: 0,
      sales: 52000,
      refunds: -1800,
      expenses: -20760,
      accountLevelReserve: -1000,
      fundTransfer: -28640,
      refundedSales: -1800,
      refundedExpenses: 320,
      advertisingFee: 0 as const,
      reserveDebit: -1000,
      reserveCredit: 0 as const,
      breakdown: { Sales: 52000, Refunds: -1800, Expenses: -20760, AccountLevelReserve: -1000, BeginningBalance: 0, FundTransfer: -28640 },
      itemDetail: { "FBA Fulfillment Fee": -7200, "Referral Fee": -7800, "Advertising": -3800, "Storage Fee": -960, "Other": -1000 },
    },
    budgetPacing: {
      budget: 4500, mtdSpend: 2960, projectedSpend: 4380, pacePercent: 97,
      dayOfMonth: 19, daysInMonth: 30, status: "on-track" as const,
    },
    availablePeriods: [
      { start: "2026-05-01", end: "2026-05-31", open: false },
      { start: "2026-04-01", end: "2026-04-30", open: false },
      { start: "2026-03-01", end: "2026-03-31", open: false },
    ],
  },

  // ── /api/sales-summary?period=7D ───────────────────────────────
  salesSummary: {
    period: "7D",
    start: "2026-06-12", end: "2026-06-18",
    prevStart: "2026-06-05", prevEnd: "2026-06-11",
    yoyStart: "2025-06-12", yoyEnd: "2025-06-18",
    mtdStart: "2026-06-01", mtdEnd: "2026-06-18",
    ytdStart: "2026-01-01", ytdEnd: "2026-06-18",
    latestDataDate: "2026-06-18",
    lastRefreshedAt: "2026-06-19T06:00:00.000Z",
    clients: [
      {
        clientIdCode: DEMO_CLIENT, clientName: "Zingora", brandName: "Zingora",
        tier: "Growth", marketplace: "US", ppcManager: "PPC Manager", accountManager: "Account Manager",
        accountIds: ["ZNG-ACCT-US"],
        goals: { acosGoal: 22, roasGoal: 4.5, tacosGoal: 7, adSpendBudget: 4500, salesForecast: 55000, orgRevGoal: 60000 },
        current: mkMetrics(1), previous: mkMetrics(0.92), yoy: mkMetrics(0.78),
        mtd: mkMetrics(2.6), ytd: mkMetrics(26),
        computed: mkComputed(), prevComputed: mkComputed(), yoyComputed: mkComputed(),
        mtdComputed: mkComputed(), ytdComputed: mkComputed(),
      },
    ],
  },

  // ── /api/sales-summary/daily ───────────────────────────────────
  salesDaily: { days: mkDailyDays() },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/portal-demo.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-demo.ts src/lib/portal-demo.test.ts
git commit -m "feat(portal): Zingora demo fixtures for prospect preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prospect guards on single-shape portal endpoints

Insert one guard per route, immediately AFTER session auth and BEFORE client resolution. Each guard returns the matching `PORTAL_DEMO` slice. Verified insertion points below (2026-06-19).

**Files:**
- Modify: `src/app/api/portal/timeline/route.ts` (after line 17, before `resolvePortalClient` use)
- Modify: `src/app/api/portal/seo/route.ts` (after line 14)
- Modify: `src/app/api/portal/products/route.ts` (after line 13, before client use at line 35)
- Modify: `src/app/api/portal/design/route.ts` (after line 45, before client use at line 60)
- Modify: `src/app/api/portal/finance/route.ts` (after line 105, before view-specific queries)

**Interfaces:**
- Consumes: `PORTAL_DEMO` from `src/lib/portal-demo.ts` (Task 1).

- [ ] **Step 1: Add import + guard to each route**

In every file above, add at the top of the imports:
```ts
import { PORTAL_DEMO } from "@/lib/portal-demo";
```

Then insert the guard at the verified point. The guard reads the role from the already-resolved session. Use the session variable name each route already has (`session`):

`timeline/route.ts` — after `clientIdCode` is resolved (line ~17), insert BEFORE the `aac` lookup. Move the guard ABOVE `resolvePortalClient` so prospects never resolve a client:
```ts
// after: const session = await getAuthSession(); if (!session) return unauthorized();
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.timeline);
```

`seo/route.ts` — directly after the `getAuthSession()` + null check (line ~9-11), before `resolvePortalClient`:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.seo);
```

`products/route.ts` — after the auth check (line ~13), before `clientCode` is used:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.products);
```

`design/route.ts` — after the auth check (line ~45), before `clientCode` resolution at line 51:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.design);
```

`finance/route.ts` — after the auth check (line ~91-94), before `resolveClient` at line 102:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.finance);
```

NOTE: place each guard so it runs for ANY query params (ignore `view`, search, pagination) — prospects always get the one fixture. If a route reads the session under a different variable name, match it; if it uses `auth()` instead of `getAuthSession`, read the role off whatever session object exists.

- [ ] **Step 2: Verify build**

Run: `PORT=3000 npm run build`
Expected: build succeeds (no type errors — fixtures match response shapes).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/timeline/route.ts src/app/api/portal/seo/route.ts src/app/api/portal/products/route.ts src/app/api/portal/design/route.ts src/app/api/portal/finance/route.ts
git commit -m "feat(portal): prospect demo guards on portal section endpoints

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Prospect guards on sales endpoints

The Sales overview screen fetches `/api/sales-summary` then `/api/sales-summary/daily` (using `accountIds` from the summary response). Both need a guard.

**Files:**
- Modify: `src/app/api/sales-summary/route.ts` (after auth at line ~227-230, before period/client resolution)
- Modify: `src/app/api/sales-summary/daily/route.ts` (after auth at line ~22-25, before accountIds resolution)

**Interfaces:**
- Consumes: `PORTAL_DEMO.salesSummary`, `PORTAL_DEMO.salesDaily` (Task 1).
- Dependency: `salesSummary.clients[0].accountIds` is non-empty, so the overview component issues the daily fetch, which this task's second guard answers.

- [ ] **Step 1: Add import + guard to each route**

Add `import { PORTAL_DEMO } from "@/lib/portal-demo";` to both files.

`sales-summary/route.ts` — after `session = await getAuthSession();` and its null/role check (line ~227-230), before the `period` is read:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.salesSummary);
```

`sales-summary/daily/route.ts` — after `const session = await getAuthSession();` and its check (line ~22-25), before `start`/`accountIds` resolution:
```ts
if (session.user?.role === "prospect") return NextResponse.json(PORTAL_DEMO.salesDaily);
```

NOTE: these routes are shared with the hub; the `role === "prospect"` test guarantees admin/editor/viewer/client callers are unaffected.

- [ ] **Step 2: Verify build**

Run: `PORT=3000 npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sales-summary/route.ts src/app/api/sales-summary/daily/route.ts
git commit -m "feat(portal): prospect demo guards on sales-summary endpoints

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Landing shows all 7 cards for prospects + showcase hrefs

For `isProspect`, render all section cards enabled and route each to its showcase screen (skipping the `allowed_sections`-gated sub-landings).

**Files:**
- Modify: `src/app/portal/page.tsx` (the `SECTION_CARDS` const and the `cardsWithState`/`visibleCards`/`href` logic in `ClientDashboard`, ~lines 60-205 and the card render ~276-345)

**Interfaces:**
- Consumes: existing `isProspect` boolean (line 163), existing `SECTION_CARDS`.

- [ ] **Step 1: Add a per-card prospect showcase href map**

Just below the `SECTION_CARDS` const (after line ~130), add:
```ts
// For prospects, each card links straight to its showcase screen (skipping
// allowed_sections-gated sub-landings). Keys match SECTION_CARDS ids.
const PROSPECT_SHOWCASE_HREF: Record<string, string> = {
  timeline: "/portal/timeline",
  sales: "/portal/sales/overview",
  products: "/portal/products",
  seo: "/portal/seo",
  design: "/portal/design",
  reports: "/portal/reports2",
  finances: "/portal/finance/reports",
};
```

- [ ] **Step 2: For prospects, enable all cards and use showcase hrefs**

In `ClientDashboard`, change `cardsWithState` so prospects get every card enabled, and the rendered `<Link href>` uses the showcase map for prospects.

Replace the `cardsWithState` / `visibleCards` block (~lines 195-205) with:
```ts
const cardsWithState = SECTION_CARDS.map((card) => ({
  card,
  enabled:
    isProspect ||
    card.permission === null ||
    canAccess(card.permission, effectiveAllowedSections, false),
}));
const visibleCards =
  isAdminPreview || isProspect
    ? cardsWithState
    : cardsWithState.filter((c) => c.enabled);
```

In the card render, where `href={`${card.href}${clientParam}`}` is built (~line 314), use the showcase href for prospects:
```ts
const targetHref = isProspect
  ? (PROSPECT_SHOWCASE_HREF[card.id] ?? card.href)
  : `${card.href}${clientParam}`;
```
…and use `targetHref` in the `<Link href={targetHref}>`.

- [ ] **Step 3: Verify build**

Run: `PORT=3000 npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "feat(portal): show all showcase cards to prospects on landing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: "Sample data" badge across all prospect screens

**Files:**
- Create: `src/components/portal/prospect-sample-badge.tsx`
- Modify: `src/app/portal/layout.tsx` (mount the badge)

**Interfaces:**
- Produces: default-exported `<ProspectSampleBadge />` client component; renders a fixed pill only when `useSession().data?.user?.role === "prospect"`, else null.

- [ ] **Step 1: Create the badge component**

```tsx
// src/components/portal/prospect-sample-badge.tsx
"use client";

import { useSession } from "next-auth/react";
import { FlaskConical } from "lucide-react";

export default function ProspectSampleBadge() {
  const { data: session } = useSession();
  if (session?.user?.role !== "prospect") return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-portal-accent/30 bg-portal-accent/10 px-3 py-1.5 text-xs font-medium text-portal-accent shadow-sm backdrop-blur-sm"
      role="status"
      aria-label="Sample data"
    >
      <FlaskConical className="size-3.5" />
      Sample data
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the portal layout**

In `src/app/portal/layout.tsx`, import and render the badge alongside `<AdminPreviewToggle />`:
```tsx
import ProspectSampleBadge from "@/components/portal/prospect-sample-badge";
// ...
return (
  <>
    <AdminPreviewToggle />
    <ProspectSampleBadge />
    {children}
  </>
);
```

- [ ] **Step 3: Verify build**

Run: `PORT=3000 npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/prospect-sample-badge.tsx src/app/portal/layout.tsx
git commit -m "feat(portal): Sample data badge on prospect screens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Live-render verification (prospect)

Build alone is insufficient (project rule: verify render). Confirm a real prospect sees sample data on every showcase screen.

**Files:** none (verification only).

- [ ] **Step 1: Identify or create a prospect login for QA**

Find an existing `role = "prospect"` user (query the `users` table read-only) OR ask the user which prospect account to log in as. Do NOT create or mutate users.

- [ ] **Step 2: Run dev server and authenticate the browser**

Run: `PORT=3000 npm run dev` (background). Then, per the project's authed-browse pattern, goto `http://localhost:3000/portal` FIRST, import cookies for `localhost`, reload — all in one step.

- [ ] **Step 3: Verify each showcase screen renders Zingora sample data + badge**

Visit as the prospect and confirm sample data renders (not an empty/"being set up" state) and the "Sample data" pill is visible on each:
- `http://localhost:3000/portal` — all 7 cards visible + enabled
- `/portal/timeline` — Zingora Gantt tasks/sections
- `/portal/sales/overview` — KPIs + 7-day chart populated
- `/portal/products` — 4 Zingora products in the table
- `/portal/seo` — 2 Zingora SEO projects with phase progress
- `/portal/design` — category status badges (images empty is expected)
- `/portal/reports2` — Business Model Audit card present (pre-existing)
- `/portal/finance/reports` — May 2026 statement numbers + budget pacing

Expected: every screen shows sample data; no console errors; badge present. If any screen errors or shows empty, the fixture shape diverged from the route — fix the fixture in `src/lib/portal-demo.ts` and re-verify (do not edit the section components).

- [ ] **Step 4: Report results**

Summarize per-screen PASS/FAIL with what rendered. No commit (verification task). If fixes were needed in Step 3, they belong to Task 1's file — commit them with message `fix(portal): correct <section> demo fixture shape`.

---

## Self-Review

**Spec coverage:**
- API short-circuit mechanism → Tasks 2, 3. ✓
- Fixtures module (Zingora) → Task 1. ✓
- 7 showcase screens → Tasks 2/3 (data) + Task 4 (routing); Reports reuses existing audit (no new work) ✓; Finance corrected to `/portal/finance/reports` (the landing fetches nothing) ✓.
- Landing all-cards-for-prospects → Task 4. ✓
- Sample data label → Task 5. ✓
- No DB migration / no new dependency / no section-component edits → honored across all tasks. ✓
- Verify render not just build → Task 6. ✓

**Placeholder scan:** No "TBD"/"implement later". Brand name resolved (Zingora). Guard insertion lines are concrete (verified 2026-06-19). Design image arrays intentionally empty — documented decision, not a placeholder.

**Type consistency:** Fixture slice names (`timeline`, `seo`, `products`, `design`, `finance`, `salesSummary`, `salesDaily`) used identically in Tasks 1→2→3. Guard test string `session.user?.role === "prospect"` identical everywhere. `PROSPECT_SHOWCASE_HREF` keys match `SECTION_CARDS` ids (`timeline`, `sales`, `products`, `seo`, `design`, `reports`, `finances`).

**Known soft spot (flag during execution):** exact guard insertion lines may shift if a route was edited by a parallel session — Task 2/3 implementers must place the guard by semantic position (after auth, before client resolution), using the line numbers as a hint, and re-confirm the session variable name in each file before editing.
