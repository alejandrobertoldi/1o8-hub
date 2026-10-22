# Track 2: Type Consolidation Report

Generated: 2026-04-18

## Summary

| Confidence | Count | Action      |
|------------|-------|-------------|
| HIGH       | 7     | Consolidated |
| MEDIUM     | 4     | Left alone   |
| LOW        | 3     | Left alone   |

---

## HIGH Confidence Findings (Consolidated)

### 1. `AplusModule` — identical `typeof aplusModules.$inferSelect`

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/lib/db/schema.ts`                            | Canonical   |
| `src/components/aplus/module-card-types.ts`       | Re-derives (kept — avoids heavy schema import in client code) |
| `src/components/aplus/aplus-editor.tsx`            | **Removed** — now imports from `module-card-types` |
| `src/components/aplus/aplus-preview-panel.tsx`     | **Removed** — now imports from `module-card-types` |
| `src/components/aplus/aplus-viewer.tsx`            | **Removed** — now imports from `module-card-types` |
| `src/components/aplus/aplus-image-slot.tsx`        | **Removed** — now imports from `module-card-types` |

### 2. `AplusModuleImage` — identical `typeof aplusModuleImages.$inferSelect`

Same files as #1, same consolidation.

### 3. `AplusModuleWithImages` — identical `AplusModule & { images: AplusModuleImage[] }`

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/components/aplus/module-card-types.ts`       | **Added** as canonical |
| `src/components/aplus/aplus-editor.tsx`            | **Removed** |
| `src/components/aplus/aplus-preview-panel.tsx`     | **Removed** |
| `src/components/aplus/aplus-viewer.tsx`            | **Removed** |
| `src/components/aplus/aplus-workspace.tsx`         | **Removed** |
| `src/app/portal/aplus/[productId]/page.tsx`        | **Removed** |

### 4. `AplusStatus` — identical `"draft" | "in_review" | "approved" | "uploaded"`

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/components/aplus/module-card-types.ts`       | Canonical   |
| `src/components/aplus/aplus-editor.tsx`            | **Removed** |
| `src/components/aplus/aplus-workspace.tsx`         | **Removed** |
| `src/components/aplus/aplus-status-badge.tsx`      | **Removed** |

### 5. `CommentPin` — identical shape in 3 files

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/components/aplus/module-card-types.ts`       | **Added** as canonical |
| `src/components/aplus/aplus-workspace.tsx`         | **Removed** |
| `src/components/aplus/aplus-preview-panel.tsx`     | **Removed** |
| `src/app/portal/aplus/[productId]/page.tsx`        | **Removed** |

