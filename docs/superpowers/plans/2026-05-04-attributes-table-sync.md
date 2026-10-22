# Attributes Table Sync + Schema Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the Supabase `attributes` table to match the Definitive tab of `docs/attributes-export.xlsx`, add the `hub_label` column, and remove the `master_row` and `client_requirements` columns along with all code that references them.

**Architecture:** Three-phase approach — (1) additive schema changes + data sync, (2) remove `master_row` from code + DB, (3) remove `client_requirements` from code + DB. Each phase is safe to deploy independently. DB changes always happen via a `drizzle/migrations/` SQL file + `scripts/run-migration-*.ts` runner using the direct Supabase port 5432.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, postgres.js, Vitest, TypeScript. XLSX parsing via `xlsx` npm package (already installed — used by `scripts/`).

---

## ⚠️ Task 5 Replacement Strategy (CONFIRMED 2026-05-05)

`client_requirements` is being replaced by **`category_meta` lookups** — requirement levels are now driven by the **product's category type**, not by client. The `category_meta` JSONB on each attribute already contains per-category requirement strings:

```ts
category_meta: {
  [marketplaceId: string]: {              // e.g. "ATVPDKIKX0DER"
    [categoryType: string]: {              // e.g. "HAT", "COAT", "DRESS"
      requirement: "Required" | "Conditionally Required" | "Recommended" | "Optional" | …,
      isKey: boolean,
      example: string | null,
      description: string | null,
      validValues: string[] | null,
    }
  }
}
```

**Lookup pattern:** for a given product, use `master.productType` as the categoryType key and `"ATVPDKIKX0DER"` as the marketplace key (US default — confirm if other marketplaces are in scope). `attr.categoryMeta[marketplace]?.[productType]?.requirement` yields the level.

**Rewrite plan for the consumers:**

| Site | Before (clientRequirements) | After (categoryMeta + product.productType) |
|---|---|---|
| `src/lib/completeness.ts` | `clientReqs[clientId]` per attr | `attr.categoryMeta[mkt]?.[product.productType]?.requirement` per (attr, product) |
| `src/lib/client-report.ts` filter | filter attrs by `clientReqs[client] !== Not Required` | filter is **per-product**, not pre-filterable globally — restructure: iterate products, look up requirement per (attr, product.productType) |
| `src/app/api/products/completeness/route.ts` + batch | same pre-filter | same restructure as above |
| `src/app/api/export/route.ts` + preview | columns by client | columns by product category? Or: ALL attrs with non-empty categoryMeta entry for the client's product types? **Open question — see below** |
| `src/components/products/field-search.tsx` | `clientReqs[clientId]` | `attr.categoryMeta[mkt]?.[product.productType]?.requirement` |
| `src/app/api/attributes/route.ts` | enriches with `clientRequirement` | enrich with `categoryRequirement` keyed off `?productType=` query param, OR drop enrichment and do lookup client-side |
| `src/hooks/use-column-attributes.ts` | `EnrichedAttribute & { clientRequirement }` | drop `clientRequirement` field; consumers do per-product lookup |
| `src/lib/sync-tables.ts` | sets `clientRequirements` on import | drop the assignment + the loop building `clientReqs` |

**Existing helper:** `src/lib/category-meta-queries.ts` has `getAttributesForCategory()` (per primer note "Task 12+ uses `getAttributesForCategory()`"). Reuse it where possible.

**Open question for export route:** A client typically has products across multiple `productType` values. The export currently produces ONE CSV per client with a fixed column set. Two reasonable replacements:
- **(a)** Include attrs where ANY of the client's product types has a non-Optional requirement (union across categories)
- **(b)** Group export by productType, one CSV per category

Recommendation: **(a)** for backwards compatibility — single CSV, broader column set. Confirm before implementing Task 5.

---

## File Map

| File | What changes |
|---|---|
| `drizzle/migrations/0049_hub_label.sql` | ADD COLUMN hub_label |
| `drizzle/migrations/0050_drop_legacy_cols.sql` | DROP master_row, DROP client_requirements |
| `scripts/run-migration-0049-hub-label.ts` | runner for 0049 |
| `scripts/run-migration-0050-drop-legacy-cols.ts` | runner for 0050 |
| `scripts/sync-attributes-from-xlsx.ts` | upsert all Definitive rows + delete removed rows + set hub_label |
| `src/lib/db/schema.ts` | add hubLabel; remove masterRow, clientRequirements |
| `src/app/api/attributes/route.ts` | orderBy fix; remove clientRequirement enrichment |
| `src/app/api/export/route.ts` | orderBy + filter fix |
| `src/app/api/export/preview/route.ts` | orderBy + filter fix |
| `src/app/api/products/completeness/route.ts` | replace clientReqs filter |
| `src/app/api/products/completeness/batch/route.ts` | replace clientReqs filter |
| `src/lib/completeness.ts` | replace clientReqs with isEssential |
| `src/lib/client-report.ts` | replace relevantAttrs filter |
| `src/components/products/field-search.tsx` | replace clientRequirements lookup |
| `src/components/products/product-detail-form.tsx` | remove masterRow sort |
| `src/hooks/use-column-attributes.ts` | remove clientRequirement from EnrichedAttribute |
| `src/lib/sync-tables.ts` | remove masterRow + clientRequirements assignments |

