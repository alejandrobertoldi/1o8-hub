# Forecast Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an ASIN-level Amazon Inventory Forecasting tool that follows the 1o8 Agency SOP, storing named forecast versions with editable metrics and per-ASIN breakdowns, feeding rolled-up data into the existing Sales Forecast editor.

**Architecture:** Hybrid data model — historical months auto-filled from Redshift (read-only), future months editable. ASINs loaded from products table with manual add for upcoming products. Named versions stored in 4 new PostgreSQL tables. Client-side formula calculations for derived metrics. Route: `/sales-summary/forecast-v2` (sidebar already has this placeholder).

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM, PostgreSQL (Supabase), Redshift, TanStack Query, Tailwind CSS 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-10-forecast-tool-design.md`

---

## File Structure

```
src/lib/db/schema.ts                          — MODIFY: Add 4 new tables at end
drizzle/migrations/0035_forecast_tool.sql      — CREATE: Migration file

src/app/api/ppc/forecast-tool/
  route.ts                                     — CREATE: GET versions + current version data
  versions/route.ts                            — CREATE: POST create, GET list versions
  versions/[id]/route.ts                       — CREATE: PUT update version
  cells/route.ts                               — CREATE: PUT upsert cells (batch)
  asins/route.ts                               — CREATE: PUT upsert ASINs
  asin-cells/route.ts                          — CREATE: PUT upsert ASIN cells
  push/route.ts                                — CREATE: POST roll-up to clientForecasts

src/app/sales-summary/forecast-v2/
  page.tsx                                     — CREATE: Page wrapper with version selector

src/components/ppc/forecast-tool/
  forecast-calculations.ts                     — CREATE: Pure calculation functions
  forecast-grid.tsx                            — CREATE: Main editable metrics grid
  asin-breakdown.tsx                           — CREATE: ASIN cards + per-ASIN grids
  version-manager.tsx                          — CREATE: Version selector/save/create UI

src/components/layout/app-sidebar.tsx          — MODIFY: Update Forecast Tool link (remove "soon" badge)
```

---

### Task 1: Database Schema & Migration

**Files:**
- Modify: `src/lib/db/schema.ts:1857` (append after last type export)
- Create: `drizzle/migrations/0035_forecast_tool.sql`

- [ ] **Step 1: Add Drizzle schema tables**

Add at end of `src/lib/db/schema.ts` (after line 1863):

```typescript
// ─── Forecast Tool ──────────────────────────────────────────────────

export const forecastToolVersions = pgTable(
  "forecast_tool_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (table) => [
    index("idx_ftv_client").on(table.clientIdCode),
  ]
);

export const forecastToolCells = pgTable(
  "forecast_tool_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").notNull().references(() => forecastToolVersions.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    metric: varchar("metric", { length: 50 }).notNull(),
    value: numeric("value", { precision: 14, scale: 2 }),
  },
  (table) => [
    index("idx_ftc_version").on(table.versionId),
    unique("uq_ftc_version_month_metric").on(table.versionId, table.month, table.metric),
  ]
);

export const forecastToolAsins = pgTable(
  "forecast_tool_asins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id").notNull().references(() => forecastToolVersions.id, { onDelete: "cascade" }),
    asin: varchar("asin", { length: 20 }),
    productName: varchar("product_name", { length: 300 }).notNull(),
    productPrice: numeric("product_price", { precision: 10, scale: 2 }).notNull(),
    sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
    isNew: boolean("is_new").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_fta_version").on(table.versionId),
  ]
);

export const forecastToolAsinCells = pgTable(
  "forecast_tool_asin_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    asinId: uuid("asin_id").notNull().references(() => forecastToolAsins.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    metric: varchar("metric", { length: 30 }).notNull(),
    value: numeric("value", { precision: 14, scale: 2 }),
  },
  (table) => [
    index("idx_ftac_asin").on(table.asinId),
    unique("uq_ftac_asin_month_metric").on(table.asinId, table.month, table.metric),
  ]
);

