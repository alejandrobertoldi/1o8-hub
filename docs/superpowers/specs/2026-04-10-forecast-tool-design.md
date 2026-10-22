# Forecast Tool — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Author:** Manu + Claude

## Overview

An ASIN-level Amazon Inventory Forecasting tool following the 1o8 Agency SOP for FBA. The tool produces detailed monthly forecasts covering sessions, units, advertising metrics, inventory levels, and per-ASIN replenishment schedules. Its output feeds into the existing Sales Forecast editor (`/sales-summary/forecast`) by rolling up ASIN-level data into channel-level `product_sales` and `ad_spend` values in the `clientForecasts` table.

## Route

`/ppc/[clientIdCode]/forecast-tool`

Accessed from the PPC section. A new sidebar item "Forecast Tool" will be added under the existing PPC nav group, below "Sales Forecast".

## Data Flow

```
Products Table (ASINs, prices) ──┐
                                 ├──► Forecast Tool Page
Redshift (historical monthly)  ──┘         │
                                           │ user edits forecast cells
                                           ▼
                                   PostgreSQL (4 new tables)
                                           │
                                           │ rolls up totals
                                           ▼
                                   clientForecasts table
                                           │
                                           ▼
                                   Sales Forecast (existing)
```

## Design Decisions

| Decision         | Choice                                          | Rationale                                                                                                                                                        |
|------------------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Data entry model | Hybrid: historical auto-fill + manual forecast  | Past months from Redshift are read-only. Future months are editable. External data (Category COEF, CPC, CV Ad) is always manual. Saves re-entry for known data.  |
| ASIN source      | Products table + manual add                     | Leverages existing product data (ASIN, title, price). Manual add supports upcoming products not yet in the DB.                                                   |
| Versioning       | Named versions (snapshots)                      | Users save named versions ("March v2", "Q2 Plan"). Each version is a full snapshot. Supports loading and comparing versions.                                     |
| Formulas         | Client-side calculation                         | Derived metrics (Clicks, Orders, Ad Revenue, ACOS, etc.) are calculated in the browser from editable inputs. Only raw inputs are stored in the DB.               |

## Page Layout

### Header
- Page title: "ForecastTool" (jammed, per brand style)
- Subtitle: "{Client Name} · Amazon FBA Inventory Forecast"
- Version selector dropdown (load saved versions)
- "Save Version" button (prompts for name)
- "+ New Forecast" button (creates blank forecast with ASINs pre-loaded from products table)

### Section Toggle Bar
Toggle buttons to show/hide grid sections:
- **Aggregate** (amber) — Sessions, Units Ordered, Ordered Product Sales, Total Order Items, Category COEF, CV AMZ Estimated
- **Advertising** (dark) — Impressions, Clicks, Orders, Spend, Ad Revenue, CPC Ad, CTR Ad, CV Ad, Ads Order %, ACOS
- **Inventory** (green) — INV Month End, Replenish Orders (aggregate)
- **ASIN Sales** — Per-ASIN monthly unit sales
- **ASIN Inventory** — Per-ASIN end-of-month inventory
- **Replenishment** — Per-ASIN replenishment order quantities

### Forecast Grid
A horizontally-scrollable table:
- **Rows:** Metric names (sticky left column)
- **Columns:** Monthly periods (e.g., 2025M01 through 2026M12)
- **Historical months** (before current month): Read-only cells with gray text, populated from Redshift
- **Forecast months** (current month onward): Editable input cells with amber background tint
- **Section headers:** Full-width row dividers with section name and color

### ASIN Breakdown
Below the main grid:
- Card grid showing each ASIN: code, product name, % share, annual unit estimate
- "NEW" badge for manually-added upcoming products
- "+ Add ASIN" card to add new products
- Expandable per-ASIN grids for sales, inventory, and replenishment by month

## Metric Definitions

### Section 1: Aggregate Metrics
| Metric               | Type                                          | Source / Formula                                                                                   |
|----------------------|-----------------------------------------------|-----------------------------------------------------------------------------------------------------|
| Sessions             | Editable (forecast) / Read-only (historical)  | Seller Central via Redshift                                                                         |
| Units Ordered        | Editable / Read-only                          | Seller Central via Redshift                                                                         |
| Ordered Product Sales | **Calculated**                                | `= Units Ordered × weighted avg product price`                                                     |
| Total Order Items    | Editable / Read-only                          | Seller Central via Redshift                                                                         |
| Category COEF        | **Manual**                                    | From Helium 10 keyword search volume analysis (SOP Steps 3-6). % deviation from 12-month average.  |
| CV AMZ Estimated     | **Manual**                                    | From Seller Central Opportunity Explorer (SOP Step 8). Overall Amazon conversion rate estimate.     |

