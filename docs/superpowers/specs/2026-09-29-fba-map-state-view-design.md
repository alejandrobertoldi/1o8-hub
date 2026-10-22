# FBA Inventory Map — state view + state-detail panel (design)

**Date:** 2026-09-29 · **Status:** approved in chat by Manu (2026-09-29), pending written-spec review
**Amends:** `docs/superpowers/specs/2026-09-28-fba-inventory-map-design.md` §5 (UI). Everything in that spec not
named here is unchanged and still binding (data, queries, route, caching, auth, FC lookup, division card, product
filter, Order Geography link).
**Branch:** `thread-z/fba-inventory-map` (pushed at `dcae3af4d`, no PR). This change lands on the same branch before the PR.

## 1. Purpose

Manu tested the per-metro map on ReadyRESCUE and Mission (2026-09-29) and wants a simpler read: **one circle per US
state**, sized by the FBA units held there, and **a click on a state opens a detail card listing every fulfilment
centre (FC) in that state**. The demand shading is already per state, so a per-state circle compares like with like;
the metro split *inside* a state (e.g. LA vs Bay Area in CA) moves from the map into the panel.

### Success criteria
- The map shows at most one circle per state; no hollow "approximate" dots remain.
- Clicking a state's circle (or its shape, where the state has demand data — §3.4) opens that state in the side panel; the state is outlined as selected.
- On load (and after any account / month / product change) the panel shows the state with the most units.
- Each FC listed in the panel belongs to that state; the panel's units sum to the state circle's units.
- The Unplaced stat card reads unambiguously (`7 units · 1%`, not `7·1%`).

### Out of scope
- Any server, route, query, cache or payload change (see §2).
- Changing the division card, the all-FC table, or the product/month pickers.
- A "no selection" / all-states list in the panel (considered, not chosen).

## 2. Approach — regroup in the browser (chosen)

The payload's `dots: Dot[]` already carries, per metro group, `state` (the metro's own state — every metro in
`FC_METROS` is single-state, and exact-code overrides resolve to a metro of the FC's true state), `label`
(metro name, or `"{State} (approx.)"` for S+state FCs), `approximate`, `units`, and `fcs: FcRow[]`. A pure
client-side helper rolls these up by `state`. **`FbaMapBody` / `FbaMapResponse` do not change**, so the 7-day cached
payloads stay valid and the reviewed + browser-tested route/queries are untouched.

Rejected: grouping on the server — changes the payload shape (would invalidate or need a cache-type bump for 7 days
of cached rows) and re-opens reviewed code for no capability the browser lacks.

## 3. Units

### 3.1 `src/lib/fba-inventory-map/state-grouping.ts` (pure, new)

```ts
export type StateFc = FcRow & { place: string; approximate: boolean; shareOfState: number };
export type StateBubble = {
  state: string;            // USPS code
  name: string;             // display name
  x: number; y: number;     // statePoint(state)
  units: number; fee: number;
  share: number;            // units / totals.units (same denominator as the stat row & Dot.share)
  fcs: StateFc[];           // sorted units desc, then code asc
};
export function groupByState(dots: Dot[], totalUnits: number): StateBubble[]; // sorted units desc, then state asc
```
- `place` = the dot's `label` for metro dots; `"Location approximate"` for approximate dots.
- `shareOfState` = fc.units / state units (0 when state units are 0).
- Position = `statePoint(state)` from `src/lib/fc-locations.ts` (already exported, pure).
- A state appears only if it has ≥ 1 FC row (a state whose only FCs have 0 units still appears, with 0 units).
- Unplaced stock is not part of `dots`, so it never reaches the map or the panel (unchanged: stat row + FC table).

### 3.2 `src/components/reports/fba-inventory-map/state-bubble-overlay.tsx` (replaces `fc-dot-overlay.tsx`)
- One `<circle>` per `StateBubble`; radius √-scaled with the existing `dotRadius` (MIN 3 / MAX 22), max = largest state.
- Paint largest first so small states (NJ, DE, MD, CT, RI) stay on top and clickable.
- Style per the original spec: `var(--foreground)` fill @0.85, `var(--card)` 1.5px stroke; the selected state's
  circle gets a `var(--brand)` 2px stroke.
