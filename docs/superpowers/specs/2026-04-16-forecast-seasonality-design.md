# Forecast Tool — Seasonality Step Design

## Overview

Adds a **Seasonality Step** to the Forecast Tool workflow between version creation and the forecast grid. This step uses Helium 10 Cerebro keyword data and Google Trends-style historical search volume to compute monthly Category Coefficients that model seasonal demand fluctuations.

## Full Workflow

```
Landing (client cards) → Version Creation → Seasonality (skippable) → Forecast Grid
                                                    ↑                        |
                                                    └── "Edit Seasonality" ──┘
```

### Step 1: Landing Page (exists — no changes)

Client cards showing brand name, client code, tier, marketplace, AM/PPC manager, and latest version badge. Click a card to enter version view.

### Step 2: Version Creation (exists — no changes)

- ASIN table sorted by Variation ID (parent → children), with checkboxes
- Period pickers: historic start, forecast start, forecast end
- Version name input
- On **"Create"** → version saved to DB → redirect to **Seasonality Step**

### Step 3: Seasonality Step (NEW)

This step has 4 sub-phases. The user can **skip** at any point ("Skip — use flat seasonality" button), which sets all Category Coef values to 0 and navigates directly to the forecast grid.

---

#### 3a — Copy ASINs for Cerebro

**Purpose:** Give the user a ready-to-paste block of ASINs to run a reverse ASIN lookup in Helium 10 Cerebro.

**UI:**
- Read-only text block displaying all selected ASINs, **space-separated**
- "Copy" button → copies to clipboard
- Instructional text: _"Paste these ASINs into Helium 10 Cerebro, run the reverse lookup, and export the results as CSV. Then upload the CSV below."_

---

#### 3b — Upload Cerebro CSV & Select Keywords

**Purpose:** Parse the Cerebro export to find the best keywords that represent category-level demand (for seasonality analysis).

**User action:** Upload a single `.csv` file (the Cerebro export).

**Cerebro CSV schema** (relevant columns):
| Column                 | Description                    |
|------------------------|--------------------------------|
| `Keyword`              | The search term                |
| `Search Volume`        | Monthly estimated search volume |
| _(many other columns)_ | Ignored by the app             |

**Client-side filtering pipeline:**
1. Parse CSV, extract `Keyword` and `Search Volume` columns
2. **Exclude branded keywords** — filter out any keyword containing the client's brand name (case-insensitive). Brand name comes from the client record (`brandName` field).
3. **Exclude long-tail** — drop keywords with 5 or more words. Long-tail keywords are too specific to represent category seasonality.
4. **Minimum volume threshold** — drop keywords with Search Volume < 1,000. Low-volume keywords have noisy seasonal patterns.
5. **Sort by Search Volume descending**

**UI after processing:**
- Table showing top 10 keywords with columns: `Keyword`, `Search Volume`, checkbox
- Top 3 pre-selected by default
- User must select exactly 3 keywords
- "Confirm Keywords" button to proceed

---

#### 3c — Upload Historical Search Volume CSVs

**Purpose:** Upload weekly search volume history for each selected keyword to compute seasonal coefficients.

**User action:** Upload 3 separate CSV files, one per keyword. Each file input is labeled with the keyword name (e.g., "Upload search volume for: protein powder").

**Historical Search Volume CSV schema:**
| Column          | Description                                            |
|-----------------|--------------------------------------------------------|
| `Time`          | Date string, e.g., `1/7/23 0:00` (weekly data points) |
| `Search Volume` | Weekly search volume number                            |

**Client-side calculation per keyword:**

1. **Parse dates** — handle format `M/D/YY H:mm` (Google Trends export format)
2. **Filter to last 2 years** — use only data points within the most recent 24 months from the latest date in the file
3. **Group weekly → monthly** — assign each weekly data point to its calendar month based on the row's date (a row dated Jan 28 goes to January, even if the week spans into February), then sum the weekly volumes within each month
4. **Average same months across years** — if Jan 2023 = 240,000 and Jan 2024 = 260,000, then Jan avg = 250,000
5. **Compute yearly average** — average of all 12 monthly averages
6. **Compute coefficient per month:**
   ```
   coef[month] = (month_avg - yearly_avg) / yearly_avg
   ```
   - Example: if Jan avg = 250,000 and yearly avg = 200,000 → coef = +0.25 (25% above average)
   - Example: if Jun avg = 170,000 and yearly avg = 200,000 → coef = -0.15 (15% below average)

---

#### 3d — Review & Apply Coefficients

**Purpose:** Show the user the computed coefficients and let them confirm before applying.

