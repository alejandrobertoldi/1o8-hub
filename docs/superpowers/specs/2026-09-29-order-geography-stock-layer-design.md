# Order Geography — FBA stock layer (design)

**Date:** 2026-09-29 · **Status:** design approved in chat by Manu (2026-09-29); pending written-spec review
**Builds on:** `docs/superpowers/specs/2026-09-28-fba-inventory-map-design.md` (data, route, caching, FC lookup — all
binding and unchanged) and `docs/superpowers/specs/2026-09-29-fba-map-state-view-design.md` (per-state circles,
`groupByState`, circle labels — reused as-is).
**Branch:** `thread-z/fba-inventory-map` (worktree `/Users/manu/MFHub/.worktrees/thread-z-fba-map`), before the PR.

## 1. Purpose

Manu wants the FBA stock map merged into **Order Geography as a layer**, with Order Geography as the base page. Staff
then read, on one map, where orders land (existing shading) and where Amazon holds the stock (circles), and click a
state to see both its orders and its fulfilment centres.

### Decisions (Manu, 2026-09-29)
- Order Geography stays and is the base; the stock layer is **added** to it.
- The standalone **FBA Inventory Map page and tab stay** as they are for now.
- The stock month is the **latest storage-fee month that overlaps the selected date range**, changeable via a month
  picker limited to months overlapping the range, and always labelled (`Stock: Aug 2026 snapshot`).
- Approach A: a **hub-only `stockLayer` flag** on the existing `OrderGeographySection`; the stock code stays in
  `src/components/reports/fba-inventory-map/` and `src/lib/fba-inventory-map/`, imported one-way.

### Success criteria
- Hub `/reports/order-geography`: an "FBA stock" toggle on the map card, **off by default**; turning it on draws one
  labelled circle per state over the existing order shading, without changing the shading.
- With the layer on, the **State detail** panel gains an "FBA stock · {Mon YYYY}" block for the selected state.
- Clicking a circle selects that state in Order Geography's existing State detail panel (one selection, not two).
- **(Manu review, 2026-09-29)** The stock block shows a **zoomed map of the selected state** with its FCs geolocated
  inside it — one dot per FC metro at its real projected position (§3.7).
- Order Geography's product filter also filters the stock layer.
- **Portal** `/portal/reports/order-geography` is byte-for-byte unchanged in behaviour and never calls the stock API.
- Layer off (and portal) ⇒ **zero** requests to `/api/reports/fba-inventory-map`.

### Out of scope
- Any change to `/api/reports/fba-inventory-map`, `/api/reports/order-geography`, their queries or caches.
- Any change to `us-choropleth.tsx`, the FBA Inventory Map page, or the portal page.
- Averaging stock across the range (rejected option: needs new SQL + cache).
- Persisting the toggle in the URL or storage.
- The FBA page's division card and FC table (they stay on the FBA page only).

## 2. Reconciling the two maps

| | Order Geography (base) | FBA stock (layer) |
|---|---|---|
| Time | trailing range `start..end` (YYYY-MM-DD) | one month (`YYYY-MM`) |
| Metric on map | shading = gross product sales per ship-to state | circle area = avg FBA units on hand per state |
| Product filter | `asinFilter` (client-side, over the loaded report) | `?asin=` on the stock API |
| Access | hub + portal | hub staff only |

Rules:
- **Month.** A month `M` *overlaps* the range iff `M-01 <= end` and `monthLastDay(M) >= start` (string compare,
  `YYYY-MM-DD`). Candidate months = the stock API's `availableMonths` that overlap; default = the latest candidate.
  No candidate ⇒ label "No stock report in this range", no circles, no stock block.
