# A+2 — Per-Version A+ Content Editor (design)

**Date:** 2026-05-29
**Status:** spec, awaiting approval
**Parallel to:** existing `/aplus` (untouched; stays as inspiration)
**Mirrors:** `/design/brand-story` per-version architecture (commits `71b4e9ed`, `dee9cce2`, `eeebf2b5`)

---

## 1. Goal

Replace the legacy `/aplus` workflow with a lean, per-version, brand-story-style editor at `/aplus2`. Keep the existing `/aplus` route running in parallel as a reference. Ship a v1 that supports all 19 Amazon Premium A+ module types, scoped per ASIN or per parent ASIN family, partitioned by client and marketplace.

**Non-goals for v1:** Markup.io comments, Amazon-vs-hub compare, import wizard, backfill from `/aplus`, SP-API publish pipeline, SEO/Cosmo/Rufus integrations.

---

## 2. Conceptual model

```
client (client_id_code)
  └── aplus2_set                  (one per ASIN OR per parent family, per marketplace)
        ├─ scope_type              ASIN | PARENT
        ├─ scope_identifier        the ASIN string (or parent ASIN for PARENT)
        ├─ marketplace             2-letter country code (US, UK, DE, MX, …)
        ├─ parent_asin?            populated when scope=PARENT
        ├─ covered_asins?          JSONB string[] — child ASINs under PARENT scope
        └── aplus2_version         (V01, V02, …)
              ├─ version_number
              ├─ status            not_started | in_progress | in_review | approved | live
              ├─ drive_folder_id   → drive_folders
              └── aplus2_module    (position 1..7, Amazon-enforced cap)
                    ├─ module_type one of 19 Premium A+ types
                    ├─ position
                    ├─ status      draft | in_review | approved | uploaded | live
                    ├─ shared text columns (headline, subheadline, body, overlay, alt, image_description, ai_image_prompt, cosmo_relation_type)
                    ├─ video_drive_file_id / video_title / video_description (for video module types)
                    ├─ text_position / font_color (for background_image_text)
                    ├── aplus2_module_item  (repeatable group — QA pair, comparison row, carousel slide)
                    │     ├─ position
                    │     └─ data JSONB  (per-type discriminated union; see §5)
                    └── aplus2_asset  (image/video slot binding to drive_files)
                          ├─ kind          single_image | image_slot | video | logo | bg_desktop | bg_mobile | hotspot
                          ├─ slot_key      from module-spec (e.g. "focus", "logo", "image_left", "compare_image")
                          ├─ module_item_id?  set when the slot lives inside a repeatable item
                          ├─ drive_file_id → drive_files
                          └─ filename
```

**Cascade rule:** set DELETE → versions DELETE → modules DELETE → items + assets DELETE. Mirrors brand-story's cascade tree.

---

## 3. Routes

```
/aplus2                                                   client list (rolls up: total sets + latest version status)
/aplus2/[clientIdCode]                                    list of A+ sets for that client (grouped by marketplace)
/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]      version cards (V01..V##) for that set
```

`setIdentifier` is the raw ASIN string (or parent ASIN). Uniqueness enforced by `UNIQUE (client_id_code, marketplace, scope_identifier)` on `aplus2_sets`.

`marketplace` is the 2-letter ISO country code. Sets are URL-unique per marketplace, so the same ASIN can have independent A+ sets across countries.

---

## 4. Schema (5 new tables)

All in [src/lib/db/schema.ts](src/lib/db/schema.ts) appended after the brand-story block, plus migration [drizzle/migrations/0068_aplus2.sql](drizzle/migrations/0068_aplus2.sql).

### 4.1 `aplus2_sets`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | defaultRandom |
| `client_id_code` | varchar(100) NOT NULL | NO FK to aac (matches brand-story / drive-folders pattern, app-level cleanup) |
| `product_id` | uuid NOT NULL | FK → master.id ON DELETE CASCADE (the product the set was created from; for PARENT scope, this is the parent product row) |
| `scope_type` | varchar(8) NOT NULL | `ASIN` \| `PARENT` |
| `scope_identifier` | varchar(20) NOT NULL | the ASIN string |
| `marketplace` | varchar(5) NOT NULL | 2-letter country code |
| `parent_asin` | varchar(20) | nullable; populated when scope_type=PARENT |
| `covered_asins` | jsonb (`string[]`) | nullable; populated when scope_type=PARENT |
| `platform` | varchar(2) NOT NULL default `SC` | future-proof; for now always SC |
| `content_type` | varchar(3) NOT NULL default `PA+` | future-proof; Premium A+ only in v1 |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**
- `UNIQUE (client_id_code, marketplace, scope_identifier)`
- `INDEX (client_id_code)`
- `INDEX (product_id)`