### 6. `STATUS_OPTIONS` constant — identical array in 3 files

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/components/aplus/module-card-types.ts`       | Canonical   |
| `src/components/aplus/aplus-editor.tsx`            | **Removed** |
| `src/components/aplus/aplus-workspace.tsx`         | **Removed** |

### 7. `FieldSaveState` (aplus domain) — identical in `aplus-image-slot.tsx`

| File                                              | Status      |
|---------------------------------------------------|-------------|
| `src/components/aplus/module-card-types.ts`       | Canonical   |
| `src/components/aplus/aplus-image-slot.tsx`        | **Removed** |

---

## MEDIUM Confidence Findings (Left Alone)

### 1. `CerebroRow` — drift between two definitions

- `src/lib/parsers/cerebro.ts` — 16 fields, `amazon_recommended: number`, plus `organic`, `ppc_bid`, `sponsored`
- `src/lib/seo-pipeline-types.ts` — 13 fields, `amazon_recommended: boolean`, missing 3 fields

**Why left alone:** The shapes have *drifted* — different field count and one field changed type (`number` vs `boolean`). `seo-pipeline-types.ts` is entirely unreferenced (zero imports anywhere in the codebase). It appears to be an outdated spec file. Recommend deleting it in a separate cleanup pass after confirming with the team.

### 2. `FieldSaveState` (product domain)

- `src/components/products/product-field.tsx` — `"idle" | "saving" | "saved" | "error"`
- `src/components/aplus/module-card-types.ts` — identical shape

**Why left alone:** Different domains (product editing vs A+ content editing). Merging would create a cross-domain dependency. The type is a common UI pattern, not a shared domain concept.

### 3. `SyncResult` — three different shapes

- `src/lib/sync-tables.ts` — `{ tables, totalDurationMs, triggeredBy }`
- `src/lib/asana-sync.ts` — `{ synced, created, errors }`
- `src/app/admin/sync/page.tsx` — `{ success, tables, totalDurationMs, triggeredBy }`

**Why left alone:** These are different domain operations (BQ sync vs Asana sync vs UI view model). Same name, different domains. Intentionally distinct.

### 4. `AplusApiResponse` — 4 definitions, subtly different

- `aplus-editor.tsx` includes `setConfig`
- `aplus-viewer.tsx` omits `marketplace` and `setConfig`
- `aplus-workspace.tsx` includes `setConfig`
- `portal/aplus/[productId]/page.tsx` includes `marketplace` but omits `setConfig`

**Why left alone:** Each consumer uses a slightly different subset of the API response. Could be unified with optional fields, but the risk of masking missing data is higher than the benefit.

---

## LOW Confidence Findings (Left Alone)

### 1. `Product` — three definitions, all different domains

- `src/lib/db/schema.ts` — full ORM-inferred type (~940 columns)
- `src/app/variations/[id]/page.tsx` — slim view model (7 fields for variation builder)
- `src/app/portal/products/page.tsx` — slim view model (16 fields for portal products)

**Why left alone:** These are intentionally narrow view models. The schema `Product` type has ~940 columns; using it in UI components would be incorrect and invite runtime issues.

### 2. `DriveFile` — two definitions, different domains

- `src/lib/db/schema.ts` — ORM row (DB record for tracked Drive files)
- `src/lib/drive-client.ts` — Google Drive API response shape

**Why left alone:** Same name, completely different domains (database row vs API response). No consumers confuse them.

### 3. `CerebroParseResult` — two definitions

- `src/lib/parsers/cerebro.ts` — active (imported by `seo/[id]/keywords/page.tsx`)
- `src/lib/seo-pipeline-types.ts` — dead (zero imports)

**Why left alone:** The active definition is correct. The dead one is in an unreferenced file (see MEDIUM #1).

---

## Verification

- **TypeScript**: `npx tsc --noEmit` passes (only pre-existing error: missing `src/app/api/debug/finance/route.ts`)
- **ESLint**: `npm run lint` — no new errors introduced. All warnings/errors in modified files are pre-existing.

## Files Modified

| File                                              | Change                                    |
|---------------------------------------------------|-------------------------------------------|
| `src/components/aplus/module-card-types.ts`       | Added `AplusModuleWithImages`, `CommentPin` |
| `src/components/aplus/aplus-editor.tsx`            | Replaced local types/constants with imports |
| `src/components/aplus/aplus-preview-panel.tsx`     | Replaced local types with imports          |
| `src/components/aplus/aplus-viewer.tsx`            | Replaced local types with imports          |
| `src/components/aplus/aplus-image-slot.tsx`        | Replaced local types with imports          |
| `src/components/aplus/aplus-workspace.tsx`         | Replaced local types/constants with imports |
| `src/components/aplus/aplus-status-badge.tsx`      | Replaced local type with import            |
| `src/app/portal/aplus/[productId]/page.tsx`        | Replaced local types with imports          |

## Recommended Follow-ups

1. **Delete `src/lib/seo-pipeline-types.ts`** — unreferenced file with outdated type definitions (zero imports in entire codebase)
2. **Unify `AplusApiResponse`** — once the API shape stabilizes, create a shared type with optional fields
3. **Consider `src/types/aplus.ts`** — if A+ types grow further, promote `module-card-types.ts` shared types to `src/types/`
