# A+2 Drive Naming Convention — Design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)
**Scope:** Rename folder + file naming for the A+2 section. Migrate existing files (option A).

## Goal

Replace the current A+2 Drive naming with a cleaner, human-readable scheme that:
- drops the redundant marketplace token (already embedded in `client_id_code`),
- encodes the content type (`PAplus` / `BAplus`) instead of the literal `Aplus`,
- gives each asset a readable ITEM token and an explicit desktop/mobile version suffix.

## Grammar

### Folder
```
{clientIdCode}_{ASIN}_{contentToken}_V##
```
- `clientIdCode` — `aplus2_sets.client_id_code` (e.g. `DRC_SC_US`) — already contains the marketplace.
- `ASIN` — `aplus2_sets.scope_identifier` (e.g. `B0DCLWMB4Y`).
- `contentToken` — derived from `aplus2_sets.content_type`: `PA+` → `PAplus`, `BA+` → `BAplus` (replace `+` with `plus`).
- `V##` — `aplus2_versions.version_number`, zero-padded to 2 digits.

Example: `DRC_SC_US_B0DCLWMB4Y_PAplus_V02`

### File
```
{folderName}_M##_{ITEM}_{ITEMVERSION}.{ext}
```
- `M##` — module position (`aplus2_modules.position`), zero-padded to 2.
- `ITEM` — see resolution rules below.
- `ITEMVERSION` — `DV` (desktop) or `MV` (mobile). **`MV` only when the slot defines a mobile size**; desktop is always `DV`. **Video omits the version suffix.**
- `ext` — `png` | `jpg` | `webp` | `mp4`.

## ITEM token resolution

Resolution order (first match wins), given `(moduleType, slotKey, itemPosition?)`:

1. **Video file** (`kind === "video"`) → `video` — and the file omits `_DV`/`_MV`.
2. **Repeatable item image** (has `itemPosition`):
   - carousel types (`simple_image_carousel`, `regimen_carousel`, `navigation_carousel`, `video_image_carousel`) → `Slide{itemPosition:2}` (e.g. `Slide01`).
   - hotspot types (`hotspots_1`, `hotspots_2`) → `hotspot{itemPosition:2}` (e.g. `hotspot01`).
3. **Module-level image slot:**
   - video thumbnail slot (`video_thumbnail`) → `thumbnail`.
   - comparison hero (`hero_product`) → `hero`.
   - comparison product (`product_N`) → `product{N:2}` (e.g. `product01`).
   - side-by-side images (`image_N` in `dual_images_text`, `four_images_text`) → `image{N:2}`.
   - single image slots (`main_image`, `background_image`) → `image`.

### Full mapping table

| Slot / context | ITEM token | Modules |
|---|---|---|
| Single module image | `image` | full_image, single_image_text, background_image_text, hotspots_1/2 (background) |
| Video thumbnail | `thumbnail` | full_video, video_text |
| Video file | `video` | full_video, video_text, video_image_carousel |
| Comparison hero | `hero` | comparison_table_1, comparison_table_3 |
| Comparison products | `product01`…`product06` | comparison_table_1/2/3 |
| Side-by-side images | `image01`…`image04` | dual_images_text, four_images_text |
| Hotspot item images | `hotspot01`, `hotspot02`… | hotspots_1/2 (index = hotspot position) |
| Carousel panel images | `Slide01`, `Slide02`… | simple/regimen/navigation/video_image carousels (index = panel position) |
| text / qa / technical_specifications | *(no image assets)* | — |

## Worked examples (folder `DRC_SC_US_B0DCLWMB4Y_PAplus_V02`)

```
M01 full_image            …_M01_image_DV.png   …_M01_image_MV.png
M02 single_image_text     …_M02_image_DV.png                        (desktop-only slot)
M03 background_image_text …_M03_image_DV.png   …_M03_image_MV.png
M04 comparison_table_1    …_M04_hero_DV.png    …_M04_product01_DV.png … product06_DV.png
M05 comparison_table_3    …_M05_hero_DV.png  …_M05_hero_MV.png  …_M05_product01_DV.png …
M06 four_images_text      …_M06_image01_DV.png … …_M06_image04_DV.png
M08 hotspots_1            …_M08_image_DV.png   …_M08_hotspot01_DV.png  …_M08_hotspot02_DV.png
M09 simple_image_carousel …_M09_Slide01_DV.png …_M09_Slide01_MV.png   …_M09_Slide02_DV.png
M12 full_video            …_M12_thumbnail_DV.png …_M12_thumbnail_MV.png  …_M12_video.mp4
M14 video_image_carousel  …_M14_video.mp4  …_M14_Slide01_DV.png  …_M14_Slide01_MV.png
```

## Implementation surface

- **`src/lib/aplus2/drive-naming.ts`** — the source of truth. Changes:
  - `aplus2VersionSlug(...)`: drop the marketplace arg from the output; replace `Aplus` with the content token; add a `contentType` arg (and `contentTokenFor(content_type)` helper).
  - `aplus2AssetFilename(...)`: take `moduleType` + `kind` + `slotKey` + `itemPosition`; resolve `ITEM` per the rules above; emit `DV`/`MV` (or none for video).
  - Add a pure `aplus2ItemToken({ moduleType, kind, slotKey, itemPosition })` helper so it is unit-testable in isolation.
- **Callers** (must now also pass `content_type` + `module_type`):
  - `src/app/api/aplus2/versions/[versionId]/assets/route.ts` (already selects set + module; add `content_type` and `module_type` to the selects).
  - `src/app/api/aplus2/versions/[versionId]/video-session/route.ts` (same; `video-finalize` reuses the filename returned by the session, so no change there).
- **`src/lib/aplus2/drive-naming.test.ts`** — rewrite expectations for the new grammar + add cases for each ITEM rule (single image, hero/product, image01..N, hotspotNN, SlideNN, thumbnail, video, DV/MV gating).

## Migration (option A — rename existing)

A one-off script renames the existing 27 files for the single PA+ set and updates DB rows:

1. For each `aplus2_assets` row of the version, recompute the new filename from `(moduleType, kind, slotKey, itemPosition, variant)`.
2. `driveClient.renameFile(driveFileGid, newName)` on the Drive file.
3. Update `drive_files.display_name` and `aplus2_assets.filename` to the new name.
4. Rename the Drive **folder** to the new folder name and update `drive_folders.name`.

The script must be idempotent (skip if the name already matches) and log every rename. Run once against the single existing set after the code change lands.

## Edge cases / decisions

- `+` is dropped from the content token (`PAplus`/`BAplus`) for URL/tooling safety.
- `MV` is emitted only when the slot/spec declares a `mobileSize`; otherwise desktop-only → `DV` only.
- Video files carry no version suffix (single video, no mobile variant).
- text / qa / technical_specifications produce no image assets, so no filenames.
- Index width is 2 digits for module (`M01`), product (`product01`), image (`image01`), hotspot (`hotspot01`), and slide (`Slide01`).

## Out of scope

- The legacy `/aplus` (v1) section is untouched.
- No change to upload mechanics (browser-direct video PUT, image multipart) — only the names they produce.
