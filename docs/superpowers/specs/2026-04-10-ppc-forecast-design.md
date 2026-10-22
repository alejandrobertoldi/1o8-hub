# PPC Forecast Page — Design Spec

## Overview

Replicate the spreadsheet-style PPC Forecast view (screenshot reference) as a web page in 1o8Hub. Shows monthly actual sales and ad spend from Redshift broken down by Amazon channel (SC, VC, Whole Foods), editable forecast values, computed balance rows, ROAS, and a combined bar chart.

Two entry points:
- **Hub** (`/sales-summary/forecast`): client dropdown selector, editable forecast cells
- **Portal** (`/portal/sales/forecast`): locked to logged-in client, read-only forecasts

## Approach

Rewrite the existing `ForecastEditor` component (`src/components/analytics/forecast-editor.tsx`) with the full spreadsheet layout. Extend its props to accept per-channel data. Both hub and portal pages pass the same component with `readOnly` prop.

New API endpoint `/api/ppc/forecast` returns monthly data grouped by sibling channels for a given brand.

## Data Model

### Existing (no schema changes)

- **`client_forecasts` table**: stores `(clientIdCode, month, metric, forecastValue)`. Metric values: `"product_sales"`, `"ad_spend"`. Forecasts are stored against the primary client code (e.g., `PUR_SC_US`), not per-channel.
- **`/api/forecasts`**: GET/PUT already works. No changes needed.

### Sibling Channel Detection

Clients are grouped by brand prefix extracted from client code:
- `PUR_SC_US` → brand `PUR`, channel `SC`, country `US`
- `CHE_VC_US` → brand `CHE`, channel `VC`, country `US`
- `C23_WF_US` → brand `C23`, channel `WF`, country `US`

Algorithm: split `clientIdCode` by `_`, first segment = brand prefix. Query AAC for all active clients with same prefix. Map channel codes to display labels:
- `SC` → "Amazon SC"
- `VC` → "Amazon VC"
- `WF` → "Whole Foods"
- Others (e.g., `WM`) → use as-is

### New API: `GET /api/ppc/forecast`

**Query params:**
- `clientIdCode` (required) — any client code in the brand group

**Response:**
```json
{
  "brand": "Pura",
  "primaryClientIdCode": "PUR_SC_US",
  "marketplace": "Amazon SC",
  "country": "US",
  "latestDate": "2026-04-07",
  "months": ["2025-01", "2025-02", ..., "2026-12"],
  "daysIncluded": {
    "2025-01": { "included": 31, "total": 31 },
    "2026-04": { "included": 7, "total": 30 }
  },
  "channels": [
    {
      "key": "SC",
      "label": "Amazon SC",
      "clientIdCode": "PUR_SC_US",
      "accountId": "2706460",
      "sales": { "2025-01": 1196.00, "2025-02": 1188.00 },
      "adSpend": { "2025-01": 870.00, "2025-02": 1624.00 }
    },
    {
      "key": "VC",
      "label": "Amazon VC",
      "clientIdCode": null,
      "accountId": null,
      "sales": {},
      "adSpend": {}
    },
    {
      "key": "WF",
      "label": "Whole Foods",
      "clientIdCode": null,
      "accountId": null,
      "sales": {},
      "adSpend": {}
    }
  ],
  "forecasts": {
    "product_sales": { "2026-04": 7824, "2026-05": 8294 },
    "ad_spend": { "2026-04": 3000, "2026-05": 3000 }
  }
}
```

**Implementation:**
1. Look up the given client code in AAC to get brand prefix
2. Query all active AAC entries with same prefix → get sibling client codes + IntentwiseIDs
3. For each sibling with an IntentwiseID, query Redshift `account_summary`:
   ```sql
   SELECT account_id,
          TO_CHAR(report_date, 'YYYY-MM') AS month,
          SUM(product_sales) AS product_sales,
          SUM(ad_spend) AS ad_spend,
          COUNT(DISTINCT report_date) AS days_included
   FROM intentwise_ecommerce_graph.account_summary
   WHERE account_id IN (...)
     AND report_date >= '{prevYear}-01-01'
   GROUP BY account_id, TO_CHAR(report_date, 'YYYY-MM')
   ORDER BY 1, 2
   ```
4. Query `client_forecasts` for the primary client code
5. Compute `daysIncluded` (days with data vs calendar days per month)
6. Query latest `report_date` for the "Latest Included Date" display
7. Always return 3 standard channel slots (SC, VC, WF) — empty if no sibling exists

## UI Component: ForecastEditor (Rewrite)

### Props

```typescript
interface ForecastEditorProps {
  data: {
    brand: string;
    primaryClientIdCode: string;
    marketplace: string;
    country: string;
    latestDate: string;
    months: string[];
    daysIncluded: Record<string, { included: number; total: number }>;
    channels: Array<{
      key: string;
      label: string;
      clientIdCode: string | null;
      accountId: string | null;
      sales: Record<string, number>;
      adSpend: Record<string, number>;
    }>;
    forecasts: {
      product_sales: Record<string, number>;
      ad_spend: Record<string, number>;
    };
  };
  readOnly?: boolean;
}
```

### Header Section

Dark background bar at the top of the component:
- Left: 1o8 Agency logo/text
- Center: "PPC FORECAST" title, Client name, Marketplace, Country
- Right: "EDITABLE CELLS IN YELLOW" badge (hidden when readOnly), "Latest Included Date: {date}"