---

## Task 1: Add hub_label column to DB and schema

**Context:** `hub_label` is a new human-readable display label for each attribute (e.g., "Intentwise ID" vs. `general_label` "IntentwiseID"). The Definitive tab has `hub_label` for all 1007 rows. We add it as nullable first; the data sync in Task 2 will populate it.

**Files:**
- Create: `drizzle/migrations/0049_hub_label.sql`
- Create: `scripts/run-migration-0049-hub-label.ts`
- Modify: `src/lib/db/schema.ts:285` (add hubLabel before categoryMeta)

- [ ] **Step 1: Write the SQL migration**

Create `drizzle/migrations/0049_hub_label.sql`:
```sql
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS hub_label VARCHAR(255);
```

- [ ] **Step 2: Write the migration runner**

Create `scripts/run-migration-0049-hub-label.ts`:
```ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running 0049_hub_label.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0049_hub_label.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ attributes.hub_label added");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Update schema.ts — add hubLabel**

In `src/lib/db/schema.ts`, inside the `attributes` pgTable definition, add `hubLabel` immediately before `categoryMeta`:
```ts
hubLabel: varchar("hub_label", { length: 255 }),
```

The field currently before it is `isVpFlag`. Add after that line.

- [ ] **Step 4: Run the migration**

```bash
npx tsx scripts/run-migration-0049-hub-label.ts
```

Expected output:
```
Running 0049_hub_label.sql...
  ✓ attributes.hub_label added
```

- [ ] **Step 5: Verify column exists**

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL.replace(':6543/', ':5432/'), { ssl: 'require', max: 1 });
sql\`SELECT column_name FROM information_schema.columns WHERE table_name='attributes' AND column_name='hub_label'\`
  .then(r => { console.log(r.length ? '✓ hub_label exists' : '✗ NOT found'); return sql.end(); });
"
```

Expected: `✓ hub_label exists`

- [ ] **Step 6: Run tests to confirm nothing broke**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: same pass/fail count as before (no new failures)

- [ ] **Step 7: Commit**

```bash
git add drizzle/migrations/0049_hub_label.sql scripts/run-migration-0049-hub-label.ts src/lib/db/schema.ts
git commit -m "feat(attributes): add hub_label column"
```

---

## Task 2: Sync data from Definitive tab

**Context:** The Definitive tab is the source of truth. We need to:
1. Upsert all 1007 rows (set all columns including hub_label)
2. Delete rows in DB not present in Definitive tab (identified by `general_label`)
3. The ACTION column is editorial tracking — all rows go into the DB regardless of ACTION value

28 rows are marked NEW (to be inserted), 5 are marked "edit" (fields changed), 46 KEEP + 928 no-action (existing rows updated in-place). Roughly 11 existing DB rows not in Definitive will be deleted.

**Files:**
- Create: `scripts/sync-attributes-from-xlsx.ts`

- [ ] **Step 1: Write the sync script**

