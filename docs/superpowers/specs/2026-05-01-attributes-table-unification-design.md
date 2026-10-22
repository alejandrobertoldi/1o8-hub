# Attributes Table Unification — Design

**Status:** Approved (awaiting implementation plan)
**Date:** 2026-05-01
**Author:** Manu + brainstorming session

## Goal

Replace the fragmented attribute-mapping infrastructure (one global `column_attributes` table, a per-client `category_attributes` table, plus a hand-coded regex bridge in `clr-attribute-aliases.ts`) with a single canonical `attributes` table that holds every label variant a given attribute can appear under (Hub, Seller Central, Vendor Central, BigQuery, Supabase, CLR, ALR) plus the per-category requirement metadata that varies by Amazon product type.

## Why

Today, mapping the same attribute (e.g. SKU) across surfaces requires three lookups: BigQuery `Master` schema (`SKU`), Postgres `master` column (`sku`), CLR row-5 key (`contribution_sku#1.value`), ALR header (`seller-sku`). The existing alias bridge ([src/lib/onboarding/clr-attribute-aliases.ts](../../src/lib/onboarding/clr-attribute-aliases.ts)) covers only ~50 attributes and is hand-maintained. ALR mapping is a separate hardcoded path. There is no Vendor Central mapping at all.

Consolidating this gives:
- One row per attribute, all label variants as first-class columns
- Per-(marketplace × productType) requirement / valid-values / description / example in a single JSONB
- Data-driven CLR + ALR + (future) VC parsing — no more hardcoded regex tables
- Audit + admin UIs join one table instead of three

## Non-goals

- Building a Vendor Central template parser (slot reserved; out of scope here)
- Brand-bible / SB writeback to BigQuery
- Changes to BQ `1o8Hub.Master` schema
- Changes to per-product `is_key` overrides (`product_key_overrides` table is unaffected)

## Background

Three current sources mapped to one new table:

| Today | Holds | Owner | Maintained where |
|---|---|---|---|
| `column_attributes` (972 rows) | global label variants + per-client requirements | BQ Bible Sheet | manually edited in a Sheet that publishes to `1o8BibleApp.Attributes` |
| `category_attributes` (per upload) | per-(client × productType) requirement, valid_values, description, example, is_key, bible_field_match | CLR upload at `/admin/attributes` and onboarding step 8 | auto-populated from XLSM |
| `category_definitions` | upload audit (which client × productType × marketplace × when × who) | Hub | auto |
| `clr-attribute-aliases.ts` | regex map: CLR row-5 key → bqName, for ~50 attributes | hand-coded | edited in source |
| `alr-parser.ts` field map | hardcoded ALR header → master column, ~10 fields | hand-coded | edited in source |

## Final schema

Rename `column_attributes` → `attributes`. Final column list:

```sql
id                  serial PRIMARY KEY
master_row          integer NOT NULL                 -- ordering, kept from old schema
general_label       varchar(255) NOT NULL UNIQUE     -- Hub-facing canonical name (e.g. "SKU")
description         text                              -- attribute definition (was label_details)

-- Label variants (one row, many surfaces)
sc_label            text                              -- Seller Central CLR row-5 key, e.g.
                                                      --   "contribution_sku#1.value"
                                                      --   "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value"
                                                      -- Marketplace + language are stored as literal placeholders
                                                      -- {MP} and {LANG}; runtime substitution swaps real values.
sc_label_multi      varchar(20)                       -- null | "concat" | "first" — preserves multi-instance handling
                                                      -- from the existing alias bridge for #1, #2 fields.
vc_label            text                              -- Vendor Central template equivalent (NEW, nullable)
bq_label            text                              -- BigQuery 1o8Hub.Master column header (e.g. "SKU")
                                                      -- (was bigquery_label)
sb_label            text                              -- Postgres master column name (NEW, e.g. "sku")
clr_label           text                              -- CLR row-4 readable header (often = general_label,
                                                      -- but stored explicitly because the team's CLR has been
                                                      -- observed to drift from the Hub's General Label).
alr_label           text                              -- ALR kebab-case header (NEW, e.g. "seller-sku")

-- Existing metadata (kept)
bq_data_type        varchar(20) DEFAULT 'STRING'
label_max_options   varchar(10)                       -- "Free Text" or numeric cap
reference_group     varchar(100) NOT NULL
subgroup            varchar(100) DEFAULT ''
is_essential        boolean NOT NULL DEFAULT false
client_requirements jsonb NOT NULL DEFAULT '{}'       -- per-client requirement strings, unchanged
                                                      -- (different dimension than category_meta — coexists)

-- NEW: variety-pack flag (see §Variation attributes below)
-- Note: "is variation attribute" is NOT a column here — it's per-product, derived at runtime
-- from master.variation_theme_name (e.g. theme = "Color/Size" → Color and Size are variation
-- attributes for THIS product only). See §Variation attributes for derivation rules.
is_vp_flag             boolean NOT NULL DEFAULT false  -- true ONLY for the new IsVP attribute row;
                                                       -- VP detection reads this flag instead of string-matching "Variety Pack"

-- NEW: per-category metadata
category_meta       jsonb NOT NULL DEFAULT '{}'
```

