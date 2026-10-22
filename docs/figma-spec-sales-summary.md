# SalesSummary — Prototype Spec

**Generated from:** `src/app/sales-summary/` (5 pages)
**Target Figma file:** New file (create via "New design file" in Figma)
**Date:** 2026-05-19

---

## Overview

SalesSummary is a multi-client Amazon performance dashboard for internal 1o8 staff. It shows weekly/custom-period KPIs per client (17 metric rows each), supports inline sparkline popovers, per-product drill-downs, and links out to a Forecast Tool and Inventory Health page. Config lets admins reorder and hide clients.

**Open questions for reviewers:**
- Client card gold header (`#F8BF1C`) — should this use a DS brand token or stay hardcoded?
- The sticky table-header clone is built in JS (not CSS) — should the Figma frame show this as a native sticky header annotation?
- Metric chart popover: show in Figma as a separate "Popover open" frame or as an overlay on the main frame?
- Forecast Tool's SeasonalityStep — included as an overlay state or deferred?

---

## Flows

### Flow 1: Sales Summary Dashboard

**Goal:** View weekly Amazon KPIs across all clients at a glance, drill into metrics and products.
**Entry point:** `/sales-summary` — authenticated hub user navigates from sidebar.

---

#### 1.1 — Loading state

- **Frame size:** 1440×900 (desktop, scrollable — mark fold at 900px)
- **Layout:** 3-row sticky top nav (hub chrome) + main content area with skeleton
- **Top nav row 3 contents:**
  - **Left:** "**Sales**Summary" heading (Geist Sans, `text-[2.2rem]`, tracking-tighter; "Sales" bold `text-sidebar-foreground`, "Summary" normal `text-brand` gold `#E8A700`)
  - Refresh icon button (brand gold, disabled/30% opacity)
  - Settings gear icon (admin only, `text-foreground/50`)
  - Data freshness block: "Redshift data: …" in `text-xs font-mono text-foreground/50`
  - **Right:** Date Slicer pill (glass-card, `rounded-lg border border-border/60 px-3 py-1`) — Week/Custom toggle + Year/Week selectors
- **Main content:** `<LoadingPlaceholder />` skeleton
- **Components:**
  - `<PageMetaSlot>` — hub nav row 3 portal (no DS match)
  - `<LoadingPlaceholder>` — skeleton (no DS match)
  - Date slicer: custom control (no DS match)
- **Interactions:**
  | Element | Trigger | Result |
  |---|---|---|
  | — | Auto | Data loads → state 1.2 |

---

#### 1.2 — Dashboard default (data loaded, Week mode)

- **Frame size:** 1440×2400 (full scroll height — n client cards × ~380px each); fold at 900px
- **Layout:** Top nav (sticky, 64px) + main area (`-mt-6 lg:-mt-8`, padding `p-6 lg:p-10`)
  - Client cards stacked vertically, 16px gap between cards
- **Date Slicer (Week mode):**
  - "**Week**" tab active: `bg-brand text-black shadow-sm`, rounded-md inside `bg-muted/30` pill
  - Year select + Week select dropdowns (`bg-background border border-border/60 rounded-md text-xs font-bold`)
  - Date range display: `text-xs tabular-nums text-foreground/70` e.g. "2026-05-11 – 2026-05-17"