### 4.2 `aplus2_versions`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `set_id` | uuid NOT NULL | FK → aplus2_sets ON DELETE CASCADE |
| `version_number` | integer NOT NULL | 1..N |
| `status` | text NOT NULL default `not_started` | `not_started` \| `in_progress` \| `in_review` \| `approved` \| `live` |
| `drive_folder_id` | uuid | FK → drive_folders ON DELETE SET NULL |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**
- `UNIQUE (set_id, version_number)`
- `INDEX (set_id)`

### 4.3 `aplus2_modules`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `version_id` | uuid NOT NULL | FK → aplus2_versions ON DELETE CASCADE |
| `position` | integer NOT NULL | 1..7 (Amazon cap, app-enforced) |
| `module_type` | text NOT NULL | one of 19 from `aplus2/module-specs.ts` |
| `status` | text NOT NULL default `draft` | `draft` \| `in_review` \| `approved` \| `uploaded` \| `live` |
| `headline_text` | text | nullable |
| `subheadline_text` | text | nullable |
| `body_text` | text | nullable |
| `overlay_text` | text | nullable |
| `alt_text` | text | nullable |
| `image_description` | text | nullable |
| `ai_image_prompt` | text | nullable |
| `cosmo_relation_type` | varchar(100) | nullable |
| `video_drive_file_id` | text | nullable (binds to drive_files.driveFileId for video types) |
| `video_title` | text | nullable |
| `video_description` | text | nullable |
| `text_position` | varchar(10) | nullable: `left` \| `right` (background_image_text) |
| `font_color` | varchar(10) | nullable: `light` \| `dark` (background_image_text) |
| `figma_url` | text | nullable |
| `markup_url` | text | nullable |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**
- `UNIQUE (version_id, position)`
- `INDEX (version_id)`
- `INDEX (status)`

Note: per-field char limits are NOT enforced at DB level — same `body_text` column has different caps per module_type. Limits live in Zod schemas in the API layer.

### 4.4 `aplus2_module_items`

Generic repeatable child. Used for: QA pairs, comparison rows, carousel slides, hotspot pins, regimen steps.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `module_id` | uuid NOT NULL | FK → aplus2_modules ON DELETE CASCADE |
| `position` | integer NOT NULL | 1..N (count declared by module-spec) |
| `data` | jsonb NOT NULL default `'{}'` | per-type fields; TS discriminated union (see §5) |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**
- `UNIQUE (module_id, position)`
- `INDEX (module_id)`

### 4.5 `aplus2_assets`

Slot binding (NOT a file record). One row per filled image/video slot **per variant** per version. Image slots can have a `desktop` variant AND optionally a `mobile` variant (per the existing `ImageSlotSpec.mobileSize?` in module specs). Video slots have only one variant.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `version_id` | uuid NOT NULL | FK → aplus2_versions ON DELETE CASCADE |
| `module_id` | uuid | FK → aplus2_modules ON DELETE CASCADE; required in v1 |
| `module_item_id` | uuid | FK → aplus2_module_items ON DELETE CASCADE; non-null when the slot is inside a repeatable item |
| `kind` | text NOT NULL | `image` \| `video` (broad category — refines via slot_key + variant) |
| `slot_key` | text NOT NULL | from module-spec (e.g. `focus`, `logo`, `image_left`, `compare_image`, `bg`) |
| `variant` | text NOT NULL default `desktop` | `desktop` \| `mobile` — `mobile` rows only when the spec declares `mobileSize` |
| `drive_file_id` | uuid NOT NULL | FK → drive_files ON DELETE CASCADE |
| `filename` | text NOT NULL | the slug-derived filename in Drive |
| `created_at` | timestamptz | |