- **Product.** Layer asin = `null` when Order Geography shows all products, else Order Geography's `asinFilter`.
- **Gap (stock vs orders)** for the selected state, in the stock block:
  `stockShare = stateStockUnits / stock.totals.placedUnits` (placed-only, matching the FBA page's division card) and
  `orderShare = statsFor(state).units / Σ_states statsFor(s).units` — Order Geography's own **units** under the current
  range + product filter, so the gap describes the map being looked at. `gapPts = (stockShare − orderShare) × 100`,
  toned with the existing `gapTone` (±5 pts). No orders at all (Σ = 0) ⇒ no gap line.
- **Selection.** One `selectedState` (Order Geography's existing state). Circles call the same setter. Re-click
  behaviour stays whatever Order Geography does today (its choropleth toggles; circles select).

## 3. Units

### 3.1 `src/lib/fba-inventory-map/month.ts` — add (pure)
```ts
/** Months from `months` (any order) overlapping start..end, newest first. */
export function monthsOverlapping(months: string[], start: string, end: string): string[];
```
Uses the existing `monthLastDay`. Invalid inputs are not validated here (callers pass API/page values).

### 3.2 `src/components/reports/fba-inventory-map/use-stock-layer.ts` — new (client hook)
```ts
export type StockLayerState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-month" }                       // no stock month overlaps the range
  | { status: "ok"; month: string; months: string[]; data: FbaMapResponse; bubbles: StateBubble[] };
export function useStockLayer(p: {
  enabled: boolean; accountId: string; start: string; end: string; asin: string | null; month: string | null;
}): StockLayerState;
```
- `enabled === false` ⇒ `{status:"off"}` and **no fetch**.
- Fetch `/api/reports/fba-inventory-map?accountId=…[&month=…][&asin=…]`. With `month === null` it first calls
  without `month`; if the response's `month` is not among `monthsOverlapping(availableMonths, start, end)`, it
  refetches with the latest overlapping month (or returns `no-month` when there is none). Stale responses are ignored
  (same `live` guard pattern as `fba-inventory-map-section.tsx`). Non-JSON bodies → `error` with `HTTP {status}`.
- `bubbles = groupByState(data.dots, data.totals.units)`.

### 3.3 `src/components/reports/fba-inventory-map/stock-layer-controls.tsx` — new
Props: `enabled`, `onToggle(next: boolean)`, `layer: StockLayerState`, `onMonth(m: string)`.
- Pill toggle "FBA stock" (`h-9 rounded-full px-3 text-[13px] font-medium`, pressed state via `aria-pressed`).
- When on: month `<select aria-label="Stock month">` of `layer.months` (only in `ok`), the label
  `Stock: {Mon YYYY} snapshot`, and, when `data.unplaced.units > 0`, a muted note
  `{N} units ({P}%) couldn't be placed on the map`. `loading` → "Loading stock…"; `error` → the message + Retry is
  NOT added (toggle off/on retries); `no-month` → "No stock report in this range".

### 3.4 `src/components/reports/fba-inventory-map/state-stock-block.tsx` — new
Props: `bubble: StateBubble | null`, `stateCode: string`, `month: string`, `placedUnits: number`,
`orderShare: number | null`.
- Micro-label `FBA stock · {Mon YYYY}`; units · of all stock · est. fee; the gap line (when `orderShare !== null`);
  the FC list (code · place · units · share · fee · amber `approx.` badge outside the truncating text) — the same rows
  as the FBA page's `StatePanel`.
- `bubble === null` ⇒ `No FBA stock in {State} in {Mon YYYY}.` (with asin filter: `…for this product…`).
- **Refactor for reuse:** the FC-row list is extracted from `state-panel.tsx` into
  `state-fc-list.tsx` (`StateFcList({ fcs })`) and used by both; `StatePanel`'s rendered output is unchanged
  (its existing tests stay green unmodified).

### 3.7 State mini-map — `src/components/reports/fba-inventory-map/state-mini-map.tsx` — new (added at Manu's review)
Props: `stateCode: string`, `metros: Dot[]` (the stock payload's metro-group dots whose `state === stateCode`).
- **Data:** `StateBubble` (Task 1 of the state-view plan) gains `metros: Dot[]` — the source dots grouped into that
  bubble, units desc. Additive; `groupByState`'s existing tests stay green.
- **Frame:** `viewBox` = the bounding box of `pathVertices(US_STATE_PATHS[stateCode])` (`src/lib/us-map-geometry.ts`)
  padded by 8% of its larger side; one `<path>` for the state, fill `var(--muted)`, stroke `var(--border)`,
  `vectorEffect="non-scaling-stroke"`. Rendered at the card's width, `max-h-[220px]`, aspect preserved.
- **Dots:** one per metro dot at its `x/y` (already in the national map's coordinate space, so no new projection).
  Radius √-scaled by units within the state, expressed as a fraction of the box's larger side (min 1.8%, max 7%) so
  dots read the same size on CA and RI. Metro dots solid (`var(--foreground)` @0.85, `var(--card)` stroke);
  approximate dots (S+state, placed at the state anchor) hollow with a dashed stroke and title
  "Location approximate (state only)". Largest first so small dots stay on top.
- **Labels:** the metro's short name (text before the comma, e.g. "Stockton") next to the **top 6** dots by units;
  every dot has a `<title>` with `{metro} · {units} units · {FC codes}`.
- **Out-of-frame guard:** a dot whose point falls outside the padded box (AK/HI insets, PR, or a coastal metro the
  simplified outline clips) is not drawn; its FCs still appear in the FC list. Pinned by a test.
- **Where it appears:** at the top of the "FBA stock" block in Order Geography's State detail (§3.4), **and** at the
  top of the FBA Inventory Map page's `StatePanel`, so both pages show the same state view. Ruling: shared, because
  both panels show the same FC list for the same state; cost if wrong: one prop to hide it on the FBA page.

### 3.5 `src/components/reports/v2/order-geography-section.tsx` — modified
- New optional prop `stockLayer?: boolean` (default `false`). Hub page passes `stockLayer`; portal does not.
- Local state `stockOn` (default `false`) and `stockMonth: string | null` (reset to `null` when account or range
  changes). `const layer = useStockLayer({ enabled: stockLayer && stockOn, accountId, start, end,
  asin: asinFilter === ALL_ASINS ? null : asinFilter, month: stockMonth })`.
- Map card: `<StockLayerControls …/>` rendered above the `UsChoropleth` only when `stockLayer`; `UsChoropleth` gets
  `overlay={layer.status === "ok" ? <StateBubbleOverlay bubbles={layer.bubbles} selected={selectedState}
  onSelect={setSelectedState} onHover={…}/> : undefined}` and a circle tooltip (name · units · share · fee).
- State detail: when `layer.status === "ok"` and a state is selected, render `<StateStockBlock …/>` after the
  existing summary; `orderShare` from `statsFor` as in §2.
- **No hub-orange hex literal** may be added to this file (`no-hub-orange.test.ts` scans `src/components/reports/v2/`).
- The file's existing behaviour with `stockLayer` absent is unchanged.

### 3.6 `src/app/reports/order-geography/page.tsx` — pass `stockLayer` to `OrderGeographySection`. Nothing else.

## 4. Edge cases
- **Range with no stock month** → `no-month` (label, no circles, no block).
- **Product with no stock** that month → circles empty; block says `No FBA stock for this product in {State} in {Mon}.`
- **Account switch / range change while on** → `stockMonth` resets to `null`; the hook re-derives the default month.
- **Demand shading zero for a stocked state** → circle still drawn (stock without orders is exactly what to see).
- **Stock API error** → controls show the message; Order Geography itself keeps working.
- **Portal** → no toggle, no fetch, no import side effects beyond bundling.

## 5. Testing
- `month.test.ts`: `monthsOverlapping` — full-month inside, partial overlap at both ends, none, ordering newest first,
  range inside one month.
- `use-stock-layer` (via a tiny harness component): off ⇒ no fetch; on ⇒ fetch; asin appended; default month outside
  range ⇒ second fetch with latest overlapping month; none overlapping ⇒ `no-month`; stale response ignored.
- `order-geography-section.test.tsx`: no toggle without `stockLayer`; toggle off by default and zero stock fetches;
  toggling on fetches stock and renders `[data-bubble]` circles; circle click selects the state and the detail shows
  the stock block; product filter passes `asin`; existing tests unchanged and green.
- `state-panel` existing tests green after the `StateFcList` extraction.
- `state-mini-map.test.tsx`: viewBox encloses the state's vertices; one dot per metro at its x/y; approximate dot hollow;
  labels only on the top 6; a dot outside the box is skipped; `groupByState` returns `metros` per state.
- Gates: scoped vitest (incl. `no-hub-orange`), tsc 0 in touched files, eslint on touched files.
- Browser pass on `localhost:3101`: Mission + ReadyRESCUE, 365-day range and a Custom past range; screenshots.

## 6. Hard constraints
No new npm dependency; dates as strings; DESIGN.md for all UI; no hub-orange hex under `src/components/reports/v2/`;
never push/PR/merge without Manu's per-action OK; explicit-pathspec commits, trailer
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
