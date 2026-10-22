# Track 3: Dead Code Removal Report

Date: 2026-04-18
Tool: knip + manual grep verification

## Summary

| Confidence | Count | Action         |
|------------|-------|----------------|
| HIGH       | 15    | Removed        |
| MEDIUM     | 4     | Flagged only   |
| LOW        | 0     | --             |

## HIGH Confidence (removed)

### Unused Files (src/)

| File                                                       | Reason                                                        |
|------------------------------------------------------------|---------------------------------------------------------------|
| `src/components/amazon-sync-summary-widget.tsx`            | Zero imports anywhere in codebase                             |
| `src/components/aplus/aplus-status-badge.tsx`              | Zero imports; replaced by inline status logic in workspace    |
| `src/components/export/bq-explorer.tsx`                    | Zero imports; export page uses different components           |
| `src/components/export/export-tool.tsx`                    | Zero imports; export page uses different components           |
| `src/components/layout/publish-button.tsx`                 | Zero imports; publish flow handled by publish page directly   |
| `src/components/layout/sync-status-button.tsx`             | Zero imports; sync UI moved to admin section                  |
| `src/components/ppc/forecast-tool/asin-breakdown.tsx`      | Zero imports; ASIN breakdown not wired into forecast grid     |
| `src/components/products/completeness-card.tsx`            | Only ref is a commented-out import in product-detail-form     |
| `src/components/products/image-gallery.tsx`                | Zero imports; only mentioned in a JSDoc comment               |
| `src/components/products/impact-card.tsx`                  | Zero imports; separate from `impact/impact-card.tsx` (used)   |
| `src/components/products/product-family.tsx`               | Zero imports; product-pdp uses its own family query           |
| `src/components/publish/publish-review.tsx`                | Zero imports; publish page uses different review flow         |
| `src/components/reports/report-form.tsx`                   | Zero imports; reports page doesn't use this form              |
| `src/lib/impact-capture.ts`                                | Zero imports; snapshot capture never wired up                 |
| `src/types/product.ts`                                     | Zero imports; re-exports types available directly from schema |

### Unused Scripts

| File                              | Reason                                           |
|-----------------------------------|--------------------------------------------------|
| `scripts/run-migration-0002.ts`   | One-time migration script, not in package.json   |

### Unused Exports Cleaned (within kept files)

Commented-out imports removed from `src/components/products/product-detail-form.tsx`:
- `CompletenessCard` import (line 33)
- `ImpactCard` import (line 34)

Dead exports removed from `src/components/ppc/forecast-tool/forecast-calculations.ts`:
- `AsinInputs` interface (only consumer was deleted `asin-breakdown.tsx`)
- `AsinDerived` interface (only consumer was deleted `asin-breakdown.tsx`)
- `calcAsinDerived()` function (only consumer was deleted `asin-breakdown.tsx`)
- `EDITABLE_METRICS` const (zero external consumers)
- `EditableMetric` type (zero external consumers)

## MEDIUM Confidence (flagged, not removed)

| File / Export                                | Reason flagged                                               |
|----------------------------------------------|--------------------------------------------------------------|
| `src/components/ui/scroll-area.tsx`          | Shadcn UI component; may be used in future features          |
| `src/lib/seo-pipeline-types.ts`              | Type-only file; tree-shaken; SEO types may be needed later   |
| `src/test/mocks.ts`                          | Test helper; may be used by future tests                     |
| `scripts/backfill-asana-gids.ts`             | One-time script but Asana integration is active              |
| `scripts/import-attributes.ts`               | May be re-run for attribute data refresh                     |

## Not Removed: Unused Exports in Kept Files

The following exports are unused outside their defining file but were NOT removed because:
- UI component exports (shadcn): standard library pattern, used on-demand
- Internal module exports: used within same file, exported for potential reuse
- Type exports: tree-shaken by bundler, zero runtime cost
- Schema exports: may be used by Drizzle internals

See knip output for full list (35 unused exports, 26 unused type exports).