- **Client Card** (repeat per client):
  - **Sticky header:** `bg-[#F8BF1C]` gold, `boxShadow: 0 0 0 2px black`, `rounded-t-xl`, `px-5 py-2`
    - Left: Client name (`text-xl font-bold text-black`), clientIdCode + T{tier} + marketplace (`text-[11px] font-mono text-black/70`), SalesSparkline (7-day mini chart)
    - Right: PPC: [name], AM: [name] (`text-xs text-black/80`)
  - **Metrics table:** `rounded-b-xl glass-card overflow-hidden`, `boxShadow: 0 0 0 2px black`
    - **thead:** `bg-black/80 backdrop-blur-sm`; columns: Metric | Week Goal | {currentLabel} (brand gold) | Trend | {previousLabel} | YoY Trend | {yoyLabel} | MTD | YTD
    - All cells: `border border-black/40 dark:border-white/10 border-[0.5px]`
    - **thead text:** `text-white text-xs font-medium`; current period col is `text-brand`
    - **17 metric rows** (Sales, Org Revenue %, Paid Revenue %, Sessions Mobile/Desktop, Orders, Units, Ad Spend, Ad Revenue, Clicks, Impressions, CTR, ACoS, TACoS, RoAS, NTB Orders, SNS Subscriptions)
    - Row height: `py-0.5` (~24px)
    - Row hover: `bg-brand/[0.02]`
    - Metric cell: `text-xs text-foreground font-medium px-5` — metric label has dashed underline (`border-b border-dashed border-foreground/30`) when hoverable
    - Chevron (expand/collapse) on rows that have product breakdown: `ChevronRight` / `ChevronDown` size-3 `text-foreground/40`
    - Current value: `text-xs text-right font-bold tabular-nums`; goal badge: green pill (`bg-[#34C759]/20 text-[#34C759]`) or red pill (`bg-[#FF5C5F]/20 text-[#FF5C5F]`) if goal set
    - Trend cell: `<Trend>` component — `<TrendingUp>`/`<TrendingDown>` size-3.5 + delta value bold; green `#34C759` good, red `#FF5C5F` bad; `<Minus>` if no data (`text-muted-foreground/30`)
    - YoY Trend column has double-left border (`border-l-2 border-l-black/40`)
- **Components (no DS match — all primitives):**
  - Client card header: frame with gold fill + 2px black outline
  - Metrics table: plain table structure
  - Trend indicators: `<TrendingUp>` / `<TrendingDown>` Lucide icons
  - Date slicer pill: glass-card frame + buttons + selects
  - SalesSparkline: SVG mini chart

- **Interactions:**
  | Element | Trigger | Result | Notes |
  |---|---|---|---|
  | Week/Custom toggle | Click | Switches date slicer UI → refetches data | →1.3 for Custom mode |
  | Year / Week selects | Change | Refetches data for new period | |
  | Refresh icon | Click | Invalidates all sales queries + refetches | Spins while fetching |
  | Settings gear (admin) | Click | → `/sales-summary/config` (Flow 2) | Admin role only |
  | Metric label (dashed) | Hover 300ms | Opens chart popover overlay → 1.4 | Portal-rendered fixed popup |
  | Metric row with `>` chevron | Click | Expands product breakdown sub-rows | →1.5 |

- **Annotations:**
  - **Frame:** Dashboard default — primary action is period selection via date slicer; scroll reveals more client cards
  - **Date slicer:** Week/Custom toggle → refetches all client data for chosen period
  - **Client card header:** Tap anywhere on expanded metric label → chart popover (300ms debounce); tap chevron row → product drill-down
  - **DS Drift:** All client card elements built from primitives — no DS Card/Table/Badge components matched

---

#### 1.3 — Dashboard default (Custom date mode)

- **Frame size:** 1440×2400, fold at 900px
- **Layout:** Same as 1.2 but date slicer shows two `<input type="date">` pickers (start / end) instead of Year/Week selects
- **Custom mode slicer:** "**Custom**" tab active (gold bg); start date input + end date input (`border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold`)
- **Interactions:**
  | Element | Trigger | Result |
  |---|---|---|
  | Start/End date inputs | Change | Refetches data when `start ≤ end` |
  | Week toggle | Click | →1.2 |

---

#### 1.4 — Metric chart popover (overlay)

Draw this as a separate "overlay" frame at the same size as 1.2, with a portal popover positioned below a metric label cell.

- **Popover frame:** `rounded-xl border border-border/60 shadow-2xl p-3 bg-background`, `z-[9999]`; animates `fade-in zoom-in-95 duration-150`
- **Loading state inside popover:** spinning brand-gold circle `size-4 border-2 border-brand border-t-transparent rounded-full`
- **SparklineChart (most metrics):** SVG 360×220 (or wider if many days)
  - Background: transparent
  - Line: `stroke="var(--color-brand)"` strokeWidth 2, smooth cubic bezier
  - Area fill: brand gradient (25% → 2% opacity)
  - Data dots: colored (green if meets goal, red if not, brand otherwise); `r=3.5`; white stroke 1.5
  - Goal line: `stroke="var(--color-destructive)"` strokeWidth 1, dasharray `6 3`, opacity 0.6; label "Goal: {value}" right-aligned `fill-[#FF5C5F] text-[8px] font-bold`
  - Value labels above dots, date labels below