Create `scripts/sync-attributes-from-xlsx.ts`:
```ts
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import * as XLSX from "xlsx";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

interface DefinitiveRow {
  reference_group: string;
  subgroup: string;
  hub_label: string;
  general_label: string;
  bq_label: string;
  sc_label: string;
  sc_label_multi: string;
  vc_label: string;
  alr_label: string;
  clr_label: string;
  sb_label: string;
  bq_data_type: string;
  label_max_options: string;
  is_essential: boolean;
  is_vp_flag: boolean;
  description: string;
  category_meta: string; // JSON string
}

function readDefinitiveTab(): DefinitiveRow[] {
  const wb = XLSX.readFile(resolve(__dirname, "../docs/attributes-export.xlsx"));
  const ws = wb.Sheets["Definitive"];
  if (!ws) throw new Error("Definitive sheet not found in XLSX");
  
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  const headers = raw[0] as string[];
  const rows = raw.slice(1).filter((r) =>
    (r as unknown[]).some((c) => c !== undefined && c !== null && c !== "")
  );

  return rows.map((r) => {
    const row = r as unknown[];
    const get = (col: string) => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? row[idx] : undefined;
    };
    return {
      reference_group: String(get("reference_group") ?? ""),
      subgroup: String(get("subgroup") ?? ""),
      hub_label: String(get("hub_label") ?? ""),
      general_label: String(get("general_label") ?? ""),
      bq_label: String(get("bq_label") ?? ""),
      sc_label: String(get("sc_label") ?? ""),
      sc_label_multi: String(get("sc_label_multi") ?? ""),
      vc_label: String(get("vc_label") ?? ""),
      alr_label: String(get("alr_label") ?? ""),
      clr_label: String(get("clr_label") ?? ""),
      sb_label: String(get("sb_label") ?? ""),
      bq_data_type: String(get("bq_data_type") ?? "STRING"),
      label_max_options: String(get("label_max_options") ?? "1"),
      is_essential: Boolean(get("is_essential")),
      is_vp_flag: Boolean(get("is_vp_flag")),
      description: String(get("description") ?? ""),
      category_meta: (() => {
        const cm = get("category_meta");
        if (!cm || cm === "" || cm === "{}") return "{}";
        if (typeof cm === "string") return cm;
        return JSON.stringify(cm);
      })(),
    };
  }).filter((r) => r.general_label !== "");
}

async function main() {
  const rows = readDefinitiveTab();
  console.log(`Read ${rows.length} rows from Definitive tab`);

  const generalLabels = rows.map((r) => r.general_label);

  // Delete rows not in Definitive tab
  const deleted = await sql`
    DELETE FROM attributes
    WHERE general_label != ALL(${sql.array(generalLabels)})
    RETURNING general_label
  `;
  console.log(`Deleted ${deleted.length} rows not in Definitive tab`);
  if (deleted.length > 0) {
    console.log("  Deleted:", deleted.map((r) => r.general_label).join(", "));
  }

  // Upsert all rows
  let upserted = 0;
  for (const row of rows) {
    let categoryMetaObj: Record<string, unknown>;
    try {
      categoryMetaObj = JSON.parse(row.category_meta);
    } catch {
      categoryMetaObj = {};
    }

    await sql`
      INSERT INTO attributes (
        general_label, hub_label, reference_group, subgroup,
        bq_label, sc_label, sc_label_multi, vc_label,
        alr_label, clr_label, sb_label,
        bq_data_type, label_max_options,
        is_essential, is_vp_flag, description, category_meta
      ) VALUES (
        ${row.general_label}, ${row.hub_label}, ${row.reference_group}, ${row.subgroup},
        ${row.bq_label}, ${row.sc_label}, ${row.sc_label_multi}, ${row.vc_label},
        ${row.alr_label}, ${row.clr_label}, ${row.sb_label},
        ${row.bq_data_type}, ${row.label_max_options},
        ${row.is_essential}, ${row.is_vp_flag}, ${row.description},
        ${sql.json(categoryMetaObj)}
      )
      ON CONFLICT (general_label) DO UPDATE SET
        hub_label = EXCLUDED.hub_label,
        reference_group = EXCLUDED.reference_group,
        subgroup = EXCLUDED.subgroup,
        bq_label = EXCLUDED.bq_label,
        sc_label = EXCLUDED.sc_label,
        sc_label_multi = EXCLUDED.sc_label_multi,
        vc_label = EXCLUDED.vc_label,
        alr_label = EXCLUDED.alr_label,
        clr_label = EXCLUDED.clr_label,
        sb_label = EXCLUDED.sb_label,
        bq_data_type = EXCLUDED.bq_data_type,
        label_max_options = EXCLUDED.label_max_options,
        is_essential = EXCLUDED.is_essential,
        is_vp_flag = EXCLUDED.is_vp_flag,
        description = EXCLUDED.description,
        category_meta = EXCLUDED.category_meta
    `;
    upserted++;
  }

  console.log(`Upserted ${upserted} rows`);

  // Verify
  const count = await sql`SELECT COUNT(*) as n FROM attributes`;
  console.log(`DB row count after sync: ${count[0].n}`);
  const nullHub = await sql`SELECT COUNT(*) as n FROM attributes WHERE hub_label IS NULL OR hub_label = ''`;
  console.log(`Rows with empty hub_label: ${nullHub[0].n}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run to check the row count before committing**

