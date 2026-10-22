# Market Foundry ClientReports Dashboard Redesign Brief

## Purpose

This document explains the redesign represented in `market-foundry-dashboard-redesign.html`. The HTML is a standalone visual and interaction draft that can be copied into an AI design system as a reference implementation.

The redesign addresses the full page, including the application header, KPI hierarchy, executive insights, charts, tables, and decision-support area. It preserves the original reporting content while making the page easier to scan, understand, and act on.

---

## Primary UX problem

The original dashboard contains useful data but gives almost every element the same visual weight. Orange fills, dark panels, thick outlines, repeated goal boxes, dense charts, and long tables compete simultaneously for attention.

The redesign introduces a clear information sequence:

1. **What happened?** — executive insights and headline KPIs.
2. **Why did it happen?** — trend, efficiency, traffic, and funnel charts.
3. **Where is the issue or opportunity?** — campaign and keyword diagnostics.
4. **What should the user do next?** — ranked performers, risks, and recommended actions.

---

## Brand application

### Core palette

| Token | Value | Intended use |
|---|---:|---|
| `--mf-orange` | `#FF751F` | Primary emphasis, active state, current-period series, calls to action |
| `--mf-charcoal` | `#2A5059` | Application shell and page background |
| `--mf-charcoal-900` | `#19343B` | Table headers and high-contrast structural elements |
| `--mf-ghost` | `#F0EFF6` | Neutral panels, comparison blocks, inactive controls |
| `--mf-white` | `#FEFEFE` | Main card and table surfaces |
| `--mf-ink` | `#242222` | Primary text |

### Color-use rule

Use Burnt Orange selectively rather than as the background of every card. The target visual balance is approximately:

- 60% white and Ghost White
- 30% Charcoal Blue
- 10% Burnt Orange

Orange should communicate focus or action. It should not be used as general decoration.

### Status colors

Green, red, and amber are retained because users already understand their meaning in analytics products:

- Green: healthy, profitable, above target
- Red: poor efficiency, decline, below target
- Amber: requires attention but is not necessarily critical

Do not use orange as a replacement for positive or negative status.

---

## Layout system

### Page container

- Maximum width: `1760px`
- Horizontal page margin: `16px` on smaller screens
- Desktop vertical section spacing: `40px`
- Card spacing: `16px`
- Main layout foundation: 12-column CSS Grid

### Responsive behavior

- Desktop: 3–4 KPI cards per row and multi-column chart layouts
- Tablet: 2 KPI cards per row and two-column insights
- Mobile: all components stack into one column
- Tables remain horizontally scrollable with sticky headers and sticky first columns

---

## Header update

### Problems addressed

- Controls previously appeared compressed.
- The dashboard name and filters lacked hierarchy.
- Refresh and date controls competed with the brand.

### New structure

- 72px sticky application header
- Clear brand block on the left
- Client, date granularity, date range, comparison, export, and refresh controls on the right
- Burnt Orange reserved for the primary Refresh action
- Header remains visible while users scroll through long tables

### Implementation note

The demo controls are static except for segmented buttons. Connect these controls to the product's existing state and data-fetching layer.

---

## Executive insights

A four-card insight strip is placed before the KPI grid.

### Why

Users should not have to interpret ten cards and three charts before learning the most important performance story.

### Recommended insight types

- Material year-over-year change
- Target variance
- Efficiency risk
- Traffic or conversion anomaly

### Content behavior

Insights should be generated from deterministic business rules initially. AI-generated summaries may be added later, but every insight should remain traceable to visible metrics.

---

## KPI section

### Hierarchy

The three most important revenue metrics use orange hero cards:

- Total Sales
- Organic Sales
- Ad Revenue

Supporting metrics use white cards:

- Ad Spend
- ACoS
- ROAS
- Conversion Rate

This prevents every metric from appearing equally important.

### Card anatomy

Each card contains:

1. Metric label
2. Current-period value
3. Status badge
4. Two supporting comparisons
5. Current and previous-period sparkline

### Removed pattern

Large repeated “Daily Goal” boxes are removed. Targets now appear as compact supporting values or variance badges.

### Formatting

- Primary KPI values: approximately 29–42px
- Labels: 10px uppercase with generous letter spacing
- Status badges: compact pill shape
- Previous-period lines: gray and dashed
- Current-period lines: orange or white on orange cards

---

## Main performance chart

### Objective

Create one dominant business-performance visualization instead of presenting many similarly weighted charts.

### Series

- Total Sales: Burnt Orange line
- Ad Revenue: Green line
- Ad Spend: Purple line
- ACoS status: red or green bars depending on target performance
- ACoS target: Charcoal dashed line

### Interaction recommendation

Production should allow users to toggle:

- Current period
- Previous year
- Target
- Daily, weekly, or monthly granularity

Avoid showing every comparison series by default.

### Summary values

Four compact summary values appear above the chart so users do not need to scroll back to the KPI section.

---

## Supporting chart recommendations

### CPC and conversion rate

Use bars for CPC and a line for CVR. This supports comparison between media cost and outcome quality.

### Clicks, impressions, and CTR

Use bars for impressions and lines for clicks and CTR. The visual treatment should make volume secondary to engagement quality.

### Conversion funnel

Show the path from Sessions to Clicks to Conversions to Sales. This gives non-specialist and executive users an immediate understanding of where volume is lost.

