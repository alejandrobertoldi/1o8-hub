# Track 4: Circular Dependencies

**Date**: 2026-04-18
**Tool**: madge 8.0.0 (`npx madge --circular --extensions ts,tsx src/`)
**Files scanned**: 566

## Circular Dependencies Found: 3

All three cycles were confined to `src/components/aplus/` -- no cross-domain cycles (lib <-> hooks, components <-> lib) were detected.

### Cycle 1: aplus-comment-thread <-> aplus-workspace

| File                      | Imports from              | What it imports             |
|---------------------------|---------------------------|-----------------------------|
| aplus-comment-thread.tsx  | aplus-workspace.tsx       | `PendingPin` (type-only)    |
| aplus-workspace.tsx       | aplus-comment-thread.tsx  | `AplusCommentThread` (component) |

**Impact**: Type-only back-edge. No runtime issue. Could cause stale HMR in dev.
**Confidence**: HIGH
**Fix**: Moved `PendingPin` type to `module-card-types.ts`. Updated import in `aplus-comment-thread.tsx` to point at `module-card-types`. Added re-export in `aplus-workspace.tsx` for backward compatibility.

### Cycle 2: aplus-module-card -> bodies/background-image-text -> aplus-image-slot -> aplus-module-card

| File                           | Imports from            | What it imports                                      |
|--------------------------------|-------------------------|------------------------------------------------------|
| aplus-module-card.tsx          | bodies/background-image-text.tsx | `BackgroundImageTextBody` (component)         |
| bodies/background-image-text.tsx | aplus-image-slot.tsx  | `AplusImageSlot` (component)                         |
| aplus-image-slot.tsx           | aplus-module-card.tsx   | `ProductFallbackCtx`, `ModuleNamingCtx`, `SetConfigCtx` (React contexts) |

**Impact**: Runtime context values resolved correctly (React contexts are reference-stable), but the circular dependency could cause module evaluation order issues and confuse bundlers.
**Confidence**: HIGH
**Fix**: Changed import in `aplus-image-slot.tsx` from `./aplus-module-card` to `./module-card-types` (where the contexts are actually defined). The module-card re-exports were unnecessary indirection.

### Cycle 3: aplus-workspace <-> aplus-preview-panel

| File                     | Imports from             | What it imports            |
|--------------------------|--------------------------|----------------------------|
| aplus-workspace.tsx      | aplus-preview-panel.tsx  | `AplusPreviewPanel` (component) |
| aplus-preview-panel.tsx  | aplus-workspace.tsx      | `PendingPin` (type-only)   |

**Impact**: Type-only back-edge. No runtime issue. Could cause stale HMR in dev.
**Confidence**: HIGH
**Fix**: Same as Cycle 1 -- `PendingPin` now lives in `module-card-types.ts`. Updated import in `aplus-preview-panel.tsx`.

## Files Modified

| File                                           | Change                                                   |
|------------------------------------------------|----------------------------------------------------------|
| `src/components/aplus/module-card-types.ts`    | Added `PendingPin`, `CommentPin`, `AplusModuleWithImages` types |
| `src/components/aplus/aplus-workspace.tsx`     | Imports types from `module-card-types`; re-exports `PendingPin` for backward compat |
| `src/components/aplus/aplus-comment-thread.tsx`| Import `PendingPin` from `module-card-types` instead of `aplus-workspace` |
| `src/components/aplus/aplus-preview-panel.tsx` | Import `PendingPin`, `CommentPin`, `AplusModuleWithImages`, `AplusModuleImage` from `module-card-types` instead of `aplus-workspace` |
| `src/components/aplus/aplus-image-slot.tsx`    | Import contexts from `module-card-types` instead of `aplus-module-card` |

## Verification

- `npx madge --circular --extensions ts,tsx src/` -- **0 circular dependencies** (was 3)
- `npx tsc --noEmit` -- **0 new errors** (1 pre-existing error in `.next/types/validator.ts` about missing debug/finance route)
- `npm run lint` -- **0 new errors** (all pre-existing)