```bash
node -e "
const XLSX = require('xlsx');
const wb = XLSX.readFile('docs/attributes-export.xlsx');
const ws = wb.Sheets['Definitive'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
const rows = data.slice(1).filter(r => r.some(c => c !== undefined && c !== null && c !== '') && r[4]);
console.log('Rows to upsert:', rows.length);
console.log('Sample general_labels:', rows.slice(0,5).map(r => r[4]));
"
```

Expected: `Rows to upsert: 1007` (or close — verify against your count)

- [ ] **Step 3: Run the sync (this touches prod DB)**

```bash
npx tsx scripts/sync-attributes-from-xlsx.ts
```

Expected output:
```
Read 1007 rows from Definitive tab
Deleted N rows not in Definitive tab   ← expect ~11
Upserted 1007 rows
DB row count after sync: 1007
Rows with empty hub_label: 0
```

- [ ] **Step 4: Spot-check hub_label in DB**

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL.replace(':6543/', ':5432/'), { ssl: 'require', max: 1 });
sql\`SELECT general_label, hub_label FROM attributes WHERE hub_label IS NOT NULL LIMIT 5\`
  .then(r => { console.log(r); return sql.end(); });
"
```

Expected: 5 rows showing different hub_label and general_label values.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-attributes-from-xlsx.ts
git commit -m "feat(attributes): sync Definitive tab — upsert 1007 rows, add hub_label data"
```

---

## Task 3: Remove master_row references from code

**Context:** `master_row` was used for sort order in 3 API routes and 2 sort comparators in `product-detail-form.tsx`. Replace with `ORDER BY reference_group, subgroup, general_label`. The column is still in the DB at this point; we remove it from the DB in Task 4.

**Files:**
- Modify: `src/app/api/attributes/route.ts:20`
- Modify: `src/app/api/export/route.ts:27`
- Modify: `src/app/api/export/preview/route.ts:25`
- Modify: `src/hooks/use-column-attributes.ts:64`
- Modify: `src/lib/sync-tables.ts:193`
- Modify: `src/components/products/product-detail-form.tsx:1038` and `:1081`

- [ ] **Step 1: Fix `src/app/api/attributes/route.ts`**

Read the file first, then replace line 20:
```ts
// Before:
    .orderBy(asc(attributes.masterRow));
// After:
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));
```

Also update the import on line 5 — `asc` is already imported, no change needed.

- [ ] **Step 2: Fix `src/app/api/export/route.ts`**

Replace line 27:
```ts
// Before:
    .orderBy(asc(attributes.masterRow));
// After:
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));
```

- [ ] **Step 3: Fix `src/app/api/export/preview/route.ts`**

Replace line 25:
```ts
// Before:
    .orderBy(asc(attributes.masterRow));
// After:
    .orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));
```

- [ ] **Step 4: Fix `src/hooks/use-column-attributes.ts`**

Remove the stale comment on line 64:
```ts
// Before:
        // Already sorted by masterRow from the API
// After:
        // (removed — API now sorts by referenceGroup/subgroup/generalLabel)
```

Actually just delete the line entirely.

- [ ] **Step 5: Fix `src/lib/sync-tables.ts`**

Find and remove the line `masterRow: parseInt(row.MasterAttributeRow) || 0,` (line 193). No replacement needed — the field is going away.

- [ ] **Step 6: Fix `src/components/products/product-detail-form.tsx` (two sites)**

At line 1038, replace:
```ts
// Before:
              return a.masterRow - b.masterRow;
// After:
              return a.generalLabel.localeCompare(b.generalLabel);
```

At line 1081, replace:
```ts
// Before:
            return ar !== br ? ar - br : a.masterRow - b.masterRow;
// After:
            return ar !== br ? ar - br : a.generalLabel.localeCompare(b.generalLabel);
```

- [ ] **Step 7: Remove masterRow from schema.ts**

In `src/lib/db/schema.ts`, inside the `attributes` pgTable definition, delete the line:
```ts
    masterRow: integer("master_row").notNull(),
```

- [ ] **Step 8: Run build to verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error|✓|✗" | head -20
```

Expected: no TypeScript errors referencing `masterRow`.

- [ ] **Step 9: Run tests**

```bash
npm test 2>&1 | tail -15
```

