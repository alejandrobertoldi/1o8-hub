# Attribute Section Rethink — Design Spec

**Date:** 2026-04-21
**Status:** Approved (brainstorming) — pending implementation plan
**Related:**
- [2026-04-18-attributes-audit-design.md](./2026-04-18-attributes-audit-design.md) (audit dashboard)
- [2026-04-20-google-sheets-attribute-template-design.md](./2026-04-20-google-sheets-attribute-template-design.md) (Sheets flow)

## 1. Context & motivation

The attribute section has four concrete problems surfaced during Cloud23 onboarding:

1. **Phantom categories.** Uploading a multi-category XLSM produces extra `category_definitions` rows (e.g. `ACCESSORY`) that don't exist in the client's catalog. Amazon ships the Template tab with example rows whose `Product Type` column includes non-client categories as demonstration data. The parser treats those as real.
2. **Shared valid-values across categories.** When the same attribute (e.g. `Variation Theme Name`) appears for multiple product types in one XLSM, the parser collapses all dropdown lists into one keyed by local label. Last upload wins; every category gets the wrong valid values.
3. **No catalog source-of-truth snapshot.** The Template tab is Amazon's snapshot of the client catalog at report-generation time. We throw it away. This is the only authoritative "before" picture for new clients who hire us — useful for case studies and for detecting drift between what Amazon has and what our Master table has.
4. **Create-Sheet flow has coarse column control.** Admins pick *levels* (Required / Conditional / Key / Recommended / Optional) but can't exclude individual columns before handing the Sheet to the client. Clients get noisy sheets with irrelevant attributes.

## 2. Scope

**In scope:**

- Parser rewrite: product types come from Valid Values `Product Type - [ ]` row, not Template-tab data.
- Parser rewrite: per-category valid values — each `category_definitions` row gets its own attribute copies with its own dropdown lists.
- New table `catalog_listing_snapshots` storing Template-tab rows (ASIN-keyed, includes ASINs not in Master). Immutable history, admin-deletable except onboarding-baseline unless forced.
- Attribute Audit dashboard gains a **Drift** pill per category, with drill-down to per-ASIN diffs vs latest snapshot.
- Create-Sheet dialog: levels remain as a preset filter, per-attribute checklist added so admin can untick individual columns before generation. Live column × product count.
- Cleanup script for existing `ACCESSORY`-polluted `category_definitions` rows — dry-run by default.

**Out of scope (v1):**

- Apps Script in the generated Sheet. Admin regenerates if column choice is wrong.
- Auto-import Template snapshot into Master. Snapshots are read-only reference.
- Backfill for historical XLSMs — we don't retain uploaded files. Drift only works after next re-upload per client.
- Retire of `category_definitions.baseline_snapshot` — different purpose (Master at upload), stays.
- Redesign of `/attributes` page — we extend the existing dashboard.

## 3. Decisions locked during brainstorming

| # | Decision | Chosen | Consequence |
|---|----------|--------|-------------|
| 1 | Drift UI surface | Extend existing Attribute Audit dashboard | No new top-level page |
| 2 | Apps Script in the client Sheet | Dropped | Admin picks columns pre-create; regenerate if wrong |
| 3 | Snapshot retention | Keep all; admin can delete non-baseline rows | Case-study value; onboarding baseline protected |
| 4 | Snapshot includes ASINs missing from Master | Yes | Captures "inherited catalog" for new clients |
| 5 | `baseline_snapshot` (Master) vs `catalog_listing_snapshots` (Amazon) | Separate | Different sources, different purposes |

## 4. Architecture

```
┌─── XLSM upload (POST /api/category-definitions) ───────────────────┐
│                                                                    │
│  parseCategoryReport(buffer)                                       │
│    ├─ parseValidValues  → Map<productType, Map<label, string[]>>   │
│    ├─ parseTemplate      → authoritative productTypes[] from       │
│    │                        Valid Values "Product Type - [ ]"      │
│    │                        (fallback: [ PRODUCT_TYPE ] labels)    │
│    ├─ parseDataDefinitions → shared attribute metadata             │
│    └─ parseTemplateSnapshot → ParsedSnapshotRow[]                  │
│                                                                    │
│  returns { reports, snapshots }                                    │
│    - reports: one per real productType, each with its OWN deep-    │
│      copied attributes + per-category valid values                 │
│    - snapshots: all Template-tab data rows, tagged by productType  │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─── DB writes ─────────────────────────────────────────────────────┐
│  category_definitions  (one row per report)                       │
│  category_attributes    (one row per attribute per definition)    │
│  catalog_listing_snapshots  (one row per Template ASIN per upload)│
│    - is_onboarding_baseline=true iff no prior snapshot for        │
│      (client_id_code, product_type)                               │
└──────────────┬────────────────────────────────────────────────────┘
               │
               ▼
┌─── Read paths ────────────────────────────────────────────────────┐
│  GET /api/attributes/audit?includeDrift=true                      │
│    - joins snapshot ↔ category_attribute.bible_field_match ↔      │
│      master → per-category drift count                            │
│                                                                   │
│  DELETE /api/catalog-snapshots/[id]  (admin; baseline requires    │
│    ?force=1)                                                      │
│                                                                   │
│  POST /api/attributes/template-requests  (Create Sheet)           │
│    - accepts includedAttributeIds[]; levels still accepted for    │
│      back-compat                                                  │
└───────────────────────────────────────────────────────────────────┘
```