**Partial unique indexes (in migration SQL):**
- one asset per `(module_id, slot_key, variant)` where `module_item_id IS NULL`
- one asset per `(module_item_id, slot_key, variant)` where `module_item_id IS NOT NULL`

Variant convention in Drive filename:
- `desktop` variant: `{slug}_M##_{slot_key}.{ext}` (no suffix)
- `mobile` variant: `{slug}_M##_{slot_key}_mobile.{ext}`

---

## 5. Module specs file

[src/lib/aplus2/module-specs.ts](src/lib/aplus2/module-specs.ts) — copy of existing `src/lib/aplus-module-specs.ts`, cleaned and decoupled. Carries:

```ts
export type Aplus2ModuleType =
  | "background_image_text" | "comparison_table_1" | "comparison_table_2" | "comparison_table_3"
  | "dual_images_text" | "four_images_text" | "full_image" | "full_video"
  | "hotspots_1" | "hotspots_2" | "navigation_carousel" | "qa"
  | "regimen_carousel" | "simple_image_carousel" | "single_image_text"
  | "technical_specifications" | "text" | "video_image_carousel" | "video_text";

export interface Aplus2ModuleSpec {
  type: Aplus2ModuleType;
  label: string;
  textFields: TextFieldSpec[];           // shared columns the editor renders
  imageSlots: ImageSlotSpec[];            // module-level image slots
  repeatable?: {
    countMin: number; countMax: number; defaultCount: number;
    fields: TextFieldSpec[];              // text fields inside each item
    image?: ImageSlotSpec;                // optional image slot per item
    itemDataType: "qa" | "comparison_row" | "carousel_slide" | "hotspot" | "regimen_step" | "tech_spec_row";
  };
  video?: { titleMaxLen: number; descriptionMaxLen: number };
  layoutControls?: Array<{ key: "text_position" | "font_color"; options: string[] }>;
}

// Discriminated union for aplus2_module_items.data
export type Aplus2ItemData =
  | { type: "qa"; question: string; answer: string }
  | { type: "comparison_row"; header: string; cells: string[] }
  | { type: "carousel_slide"; caption: string; cta_text?: string; cta_url?: string }
  | { type: "hotspot"; x: number; y: number; label: string; body: string }
  | { type: "regimen_step"; step_label: string; headline: string; body: string }
  | { type: "tech_spec_row"; label: string; value: string };
```

The 19 specs are exhaustive and Amazon-fixed; transcribing them is mechanical work for the implementation plan, not design work.

---

## 6. UI shape

### 6.1 `/aplus2` — client list
- Table of clients with `clientIdCode`, name, total set count, count-by-marketplace, latest version status rollup.
- Search/filter row.
- Click → `/aplus2/[clientIdCode]`.

