# ALR Import — Status Filter

Date: 2026-04-28
Component: Onboarding Step 8 → AIA Catalog Import (ALR)

## Problem

The ALR preview reports listings broken down by status (Active / Inactive / Incomplete) but the importer is all-or-nothing — clicking "Import 333 listings" inserts every row regardless of status. Operators usually only want active products on first import; inactive and incomplete listings often pollute the catalog with broken or sunset items.

## Solution

Add three checkboxes to the ALR preview card that gate which statuses get imported.

### UI

Inline below the count summary:

```
Import:  ☑ Active (159)   ☐ Inactive (115)   ☐ Incomplete (59)
```

- Default: only **Active** checked.
- The bottom-right tally ("N new + M updated, K skipped") and the primary button label ("Import N listings") update live based on the selection.
- The duplicates review table only shows duplicates whose status is currently selected.
- All three unchecked → primary button disabled.

### Behavior

- Status comparison is case-insensitive; rows with statuses outside the three known buckets are non-selectable and never imported (matches existing count-badge behavior, which already lumps unknowns into none of the three).
- Status selection only filters the rows sent to the execute phase. The API contract and parser are unchanged.

## Implementation

All changes live in [src/components/onboarding/aia-catalog-import.tsx](../../../src/components/onboarding/aia-catalog-import.tsx).

1. Add state `selectedStatuses: Set<"Active" | "Inactive" | "Incomplete">`, initialised to `new Set(["Active"])` on each new preview.
2. Derive a `filteredRows` value: `preview.parsedRows.filter(r => selectedStatuses.has(normalize(r.status)))`.
3. Derive `visibleDuplicates`: duplicates whose corresponding row in `parsedRows` (by `rowIndex`) has a selected status.
4. Recompute `updatedCount`, `skippedCount`, and the import button label from `filteredRows` + `visibleDuplicates`.
5. Render three `<label><input type="checkbox">…</label>` controls between the count summary and the duplicates section.
6. In the execute mutation, send `parsedRows: filteredRows` (was `preview.parsedRows`).

No backend, parser, or test-fixture changes required.

## Out of scope

- Selecting individual rows beyond status (already handled per-duplicate via the existing per-row decision dropdown).
- Persisting status preference across imports — defaults reset on each preview.
- Filtering by other ALR fields (price, fulfillment channel, etc.).

## Validation

- Manual: upload an ALR with all three statuses, toggle each checkbox, confirm count + button label + duplicates table update; click Import and confirm only selected-status rows hit the DB.
- Unit test (light): assert that toggling status updates the filtered row count in the component (RTL).
