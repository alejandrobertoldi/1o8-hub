# Sales Monitor 30D — Design Spec

## Overview

Replicate the Google Sheets "Sales Monitor -30 Days" view as a web page in 1o8Hub. Shows daily PPC + organic sales metrics for a single client over the last 30 days, with goal thresholds and conditional coloring.

Two entry points:
1. **PPC section** — new "Sales Monitor" tab on `/ppc/[clientIdCode]`
2. **Client portal** — new page at `/portal/sales-monitor`, auto-filtered to logged-in client

Both render the same shared component.

## Data Source

### Redshift Query (account_summary)

The existing `/api/sales-summary/daily` route already queries `intentwise_ecommerce_graph.account_summary` and returns daily rows with: `product_sales`, `ad_spend`, `ad_revenue`, `ad_impressions`, `ad_clicks`, `ad_orders`, plus more.

### Goals (AAC rawData)

The AAC table's `rawData` JSONB stores monthly goal fields:
- `SalesForecast1M` — product_sales target ($)
- `ADSpendBudget1M` — ad_spend budget ($)
- `ACOSGoal1M` — ACOS target (%, e.g. "100.00%")
- `TACOSGoal1M` — TACOS target (%, e.g. "50.00%")
- `ROASGoal1M` — ROAS target (number, e.g. "1.00")

### Computed Metrics (per day)

- `ACOS = (ad_spend / ad_revenue) * 100`
- `TACOS = (ad_spend / product_sales) * 100`
- `ROAS = ad_revenue / ad_spend`

## New API Route

### `GET /api/ppc/sales-monitor?clientIdCode=X`

**Auth**: admin, editor, or client (client only for own clientIdCode).

**Response**:
```json
{
  "client": {
    "name": "Pura",
    "marketplace": "Amazon SC",
    "country": "US",
    "intentwiseId": "2706460"
  },
  "goals": {
    "salesForecast1M": 0,
    "adSpendBudget1M": 39.55,
    "adRevenueBudget1M": 13.50,
    "acosGoal1M": 100,
    "tacosGoal1M": 50,
    "roasGoal1M": 1.0
  },
  "latestDate": "2026-04-07",
  "days": [
    {
      "date": "2026-03-09",
      "product_sales": 129.96,
      "ad_spend": 55.10,
      "ad_revenue": 13.50,
      "acos": 292.96,
      "tacos": 42.40,
      "roas": 0.34
    }
  ]
}
```

**Implementation**:
1. Look up AAC row by clientIdCode → extract IntentWiseID, client name, marketplace, country
2. Compute date range: today - 30 days → today
3. Call `queryRedshift` against `account_summary` for daily product_sales, ad_spend, ad_revenue
4. Parse 1M goals from AAC rawData
5. Compute ACOS/TACOS/ROAS per day
6. Return structured response

## Shared Component

### File: `src/components/ppc/sales-monitor.tsx`

Props:
```ts
interface SalesMonitorProps {
  clientIdCode: string;
  isPortal?: boolean; // hides admin-only elements when true
}
```

### Layout (top to bottom)

#### 1. Header Bar

Row with: "Sales Monitor -30 Days" title | Client name | Marketplace badge | Country flag/badge | "Latest: {date}"

#### 2. Summary Cards (6 cards in a row)

| Card          | Value      | Goal            | Color Logic      |
|---------------|------------|-----------------|------------------|
| Product Sales | 30D total  | SalesForecast1M | green if ≥ goal |
| Ad Spend      | 30D total  | ADSpendBudget1M | green if ≤ goal |
| Ad Revenue    | 30D total  | —               | neutral          |
| ACOS          | 30D average | ACOSGoal1M      | green if ≤ goal |
| TACOS         | 30D average | TACOSGoal1M     | green if ≤ goal |
| ROAS          | 30D average | ROASGoal1M      | green if ≥ goal |

Each card shows: metric label, current value (formatted $ or %), goal value, and a colored indicator (green/red dot or border).

#### 3. Expandable Daily Table

Collapsed by default. Toggle button: "Show daily breakdown".

When expanded: horizontal scrollable table.
- **Rows**: product_sales ($), ad_spend ($), ad_revenue ($), ACOS (%), TACOS (%), ROAS (x)
- **Columns**: 30 date columns (newest on left, matching the spreadsheet)
- **Left pinned columns**: Metric name, Goal value
- **Conditional coloring**: Cell background color based on goal proximity
  - ACOS: green if ≤ goal, red if > goal (intensity scales linearly with deviation, max ±50% from goal)
  - TACOS: same as ACOS
  - ROAS: green if ≥ goal, red if < goal
  - product_sales, ad_spend, ad_revenue: neutral (no coloring)

#### 4. Combo Chart (Recharts ComposedChart)

Full-width, ~400px height. 1o8Hub light theme style.

**Left Y-axis** ($): product_sales, ad_spend, ad_revenue
**Right Y-axis** (%): ACOS, TACOS

Chart elements:
- `<Bar>` — product_sales, fill green (#16a34a), barSize 20
- `<Line>` — ad_spend, stroke red (#dc2626), strokeWidth 2
- `<Line>` — ad_revenue, stroke dark/gray (#374151), strokeWidth 2, dot
- `<Area>` — ACOS, fill yellow/amber (#f59e0b) with 20% opacity, yAxisId="right"
- `<Area>` — TACOS, fill dark green (#166534) with 20% opacity, yAxisId="right"
- `<ReferenceLine>` — dashed lines for ACOS goal and TACOS goal on right axis

X-axis: dates (MM/DD format), 30 ticks.
Legend at top.
Tooltip: shows all 5 metrics with formatted values.

## Entry Points

### PPC Tab

In `src/app/ppc/[clientIdCode]/page.tsx`, add "Sales Monitor" as a new tab option.

Tab content renders `<SalesMonitor clientIdCode={clientIdCode} />`.

### Portal Page

New file: `src/app/portal/sales-monitor/page.tsx`

- Reads `clientIdCode` from session
- Renders `<SalesMonitor clientIdCode={clientIdCode} isPortal />` 
- Protected by existing portal middleware (client role)

## Files to Create/Modify

| Action | File                                                     |
|--------|----------------------------------------------------------|
| Create | `src/app/api/ppc/sales-monitor/route.ts`                 |
| Create | `src/components/ppc/sales-monitor.tsx`                   |
| Create | `src/app/portal/sales-monitor/page.tsx`                  |
| Modify | `src/app/ppc/[clientIdCode]/page.tsx` — add tab          |
| Modify | Portal nav (if sidebar exists) — add Sales Monitor link  |

## Non-Goals

- No editing of goals from this view (use AAC spreadsheet page for that)
- No caching layer (30-day Redshift query is fast enough; add later if needed)
- No date range picker (fixed 30D window)
- No multi-client comparison view