- **SnsYtdChart (SNS Subscriptions):** SVG 560×240
  - Two lines: brand solid (current year) + amber `#E97E05` dashed (year ago)
  - Y-axis grid lines, month x-axis labels
  - Legend in SVG top-left

- **Interactions:**
  | Element | Trigger | Result |
  |---|---|---|
  | Mouse leaves both trigger and popover | Leave | Popover closes (no animation) |

---

#### 1.5 — Product breakdown expanded (overlay on 1.2)

Show as a separate frame or annotation overlay on 1.2.

- **Sub-rows:** `bg-foreground/[0.03]`, `pl-10`, `text-[10px] font-mono`
  - ASIN in `text-blue-600 dark:text-blue-400`
  - Variant parts (color/flavor/style/size) in `text-amber-600 dark:text-brand-orange` separated by `|`
  - Product image tooltip on ASIN hover: `size-20 object-contain` in white popup
- **Product Details collapsible section** (below metrics table): `CollapsibleSection` with BarChart3 icon, SKU count badge, expandable product table mirroring main metrics structure but with Product column (name, ASIN, SKU, listing status badge, variation data)

---

### Flow 2: Config — Client visibility & order

**Goal:** Admin reorders clients and shows/hides them in the Sales Summary.
**Entry point:** Gear icon in Sales Summary nav → `/sales-summary/config`

---

#### 2.1 — Config page (loaded)

- **Frame size:** 1440×900 (desktop, scrollable)
- **Top nav row 3:**
  - Back arrow button (`p-1 rounded-md text-foreground/60 hover:text-foreground`)
  - "**SalesSummary**Config" heading (Geist Sans, `text-[2.2rem]` tracking-tighter; "SalesSummary" bold `text-sidebar-foreground`, "Config" normal `text-brand`)
- **Main content:** `max-w-3xl mx-auto p-6 space-y-4`
  - Description: `text-sm text-foreground/60`
  - **Action bar** (`flex flex-wrap gap-2`):
    - Save button: `bg-brand text-black text-sm font-medium px-3 py-1.5 rounded-md` with Save (floppy) icon
    - Show all / Hide all / Sort A→Z: `border border-border text-sm px-3 py-1.5 rounded-md hover:bg-foreground/5`
    - Success toast: `text-xs text-foreground/50` "Saved HH:MM:SS"
    - Error inline: `text-xs text-red-500`
  - **Client list:** `rounded-lg border border-border divide-y divide-border bg-background`
    - Each row (`flex items-center gap-3 px-3 py-2`):
      - Row number: `text-xs font-mono w-8 text-foreground/40 text-right`
      - Checkbox: `size-4 accent-brand`; if hidden → row `opacity-50`
      - Name: `text-sm font-medium`; clientIdCode: `text-[10px] font-mono text-foreground/40`
      - Up/Down arrows: `ArrowUp` / `ArrowDown` size-14; disabled `opacity-30`

- **Components (no DS match):** Reorderable list, action buttons, inline toast
- **Interactions:**
  | Element | Trigger | Result | Notes |
  |---|---|---|---|
  | Checkbox | Click | Toggles visibility (opacity-50 on row) | Persisted on Save |
  | ↑/↓ arrows | Click | Swaps row with adjacent | First/last row arrows disabled |
  | Save | Click | PUT `/api/sales-summary/config` → success toast or error | Disabled while saving/loading |
  | Show all | Click | Unchecks all hidden clients | |
  | Hide all | Click | Checks all clients as hidden | |
  | Sort A→Z | Click | Sorts list alphabetically by client name | |
  | Back arrow | Click | → `/sales-summary` | |

- **Annotations:**
  - **Frame:** Config page default — primary action is Save to persist reordered/toggled list
  - **Save button:** Click → PUT `/api/sales-summary/config` with ordered array + hidden set; success shows timestamp toast, failure shows inline red error
  - **DS Drift:** No DS match for reorderable list row — built from primitives

---

#### 2.2 — Config loading state

- **Frame size:** 1440×900
- Same nav as 2.1 but main content shows `<LoadingPlaceholder>` where client list would be
- Save/Show all/Hide all/Sort A→Z buttons disabled (`opacity-50`)

---

### Flow 3: Forecast Tool

