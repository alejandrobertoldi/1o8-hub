# Storefront "Split Section" Module — Design (v1)

**Date:** 2026-06-24
**Branch:** `feat/storefront-module-editor`
**Status:** Approved design, ready for implementation plan
**Next migration:** 0082

## Goal

A new addable storefront module type, **Split Section**, that lays out **two image
tiles side by side** at a chosen split ratio. Each tile is an image with an optional
title and link. Mirrors the Amazon Brand Store "Split Section" experience the user
selected: a 2-tile layout, each tile fillable via "+ Add tile".

## v1 scope (locked)

- **Layouts:** the **2-tile family** only — always exactly 2 tiles, ratio varies.
  Three templates:
  - `split_2_equal` — 50 / 50 (default on create)
  - `split_2_left` — ~62 / 38 (left tile larger)
  - `split_2_right` — ~38 / 62 (right tile larger)
- **Tile fields:** image asset + optional `title` + optional `linkUrl`/`linkLabel`
  (mirrors the existing Image module). Single asset per tile — no per-device crops.
- **Tile type:** image only.

### Out of scope for v1 (deferred)
- 3-tile / 4-tile and Variable-height templates.
- Text / Shoppable / Image-with-text tile types.
- Per-device (Mobile/Desktop) separate crops.
- "Flip all horizontally" toggle — **redundant** with reordering 2 tiles, so dropped.
- Public/live storefront render and case-study PDF export of split sections (no public
  storefront renderer exists yet; v1 renders in the editor preview only).

## Data model

### Decision: typed child-tiles table (not JSONB, not a separate assets table)
Each v1 tile has a fixed, known shape (one image + title + link), so asset fields live
**inline on the tile row**, exactly like `storefront_modules` already holds its own
single asset. This keeps the storefront domain's typed-column style (vs aplus2's JSONB)
and needs one table, one migration. A separate per-tile assets table would be
over-engineering for one-asset-per-tile.

### Enum + specs (`src/lib/storefront/module-specs.ts`)
- Add `"split_section"` to `storefrontModuleTypeEnum` (`src/lib/db/schema.ts`) **and**
  to `STOREFRONT_MODULE_TYPES` + `ADDABLE_MODULE_TYPES`.
- Add a spec entry: `split_section` is a container (no module-level asset). Tile assets
  validate against the existing **image** rules (`minWidth: 1500`, IMG mimes). Reuse the
  `image` spec for tile validation rather than inventing a new one.
- Add a `SPLIT_LAYOUTS` constant defining the 3 template keys + their ratios, e.g.:
  ```ts
  export const SPLIT_LAYOUTS = {
    split_2_equal: [1, 1],
    split_2_left:  [62, 38],
    split_2_right: [38, 62],
  } as const;
  export type SplitLayout = keyof typeof SPLIT_LAYOUTS;
  ```

### Parent module row
- `moduleType = "split_section"`, owns **no** asset (`driveFileId` etc. stay null).
- Reuse the existing `section_layout` text column to store the **layout-template key**
  (one of the `SPLIT_LAYOUTS` keys). No new column. (For the image module
  `section_layout` holds fill/fit/text; split_section holds a `split_*` key — different
  module types, no collision.)
- Default `section_layout = "split_2_equal"` on creation.

### New table `storefront_module_tiles` (`src/lib/db/schema.ts`)
```
id            uuid PK default random
module_id     uuid FK -> storefront_modules.id ON DELETE cascade
position      integer NOT NULL            -- 1, 2
title         text                        -- optional
link_url      text                        -- optional
link_label    text                        -- optional
drive_file_id text                        -- the one image (nullable until uploaded)
asset_mime_type text
asset_filename  text
created_at    timestamptz NOT NULL default now()
updated_at    timestamptz NOT NULL default now()
UNIQUE(module_id, position)
```
Export `StorefrontModuleTile = typeof storefrontModuleTiles.$inferSelect`.