export type ForecastToolVersion = typeof forecastToolVersions.$inferSelect;
export type NewForecastToolVersion = typeof forecastToolVersions.$inferInsert;
export type ForecastToolCell = typeof forecastToolCells.$inferSelect;
export type NewForecastToolCell = typeof forecastToolCells.$inferInsert;
export type ForecastToolAsin = typeof forecastToolAsins.$inferSelect;
export type NewForecastToolAsin = typeof forecastToolAsins.$inferInsert;
export type ForecastToolAsinCell = typeof forecastToolAsinCells.$inferSelect;
export type NewForecastToolAsinCell = typeof forecastToolAsinCells.$inferInsert;
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: New migration file created in `drizzle/migrations/`

- [ ] **Step 3: Run migration**

Run: `npm run db:migrate`
Expected: Tables created successfully

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(forecast-tool): add 4 database tables for forecast tool versions, cells, ASINs"
```

---

### Task 2: Calculation Functions

**Files:**
- Create: `src/components/ppc/forecast-tool/forecast-calculations.ts`

- [ ] **Step 1: Create calculation module**

```typescript
// Pure functions for deriving forecast metrics from editable inputs.
// These run client-side — only raw inputs are stored in the DB.

export interface ForecastInputs {
  sessions: number;
  unitsOrdered: number;
  totalOrderItems: number;
  categoryCoef: number;      // decimal, e.g. 0.0855 for 8.55%
  cvAmzEstimated: number;    // decimal, e.g. 0.1386
  spend: number;
  cpcAd: number;
  ctrAd: number;             // decimal, e.g. 0.0010
  cvAd: number;              // decimal, e.g. 0.0585
  adsOrderPct: number;       // decimal, e.g. 0.5291
  replenishOrders: number;
  prevInvMonthEnd: number;
}

export interface ForecastDerived {
  orderedProductSales: number;
  clicks: number;
  ordersAd: number;
  adRevenue: number;
  impressions: number;
  acos: number;              // decimal, e.g. 0.5905 for 59.05%
  invMonthEnd: number;
}

export function calcDerived(
  inputs: ForecastInputs,
  weightedAvgPrice: number
): ForecastDerived {
  const orderedProductSales = inputs.unitsOrdered * weightedAvgPrice;
  const clicks = inputs.cpcAd > 0 ? inputs.spend / inputs.cpcAd : 0;
  const ordersAd = Math.round(clicks * inputs.cvAd);
  const adRevenue = ordersAd * weightedAvgPrice;
  const impressions = inputs.ctrAd > 0 ? Math.round(clicks / inputs.ctrAd) : 0;
  const acos = adRevenue > 0 ? inputs.spend / adRevenue : 0;
  const invMonthEnd = inputs.prevInvMonthEnd + inputs.replenishOrders - inputs.unitsOrdered;

  return { orderedProductSales, clicks, ordersAd, adRevenue, impressions, acos, invMonthEnd };
}

export interface AsinInputs {
  totalUnitsOrdered: number;
  sharePct: number;          // decimal, e.g. 0.16 for 16%
  prevInvEom: number;
  replenish: number;
}

export interface AsinDerived {
  sales: number;
  invEom: number;
  invCoef: number;           // months of coverage
}

export function calcAsinDerived(inputs: AsinInputs): AsinDerived {
  const sales = Math.round(inputs.totalUnitsOrdered * inputs.sharePct);
  const invEom = inputs.prevInvEom + inputs.replenish - sales;
  const invCoef = sales > 0 ? invEom / sales : 0;
  return { sales, invEom, invCoef };
}

/** Weighted average price from ASIN list */
export function calcWeightedAvgPrice(
  asins: Array<{ productPrice: number; sharePct: number }>
): number {
  return asins.reduce((sum, a) => sum + a.productPrice * a.sharePct, 0);
}