Expected: same pass/fail count as baseline.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/attributes/route.ts src/app/api/export/route.ts src/app/api/export/preview/route.ts src/hooks/use-column-attributes.ts src/lib/sync-tables.ts src/components/products/product-detail-form.tsx src/lib/db/schema.ts
git commit -m "refactor(attributes): replace master_row sort with reference_group/subgroup/general_label"
```

---

## Task 4: Drop master_row from DB

**Context:** Code no longer references `masterRow` (done in Task 3). Now drop the physical column.

**Files:**
- Create: `drizzle/migrations/0050_drop_legacy_cols.sql` (stub — will expand in Task 6)
- Create: `scripts/run-migration-0050-drop-legacy-cols.ts`

For now the migration only drops `master_row`. We will extend it in Task 6 to also drop `client_requirements`.

- [ ] **Step 1: Write the SQL migration (master_row only for now)**

Create `drizzle/migrations/0050_drop_legacy_cols.sql`:
```sql
-- Drop master_row (sort order replaced by reference_group/subgroup/general_label)
ALTER TABLE attributes DROP COLUMN IF EXISTS master_row;

-- client_requirements dropped in Task 6 (code changes required first)
```

- [ ] **Step 2: Write the migration runner**

Create `scripts/run-migration-0050-drop-legacy-cols.ts`:
```ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running 0050_drop_legacy_cols.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0050_drop_legacy_cols.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ master_row dropped");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the migration**

```bash
npx tsx scripts/run-migration-0050-drop-legacy-cols.ts
```

Expected:
```
Running 0050_drop_legacy_cols.sql...
  ✓ master_row dropped
```

- [ ] **Step 4: Verify column is gone**

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL.replace(':6543/', ':5432/'), { ssl: 'require', max: 1 });
sql\`SELECT column_name FROM information_schema.columns WHERE table_name='attributes' AND column_name='master_row'\`
  .then(r => { console.log(r.length ? '✗ still exists' : '✓ master_row gone'); return sql.end(); });
"
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/0050_drop_legacy_cols.sql scripts/run-migration-0050-drop-legacy-cols.ts
git commit -m "feat(db): drop attributes.master_row"
```

---

## Task 5: Replace client_requirements with categoryMeta lookups (CONFIRMED 2026-05-05)

**Strategy (CONFIRMED):** requirement levels are per-(marketplace, productType), not per-client. Replace every `clientRequirements[clientId]` lookup with `attr.categoryMeta[ATVPDKIKX0DER]?.[product.productType]?.requirement`.

**Marketplace:** single default `"ATVPDKIKX0DER"` (US Amazon). Single-marketplace assumption confirmed.

**Multi-product views (column picker, table columns):** there is no single requirement level when displaying many products with different productTypes. For those views fall back to `attr.isEssential` as a binary marker. Per-product views (product-detail-form, field-search) get full per-productType lookups.

**Export route strategy (option a, CONFIRMED):** single CSV per client; columns include any attr where ANY of the client's product types has a non-Optional requirement (union across categories).

**Files (13 total — original plan missed 3):**
- New: `src/lib/category-requirement.ts` (helper module)
- Modify: `src/lib/completeness.ts`
- Modify: `src/app/api/products/completeness/route.ts`
- Modify: `src/app/api/products/completeness/batch/route.ts`
- Modify: `src/lib/client-report.ts`
- Modify: `src/app/api/export/route.ts`
- Modify: `src/app/api/export/preview/route.ts`
- Modify: `src/components/products/field-search.tsx`
- Modify: `src/hooks/use-column-attributes.ts`
- Modify: `src/app/api/attributes/route.ts`
- Modify: `src/lib/sync-tables.ts`
- Modify: `src/components/products/product-detail-form.tsx` ← was missing
- Modify: `src/components/products/product-column-picker.tsx` ← was missing
- Modify: `src/components/products/product-table-columns.tsx` ← was missing

### 5a: Create `src/lib/category-requirement.ts` helper

- [ ] **Step 1: Create the helper module**

```ts
import type { ColumnAttribute } from "./db/schema";

export const DEFAULT_MARKETPLACE_ID = "ATVPDKIKX0DER";

/** Return the requirement string for an attribute given a productType, or null if absent. */
export function getAttributeRequirement(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productType: string | null | undefined,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): string | null {
  if (!productType) return null;
  const entry = attr.categoryMeta?.[marketplaceId]?.[productType];
  return entry?.requirement ?? null;
}

/** True if the attr has a non-Optional/Not-Required level for the given productType. */
export function isAttributeRelevantForCategory(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productType: string | null | undefined,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): boolean {
  const r = getAttributeRequirement(attr, productType, marketplaceId);
  return !!r && r !== "Optional" && r !== "Not Required";
}

/** True if any of the supplied productTypes has a non-Optional level for the attr. */
export function isAttributeRelevantForAnyCategory(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productTypes: Iterable<string>,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): boolean {
  for (const pt of productTypes) {
    if (isAttributeRelevantForCategory(attr, pt, marketplaceId)) return true;
  }
  return false;
}

const STRENGTH: Record<string, number> = {
  Required: 4,
  "Conditionally Required": 3,
  Recommended: 2,
  Preferred: 2,
  Optional: 1,
  "Not Required": 0,
};

/** Highest requirement across a set of productTypes (used for multi-product summaries). */
export function strongestRequirement(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productTypes: Iterable<string>,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): string {
  let best = "";
  let bestScore = -1;
  for (const pt of productTypes) {
    const r = getAttributeRequirement(attr, pt, marketplaceId);
    if (!r) continue;
    const s = STRENGTH[r] ?? 0;
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}
```