### Section 2: Advertising Metrics
| Metric      | Type           | Source / Formula                                                                                      |
|-------------|----------------|-------------------------------------------------------------------------------------------------------|
| Impressions | **Calculated** | `= Clicks / CTR Ad` (or manual override)                                                             |
| Clicks      | **Calculated** | `= Spend / CPC Ad`                                                                                   |
| Orders (Ad) | **Calculated** | `= Clicks × CV Ad`                                                                                   |
| Spend       | **Editable**   | Budget allocation per month (SOP Step 12)                                                             |
| Ad Revenue  | **Calculated** | `= Orders × weighted avg product price`                                                              |
| CPC Ad      | **Editable**   | From Helium 10 Magnet keywords (SOP Step 9)                                                          |
| CTR Ad      | **Editable**   | Estimated or from historical data                                                                     |
| CV Ad       | **Editable**   | Ad conversion rate (SOP Step 11). ~3x lower than market average for new products, improving over time. |
| Ads Order % | **Editable**   | % of total orders from ads (SOP Step 10). Starts ~90% for new launches, decreases as organic grows.  |
| ACOS        | **Calculated** | `= Spend / Ad Revenue × 100`                                                                         |

### Section 3: Inventory & Replenishment
| Metric           | Type           | Source / Formula                                       |
|------------------|----------------|--------------------------------------------------------|
| INV Month End    | **Calculated** | `= Previous INV + Replenish received − Units Ordered`  |
| Replenish Orders | **Editable**   | Total units to replenish this month                    |

### Section 4: Per-ASIN Breakdown
| Metric               | Type           | Source / Formula                                                                   |
|----------------------|----------------|------------------------------------------------------------------------------------|
| ASIN Sales (units)   | **Calculated** | `= Total Units Ordered × ASIN share_pct`                                          |
| ASIN Inv EOM         | **Calculated** | `= Previous ASIN Inv + ASIN Replenish − ASIN Sales`                               |
| ASIN Inv Coefficient | **Calculated** | `= ASIN Inv EOM / ASIN Sales` (months of coverage)                                |
| ASIN Replenish       | **Editable**   | Per-ASIN replenishment quantities. Must sum to aggregate Replenish Orders.         |
| ASIN Share %         | **Editable**   | Per-ASIN share of total sales. From the PURA example: old % vs new est % columns. |

## Database Schema

### `forecast_tool_versions`
```sql
CREATE TABLE forecast_tool_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_current BOOLEAN DEFAULT false
);

CREATE INDEX idx_ftv_client ON forecast_tool_versions(client_id_code);
```

### `forecast_tool_cells`
Stores aggregate-level metric values (one row per metric per month per version).
```sql
CREATE TABLE forecast_tool_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES forecast_tool_versions(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  metric VARCHAR(50) NOT NULL,
  value NUMERIC(14,2),
  UNIQUE (version_id, month, metric)
);

CREATE INDEX idx_ftc_version ON forecast_tool_cells(version_id);
```

Valid `metric` values: `sessions`, `units_ordered`, `total_order_items`, `category_coef`, `cv_amz_estimated`, `spend`, `cpc_ad`, `ctr_ad`, `cv_ad`, `ads_order_pct`, `replenish_orders`.

### `forecast_tool_asins`
Per-ASIN configuration within a version.
```sql
CREATE TABLE forecast_tool_asins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES forecast_tool_versions(id) ON DELETE CASCADE,
  asin VARCHAR(20),
  product_name VARCHAR(300) NOT NULL,
  product_price NUMERIC(10,2) NOT NULL,
  share_pct NUMERIC(5,2) NOT NULL,
  is_new BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_fta_version ON forecast_tool_asins(version_id);
```