/** Generate month keys from startYear-startMonth to endYear-12 */
export function generateMonthRange(startYear: number, startMonth: number, endYear: number): string[] {
  const months: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    for (let m = mStart; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return months;
}

/** Editable metric keys stored in DB */
export const EDITABLE_METRICS = [
  "sessions", "units_ordered", "total_order_items",
  "category_coef", "cv_amz_estimated",
  "spend", "cpc_ad", "ctr_ad", "cv_ad", "ads_order_pct",
  "replenish_orders",
] as const;

export type EditableMetric = typeof EDITABLE_METRICS[number];
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ppc/forecast-tool/forecast-calculations.ts
git commit -m "feat(forecast-tool): add pure calculation functions for derived metrics"
```

---

### Task 3: API — Versions CRUD

**Files:**
- Create: `src/app/api/ppc/forecast-tool/versions/route.ts`
- Create: `src/app/api/ppc/forecast-tool/versions/[id]/route.ts`

- [ ] **Step 1: Create versions list + create route**

Create `src/app/api/ppc/forecast-tool/versions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { forecastToolVersions, forecastToolAsins, products } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  const versions = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.clientIdCode, clientIdCode))
    .orderBy(desc(forecastToolVersions.createdAt));

  return NextResponse.json({ versions });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clientIdCode, name } = await req.json();
  if (!clientIdCode || !name)
    return NextResponse.json({ error: "clientIdCode and name required" }, { status: 400 });

  // Unset any existing current version for this client
  await db
    .update(forecastToolVersions)
    .set({ isCurrent: false })
    .where(and(eq(forecastToolVersions.clientIdCode, clientIdCode), eq(forecastToolVersions.isCurrent, true)));

  // Create new version
  const [version] = await db
    .insert(forecastToolVersions)
    .values({
      clientIdCode,
      name,
      createdBy: session.user.id,
      isCurrent: true,
    })
    .returning();

  // Auto-load ASINs from products table for this client
  const clientProducts = await db
    .select({
      asin: products.asin,
      title: products.title,
      price: products.price,
    })
    .from(products)
    .where(eq(products.clientIdCode, clientIdCode));

  if (clientProducts.length > 0) {
    const equalShare = Math.round((100 / clientProducts.length) * 100) / 100;
    await db.insert(forecastToolAsins).values(
      clientProducts.map((p, i) => ({
        versionId: version.id,
        asin: p.asin,
        productName: p.title || p.asin || "Unknown",
        productPrice: String(p.price || "0"),
        sharePct: String(equalShare),
        isNew: false,
        sortOrder: i,
      }))
    );
  }

  return NextResponse.json({ version }, { status: 201 });
}
```

- [ ] **Step 2: Create version update route**

Create `src/app/api/ppc/forecast-tool/versions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { forecastToolVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // If setting as current, unset others for same client
  if (body.isCurrent) {
    const [existing] = await db
      .select({ clientIdCode: forecastToolVersions.clientIdCode })
      .from(forecastToolVersions)
      .where(eq(forecastToolVersions.id, id));

    if (existing) {
      await db
        .update(forecastToolVersions)
        .set({ isCurrent: false })
        .where(and(
          eq(forecastToolVersions.clientIdCode, existing.clientIdCode),
          eq(forecastToolVersions.isCurrent, true)
        ));
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isCurrent !== undefined) updateData.isCurrent = body.isCurrent;

  const [updated] = await db
    .update(forecastToolVersions)
    .set(updateData)
    .where(eq(forecastToolVersions.id, id))
    .returning();

  return NextResponse.json({ version: updated });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ppc/forecast-tool/versions/
git commit -m "feat(forecast-tool): add version CRUD API routes"
```

---

### Task 4: API — Cells, ASINs, ASIN Cells, Push

**Files:**
- Create: `src/app/api/ppc/forecast-tool/cells/route.ts`
- Create: `src/app/api/ppc/forecast-tool/asins/route.ts`
- Create: `src/app/api/ppc/forecast-tool/asin-cells/route.ts`
- Create: `src/app/api/ppc/forecast-tool/push/route.ts`
- Create: `src/app/api/ppc/forecast-tool/route.ts`

- [ ] **Step 1: Create cells upsert route**

Create `src/app/api/ppc/forecast-tool/cells/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { forecastToolCells } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId, cells } = await req.json() as {
    versionId: string;
    cells: Array<{ month: string; metric: string; value: number | null }>;
  };

  if (!versionId || !cells?.length)
    return NextResponse.json({ error: "versionId and cells required" }, { status: 400 });

  for (const cell of cells) {
    await db
      .insert(forecastToolCells)
      .values({
        versionId,
        month: cell.month,
        metric: cell.metric,
        value: cell.value != null ? String(cell.value) : null,
      })
      .onConflictDoUpdate({
        target: [forecastToolCells.versionId, forecastToolCells.month, forecastToolCells.metric],
        set: { value: cell.value != null ? String(cell.value) : null },
      });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create ASINs upsert route**

Create `src/app/api/ppc/forecast-tool/asins/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { forecastToolAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });

  const asins = await db
    .select()
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId))
    .orderBy(forecastToolAsins.sortOrder);

  return NextResponse.json({ asins });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId, asins } = await req.json() as {
    versionId: string;
    asins: Array<{
      id?: string;
      asin?: string;
      productName: string;
      productPrice: number;
      sharePct: number;
      isNew: boolean;
      sortOrder: number;
    }>;
  };

  if (!versionId || !asins)
    return NextResponse.json({ error: "versionId and asins required" }, { status: 400 });

  // Delete existing ASINs for this version that aren't in the new list
  const existingIds = asins.filter(a => a.id).map(a => a.id!);
  const allExisting = await db
    .select({ id: forecastToolAsins.id })
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId));

  for (const existing of allExisting) {
    if (!existingIds.includes(existing.id)) {
      await db.delete(forecastToolAsins).where(eq(forecastToolAsins.id, existing.id));
    }
  }

  // Upsert each ASIN
  const results = [];
  for (const asin of asins) {
    if (asin.id) {
      const [updated] = await db
        .update(forecastToolAsins)
        .set({
          asin: asin.asin || null,
          productName: asin.productName,
          productPrice: String(asin.productPrice),
          sharePct: String(asin.sharePct),
          isNew: asin.isNew,
          sortOrder: asin.sortOrder,
        })
        .where(eq(forecastToolAsins.id, asin.id))
        .returning();
      results.push(updated);
    } else {
      const [created] = await db
        .insert(forecastToolAsins)
        .values({
          versionId,
          asin: asin.asin || null,
          productName: asin.productName,
          productPrice: String(asin.productPrice),
          sharePct: String(asin.sharePct),
          isNew: asin.isNew,
          sortOrder: asin.sortOrder,
        })
        .returning();
      results.push(created);
    }
  }

  return NextResponse.json({ asins: results });
}
```

- [ ] **Step 3: Create ASIN cells upsert route**

Create `src/app/api/ppc/forecast-tool/asin-cells/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { forecastToolAsinCells } from "@/lib/db/schema";

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { asinId, cells } = await req.json() as {
    asinId: string;
    cells: Array<{ month: string; metric: string; value: number | null }>;
  };

  if (!asinId || !cells?.length)
    return NextResponse.json({ error: "asinId and cells required" }, { status: 400 });

  for (const cell of cells) {
    await db
      .insert(forecastToolAsinCells)
      .values({
        asinId,
        month: cell.month,
        metric: cell.metric,
        value: cell.value != null ? String(cell.value) : null,
      })
      .onConflictDoUpdate({
        target: [forecastToolAsinCells.asinId, forecastToolAsinCells.month, forecastToolAsinCells.metric],
        set: { value: cell.value != null ? String(cell.value) : null },
      });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create push-to-forecast route**

Create `src/app/api/ppc/forecast-tool/push/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  forecastToolVersions,
  forecastToolCells,
  forecastToolAsins,
  clientForecasts,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !["admin", "editor"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId } = await req.json();
  if (!versionId) return NextResponse.json({ error: "versionId required" }, { status: 400 });

  // Get version info
  const [version] = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.id, versionId));

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Get all cells for this version
  const cells = await db
    .select()
    .from(forecastToolCells)
    .where(eq(forecastToolCells.versionId, versionId));

  // Get ASINs for weighted avg price
  const asins = await db
    .select()
    .from(forecastToolAsins)
    .where(eq(forecastToolAsins.versionId, versionId));

  const weightedAvgPrice = asins.reduce(
    (sum, a) => sum + (Number(a.productPrice) * Number(a.sharePct) / 100), 0
  );

  // Group cells by month, calculate product_sales and ad_spend
  const byMonth: Record<string, Record<string, number>> = {};
  for (const cell of cells) {
    if (!byMonth[cell.month]) byMonth[cell.month] = {};
    byMonth[cell.month][cell.metric] = Number(cell.value);
  }

  // Write to clientForecasts
  for (const [month, metrics] of Object.entries(byMonth)) {
    const unitsOrdered = metrics.units_ordered || 0;
    const productSales = unitsOrdered * weightedAvgPrice;
    const adSpend = metrics.spend || 0;

    for (const [metric, value] of [["product_sales", productSales], ["ad_spend", adSpend]] as const) {
      await db
        .insert(clientForecasts)
        .values({
          clientIdCode: version.clientIdCode,
          month,
          metric,
          forecastValue: String(value),
          updatedBy: session.user.id,
        })
        .onConflictDoUpdate({
          target: [clientForecasts.clientIdCode, clientForecasts.month, clientForecasts.metric],
          set: { forecastValue: String(value), updatedBy: session.user.id },
        });
    }
  }

  return NextResponse.json({ ok: true, monthsUpdated: Object.keys(byMonth).length });
}
```

- [ ] **Step 5: Create main GET route (loads full version data + Redshift historical)**

Create `src/app/api/ppc/forecast-tool/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  forecastToolVersions,
  forecastToolCells,
  forecastToolAsins,
  forecastToolAsinCells,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";