`category_meta` JSONB shape (marketplace at top, product_type nested):

```jsonc
{
  "ATVPDKIKX0DER": {
    "SHIRT": {
      "requirement": "required",                      // required | conditionally_required | suggested | optional | recommended
      "validValues": null,                            // null = free text; array of strings = limited values
      "description": "category-specific definition",  // overrides global description if set
      "example": "...",
      "isKey": false                                  // Hub-tagged "Key" flag, per-category
    },
    "SHOES": {
      "requirement": "conditionally_required",
      "validValues": ["Red", "Blue", "Green"],
      "description": "...",
      "example": "...",
      "isKey": true
    }
  },
  "A1F83G8C2ARO7P": {                                 // UK marketplace, separate scope
    "SHIRT": { ... }
  }
}
```

**Indexes:**
- Existing: `general_label`, `reference_group`, `subgroup`, `is_essential`
- New: GIN on `category_meta` for `?` / `@>` queries (e.g. "all attributes required for `SHIRT` in US")

**Capacity assumption:** scope capped at ~100 product types per marketplace. If we ever exceed that materially, this design needs revisiting.

## Data flow

Two natural pipelines, each writing to its own slice of an attribute row. No collisions.

### Pipeline 1: BQ Bible → label variants (existing, extended)

Nightly `syncAttributes()` reads `amazon-data-461918.1o8BibleApp.Attributes` and writes:
- `general_label, description, sc_label, sc_label_multi, vc_label, bq_label, sb_label, clr_label, alr_label`
- `bq_data_type, label_max_options, reference_group, subgroup, is_essential, client_requirements`

The BQ Bible Sheet gets four new columns: `VCLabel`, `SBLabel`, `ALRLabel`, `CLRLabel` (the rest already exist under different names — see migration §Backfill).

`syncAttributes()` does NOT touch `category_meta`.

### Pipeline 2: CLR upload → category_meta (existing, retargeted)

CLR can be uploaded via two entry points — both call `parseCategoryReport`:
- `/admin/attributes` (admin)
- Onboarding step 8 ([src/app/api/onboarding/clr-import/route.ts](../../src/app/api/onboarding/clr-import/route.ts))

For each upload, the parser produces a list of `(amazonFieldName, requirement, validValues, description, example)` rows for a specific `(clientIdCode, productType, marketplaceId)`. Rewritten flow:

1. For each row, look up the matching attribute in `attributes` by regex-matching `amazonFieldName` against `attributes.sc_label` (with `{MP}`/`{LANG}` placeholders substituted).
2. If matched, upsert `attributes.category_meta -> $.{marketplaceId}.{productType} = { requirement, validValues, description, example, isKey: <preserved-or-default-false> }`.
3. If not matched, log to a `clr_unmatched_fields` audit log (one row per unmatched field per upload). This replaces the silent "drop unmapped CLR-format keys" behavior in the current code.

`category_definitions` row is still written per upload (audit trail of "client X uploaded productType Y from marketplace Z at time T by user U"). `category_attributes` table is dropped.

### Pipeline 3: ALR ingestion (existing, retargeted)

[src/lib/alr-parser.ts](../../src/lib/alr-parser.ts) currently has a hardcoded list of ~10 ALR header → master column mappings. Replaced with a query to `attributes` table: `SELECT general_label, alr_label, bq_label, sb_label FROM attributes WHERE alr_label IS NOT NULL`. ALR header → master column lookup is then data-driven.

## Migration plan

One-time, idempotent SQL + script. New migration file `drizzle/migrations/0047_attributes_unification.sql` plus a runner `scripts/run-migration-0047-attributes-unification.ts` (per primer.md convention).

### Step 1: Schema changes