### Table Layout

Horizontally scrolling table. Sticky first 4 columns (Account ID, Source dropdown, Frequency, Metric label).

**Fixed columns:**
| Col | Content                                                    | Width |
|-----|-----------------------------------------------------------|-------|
| A   | Account ID (Intentwise ID)                                | 80px  |
| B   | Source (`product_sales` / `ad_spend` dropdown-style label) | 120px |
| C   | Frequency (`MONTHLY`)                                     | 90px  |
| D   | Metric label (e.g., "Sales Amazon SC")                    | 160px |

**Scrolling columns:** One per month (Jan/2025 → Dec/2026, 24 months). Min width 72px each.

**Row 0 — Days header:** "Included Days of Month:" label, then `{included}/{total}` per month column.

**Rows — Sales group:**
| #   | Label               | Data source             | Style                            |
|-----|---------------------|-------------------------|----------------------------------|
| 1   | Sales Amazon SC     | channel[SC].sales       | Normal, shows accountId in col A |
| 2   | Sales Amazon VC     | channel[VC].sales       | Normal                           |
| 3   | Sales Whole Foods   | channel[WF].sales       | Normal                           |
| 4   | **Sales Global**    | Sum of channels         | **Bold**                         |
| 5   | **Sales Forecast**  | forecasts.product_sales | **Yellow bg, editable**          |
| 6   | **Sales Balance**   | Forecast − Global       | Green (+) / Red (−)             |

**Rows — Ad Spend group:**
| #    | Label                   | Data source         | Style                     |
|------|-------------------------|---------------------|---------------------------|
| 7    | Ad Spend Amazon SC      | channel[SC].adSpend | Normal, shows accountId   |
| 8    | Ad Spend Amazon VC      | channel[VC].adSpend | Normal                    |
| 9    | Ad Spend Whole Foods    | channel[WF].adSpend | Normal                    |
| 10   | **Ad Spend Global**     | Sum of channels     | **Bold**                  |
| 11   | **Ad Spend Forecast**   | forecasts.ad_spend  | **Yellow bg, editable**   |
| 12   | **Ad Spend Balance**    | Forecast − Global   | Green (+) / Red (−)      |

**Row 13 — ROAS:** Sales Global / Ad Spend Global per month. Display as `$X` (dollar value).

### Editable Cells

- Yellow background (`bg-amber-50 dark:bg-amber-950/20`) for forecast rows
- Click to enter edit mode (inline input)
- Save on blur or Enter via `PUT /api/forecasts`
- Escape to cancel
- Blue ring while editing
- Opacity reduction while saving
- Reuse existing `saveMutation` pattern from current ForecastEditor

### Cell Formatting

- Currency: `$1,196` (no decimals for values ≥ $1, two decimals for < $1)
- Balance: `−$791` in red, `$1,941` in green
- ROAS: `$1` (dollar format)
- Empty cells: blank (no `$0`)

### Chart

Recharts `ComposedChart` below the table, inside the same card.

**Series:**
- Sales Forecast — yellow/gold `Bar` (stacked behind actual)
- Sales Amazon SC — red `Bar` (actual, overlaid)
- Ad Spend Forecast — dark green `Bar`
- Ad Spend Amazon SC — blue/indigo `Bar`

**Config:**
- `ResponsiveContainer` width 100%, height 400px
- X-axis: monthly labels ("Jan/2025", ...)
- Y-axis: auto-scaled currency ($0 - $25,000)
- `LabelList` on bars showing dollar values
- Legend at top with colored squares
- No gridlines (minimal)
- Dark tooltip matching existing pattern (`#1a1a1a` background)

### Dark Theme

The table header and first row of column headers use a dark/black background matching the screenshot. All data cells use the standard card background. Forecast cells use the yellow tint.

## Pages

### Hub: `/sales-summary/forecast` (existing page, rewrite)

```
src/app/sales-summary/forecast/page.tsx
```

- Client dropdown at top (from `/api/sales-summary` clients list, same as current)
- Fetches `/api/ppc/forecast?clientIdCode={selected}` 
- Passes data to `<ForecastEditor data={...} />`

### Portal: `/portal/sales/forecast` (existing page, rewrite)

```
src/app/portal/sales/forecast/page.tsx
```

- No dropdown — uses session `clientIdCode`
- Fetches same API
- Passes `<ForecastEditor data={...} readOnly />`

## Files Changed

| File                                                 | Action                               |
|------------------------------------------------------|--------------------------------------|
| `src/components/analytics/forecast-editor.tsx`       | Rewrite — full spreadsheet + chart   |
| `src/app/api/ppc/forecast/route.ts`                  | New — per-channel monthly data API   |
| `src/app/sales-summary/forecast/page.tsx`            | Rewrite — use new ForecastEditor props |
| `src/app/portal/sales/forecast/page.tsx`             | Rewrite — use new ForecastEditor props |
| `src/app/clients/[clientIdCode]/forecast/page.tsx`   | Update — use new ForecastEditor props  |

## Out of Scope

- Walmart channel (WM codes) — not shown in screenshot, can be added later
- Editable "Included Days" override
- Multiple metric types beyond product_sales and ad_spend
- Export to Excel/CSV
- Forecast auto-fill / projection algorithms
