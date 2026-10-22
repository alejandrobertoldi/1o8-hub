# Variation Builder — Bulk Add/Remove by Column Filter + Instant Reaction

**Date:** 2026-06-10
**Route/file:** `/variations/[id]` → `src/app/variations/[id]/page.tsx`
**Status:** Design — pending user review

## Problem

In the Variation Builder, two pain points:

1. **Lag on every add/remove.** Toggling a single ASIN's inclusion (or any
   group change) fires two full `refetchQueries` — one for the 50-product
   pool and one for the *entire* variation (all groups, all nested products,
   all tags). The checkbox flips instantly (it's already optimistic) but the
   rest of the page stalls ~0.5–2s waiting on those refetches.
   Source: `invalidate()` + `invalidateProducts()` at
   `src/app/variations/[id]/page.tsx:1056-1060`, called from `onToggled` etc.

2. **No way to bulk add/remove by attribute.** You can only toggle ASINs one
   at a time (or select-all-visible). There's no way to say "filter to
   Color=Red + Size=Large, then add all matching to the variation / a group."
   Today's column filters are single-value-per-column header dropdowns that
   operate only on the 50 loaded products.

## Goals

- Single add/remove feels instant — no full-page refetch.
- Filter the product pool by **any** available column (standard + dynamic
  theme attributes), multi-value, and bulk **add to / remove from the
  variation** and **add to / remove from a group**, applying to *every*
  matching product, not just the loaded page.

## Non-goals

- Server-side filtering/faceting (see Decision D2).
- Full table virtualization (see Decision D4).
- Changing the assign/unassign/group-members API contracts — they already
  accept `productIds[]`.

## Decisions (locked)

- **D1 — Lag fix = optimistic cache writes.** Replace the post-mutation
  `refetchQueries` calls with `queryClient.setQueryData(...)` that mutate the
  cached `["variation", id]` and `["client-products", ...]` objects in place
  (move product between `ungrouped`/groups, flip `variationRef`/membership).
  A single **debounced background `refetch` ~1.5s after the last change**
  reconciles the server's `variationGroup` display-string rebuild. Net: instant
  UI, eventual consistency, no per-click stall. Applies to single AND bulk ops.

- **D2 — Load the full client pool client-side.** Switch the pool query from
  paginated (50/page) to **fetch-until-complete**: loop `pageSize=100` pages
  until `total` reached, accumulate. Hard cap **2000 products** with a visible
  notice if exceeded. Rationale: theme-attribute columns (Size/Flavor/Color…)
  are parsed *client-side* from the Amazon `VariationThemeName` string; filtering
  them server-side would mean replicating that parse in SQL against a JSONB blob
  — brittle and high-effort. 500–2000 rows of product metadata is trivial to hold
  in memory, and the D1 lag fix means we never re-pay the load cost on each edit.
  *If a single client can exceed ~5000 ASINs, revisit with a server-side path.*

- **D3 — Reuse the AAC chip filter, replacing the header dropdowns.** Drop
  `AacColumnFilterBar` (`src/components/clients/aac-column-filter.tsx`,
  `AacFilters = Record<string, string[]>`) into the builder, fed by the full
  in-memory pool. Columns = standard set (Status, Var ID, Group, Theme,
  Parentage) + dynamic theme-attribute columns, with distinct values + counts
  + `(blank)`, multi-select, OR-within-column / AND-across-column. This
  **replaces** the current single-value header dropdowns — one filter system,
  not two.

- **D4 — Cap rendered rows, not matches.** Render the first ~100 filtered rows
  with a banner: *"N products match — bulk action applies to all N."* Bulk
  actions operate on the full matched ID set, not just rendered rows. Avoids a
  virtualization dependency. (Virtualization can be a later enhancement.)

- **D5 — Bulk targets = both variation and group.** The sticky bulk toolbar
  gains four actions on the selected/matched set:
  - **Add to variation** → `PATCH /assign { productIds }`
  - **Remove from variation** → `PATCH /assign { productIds, unassign: true }`
  - **Move to group ▾** → `PATCH /assign { productIds, groupId }` (already exists)
  - **Remove from group ▾** → `DELETE /groups/[groupId]/members { productIds }`
  Each is **one batched request**, then the D1 optimistic cache write.

## Data flow

```
load builder
  → fetch-until-complete client pool (cap 2000)  ── cached ["client-products", clientId]
  → AacColumnFilterBar (in-memory)               ── filters: AacFilters
        → filtered rows (+ accurate counts)
        → "Select all N matching" → selectedIds (all matches)
  → bulk action (Add/Remove variation | Move/Remove group)
        → ONE batched API call
        → setQueryData: update ["variation", id] + ["client-products"] in place  (instant)
        → debounced background refetch ~1.5s (reconcile display strings)
```

## Components touched

| File | Change |
|------|--------|
| `src/app/variations/[id]/page.tsx` | Pool query → fetch-until-complete; replace header dropdowns with `AacColumnFilterBar`; add "select all matching" + 4 bulk actions; replace `invalidate()`/`invalidateProducts()` with optimistic `setQueryData` + debounced reconcile; rendered-rows cap + match banner |
| `src/components/clients/aac-column-filter.tsx` | Reuse as-is (feed product rows shaped as `Record<string,string>`); minor prop adaptation only if needed — no behavior change |
| `src/app/api/variations/[id]/assign/route.ts` | No change (already accepts `productIds[]`, `groupId`, `unassign`) |
| `src/app/api/variations/[id]/groups/[groupId]/members/route.ts` | No change (already accepts `productIds[]`) |
| `src/app/api/products/route.ts` | No change — fetch-until-complete uses existing `pageSize=100` cap client-side |

## Build order

1. **Lag fix (D1)** — foundation; makes both single and bulk feel instant.
2. **Load-all pool (D2)** — prerequisite for correct "select all matching".
3. **Filter bar + bulk actions (D3, D4, D5)** — the feature surface.

## Risks / mitigations

- **Optimistic drift (D1):** server rebuilds `variationGroup` comma-string;
  optimistic value may briefly differ → debounced reconcile refetch fixes it.
- **Pool > 2000 (D2):** show a notice and fall back to current paginated
  behavior for that client; flag for a future server-side path.
- **Parallel edits:** another session editing the same variation → the
  reconcile refetch picks up their changes within ~1.5s.

## Verification

- Toggle a single ASIN → no visible page stall (RENDER, not just build).
- Filter Color=Red + Size=Large → counts correct against full pool → "Select
  all N matching" selects every match → "Add to variation" → all appear
  instantly, one network call.
- "Remove from group" on a multi-group product removes only that group.
- Reload → server state matches the optimistic UI.
