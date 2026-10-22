# Forecast Tool — Complete Process Documentation

## Overview

The Forecast Tool generates monthly PPC forecasts for Amazon FBA clients. It combines historical Redshift data, user-editable assumptions, and keyword-based seasonality analysis to project advertising metrics and inventory needs.

## Workflow

```
1. Landing Page (client cards)
   └→ 2. Version Creation (ASIN selection + date ranges)
       └→ 3. Seasonality Step (optional — keyword-based seasonal coefficients)
           └→ 4. Forecast Grid (main spreadsheet)
               └→ 5. Push to Sales Forecast (optional)
```

---

## Step 1: Landing Page

**URL:** `/sales-summary/forecast-v2`

Displays all clients as cards. Each card shows:
- Brand name, client ID code
- Tier badge, marketplace
- Account Manager, PPC Manager
- Latest forecast version name, lock status, creation date

Click a card to enter the forecast view for that client.

---

## Step 2: Version Creation

When "+ New Version" is clicked, a **two-step creation flow** appears:

### Step 2a: Name & Period (prominent card)

Displayed as a bordered card with brand accent. All fields mandatory before proceeding.

- **Version Name** — free text input (e.g., "Q3 2026 Forecast", "May Reforecast")
- **Historic Start** — month picker (default: `2025-01`)
- **Forecast Start** — month picker (default: current month)
- **Forecast End** — month picker (default: `2026-12`)
- Summary line shows: `2025-01 → 2026-04 historic | 2026-04 → 2026-12 forecast`

### Step 2b: Select Products

Table shows all client products from the `master` table (excluding Parent ASINs):
- Columns: ASIN, SKU, Title, Variation ID, VP (variety pack), theme attributes (Flavor/Color/Size/Style), Price
- Sortable by any column (default: Variation ID for parent→child grouping)
- Checkboxes for selection (all selected by default)
- **Multiple products can share the same ASIN** (different SKUs) — each is listed separately for granular selection

On "Create (N ASINs)":
- Version saved to `forecast_tool_versions` table
- Selected products saved to `forecast_tool_asins` table (by ASIN + SKU)
- Redshift historical data fetched and cached on the version row (`historicalData`, `asinHistoricalData` JSONB columns)
- Redirects to Seasonality Step

### Version Deletion

Active versions can be deleted via the trash icon in the toolbar (next to the lock button). Inline confirmation required ("Confirm Delete" / "Cancel"). FK cascades automatically remove associated ASINs, cells, and ASIN cells. After deletion, auto-switches to the next available version.

---

## Step 3: Seasonality Step (NEW)

**Purpose:** Compute monthly Category Coefficients that model seasonal demand fluctuations. These coefficients adjust the Sessions forecast: `sessions = avgHistoricalSessions × (1 + categoryCoef)`.

**Skippable** — "Skip — use flat seasonality" sets all coefficients to 0.

**Re-enterable** — "Edit Seasonality" button in the forecast grid toolbar.

### Phase 3a: Copy ASINs for Cerebro

- Displays **unique** ASINs in a read-only text block, **space-separated** (deduplicated — products sharing the same ASIN but different SKU appear only once)
- Shows count: "N unique ASINs (from M products)" when duplicates exist
- "Copy" button copies to clipboard
- User pastes into **Helium 10 Cerebro** (reverse ASIN lookup tool) and exports results as CSV

### Phase 3b: Upload Cerebro CSV & Select Keywords

**Cerebro CSV columns used:** `Keyword`, `Search Volume` (other columns ignored)