**UI:**
- Table: 12 months (columns) × 3 keywords (rows) showing each keyword's coefficient
- **Final row: "Category Coef"** — average of the 3 keyword coefficients per month
- Values shown as percentages (e.g., `+12%`, `-5%`)
- All cells are **read-only** at this stage (user can fine-tune in the grid later)
- "Apply to Forecast" button → saves data and navigates to forecast grid

**On "Apply to Forecast":**
1. Save `seasonality_data` JSONB on the `forecast_tool_versions` row
2. Write coefficient values to `forecast_tool_cells` as `category_coef` for each forecast month
3. Navigate to forecast grid

---

### Step 4: Forecast Grid (exists — minor changes)

- **Category Coef row** auto-populated from seasonality data but **remains editable** (user can override per-month)
- **"Edit Seasonality" button** in toolbar → navigates back to Step 3 with existing data pre-loaded:
  - Keywords pre-filled
  - Coefficients shown
  - Raw CSV data available for recalculation if needed
- **Sessions formula** unchanged: `sessions = avgHistoricalSessions × (1 + categoryCoef)`

---

## Data Model

### Schema Change

Add one column to `forecast_tool_versions`:

```sql
ALTER TABLE forecast_tool_versions
ADD COLUMN seasonality_data JSONB;
```

### JSONB Structure

```json
{
  "keywords": ["protein powder", "whey protein", "protein shake"],
  "coefficients": {
    "01": 0.12,
    "02": -0.05,
    "03": 0.03,
    "04": -0.02,
    "05": 0.08,
    "06": -0.10,
    "07": -0.15,
    "08": 0.01,
    "09": 0.06,
    "10": 0.11,
    "11": 0.18,
    "12": 0.22
  },
  "rawSearchVolume": {
    "protein powder": [
      { "date": "2023-01-07", "volume": 56544 },
      { "date": "2023-01-14", "volume": 56105 }
    ],
    "whey protein": [],
    "protein shake": []
  }
}
```

- `keywords`: the 3 selected keywords from Cerebro
- `coefficients`: merged (averaged) monthly coefficients, keyed by 2-digit month (`"01"` = January)
- `rawSearchVolume`: weekly data points per keyword, preserved for recalculation. Each entry has `date` (ISO format YYYY-MM-DD) and `volume` (number).

---

## Component Structure

### New File

- `src/components/ppc/forecast-tool/seasonality-step.tsx` — the full seasonality wizard (sub-phases 3a–3d)

### Modified Files

- `src/app/sales-summary/forecast-v2/page.tsx` — add step routing (version creation → seasonality → grid), add "Edit Seasonality" button
- `src/components/ppc/forecast-tool/forecast-grid.tsx` — Category Coef row reads from seasonality data on mount; add "Edit Seasonality" trigger
- `src/lib/db/schema.ts` — add `seasonality_data` JSONB column to `forecastToolVersions`
- `src/app/api/ppc/forecast-tool/versions/[id]/route.ts` — accept `seasonality_data` in PUT to persist the JSONB + write `category_coef` cells

### No New API Routes Needed

- CSV parsing is entirely client-side (Papa Parse or manual split)
- Saving seasonality data reuses the existing version PUT endpoint
- Writing `category_coef` cells reuses the existing cell save endpoint

---

## Key Decisions

| Decision                      | Choice                                          | Rationale                                                    |
|-------------------------------|--------------------------------------------------|--------------------------------------------------------------|
| Seasonality step required?    | **No — skippable**                               | User may want a quick draft without Helium 10 work           |
| Re-entry from grid?           | **Yes** — "Edit Seasonality" button              | User can add/redo seasonality later                          |
| ASIN copy format              | **Space-separated**, single block + Copy button  | Matches Cerebro input format                                 |
| Keyword selection             | Show top 10, pre-select top 3                    | User can override with domain knowledge                      |
| Keyword filtering             | Exclude branded, 5+ words, <1,000 vol            | Focus on category-level demand                               |
| Historical data range         | Last 2 years                                     | Recent enough to be relevant, enough data for yearly averaging |
| Raw CSV storage               | Yes — in `seasonality_data` JSONB                | Enables recalculation without re-upload                      |
| CSV upload count              | 3 separate files (one per keyword)               | Google Trends exports one keyword per file                   |
| Category Coef formula         | `(month_avg - yearly_avg) / yearly_avg`          | Matches existing grid formula: `sessions × (1 + coef)`      |
| Final coef merge              | Average of 3 keyword coefs per month             | Simple, weights all keywords equally                         |