### 5b: Rewrite `src/lib/completeness.ts`

`calculateCompleteness` now takes `(product, attrs)` (drop `clientIdCode` — unused). Iterate attrs, look up requirement via `getAttributeRequirement(attr, product.productType)`. Skip if level is null/Optional/Not Required.

```ts
import { getProductFieldValue } from "./product-mapper";
import { getAttributeRequirement } from "./category-requirement";
import type { Product, ColumnAttribute } from "./db/schema";

// CompletenessBreakdown / CompletenessScore types unchanged

export function calculateCompleteness(
  product: Product,
  attributes: ColumnAttribute[],
): CompletenessScore {
  const required: CompletenessBreakdown = { filled: 0, total: 0 };
  const conditionallyRequired: CompletenessBreakdown = { filled: 0, total: 0 };
  const recommended: CompletenessBreakdown = { filled: 0, total: 0 };
  const missingRequired: string[] = [];
  const missingConditionallyRequired: string[] = [];

  for (const attr of attributes) {
    const level = getAttributeRequirement(attr, product.productType);
    if (!level || level === "Not Required" || level === "Optional") continue;

    const bqName = attr.bqLabel || attr.generalLabel;
    const value = getProductFieldValue(product, bqName);
    const isFilled = value !== null && value !== undefined && String(value).trim() !== "";

    if (level === "Required") {
      required.total++;
      if (isFilled) required.filled++;
      else missingRequired.push(attr.generalLabel);
    } else if (level === "Conditionally Required") {
      conditionallyRequired.total++;
      if (isFilled) conditionallyRequired.filled++;
      else missingConditionallyRequired.push(attr.generalLabel);
    } else if (level === "Recommended" || level === "Preferred") {
      recommended.total++;
      if (isFilled) recommended.filled++;
    }
  }

  const totalRequired = required.total + conditionallyRequired.total;
  const filledRequired = required.filled + conditionallyRequired.filled;
  const score =
    totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;

  return { score, totalRequired, filledRequired, breakdown: { required, conditionallyRequired, recommended }, missingRequired, missingConditionallyRequired };
}
```

### 5c: Update `src/app/api/products/completeness/route.ts`

Drop the `relevantAttrs` pre-filter (no longer pre-filterable globally — now per-product). Pass all `attrs` to `calculateCompleteness`:
```ts
// Remove the relevantAttrs block; pass attrs directly:
const scores = productList.map((product) => {
  const result = calculateCompleteness(product, attrs);
  ...
});
```

### 5d: Update `src/app/api/products/completeness/batch/route.ts`

Same — drop the `relevantAttrs` filter in the per-client loop. Drop the early-exit `if (relevantAttrs.length === 0)` block. Pass `attrs` to `calculateCompleteness(product, attrs)`.

### 5e: Update `src/lib/client-report.ts`

Use union-across-productTypes for `relevantAttrs`. Use `strongestRequirement` for the per-attribute level shown in fieldCoverage.
```ts
import { isAttributeRelevantForAnyCategory, strongestRequirement, getAttributeRequirement } from "./category-requirement";

const productTypes = new Set(productList.map((p) => p.productType).filter((pt): pt is string => !!pt));
const relevantAttrs = attrs.filter((a) => isAttributeRelevantForAnyCategory(a, productTypes));

// In productScores: drop clientIdCode arg → calculateCompleteness(product, relevantAttrs)

// In fieldCoverage: replace the `level` lookup with strongestRequirement(attr, productTypes)
//   The "Also include Recommended fields" pre-filter becomes:
const allRelevantAttrs = attrs.filter((a) => {
  const r = strongestRequirement(a, productTypes);
  return r && r !== "Not Required";
});
// And `level` per-attr in the loop = strongestRequirement(attr, productTypes) || "Unknown"
```

### 5f: Update `src/app/api/export/route.ts`