**Filtering pipeline (client-side):**
1. Parse CSV, extract Keyword + Search Volume
2. Exclude branded keywords (case-insensitive match against client's brand name)
3. Exclude long-tail keywords (5+ words) — too specific for category seasonality
4. Exclude keywords with Search Volume < 1,000 — too noisy
5. Sort by Search Volume descending

**Result:** Table of top 10 keywords with checkboxes. Top 3 pre-selected. User must select exactly 3.

**Rationale:** We want category-level keywords that represent overall demand patterns, not brand-specific or hyper-niche terms.

### Phase 3c: Upload Historical Search Volume CSVs

User uploads 3 separate CSV files (one per selected keyword). These come from **Helium 10's Search Volume chart**.

**How to download from Helium 10:**
1. In the Cerebro results, find the keyword row and click the **chart icon** (📈) next to the Search Volume number
2. In the popup chart window, change the time range dropdown (top-left) to **5 Years**
3. Click the **hamburger menu** (≡ three lines, top-right of the chart)
4. Select **Download CSV**
5. Repeat for each of the 3 selected keywords

**CSV schema:** `Time` (date, format `YYYY-MM-DD HH:mm:ss`, weekly data points) + `Search Volume` (number)

**Calculation per keyword (client-side):**

1. **Parse dates** — handles ISO format (`2021-04-17 00:00:00`) and US format (`1/7/23 0:00`)
2. **Filter to last 2 years** — only data within 24 months of the latest date in the file
3. **Group weekly → monthly** — assign each row to its calendar month by the row's date, sum weekly volumes per month
4. **Average same months across years** — e.g., Jan 2023 + Jan 2024 → Jan average
5. **Compute yearly average** — average of all 12 monthly averages
6. **Compute coefficient per month:**
   ```
   coef[month] = (month_avg - yearly_avg) / yearly_avg
   ```

**Example:**
- January average search volume: 250,000
- Yearly average: 200,000
- January coefficient: (250,000 - 200,000) / 200,000 = **+0.25** (25% above average)

### Phase 3d: Review & Apply Coefficients

**SVG line chart** — one line per keyword + merged average, with month labels along the bottom axis:
- Chart height ~230px for clear visibility of seasonal trends
- **Toggle checkboxes** next to each legend item show/hide individual keyword lines
- **Hover tooltips** on data points display the series name, month, and coefficient value (e.g., "Apr: +12.34%")
- Active coefficient source (selected via radio buttons in the table below) highlights its dots; other series fade to 30% opacity

**Coefficient table** — 12 months (columns) × 3 keywords (rows) + merged "Average" row:
- Per-keyword coefficients shown as percentages (e.g., `+12.34%`, `-5.67%`)
- **Radio buttons** on each row select which coefficient set to apply (individual keyword or merged average)
- **Average** (final row) = mean of the 3 keyword coefficients per month
- Values color-coded: green for positive (above-avg demand), red for negative (below-avg)

On "Apply to Forecast":
1. Saves `seasonality_data` JSONB on the version record (keywords, coefficients, raw CSV data for recalculation)
2. Writes `category_coef` values to `forecast_tool_cells` for each forecast month
3. Navigates to the forecast grid

---

## Step 4: Forecast Grid

The main spreadsheet view with metrics as rows and months as columns.

### Layout

| Section         | Metrics                                                                                                                       |
|-----------------|-----------------------------------------------------------------------------------------------------------------------|
| **Aggregate**   | Units Ordered, Ordered Product Sales, Total Order Items, Ad Orders, Ads Orders %, Organic Orders, Organic Orders %    |
| **Advertising** | Sessions, Ad CVR, CVR Estimated, Ad Impressions, Ad Clicks, Ad CTR, Ad Spend, Ad CPC, Ad Revenue, AdACoS, Ad RoAS, Category Coef |
| **Inventory**   | Inventory EOM, Inventory Replenishment, Inventory Coef                                                                |

### Column Layout

```
[Metric Label] [Agg] [Historic months...] [Historic Sum] [Forecast Override] [Forecast months...]
```

- **Agg column** — aggregated (sum/avg) of early historic months outside the displayed range
- **Historic months** — from `historicStart` to the month before `forecastStart`. Data from Redshift.
- **Historic Sum** — sum (or avg for rate metrics) of all historic months
- **Forecast Override** — editable seed values for forecast derivation
- **Forecast months** — from `forecastStart` to `forecastEnd`. Derived from formulas + user overrides.

### Editable vs Derived Metrics

**Always editable (all months):** CPC Ad, CTR Ad, CV Ad, Ad CVR, Ads Order %
- These have no Redshift source. Historical cells show 6-month average as default.
- Step increment inputs (±%/mo) allow progressive change: month2 = avg + step, month3 = avg + 2×step.

**Editable in forecast only:** Spend, Category Coef, CVR Estimated, Replenish Orders

**Derived (never directly editable):**
- **Sessions** (forecast) = `avgHistoricalSessions × (1 + categoryCoef)`
- **Ad Clicks** = `spend / cpc_ad`
- **Ad Impressions** = `clicks / ctr_ad`
- **Ad Orders** = `clicks × cv_ad`
- **Total Order Items** = `ad_orders / ads_order_pct`
- **Units Ordered** = `sessions × cv_amz_estimated`
- **Ordered Product Sales** = `AVG(product_sales)/AVG(units_ordered) × total_order_items`
- **Ad Revenue** = `ad_orders × ad_revenue_price` (price from $/unit override or weighted avg)
- **AdACoS** = `spend / ad_revenue`
- **Ad RoAS** = `ad_revenue / spend`
- **Organic Orders** = `total_order_items - ad_orders`
- **Inventory EOM** = `prev_inv + replenish - units_ordered`
- **Inventory Coef** = `inv_eom / next_month_units`

### Per-ASIN Sub-Rows

Each metric can be expanded to show per-ASIN breakdowns. ASINs have a `share_pct` that determines their proportion of the aggregate values.

### Config Cells

Special cells stored with `month = "_config"`:
- `cv_ad_step`, `ctr_ad_step`, `ads_order_pct_step` — step increment values (decimal, e.g., 0.01 = 1%)
- `ad_revenue_price` — $/unit price override for Ad Revenue calculation

---

## Step 5: Push to Sales Forecast

"Push to Sales Forecast" button rolls up the forecast data and sends it to the Sales Forecast editor for broader business planning.

---

## Data Model

### Tables

**`forecast_tool_versions`**
- `id` (UUID PK), `client_id_code`, `name`, `created_by`, `created_at`
- `is_current` (boolean), `is_locked` (boolean)
- `historic_start`, `forecast_start`, `forecast_end` (varchar(7), e.g., "2026-04")
- `historical_data` (JSONB) — cached Redshift data: `{ "2025-01": { spend: 1234, clicks: 567, ... } }`
- `asin_historical_data` (JSONB) — per-ASIN Redshift data
- `seasonality_data` (JSONB) — `{ keywords, coefficients, rawSearchVolume }`

**`forecast_tool_cells`**
- `id` (UUID PK), `version_id` (FK), `month` (varchar(7)), `metric` (varchar(50)), `value` (numeric)
- Unique constraint: `(version_id, month, metric)`
- Upsert on save

**`forecast_tool_asins`**
- `id` (UUID PK), `version_id` (FK), `asin`, `sku`, `product_name`, `product_price`
- `share_pct` (default 0), `variation_attributes` (JSONB), `is_new`, `sort_order`

**`forecast_tool_asin_cells`**
- `id` (UUID PK), `asin_id` (FK), `month`, `metric`, `value`
- Unique constraint: `(asin_id, month, metric)`

### Seasonality Data JSONB Structure

```json
{
  "keywords": ["protein powder", "whey protein", "protein shake"],
  "coefficients": {
    "01": 0.12, "02": -0.05, "03": 0.03, "04": -0.02,
    "05": 0.08, "06": -0.10, "07": -0.15, "08": 0.01,
    "09": 0.06, "10": 0.11, "11": 0.18, "12": 0.22
  },
  "rawSearchVolume": {
    "protein powder": [
      { "date": "2023-01-07", "volume": 56544 },
      { "date": "2023-01-14", "volume": 56105 }
    ]
  }
}
```

---

## API Endpoints

| Endpoint                                 | Method | Description                                  |
|------------------------------------------|--------|----------------------------------------------|
| `/api/ppc/forecast-tool`                 | GET    | Load version + cells + ASINs + historical data |
| `/api/ppc/forecast-tool/versions`        | GET    | List versions (all clients or per client)    |
| `/api/ppc/forecast-tool/versions`        | POST   | Create new version (+ fetch Redshift data)   |
| `/api/ppc/forecast-tool/versions/[id]`   | PUT    | Update version (name, lock, seasonalityData) |
| `/api/ppc/forecast-tool/versions/[id]`   | POST   | Refresh historical data from Redshift        |
| `/api/ppc/forecast-tool/versions/[id]`   | DELETE | Delete version (FK cascades clean up)        |
| `/api/ppc/forecast-tool/cells`           | PUT    | Upsert cells (batch)                         |
| `/api/ppc/forecast-tool/products`        | GET    | List products for ASIN picker                |
| `/api/ppc/forecast-tool/asins`           | PUT    | Update ASIN cells (share_pct, etc.)          |
| `/api/ppc/forecast-tool/push`            | POST   | Push to Sales Forecast                       |

---

## Key Files

| File                                                        | Purpose                                              |
|-------------------------------------------------------------|------------------------------------------------------|
| `src/app/sales-summary/forecast-v2/page.tsx`                | Main page with routing (landing → seasonality → grid) |
| `src/components/ppc/forecast-tool/version-manager.tsx`      | Version creation UI + ASIN picker                    |
| `src/components/ppc/forecast-tool/seasonality-step.tsx`     | 4-phase seasonality wizard                           |
| `src/components/ppc/forecast-tool/forecast-grid.tsx`        | Main forecast spreadsheet grid                       |
| `src/components/ppc/forecast-tool/forecast-calculations.ts` | Pure derivation functions                            |
| `src/app/api/ppc/forecast-tool/route.ts`                    | Main data loading API                                |
| `src/app/api/ppc/forecast-tool/versions/route.ts`           | Version CRUD                                         |
| `src/app/api/ppc/forecast-tool/versions/[id]/route.ts`      | Version update + Redshift refresh                    |
| `src/app/api/ppc/forecast-tool/cells/route.ts`              | Cell upsert API                                      |
| `src/lib/db/schema.ts`                                      | All table definitions (lines 1865-1944)              |
| `src/lib/forecast-redshift.ts`                              | Redshift query functions                             |

---

## Redshift Data Dedup Pattern

Redshift `account_summary` has ~100× duplicate rows per day for some months. All queries use:

```sql
SELECT month, SUM(metric) FROM (
  SELECT report_date,
         DATE_TRUNC('month', report_date) AS month,
         MAX(metric) AS metric
  FROM account_summary
  WHERE account_id = ?
  GROUP BY report_date
) sub
GROUP BY month
```

Inner query: MAX per day (dedup). Outer query: SUM per month.

---

## Key Formulas Summary

| Metric                 | Historical | Forecast                                                     |
|------------------------|------------|--------------------------------------------------------------|
| Sessions               | Redshift   | `avgHistSessions × (1 + categoryCoef)`                      |
| Ad Clicks              | Redshift   | `spend / cpc_ad`                                             |
| Ad Impressions         | Redshift   | `clicks / ctr_ad`                                            |
| Ad Orders              | Redshift   | `clicks × cv_ad`                                             |
| Total Order Items      | Redshift   | `ad_orders / ads_order_pct`                                  |
| Units Ordered          | Redshift   | `sessions × cv_amz_estimated`                                |
| Ordered Product Sales  | Redshift   | `AVG(product_sales)/AVG(units_ordered) × total_order_items`  |
| Ad Revenue             | Redshift   | `ad_orders × ad_revenue_price`                               |
| AdACoS                 | Redshift   | `spend / ad_revenue`                                         |
| Inventory EOM          | Redshift   | `prev_inv + replenish - units_ordered`                       |
| Inventory Coef         | Derived    | `inv_eom / next_month_units`                                 |
| Category Coef          | Derived    | `inv_eom / next_month_units` (historic) or user input (forecast) |
