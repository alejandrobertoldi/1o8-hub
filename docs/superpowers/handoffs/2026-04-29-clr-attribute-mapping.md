# Handoff: CLR full-attribute mapping into master + attribute alias table

**Created:** 2026-04-29 (Track D follow-up)
**Branch:** start fresh from `main` (already includes `a35e338` Step 8 CLR-first merge)
**Scope:** ~150–300 LOC + tests + prod backfill of MIS_SC_US

---

## The bug

Step 8 CLR-first shipped to prod 2026-04-29 (`a35e338`). Manu validated
on production and found:

- SKU `111779W` (ASIN `B0GVMYJ7L9`, MIS_SC_US) on the Hub Product Detail
  Page shows blank Product ID + Product ID Type, even though the source
  CLR row has UPC `810178863723` in the matching CLR columns
  (`amzn1.volt.ca.product_id_value` + `amzn1.volt.ca.product_id_type`).
- Same is true for Manufacturer, Item Type Keyword, Parent SKU,
  Variation Theme, Parentage Level, and most other indexed master
  columns.

Root cause: `src/lib/clr-master-mapper.ts` was MVP-scoped per plan
decision-log #1 to lift only **8 named columns** (sku, item_name,
brand, list_price, main_image, generic_keywords, product_type,
feed_product_type) and dump everything else into `raw_column_values`
JSONB. The Hub Product Detail Page reads from indexed master columns,
not from `raw_column_values`, so all the unmapped attributes are
invisible.

## What Manu wants

> Parse ALL columns in CLR into master table. Build an attribute label
> conversion table to match different versions of the same attribute,
> e.g. SKU is `contribution_sku#1.value` in CLR and `seller-sku` in ALR.

Two deliverables:
1. **Attribute alias table** — a single static map from canonical
   attribute name → all known field-name variants across sources.
2. **Mapper rework** — use the alias table to populate every applicable
   indexed master core column (~30 columns) plus the categorized JSONB
   blobs (~940 columns), keeping `raw_column_values` for zero-loss.

## Suggested design

### 1. Alias table (new file)

`src/lib/onboarding/attribute-aliases.ts`

```ts
export interface AttributeAlias {
  canonical: string;             // master column name OR JSONB key
  masterColumn?: keyof Master;   // if it lands in an indexed core column
  jsonbCategory?: string;        // if it lands in a categorized JSONB blob
  // Source field-name variants. RegExp for templated CLR fields,
  // plain strings for ALR / flat-file headers.
  sources: {
    clr?: (string | RegExp)[];
    alr?: string[];
  };
}

export const ATTRIBUTE_ALIASES: AttributeAlias[] = [
  {
    canonical: "sku",
    masterColumn: "sku",
    sources: {
      clr: [/^contribution_sku#1\.value$/],
      alr: ["seller-sku"],
    },
  },
  {
    canonical: "asin",
    masterColumn: "asin",
    sources: { alr: ["asin1"] },
  },
  {
    canonical: "product_id",
    masterColumn: "product_id",  // verify exact column name
    sources: {
      clr: [
        /^amzn\d+\.volt\.[a-z]{2}\.product_id_value$/,
        // …more regional variants if needed
      ],
    },
  },
  {
    canonical: "product_id_type",
    masterColumn: "product_id_type",
    sources: {
      clr: [
        /^amzn\d+\.volt\.[a-z]{2}\.product_id_type$/,
      ],
    },
  },
  {
    canonical: "manufacturer",
    masterColumn: "manufacturer",
    sources: {
      clr: [/^manufacturer\[marketplace_id=[^\]]+\]\[language_tag=[^\]]+\]#1\.value$/],
    },
  },
  {
    canonical: "item_type_keyword",
    masterColumn: "item_type_keyword",
    sources: {
      clr: [/^item_type_keyword\[marketplace_id=[^\]]+\]#1\.value$/],
    },
  },
  {
    canonical: "parent_sku",
    masterColumn: "parent_sku",
    sources: {
      clr: [/^child_parent_sku_relationship#1\.parent_sku$/],
    },
  },
  {
    canonical: "parentage_level",
    masterColumn: "parentage_level",
    sources: {
      clr: [/^parentage_level#1\.value$/],
    },
  },
  {
    canonical: "variation_theme",
    masterColumn: "variation_theme",
    sources: {
      clr: [/^variation_theme#1\.name$/],
    },
  },
  {
    canonical: "listing_action",
    masterColumn: "listing_action",  // verify
    sources: {
      clr: [/^::record_action$/],
    },
  },
  // …keep going. Cover every master core column (~30) and every
  // indexed JSONB category from src/lib/db/schema.ts.
];
```

**Important:** verify exact column names by inspecting:
- `src/lib/db/schema.ts` — master pgTable definition for indexed core
  columns + categorized JSONB blob structure.