Reorder: fetch products first to get productTypes, then filter attrs by union. Single CSV (option a).
```ts
import { isAttributeRelevantForAnyCategory } from "@/lib/category-requirement";

// Fetch products FIRST
const clientProducts = await db.select().from(master).where(eq(master.clientIdCode, client)).limit(5000);
if (clientProducts.length === 0) { /* 404 */ }

// Build productTypes set
const productTypes = new Set(clientProducts.map((p) => p.productType).filter((pt): pt is string => !!pt));

// Then attrs + filter
const attrs = await db.select().from(attributes).orderBy(asc(attributes.referenceGroup), asc(attributes.subgroup), asc(attributes.generalLabel));
const relevantAttrs = attrs.filter((a) => isAttributeRelevantForAnyCategory(a, productTypes));
```

### 5g: Update `src/app/api/export/preview/route.ts`

Same reorder. `requirementBreakdown` uses `strongestRequirement(attr, productTypes)` for each attr's level.

### 5h: Update `src/components/products/field-search.tsx`

Replace the `clientIdCode`-based `req` lookup with productType lookup. The component already has the `product` prop with `productType`.
```ts
import { getAttributeRequirement } from "@/lib/category-requirement";

// In the enriched useMemo (line ~54):
const req = getAttributeRequirement(attr, product.productType);
const isRequired = req === "Required" || req === "Conditionally Required";
```

The `clientIdCode` prop becomes unused — keep the prop in the signature for now to avoid touching callers, but stop reading it.

### 5i: Update `src/hooks/use-column-attributes.ts`

Drop `clientRequirement` from `EnrichedAttribute`. Drop the `RequirementLevel` import.
```ts
export type EnrichedAttribute = ColumnAttribute;
```

### 5j: Update `src/app/api/attributes/route.ts`

Remove the `if (client) { ... clientRequirement: ... }` enrichment block. Always return `rows`. Keep the `client` param read tolerant.

### 5k: Update `src/lib/sync-tables.ts`

Remove the `clientReqs` build loop (lines 184–190) and the `clientRequirements: clientReqs,` value (line 206). Remove `CLIENT_CODES` const if no longer referenced.

### 5l: Update `src/components/products/product-detail-form.tsx`

This file has 10 `attr.clientRequirement` references. Per-product context: compute requirement once via memo and look up from a `Map<generalLabel, requirement>`.

```ts
import { getAttributeRequirement } from "@/lib/category-requirement";

// Add a memoized lookup map near the top of the component:
const requirementByLabel = useMemo(() => {
  const m = new Map<string, string>();
  for (const attr of byGeneralLabel.values()) {
    const r = getAttributeRequirement(attr, product.productType);
    if (r) m.set(attr.generalLabel, r);
  }
  return m;
}, [byGeneralLabel, product.productType]);

// Then everywhere we had `attr.clientRequirement || ""`, replace with:
//   `requirementByLabel.get(attr.generalLabel) || ""`
```

Lines to update (after the memo is added):
- 486: `const req = requirementByLabel.get(attr.generalLabel) || "";`
- 497: `const req = (requirementByLabel.get(attr.generalLabel) || "") as RequirementLevel;`
- 1027: `const req = requirementByLabel.get(attr.generalLabel) || "";`
- 1035–1036: use `requirementByLabel.get(a.generalLabel)` / `requirementByLabel.get(b.generalLabel)` in `REQ_RANK[...]`
- 1079–1080: same
- 1125: `requirementLevel={(requirementByLabel.get(attr.generalLabel) as RequirementLevel) || undefined}`
- 1149: same as 1125

### 5m: Update `src/components/products/product-column-picker.tsx`

Multi-product context — no single productType. Replace the `attr.clientRequirement` read with `isEssential` as a binary marker. Line 99:
```ts
const req = (attr.isEssential ? "Required" : "") as RequirementLevel;
```

### 5n: Update `src/components/products/product-table-columns.tsx`

Same multi-product context. Line 633:
```ts
const req = (attr.isEssential ? "Required" : "") as RequirementLevel;
```

### 5o: Build, test, commit

- [ ] **Step 1: Run build**
```bash
npm run build 2>&1 | grep -E "error TS|Error" | head -40
```

Expected: zero TS errors. The most likely TS error is call-sites still passing `clientIdCode` to `calculateCompleteness` — remove the third arg from those calls.

- [ ] **Step 2: Run tests**
```bash
npm test 2>&1 | tail -25
```

Expected: same baseline pass/fail (5 failed pre-existing, 372 passed).