**Goal:** Create and manage PPC+sales forecast versions per client.
**Entry point:** Sidebar nav → `/sales-summary/forecast-tool`

---

#### 3.1 — Forecast Tool landing (no client selected)

- **Frame size:** 1440×900 (desktop)
- **Top nav row 3:** "**Forecast**Tool" heading (same style — "Forecast" bold `text-sidebar-foreground`, "Tool" normal `text-brand`)
- **Main heading area:** `text-4xl lg:text-5xl font-[family-name:var(--font-geist-sans)] tracking-tighter` — "**Forecast**Tool" bold/normal split; subtitle `text-sm text-muted-foreground`
- **Client grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
  - **Client card:** `rounded-xl border border-border bg-card p-5`; hover: `border-brand/50 shadow-[0_0_12px_var(--brand-glow)]`
    - Brand name `text-base font-semibold`; clientIdCode `text-xs text-muted-foreground font-mono`
    - Tier badge: `text-[10px] font-bold bg-foreground text-background px-1.5 py-0.5 rounded` (e.g. "T1")
    - Marketplace badge: `text-[10px] font-medium text-muted-foreground border border-border px-1.5 py-0.5 rounded`
    - Account manager: `User` icon + name; PPC manager: `BarChart3` icon + name — both `text-[11px] text-muted-foreground`
    - Latest version badge: `bg-brand/10 text-brand font-medium text-[11px] px-1.5 py-0.5 rounded` (e.g. "v2.1")
    - Lock icon `text-amber-500` if version is locked
    - Hover CTA: "Open Forecast" with `TrendingUp` icon `text-brand`, `opacity-0 group-hover:opacity-100`

- **Interactions:**
  | Element | Trigger | Result |
  |---|---|---|
  | Client card | Click | Sets clientIdCode state → loads client forecast view → 3.2 |

- **Annotations:**
  - **Frame:** Forecast Tool landing — click any client card to open forecast editor for that client
  - **DS Drift:** No DS match for client cards — built from primitives (Card frame + text + badges)

---

#### 3.2 — Forecast Tool (client selected, version active)

- **Frame size:** 1440×2000 (scrollable), fold at 900px
- **Sticky header** (`sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-4 pb-2 bg-background space-y-3`):
  - Row 1: Back arrow button (→ 3.1) + "**Forecast**Tool" heading + client name/code subtitle + client selector dropdown
  - Row 2: `<VersionManager>` — version tabs/switcher (external component, no full read)
- **Main content (below sticky header):**
  - Loading spinner while fetching
  - If `showSeasonality`: `<SeasonalityStep>` overlay (modal-like step) — `versionId`, ASIN list, brand name, date ranges; has "Complete" → hides step → `<ForecastGrid>`, and "Skip" → same
  - `<ForecastGrid>` — main forecast table/grid (external component, not read in full)
  - Empty state: "No forecast versions yet" + "Create a new version to get started."

- **Interactions:**
  | Element | Trigger | Result |
  |---|---|---|
  | Back arrow | Click | → 3.1 |
  | Client selector dropdown | Change | Loads new client forecast → refetches |
  | Version Manager (new version) | Click | Shows SeasonalityStep overlay |
  | SeasonalityStep — Complete | Click | Hides SeasonalityStep → shows ForecastGrid |
  | SeasonalityStep — Skip | Click | Hides SeasonalityStep → shows ForecastGrid |

- **Annotations:**
  - **Frame:** Forecast client view — sticky header persists with version tabs; main content is ForecastGrid (complex external component)
  - **VersionManager:** Creating a new version triggers SeasonalityStep flow before ForecastGrid loads
  - **DS Drift:** VersionManager and ForecastGrid are large custom components — no DS match

---

## Supporting pages (lower priority — document separately if needed)

### `/sales-summary/forecast` — Sales Forecast (simple)
- "**Sales**Forecast" heading + optional client dropdown + `<ForecastEditor>` component

### `/sales-summary/inventory` — Inventory Health
- "**Inventory**Health" heading (nav) / "**Inventory**Forecast" heading (page) + client dropdown + `<InventoryForecastTable>`

---

## Component inventory

