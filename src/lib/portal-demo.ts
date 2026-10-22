// Illustrative sample data for prospect-role portal preview. Brand: Zingora
// (AAC code ZIN_SC_US). Shapes mirror each /api route's real success response.
// Prospect role: synthetic fixtures below. Admin preview of ZIN sales also
// aliases live PUR metrics via src/lib/demo-client-alias.ts (no DB seeding).

// Matches the real AAC prospect client code used in portal demos.
const DEMO_CLIENT = "ZIN_SC_US";

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

// 7 most recent days, varied scale so the chart shows variation.
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
      { id: "demo-p1", asin: "B0ZNG00001", sku: "ZNG-BOTTLE-BLK", status: "Active", itemName: "Zingora Insulated Water Bottle 32oz — Matte Black", summarizedTitle: "Zingora Insulated Water Bottle 32oz — Matte Black", variationId: "zng-bottle", variationGroup: "Bottles", variations: { VariationThemeName: "Color", Color: "Matte Black" }, parentageLevel: "child", parentAsin: "B0ZNG0000P", mainImageUrl: null, listingImageDriveFileId: null, listPrice: "29.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p2", asin: "B0ZNG00002", sku: "ZNG-BOTTLE-TEAL", status: "Active", itemName: "Zingora Insulated Water Bottle 32oz — Teal", summarizedTitle: "Zingora Insulated Water Bottle 32oz — Teal", variationId: "zng-bottle", variationGroup: "Bottles", variations: { VariationThemeName: "Color", Color: "Teal" }, parentageLevel: "child", parentAsin: "B0ZNG0000P", mainImageUrl: null, listingImageDriveFileId: null, listPrice: "29.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p3", asin: "B0ZNG00010", sku: "ZNG-TUMBLER-20", status: "Active", itemName: "Zingora Travel Tumbler 20oz — Stainless", summarizedTitle: "Zingora Travel Tumbler 20oz — Stainless", variationId: null, variationGroup: "Tumblers", variations: null, parentageLevel: "standalone", parentAsin: null, mainImageUrl: null, listingImageDriveFileId: null, listPrice: "24.99", varietyPackItemCount: 1, vpFlavors: null, isVp: false, isPortalSubmission: false },
      { id: "demo-p4", asin: "B0ZNG00020", sku: "ZNG-GIFTSET", status: "Active", itemName: "Zingora Hydration Gift Set (Bottle + Tumbler)", summarizedTitle: "Zingora Hydration Gift Set", variationId: null, variationGroup: "Bundles", variations: null, parentageLevel: "standalone", parentAsin: null, mainImageUrl: null, listingImageDriveFileId: null, listPrice: "49.99", varietyPackItemCount: 2, vpFlavors: null, isVp: true, isPortalSubmission: false },
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
      breakdown: { Sales: 52000, Refunds: -1800, Expenses: -20760, AccountLevelReserve: -1000, BeginningBalance: 0, FundTransfer: -28640 } as Record<string, number>,
      itemDetail: { "FBA Fulfillment Fee": -7200, "Referral Fee": -7800, "Advertising": -3800, "Storage Fee": -960, "Other": -1000 } as Record<string, number>,
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
