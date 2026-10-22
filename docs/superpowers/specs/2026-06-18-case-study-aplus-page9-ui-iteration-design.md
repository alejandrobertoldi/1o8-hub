# Case Study Page 9 — A+ Content UI iteration (design)

Date: 2026-06-18
Status: Approved (design). Branch: `feat/case-study-aplus-screenviews` (continues the screenviews feature).
Supersedes nothing; builds on `2026-06-18-case-study-aplus-screenviews-design.md`.

## Problem

Page 9 ("A+ Content") now renders resolver-derived module stacks, but the layout
is off and the editing affordance is coarse:

1. Stacks are too small — the grid caps them at `minmax(320px,520px)` (shared by up
   to 3 columns) while the prose gets `1fr`.
2. When the Basic card is hidden, the lone Premium card spans the full right column
   at a large value font — visually overweight.
3. No way to choose which A+ modules appear on the page; all resolved module images
   always stack.
4. Editing is one global drawer (all sections in an accordion) opened by a single
   "Edit" button; the user wants a per-page drawer.
5. **Bug:** the amber "needs image" banner always lists A+ as missing, because
   `page.tsx` still checks `c.imageUrl` — a field removed in commit `0854f8db`.

## Scope

In scope (this branch): page-9 layout, per-module show/hide, per-page editor drawer,
banner fix. **Out of scope (separate branch):** hiding entire case-study pages/sections.

## Locked decisions (carried from prior spec, still in force)

- A+ screenview = ordered desktop module images stacked via
  `/api/aplus2/image?driveFileId={Google id}`. NO composite PNG / no upload.
- Resolver ranking/version logic is DONE and unchanged. **No resolver change.**
- Hide Basic card if 0 BA+, Premium if 0 PA+ (presence = any status).
- hub gold `#E8A700` (`var(--c-yellow)`) accent, never blue.

## Design

### Part 1 — Grid rebalance (`sections/aplus.tsx`)
- `gridTemplateColumns`: `minmax(320px, 520px) 1fr` → **`1fr minmax(0, 360px)`**
  (stacks left/dominant, copy + tiers in a ≤360px right rail).
- `alignItems: center` → **`start`** (tall stacks top-align; `.slide` is
  `min-height:100vh` and grows, so nothing clips).
- Stacks container keeps `display:flex; gap:12`; each stack `flex:1; minWidth:0`.

### Part 2 — Lone tier card (`sections/aplus.tsx`, `TierCard`)
- When exactly one tier card shows (`showBasic` XOR `showPremium`): constrain the
  card to `maxWidth: 280px` (do not span the rail) and reduce the value font from
  `clamp(36px,4vw,64px)` to `clamp(28px,3vw,44px)` with lighter padding.
- Two-card layout (`showBasic && showPremium`) unchanged.
- Implement by passing a `compact` boolean to `TierCard` (true when it's the only
  card), driving width + font.

### Part 3 — Per-module show/hide (`types.ts`, `sections/aplus.tsx`, `section-editor/section-aplus.tsx`)
- **Type:** add `hiddenImages?: string[]` to `AplusContent` — the set of stable
  `/api/aplus2/image?driveFileId=…` URLs the user has hidden. Keyed by the proxy
  URL (driveFileId-derived, stable across Refresh).
- **Renderer:** for each screenview, `images.filter(u => !hidden.includes(u))`; if a
  stack has 0 visible images, skip that stack. If ALL stacks empty, fall back to the
  existing empty placeholder box.
- **Editor:** below the prose/tier fields, render a "Modules" section: for each
  `screenview` (set), a labeled group (`{contentType} · {asin}`) listing each module
  image as a small thumbnail with a show/hide toggle. Toggling adds/removes the URL
  from `form.hiddenImages`. Saved via the existing PATCH. No upload control.
- **"How many modules show"** = count left toggled on; no separate cap field.
- **Persistence:** `hiddenImages` lives outside `screenviews`, so Refresh
  (`generate.ts` spreads existing `content` then mutates only
  `screenviews/hasBasic/hasPremium`) preserves it automatically. Stale entries after
  a data change are harmless no-ops.
- **Init:** `emptyAplus()` sets `hiddenImages: []`.

### Part 4 — Per-page editor drawer (`page.tsx`, `case-study-view.tsx`, `section-editor/section-editor-shell.tsx`)
- Replace the global "Edit" button behavior with an **edit-mode toggle**
  (`editMode` boolean in `page.tsx`). Button label/active state reflects on/off.
- `CaseStudyView` gains optional `onEditSection?: (sectionId: string) => void`. When
  present, each rendered section is wrapped in a `position:relative` container with a
  small floating pencil button (top-right, hidden in print). Clicking calls
  `onEditSection(section.id)`. No change to individual section renderers.
- `SectionEditorShell` gains optional `sectionId?: string`. When set, it renders ONLY
  that section's editor (no accordion). When unset, current all-sections behavior is
  retained (kept for safety; primary path is scoped).
- `page.tsx` wires `onEditSection={(id) => { setEditSectionId(id); setEditorOpen(true); }}`
  and passes `sectionId={editSectionId}` to the shell.
- **Globals:** `GlobalsEditor` moves into the **cover** section's scoped drawer
  (document-level fields belong on page 1), shown only when `sectionId` resolves to
  the cover section. Removed from the generic shell body.

### Part 5 — Banner fix (`page.tsx`)
- aplus branch of `missingImages`: `!c.imageUrl` → **`!((c.screenviews as unknown[] | undefined)?.length)`**.

## Testing
- Renderer (`sections/aplus.test.tsx`): images in `hiddenImages` are not rendered; a
  stack with all images hidden is skipped; lone-card path uses compact styling
  (assert max-width / smaller font marker); grid still renders ≤3 stacks.
- Editor: toggling a module updates `hiddenImages` and the save payload (light test —
  the existing suite covers PATCH plumbing).
- `npm run build` green (lint misses SectionContent union-cast TS errors — build is
  the real gate).
- Regression: existing case-study + aplus-screenviews + generate suites stay green.

## Acceptance (verify render on DRC_SC_US)
- Page 9: stacks are visibly larger (dominant left column); copy/tiers in narrow rail.
- Basic card hidden (0 BA+); lone Premium card is compact, not full-width.
- Amber banner no longer lists "A+ Content".
- Edit mode shows a pencil on each slide; clicking the A+ pencil opens a drawer
  scoped to A+ with a Modules show/hide list; hiding a module removes it from page 9;
  Refresh preserves the hidden choices.

## Non-goals
- No resolver/ranking change. No composite PNG. No image upload.
- No hiding of entire pages/sections (separate branch).
- No multi-image "module group" granularity (toggle is per module image).