## 5. Data model

**New table `catalog_listing_snapshots`**

```sql
CREATE TABLE catalog_listing_snapshots (
  id                      serial PRIMARY KEY,
  client_id_code          varchar(100) NOT NULL,
  product_type            varchar(255) NOT NULL,
  marketplace_id          varchar(50)  NOT NULL DEFAULT 'ATVPDKIKX0DER',
  asin                    varchar(20)  NOT NULL,
  sku                     varchar(255),
  parentage               varchar(20),        -- 'Parent' | 'Child'
  values                  jsonb        NOT NULL,  -- { [amazonFieldName]: string }
  source_definition_id    integer REFERENCES category_definitions(id) ON DELETE SET NULL,
  uploaded_at             timestamptz  NOT NULL DEFAULT now(),
  uploaded_by             varchar(255) NOT NULL,
  is_onboarding_baseline  boolean      NOT NULL DEFAULT false
);
CREATE INDEX idx_cls_client_pt  ON catalog_listing_snapshots(client_id_code, product_type);
CREATE INDEX idx_cls_asin       ON catalog_listing_snapshots(asin);
CREATE INDEX idx_cls_uploaded   ON catalog_listing_snapshots(uploaded_at DESC);
```

- `source_definition_id` uses `ON DELETE SET NULL` so snapshots outlive re-uploads.
- `values` keys by Amazon field name; mapping to Master goes through `category_attributes.bible_field_match` (existing matcher).
- First row per `(client_id_code, product_type)` is marked `is_onboarding_baseline = true` and protected from delete.

**`attribute_template_requests` — add column**

```sql
ALTER TABLE attribute_template_requests
  ADD COLUMN included_attribute_ids jsonb;
```

Nullable. When set, supersedes `levels` for sheet generation.

**No schema change** to:
- `category_definitions` — `baseline_snapshot` stays (Master-at-upload). Different from `catalog_listing_snapshots` (Amazon-at-upload).
- `category_attributes` — already per-definition, so per-category valid-values works once the parser stops collapsing them.

## 6. Parser rewrite

File: `src/lib/category-report-parser.ts`.

**Return shape change**

```ts
export interface ParsedSnapshotRow {
  productType: string;
  asin: string;
  sku: string | null;
  parentage: string | null;           // 'Parent' | 'Child' | null
  values: Record<string, string>;     // amazonFieldName → value
}

export interface ParseResult {
  reports: ParsedCategoryReport[];    // unchanged shape, but per-category valid values
  snapshots: ParsedSnapshotRow[];     // all Template-tab data rows
}
```

Callers of the current `parseCategoryReport(buf): ParsedCategoryReport[]` must migrate to `parseCategoryReport(buf): ParseResult`.

**Changes to functions**

- `parseValidValues`: returns `Map<productType, Map<labelLower, string[]>>`. Extracts productType from `Local Label - [ PRODUCT_TYPE ]` col B pattern.
- `parseTemplate`: new authoritative strategy — scan Valid Values for row where col B is exactly `Product Type - [ ]` (empty brackets), cols C+ are the real product types. Current Strategy 2 (scan `[ PRODUCT_TYPE ]` labels) becomes fallback. Strategy 1 (Template-tab data-row scan) is dropped. `UNKNOWN` fallback throws.
- `parseDataDefinitions`: unchanged — attribute metadata is shared across categories.
- `parseTemplateSnapshot` (new): row 5 (index 4) = Amazon field names, rows 6+ (index 5+) = data rows. For each row: read ASIN, SKU, Parentage Level, Product Type. If Product Type ∈ authoritative list, emit a `ParsedSnapshotRow`. Skip otherwise (filters leftover example rows).
- `parseCategoryReport`: for each report, deep-copy attributes and merge in that category's valid values from the outer map.

## 7. Upload route changes

File: `src/app/api/category-definitions/route.ts`.

After existing `categoryDefinitions` + `categoryAttributes` upsert:

1. For each `(client_id_code, product_type)` pair in `parsed.reports`, check if any prior `catalog_listing_snapshots` rows exist. If none → `is_onboarding_baseline = true` for this batch; else false.
2. Insert `parsed.snapshots` into `catalog_listing_snapshots` in batches of 100, setting `source_definition_id` to the corresponding new definition's id.
3. Never delete prior snapshots on re-upload. History is immutable from the upload pathway.

Existing `baseline_snapshot` logic (Master values at upload) is untouched.

## 8. UI changes

### 8.1 Attribute Audit dashboard

File: `src/components/attributes/audit-dashboard.tsx`.