### 6.2 `/aplus2/[clientIdCode]` — set list
- Header: client name + back link.
- Grouped by `marketplace` (cards or accordion sections per country).
- Each set rendered as a row card: scope chip (`ASIN B0…` or `PARENT B0…+8`), latest version pill, "Open" link.
- "New A+ Set" button → opens dialog:
  - Step 1: product picker (autocomplete over `master` filtered to `client_id_code`).
  - Step 2: scope toggle (`ASIN` / `PARENT`). PARENT shows the parent ASIN + count of siblings.
  - Step 3: marketplace picker (defaults to the picked product's `master.marketplace`).
  - Submit → POST `/api/aplus2/sets` → server creates set + V01 + Drive subfolder → navigates to `/aplus2/[client]/[marketplace]/[setIdentifier]`.

### 6.3 `/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]` — version cards

**Structurally identical to `/design/brand-story/[clientIdCode]`** (see [src/app/design/brand-story/[clientIdCode]/page.tsx](src/app/design/brand-story/%5BclientIdCode%5D/page.tsx) for reference).

- Outer page header: client name + scope chip (`ASIN B0ABCD1234 · US` or `PARENT B0XYZ · US · covers 8 ASINs`) + back link to `/aplus2/[clientIdCode]`.
- Stacked version cards, newest first or order-by-version-desc.
- Each card header: V## chip · slug · status pill (5 options) · "Drive folder" link · "Copy to new version" button · "Remove version" button (with confirm).
- Card body: list of module subcards, each draggable (`@dnd-kit/sortable`), each rendered by `<Aplus2ModuleEditor>` reading the spec.
- "Add module" button at the bottom: dropdown of 19 types (filterable input). Selecting → POST `/api/aplus2/versions/[versionId]/modules` → pre-seeds `aplus2_module_items` rows per spec defaults.
- Empty-state card at the very bottom: "Create new version" → POST `/api/aplus2/sets/[setId]/versions` with `copyFrom: latestVersionId` (data only, no asset rows copied).

### 6.4 `<Aplus2ModuleEditor>` (the schema-driven core)

One component. Reads the spec for `module_type` and renders:

- Header row: position indicator (`M01`, draggable handle) · module-type label · per-module status pill · delete button.
- Text fields: one `<Textarea>` per `spec.textFields[]`, controlled, debounced PATCH to `/api/aplus2/modules/[moduleId]`, char counter with maxLength enforcement.
- Image slots: one `<Aplus2ImageSlot>` per `spec.imageSlots[]`, with dimension hint, drag-drop upload, alt-text input, replace/remove actions.
- Repeatable items: N rows of `(text fields + optional image)` from `spec.repeatable`, count = `aplus2_module_items.position` rows (pre-seeded). Each item PATCHes its `data` JSONB.
- Video slot: drive upload + title input + description input (for `full_video`, `video_text`, `video_image_carousel`).
- Layout knobs: render `spec.layoutControls` as `<Select>` controls for `text_position` / `font_color`.

---

## 7. Drive folder convention

```
Folder per version (created on set creation for V01, on "Copy to new version" for V##):
  {CLIENTCODE}_{MARKETPLACE}_{SCOPE_ID}_Aplus_V##/

  Example: CLIENT01_US_B0ABCD1234_Aplus_V01/

Files inside (slug = folder name):
  {slug}_M##_{slot_key}.{ext}                              module slot, desktop variant
  {slug}_M##_{slot_key}_mobile.{ext}                       module slot, mobile variant (when spec declares mobileSize)
  {slug}_M##_item##_{slot_key}.{ext}                       repeatable-item slot, desktop variant
  {slug}_M##_item##_{slot_key}_mobile.{ext}                repeatable-item slot, mobile variant
  {slug}_M##_video.{ext}                                   video slot

  Examples:
    CLIENT01_US_B0ABCD1234_Aplus_V01_M01_focus.png
    CLIENT01_US_B0ABCD1234_Aplus_V01_M01_focus_mobile.png
    CLIENT01_US_B0ABCD1234_Aplus_V01_M03_item01_image.jpg
    CLIENT01_US_B0ABCD1234_Aplus_V01_M07_video.mp4
```

**Rules:**
- `M##` is the DISPLAY position (1-based). The UUID is the stable id; `M##` is recomputed on reorder.
- File renames on reorder are **LAZY** — applied only when the user clicks "Save reorder" (explicit). Drag-and-drop updates positions in DB instantly but does NOT touch Drive until save. (Same trade-off the brand-story design landed on.)
- Mime allowlist: `image/png`, `image/jpeg`, `image/webp`. Video slots add `video/mp4`.
- Original extension is preserved on re-upload — no normalisation.
- Folder is registered in `drive_folders` with `folder_type='aplus2'` and `parent_folder_id` pointing at the client's root aplus folder (or content folder if no aplus root exists — fall back logic mirrors brand-story).

---

## 8. API surface

All routes live under `/api/aplus2/`.

| Method | Path | Body / params | Behavior |
|---|---|---|---|
| GET | `/api/aplus2/sets?clientIdCode=X` | | List sets for that client, grouped by marketplace |
| POST | `/api/aplus2/sets` | `{ clientIdCode, productId, scopeType, marketplace }` | Validates uniqueness; creates set row + V01 row + Drive subfolder + drive_folders row |
| DELETE | `/api/aplus2/sets/[setId]` | | Cascade-deletes versions/modules/items/assets + trashes ALL Drive subfolders for this set |
| GET | `/api/aplus2/sets/[setId]/versions` | | Full nested payload: versions → modules → items → assets (mirrors brand-story GET) |
| POST | `/api/aplus2/sets/[setId]/versions` | `{ copyFrom?: versionId }` | Creates next V## + Drive subfolder. If `copyFrom`, clones modules + items (no asset rows). |
| PATCH | `/api/aplus2/versions/[versionId]` | `{ status }` | Updates version status only |
| DELETE | `/api/aplus2/versions/[versionId]` | | Cascade-delete + trash this version's Drive subfolder |
| POST | `/api/aplus2/versions/[versionId]/modules` | `{ moduleType }` | Insert new module at next position; pre-seed `aplus2_module_items` per spec defaults |
| PATCH | `/api/aplus2/modules/[moduleId]` | `{ ...textFields, status, layoutControls }` | Zod-validated full or partial update |
| DELETE | `/api/aplus2/modules/[moduleId]` | | Cascade-delete items + assets; trash module's files in Drive |
| POST | `/api/aplus2/modules/[moduleId]/reorder` | `{ positions: [{moduleId, position}] }` | Bulk reorder within a version; rename Drive files lazily (this is the "Save reorder" endpoint) |
| PATCH | `/api/aplus2/items/[itemId]` | `{ data }` | Update one repeatable item's JSONB; Zod-validates against the parent module's type |
| POST | `/api/aplus2/versions/[versionId]/assets` | multipart: `file`, `kind`, `slotKey`, `variant` (default `desktop`), `moduleId`, `moduleItemId?` | Upload to Drive with computed slug filename; insert `aplus2_assets` row; reject if `(slot_key, variant)` already filled (caller DELETEs first) |
| DELETE | `/api/aplus2/assets/[assetId]` | | Trash Drive file + delete asset row |
| GET | `/api/aplus2/image?driveFileId=...` | | Image proxy (mirrors `/api/design-status/brand-story-image`) |

All write endpoints require `editor` or `admin` role. `client` role gets read-only access scoped to its own `clientIdCode`.

---

## 9. File layout

```
src/app/aplus2/
  page.tsx                                        client list
  loading.tsx
  error.tsx
  page-meta.tsx
  [clientIdCode]/
    page.tsx                                      set list + "New set" dialog
    [marketplace]/
      [setIdentifier]/
        page.tsx                                  version cards (the brand-story analogue)
        _components/
          aplus2-set-page.tsx                     page-level state + dialogs
          aplus2-version-card.tsx                 one version card header + body
          aplus2-module-editor.tsx                generic schema-driven module subcard
          aplus2-module-picker.tsx                "Add module" dropdown
          aplus2-image-slot.tsx                   upload / preview / alt-text for one slot
          aplus2-repeatable-items.tsx             renders N items from spec.repeatable

src/app/api/aplus2/
  sets/route.ts
  sets/[setId]/route.ts
  sets/[setId]/versions/route.ts
  versions/[versionId]/route.ts
  versions/[versionId]/modules/route.ts
  versions/[versionId]/assets/route.ts
  modules/[moduleId]/route.ts
  modules/[moduleId]/reorder/route.ts
  items/[itemId]/route.ts
  assets/[assetId]/route.ts
  image/route.ts

src/lib/aplus2/
  module-specs.ts                                 19 module specs + Aplus2ItemData union
  zod-schemas.ts                                  per-module Zod validators (char limits live here)
  drive-naming.ts                                 slug/filename helpers + position->M## formatter
  asset-slot.ts                                   shared helpers for slot/upload/replace

src/lib/db/schema.ts                              +5 tables (aplus2Sets, aplus2Versions, aplus2Modules, aplus2ModuleItems, aplus2Assets) + inferred types

drizzle/migrations/0068_aplus2.sql                CREATE TABLE + indexes + partial unique indexes (statement_timeout=0; no FK to aac)
```

---

## 10. Auth + access

- All write routes: `editor` or `admin`.
- Read routes: `editor` + `admin` see all; `viewer` sees read-only; `client` sees only their own `clientIdCode`.
- Wired via existing [src/lib/auth-db.ts](src/lib/auth-db.ts) helpers (`canAccessSection`, `getAuthSession`).
- New section key: `aplus2` added to `allowedSections` enum / list.

---

## 11. v1 scope freezes (deferred)

| Feature | Status | Future home |
|---|---|---|
| Markup.io comments + pin overlay | DEFERRED | Phase 2 |
| Amazon-vs-hub compare panel | DEFERRED | Phase 2 |
| Import wizard (paste from Seller Central) | DEFERRED | Phase 3 |
| Backfill from /aplus | NOT PLANNED | /aplus and /aplus2 coexist indefinitely |
| SP-API publish pipeline | DEFERRED | Phase 4 |
| SEO/Cosmo/Rufus integration | DEFERRED | Phase 4 |
| Bulk operations / cross-client tooling | DEFERRED | Phase 5 |
| Standard A+ (non-Premium) module types | OUT OF SCOPE | Future milestone |

---

## 12. Open questions resolved

| Q | Answer |
|---|---|
| Scope unit | Either ASIN or PARENT (chosen per set via `scope_type`) |
| UI strategy | Lean rebuild, NOT fork or share with /aplus |
| Module support | All 19 Premium types, schema-driven editor |
| v1 feature set | Per-module status pills only |
| Routing | Per-client nested (mirrors brand-story) |
| Set creation | Product picker dialog with scope + marketplace toggle |
| Version creation | Auto V01 on set create; "New version" copies previous (data only, not assets) |
| Drive folder slug | `{CLIENTCODE}_{MARKETPLACE}_{SCOPE_ID}_Aplus_V##` |
| Country dimension | Added — sets unique on `(client, marketplace, scope_identifier)` |
| Repeatable item storage | JSONB with TS discriminated union, not typed columns per variant |
| Status enums | Two separate: version-level (brand-story values) + module-level (current A+ values) |
| FK to aac | None — matches brand-story / drive-folders pattern |
| Char limits | Zod (API), not DB CHECKs |
| File extension policy | Original kept on re-upload, no normalisation |
| Drive rename on reorder | Lazy — applied only on explicit "Save reorder" |

---

## 13. Risks

- **`aplus2_module_items.data` JSONB is unconstrained at the DB level.** Mitigation: strict Zod validators in [src/lib/aplus2/zod-schemas.ts](src/lib/aplus2/zod-schemas.ts) keyed by module_type. Catch invalid shapes at API boundary, never trust DB content.
- **Module-spec drift.** If `aplus2/module-specs.ts` diverges from real Amazon module specs over time, the editor renders the wrong fields. Mitigation: spec file has provenance comments + the existing `aplus-module-specs.ts` is the proven source to copy from.
- **Drive rename storms on heavy reorder.** Lazy rename mitigates this. If users abuse "Save reorder" repeatedly, rate-limit at the API layer (out of v1 scope; revisit if real).
- **Concurrent edits to a version.** No optimistic locking in v1. Last writer wins. Acceptable for a single-editor workflow; revisit if multi-editor becomes a use case.
- **No backfill** means clients with content in `/aplus` see TWO routes with overlapping data. User-facing risk; mitigated by labeling `/aplus` as "Legacy" in nav once `/aplus2` ships.

---

## 14. Acceptance criteria

A v1 ship is complete when:

1. New section appears in nav under "Design" or top-level — labeled "A+ Content (v2)".
2. `/aplus2` shows the client list; clicking a client navigates to `/aplus2/[client]`.
3. From `/aplus2/[client]`, user can create a new A+ set via the product+scope+marketplace dialog. Submitting creates the set, V01, and the Drive folder.
4. On the set page, user can add any of the 19 module types. Each module renders a working editor matching its spec.
5. User can fill text fields (with char counters), upload images to slots (with dimension hints), upload videos to video slots, edit repeatable items.
6. User can reorder modules via drag-and-drop. Clicking "Save reorder" renames Drive files.
7. User can change per-module status and per-version status independently.
8. User can click "Copy to new version" → V02 is created with modules+items cloned (no images).
9. User can delete a module (with confirm) — removes DB rows and trashes Drive files.
10. User can delete a version — removes everything for that version including its Drive subfolder.
11. User can delete a set — removes all versions, all subfolders.
12. `client` role users can view their own client's `/aplus2/[clientIdCode]/...` pages read-only; cannot edit.
13. The existing `/aplus` route still loads and renders correctly (untouched).
