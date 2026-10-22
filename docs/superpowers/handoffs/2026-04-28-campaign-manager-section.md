# Campaign Manager Section — Handoff

**Branch:** `main` (uncommitted Compare Sales work in working tree, see git status)
**Created:** 2026-04-28
**Test client:** `DRC_SC_US`, period `2026-03` (March 2026)

## Goal

Add a Campaign Manager section (Section 02, between Sales Dashboard and Trends) to the monthly report. Mimics Amazon Seller Central's Campaign Manager Performance dashboard: top stat bar with period totals, then a multi-line daily Performance chart.

## Scope decision

- **Metrics in scope:** Impressions, Ad Spend (Amazon's "Total cost"), Ad Revenue (Amazon's "Sales") — these are already in `intentwise_ecommerce_graph.account_summary`.
- **Out of scope (no source data):** Clicks, Purchases (#), Branded searches, Detail page views, New-to-brand purchases. Skip rather than fake. Future iteration: check `ad_account_summary` / `sponsored_products_daily` / similar Intentwise tables for click-level data; ask Manu.

## Files to touch

### 1. Types — `src/components/monthly-report/types.ts`
- Add `'campaigns'` to `SectionId` union and `ALL_SECTIONS`
- Add to `Report`: `campaigns?: CampaignManagerData;`
- Add interfaces:

```ts
export interface CampaignManagerData {
  /** "Mar 1 - Mar 31, 2026" */
  dateRange: string;
  stats: CampaignStat[];
  series: {
    impressions: SeriesPoint[];
    adSpend: SeriesPoint[];
    adRevenue: SeriesPoint[];
  };
}

export interface CampaignStat {
  label: string;   // "Impressions"
  value: string;   // "251,492" or "$5,914.62"
}
```

### 2. SQL — `src/lib/monthly-report/queries/account.ts`
Add `fetchCampaignDailySeries(accountId, start, end)` mirroring `fetchDailySeries`:

```sql
SELECT
  EXTRACT(DAY FROM DATEADD(hour, 2, report_date))::int AS day,
  COALESCE(SUM(ad_impressions), 0) AS impressions,
  COALESCE(SUM(ad_spend), 0)       AS spend,
  COALESCE(SUM(ad_revenue), 0)     AS revenue
FROM intentwise_ecommerce_graph.account_summary
WHERE account_id = $1 AND report_date BETWEEN $2 AND $3
GROUP BY 1 ORDER BY 1 ASC
```

Returns `Array<{day, impressions, spend, revenue}>`. Use `DATEADD(hour, 2, ...)` for the same TZ shift as the other queries.

### 3. Orchestrator — `src/lib/monthly-report/orchestrator.ts`
Add to `Promise.all`:
```ts
fetchCampaignDailySeries(client.accountId, period.start, period.end),
```
Pass to `buildReportData` as `campaignDaily`.

### 4. Builder — `src/lib/monthly-report/build-report-data.ts`
Add `buildCampaignManager(period, daily)`:
- Sum totals for the 3 stats (Impressions, Ad Spend, Ad Revenue)
- Format date range from `period.start`/`period.end` (e.g. "Mar 1 - Mar 31, 2026")
- Day-align each daily series over full month length (reuse the same gap-fill pattern as `buildCompareSales`)
- Return `CampaignManagerData`

Insert `'campaigns'` in `sections` between `'kpis'` and `'mom'`.

### 5. Chart primitive — extend or add
`ComparisonChart` is hardcoded for 2 series with dashed/solid styling. Two options:
- **A (preferred):** Add per-series color override to `ComparisonChart`, accept N series. Smaller diff.
- **B:** New `MultiLineChart.tsx` (~50 lines, copy of ComparisonChart with parametric colors).

Amazon uses dual y-axes (left for clicks/purchases counts, right for $ values). For our 3-metric MVP, scale impressions on left axis (large numbers) and `$` on right axis. Or normalize: pick a single axis and accept asymmetric line magnitudes — simpler.

Recommended: dual-axis with impressions on left, $ on right. Chart shouldn't need a third axis since spend and revenue are both $.

### 6. Section component — NEW `src/components/monthly-report/sections/CampaignManagerSection.tsx`
- Section header: "Section {n} · Campaign Manager", h1 "Campaign <em>Manager</em>"
- Top row: `.stats-bar stats-bar--3` (or `--4` if you compute ROAS) with the 3 stats
- One `.chart-card` with the multi-line Performance chart
- Optional: ACOS = spend/revenue and ROAS = revenue/spend as derived stats

### 7. Wire into `Report.tsx`
Add `campaigns` to the section dispatcher switch.

### 8. Tests
- `orchestrator.test.ts`: mock `fetchCampaignDailySeries`, assert it's called for the current period, assert `report.campaigns` is populated.
- `build-report-data.test.ts`: assert sums match daily inputs and series are day-aligned over full month.

## Known good patterns (steal from this session's work)

- Day-of-month alignment + gap-fill: `buildCompareSales` in `src/lib/monthly-report/build-report-data.ts:177-208`
- Daily SQL with TZ shift: `fetchDailySeries` in `src/lib/monthly-report/queries/account.ts:107-150`
- Parallel orchestrator fetches: `src/lib/monthly-report/orchestrator.ts:32-39`
- Test mock pattern: `src/lib/monthly-report/orchestrator.test.ts`

## Verification

After implementing:
1. `npm test` — expect 219/222 + new tests passing (3 pre-existing PDF route failures unchanged).
2. Run dev server (`PORT=3000 npm run dev`) and navigate to the monthly report for `DRC_SC_US` / `2026-03`. Confirm Section 02 renders with non-zero impressions/spend/revenue and a 31-day chart.
3. Section numbering in KPISection should still show "Section 01" (kpis stays first, campaigns becomes 02).

## Resume prompt

```
Continue monthly-report work in /Users/manu/1o8Hub on main branch.
Read docs/superpowers/handoffs/2026-04-28-campaign-manager-section.md
for the task: add Campaign Manager as Section 02 between Sales Dashboard
and Trends. Test client DRC_SC_US, period 2026-03.

Working tree has uncommitted Compare Sales chart+table work from prior
session — commit-ready, run `git status` to see. Run npm test after each
step. Pre-existing PDF route failures (3) are unrelated; ignore.
```
