# Storefront Design Module Editor — Design Spec

**Date:** 2026-06-23
**Status:** Approved for planning
**Surface:** Hub (staff-facing). Portal (client read-only) is a deferred follow-up.

## Goal

Let staff build a client's Amazon Storefront design, page by page, by uploading
asset modules — mirroring how A+ (aplus2) works, but drastically simpler. Start
with the **Homepage**; more pages can be added later. Each page is an ordered
list of single-asset modules.

## Locked decisions

1. **Storage:** Google Drive. Reuse `driveClient`, `driveFolders` (new
   `folderType = 'storefront'`). Store the Drive file id directly on the module
   row (no separate assets table — each module holds exactly one asset).
2. **No versioning.** One live state per page; edit in place.
3. **Desktop-only assets.** No mobile variant in v1.
4. **Pages are first-class** (`storefront_pages` table), but the UI seeds and
   centers on "Homepage". Adding more pages is supported by the schema + a
   simple "Add page" control.
5. **Per-module fields:** the asset + optional **Title** + optional **link**
   (url + label). No crop, no creative-assets picker, no AI-people flag, no tags.

## Module types (`src/lib/storefront/module-specs.ts`)

Flat list; each module is exactly one type, holding one asset. Dimension rules
are **soft warnings** (Amazon's minimums), not hard blocks.

| type          | kind  | min size            | notes |
|---------------|-------|---------------------|-------|
| `header`      | image | 3000 × 600 px       | |
| `video`       | video | 1280 × 640 px, ≤500MB | mime: avi, mov, mpg, mpeg, mp4, m4a, m4v, m4p |
| `cover_image` | image | 3000 × 1500 px      | |
| `image`       | image | width ≥ 1500 px (3000 recommended) | height unconstrained |

Spec object per type: `{ key, label, kind, minWidth?, minHeight?, maxBytes?, mimes[] }`.
Used for both upload validation (warn) and editor rendering.

## Data model (`src/lib/db/schema.ts` + migration)

**enum** `storefront_module_type`: `header | video | cover_image | image`

**`storefront_pages`**
- `id` uuid pk
- `clientIdCode` text (FK→aac client code, matches aplus2 convention)
- `name` text (e.g. "Homepage")
- `slug` text (e.g. "homepage")
- `isHomepage` boolean default false
- `position` int (page order)
- `createdAt`, `updatedAt`
- unique (`clientIdCode`, `slug`)

**`storefront_modules`**
- `id` uuid pk
- `pageId` uuid (FK→storefront_pages, cascade delete)
- `position` int (1-based order within page)
- `moduleType` `storefront_module_type`
- `title` text null
- `linkUrl` text null
- `linkLabel` text null
- `driveFileId` text null (Google Drive gid of the uploaded asset)
- `assetMimeType` text null
- `assetFilename` text null
- `createdAt`, `updatedAt`
- unique (`pageId`, `position`)

Migration is **additive only** (new enum + 2 tables). NOTE: local DB = prod
Supabase; apply via `scripts/_apply-00NN.ts` (drizzle-kit migrate blocks on TTY)
per existing project convention.

## Drive layout (`src/lib/storefront/drive-naming.ts`)

- Per-client folder: lazily created on first upload, `folderType='storefront'`,
  reusing the `driveFolders` row pattern from aplus2.
- Filename: `{clientIdCode}_storefront_{slug}_M{##}_{type}.{ext}`
  e.g. `ZNG_SC_US_storefront_homepage_M01_header.png`.

## API routes (`src/app/api/storefront/...`)

- `GET  /api/storefront/[clientIdCode]/pages` — pages + their modules (editor load)
- `POST /api/storefront/[clientIdCode]/pages` — create page; first call also
  ensures a Homepage exists
- `PATCH/DELETE /api/storefront/pages/[pageId]` — rename / delete page (+ trash Drive files)
- `POST /api/storefront/pages/[pageId]/modules` — add module `{ moduleType }` at end
- `PATCH /api/storefront/modules/[moduleId]` — edit `title|linkUrl|linkLabel|position`
- `DELETE /api/storefront/modules/[moduleId]` — delete module (+ trash Drive file)
- `POST /api/storefront/modules/[moduleId]/asset` — multipart upload → Drive,
  stamp `driveFileId/assetMimeType/assetFilename` on module
- `DELETE /api/storefront/modules/[moduleId]/asset` — clear asset (+ trash Drive file)
- `GET  /api/storefront/image?driveFileId={gid}` — proxy download from Drive,
  immutable cache (mirror `/api/aplus2/image`)

All routes admin/staff-guarded (match existing `/api/design-status` auth).

## Hub UI

**Entry:** the storefront list tiles (`src/app/design/storefront/page.tsx`,
already built) become clickable → `/design/storefront/[clientIdCode]`. (The tile
was made non-clickable in the prior step; re-enable navigation.)

**Detail page** `src/app/design/storefront/[clientIdCode]/page.tsx`
(+ `page.client.tsx`):
- Header: client name/code + page selector (Homepage default, "+ Add page").
- Module list for the selected page:
  - "Add module" picker (4 types) appends a module.
  - Each module card: asset dropzone (click/drag) showing thumbnail (image) or
    inline `<video>` preview; dimension/format hint + soft warning if below min;
    optional Title input; optional link (url + label); reorder up/down; delete.
  - Empty page → "Add your first module" CTA.
- Mutations via react-query, optimistic where cheap, `toast` on error (match
  brand-story / aplus2 patterns).

**Components** `src/components/storefront/`:
`storefront-page-editor.tsx`, `storefront-module-card.tsx`,
`storefront-asset-upload.tsx`.

## Status integration

Storefront design status stays on the list page (existing `/api/design-status`
PUT). The detail page header also shows + lets staff change that status (same
endpoint). No new status storage.

## Out of scope (deferred)

- Portal (client) read-only render of the storefront.
- Mobile variants, crop tool, creative-asset library, AI-people flag, tags.
- Versioning / approval workflow / comments.
- Multi-asset modules, repeatable items, comparison/hotspot module types.

## Testing

- `src/lib/storefront/module-specs.test.ts` — validation helper: correct
  warn/accept on dimension + mime + size edge cases.
- `src/lib/storefront/drive-naming.test.ts` — filename pattern incl. slug + M##
  padding + extension.

(No heavier framework; one runnable check per non-trivial pure helper, per house style.)

---

## Revision 2026-06-23b — per-module fields (post-implementation change)

After reviewing Amazon's real editor, the module model changed:

- **Cover Image is no longer a standalone module.** It becomes the **Video** module's poster (shown when the video is not playing). Video holds two assets: the video + the cover image. Addable module types = `header | video | image` only. `cover_image` remains in `STOREFRONT_MODULE_SPECS` solely to validate the poster's dimensions (≥3000×1500).
- **Header:** image asset + `Contains AI-generated people` checkbox (with Amazon's tooltip copy). No title/link.
- **Video:** video asset + cover/poster image asset. No other fields.
- **Image:** image asset + `Choose section layout` radio (`Fill | Fit | Text`, default Fill) + optional Title + optional Link (url+label) + `Contains AI-generated people` checkbox.

**Additive schema (migration 0079):** `contains_ai_people` boolean default false; `section_layout` text null; `poster_drive_file_id`/`poster_mime_type`/`poster_filename` text null. Existing `title/link_url/link_label` columns retained (Image uses them; Header/Video ignore).

**Asset route:** gains a `slot` field — `main` (default) or `poster`. Poster validates against the `cover_image` spec and writes the `poster_*` columns; main writes `drive_file_id` as before. Poster filename uses a `_cover` suffix.

**AI checkbox tooltip copy:** "Check this box if your assets or product images include AI-generated, photorealistic people. (This doesn't apply to AI-generated representations of real people, like models and actors.) If your creative includes AI-generated, photorealistic people, some places (like New York state) require you to disclose that in your ads. If you check this box, Amazon will add an icon to places displayed in this ad…" + the "Don't check this box if" bullets from the Amazon screenshot.