Per-category card gains a **Drift** pill alongside existing `{N missing}` / `Complete`:

```
ACCESSORY   218 products   12R 65C   218 missing   17 drifted
```

- Count = ASINs where the latest `catalog_listing_snapshots` row (highest `uploaded_at` per ASIN) differs from Master on any `bible_field_match`-mapped field.
- Grey at 0, amber when >0. Click opens a sibling drill-down tab to gaps (not a replacement).
- Drill-down: per-ASIN list with two-column diff `Amazon snapshot | Master current` for each changed field. Side panel "View snapshot history" shows all snapshots for that ASIN.

Snapshot admin section: expandable "Snapshot history" row inside the dashboard's client card. Columns: uploaded_at, uploaded_by, ASIN count, onboarding-baseline badge, Delete. Baseline rows disable the Delete unless `?force=1`.

### 8.2 Create-Sheet dialog

File: `src/components/attributes/template-dialog.tsx`.

Levels filter stays as a preset. Below it, a collapsible attribute checklist (grouped by `category_attributes.groupName`) with per-attribute checkboxes. Tick/untick updates a live `N columns × M products` counter. Submit sends `includedAttributeIds`.

```
Levels:           [x] Required (12)  [x] Conditional (65)  [ ] Recommended (141)
────────────────────────────────────────────────────────────────────
Attributes:       ▼ Product Identity
                     [x] Product Name          Required
                     [x] Brand                 Required
                     [ ] Manufacturer          Optional
                     [x] Bullet Point 1        Recommended
                  ▶ Variation
                  ▶ Dimensions
                  ...
────────────────────────────────────────────────────────────────────
Preview: 34 columns × 218 products                    [ Create Sheet ]
```

### 8.3 Backend `POST /api/attributes/template-requests`

- Accept `includedAttributeIds: number[]` (new) in addition to `levels`.
- `buildTemplateSheets` filters attributes by `includedAttributeIds` when present; falls back to `levels` otherwise.
- Persist `included_attribute_ids` on the row.

## 9. Migrations & scripts

- **`drizzle/migrations/0042_catalog_listing_snapshots.sql`** — new table + indexes (definition in §5).
- **`drizzle/migrations/0043_template_requests_included_ids.sql`** — `included_attribute_ids jsonb`.
- **`scripts/cleanup-phantom-categories.ts`** — prints suspected-phantom `category_definitions` rows (heuristic: multiple definitions for same client sharing identical `total_attributes` / `required_count` values with identical sibling attribute fingerprints). Dry-run by default; `--delete` confirms.
- **No backfill** for `catalog_listing_snapshots` — drift works on the next re-upload.

## 10. Testing strategy

**Parser unit tests** — `src/lib/category-report-parser.test.ts`:

- Multi-category fixture with Amazon example rows → only real product types returned, no `ACCESSORY`.
- Per-category valid-values fixture → each report's `attributes[i].validValues` holds that category's list.
- Template-tab snapshot fixture with 10 rows → `snapshots.length === 10`, correct `productType` assignment, Amazon field names keyed correctly.
- Missing "Product Type - [ ]" Valid Values row → falls back to `[ PRODUCT_TYPE ]` label scan.
- No product types found → parser throws (no `UNKNOWN` fallback).

**Integration tests:**

- `POST /api/category-definitions` with multi-category fixture:
  - `catalog_listing_snapshots` rows inserted with correct `source_definition_id`.
  - First upload per `(client, product_type)` has `is_onboarding_baseline = true`; subsequent uploads don't overwrite prior history.
- `GET /api/attributes/audit?includeDrift=true`:
  - Drift count = 0 when snapshot matches Master.
  - Drift count > 0 when a bible-mapped field differs.
- `DELETE /api/catalog-snapshots/[id]`:
  - 409 on baseline without force; 200 with `?force=1`.

**UI smoke:**
- Create-Sheet dialog: unticking all attributes disables Create button.
- Unticking one attribute decrements preview count; generated Sheet omits that column.

**Manual QA:**
- Re-upload Cloud23 XLSM → only SAUCE appears (no ACCESSORY).
- Drift pill shows count; drill-down renders the diff.
- Snapshot history section lists uploads, baseline protected.

## 11. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Existing `ACCESSORY`-polluted rows in prod | Cleanup script with dry-run; admin confirms before delete |
| Snapshot table grows unbounded | Single client × single category × monthly upload ~= 218 rows/month. Negligible at 1o8's scale. Admin delete available. |
| Drift query fans out to all snapshots | Index on `(client_id_code, product_type)` + `uploaded_at DESC`; query filters to latest snapshot per ASIN with a window function. |
| Column picker UX overwhelming on 200-attribute categories | Collapsible groups default collapsed except Required group; "Select all at level" shortcuts via the levels filter above. |
| Breaking change to `parseCategoryReport` return shape | One call site (`POST /api/category-definitions`). Update in same PR as parser. |

## 12. Open questions

None — all ambiguities resolved during brainstorming.