- `onClick` → select that state (the circle sits over the state path, so it must forward the click itself);
  keep the existing hover tooltip (state name, units, share).
- `fc-dot-overlay.tsx` and its now-dead `data-dot="hollow"` path are deleted; `dotRadius` moves with the overlay.

### 3.3 `src/components/reports/fba-inventory-map/state-panel.tsx` (new)
Props: `bubble: StateBubble | null`, `stateCode: string`, `demand: Demand`, `divisionsAvailable: boolean`.
- **Header:** state name; units (`tabular-nums`); share of all stock; est. storage fee.
- **Demand line** (only when `demand.status === "ok"`): the state's demand share (`byState[state] / totalUnits`),
  its stock share, and the gap in pts with the **same ±5-pt badge colours as the division card**.
- **FC list:** code · place · units · share of state · fee, plus a Stone "approx" badge on approximate rows.
- **No stock in a clicked state** (`bubble === null`, state has demand): "No FBA stock in {State}." + its demand share.
- Card styling per DESIGN.md (`rounded-[18px] border border-stone-200 bg-card p-5`, micro-labels, badge table).

### 3.4 `fba-inventory-map-section.tsx` (modified)
- Layout: map + panel in a grid — `lg:grid-cols-3`, map spans 2, panel 1; below `lg` the panel stacks under the map.
- Selection state `selectedState: string | null`, held alongside the existing `selection` object so it resets with
  it: on account / month / product change it becomes `null`, and `null` renders the **top state**
  (`groupByState(...)[0]`). Clicking a state sets it; clicking the selected state again keeps it (the panel is
  never empty while any state has stock).
- The choropleth's existing `selected` / `onSelect` props drive the outline and shape clicks. Pass it the
  **effective** state (the top state while `selectedState` is `null`). `us-choropleth.tsx:159` toggles to `null` when
  the selected state is clicked again — the section's `onSelect` **ignores `null`**, so a re-click keeps the state.
  `us-choropleth.tsx` itself is NOT modified.
- Shape clicks only fire on states that have a choropleth datum (`us-choropleth.tsx:155-161`), i.e. states with
  demand. So: a state with stock but no orders is selectable via its circle only; when demand is unavailable for the
  account, circles are the only click targets. Accepted — every state with stock has a circle.
- **Unplaced stat card:** `"{units} units · {pct}"` (e.g. `7 units · 1%`).
- The legend drops the hollow-dot "Location approximate (state only)" entry; keeps size = units + FBM note.

## 4. Edge cases
- **Empty month / filtered-empty** — unchanged (the existing empty states render before the map).
- **All stock unplaced** — no bubbles; panel shows "No FC in this month could be placed on the map." (no top state).
- **Demand unavailable** — no demand line; clicking a state with no stock shows "No FBA stock in {State}." only.
- **Ties** for top state — broken by state code asc (deterministic, from `groupByState` ordering).
- **DC / PR** — S+state excludes them (original spec); a metro in PR/DC, if ever added, groups under its own code.

## 5. Testing
- `state-grouping.test.ts`: totals conserved (Σ state units == Σ dot units); approximate + metro dots in one state
  merge into one bubble; `shareOfState` sums to 1 per state; ordering + tie-break; positions == `statePoint`.
- `fba-inventory-map-section.test.tsx`: top state preselected; clicking another state (circle AND shape) swaps the
  panel; account/month/product change resets to the new top state; clicking a no-stock state shows its message; re-clicking the selected state keeps it;
  Unplaced card copy.
- Gates: scoped vitest, tsc (0 in branch files), eslint on touched files, `no-hub-orange` unaffected (no files under
  `src/components/reports/v2/` change).
- Browser pass on `localhost:3101` (Thread AA holds 3100): ReadyRESCUE + Mission — one circle per state, NE states
  clickable, panel sums match, dark + light screenshots.

## 6. Hard constraints (from the original spec, still binding)
No new npm dependency; dates as strings; DESIGN.md for all UI; no hub-orange hex under `src/components/reports/v2/`;
never push/PR/merge without Manu's per-action OK; explicit-pathspec commits with trailer
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
