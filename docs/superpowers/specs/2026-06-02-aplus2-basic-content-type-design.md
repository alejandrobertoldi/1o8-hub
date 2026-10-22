# A+2 Basic (BA+) Content Type — Design Spec

**Date:** 2026-06-02
**Status:** Approved — ready for `/writing-plans`
**Owner:** Manu (1o8 Agency)
**Spec target:** `docs/superpowers/specs/2026-06-02-aplus2-basic-content-type-design.md`

---

## 1. Background / Context

The A+2 editor (`/aplus2/[clientIdCode]`) is a fully schema-driven builder for Amazon Premium A+ content. Every module type is described once in `src/lib/aplus2/module-specs.ts` (`APLUS2_MODULE_SPECS`), and a single generic editor/preview renders text fields, image slots, repeatable item groups, and video slots by reading that spec — there are no per-type body components in A+2 (contrast with A+1's if-else dispatch in `src/components/aplus/aplus-module-card.tsx:379-556`).

Today every A+2 set is implicitly **Premium A+ ("PA+")**: the create path hardcodes the tier and the module cap is a fixed 7. We are adding a second tier, **Basic A+ ("BA+")**, that maps to Amazon's *Standard* A+ modules. Basic content is narrower: a curated catalog of 8 module types, a 5-module cap, a ~970px render canvas, and no video.

This is the implementation-ready transcription of the already-decided brainstorm. **All decisions below are locked. This document does not re-open them.**

### Why this is cheap to build

The data layer already supports BA+ with **zero DB migration** (verified):
- `aplus2_sets.content_type` is `varchar("content_type", { length: 3 })` default `"PA+"` — `"BA+"` fits with no schema change (`src/lib/db/schema.ts:1833`).
- `aplus2_modules.module_type` is a plain `text("module_type")` column — **not** a pgEnum (`src/lib/db/schema.ts:1878`). New `basic_*` type strings insert directly with no migration. (The `aplus_module_type` pgEnum at `schema.ts:34-54` is used only by A+1's `aplus_modules`, not by `aplus2_modules`.)
- `aplus2_module_items.data` is `jsonb` typed `Record<string, unknown>` (`src/lib/db/schema.ts:1915`) — new item shapes are backwards-compatible with no migration.
- The Zod item-data validator is **data-driven** (`buildItemDataSchema` reads `spec.repeatableGroup.fields`, `src/lib/aplus2/zod-schemas.ts:129-138`) — adding new repeatable groups needs no Zod edits.

---

## 2. Locked Decisions

| # | Decision | Locked value |
|---|----------|--------------|
| **Q1** | Basic catalog scope | **Option B:** curated **~8-type Basic catalog**, NOT full 15-type Amazon Standard parity. Extend later if needed. |
| **Q2** | Exact Basic types (8) | `basic_text`, `basic_header_image_text`, `basic_single_image_text`, `basic_three_image_text`, `basic_four_image_text`, `basic_single_image_highlights`, `basic_technical_specifications`, `basic_comparison_table`. |
| **Q3** | Module cap per BA+ set | **5 modules** (hard gate). PA+ stays at 7. Matches Amazon Standard A+ cap of 5 per ASIN (Brand Story excluded). |
| **Q4** | Image slot sizing rule | Slot `desktopSize` is the **MINIMUM** acceptable upload (not a fixed crop); the slot also carries an **aspect reference**. Editors may upload larger as long as the aspect matches and dimensions meet/exceed the minimum. |
| **Q5** | Render canvas width | Basic renders at **~970px** (Amazon Standard width), vs. Premium's 1464px design canvas. |
| **Q6** | Video in Basic | **No video** in BA+. No `full_video` / `video_text` / `video_image_carousel` equivalents; no `video` block on any `basic_*` spec. |
| **Approach 2** | Tier mechanics | Tier is chosen at **set creation** and is **immutable** afterward. New BA+ sets start **empty** (no auto-seeded modules). The add-module picker is **tier-filtered**: BA+ sets only see `basic_*` types; PA+ sets only see the 19 Premium types. |

### Hard rules (non-negotiable)

1. **5-module hard gate** on BA+ sets, enforced server-side at module-create (`POST /api/aplus2/versions/[versionId]/modules`). PA+ = 7.
2. **Tier immutable after create** — no API path mutates `content_type` post-insert.
3. **New BA+ sets start empty** — creation inserts the set + first version only; no modules.
4. **Image min + aspect rule** (Q4) — `desktopSize` is a floor, paired with an aspect reference.
5. **~970px Basic canvas** (Q5) — preview/render container is width-constrained for BA+.
6. **No video in BA+** (Q6).
7. **Reused text columns only** — `basic_*` modules use existing `aplus2_modules` text columns (`headlineText`, `subheadlineText`, `bodyText`, `altText`). No new DB text columns.

---

## 3. Architecture

### 3.1 Tier as a first-class spec field

Add a `tier: "PA+" | "BA+"` field to the `Aplus2ModuleSpec` interface (`src/lib/aplus2/module-specs.ts:132-142`). Populate `tier: "PA+"` on all 19 existing specs and `tier: "BA+"` on the 8 new `basic_*` specs. This single field drives the picker filter (Approach 2) without any code branching elsewhere.

### 3.2 Rendering stays schema-driven

The generic preview (`src/app/aplus2/[clientIdCode]/_components/aplus2-content-preview.tsx`) already iterates modules and looks up `APLUS2_MODULE_SPECS[module.moduleType]` (no per-type components). The 8 `basic_*` specs render through the **same** generic renderer — no new renderer components. The only renderer-layer change is the canvas-width constraint (Q5, see §6.3).

### 3.3 Tier propagation

`content_type` already lives on `aplus2_sets`. It must be surfaced to:
- the **module-create API** (join set → enforce cap, §6.4),
- the **set/versions API** that feeds the editor page (select `contentType`, §6.5),
- the **add-module picker** (filter by tier, §6.6),
- the **new-set dialog** (choose tier at create, §6.7).

---

## 4. The 8 Basic Module Specs (full detail)

All 8 are **`tier: "BA+"`**. Image `desktopSize` values are **minimums + aspect reference** per Q4. Char limits use Amazon-confirmed values where confidence is high; otherwise the design's proposed values are used and flagged `(proposed — confirm at impl)`. All text fields reuse existing columns (`headlineText`/`subheadlineText`/`bodyText`/`altText`).

> Amazon image dimensions cited from the official Standard A+ template PDF (HIGH confidence). Per-cell character limits from Amazon are MEDIUM confidence (the PDF prints no numbers); those are marked proposed where used.

---

### 4.1 `basic_text`

- **Label:** `Basic All Text`
- **Amazon module(s) covered:** Standard "All Text" / Standard Product Description Text
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Headline (optional) | 160 | no |
  | `bodyText` | Body text | 6000 | yes (rows 6) |
- **imageSlots:** none (text-only module)
- **repeatableGroup:** none
- **layoutControls:** none

---

### 4.2 `basic_header_image_text`

- **Label:** `Basic Image Header with Text`
- **Amazon module(s) covered:** Standard Image Header With Text (a.k.a. Company/Brand Header)
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Headline | 160 | no |
  | `bodyText` | Body text | 500 | yes (rows 3) |
- **imageSlots:**
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `header_image` | Header image | 970 × 600 (min) | 970:600 (≈1.62:1) |
- **repeatableGroup:** none
- **layoutControls:** none
- **Notes:** 970×600 confirmed across Amazon sources (HIGH). Headline 160 / body 500 `(proposed — confirm at impl)`.

---

### 4.3 `basic_single_image_text`

- **Label:** `Basic Single Image with Text`
- **Amazon module(s) covered:** Standard Single Left Image **and** Standard Single Right Image (one builder type, side chosen via layout control)
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Headline (optional) | 160 | no |
  | `bodyText` | Body text (optional) | 1000 | yes (rows 4) |
- **imageSlots:**
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `main_image` | Image | 300 × 300 (min) | 1:1 (square) |
- **repeatableGroup:** none
- **layoutControls:** `{ key: "text_position", options: ["left", "right"] }` — `left` = image left/text right (Single Left Image); `right` = image right/text left (Single Right Image). Persisted to existing `aplus2_modules.text_position` column (`schema.ts:1893`).
- **Notes:** 300×300 confirmed in Amazon PDF (HIGH). Char counts `(proposed — confirm at impl)`.

---

### 4.4 `basic_three_image_text`

- **Label:** `Basic Three Images and Text`
- **Amazon module(s) covered:** Standard Three Images & Text
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Module headline | 160 | no |
- **imageSlots:**
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `image_1` | Image 1 | 300 × 300 (min) | 1:1 |
  | `image_2` | Image 2 | 300 × 300 (min) | 1:1 |
  | `image_3` | Image 3 | 300 × 300 (min) | 1:1 |
- **repeatableGroup:** (reuses existing `image_caption` item-data type)
  | property | value |
  |----------|-------|
  | label | `Image Captions` |
  | itemLabel | `Caption` |
  | minItems | 3 |
  | maxItems | 3 |
  | defaultCount | 3 |
  | itemDataType | `image_caption` |
  | fields | `caption` (Image Headline, max 160), `body` (Body Text, multiline rows 2, max 1000 — `proposed`) |
- **layoutControls:** none
- **Notes:** 300×300 ×3 confirmed in Amazon PDF (HIGH). Per-block char counts `(proposed — confirm at impl)`.

---

### 4.5 `basic_four_image_text`

- **Label:** `Basic Four Images and Text`
- **Amazon module(s) covered:** Standard Four Images & Text (200×200 variant — see Open Items for the 135×135 Quadrant ambiguity)
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Module headline | 160 | no |
- **imageSlots:**
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `image_1` | Image 1 | 200 × 200 (min) | 1:1 |
  | `image_2` | Image 2 | 200 × 200 (min) | 1:1 |
  | `image_3` | Image 3 | 200 × 200 (min) | 1:1 |
  | `image_4` | Image 4 | 200 × 200 (min) | 1:1 |
- **repeatableGroup:** (reuses existing `image_caption` item-data type)
  | property | value |
  |----------|-------|
  | label | `Image Captions` |
  | itemLabel | `Caption` |
  | minItems | 4 |
  | maxItems | 4 |
  | defaultCount | 4 |
  | itemDataType | `image_caption` |
  | fields | `caption` (Image Headline, max 160), `body` (Image Body Text, multiline rows 2, max 1000 — `proposed`) |
- **layoutControls:** none
- **Notes:** "Four Images & Text" = 200×200 in Amazon PDF (HIGH). Per-block char counts `(proposed — confirm at impl)`.

---

### 4.6 `basic_single_image_highlights`

- **Label:** `Basic Single Image with Highlights`
- **Amazon module(s) covered:** Standard Single Image & Highlights
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Headline | 160 | no |
  | `subheadlineText` | Subheadline | 50 | no |
  | `bodyText` | Intro body text | 1000 | yes (rows 4) |
- **imageSlots:**
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `main_image` | Image | 300 × 300 (min) | 1:1 |
- **repeatableGroup:** (uses NEW `highlight_bullet` item-data type)
  | property | value |
  |----------|-------|
  | label | `Highlights` |
  | itemLabel | `Highlight` |
  | minItems | 1 |
  | maxItems | 8 |
  | defaultCount | 3 |
  | itemDataType | `highlight_bullet` |
  | fields | `text` (Highlight, max 100) |
- **layoutControls:** none
- **Notes:** Image 300×300 confirmed (HIGH). Subheadline ~50, up to ~8 bullets at ~100 chars `(proposed — confirm at impl)`. Maps to the Amazon variant with bullet highlights beside a square image.

---

### 4.7 `basic_technical_specifications`

- **Label:** `Basic Technical Specifications`
- **Amazon module(s) covered:** Standard Technical Specifications
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Headline | 160 | no |
- **imageSlots:** none (text-only module)
- **repeatableGroup:** (reuses existing `tech_spec_row` item-data type)
  | property | value |
  |----------|-------|
  | label | `Specifications` |
  | itemLabel | `Spec row` |
  | minItems | 4 |
  | maxItems | 16 |
  | defaultCount | 4 |
  | itemDataType | `tech_spec_row` |
  | fields | `spec_label` (Spec Name, max 30 — `proposed`), `spec_value` (Spec Definition, max 500 — `proposed`) |
- **layoutControls:** none
- **Notes:** Row range Min 4 / Max 16 confirmed in Amazon PDF (HIGH). Per-cell char limits `(proposed — confirm at impl)`.

---

### 4.8 `basic_comparison_table`

- **Label:** `Basic Comparison Chart`
- **Amazon module(s) covered:** Standard Comparison Chart (2–6 products)
- **Tier:** `BA+`
- **textFields:**
  | key | label | maxLength | multiline |
  |-----|-------|-----------|-----------|
  | `headlineText` | Title | 80 | no |
- **imageSlots:** (2–6 product columns; min 2 used)
  | key | label | desktopSize (MIN) | aspect reference |
  |-----|-------|-------------------|------------------|
  | `product_1` | Product 1 | 150 × 300 (min) | 1:2 (portrait) |
  | `product_2` | Product 2 | 150 × 300 (min) | 1:2 |
  | `product_3` | Product 3 | 150 × 300 (min) | 1:2 |
  | `product_4` | Product 4 | 150 × 300 (min) | 1:2 |
  | `product_5` | Product 5 | 150 × 300 (min) | 1:2 |
  | `product_6` | Product 6 | 150 × 300 (min) | 1:2 |
- **repeatableGroup:** (uses NEW `basic_comparison_row` item-data type)
  | property | value |
  |----------|-------|
  | label | `Comparison Metrics` |
  | itemLabel | `Metric` |
  | minItems | 1 |
  | maxItems | 10 |
  | defaultCount | 3 |
  | itemDataType | `basic_comparison_row` |
  | fields | `metric` (Metric, max 80), `metric_type` (Type, hint "checkbox or text"), `value_1`…`value_6` (Product 1–6 Value, max 80 each) |
- **layoutControls:** none
- **Notes:** 150×300 per image, 2–6 products, confirmed in Amazon PDF (HIGH). Per-column title ~80, per-cell ~80 `(proposed — confirm at impl)`. Column titles are taken from each product's existing data / ASIN; the repeatable rows hold the metric values.

---

## 5. New & Reused item-data types

`Aplus2ItemDataType` and `Aplus2ItemData` live at `src/lib/aplus2/module-specs.ts:37-47` and `:49-60`.

### Reused (no change)
- **`image_caption`** `{ type, caption, body }` — used by `basic_three_image_text` and `basic_four_image_text` (same shape A+2 Premium `dual_images_text` / `four_images_text` already use).
- **`tech_spec_row`** `{ type, spec_label, spec_value }` — used by `basic_technical_specifications`.

### New (add 2)
Add to `Aplus2ItemDataType` (`module-specs.ts:37-47`):
```ts
| "highlight_bullet"
| "basic_comparison_row"
```
Add to `Aplus2ItemData` discriminated union (`module-specs.ts:49-60`):
```ts
| { type: "highlight_bullet"; text: string }
| { type: "basic_comparison_row"; metric: string; metric_type: string;
    value_1: string; value_2: string; value_3: string;
    value_4: string; value_5: string; value_6: string }
```

No Zod edits required: `buildItemDataSchema` (`zod-schemas.ts:129-138`) generates the validator from `spec.repeatableGroup.fields` + `itemDataType` at runtime.

---

## 6. Touch points (cited)

### 6.1 Module-type registry — `src/lib/aplus2/module-specs.ts:11-31`
Add 8 entries to `APLUS2_MODULE_TYPES`: `basic_text`, `basic_header_image_text`, `basic_single_image_text`, `basic_three_image_text`, `basic_four_image_text`, `basic_single_image_highlights`, `basic_technical_specifications`, `basic_comparison_table`.

### 6.2 Spec interface + records — `module-specs.ts:132-142` and `:163-521`
- Add `tier: "PA+" | "BA+"` to `Aplus2ModuleSpec` (`:132-142`).
- Set `tier: "PA+"` on all 19 existing specs in `APLUS2_MODULE_SPECS` (`:163-521`).
- Add the 8 `basic_*` specs (§4) to `APLUS2_MODULE_SPECS` with `tier: "BA+"`.
- Add the 2 new item-data types (§5) at `:37-47` and `:49-60`.

### 6.3 Render canvas width — `src/app/aplus2/[clientIdCode]/_components/aplus2-content-preview.tsx`
Premium design canvas is 1464px (`module-specs.ts:174,319,330`). Add a `canvasWidth` prop to `Aplus2ContentPreview` defaulting to `1464` (PA+); pass `970` for BA+. Apply as `max-width` on the root preview container (inline style or CSS var). No per-type renderer is added — the existing schema-driven dispatch (`aplus2-content-preview.tsx`, reads `APLUS2_MODULE_SPECS[module.moduleType]`) handles all `basic_*` types unchanged.

### 6.4 Module cap (hard gate) — `src/app/api/aplus2/versions/[versionId]/modules/route.ts:42-56`
Current handler hardcodes `if (nextPos > 7)` (line 55) and loads only `version.id` (lines 42-46). Change:
1. Join the parent set to read tier — `innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))` and select `contentType` (same join pattern already used by sibling endpoints `assets/route.ts`, `video-session/route.ts`, `modules/[moduleId]/reorder/route.ts`).
2. Replace the fixed check with:
```ts
const maxModules = version.contentType === "BA+" ? 5 : 7;
if (nextPos > maxModules) throw new Error("BA+ allows 5 modules, PA+ allows 7");
```
No migration — `content_type` already exists.

### 6.5 Set/versions API for editor — `src/app/api/aplus2/sets/[setId]/versions/route.ts:89-109`
Add `contentType: aplus2Sets.contentType` to the SELECT (`:90-105`) so the editor page receives the tier.

### 6.6 Add-module picker — `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx:41-48`
- Page-level wiring: add `contentType` to `SetDto` (`page.tsx:17-22`); pass the `set` object as a prop to `<Aplus2AddModule>` (`page.tsx:228`); update the component signature to `{ versionId, set, disabled }`.
- Filter before `.map()` (line 41):
```ts
.filter((t) => APLUS2_MODULE_SPECS[t].tier === set.contentType)
```
Result: BA+ sets show only the 8 `basic_*` types; PA+ sets show only the 19 Premium types.

### 6.7 New-set dialog + create API
**Dialog** — `src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx`:
1. `const [contentType, setContentType] = useState<"PA+" | "BA+">("PA+")` (near line 36).
2. Reset to `"PA+"` in the reset block (near line 68).
3. Add a tier `Select` (PA+ / BA+) after the Marketplace selector (after line 149), matching the existing Select pattern.
4. Include `contentType` in the POST body (near line 76).

**API** — `src/app/api/aplus2/sets/route.ts`:
1. Add `contentType: z.enum(["PA+", "BA+"])` to `createSchema` (lines 106-111).
2. Use `body.contentType` for the Drive folder slug (line 201, currently hardcoded `"PA+"`).
3. Insert `contentType: body.contentType` into the set insert values (line 225, currently omitted so it falls back to the `"PA+"` default).

**Empty-on-create rule:** the create path inserts the set + first version only (no modules) — already true; do not add any module seeding for BA+.

---

## 7. Data flow

```
Create set (new-set-dialog)
  └─ POST /api/aplus2/sets { …, contentType: "BA+" }
       └─ insert aplus2_sets (content_type="BA+") + aplus2_versions(v1, no modules)

Open editor (page.tsx)
  └─ GET /api/aplus2/sets/[setId]/versions  → returns set.contentType
       └─ Aplus2AddModule receives set; picker filters specs to tier="BA+"

Add module
  └─ POST /api/aplus2/versions/[versionId]/modules { moduleType: "basic_*" }
       └─ join set → maxModules = (BA+ ? 5 : 7); gate on nextPos
       └─ insert aplus2_modules (module_type="basic_*", reused text columns)

Edit repeatable items
  └─ items stored in aplus2_module_items.data (jsonb), shape = itemDataType
       └─ Zod buildItemDataSchema validates from spec.fields (no code change)

Preview / render
  └─ Aplus2ContentPreview(canvasWidth = BA+ ? 970 : 1464)
       └─ schema-driven render of basic_* via APLUS2_MODULE_SPECS (no new components)
```

---

## 8. Error handling

| Condition | Behavior |
|-----------|----------|
| Add 6th module to BA+ set | Server throws `"BA+ allows 5 modules, PA+ allows 7"` at `modules/route.ts`; UI surfaces the error and disables Add when count ≥ cap. |
| PA+ module type requested on a BA+ set (or vice-versa) | Blocked by the picker tier filter; defense-in-depth: API may reject a `moduleType` whose `spec.tier !== set.contentType`. |
| Missing required image on a `basic_*` slot | Same validation path as Premium (no special case). |
| Image below `desktopSize` minimum or wrong aspect (Q4) | Reject upload with a min-size/aspect message (extends existing image-validation; aspect reference comes from the slot spec). |
| `contentType` not `"PA+"`/`"BA+"` at create | Rejected by `z.enum(["PA+","BA+"])` in `createSchema`. |
| Attempt to change tier after create | No API path exposes `content_type` mutation; tier is immutable by omission. |

---

## 9. Testing (TDD)

Write tests first, per `/test-driven-development`.

1. **Spec registry integrity** — all 8 `basic_*` keys exist in `APLUS2_MODULE_TYPES` and `APLUS2_MODULE_SPECS`; each has `tier: "BA+"`; all 19 Premium specs have `tier: "PA+"`; no `basic_*` spec has a `video` block (Q6).
2. **Zod item-data** — `highlight_bullet` and `basic_comparison_row` validate valid payloads and reject extra/over-length fields (strictObject, maxLength). Reused `image_caption` / `tech_spec_row` still validate.
3. **Module cap gate** — adding the 6th module to a BA+ version throws; 5 succeed; PA+ still allows 7. (Integration test against `modules/route.ts` with mocked set join.)
4. **Picker filter** — given `set.contentType="BA+"`, only the 8 `basic_*` types render; given `"PA+"`, only the 19 Premium types render.
5. **Create flow** — `createSchema` accepts/rejects `contentType`; insert persists `"BA+"`; first version created with **zero** modules; tier round-trips through the versions API.
6. **Canvas width** — `Aplus2ContentPreview` applies 970px max-width when `canvasWidth=970`, 1464 default.

---

## 10. Scope

### In scope (v1)
- 8 `basic_*` module specs with `tier` field; tier added to all 19 Premium specs.
- 2 new item-data types (`highlight_bullet`, `basic_comparison_row`); reuse `image_caption`, `tech_spec_row`.
- Tier selector in new-set dialog + `contentType` in create API; tier persisted (no migration).
- Tier-filtered add-module picker; tier surfaced via versions API.
- 5-module hard gate (tier-aware) at module-create.
- ~970px Basic preview canvas.
- Image min + aspect validation rule wired into `basic_*` slots.
- Tests per §9.

### Out of scope (v1)
- Full 15-type Standard parity (Q1 = Option B; the remaining Standard modules e.g. Single Image & Sidebar, Image+Text Overlay, Four Image Quadrant, Company Logo are deferred).
- Any video equivalents for BA+ (Q6).
- Changing tier after creation.
- Auto-seeding BA+ sets with default modules.
- Amazon `STANDARD_*` publish/export mapping (future, §11).
- Converting `aplus2_modules.module_type` from TEXT to a pgEnum (optional hardening, not required).

---

## 11. Future: `basic_*` → Amazon `STANDARD_*` publish map

When BA+ publishing/export is built, map builder types to Amazon Standard module identifiers:

| `basic_*` (builder) | Amazon Standard module |
|---------------------|------------------------|
| `basic_text` | `STANDARD_TEXT` (All Text) |
| `basic_header_image_text` | `STANDARD_HEADER_IMAGE_TEXT` (Image Header With Text) |
| `basic_single_image_text` | `STANDARD_SINGLE_SIDE_IMAGE` (Single Left/Right Image; side from `text_position`) |
| `basic_three_image_text` | `STANDARD_THREE_IMAGE_TEXT` (Three Images & Text) |
| `basic_four_image_text` | `STANDARD_FOUR_IMAGE_TEXT` (Four Images & Text) |
| `basic_single_image_highlights` | `STANDARD_SINGLE_IMAGE_HIGHLIGHTS` (Single Image & Highlights) |
| `basic_technical_specifications` | `STANDARD_TECH_SPECS` (Technical Specifications) |
| `basic_comparison_table` | `STANDARD_COMPARISON_TABLE` (Comparison Chart) |

(Exact Amazon enum strings to be confirmed against the SP-API / Seller Central A+ content schema at publish-build time.)

---

## 12. Open items (low-confidence facts only)

These are the **only** unresolved points; everything else is locked.

1. **Four-image variant (4.5):** Amazon lists TWO four-image modules — "Four Images & Text" (200×200) and "Four Images / Text Quadrant" (135×135). Spec uses **200×200** as the minimum; confirm at impl which Amazon module `basic_four_image_text` should publish to (affects the §11 map and min size).
2. **Per-cell / per-block character limits (MEDIUM confidence):** The Amazon PDF prints image dimensions but not character counts. The following are **proposed — confirm at impl**: `basic_text` body 6000; `basic_header_image_text` headline 160 / body 500; `basic_single_image_text` 160 / 1000; `basic_three_image_text` & `basic_four_image_text` caption 160 / body 1000; `basic_single_image_highlights` subheadline 50 + ≤8 bullets ×100; `basic_technical_specifications` spec name 30 / value 500; `basic_comparison_table` title 80 / cell 80. (Image dimensions and the 4–16 tech-spec row range are HIGH confidence and considered final.)
