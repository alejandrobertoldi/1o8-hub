# Geography — combined Order Geography + FBA Inventory Map page

**Date:** 2026-09-30 · **Thread:** Z2 · **Branch:** `thread-z2/fba-design-tweaks` · **Status:** design approved in chat, spec awaiting review

## 1. Goal

Replace the two Hub report pages `/reports/order-geography` and `/reports/fba-inventory-map` with ONE page that has a 3-way view switch: **Orders**, **Inventory**, **Both**. Question the "Both" view answers: *is our FBA stock sitting where customers actually order?*

Success: one nav tab instead of two; old URLs keep working; the portal is unchanged.

## 2. Why this is mostly deletion

Two partial "both" views exist today, with different period rules and different demand sources:

| Today | Orders data | Stock data |
|---|---|---|
| Order Geography + "FBA stock" toggle | Redshift, trailing range | newest storage-fee month overlapping the range (`use-stock-layer.ts`) |
| FBA Inventory Map | Postgres order mirror, units ordered in the picked month (Active accounts only, 365-day window) | picked month |

The combined page keeps ONE demand source (Redshift, via the Order Geography API) and ONE stock source (the FBA API).

## 3. Locked decisions

1. **Period rule — two independent pickers.** Orders use the trailing range picker; stock uses a month picker listing **every** available storage-fee month (not only months overlapping the range), defaulting to the newest. No coupling between them.
2. **Misreading guard.** In Both mode the map always carries one caption naming both periods, e.g. `Orders: Jul 1 – Sep 30 · Stock: Aug 2026 snapshot`.
3. **Inventory mode shows no demand shading.** Bubbles only. The Postgres-mirror demand (and its "demand shading is off" notices) is not rendered anywhere.
4. **URL.** `/reports/order-geography?view=orders|inventory|both` survives. Missing/invalid `view` → `orders` (existing links behave as today). `/reports/fba-inventory-map` → redirect to `/reports/order-geography?view=inventory`.
5. **Nav.** One tab, label **"Geography"**, href `/reports/order-geography`. The "FBA Inventory Map" tab is removed.
6. **Portal unchanged.** `/portal/reports/order-geography` passes no stock props and renders no view switch, no stock controls, no "No orders shipped here" (locked in Thread Z).
7. **Look.** Fixed-light `.mf-paper` on the whole page in dark AND light; no `dark:` variants in FBA components. Page title `Order <span class="text-brand">Geography</span>` — the Inventory-Map convention (first word ink, second word brand) applied to a two-word title; the nav tab is the shorter "Geography".
8. Migration 0122 is applied in prod; no `_apply-*` runs. No API changes.

## 4. Controls (header bar via `ReportsControlsBar` `extras`)

Left to right:

1. **View** segmented control `Orders · Inventory · Both` — same compact segmented style as `TrailingRangePicker` (`rounded-lg` track, `px-2 py-0.5 text-xs font-bold`, active = accent fill + white text).
2. **Range picker** (`TrailingRangePicker`) — shown in Orders and Both.
3. **Stock month** select (`monthLabel` options) — shown in Inventory and Both.

`sectionLabel` = "Geography". Refresh button: keeps `refreshSection="order-geography"` in Orders/Both; hidden in Inventory (the FBA report has no refresh endpoint — unchanged behaviour).

State lives in the page and is mirrored to the URL (`view`, `start`, `end`, `month`) with `router.replace` (no history spam). `month` absent → newest available.

**Removed:** the in-map "FBA stock" toggle button and in-map month select (`StockLayerControls` toggle/select), and the FBA page's "View these orders in Order Geography →" link. `StockLayerControls` shrinks to the status line (loading / error / unplaced-units note) or is deleted if nothing remains.

## 5. What each mode renders

| | Orders | Inventory | Both |
|---|---|---|---|
| Stat cards | 4 order KPIs | 4 stock stats (avg units on hand, placed on map, unplaced, est. storage fee) | 4 order KPIs |
| Product filter | OG product filter + Nationwide Products table | FBA product select | OG product filter (also filters stock, as today) |
| Map | revenue choropleth | stock bubbles on an unshaded map | revenue choropleth + stock bubbles |
| Map caption | — | `Stock: <Mon YYYY> snapshot` | `Orders: <start> – <end> · Stock: <Mon YYYY> snapshot` |
| Side panel | State detail, cities, products sold here | `StatePanel` (state stock + FCs), demand rows removed | State detail + `StateStockBlock` (today's behaviour) |
| Below map | Top states | `FcTable` (no `DivisionCallout` — it is demand-vs-stock from the Postgres mirror, which §3.3 rules out) | Top states |
| Footnotes | OG footnotes | — | OG footnotes |

## 6. Component changes

- **`src/app/reports/order-geography/page.tsx`** — owns `view`, range, stock month; renders controls in `extras`; renders `OrderGeographySection` (Orders/Both) or `FbaInventoryMapSection` (Inventory). Title per §3.7, description rewritten to cover both; `<main>` gains `mf-paper` (today only the FBA page has it).
- **`src/app/reports/fba-inventory-map/page.tsx`** — becomes a server component that calls `redirect("/reports/order-geography?view=inventory")`.
- **`OrderGeographySection`** — replace boolean `stockLayer` + internal `stockOn`/`stockPick` state with a controlled prop, e.g. `stock?: { month: string | null }` (absent = no stock, which is what the portal passes). Renders the Both caption. Keeps "No orders shipped here in this window." only when `stock` is set.
- **`useStockLayer`** — drop the `monthsOverlapping` restriction: fetch the given month (or newest when null) and return `months = availableMonths` (newest first). `no-month` state becomes "no storage-fee reports for this account". Page needs `availableMonths` for its picker → the hook (or a light variant) exposes them.
- **`FbaInventoryMapSection`** — becomes controlled for `month` (prop from page); internal month select removed; demand choropleth + `REASON` notices removed; OG link removed. Keeps product select, stats, bubbles, `StatePanel`, FC table; `DivisionCallout` is no longer rendered (component file kept — `gapTone` is still imported elsewhere).
- **`StatePanel`** — demand rows removed (prop `demand` dropped).
- **`top-nav.tsx`** — `REPORT_TABS`: replace the two entries with `{ label: "Geography", href: "/reports/order-geography" }`.

## 7. Error / empty states

- Inventory: existing FBA states kept (error card + Retry, "No FBA storage-fee reports for this account", zero-unit month with product fallback) minus the month-button list, which the header picker now covers.
- Both: order-side states as today; stock errors show in the map status line and the map still renders orders.
- Account switch resets stock month to newest in the same render (existing keyed-state pattern).

## 8. Testing

- Unit (vitest): view param parsing (`orders` default, invalid → `orders`); page renders the right section/controls per view; Both caption text; `useStockLayer` lists all months and defaults to newest; `FbaInventoryMapSection` renders no demand notice/shading; portal Order Geography renders no view switch / stock controls; nav has one "Geography" tab and no FBA tab.
- Existing suites updated, not deleted: FBA dir + `order-geography-section.test.tsx` (baseline 5 files / 60 pass).
- tsc judged by filename (inherited baseline: 8 files, none in reports).
- Pane: all three modes, dark AND light, `fba-design-tweaks-3000`; redirect from `/reports/fba-inventory-map`.

## 9. Parked (not in this change)

- FBA API still computes Postgres demand that no view renders (wasted query time).
- `.claude/launch.json` `fba-design-tweaks-3102` entry is dead.