### ROAS by campaign

Use horizontal bars sorted from highest to lowest. Add a target line at ROAS 4.0. Horizontal bars are easier to scan than another time-series chart for campaign comparison.

### Spend versus ROAS scatter plot

- X-axis: Ad Spend
- Y-axis: ROAS
- Bubble size: Ad Revenue
- Bubble color: campaign health or type

This exposes high-spend/low-return campaigns and low-spend/high-return opportunities.

---

## Table redesign

### Problems addressed

- Very dense rows
- Weak column tracking across wide tables
- Total rows blending into data rows
- Search and filter controls visually disconnected from the table
- No immediate indication of good or poor values

### Updated table behavior

- Sticky header
- Sticky first column
- 40–44px row target
- Zebra striping
- Full-row hover state
- Search, filtering, and export inside the table component
- High-contrast total row fixed at the bottom where supported
- Horizontal scrolling for smaller viewports

### Conditional formatting

Apply status backgrounds to ACoS and ROAS values:

- Green for healthy values
- Amber for borderline values
- Red for poor values

Use compact progress bars for CVR or other percentage metrics where a visual magnitude comparison is useful.

### Recommended production features

- Column chooser
- Saved filter views
- Sortable columns
- Pagination or virtualized rows
- Expandable campaign rows
- CSV/XLSX export
- Tooltips defining ACoS, TACoS, ROAS, CTR, and CVR

### Accessibility

Conditional formatting must never rely on color alone. Keep the numeric value visible, and add icons or labels where status needs to be unambiguous.

---

## Campaign and product sections

The full application should use collapsible sections for:

- Campaign Summary
- Campaign Performance
- Product Performance

Only one or two detail sections need to be expanded by default. This will substantially reduce page length and preserve the user's context.

---

## Decision-support section

The page now ends with three concise cards:

- Top performers
- Efficiency risks
- Recommended actions

This is preferable to ending with another table because it converts analysis into a prioritized next step.

### Example deterministic rules

- Flag terms with spend over `$15` and zero conversions.
- Highlight campaigns with ROAS at or above `4.0`.
- Flag campaigns with ACoS above `60%`.
- Suggest budget reallocation toward profitable campaigns with available capacity.

Thresholds must be configurable by account or client.

---

## Typography

Use a modern sans-serif with system fallbacks.

Recommended hierarchy:

| Element | Size |
|---|---:|
| Page title | 26–42px responsive |
| Section title | 18px |
| Card title | 15px |
| KPI value | 29–42px responsive |
| Table header | 11px |
| Table body | 14px |
| Supporting copy | 12px |

Avoid excessively small labels. The original dashboard uses text that becomes difficult to read at normal desktop zoom.

---

## Borders, radius, and shadows

- Small radius: 8px
- Medium radius: 12px
- Large radius: 18px
- Replace thick orange outlines with subtle neutral borders
- Use soft shadows to separate white cards from the Charcoal Blue application background
- Orange borders should be reserved for active or selected states

---

## Interaction notes

The HTML contains a minimal JavaScript interaction for segmented controls. It is only a visual prototype.

The production implementation should connect controls to:

- Date state
- Client/account state
- Comparison period
- Series visibility
- Table filters and sorting
- Export actions
- API loading and error states

Include skeleton loading states and a clear “data unavailable” state rather than leaving blank chart panels.

---

## Accessibility checklist

- Maintain WCAG AA color contrast.
- Provide visible focus styles for all controls.
- Use semantic headings and table markup.
- Include accessible names for filters and buttons.
- Do not communicate status using color alone.
- Support keyboard interaction for segmented controls and collapsible sections.
- Ensure charts have text summaries or accessible data tables.
- Respect reduced-motion preferences if animated transitions are added.

---

## Implementation handoff

### Files

- `market-foundry-dashboard-redesign.html` — complete standalone visual prototype
- `market-foundry-dashboard-redesign-brief.md` — design and implementation guidance

### Recommended component structure

```text
DashboardPage
├── AppHeader
├── ExecutiveInsightGrid
│   └── InsightCard
├── KPISection
│   └── KPICard
├── PerformanceSection
│   ├── CombinedPerformanceChart
│   ├── CPCConversionChart
│   ├── TrafficChart
│   ├── ConversionFunnel
│   ├── ROASRankingChart
│   └── SpendROASScatter
├── DataTableSection
│   ├── TableToolbar
│   ├── DataTable
│   └── TableTotalRow
└── DecisionSupportSection
    └── ActionCard
```

### Design-system primitives

Create reusable primitives for:

- Surface/card
- Button
- Select/input
- Chip/status badge
- Segmented control
- KPI card
- Chart frame
- Table toolbar
- Data table
- Insight/action card

### Data disclaimer

Values in the HTML are representative values taken from the supplied dashboard screenshots. The prototype is not connected to live data and should not be treated as a calculation source.

---

## Acceptance criteria

The redesign is successful when:

- A user can identify overall performance within ten seconds.
- Primary KPIs are visually distinct from supporting metrics.
- Orange represents emphasis rather than filling most of the page.
- Chart titles and legends are readable at normal desktop zoom.
- Tables can be scanned without losing the active row or first column.
- Poor and strong performance are visible without reading every number.
- The page concludes with clear opportunities and risks.
- The layout remains usable on tablet and mobile screens.