- `staged_clr_products.attributes` JSONB on prod for MIS_SC_US — query
  for distinct keys to see actual CLR field IDs:
  ```sql
  SELECT DISTINCT jsonb_object_keys(attributes)
  FROM staged_clr_products
  WHERE client_id_code = 'MIS_SC_US'
  ORDER BY 1;
  ```
- `staged_alr_links` — ALR has only `sku`, `asin`, `status` already
  parsed.

### 2. Mapper rework

Refactor `src/lib/clr-master-mapper.ts` to:
1. Walk `ATTRIBUTE_ALIASES`.
2. For each alias, find the first matching CLR field via regex/string
   on `row.attributes`, and:
   - If `masterColumn` is set → write to that field in `ClrMasterFields`.
   - If `jsonbCategory` is set → push into the right JSONB category.
3. Keep `rawColumnValues: { ...row.attributes }` for zero-loss.

Update `ClrMasterFields` interface to include all newly-mapped indexed
columns. Update `src/app/api/onboarding/merge-master/route.ts` insert
statement to write them.

### 3. Tests

Extend `src/lib/clr-master-mapper.test.ts` — for each new alias, assert
that a CLR row with the expected key produces the expected master
field. Use a real CLR sample row pulled from MIS_SC_US (you can dump
one via `psql -c "SELECT attributes FROM staged_clr_products WHERE
client_id_code='MIS_SC_US' LIMIT 1"`).

### 4. Backfill MIS_SC_US

After the new mapper ships and tests pass, decide between:
- **Option A (clean):** Re-upload CLR via UI for MIS_SC_US, then
  re-merge. The new mapper runs automatically. Trade-off: any manual
  edits in master since the original merge get wiped.
- **Option B (additive):** One-shot SQL UPDATE pulling values from
  `master.raw_column_values` JSONB into the now-indexed columns,
  scoped to `client_id_code='MIS_SC_US'` and `<col> IS NULL`. Zero risk
  to manual edits, but skips any rows where rawColumnValues didn't
  preserve the source key.

Manu to choose at handoff time. Recommend Option A for cleanliness if
no manual edits exist post-merge.

## Pre-work checklist

1. Pull main: `git checkout main && git pull origin main`. Verify HEAD
   includes `a35e338`.
2. Create branch: `git checkout -b feat/clr-full-attribute-mapping`.
3. Read `src/lib/db/schema.ts` master pgTable to enumerate the indexed
   core columns + categorized JSONB blob structure.
4. Run the SQL above to get the actual CLR field-ID list for
   MIS_SC_US — that's the ground truth for which regexes you need.
5. Walk ATTRIBUTE_ALIASES with the actual key list; flag any master
   columns that have no obvious CLR source (those stay blank,
   document why).

## Notes / Risks

- The CLR template uses Listing API JSON-Schema with marketplace and
  language tags embedded in field IDs (e.g.
  `item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value`).
  Use regex with marketplace + language wildcarded so US/CA/MX/EU
  clients all work without code changes.
- Some CLR fields use the `amzn1.volt.<region>.<field>` naming
  convention (Product ID family, possibly others). Check carefully —
  these are NOT marketplace-tagged the same way.
- Variation/parent-sku fields may differ between Parent and Child
  rows. Worth a quick test with both types from MIS_SC_US data.
- The `categorized JSONB blob` population is a separate effort if Manu
  wants the ~940 non-indexed columns also filled. Scope check before
  starting — that's another ~200 LOC easily.
- Drizzle-kit migrations not needed — schema unchanged; only mapper +
  insert statement change.

## Reference — files touched

- `src/lib/onboarding/attribute-aliases.ts` (new)
- `src/lib/clr-master-mapper.ts` (rewrite)
- `src/lib/clr-master-mapper.test.ts` (extend)
- `src/app/api/onboarding/merge-master/route.ts` (insert columns)
- `src/lib/db/schema.ts` (read-only — confirm column names)

## Starting prompt for next session

```
Continue Track D follow-up from
docs/superpowers/handoffs/2026-04-29-clr-attribute-mapping.md.

Step 8 CLR-first shipped (`a35e338` on main, deployed to prod) but
the MVP mapper only lifts 8 indexed master columns; Manu confirmed
on prod that Product ID, Product ID Type, Manufacturer, etc. all
land blank in the Hub Product Detail Page even though the CLR has
the values. He wants:
  1. An attribute alias table (canonical name → CLR + ALR field
     variants), and
  2. A mapper rework that populates every applicable indexed master
     column.

Start fresh from main:
  git checkout main && git pull origin main
  git checkout -b feat/clr-full-attribute-mapping

First action: read src/lib/db/schema.ts master table + run the
"distinct CLR keys for MIS_SC_US" SQL in the handoff doc to get the
ground-truth field-ID list before designing aliases.

Write tests, ship, then run backfill (Option A or B per Manu) on
MIS_SC_US.
```