- [ ] **Step 3: Commit**

```bash
git add src/lib/category-requirement.ts src/lib/completeness.ts src/app/api/products/completeness/route.ts src/app/api/products/completeness/batch/route.ts src/lib/client-report.ts src/app/api/export/route.ts src/app/api/export/preview/route.ts src/components/products/field-search.tsx src/hooks/use-column-attributes.ts src/app/api/attributes/route.ts src/lib/sync-tables.ts src/components/products/product-detail-form.tsx src/components/products/product-column-picker.tsx src/components/products/product-table-columns.tsx
git commit -m "refactor(attributes): replace client_requirements with categoryMeta-based per-(marketplace, productType) lookups"
```

---

## Task 6: Remove client_requirements from schema + DB

**Context:** All code references are gone. Now remove from schema.ts and drop the DB column.

**Files:**
- Modify: `src/lib/db/schema.ts` (remove clientRequirements field)
- Modify: `drizzle/migrations/0050_drop_legacy_cols.sql` (add DROP client_requirements)

- [ ] **Step 1: Remove clientRequirements from schema.ts**

In `src/lib/db/schema.ts`, inside the `attributes` pgTable definition, delete:
```ts
    clientRequirements: jsonb("client_requirements")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
```

- [ ] **Step 2: Extend the migration SQL**

Edit `drizzle/migrations/0050_drop_legacy_cols.sql`, add after the master_row line:
```sql
-- Drop client_requirements (requirement levels now from is_essential flag)
ALTER TABLE attributes DROP COLUMN IF EXISTS client_requirements;
```

Update the runner's console log to say:
```ts
  console.log("  ✓ master_row dropped");
  console.log("  ✓ client_requirements dropped");
```

- [ ] **Step 3: Run the migration (adds the client_requirements drop)**

```bash
npx tsx scripts/run-migration-0050-drop-legacy-cols.ts
```

Note: `IF EXISTS` means re-running is safe even if master_row was already dropped.

Expected:
```
Running 0050_drop_legacy_cols.sql...
  ✓ master_row dropped
  ✓ client_requirements dropped
```

- [ ] **Step 4: Verify both columns gone**

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL.replace(':6543/', ':5432/'), { ssl: 'require', max: 1 });
sql\`SELECT column_name FROM information_schema.columns WHERE table_name='attributes' AND column_name IN ('master_row','client_requirements')\`
  .then(r => { console.log(r.length === 0 ? '✓ both columns dropped' : '✗ remaining:', r); return sql.end(); });
"
```

Expected: `✓ both columns dropped`

- [ ] **Step 5: Run build + tests**

```bash
npm run build 2>&1 | grep -E "error TS|Error" | head -20
npm test 2>&1 | tail -20
```

Expected: clean build, same pass/fail count.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0050_drop_legacy_cols.sql scripts/run-migration-0050-drop-legacy-cols.ts
git commit -m "feat(db): drop attributes.client_requirements — replaced by is_essential"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full build and lint**

```bash
npm run build && npm run lint
```

Expected: zero errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: 195/195 src/lib tests pass. Pre-existing failures (`clr-import`, `monthly-report` chromium, `seo/projects`) are acceptable — no new failures.

- [ ] **Step 3: Verify zero references to removed fields**

```bash
grep -rn "masterRow\|master_row\|clientRequirements\|client_requirements" src/ --include="*.ts" --include="*.tsx" | grep -v "// "
```

Expected: zero results (or only comments).

- [ ] **Step 4: Verify hub_label populated in DB**

```bash
node -e "
const { config } = require('dotenv');
config({ path: '.env.local' });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL.replace(':6543/', ':5432/'), { ssl: 'require', max: 1 });
Promise.all([
  sql\`SELECT COUNT(*) as total FROM attributes\`,
  sql\`SELECT COUNT(*) as n FROM attributes WHERE hub_label IS NULL OR hub_label = ''\`,
]).then(([total, nulls]) => {
  console.log('Total rows:', total[0].total);
  console.log('Empty hub_label:', nulls[0].n);
  return sql.end();
});
"
```

Expected: ~1007 total rows, 0 empty hub_label.

- [ ] **Step 5: Manual UI spot-check**

Start dev server and verify:
- `/admin/attributes` — attributes list loads, sorted correctly
- `/products/[id]` product form — fields appear in correct order, completeness score shows
- `/export?client=AAM_COLOSSEUM` (or any valid client) — CSV downloads with essential fields only

- [ ] **Step 6: Final commit (if any remaining changes)**

```bash
git status
# Commit any uncommitted changes with appropriate message
```