| Code component | Props in use | DS match | Confidence | Build approach |
|---|---|---|---|---|
| `<PageMetaSlot>` | children | None | — | Primitive (nav portal slot) |
| `<LoadingPlaceholder>` | — | None | — | Primitive skeleton |
| Client card header | bg gold, name, code, tier, sparkline | None | — | Frame primitives |
| Metrics table | 17 rows × 9 cols | None | — | Frame + table primitives |
| `<Trend>` | current, previous, lowerIsBetter | None | — | Icon + text primitive |
| Date slicer pill | mode, week, year, custom dates | None | — | Frame + button + select primitives |
| `<SparklineChart>` | data, goal, format, lowerIsBetter | None | — | SVG primitive (approximate) |
| `<SnsYtdChart>` | timeline | None | — | SVG primitive (approximate) |
| Metric popover | Fixed-position portal overlay | None | — | Frame + SVG primitives |
| Config row | checkbox, up/down arrows | None | — | List item primitives |
| Forecast Tool client card | brand, tier, marketplace, mgrs, version | None | — | Card frame primitives |
| `<VersionManager>` | versions, activeVersionId | None | — | Frame primitive (tabs) |
| `<ForecastGrid>` | cells, asins, months, flags | None | — | Placeholder frame (external component) |
| `<SeasonalityStep>` | versionId, asins, dates | None | — | Overlay frame (external component) |
| `<CollapsibleSection>` | icon, label, count, onToggle | None | — | Primitive |
| Product detail rows | asin, sku, name, variants, metrics | None | — | Sub-row primitives |

All components are custom — no shadcn/ui or design system components are used in these pages.

---

## Design tokens (from source)

| Token | Value | Used on |
|---|---|---|
| `--color-brand` | `#E8A700` (gold) | Active states, current period col, metric lines |
| `#F8BF1C` | Hardcoded | Client card sticky header background |
| `--color-background` | White / dark-mode bg | Card backgrounds, popover bg |
| `--color-foreground` | Near-black / near-white | Body text |
| `--color-sidebar-foreground` | Dark | "Sales" / "Forecast" bold half of heading |
| `text-muted-foreground` | Gray | Secondary text, placeholders |
| `#34C759` | Green | Good trend arrows, goal-met indicators |
| `#FF5C5F` | Red | Bad trend arrows, goal-missed indicators |
| `#E97E05` | Amber | SNS year-ago line, lock icons |
| Font | Geist Sans (headings), system/Inter (body) | |
| Heading style | `text-[2.2rem]` (nav) / `text-4xl–5xl` (page), `tracking-tighter`, `font-[family-name:var(--font-geist-sans)]` | All page headings |
| Border | `border-black/40` (light) / `border-white/10` (dark) | Table cells |

---

## Figma build guide

*For whoever builds this in Figma:*

**Page name:** "SalesSummary — Prototype Flows"

**Sections:**
- "Flow 1: Dashboard" — frames 1.1 → 1.2 → 1.3 left-to-right; 1.4 and 1.5 stacked below 1.2 as overlay variants
- "Flow 2: Config" — frames 2.1 → 2.2 left-to-right
- "Flow 3: Forecast Tool" — frames 3.1 → 3.2 left-to-right

**Frame sizes:** 1440×900 viewport; scrollable frames extend vertically as needed
**Gaps:** 200px between sequential frames, 400px between sections

**All components are primitives** — build every element from `createFrame()`, `createRectangle()`, `createText()`. Do NOT use `figma.createComponent()`.

**Critical visual details to replicate:**
1. Client card header: exact gold `#F8BF1C` fill + `box-shadow: 0 0 0 2px #000` outline (2px solid black ring, no blur)
2. Table header: `rgba(0,0,0,0.8)` background with `backdrop-filter: blur(8px)`
3. Heading split: bold dark half + normal brand-gold half — two text nodes in an HStack, no gap
4. Trend arrows: `#34C759` up (good) / `#FF5C5F` down (bad) with delta value; use `—` (minus) icon for null data
5. Goal chip on current value: pill with green/red tint, bold number
6. YoY Trend column: 2px solid black left border (separator from Period columns)

**DS gaps (design team action items):**
- No Card component in DS with gold accent header + black outline
- No sortable/comparable metrics table pattern
- No hoverable cell with popover chart
- No reorderable list component
- No branded heading pattern (bold/normal split in one typographic unit)
- No client selector card grid pattern (Forecast Tool landing)
