# Visual Field Flow Implementation Plan

> Execute inline using executing-plans, preserving the current workspace and unrelated changes. User approved the design with “proceed”.

**Goal:** Show page controls, exact Supabase fields, copies and consumers on a screenshot canvas.
**Architecture:** Existing generated inventory plus evidence-backed field bindings; React canvas; private IndexedDB workspace containing screenshots, hotspots and manual flows. No new database or public screenshot endpoint.
**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript, SVG, IndexedDB, existing Vitest/Testing Library.
**Spec:** /Users/manu/MFHub/docs/superpowers/specs/2026-09-09-data-map-design.md

## Constraints
- Admin-only; no authentication bypass or production data writes.
- No operation text on arrows. Query candidates must not masquerade as display bindings.
- Route templates remain inventoried without screenshots. Capture status must be truthful.
- Preserve original page/table maps and annotation format.

## Task 1: Field flow and private workspace contracts
Files: src/lib/data-map/visual-model.ts, visual-model.test.ts, visual-bindings.ts; src/components/data-map/visual-storage.ts.
- [x] Test exact JSON-key matching, copy traversal without sibling-field contamination, UUID/code separation and backup validation. Tests assert `traceFields('master.variations.Size', edges)` excludes theme fields and catches an invalid image/route/hotspot.
- [x] Implement field identities, explicit verified bindings, manual connections, query candidates and versioned workspace validation. Inventory every declared field; extract product JSON keys from the existing type definition during generation.
- [x] Implement IndexedDB read/write with transaction completion and visible quota/unavailable errors; export/import the same versioned document including raster image data.

## Task 2: Screenshot canvas
Files: src/components/data-map/visual-flow.tsx, visual-stage.tsx, visual-editor.tsx, visual-flow.test.tsx; data-map.tsx.
- [x] Test default view, field selection, directed read/write flow, manual connection persistence and rejected imports. Model and primary UI tests ran red before implementation; backup regression was added during verification.
- [x] Build draggable page/database cards, pan/zoom, selection arrows and controls. Keep pins normalized to screenshot dimensions; no guessed pins for missing images.
- [x] Build route coverage, screenshot upload/paste/replacement, capture context, field/hotspot editor, manual edit/removal and backup. Replacement flags pins for review.
- [x] Integrate as default Visual field flow, keeping Page map and Table lineage toggles.

## Task 3: Real evidence and verification
- [x] Trace variation creation/assignment, theme raw-to-attributes transformation, copied theme and canonical Size write; include exact source evidence. Cover additional verified product fields through the shared field registry, retaining legacy fallback notes.
- [x] Capture actual Variation Builder and PDP states, import through browser UI and place field hotspots. Inventory all routes and capture additional reachable representative pages; explicitly record missing/blocked states.
- [x] Run focused Vitest, ESLint, focused TypeScript, manifest generation and git diff --check. Inspect browser layout and physically verify pan/zoom, hotspot placement and screenshot persistence. Verify backup imports and rejection atomically in component tests; exercise export in the browser (download destination not independently verified).
- [x] Update spec/plan/primer with verified outcomes and coverage limits. Existing full build failure remains separate unless changed.

## Verified delivery — 2026-09-09
- Visual field flow is the default at /admin/data-map. Original Table lineage and Page map remain available.
- 131 routes, 109 tables, 1,253 columns, 182 schema-declared JSON paths; the combined selectable field inventory is 1,442 including curated keys.
- Verified code paths cover Size, variation theme, business code versus UUID, and additional product variation attributes. All other query-derived connections are explicitly unverified candidates.
- Six authenticated screenshots saved in the admin browser: variation families, variation builder, PDP Variations section, catalog, USA holidays and calendar. Normalized Size/theme hotspots were placed against actual controls; screenshot persistence survived reload. Other routes remain visibly missing or require a representative record.
- Physical browser checks: card dragging, background panning, zoom/fit, field presets, hotspot placement and reload persistence. Backup includes screenshots and manual annotations; invalid imports preserve the current workspace.
- 37 focused tests across eight files, targeted lint and focused TypeScript passed. Independent review found and rechecked fixes for per-screenshot hotspot persistence and recovery after failed workspace loading; both regressions ran red then green. Full build was not rerun; a prior unrelated failure at scripts/backfill-parent-theme-attrs.ts:94 remains recorded.
- No production data changed, no screenshots committed, no commit/push/deployment performed.

## Remaining coverage
Capture the other 125 route templates and relevant alternate states; many dynamic routes require representative records. Review candidate queries into actual control bindings and pin them. This maps possible field flows, not historical row-value provenance. The current capture transport is upload/paste; there is no automatic screenshot crawler. Capture state/date/viewport are stored, but a git revision is not currently attached to each image.

## Release validation
The release snapshot was regenerated against origin/main 80a3e90fd, excluding unrelated uncommitted schema work: 131 pages, 108 tables and 988 page connections. All 37 Data Map tests pass; targeted ESLint and focused TypeScript pass. Full suite comparison against untouched main: identical 43 failing tests (23 failing files), with 2,436 release tests passing versus 2,399 baseline tests passing. No new failing tests. Screenshots stay in the admin browser and are not included in the commit.