### Migration 0082
- `scripts/_apply-0082.ts` (additive only; NOT drizzle migrate — DEV DB = PROD).
- `CREATE TYPE` value add: `ALTER TYPE storefront_module_type ADD VALUE 'split_section'`
  (note: enum value adds can't run inside a txn block in PG — apply standalone).
- `CREATE TABLE storefront_module_tiles (...)` with FK cascade + unique(module_id, position).

## Creation flow

`POST /api/storefront/pages/[pageId]/modules` with `{ moduleType: "split_section" }`:
- Insert the module row (`section_layout = "split_2_equal"`).
- **Seed 2 empty tile rows** (positions 1 and 2) for that module in the same request.
- Within the 2-tile family, switching template only PATCHes `section_layout`; tile count
  never changes, so there is no add/remove-tile logic in v1.

## APIs

| Method & path | Behavior |
|---|---|
| `POST /api/storefront/pages/[pageId]/modules` (extend) | When `moduleType === "split_section"`, also insert 2 empty tiles. |
| `GET /api/storefront/[clientIdCode]/pages` (extend) | When a module is `split_section`, nest `tiles: [{id, position, title, linkUrl, linkLabel, driveFileId, assetMimeType, assetFilename}]` (ordered by position) in the module DTO. |
| `PATCH /api/storefront/modules/[moduleId]/tiles/[tileId]` (new) | Update tile `title`, `linkUrl`, `linkLabel`. Validates the tile belongs to the module. |
| `POST /api/storefront/modules/[moduleId]/tiles/[tileId]/asset` (new) | Clone of the module asset route. Resolves the same page folder via module→page→version, validates against the image spec, uploads to Drive, writes `driveFileId/assetMimeType/assetFilename` to the **tile** row, best-effort trashes the old file. Returns `{ driveFileId, warnings }`. |

`drive-naming.ts`: extend `storefrontAssetFilename()` with optional `tilePosition` →
inserts `_T{NN}` so tile assets don't collide in the shared page folder, e.g.
`CLIENT_storefront_homepage_M01_T02_split_section.jpg`.

## Copy-forward (version bump)

Extend `createNextStorefrontVersion` (`src/lib/storefront/drive.ts`): inside the
per-module copy loop, when `m.moduleType === "split_section"`:
- Read the source module's tiles (ordered by position).
- For each tile: if it has an asset, `driveClient.copyFile` into the new version's page
  folder; insert a new tile row pointing at the copied file (or null asset if empty),
  carrying title/link forward.
- This is inside the existing try/catch that rolls back the new version row on failure.

## Editor UI

No public renderer exists — v1 render target is the **editor** at
`/design/storefront/[clientIdCode]`.

1. **Add menu** (`storefront-page-editor.tsx`, `AddModuleMenu`): "Split Section" appears
   automatically from `ADDABLE_MODULE_TYPES` — give it a label in the specs/labels map.
2. **Center preview** (`StorefrontModulePreview`): render `split_section` as a flex row
   of 2 tiles using the `SPLIT_LAYOUTS` ratio from `section_layout`. Each tile shows its
   image (from `driveFileId`) or a "+ Add tile" placeholder. Clicking selects the module.
3. **Right pane** (`storefront-module-card.tsx`, `StorefrontModuleConfig`): add a
   `split_section` branch:
   - A **layout-template picker** (3 options — `split_2_equal` / `split_2_left` /
     `split_2_right`) that PATCHes `section_layout`.
   - The **2 tile editors**, each: `StorefrontAssetUpload` (pointed at the new tile asset
     route) + a `title` field + `linkUrl`/`linkLabel` fields, PATCHing the tile route.

## Testing

- `drive-naming.test.ts`: add a case for `tilePosition` producing the `_T{NN}` segment.
- A unit check for `SPLIT_LAYOUTS` ratio lookup / template-key validation.
- Manual render-QA in the editor on `:3000` (authed): add a Split Section module → 2
  empty tiles render at 50/50 → switch template → ratio changes → upload an image to each
  tile → images render → set title/link → bump version → tiles + assets copied forward,
  old version's tiles unchanged.

## Hard rules carried from the project
PORT=3000. DEV DB = PROD Supabase, additive only via `scripts/_apply-0082.ts` (NOT
drizzle migrate). Stage explicit files only, never `git add .`. Never push without
explicit OK. Commit trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Hub accent
`text-brand`. Reuse `@/lib/design-status` (no local STATUS_CONFIG).