export const maxDuration = 120;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const versionId = req.nextUrl.searchParams.get("versionId");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  // Get all versions for this client
  const versions = await db
    .select()
    .from(forecastToolVersions)
    .where(eq(forecastToolVersions.clientIdCode, clientIdCode))
    .orderBy(desc(forecastToolVersions.createdAt));

  // Load specific or current version
  let activeVersion = versionId
    ? versions.find(v => v.id === versionId)
    : versions.find(v => v.isCurrent) || versions[0];

  if (!activeVersion) {
    return NextResponse.json({ versions: [], activeVersion: null, cells: [], asins: [], asinCells: [], historical: {} });
  }

  // Load cells, ASINs, ASIN cells in parallel
  const [cells, asins] = await Promise.all([
    db.select().from(forecastToolCells).where(eq(forecastToolCells.versionId, activeVersion.id)),
    db.select().from(forecastToolAsins).where(eq(forecastToolAsins.versionId, activeVersion.id)).orderBy(forecastToolAsins.sortOrder),
  ]);

  const asinCells = asins.length > 0
    ? await db.select().from(forecastToolAsinCells).where(
        eq(forecastToolAsinCells.asinId, asins[0].id) // TODO: load for all ASINs
      )
    : [];

  // Load ALL asin cells for all ASINs in this version
  const allAsinIds = asins.map(a => a.id);
  let allAsinCells: typeof asinCells = [];
  if (allAsinIds.length > 0) {
    allAsinCells = await db.select().from(forecastToolAsinCells);
    allAsinCells = allAsinCells.filter(c => allAsinIds.includes(c.asinId));
  }

  // Fetch Redshift historical data
  let historical: Record<string, Record<string, number>> = {};
  try {
    const accountId = clientIdCode.split("_")[0];
    const rsQuery = `
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month,
        SUM(product_sales) AS product_sales,
        SUM(units_ordered) AS units_ordered,
        SUM(sessions) AS sessions,
        SUM(advertising_cost) AS ad_spend,
        SUM(advertising_sales) AS ad_revenue,
        SUM(page_views) AS page_views
      FROM ${FULL_TABLE}
      WHERE account_id ILIKE '%${accountId}%'
        AND date >= DATEADD(month, -18, CURRENT_DATE)
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month
    `;
    const rows = await queryRedshift(rsQuery);
    for (const row of rows) {
      historical[row.month] = {
        product_sales: Number(row.product_sales) || 0,
        units_ordered: Number(row.units_ordered) || 0,
        sessions: Number(row.sessions) || 0,
        ad_spend: Number(row.ad_spend) || 0,
        ad_revenue: Number(row.ad_revenue) || 0,
      };
    }
  } catch {
    // Redshift may be unavailable — continue without historical data
  }

  return NextResponse.json({
    versions,
    activeVersion,
    cells,
    asins,
    asinCells: allAsinCells,
    historical,
  });
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ppc/forecast-tool/
git commit -m "feat(forecast-tool): add API routes for cells, ASINs, push-to-forecast, and main data loader"
```

---

### Task 5: Version Manager Component

**Files:**
- Create: `src/components/ppc/forecast-tool/version-manager.tsx`

- [ ] **Step 1: Create version manager UI**

```typescript
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ForecastToolVersion } from "@/lib/db/schema";