### `forecast_tool_asin_cells`
Per-ASIN monthly values.
```sql
CREATE TABLE forecast_tool_asin_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin_id UUID NOT NULL REFERENCES forecast_tool_asins(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  metric VARCHAR(30) NOT NULL,
  value NUMERIC(14,2),
  UNIQUE (asin_id, month, metric)
);

CREATE INDEX idx_ftac_asin ON forecast_tool_asin_cells(asin_id);
```

Valid `metric` values: `sales`, `inv_eom`, `replenish`.

## API Routes

### `GET /api/ppc/forecast-tool?clientIdCode=X`
Returns all versions for the client, plus the current version's full data (cells + ASINs + ASIN cells) and historical data from Redshift.

### `POST /api/ppc/forecast-tool/versions`
Create a new forecast version. Body: `{ clientIdCode, name }`. Auto-loads ASINs from products table.

### `PUT /api/ppc/forecast-tool/versions/[id]`
Update version name or set as current.

### `PUT /api/ppc/forecast-tool/cells`
Upsert cell values. Body: `{ versionId, cells: [{ month, metric, value }] }`. Supports batch upsert for pasting data.

### `PUT /api/ppc/forecast-tool/asins`
Add/update/remove ASINs. Body: `{ versionId, asins: [{ asin?, productName, productPrice, sharePct, isNew }] }`.

### `PUT /api/ppc/forecast-tool/asin-cells`
Upsert per-ASIN cell values. Body: `{ asinId, cells: [{ month, metric, value }] }`.

### `POST /api/ppc/forecast-tool/push-to-forecast`
Roll up the current version's data and write aggregated `product_sales` and `ad_spend` into the `clientForecasts` table for the existing Sales Forecast editor.

## Sidebar Navigation

Add under the PPC group in `src/components/layout/app-sidebar.tsx`:
```
├── "Sales Forecast" → /sales-summary/forecast
├── "Forecast Tool" → /ppc/{clientIdCode}/forecast-tool  ← NEW
└── "Inventory Forecast" → /sales-summary/inventory
```

The Forecast Tool link requires a client selection first. If accessed from the PPC sidebar without a client context, show a client selector dropdown.

## Component Structure

```
src/
  app/ppc/[clientIdCode]/forecast-tool/
    page.tsx                    — Page wrapper, data fetching, version selector
  components/ppc/
    forecast-tool/
      forecast-grid.tsx         — Main editable grid (aggregate + advertising + inventory)
      asin-breakdown.tsx        — ASIN cards + per-ASIN grids
      version-manager.tsx       — Version selector, save, create, compare
      forecast-calculations.ts  — Pure functions for derived metrics
```

## Calculation Rules (from SOP)

These are the formulas implemented client-side:

```typescript
// Aggregate
orderedProductSales = unitsOrdered * weightedAvgPrice
// where weightedAvgPrice = Σ(asin.price * asin.sharePct / 100)

// Advertising
clicks = spend / cpcAd
orders = clicks * cvAd
adRevenue = orders * weightedAvgPrice
impressions = clicks / ctrAd
acos = (spend / adRevenue) * 100

// Inventory
invMonthEnd = prevInvMonthEnd + replenishOrders - unitsOrdered

// Per-ASIN
asinSales = unitsOrdered * (asin.sharePct / 100)
asinInvEom = prevAsinInvEom + asinReplenish - asinSales
asinInvCoef = asinInvEom / asinSales  // months of coverage

// SOP guideline: recommended inventory ≥ 150% of total unit sales, prefer 200%
```

## Historical Data Integration (Redshift)

Query `intentwise_ecommerce_graph.account_summary` for:
- `product_sales` → maps to Sessions (via page views), Units Ordered, Ordered Product Sales
- `advertising_cost` → maps to Spend
- `advertising_sales` → maps to Ad Revenue

Months before the current month are populated as read-only. The Redshift query reuses the pattern from the existing `/api/ppc/forecast` route.

## Access Control

- **Admin / Editor:** Full access — create, edit, save versions, push to Sales Forecast
- **Viewer:** Read-only — can view forecasts but not edit
- **Client (portal):** No access — the Forecast Tool is internal-only

## Out of Scope (V1)

- Automatic integration with Helium 10 or ASINSIGHT APIs (manual data entry for now)
- Side-by-side version comparison UI (version selector loads one version at a time)
- Excel/CSV import of forecast data
- Automated seasonality detection or AI-assisted forecasting