```sql
ALTER TABLE column_attributes RENAME TO attributes;
ALTER TABLE attributes RENAME COLUMN specific_label TO sc_label;
ALTER TABLE attributes RENAME COLUMN bigquery_label TO bq_label;
ALTER TABLE attributes RENAME COLUMN label_details TO description;
ALTER TABLE attributes ADD COLUMN sc_label_multi varchar(20);
ALTER TABLE attributes ADD COLUMN vc_label text;
ALTER TABLE attributes ADD COLUMN sb_label text;
ALTER TABLE attributes ADD COLUMN alr_label text;
ALTER TABLE attributes ADD COLUMN clr_label text;
ALTER TABLE attributes ADD COLUMN category_meta jsonb NOT NULL DEFAULT '{}';
CREATE INDEX idx_attributes_category_meta ON attributes USING GIN (category_meta);
```

### Step 2: Backfill (script-driven, before drops)

1. **`clr_label = general_label`** — they're the same for the existing 972 rows. Direct UPDATE.
2. **`sb_label`** — introspect Postgres `master` table columns via `information_schema.columns`. For each `attributes` row, find a master column whose name matches `snake_case(bq_label)` or matches `bq_label` directly. Best-effort; log unmatched to stderr for manual fill.
3. **`alr_label`** — seed from a hardcoded map of ~30 known ALR headers (`seller-sku → SKU`, `asin1 → ASIN`, `item-name → ItemName`, `price → ListPrice`, `image-url → MainImageURL`, etc.) drawn from current `alr-parser.ts`.
4. **`sc_label_multi`** — for the ~5 attributes flagged `multi: "concat"` in current `clr-attribute-aliases.ts` (GenericKeywords, PlatinumKeywords, BulletPoint*, etc.), set `sc_label_multi = 'concat'`. Default null = "first".
5. **`vc_label`** — leave NULL. Populated manually in BQ Bible Sheet over time.
6. **`category_meta`** — most complex step:
   ```
   For each row in category_attributes (joined to category_definitions):
     mp  = category_definitions.marketplace_id
     pt  = category_definitions.product_type
     attribute_id = match category_attributes.amazon_field_name to attributes.sc_label
       (apply {MP}/{LANG} substitution; fallback to attributes.bible_field_match if SC match fails)
     if matched:
       UPDATE attributes
       SET category_meta = jsonb_set(
         category_meta,
         ARRAY[mp, pt],
         jsonb_build_object(
           'requirement', category_attributes.requirement,
           'validValues', category_attributes.valid_values,
           'description', category_attributes.description,
           'example',     category_attributes.example,
           'isKey',       category_attributes.is_key
         ),
         true
       )
       WHERE id = attribute_id
     else:
       log "unmatched: {amazon_field_name} (definition #{definition_id})"
   ```

### Step 3: Drop redundant artifacts (after backfill verification)

```sql
DROP TABLE category_attributes;
-- specific_label, bigquery_label, label_details already renamed in Step 1.
-- bible_field_match lived on category_attributes, removed by the table drop above.
```

`category_definitions` is **kept** as upload audit log.

### Step 4: BQ Bible Sheet update

The BQ Bible Sheet gets four new columns: `VCLabel`, `SBLabel`, `ALRLabel`, `CLRLabel`. Initial values can be exported FROM the post-backfill `attributes` table back into the Sheet as a one-shot, so the Sheet and Postgres start in sync.

`syncAttributes()` in [src/lib/sync-tables.ts](../../src/lib/sync-tables.ts) is extended to read these four new BQ columns and write them through.

### Step 5: Application updates

These are application-layer changes that happen alongside the migration:

| File | Change |
|---|---|
| [src/lib/onboarding/clr-attribute-aliases.ts](../../src/lib/onboarding/clr-attribute-aliases.ts) | Replace hardcoded `ALIASES` array with a runtime lookup against `attributes.sc_label`. Keep the `extractMarketplace()` helper. Marketplace/language placeholder substitution becomes a small helper function. |
| [src/lib/alr-parser.ts](../../src/lib/alr-parser.ts) | Replace hardcoded field map with `attributes.alr_label` lookup. |
| [src/lib/category-definitions/upsert.ts](../../src/lib/category-definitions/upsert.ts) | Rewrite to write into `attributes.category_meta` JSONB instead of `category_attributes` rows. |
| [src/lib/category-attribute-matcher.ts](../../src/lib/category-attribute-matcher.ts) | Audit logic now reads from `attributes.category_meta` instead of `category_attributes`. |
| [src/app/admin/attributes/*](../../src/app/admin/attributes/) | Refactor data fetching to source per-category data from `attributes.category_meta`. UX unchanged. |
| [src/app/api/attributes/audit/route.ts](../../src/app/api/attributes/audit/route.ts) | Same — repoint to new data source. |
| [src/app/admin/sync/page.tsx](../../src/app/admin/sync/page.tsx) | Update label "column_attributes" → "attributes". |
| [src/lib/sync-tables.ts](../../src/lib/sync-tables.ts) | Extend `syncAttributes()` to pull the 4 new BQ columns. |
| [src/lib/db/schema.ts](../../src/lib/db/schema.ts) | Update Drizzle schema: rename, add columns, drop `categoryAttributes`. |

## Edge cases & decisions

- **SC label storage format** — store as literal CLR row-5 string with `{MP}` and `{LANG}` placeholders (e.g. `item_name[marketplace_id={MP}][language_tag={LANG}]#1.value`). Substitution at lookup time. Reason: human-readable in BQ Sheet, easier to author than full regex.
- **Multi-instance attributes** (`#1`, `#2` BulletPoints, GenericKeywords) — preserved via `sc_label_multi varchar(20)` column with `null | "concat" | "first"`. Lookup logic mirrors existing alias bridge behavior.
- **Match fallback** — backfill uses `sc_label` first, then `bible_field_match` (existing `category_attributes` column) as a fallback. Going forward, only `sc_label` is the matching contract.
- **Unmatched CLR fields** — logged to a new `clr_unmatched_fields` audit table (one row per upload, one row per unmatched field) instead of silently dropped. Simple, append-only. Schema:
  ```
  upload_id   → category_definitions.id
  field_name  → text
  logged_at   → timestamp
  ```
- **Per-client `client_requirements` JSONB** — kept as-is. Different semantic dimension (per-client business rules, not per-category Amazon rules). Coexists with `category_meta`.
- **`bible_field_match`** — dropped after backfill. Its purpose was to bridge Amazon CLR field names to Hub General Labels; that's now `attributes.sc_label`'s job.

## Variation attributes & Variety Pack detection

Today, [docs/sections/variety-pack-builder.md](../../sections/variety-pack-builder.md) detects a Variety Pack by string-matching `"Variety Pack"` inside one of the variation attributes (Flavor / Color / Size / Style). This is fragile: if a client misspells or rewords, detection silently fails.

This spec replaces that with a data-driven approach:

### New `IsVP` attribute (one new row in the `attributes` table)

| Field | Value |
|---|---|
| `general_label` | `IsVP` |
| `description` | `Marks the product as a Variety Pack. When true, variation attribute values become multi-valued.` |
| `bq_data_type` | `BOOLEAN` |
| `sb_label` | `is_vp` (requires a new boolean column on `master`) |
| `bq_label` | `IsVP` |
| `is_vp_flag` | `true` |
| `sc_label` / `vc_label` / `clr_label` / `alr_label` | NULL (Amazon-side equivalent doesn't exist; this is a Hub-internal flag) |

VP detection becomes: `master.is_vp = true` (set when any attribute with `is_vp_flag=true` is true on the product).

### Per-product variation attribute derivation

There is **no global `is_variation_attribute` column** on the `attributes` table. Whether an attribute is a variation attribute is decided **per product** at runtime by parsing `master.variation_theme_name`.

Derivation rule:

```
parseVariationTheme(product.variation_theme_name) → string[]
  // Examples:
  //   "Color/Size"  → ["Color", "Size"]
  //   "Flavor"      → ["Flavor"]
  //   "ColorSize"   → ["Color", "Size"]   (Amazon's PascalCase format)
  //   null/empty    → []

isVariationAttribute(product, attribute) =
  attribute.general_label ∈ parseVariationTheme(product.variation_theme_name)
```

When `isVariationAttribute(product, attr) = true`:

1. **Free-text override** — Hub UI ignores `category_meta[mp][productType].validValues` for this attribute on this product and always renders a free-text input. Rationale: clients use their own vocabulary (e.g. "Hot Habanero" instead of Amazon's "Spicy"), and forcing a CLR-derived limited-value list breaks that.
2. **Multi-value on VP products** — when `master.is_vp = true`, the variation attribute value may be a JSON array/set instead of a single string. Example: `master.flavor = ["Hot Habanero", "Sweet Jalapeño"]`. Storage: continue to use the same `master.flavor text` column but allow JSON-encoded array; UI parses on read.
3. **Auto-mark on theme assignment** — when the user assigns a variation theme to a parent product (or VP), all child products inheriting that theme are automatically treated as having those attributes flagged. No DB write is required because `variation_theme_name` is the single source of truth — the flag is derived, not stored.

### Variation theme picker

The picker at `/variations` continues to use Amazon's standard variation theme list (Color, Size, Style, Flavor, Pattern, Material, etc.) — same as today. No new "eligible variation attributes" column is needed because the picker doesn't need to filter from the 972-row attributes table; it shows a small fixed list of valid Amazon variation themes plus the new `IsVP` flag.

### Migration impact

- Insert one new attribute row: `IsVP` (with `is_vp_flag = true`).
- No global "is variation attribute" backfill — the flag is per-product, derived from `variation_theme_name` at runtime (no migration data work).
- Add `master.is_vp boolean DEFAULT false` column. Backfill from existing string-match logic: `is_vp = (flavor LIKE '%Variety Pack%' OR color LIKE '%Variety Pack%' OR size LIKE '%Variety Pack%' OR style LIKE '%Variety Pack%')`.
- Update [src/lib/variety-pack-builder/*](../../src/lib/) (or wherever the current detection lives) to read `master.is_vp` instead of string-matching variation values.

### Out of scope

- BQ Bible Sheet doesn't get a "VC label" for `IsVP` — it's Hub-internal.
- Whether multi-value variation attributes round-trip back to BigQuery `Master` is a separate question; for now they're stored as JSON-encoded strings in the existing text column, and the Hub UI does the parsing.

## Acceptance criteria

1. `attributes` table exists with all columns above. Drizzle schema in sync.
2. Existing 972 rows backfilled: `sc_label`, `bq_label`, `description`, `clr_label`, `alr_label` (where seedable), `sb_label` (best-effort) populated. `vc_label` may be empty.
3. `category_meta` populated from existing `category_attributes` rows, no data loss vs prior state.
4. `category_attributes` table dropped. `category_definitions` retained.
5. CLR upload via `/admin/attributes` and onboarding step 8 writes into `attributes.category_meta`. Unmatched fields logged to `clr_unmatched_fields`.
6. Attribute audit dashboard at `/attributes` shows the same counts as pre-migration when run on the same data.
7. ALR import correctly maps known ALR headers (regression test against existing onboarding test fixtures).
8. `clr-attribute-aliases.ts` no longer exports `ALIASES` array; lookup is data-driven against `attributes.sc_label`. Helpers (`extractMarketplace`, placeholder substitution) retained.
9. `IsVP` attribute exists in `attributes` table with `is_vp_flag = true`. `master.is_vp` boolean column added and backfilled from prior string-match logic. Variety-pack detection now reads `master.is_vp`. Existing VPs continue to be flagged (no regression).
10. For any product where an attribute is in `parseVariationTheme(master.variation_theme_name)`, the Hub UI renders that attribute as free-text input regardless of `category_meta` valid values, and accepts JSON-array values when `master.is_vp = true`.
9. `syncAttributes()` reads four new BQ columns; staging/dev sync run shows them populated.

## Test plan

- Unit: backfill script idempotency (run twice, no double-write)
- Unit: `sc_label` placeholder substitution (`{MP}`, `{LANG}`) round-trip
- Unit: ALR header lookup data-driven (regression vs. current `alr-parser.test.ts`)
- Integration: CLR upload writes correct `category_meta` JSONB structure (multi-marketplace fixture)
- Integration: attribute audit produces same gap counts pre/post migration on same client
- Manual: visual QA at `/admin/attributes`, `/attributes`, `/admin/sync`

## Rollback

Migration is reversible up to Step 3. After `DROP TABLE category_attributes`, rollback requires restoring from backup. Recommend taking a Postgres logical dump of `column_attributes`, `category_attributes`, `category_definitions` before migration runs.

## References

- Existing schema: [src/lib/db/schema.ts](../../src/lib/db/schema.ts) lines 245-505
- Existing alias bridge: [src/lib/onboarding/clr-attribute-aliases.ts](../../src/lib/onboarding/clr-attribute-aliases.ts)
- ALR parser: [src/lib/alr-parser.ts](../../src/lib/alr-parser.ts)
- CLR parser: [src/lib/clr-row-parser.ts](../../src/lib/clr-row-parser.ts), [src/lib/category-report-parser.ts](../../src/lib/category-report-parser.ts)
- BQ sync: [src/lib/sync-tables.ts](../../src/lib/sync-tables.ts) lines 149-237
- Attribute audit process: [docs/attribute-audit-process.md](../attribute-audit-process.md)
- Prior attribute design: [docs/superpowers/specs/2026-04-21-attribute-section-rethink-design.md](2026-04-21-attribute-section-rethink-design.md)