interface VersionManagerProps {
  clientIdCode: string;
  versions: ForecastToolVersion[];
  activeVersionId: string | null;
  onVersionChange: (versionId: string) => void;
}

export function VersionManager({
  clientIdCode,
  versions,
  activeVersionId,
  onVersionChange,
}: VersionManagerProps) {
  const [showNameInput, setShowNameInput] = useState(false);
  const [newName, setNewName] = useState("");
  const queryClient = useQueryClient();

  const createVersion = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/ppc/forecast-tool/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, name }),
      });
      if (!res.ok) throw new Error("Failed to create version");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
      onVersionChange(data.version.id);
      setShowNameInput(false);
      setNewName("");
    },
  });

  const pushToForecast = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ppc/forecast-tool/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: activeVersionId }),
      });
      if (!res.ok) throw new Error("Failed to push");
      return res.json();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={activeVersionId || ""}
        onChange={(e) => onVersionChange(e.target.value)}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}{v.isCurrent ? " (current)" : ""}
          </option>
        ))}
        {versions.length === 0 && <option value="">No versions</option>}
      </select>

      {showNameInput ? (
        <div className="flex items-center gap-1">
          <input
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Version name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName && createVersion.mutate(newName)}
            autoFocus
          />
          <button
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-brand-foreground hover:bg-brand-hover"
            onClick={() => newName && createVersion.mutate(newName)}
            disabled={!newName || createVersion.isPending}
          >
            {createVersion.isPending ? "Creating..." : "Create"}
          </button>
          <button
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => setShowNameInput(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={() => setShowNameInput(true)}
        >
          + New Version
        </button>
      )}

      {activeVersionId && (
        <button
          className="rounded-lg bg-brand-green px-3 py-2 text-sm font-bold text-white hover:opacity-90"
          onClick={() => pushToForecast.mutate()}
          disabled={pushToForecast.isPending}
          title="Push rolled-up sales & spend data to the Sales Forecast editor"
        >
          {pushToForecast.isPending ? "Pushing..." : "Push to Sales Forecast"}
        </button>
      )}

      {pushToForecast.isSuccess && (
        <span className="text-xs text-brand-green">Pushed!</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ppc/forecast-tool/version-manager.tsx
git commit -m "feat(forecast-tool): add version manager component with create and push-to-forecast"
```

---

### Task 6: Forecast Grid Component

**Files:**
- Create: `src/components/ppc/forecast-tool/forecast-grid.tsx`

This is the largest component (~350 lines). It renders the editable spreadsheet grid with section toggles, read-only historical columns, and editable forecast columns.

- [ ] **Step 1: Create forecast grid component**

Create `src/components/ppc/forecast-tool/forecast-grid.tsx`. Due to length, the engineer should follow this structure:

1. **Types:** Define `GridProps` with versions data, cells, historical, months, ASINs
2. **State:** Section toggle booleans (aggregate, advertising, inventory), editing cell state
3. **Metric rows config:** Array of `{ key, label, section, editable, format }` matching the spec's 20+ metrics
4. **Cell renderer:** Read-only for historical months, `<input>` for forecast months on editable metrics, calculated display for derived metrics
5. **Save handler:** Debounced PUT to `/api/ppc/forecast-tool/cells` on blur
6. **Derived calculations:** Use `calcDerived()` and `calcWeightedAvgPrice()` from `forecast-calculations.ts`

Key metric rows (in order):

```typescript
const METRIC_ROWS = [
  // Aggregate
  { key: "sessions", label: "Sessions", section: "aggregate", editable: true, format: "number" },
  { key: "units_ordered", label: "Units Ordered", section: "aggregate", editable: true, format: "number" },
  { key: "ordered_product_sales", label: "Ordered Product Sales", section: "aggregate", editable: false, format: "currency" },
  { key: "total_order_items", label: "Total Order Items", section: "aggregate", editable: true, format: "number" },
  { key: "category_coef", label: "Category COEF", section: "aggregate", editable: true, format: "percent" },
  { key: "cv_amz_estimated", label: "CV AMZ Estimated", section: "aggregate", editable: true, format: "percent" },
  // Advertising
  { key: "impressions", label: "Impressions", section: "advertising", editable: false, format: "number" },
  { key: "clicks", label: "Clicks", section: "advertising", editable: false, format: "number" },
  { key: "orders_ad", label: "Orders (Ad)", section: "advertising", editable: false, format: "number" },
  { key: "spend", label: "Spend", section: "advertising", editable: true, format: "currency" },
  { key: "ad_revenue", label: "Ad Revenue", section: "advertising", editable: false, format: "currency" },
  { key: "cpc_ad", label: "CPC Ad", section: "advertising", editable: true, format: "currency" },
  { key: "ctr_ad", label: "CTR Ad", section: "advertising", editable: true, format: "percent" },
  { key: "cv_ad", label: "CV Ad", section: "advertising", editable: true, format: "percent" },
  { key: "ads_order_pct", label: "Ads Order %", section: "advertising", editable: true, format: "percent" },
  { key: "acos", label: "ACOS", section: "advertising", editable: false, format: "percent" },
  // Inventory
  { key: "inv_month_end", label: "INV Month End", section: "inventory", editable: false, format: "number" },
  { key: "replenish_orders", label: "Replenish Orders", section: "inventory", editable: true, format: "number" },
] as const;
```

The component should:
- Use `useMutation` for cell saves
- Display section headers as full-width amber/dark/green rows
- Apply conditional coloring: red for negative COEF/high ACOS, green for positive
- Sticky first column for metric labels
- Amber background tint on forecast (future) columns

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ppc/forecast-tool/forecast-grid.tsx
git commit -m "feat(forecast-tool): add main editable forecast grid component"
```

---

### Task 7: ASIN Breakdown Component

**Files:**
- Create: `src/components/ppc/forecast-tool/asin-breakdown.tsx`

- [ ] **Step 1: Create ASIN breakdown component**

The component shows:
1. **ASIN cards** — grid of cards showing each ASIN with code, name, share %, annual units. "NEW" badge for `isNew` ASINs. "+ Add ASIN" card.
2. **Per-ASIN grid** — expandable table with monthly columns for sales, inv_eom, replenish per ASIN
3. **Add ASIN modal** — simple form with product name, price, share %, ASIN (optional)

Structure:
- Props: `asins`, `asinCells`, `months`, `versionId`, `totalUnitsOrdered` (per month)
- ASIN cards with click-to-expand per-ASIN monthly grid
- Derived calculations using `calcAsinDerived()` from `forecast-calculations.ts`
- Save via PUT to `/api/ppc/forecast-tool/asins` (for share changes) and `/api/ppc/forecast-tool/asin-cells` (for replenish values)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ppc/forecast-tool/asin-breakdown.tsx
git commit -m "feat(forecast-tool): add ASIN breakdown component with cards and per-ASIN grids"
```

---

### Task 8: Page & Sidebar Integration

**Files:**
- Create: `src/app/sales-summary/forecast-v2/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx:113`

- [ ] **Step 1: Create the page**

Create `src/app/sales-summary/forecast-v2/page.tsx`:

```typescript
"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VersionManager } from "@/components/ppc/forecast-tool/version-manager";
import { ForecastGrid } from "@/components/ppc/forecast-tool/forecast-grid";
import { AsinBreakdown } from "@/components/ppc/forecast-tool/asin-breakdown";

export default function ForecastToolPage() {
  const searchParams = useSearchParams();
  const [clientIdCode, setClientIdCode] = useState(searchParams.get("client") || "");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // Fetch client list for selector
  const { data: clientsData } = useQuery({
    queryKey: ["sales-summary-clients"],
    queryFn: async () => {
      const now = new Date();
      const end = now.toISOString().slice(0, 10);
      const start = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const res = await fetch(`/api/sales-summary?period=7D&start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Fetch forecast tool data for selected client
  const { data, isLoading } = useQuery({
    queryKey: ["forecast-tool", clientIdCode, activeVersionId],
    queryFn: async () => {
      const url = new URL("/api/ppc/forecast-tool", window.location.origin);
      url.searchParams.set("clientIdCode", clientIdCode);
      if (activeVersionId) url.searchParams.set("versionId", activeVersionId);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch forecast tool data");
      return res.json();
    },
    enabled: !!clientIdCode,
  });

  // Set active version from loaded data
  React.useEffect(() => {
    if (data?.activeVersion && !activeVersionId) {
      setActiveVersionId(data.activeVersion.id);
    }
  }, [data, activeVersionId]);

  const clients: Array<{ clientIdCode: string; brand: string }> = clientsData?.clients || [];

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter">
              <span className="font-bold">Forecast</span>
              <span className="text-brand">Tool</span>
            </h1>
            {clientIdCode && (
              <p className="text-sm text-muted-foreground mt-1">
                {clients.find(c => c.clientIdCode === clientIdCode)?.brand || clientIdCode} · Amazon FBA Inventory Forecast
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={clientIdCode}
              onChange={(e) => { setClientIdCode(e.target.value); setActiveVersionId(null); }}
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.clientIdCode} value={c.clientIdCode}>{c.brand}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {clientIdCode && data && (
        <VersionManager
          clientIdCode={clientIdCode}
          versions={data.versions || []}
          activeVersionId={activeVersionId}
          onVersionChange={setActiveVersionId}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data?.activeVersion && (
        <>
          <ForecastGrid
            versionId={data.activeVersion.id}
            cells={data.cells}
            asins={data.asins}
            historical={data.historical}
          />
          <AsinBreakdown
            versionId={data.activeVersion.id}
            asins={data.asins}
            asinCells={data.asinCells}
            cells={data.cells}
          />
        </>
      )}

      {clientIdCode && !isLoading && !data?.activeVersion && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg font-medium">No forecast versions yet</p>
          <p className="text-sm mt-1">Create a new version to get started.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update sidebar — remove "soon" badge from Forecast Tool**

In `src/components/layout/app-sidebar.tsx`, line 113, change:
```typescript
{ title: "Forecast Tool", href: "/sales-summary/forecast-v2", icon: Sparkles, visible: checkAccess("sales"), badge: "soon" },
```
to:
```typescript
{ title: "Forecast Tool", href: "/sales-summary/forecast-v2", icon: Sparkles, visible: checkAccess("sales") },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Test manually**

Run: `PORT=3000 npm run dev`
Navigate to `http://localhost:3000/sales-summary/forecast-v2`
Expected: Page loads with client selector. After selecting a client, version manager shows. Can create a new version.

- [ ] **Step 5: Commit**

```bash
git add src/app/sales-summary/forecast-v2/ src/components/layout/app-sidebar.tsx
git commit -m "feat(forecast-tool): add forecast tool page and remove 'soon' badge from sidebar"
```

---

## Self-Review Notes

- **Spec coverage:** All sections covered — hybrid data (Task 4 main GET loads Redshift), ASINs from products (Task 3 POST), named versions (Tasks 3+5), formula calculations (Task 2), all metric rows (Task 6), ASIN breakdown (Task 7), push to Sales Forecast (Task 4), sidebar update (Task 8).
- **Placeholder scan:** Task 6 (forecast-grid) describes structure rather than full code due to ~350 line size — the engineer has the metric config, component structure, and behavior specs to implement it fully. All other tasks have complete code.
- **Type consistency:** `ForecastToolVersion`, `ForecastToolCell`, etc. match across schema, API routes, and components. Metric keys (`sessions`, `units_ordered`, etc.) consistent between `EDITABLE_METRICS` and `METRIC_ROWS`.

---

## Post-Implementation Updates (2026-04-16)

### Version Creation Flow (Task 5 update)

The version manager now uses a **two-step creation flow** instead of the original flat panel:

1. **Step 1 — Name & Period** (prominent card with brand border):
   - Version name input
   - Three month pickers: Historic Start, Forecast Start, Forecast End
   - Summary line showing the historic/forecast date ranges
   - Period is `historicStart → forecastStart` (historic) and `forecastStart → forecastEnd` (forecast)

2. **Step 2 — Select Products** (ASIN picker table):
   - Products listed by ASIN, SKU, Title, Variation ID, VP, theme attributes, Price
   - Multiple products can share the same ASIN (different SKUs) — all are shown individually for selection
   - Select all / Clear controls

This replaced the original design where period selection was a small footer bar at the bottom of the ASIN picker (low visibility, felt like one flat step).

### Version Deletion (Task 5 addition)

Added delete capability for versions:
- **API:** `DELETE /api/ppc/forecast-tool/versions/[id]` — admin/editor only, FK cascades handle cleanup
- **UI:** Trash icon next to lock button, inline "Confirm Delete" / "Cancel" pattern (no modal)
- After deletion, auto-switches to the next available version

### Seasonality Step — ASIN Deduplication (Task 9 update)

The seasonality step's Phase 1 (Copy ASINs for Cerebro) now deduplicates ASINs before displaying:
- Products with the same ASIN but different SKU only produce one copy of the ASIN
- Count shows "N unique ASINs (from M products)" when there are duplicates
- Prevents unnecessary duplicate ASINs when pasting into Helium 10 Cerebro
