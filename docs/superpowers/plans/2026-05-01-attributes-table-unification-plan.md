# Attributes Table Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented attribute mapping (`column_attributes` + `category_attributes` + hardcoded CLR/ALR alias tables) with one canonical `attributes` table whose rows hold every label variant (Hub, SC, VC, BQ, SB, CLR, ALR), per-category metadata in JSONB, and a Hub-internal `IsVP` flag.

**Architecture:** One `ALTER TABLE … RENAME` migration plus column adds, backfilled idempotently from the existing 972-row table and per-client `category_attributes` rows. Application layer flips from compile-time alias arrays / hardcoded ALR field maps to runtime DB lookups against `attributes`. `category_attributes` is dropped at the end; `category_definitions` survives as upload audit. A new `master.is_vp` boolean replaces "Variety Pack" string-matching; `is_variation_attribute` is **per-product, derived at runtime** from `master.variation_theme_name` (no global flag).

**Tech Stack:** PostgreSQL 16 (Supabase), Drizzle ORM, postgres.js driver (direct port 5432 for DDL), Vitest, Next.js App Router, BigQuery (`@google-cloud/bigquery`).

**Spec:** [docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md](../specs/2026-05-01-attributes-table-unification-design.md)

**Branch suggestion:** `feat/attributes-unification` (a separate worktree at `.worktrees/attributes-unification` keeps Sales / Campaign Manager WIP isolated).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `drizzle/migrations/0047_attributes_unification.sql` | Create | Schema migration: rename + add columns + new tables. |
| `scripts/run-migration-0047-attributes-unification.ts` | Create | Per-file runner (direct 5432 connection). Avoids the 0042-style filename-collision class. |
| `scripts/backfill-0047-attributes-labels.ts` | Create | Populate `clr_label`, `sc_label_multi`, `alr_label`, `sb_label` (best-effort) on the renamed table. Idempotent. |
| `scripts/backfill-0047-category-meta.ts` | Create | Roll `category_attributes` rows up into `attributes.category_meta` JSONB. Idempotent. |
| `scripts/backfill-0047-is-vp.ts` | Create | Insert `IsVP` row, add `master.is_vp` column, backfill from string-match. Idempotent. |
| `src/lib/db/schema.ts` | Modify | Rename `columnAttributes` → `attributes`; add new columns; add `clrUnmatchedFields`; drop `categoryAttributes` (last task). |
| `src/lib/onboarding/clr-attribute-aliases.ts` | Modify | Drop hardcoded `ALIASES`. Export pure `clrAttributesToBqRow(attrs, aliases)`. Keep `extractMarketplace`. |
| `src/lib/onboarding/clr-aliases-loader.ts` | Create | Async DB loader returning `Alias[]` derived from `attributes.sc_label` / `sc_label_multi`. |
| `src/lib/alr-parser.ts` | Modify | Make `alrRowToMasterFields(row, fieldMap)` data-driven; drop hardcoded interface fields. |
| `src/lib/alr-field-map-loader.ts` | Create | Async DB loader: `{ alrLabel → { generalLabel, sbLabel, bqLabel } }`. |
| `src/lib/category-definitions/upsert.ts` | Modify | Write category metadata into `attributes.category_meta`, log unmatched fields to `clr_unmatched_fields`. |
| `src/lib/category-attribute-matcher.ts` | Modify | Rename / clarify: matcher used only for backfill + upload; production reads `attributes.category_meta` directly. |
| `src/lib/variation-theme.ts` | Create | Pure helpers: `parseVariationTheme(string)` and `isVariationAttribute(product, attr)`. |
| `src/lib/sync-tables.ts` | Modify | Extend `syncAttributes()` to read 4 new BQ columns. |
| `src/app/api/attributes/audit/route.ts` | Modify | Read auditable attributes from `attributes.category_meta` instead of `category_attributes`. |
| `src/app/api/products/theme-values/route.ts` | Modify | Same — JSONB read. |
| `src/app/api/variations/theme-options/route.ts` | Modify | Same — JSONB read. |
| `src/app/api/category-definitions/[productType]/route.ts` | Modify | Same. |
| `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts` | Modify | Same. |
| `src/app/api/admin/observability/route.ts` | Modify | Drop `category_attributes` count; add `attributes` row count. |
| `src/app/api/attributes/template-requests/{,[id]/,[id]/diff/,[id]/finalize/}route.ts` | Modify | Repoint to `attributes.category_meta`. |
| `src/components/admin/category-attributes.tsx` | Modify | Source data per-category from `attributes.category_meta`; drop `bibleFieldMatch` field-name reference. |
| `src/app/admin/sync/page.tsx` | Modify | Update label "column_attributes" → "attributes". |
| `src/app/variations/[id]/page.tsx` | Modify | Replace `val === "Variety Pack"` UI string-match with `master.is_vp` flag. |

Tests to keep green throughout: `src/lib/alr-parser.test.ts`, `src/lib/clr-row-parser.test.ts`, `src/lib/onboarding/clr-attribute-aliases.test.ts`, `src/lib/clr-master-mapper.test.ts`, `src/lib/category-definitions/upsert.test.ts`. Adapt tests when an interface changes; do not delete coverage.

---

## Phase A — Schema migration

### Task 1: Author the SQL migration

**Files:**
- Create: `drizzle/migrations/0047_attributes_unification.sql`

- [ ] **Step 1: Write the SQL migration file**

```sql
-- 0047_attributes_unification.sql
-- Rename column_attributes → attributes; add label-variant columns; add
-- category_meta JSONB; add clr_unmatched_fields audit table; add IsVP flag
-- column. Idempotent (IF EXISTS / IF NOT EXISTS guards).

BEGIN;

-- 1) Rename table.
ALTER TABLE IF EXISTS column_attributes RENAME TO attributes;

-- 2) Rename existing columns.
ALTER TABLE attributes RENAME COLUMN specific_label TO sc_label;
ALTER TABLE attributes RENAME COLUMN bigquery_label TO bq_label;
ALTER TABLE attributes RENAME COLUMN label_details  TO description;

-- 3) Add new columns.
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS sc_label_multi varchar(20);
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS vc_label       text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS sb_label       text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS alr_label      text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS clr_label      text;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS is_vp_flag     boolean NOT NULL DEFAULT false;
ALTER TABLE attributes ADD COLUMN IF NOT EXISTS category_meta  jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- 4) Indexes.
CREATE INDEX IF NOT EXISTS idx_attributes_general_label   ON attributes (general_label);
CREATE INDEX IF NOT EXISTS idx_attributes_reference_group ON attributes (reference_group);
CREATE INDEX IF NOT EXISTS idx_attributes_subgroup        ON attributes (subgroup);
CREATE INDEX IF NOT EXISTS idx_attributes_essential       ON attributes (is_essential);
CREATE INDEX IF NOT EXISTS idx_attributes_alr_label       ON attributes (alr_label);
CREATE INDEX IF NOT EXISTS idx_attributes_category_meta   ON attributes USING GIN (category_meta);

-- 5) New audit table for CLR fields that didn't match any attribute.
CREATE TABLE IF NOT EXISTS clr_unmatched_fields (
  id          serial PRIMARY KEY,
  upload_id   integer NOT NULL REFERENCES category_definitions(id) ON DELETE CASCADE,
  field_name  text    NOT NULL,
  logged_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clr_unmatched_upload ON clr_unmatched_fields (upload_id);

-- 6) New boolean column on master for VP detection (replaces string match).
ALTER TABLE master ADD COLUMN IF NOT EXISTS is_vp boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_master_is_vp ON master (is_vp);

COMMIT;

-- Note: DROP TABLE category_attributes runs in a SEPARATE migration (0048)
-- after backfill verification. Do not drop here.
```

- [ ] **Step 2: Verify SQL syntactically with psql --dry-run is not available; instead lint via `EXPLAIN`-able statements**

Manual review only (DDL has no `EXPLAIN`). Read the file and confirm: rename targets exist in current schema (`specific_label`, `bigquery_label`, `label_details`); no drops here; `IF EXISTS / IF NOT EXISTS` everywhere. No code execution at this step.

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0047_attributes_unification.sql
git commit -m "feat(db): add 0047 attributes-unification migration SQL"
```

---

### Task 2: Migration runner script

**Files:**
- Create: `scripts/run-migration-0047-attributes-unification.ts`

- [ ] **Step 1: Write the runner**

```typescript
// scripts/run-migration-0047-attributes-unification.ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Direct port 5432 — DDL hangs on pgBouncer (port 6543).
// Filename `0047_attributes_unification.sql` has no prefix collision; this
// runner is its only companion (avoids the 0042 dual-runner class of bugs).
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running 0047_attributes_unification.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0047_attributes_unification.sql"),
    "utf8",
  );
  await sql.unsafe(text);
  console.log("  ✓ column_attributes → attributes (renamed)");
  console.log("  ✓ added: sc_label_multi, vc_label, sb_label, alr_label, clr_label, is_vp_flag, category_meta");
  console.log("  ✓ created: clr_unmatched_fields, master.is_vp");
  console.log("\nMigration complete.");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run guard — verify connection string flips to 5432**

Run: `node -e "console.log(process.env.DATABASE_URL?.replace(':6543/', ':5432/'))" --env-file=.env.local`
Expected: prints a URL containing `:5432/postgres` (or your DB name).

- [ ] **Step 3: Run the migration against the dev/prod DB (single DB per primer.md)**

Run: `npx tsx scripts/run-migration-0047-attributes-unification.ts`
Expected output: all four ✓ checkmarks; no errors.

Verify with psql:
```bash
psql "$DATABASE_URL_DIRECT" -c "\d attributes" | grep -E 'sc_label|vc_label|sb_label|alr_label|clr_label|is_vp_flag|category_meta'
psql "$DATABASE_URL_DIRECT" -c "\d clr_unmatched_fields"
psql "$DATABASE_URL_DIRECT" -c "\d master" | grep is_vp
```
Expected: all 7 new attribute columns listed; `clr_unmatched_fields` table present; `master.is_vp` boolean present.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-migration-0047-attributes-unification.ts
git commit -m "feat(db): runner for 0047 attributes-unification migration"
```

---

### Task 3: Drizzle schema sync

**Files:**
- Modify: `src/lib/db/schema.ts:245-270` (rename + extend `columnAttributes` → `attributes`)
- Modify: `src/lib/db/schema.ts:131-239` (add `isVp` boolean to `master`)
- Modify: `src/lib/db/schema.ts:480-505` (DO NOT DELETE `categoryAttributes` yet — final phase)
- Modify: `src/lib/db/schema.ts:1325` (update exported type alias name)

- [ ] **Step 1: Replace the `columnAttributes` block with the new `attributes` definition**

Replace the existing `export const columnAttributes = pgTable("column_attributes", ...)` block (currently at lines 245-270) with:

```typescript
// ─── Attributes (renamed from column_attributes) ───────────────────
// Canonical attribute registry: one row per Hub attribute, all label
// variants (SC / VC / BQ / SB / CLR / ALR) as columns, plus per-category
// metadata in category_meta JSONB. See
// docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md.

export type CategoryMetaEntry = {
  requirement: string;
  validValues: string[] | null;
  description: string | null;
  example: string | null;
  isKey: boolean;
};
export type CategoryMeta = Record<string, Record<string, CategoryMetaEntry>>;

export const attributes = pgTable(
  "attributes",
  {
    id: serial("id").primaryKey(),
    masterRow: integer("master_row").notNull(),
    generalLabel: varchar("general_label", { length: 255 }).notNull().unique(),
    description: text("description"),
    scLabel: text("sc_label"),
    scLabelMulti: varchar("sc_label_multi", { length: 20 }),
    vcLabel: text("vc_label"),
    bqLabel: text("bq_label"),
    sbLabel: text("sb_label"),
    clrLabel: text("clr_label"),
    alrLabel: text("alr_label"),
    bqDataType: varchar("bq_data_type", { length: 20 }).default("STRING"),
    labelMaxOptions: varchar("label_max_options", { length: 10 }),
    referenceGroup: varchar("reference_group", { length: 100 }).notNull(),
    subgroup: varchar("subgroup", { length: 100 }).default(""),
    isEssential: boolean("is_essential").notNull().default(false),
    isVpFlag: boolean("is_vp_flag").notNull().default(false),
    clientRequirements: jsonb("client_requirements")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    categoryMeta: jsonb("category_meta")
      .$type<CategoryMeta>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("idx_attributes_general_label").on(table.generalLabel),
    index("idx_attributes_reference_group").on(table.referenceGroup),
    index("idx_attributes_subgroup").on(table.subgroup),
    index("idx_attributes_essential").on(table.isEssential),
    index("idx_attributes_alr_label").on(table.alrLabel),
  ]
);

// Backwards-compat alias — REMOVE after Phase F readers migrate.
export const columnAttributes = attributes;
```

- [ ] **Step 2: Add `isVp` to `master`**

In the master table block at line 131, add immediately after the `variationGroup` column (line 172):

```typescript
    isVp: boolean("is_vp").notNull().default(false),
```

And add an index inside the table indexes block (line 227+):

```typescript
    index("idx_master_is_vp").on(table.isVp),
```

- [ ] **Step 3: Add the `clrUnmatchedFields` table**

Append (just below `categoryAttributes`, around line 506):

```typescript
// ─── CLR Unmatched Fields ─────────────────────────────────────────────
// Audit log of CLR field names that didn't match any attribute during a
// CLR upload. One row per upload per unmatched field. Replaces the prior
// silent-drop behavior. See spec §Pipeline 2.

export const clrUnmatchedFields = pgTable(
  "clr_unmatched_fields",
  {
    id: serial("id").primaryKey(),
    uploadId: integer("upload_id")
      .notNull()
      .references(() => categoryDefinitions.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_clr_unmatched_upload").on(table.uploadId)]
);
```

- [ ] **Step 4: Update the type export at line 1325**

Replace:
```typescript
export type ColumnAttribute = typeof columnAttributes.$inferSelect;
```
with:
```typescript
export type Attribute = typeof attributes.$inferSelect;
export type ColumnAttribute = Attribute; // back-compat alias
```

- [ ] **Step 5: Run typecheck + build**

Run: `npm run build`
Expected: build succeeds. Any consumer that imports a renamed column field (`specificLabel`, `bigqueryLabel`, `labelDetails`) will fail here — note the failures, then fix in subsequent tasks. If the build breaks too widely, scope this task to: (a) keep the alias `columnAttributes = attributes`, (b) keep `ColumnAttribute = Attribute`, (c) add string getters for renamed fields if a sweeping fix is bigger than 5 files. **Do not skip the build step.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): drizzle schema for attributes table + clr_unmatched_fields + master.is_vp"
```

---

## Phase B — Backfill

### Task 4: Backfill label variants

**Files:**
- Create: `scripts/backfill-0047-attributes-labels.ts`

- [ ] **Step 1: Write a failing assertion-style test**

Skip TDD here — backfill scripts are integration-only. Replace TDD with explicit verification queries (Step 4).

- [ ] **Step 2: Write the backfill script**

```typescript
// scripts/backfill-0047-attributes-labels.ts
//
// Idempotent backfill of label-variant columns on the renamed `attributes`
// table. Run after run-migration-0047 succeeds and BEFORE any application
// writes to attributes (Phase C/D/E). Re-running is safe.
//
//   1. clr_label = general_label (when null) — they match for the existing
//      972 rows; future drift is filled by syncAttributes() from the Sheet.
//   2. sc_label_multi = 'concat' for the 5 known multi-instance attrs.
//   3. alr_label seeded from a hardcoded map drawn from current alr-parser.
//   4. sb_label inferred from snake_case(bq_label) when that snake_case
//      matches an actual master column; logged otherwise.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

const SC_MULTI_CONCAT: ReadonlyArray<string> = [
  "GenericKeywords",
  "PlatinumKeywords",
];

const ALR_LABELS: Record<string, string> = {
  SKU: "seller-sku",
  ASIN: "asin1",
  ItemName: "item-name",
  ListPrice: "price",
  MainImageURL: "image-url",
  Status: "status",
  // Below land in master.rawColumnValues today but are still useful for
  // round-trip lookups.
  Quantity: "quantity",
  ListingId: "listing-id",
  FulfillmentChannel: "fulfillment-channel",
  OpenDate: "open-date",
  ItemDescription: "item-description",
};

function snakeCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

async function main() {
  console.log("Backfill 0047 — label variants...");

  // 1. clr_label = general_label where null.
  const r1 = await sql`
    UPDATE attributes
    SET clr_label = general_label
    WHERE clr_label IS NULL
  `;
  console.log(`  ✓ clr_label populated: ${r1.count} rows`);

  // 2. sc_label_multi = 'concat' for known multi-instance attrs.
  const r2 = await sql`
    UPDATE attributes
    SET sc_label_multi = 'concat'
    WHERE general_label = ANY(${SC_MULTI_CONCAT}::text[])
      AND sc_label_multi IS DISTINCT FROM 'concat'
  `;
  console.log(`  ✓ sc_label_multi='concat' set: ${r2.count} rows`);

  // 3. alr_label seed.
  for (const [generalLabel, alrLabel] of Object.entries(ALR_LABELS)) {
    await sql`
      UPDATE attributes
      SET alr_label = ${alrLabel}
      WHERE general_label = ${generalLabel}
        AND alr_label IS DISTINCT FROM ${alrLabel}
    `;
  }
  console.log(`  ✓ alr_label seeded for ${Object.keys(ALR_LABELS).length} attributes`);

  // 4. sb_label — best-effort match against master columns.
  const masterCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master'
  `;
  const masterColSet = new Set(masterCols.map((r) => r.column_name));
  const rows = await sql<{ id: number; general_label: string; bq_label: string | null }[]>`
    SELECT id, general_label, bq_label FROM attributes WHERE sb_label IS NULL
  `;
  let matched = 0;
  let unmatched: string[] = [];
  for (const row of rows) {
    const candidate = snakeCase(row.bq_label ?? row.general_label);
    if (masterColSet.has(candidate)) {
      await sql`UPDATE attributes SET sb_label = ${candidate} WHERE id = ${row.id}`;
      matched++;
    } else {
      unmatched.push(row.general_label);
    }
  }
  console.log(`  ✓ sb_label matched ${matched} of ${rows.length} (manual fill needed for ${unmatched.length})`);
  if (unmatched.length > 0) {
    console.log("    unmatched:", unmatched.slice(0, 20).join(", "), unmatched.length > 20 ? "…" : "");
  }

  await sql.end();
  console.log("\nBackfill complete.");
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
```

- [ ] **Step 3: Run the backfill (idempotent)**

Run: `npx tsx scripts/backfill-0047-attributes-labels.ts`
Expected: all four ✓ lines; the `sb_label matched X of 972` line shows >800 (rest land in JSONB blobs and won't have a master column — that's fine; spec calls this best-effort).

- [ ] **Step 4: Verify idempotency by running it twice**

Run: `npx tsx scripts/backfill-0047-attributes-labels.ts`
Expected: counts on second run are 0 / 0 / "0 of 972 unmatched" — script is a no-op on a populated table.

- [ ] **Step 5: Spot-check via psql**

```bash
psql "$DATABASE_URL_DIRECT" <<'SQL'
SELECT general_label, sc_label, sc_label_multi, alr_label, sb_label
FROM attributes
WHERE general_label IN ('SKU','ASIN','ItemName','GenericKeywords','ListPrice','MainImageURL')
ORDER BY general_label;
SQL
```
Expected: every row has a non-null `sb_label`; `GenericKeywords.sc_label_multi = 'concat'`; `SKU.alr_label = 'seller-sku'`.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-0047-attributes-labels.ts
git commit -m "feat(db): backfill 0047 label variants on attributes table"
```

---

### Task 5: Backfill `category_meta`

**Files:**
- Create: `scripts/backfill-0047-category-meta.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/backfill-0047-category-meta.ts
//
// Idempotent rollup: read every category_attributes row joined to its
// category_definitions parent and merge it into attributes.category_meta
// JSONB. Path: $.{marketplaceId}.{productType} = { requirement, validValues,
// description, example, isKey }.
//
// Matching: try attributes.sc_label first (with {MP}/{LANG} placeholder
// substitution), then fall back to category_attributes.bible_field_match
// matched against attributes.general_label. Unmatched rows are logged.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

interface AttrRow { id: number; general_label: string; sc_label: string | null }
interface CatAttrRow {
  id: number;
  amazon_field_name: string;
  requirement: string;
  valid_values: string[] | null;
  description: string | null;
  example: string | null;
  bible_field_match: string | null;
  is_key: boolean;
  marketplace_id: string;
  product_type: string;
}

function scLabelToRegex(scLabel: string): RegExp {
  // {MP} and {LANG} are placeholders; rest of string is treated as a literal.
  const escaped = scLabel
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    .replace(/\\\{MP\\\}/g, "[^\\]]+")
    .replace(/\\\{LANG\\\}/g, "[^\\]]+");
  return new RegExp(`^${escaped}$`);
}

function matchAttribute(
  amazonFieldName: string,
  bibleFieldMatch: string | null,
  attrs: AttrRow[],
  byGeneralLabel: Map<string, AttrRow>,
): AttrRow | null {
  // 1. sc_label regex.
  for (const a of attrs) {
    if (!a.sc_label) continue;
    const re = scLabelToRegex(a.sc_label);
    if (re.test(amazonFieldName)) return a;
  }
  // 2. fallback to bibleFieldMatch → general_label.
  if (bibleFieldMatch && byGeneralLabel.has(bibleFieldMatch)) {
    return byGeneralLabel.get(bibleFieldMatch)!;
  }
  return null;
}

async function main() {
  console.log("Backfill 0047 — category_meta…");

  const attrs = await sql<AttrRow[]>`SELECT id, general_label, sc_label FROM attributes`;
  const byGeneralLabel = new Map(attrs.map((a) => [a.general_label, a]));
  console.log(`  attributes loaded: ${attrs.length}`);

  const catAttrs = await sql<CatAttrRow[]>`
    SELECT
      ca.id, ca.amazon_field_name, ca.requirement, ca.valid_values,
      ca.description, ca.example, ca.bible_field_match, ca.is_key,
      cd.marketplace_id, cd.product_type
    FROM category_attributes ca
    JOIN category_definitions cd ON cd.id = ca.definition_id
  `;
  console.log(`  category_attributes loaded: ${catAttrs.length}`);

  let matched = 0;
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const ca of catAttrs) {
    const attr = matchAttribute(ca.amazon_field_name, ca.bible_field_match, attrs, byGeneralLabel);
    if (!attr) {
      unmatched++;
      if (unmatchedSamples.length < 25) unmatchedSamples.push(ca.amazon_field_name);
      continue;
    }
    const entry = {
      requirement: ca.requirement,
      validValues: ca.valid_values,
      description: ca.description,
      example: ca.example,
      isKey: ca.is_key,
    };
    await sql`
      UPDATE attributes
      SET category_meta = jsonb_set(
        jsonb_set(category_meta, ARRAY[${ca.marketplace_id}::text], COALESCE(category_meta->${ca.marketplace_id}, '{}'::jsonb), true),
        ARRAY[${ca.marketplace_id}::text, ${ca.product_type}::text],
        ${JSON.stringify(entry)}::jsonb,
        true
      )
      WHERE id = ${attr.id}
    `;
    matched++;
  }

  console.log(`  ✓ matched: ${matched}`);
  console.log(`  ✗ unmatched: ${unmatched}`);
  if (unmatchedSamples.length) {
    console.log("    samples:", unmatchedSamples.join("\n             "));
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the backfill**

Run: `npx tsx scripts/backfill-0047-category-meta.ts`
Expected: a non-zero match count; the unmatched count should be small (most existing CLR uploads use SC-format keys that the BQ Bible covers).

- [ ] **Step 3: Verify idempotency**

Run the script a second time. The matched count is allowed to repeat (the script overwrites identical entries — `jsonb_set` is idempotent for identical input); unmatched count stays the same.

- [ ] **Step 4: Spot-check JSONB shape**

```bash
psql "$DATABASE_URL_DIRECT" <<'SQL'
SELECT general_label,
       jsonb_path_query(category_meta, 'strict $.ATVPDKIKX0DER.*') AS sample_us
FROM attributes
WHERE category_meta != '{}'::jsonb
LIMIT 5;
SQL
```
Expected: rows show JSONB values with `requirement`/`validValues`/etc. keys.

- [ ] **Step 5: Compare per-client gap counts pre-vs-post (acceptance criterion 6)**

Pick one client with category data; run the audit endpoint pre-migration (snapshot saved on the previous main commit) and post-migration (after Task 12). Same gap totals expected. Capture in `scripts/check-mapper-gap.ts`-style ad-hoc comparison if needed; not blocking this task — note as a verification step for Phase F.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-0047-category-meta.ts
git commit -m "feat(db): backfill 0047 category_meta from category_attributes"
```

---

### Task 6: Insert IsVP attribute + backfill master.is_vp

**Files:**
- Create: `scripts/backfill-0047-is-vp.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/backfill-0047-is-vp.ts
//
// 1. Insert (or update) the synthetic `IsVP` row into attributes with
//    is_vp_flag = true.
// 2. Backfill master.is_vp from existing string-match logic on the
//    `variations` JSONB blob (Flavor / Color / Size / Style ILIKE
//    '%Variety Pack%'). Idempotent.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Backfill 0047 — IsVP attribute + master.is_vp…");

  // 1. Insert / upsert the IsVP row.
  await sql`
    INSERT INTO attributes (
      master_row, general_label, description, bq_data_type,
      sb_label, bq_label, is_vp_flag, reference_group, is_essential
    ) VALUES (
      999999, 'IsVP',
      'Marks the product as a Variety Pack. When true, variation attribute values become multi-valued.',
      'BOOLEAN', 'is_vp', 'IsVP', true, 'Hub-Internal', false
    )
    ON CONFLICT (general_label) DO UPDATE SET
      is_vp_flag = EXCLUDED.is_vp_flag,
      sb_label   = EXCLUDED.sb_label,
      bq_label   = EXCLUDED.bq_label,
      description = EXCLUDED.description,
      bq_data_type = EXCLUDED.bq_data_type,
      reference_group = EXCLUDED.reference_group
  `;
  console.log("  ✓ IsVP attribute row upserted");

  // 2. Backfill master.is_vp from the variations JSONB.
  const r = await sql`
    UPDATE master
    SET is_vp = true
    WHERE is_vp = false
      AND (
        (variations ->> 'Flavor') ILIKE '%Variety Pack%' OR
        (variations ->> 'Color')  ILIKE '%Variety Pack%' OR
        (variations ->> 'Size')   ILIKE '%Variety Pack%' OR
        (variations ->> 'Style')  ILIKE '%Variety Pack%'
      )
  `;
  console.log(`  ✓ master.is_vp set on ${r.count} rows`);

  await sql.end();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

Run: `npx tsx scripts/backfill-0047-is-vp.ts`
Expected: both ✓ lines; non-zero update count if the dataset has any existing VPs.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL_DIRECT" -c "SELECT general_label, is_vp_flag, sb_label FROM attributes WHERE is_vp_flag = true;"
psql "$DATABASE_URL_DIRECT" -c "SELECT COUNT(*) FROM master WHERE is_vp = true;"
psql "$DATABASE_URL_DIRECT" -c "SELECT COUNT(*) FROM variation_groups WHERE is_variety_pack = true;"
```
Expected: exactly one `IsVP` row; `master.is_vp` count is at least as large as `variation_groups.is_variety_pack` count (every VP group has at least one VP child, plus some products may carry the string-match without a group).

- [ ] **Step 4: Re-run for idempotency**

Run again: `npx tsx scripts/backfill-0047-is-vp.ts`
Expected: IsVP upsert still succeeds (no duplicate-key error); `master.is_vp` update count is 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-0047-is-vp.ts
git commit -m "feat(db): backfill 0047 IsVP attribute + master.is_vp from string-match"
```

---

## Phase C — CLR aliases data-driven

### Task 7: Refactor `clrAttributesToBqRow` to take aliases as a parameter

**Files:**
- Modify: `src/lib/onboarding/clr-attribute-aliases.ts`
- Modify: `src/lib/onboarding/clr-attribute-aliases.test.ts`

- [ ] **Step 1: Add a failing test that proves the new signature**

Replace the imports / first describe block at the top of `src/lib/onboarding/clr-attribute-aliases.test.ts` so tests build their own `aliases` fixture and pass it in:

```typescript
import { describe, it, expect } from "vitest";
import { clrAttributesToBqRow, type Alias } from "./clr-attribute-aliases";

const US = "ATVPDKIKX0DER";
const CA = "A2EUQ1WTGCTBG2";

const MP = `\\[marketplace_id=[^\\]]+\\]`;
const LANG = `\\[language_tag=[^\\]]+\\]`;

const FIXTURE_ALIASES: Alias[] = [
  { bqName: "SKU", patterns: [/^contribution_sku#1\.value$/] },
  { bqName: "ProductId", patterns: [/^amzn\d+\.volt\.[a-z]{2}\.product_id_value$/i] },
  { bqName: "ProductIdType", patterns: [/^amzn\d+\.volt\.[a-z]{2}\.product_id_type$/i] },
  { bqName: "ParentageLevel", patterns: [new RegExp(`^parentage_level${MP}#1\\.value$`)] },
  { bqName: "ParentSKU", patterns: [new RegExp(`^child_parent_sku_relationship${MP}#1\\.parent_sku$`)] },
  { bqName: "VariationThemeName", patterns: [/^variation_theme#1\.name$/] },
  { bqName: "ItemName", patterns: [new RegExp(`^item_name${MP}${LANG}#1\\.value$`)] },
  { bqName: "BrandName", patterns: [new RegExp(`^brand${MP}${LANG}#1\\.value$`)] },
  { bqName: "GenericKeywords", patterns: [new RegExp(`^generic_keyword${MP}${LANG}#\\d+\\.value$`)], multi: "concat" },
  // …keep adding fixture entries as the existing test file demands.
];

function key(template: string, mp = US, lang = "en_US"): string {
  return template.replace("{MP}", mp).replace("{LANG}", lang);
}
```

Then update every call site in the file from `clrAttributesToBqRow({...})` to `clrAttributesToBqRow({...}, FIXTURE_ALIASES)`. No `replace_all` blanket — examine each test to confirm the fixture covers it (extend `FIXTURE_ALIASES` from the original `ALIASES` array as needed).

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/lib/onboarding/clr-attribute-aliases.test.ts`
Expected: type error / runtime error — `clrAttributesToBqRow` does not yet accept a second argument.

- [ ] **Step 3: Refactor `clr-attribute-aliases.ts`**

Replace the file with:

```typescript
/**
 * CLR → bqName alias bridge — runtime-data-driven version.
 *
 * The hardcoded `ALIASES` array was removed in 2026-05-01 (attributes
 * table unification). Aliases are now loaded from the `attributes` table
 * via `loadClrAliases()` (see ./clr-aliases-loader.ts) and passed in as
 * the second argument. This module remains pure / synchronous so unit
 * tests can use fixture aliases without touching the DB.
 */

export interface Alias {
  /** Canonical bqName (matches CORE_COLUMNS or attributes.generalLabel). */
  bqName: string;
  patterns: RegExp[];
  multi?: "first" | "concat";
}

const MP_CAPTURE_RE = /\[marketplace_id=([^\]]+)\]/;

const MARKETPLACE_ID_TO_LABEL: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A2EUQ1WTGCTBG2: "CA",
  A1AM78C64UM0Y8: "MX",
  A2Q3Y263D00KWC: "BR",
  A1F83G8C2ARO7P: "UK",
  A1PA6795UKMFR9: "DE",
  APJ6JRA9NG5V4: "IT",
  A13V1IB3VIYZZH: "FR",
  A1RKKUPIHCS9HS: "ES",
  A1805IZSGTT6HS: "NL",
  A2NODRKZP88ZB9: "SE",
  A1C3SOZRARQ6R3: "PL",
  A33AVAJ2PDY3EV: "TR",
  A2VIGQ35RCS4UG: "AE",
  A21TJRUUN4KGV: "IN",
  A19VAU5U5O7RUS: "SG",
  A39IBJ37TRP1C6: "AU",
  A1VC38T7YXB528: "JP",
};

const BQ_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export function clrAttributesToBqRow(
  attrs: Record<string, string>,
  aliases: Alias[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const consumed = new Set<string>();

  for (const alias of aliases) {
    const matches: Array<{ key: string; value: string }> = [];
    for (const [key, rawValue] of Object.entries(attrs)) {
      const value = trim(rawValue);
      if (value === null) continue;
      if (alias.patterns.some((p) => p.test(key))) {
        matches.push({ key, value });
        consumed.add(key);
      }
    }
    if (matches.length === 0) continue;
    if (alias.multi === "concat") {
      matches.sort((a, b) => extractIndex(a.key) - extractIndex(b.key));
      out[alias.bqName] = matches.map((m) => m.value).join(", ");
    } else {
      out[alias.bqName] = matches[0].value;
    }
  }

  for (const [key, rawValue] of Object.entries(attrs)) {
    if (consumed.has(key)) continue;
    if (!BQ_NAME_RE.test(key)) continue;
    if (out[key] !== undefined) continue;
    const value = trim(rawValue);
    if (value === null) continue;
    out[key] = value;
  }

  if (out.Marketplace === undefined) {
    const marketplace = extractMarketplace(attrs);
    if (marketplace) out.Marketplace = marketplace;
  }
  return out;
}

export function extractMarketplace(attrs: Record<string, string>): string | null {
  const tally = new Map<string, number>();
  for (const key of Object.keys(attrs)) {
    const m = key.match(MP_CAPTURE_RE);
    if (m) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  let bestId = "";
  let bestCount = -1;
  for (const [id, count] of tally) {
    if (count > bestCount) { bestCount = count; bestId = id; }
  }
  return MARKETPLACE_ID_TO_LABEL[bestId] ?? bestId;
}

function extractIndex(key: string): number {
  const m = key.match(/#(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

function trim(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/onboarding/clr-attribute-aliases.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/clr-attribute-aliases.ts src/lib/onboarding/clr-attribute-aliases.test.ts
git commit -m "refactor(clr): make clrAttributesToBqRow take aliases as a parameter"
```

---

### Task 8: DB-backed alias loader

**Files:**
- Create: `src/lib/onboarding/clr-aliases-loader.ts`
- Create: `src/lib/onboarding/clr-aliases-loader.test.ts`

- [ ] **Step 1: Write a failing test**

```typescript
// src/lib/onboarding/clr-aliases-loader.test.ts
import { describe, it, expect } from "vitest";
import { aliasesFromRows } from "./clr-aliases-loader";

describe("aliasesFromRows", () => {
  it("substitutes {MP}/{LANG} placeholders into regex patterns", () => {
    const aliases = aliasesFromRows([
      {
        generalLabel: "ItemName",
        scLabel: "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value",
        scLabelMulti: null,
      },
    ]);
    expect(aliases).toHaveLength(1);
    expect(aliases[0].bqName).toBe("ItemName");
    expect(aliases[0].patterns[0].test(
      "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value"
    )).toBe(true);
  });

  it("forwards sc_label_multi onto the alias", () => {
    const aliases = aliasesFromRows([
      {
        generalLabel: "GenericKeywords",
        scLabel: "generic_keyword[marketplace_id={MP}][language_tag={LANG}]#\\d+.value",
        scLabelMulti: "concat",
      },
    ]);
    expect(aliases[0].multi).toBe("concat");
  });

  it("skips rows with null sc_label", () => {
    const aliases = aliasesFromRows([
      { generalLabel: "IsVP", scLabel: null, scLabelMulti: null },
    ]);
    expect(aliases).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/onboarding/clr-aliases-loader.test.ts`
Expected: cannot resolve module — file does not exist yet.

- [ ] **Step 3: Implement the loader**

```typescript
// src/lib/onboarding/clr-aliases-loader.ts
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import type { Alias } from "./clr-attribute-aliases";

interface AttrRow {
  generalLabel: string;
  scLabel: string | null;
  scLabelMulti: string | null;
}

/**
 * Convert a row's sc_label literal (with {MP}/{LANG} placeholders) into a
 * regex. The `\d+` literal in stored sc_label values for multi-instance
 * fields is also preserved (we only escape characters Amazon's templates
 * never use unescaped — anything inside `{...}` is treated as a literal).
 *
 * The function is pure so it's easy to unit-test without a DB.
 */
function compilePattern(scLabel: string): RegExp {
  // Escape regex specials, then unescape our placeholder tokens.
  const escaped = scLabel
    .replace(/[.*+?()[\]|^$]/g, "\\$&") // NB: we deliberately do NOT escape `\` or `{}` here
    .replace(/\\\{MP\\\}/g, "[^\\]]+")
    .replace(/\\\{LANG\\\}/g, "[^\\]]+");
  return new RegExp(`^${escaped}$`);
}

export function aliasesFromRows(rows: AttrRow[]): Alias[] {
  const out: Alias[] = [];
  for (const r of rows) {
    if (!r.scLabel) continue;
    out.push({
      bqName: r.generalLabel,
      patterns: [compilePattern(r.scLabel)],
      multi: r.scLabelMulti === "concat" ? "concat" : "first",
    });
  }
  return out;
}

export async function loadClrAliases(): Promise<Alias[]> {
  const rows = await db
    .select({
      generalLabel: attributes.generalLabel,
      scLabel: attributes.scLabel,
      scLabelMulti: attributes.scLabelMulti,
    })
    .from(attributes)
    .where(isNotNull(attributes.scLabel));
  return aliasesFromRows(rows);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/onboarding/clr-aliases-loader.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Wire `clrRowToMasterFields` to use the loader**

Modify `src/lib/clr-master-mapper.ts`:
- Add `import { loadClrAliases } from "./onboarding/clr-aliases-loader";`
- Add an `aliases?` parameter to `clrRowToMasterFields` that defaults to `await loadClrAliases()`. If the function is sync today, change its callers (only `/api/onboarding/merge-master/route.ts:169`) to `await` it. Pass `aliases` through to `clrAttributesToBqRow`.
- Update `src/lib/clr-master-mapper.test.ts` to construct a fixture aliases array (mirroring Task 7's fixture) and pass it in. Run: `npx vitest run src/lib/clr-master-mapper.test.ts`. Expected: tests pass.
- Update the merge-master route to call `clrRowToMasterFields(parsed, opts, aliases)`; load `aliases` once before the loop.

Run: `npm run build` and `npx vitest run src/lib`
Expected: build clean, tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/clr-aliases-loader.ts \
        src/lib/onboarding/clr-aliases-loader.test.ts \
        src/lib/clr-master-mapper.ts src/lib/clr-master-mapper.test.ts \
        src/app/api/onboarding/merge-master/route.ts
git commit -m "feat(clr): runtime-load aliases from attributes table"
```

---

## Phase D — ALR data-driven

### Task 9: ALR field map loader + parser refactor

**Files:**
- Create: `src/lib/alr-field-map-loader.ts`
- Create: `src/lib/alr-field-map-loader.test.ts`
- Modify: `src/lib/alr-parser.ts`
- Modify: `src/lib/alr-parser.test.ts`

- [ ] **Step 1: Write a failing test for the loader**

```typescript
// src/lib/alr-field-map-loader.test.ts
import { describe, it, expect } from "vitest";
import { fieldMapFromRows } from "./alr-field-map-loader";

describe("fieldMapFromRows", () => {
  it("keys by alr_label, exposes general label + sb label", () => {
    const map = fieldMapFromRows([
      { generalLabel: "SKU", alrLabel: "seller-sku", sbLabel: "sku" },
      { generalLabel: "ASIN", alrLabel: "asin1", sbLabel: "asin" },
      { generalLabel: "ItemName", alrLabel: null, sbLabel: "item_name" },
    ]);
    expect(map["seller-sku"]).toEqual({ generalLabel: "SKU", sbLabel: "sku" });
    expect(map["asin1"]).toEqual({ generalLabel: "ASIN", sbLabel: "asin" });
    expect(Object.keys(map)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/lib/alr-field-map-loader.test.ts`
Expected: missing module.

- [ ] **Step 3: Implement the loader**

```typescript
// src/lib/alr-field-map-loader.ts
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";

export interface AlrFieldEntry { generalLabel: string; sbLabel: string | null }
export type AlrFieldMap = Record<string, AlrFieldEntry>;

interface Row { generalLabel: string; alrLabel: string | null; sbLabel: string | null }

export function fieldMapFromRows(rows: Row[]): AlrFieldMap {
  const map: AlrFieldMap = {};
  for (const r of rows) {
    if (!r.alrLabel) continue;
    map[r.alrLabel] = { generalLabel: r.generalLabel, sbLabel: r.sbLabel };
  }
  return map;
}

export async function loadAlrFieldMap(): Promise<AlrFieldMap> {
  const rows = await db
    .select({
      generalLabel: attributes.generalLabel,
      alrLabel: attributes.alrLabel,
      sbLabel: attributes.sbLabel,
    })
    .from(attributes)
    .where(isNotNull(attributes.alrLabel));
  return fieldMapFromRows(rows);
}
```

Run tests: `npx vitest run src/lib/alr-field-map-loader.test.ts`. Expected: pass.

- [ ] **Step 4: Refactor `alr-parser.ts` to be data-driven**

Replace the file body **after** the `parseAlr` function (parser stays the same — the TSV parser is generic). Replace the `AlrMasterFields` block (lines 92-118) with:

```typescript
import type { AlrFieldMap } from "./alr-field-map-loader";

/**
 * Master-table fields derived from an ALR row. The `coreFields` shape mirrors
 * the columns we project onto master.* (asin/sku/marketplace/itemName/etc.);
 * everything also lands in rawColumnValues for zero-data-loss.
 *
 * The mapping from ALR header → master field is now data-driven via the
 * `attributes.alr_label` column. Pass the loaded `AlrFieldMap` (from
 * loadAlrFieldMap()) as the second argument; the function is pure.
 */
export interface AlrMasterFields {
  asin: string | null;
  sku: string | null;
  marketplace: string;
  status: string | null;
  itemName: string | null;
  mainImageUrl: string | null;
  listPrice: string | null;
  rawColumnValues: Record<string, string>;
}

export const DEFAULT_MARKETPLACE = "US";

// sb_label values we map to AlrMasterFields keys. New ALR-mapped attributes
// land in rawColumnValues only unless explicitly handled here. Keeping this
// map small and explicit avoids a runtime decision about which JSON path on
// master should hold each value (core column vs JSONB blob).
const SB_TO_CORE_FIELD: Record<string, keyof AlrMasterFields> = {
  asin: "asin",
  sku: "sku",
  status: "status",
  item_name: "itemName",
  main_image_url: "mainImageUrl",
  list_price: "listPrice",
};

export function alrRowToMasterFields(row: AlrRow, fieldMap: AlrFieldMap): AlrMasterFields {
  const out: AlrMasterFields = {
    asin: null,
    sku: null,
    marketplace: DEFAULT_MARKETPLACE,
    status: null,
    itemName: null,
    mainImageUrl: null,
    listPrice: null,
    rawColumnValues: row.raw,
  };
  for (const [header, value] of Object.entries(row.raw)) {
    const entry = fieldMap[header];
    if (!entry || !entry.sbLabel) continue;
    const coreKey = SB_TO_CORE_FIELD[entry.sbLabel];
    if (!coreKey || coreKey === "rawColumnValues") continue;
    if (coreKey === "marketplace") continue; // marketplace handled separately
    if (value && value.length > 0) {
      // narrow back to string (everything but rawColumnValues is `string | null`)
      (out as Record<string, string | null>)[coreKey] = value;
    }
  }
  return out;
}
```

- [ ] **Step 5: Update the ALR parser test**

Modify `src/lib/alr-parser.test.ts`:
- Add an import: `import { fieldMapFromRows } from "./alr-field-map-loader";`
- Build a fixture `FIXTURE_FIELD_MAP = fieldMapFromRows([...])` mirroring the SB labels in `SB_TO_CORE_FIELD`.
- Update every `alrRowToMasterFields(rows[0])` call to `alrRowToMasterFields(rows[0], FIXTURE_FIELD_MAP)`.

Run: `npx vitest run src/lib/alr-parser.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Update consumers of `alrRowToMasterFields`**

Run: `grep -rn "alrRowToMasterFields" src --include="*.ts" --include="*.tsx"` and update each call site to load the field map once before the loop and pass it through. Most likely sites: `src/app/api/onboarding/alr-link/route.ts` and `src/app/api/onboarding/merge-master/route.ts`.

Run: `npm run build && npx vitest run src/lib src/app`
Expected: clean build, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/alr-field-map-loader.ts src/lib/alr-field-map-loader.test.ts \
        src/lib/alr-parser.ts src/lib/alr-parser.test.ts \
        $(git diff --name-only -- src/app/api/onboarding)
git commit -m "feat(alr): data-driven ALR header map via attributes.alr_label"
```

---

## Phase E — Category metadata writers

### Task 10: Rewrite `upsertCategoryDefinitions` to write `category_meta`

**Files:**
- Modify: `src/lib/category-definitions/upsert.ts`
- Modify: `src/lib/category-definitions/upsert.test.ts`
- Modify: `src/lib/category-attribute-matcher.ts` (add an `attributeId` to the result map)

- [ ] **Step 1: Update the matcher to expose attribute IDs**

The matcher returns `Map<amazonFieldName, generalLabel>`; we now also want the attribute ID and bqName so the upsert can write `category_meta` directly. Modify `matchHubFields` so it returns `Map<amazonFieldName, { id: number; generalLabel: string }>` (or add a sibling fn `matchHubFieldsWithIds`). Update its test and any other callers (production: only `upsert.ts`).

```typescript
// in src/lib/category-attribute-matcher.ts — append a thin wrapper.
export function matchHubFieldsWithIds(
  parsedAttrs: ParsedCategoryAttribute[],
  rows: Pick<Attribute, "id" | "generalLabel">[],
): Map<string, { id: number; generalLabel: string }> {
  const byGeneralLabel = new Map(rows.map((r) => [r.generalLabel, r]));
  const matches = matchHubFields(parsedAttrs, rows as ColumnAttribute[]);
  const out = new Map<string, { id: number; generalLabel: string }>();
  for (const [amzn, gl] of matches) {
    const row = byGeneralLabel.get(gl);
    if (row) out.set(amzn, { id: row.id, generalLabel: gl });
  }
  return out;
}
```

- [ ] **Step 2: Add a failing test for the new upsert behavior**

In `src/lib/category-definitions/upsert.test.ts`, add:

```typescript
it("writes a category_meta entry on attributes for each matched parsed row", async () => {
  // Stub db.select to return one attribute, mock db.update to capture the
  // jsonb_set call shape, mock db.delete + insert into category_definitions
  // to no-op. Assert that for amazonFieldName='item_sku' the upsert calls
  // update on attributes with a category_meta path of [marketplace, productType].
  // Suggested approach: spy via vi.fn() on db.update().set().where() chain
  // and verify the SQL fragment contains 'category_meta' and 'item_sku'.
  // Implementation note: leverage the existing pattern in this test file
  // (vi.mock("@/lib/db", ...)) rather than introducing a real DB.
  expect(true).toBe(false); // intentionally failing — replace with real spy assertion
});
```

Run: `npx vitest run src/lib/category-definitions/upsert.test.ts`
Expected: failure on the new test (other 2 still pass).

- [ ] **Step 3: Rewrite `upsert.ts`**

Replace the body with:

```typescript
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  attributes,
  clrUnmatchedFields,
  master,
  type CategoryDefinition,
  type CategoryMetaEntry,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { matchHubFieldsWithIds } from "@/lib/category-attribute-matcher";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

export interface UpsertCategoryDefinitionsArgs {
  clientIdCode: string;
  uploadedBy: string;
  parsedReports: ParsedCategoryReport[];
}

export interface UpsertCategoryDefinitionsResult {
  definitions: CategoryDefinition[];
  matchCount: number;
}

export async function upsertCategoryDefinitions(
  args: UpsertCategoryDefinitionsArgs,
): Promise<UpsertCategoryDefinitionsResult> {
  const { clientIdCode, uploadedBy, parsedReports } = args;
  if (parsedReports.length === 0) return { definitions: [], matchCount: 0 };

  const allAttrs = await db
    .select({ id: attributes.id, generalLabel: attributes.generalLabel })
    .from(attributes);

  const firstReport = parsedReports[0];
  const matches = matchHubFieldsWithIds(firstReport.attributes, allAttrs);
  const matchCount = matches.size;

  const matchedGeneralLabels = [...new Set([...matches.values()].map((m) => m.generalLabel))];
  const clientProducts = await db
    .select()
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));
  const baselineSnapshot: Record<string, Record<string, string | null>> = {};
  for (const product of clientProducts) {
    const values: Record<string, string | null> = {};
    for (const gl of matchedGeneralLabels) {
      values[gl] = getProductFieldValue(product, gl) ?? null;
    }
    baselineSnapshot[product.id] = values;
  }

  const createdDefs: CategoryDefinition[] = [];
  for (const parsed of parsedReports) {
    const existing = await db
      .select({ id: categoryDefinitions.id })
      .from(categoryDefinitions)
      .where(
        and(
          eq(categoryDefinitions.clientIdCode, clientIdCode),
          eq(categoryDefinitions.productType, parsed.productType),
          eq(categoryDefinitions.marketplaceId, parsed.marketplace),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db.delete(categoryDefinitions).where(eq(categoryDefinitions.id, existing[0].id));
    }
    const [newDef] = await db
      .insert(categoryDefinitions)
      .values({
        clientIdCode,
        productType: parsed.productType,
        marketplaceId: parsed.marketplace,
        totalAttributes: parsed.summary.total,
        requiredCount: parsed.summary.required,
        conditionalCount: parsed.summary.conditional,
        optionalCount: parsed.summary.optional,
        uploadedBy,
        baselineSnapshot:
          Object.keys(baselineSnapshot).length > 0 ? baselineSnapshot : null,
      })
      .returning();
    createdDefs.push(newDef);

    // Per-parsed-attribute: write category_meta or log unmatched.
    for (const attr of parsed.attributes) {
      const matched = matches.get(attr.amazonFieldName);
      if (!matched) {
        await db
          .insert(clrUnmatchedFields)
          .values({ uploadId: newDef.id, fieldName: attr.amazonFieldName });
        continue;
      }
      const entry: CategoryMetaEntry = {
        requirement: attr.requirement,
        validValues: attr.validValues.length > 0 ? attr.validValues : null,
        description: attr.description || null,
        example: attr.example || null,
        isKey: false, // preserved-or-default; previous upserts kept rather
                      // than reset isKey. See note below.
      };
      // jsonb_set with create_missing=true at both depths so an empty
      // category_meta {} grows into { mp: { pt: entry } } correctly.
      await db.execute(sql`
        UPDATE attributes
        SET category_meta = jsonb_set(
          jsonb_set(
            category_meta,
            ARRAY[${parsed.marketplace}::text],
            COALESCE(category_meta->${parsed.marketplace}, '{}'::jsonb),
            true
          ),
          ARRAY[${parsed.marketplace}::text, ${parsed.productType}::text],
          COALESCE(
            jsonb_set(
              category_meta->${parsed.marketplace}->${parsed.productType},
              ARRAY['isKey'],
              to_jsonb(COALESCE((category_meta->${parsed.marketplace}->${parsed.productType}->'isKey')::boolean, false))
            ),
            ${JSON.stringify(entry)}::jsonb
          ) || ${JSON.stringify({ ...entry, isKey: undefined })}::jsonb,
          true
        )
        WHERE id = ${matched.id}
      `);
    }
  }

  return { definitions: createdDefs, matchCount };
}
```

NOTE on `isKey` preservation: a fresh CLR upload should not reset a previously-set Hub `isKey` toggle for a (mp × productType × attribute). The SQL above merges the new entry on top of the existing one with `||` (right-side wins), then forces `isKey` to keep its prior value via the inner `jsonb_set`. If this proves brittle, simplify to a per-row read-update pattern (one SELECT + one UPDATE per row); correctness over micro-optimization.

- [ ] **Step 4: Replace the failing test with a real spy assertion**

Use the existing `vi.mock("@/lib/db", …)` in the file. Make `db.select` chain return a fixed `[{id: 1, generalLabel: 'SKU'}]`, `db.insert(...).values(...).returning()` return `[{id: 99}]`, and capture all `db.execute(...)` SQL fragments. Assert one of the captured fragments contains `'category_meta'` and the marketplace `'ATVPDKIKX0DER'` (from the test fixture).

Run: `npx vitest run src/lib/category-definitions/upsert.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Build + full test suite**

Run: `npm run build && npm test`
Expected: clean build; pre-existing failures from `clr-import/route.test.ts` and `monthly-report chromium` are still allowed (per primer.md), but **no new** failures. Tests called out in the constraints — `alr-parser.test.ts`, `clr-row-parser.test.ts`, `clr-attribute-aliases.test.ts`, `clr-master-mapper.test.ts`, `category-definitions/upsert.test.ts` — must be green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/category-definitions/upsert.ts src/lib/category-definitions/upsert.test.ts \
        src/lib/category-attribute-matcher.ts
git commit -m "feat(clr): write category metadata into attributes.category_meta + log unmatched"
```

---

## Phase F — Reader updates

### Task 11: Audit endpoint reads `category_meta`

**Files:**
- Modify: `src/app/api/attributes/audit/route.ts`

- [ ] **Step 1: Read the current implementation top-to-bottom**

Confirm the current code path: it loads `categoryDefinitions`, then per-def loads `categoryAttributes` rows (filtered by requirement IN (Required, Conditionally Required) OR isKey=true) and only audits rows with a non-null `bibleFieldMatch`.

- [ ] **Step 2: Replace `categoryAttributes` query with an `attributes.category_meta` query**

Inside the `for (const def of filteredDefs)` loop, replace the `db.select().from(categoryAttributes).where(…)` block (lines 77-91) with:

```typescript
// Read auditable attributes from attributes.category_meta:
//   - requirement IN ('Required', 'Conditionally Required')
//   - OR isKey === true
const auditableRows = await db
  .select({
    id: attributes.id,
    generalLabel: attributes.generalLabel,
    requirement: sql<string>`(${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'requirement')`,
    isKey: sql<boolean>`COALESCE((${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'isKey')::boolean, false)`,
    localLabel: attributes.generalLabel, // backward-compat shim — local label = general label post-merge
  })
  .from(attributes)
  .where(
    and(
      sql`${attributes.categoryMeta} ? ${def.marketplaceId}`,
      sql`(${attributes.categoryMeta}->${def.marketplaceId}) ? ${def.productType}`,
      or(
        sql`(${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'requirement') IN ('Required', 'Conditionally Required')`,
        sql`COALESCE((${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}->>'isKey')::boolean, false) = true`,
      ),
    ),
  );

// Bible field match → attributes.generalLabel directly.
const auditableAttrs = auditableRows.map((r) => ({
  ...r,
  bibleFieldMatch: r.generalLabel,
}));
```

- [ ] **Step 3: Update the per-product audit loop**

Replace `attr.bibleFieldMatch!` reads (lines 157, 161, 178) with `attr.generalLabel` (or keep `bibleFieldMatch` shim as above for minimal diff).

- [ ] **Step 4: Imports — drop `categoryAttributes`, add `attributes` + `sql`**

```typescript
import { categoryDefinitions, productKeyOverrides, master, attributes } from "@/lib/db/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
```

- [ ] **Step 5: Run an existing-data sanity test**

Pick one client+productType combo, hit `/api/attributes/audit?clientIdCode=…&productType=…` before and after this commit, compare gap counts. Acceptance criterion 6 — totals must match.

- [ ] **Step 6: Run the build + tests**

Run: `npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/attributes/audit/route.ts
git commit -m "feat(audit): read auditable attributes from attributes.category_meta"
```

---

### Task 12: Migrate the remaining `categoryAttributes` readers

**Files (one commit per file is fine; bundle them into one task to avoid churn):**
- Modify: `src/app/api/products/theme-values/route.ts`
- Modify: `src/app/api/variations/theme-options/route.ts`
- Modify: `src/app/api/category-definitions/[productType]/route.ts`
- Modify: `src/app/api/category-definitions/[productType]/attributes/[id]/route.ts`
- Modify: `src/app/api/admin/observability/route.ts`
- Modify: `src/app/api/attributes/template-requests/route.ts`
- Modify: `src/app/api/attributes/template-requests/[id]/route.ts`
- Modify: `src/app/api/attributes/template-requests/[id]/diff/route.ts`
- Modify: `src/app/api/attributes/template-requests/[id]/finalize/route.ts`
- Modify: `src/components/admin/category-attributes.tsx`

- [ ] **Step 1: Survey all reader patterns**

Run: `grep -n "from(categoryAttributes)\|categoryAttributes\\.\\(definitionId\\|requirement\\|isKey\\|validValues\\|bibleFieldMatch\\|amazonFieldName\\|localLabel\\|description\\|example\\|sortOrder\\|hideFromTemplate\\)" src --include="*.ts" --include="*.tsx" -r`

Categorize each match into one of:
1. **Drop** — was a count-only metric (observability) → switch to counting attributes rows with non-empty category_meta.
2. **Reshape** — query needs to traverse JSONB.
3. **Move** — endpoint owns its own transformation; pull values from JSONB.

- [ ] **Step 2: Write a JSONB query helper**

Add to `src/lib/category-meta-queries.ts` (NEW):

```typescript
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export interface AttributeCategoryRow {
  id: number;
  generalLabel: string;
  requirement: string | null;
  validValues: string[] | null;
  description: string | null;
  example: string | null;
  isKey: boolean;
}

/** Return all attributes with non-empty category_meta for (mp, productType). */
export async function getAttributesForCategory(
  marketplaceId: string,
  productType: string,
): Promise<AttributeCategoryRow[]> {
  const path = sql`${attributes.categoryMeta}->${marketplaceId}->${productType}`;
  const rows = await db
    .select({
      id: attributes.id,
      generalLabel: attributes.generalLabel,
      requirement: sql<string | null>`(${path}->>'requirement')`,
      validValues: sql<string[] | null>`(${path}->'validValues')`,
      description: sql<string | null>`(${path}->>'description')`,
      example: sql<string | null>`(${path}->>'example')`,
      isKey: sql<boolean>`COALESCE((${path}->>'isKey')::boolean, false)`,
    })
    .from(attributes)
    .where(sql`${path} IS NOT NULL`);
  return rows;
}
```

- [ ] **Step 3: Migrate each consumer file**

Walk each route in the file list. For each one:
- Replace `db.select().from(categoryAttributes).where(eq(definitionId, def.id))` with `getAttributesForCategory(def.marketplaceId, def.productType)`.
- Replace `bibleFieldMatch` → `generalLabel`.
- Drop usage of `localLabel`, `groupName`, `sortOrder`, `hideFromTemplate` (these no longer exist — group/sort metadata lives on the `attributes` row's existing `referenceGroup`/`subgroup`/`masterRow` columns; if a UI component truly needs `localLabel`, default it to `generalLabel`).
- For observability/route.ts, replace the `categoryAttributes` row count with: `SELECT COUNT(*) FROM attributes WHERE category_meta != '{}'::jsonb`.

After each file change, run `npm run build` and the test suite touching that route.

- [ ] **Step 4: Update `src/components/admin/category-attributes.tsx`**

Drop the `bibleFieldMatch` field on the `CategoryAttribute` type definition; rename references at lines 575, 644, 709, 712 to `generalLabel`. Visual output unchanged (general label is what was previously displayed under "Bible field match" anyway).

- [ ] **Step 5: Update `src/app/admin/sync/page.tsx`**

Find/replace the user-visible label `column_attributes` → `attributes`. No logic change.

- [ ] **Step 6: Build + manual QA**

Run: `npm run build && npm test`
Then `PORT=3000 npm run dev` and visually click through:
- `/admin/attributes` — list still renders.
- `/attributes` — gap audit page still renders.
- `/admin/sync` — label updated.
- `/variations` (creating a new variation theme) — picker still loads valid values.

Capture screenshots if needed; compare against pre-migration screenshots.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/products/theme-values/route.ts \
        src/app/api/variations/theme-options/route.ts \
        src/app/api/category-definitions/ \
        src/app/api/admin/observability/route.ts \
        src/app/api/attributes/template-requests/ \
        src/components/admin/category-attributes.tsx \
        src/app/admin/sync/page.tsx \
        src/lib/category-meta-queries.ts
git commit -m "feat(api): migrate all category_attributes readers to attributes.category_meta"
```

---

### Task 13: Extend `syncAttributes()` to read 4 new BQ columns

**Files:**
- Modify: `src/lib/sync-tables.ts:149-237`

- [ ] **Step 1: Add the 4 new column reads**

Replace the `values` literal (lines 192-204) with:

```typescript
const values = {
  masterRow: parseInt(row.MasterAttributeRow) || 0,
  generalLabel,
  description: row.LabelDetails || null,             // renamed from labelDetails
  scLabel: row.SpecificLabel || null,                // renamed from specificLabel
  vcLabel: row.VCLabel || null,                      // NEW
  bqLabel: row.BigqueryLabel || null,                // renamed from bigqueryLabel
  sbLabel: row.SBLabel || null,                      // NEW
  alrLabel: row.ALRLabel || null,                    // NEW
  clrLabel: row.CLRLabel || null,                    // NEW
  bqDataType: row.BQDataType || "STRING",
  labelMaxOptions: row.LabelMaxOptions || null,
  referenceGroup: row.ReferenceGroup || "",
  subgroup: row.Subgroup || "",
  isEssential: row.Essential === "true",
  clientRequirements: clientReqs,
};
```

- [ ] **Step 2: Update imports / table reference**

Change `import { ..., columnAttributes, ... }` → `import { ..., attributes, ... }`. Replace every `columnAttributes` reference in this function with `attributes`. Update `result.table = "column_attributes"` → `"attributes"`.

- [ ] **Step 3: Smoke test**

Run a one-shot sync via `/admin/sync`. Verify in psql that the 4 new columns are non-null on at least the rows that have values populated in BQ Sheet. (If the BQ Sheet hasn't been updated yet, this is a no-op — that's fine; spec §Step 4 covers the Sheet update separately, out of band of this PR.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync-tables.ts
git commit -m "feat(sync): read VC/SB/ALR/CLR labels from BQ Bible into attributes table"
```

---

## Phase G — Variation theme + VP detection

### Task 14: `parseVariationTheme` + `isVariationAttribute` helpers

**Files:**
- Create: `src/lib/variation-theme.ts`
- Create: `src/lib/variation-theme.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// src/lib/variation-theme.test.ts
import { describe, it, expect } from "vitest";
import { parseVariationTheme, isVariationAttribute } from "./variation-theme";

describe("parseVariationTheme", () => {
  it("returns [] for null/empty", () => {
    expect(parseVariationTheme(null)).toEqual([]);
    expect(parseVariationTheme("")).toEqual([]);
  });
  it("splits 'Color/Size' on slash", () => {
    expect(parseVariationTheme("Color/Size")).toEqual(["Color", "Size"]);
  });
  it("splits 'ColorSize' (Amazon PascalCase) on word boundaries", () => {
    expect(parseVariationTheme("ColorSize")).toEqual(["Color", "Size"]);
  });
  it("returns single-token themes verbatim", () => {
    expect(parseVariationTheme("Flavor")).toEqual(["Flavor"]);
  });
});

describe("isVariationAttribute", () => {
  it("returns true when the attribute's general label is in the theme set", () => {
    expect(
      isVariationAttribute(
        { variationThemeName: "Color/Size" },
        { generalLabel: "Color" },
      ),
    ).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(
      isVariationAttribute(
        { variationThemeName: "Flavor" },
        { generalLabel: "Color" },
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/lib/variation-theme.test.ts`
Expected: missing module.

- [ ] **Step 3: Implement**

```typescript
// src/lib/variation-theme.ts
/**
 * Parse Amazon's variation_theme_name into its constituent attribute names.
 *
 * Examples:
 *   "Color/Size"   → ["Color", "Size"]
 *   "ColorSize"    → ["Color", "Size"]   (Amazon's PascalCase fused form)
 *   "Flavor"       → ["Flavor"]
 *   null / ""      → []
 */
export function parseVariationTheme(theme: string | null | undefined): string[] {
  if (!theme) return [];
  if (theme.includes("/")) return theme.split("/").map((s) => s.trim()).filter(Boolean);
  // Split PascalCase ("ColorSize" → ["Color", "Size"]) by inserting a delimiter
  // before each uppercase letter that follows a lowercase letter.
  const split = theme.replace(/([a-z])([A-Z])/g, "$1|$2").split("|");
  return split.map((s) => s.trim()).filter(Boolean);
}

export interface VariationProductLike { variationThemeName: string | null | undefined }
export interface VariationAttributeLike { generalLabel: string }

export function isVariationAttribute(
  product: VariationProductLike,
  attribute: VariationAttributeLike,
): boolean {
  return parseVariationTheme(product.variationThemeName).includes(attribute.generalLabel);
}
```

- [ ] **Step 4: Pass tests**

Run: `npx vitest run src/lib/variation-theme.test.ts`. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/variation-theme.ts src/lib/variation-theme.test.ts
git commit -m "feat(variations): parseVariationTheme + isVariationAttribute helpers"
```

---

### Task 15: Replace `val === "Variety Pack"` UI string-match with `master.is_vp`

**Files:**
- Modify: `src/app/variations/[id]/page.tsx:1762` (also the surrounding badge logic ~lines 1685-1934 if needed)
- Modify: `src/app/api/products/[id]/family/route.ts` (so `vpFlavors` continues to feed via the existing variety_pack_items composition table — unchanged logic, just don't rely on the string-match guard)

- [ ] **Step 1: Read the current detection at line 1762**

```typescript
const isVP = key === "Flavor" && val === "Variety Pack" && p.vpFlavors?.length;
```

The `p` here is a row item; surface a new `isVp` boolean from the API. Check the API route at `src/app/api/products/route.ts:150` — already returns `vpFlavors`. Add `isVp: master.isVp` to the same SELECT. Do the same in `src/app/api/portal/products/route.ts:95`.

- [ ] **Step 2: Add `isVp` to the API select projection**

In `src/app/api/products/route.ts` and `src/app/api/portal/products/route.ts`, alongside the `vpFlavors` SQL fragment, add:

```typescript
isVp: master.isVp,
```

(the column exists post-migration). Do the same in any other route that returns the row shape consumed by `variations/[id]/page.tsx:948` (the type literal there enumerates fields).

- [ ] **Step 3: Update the page type + detection**

Update the inline type at `src/app/variations/[id]/page.tsx:948` to include `isVp?: boolean`. Replace the line-1762 detection with:

```typescript
const isVP = !!p.isVp && p.vpFlavors?.length;
```

- [ ] **Step 4: Manual QA**

`PORT=3000 npm run dev`. Open a known VP product (one whose flavor was "Variety Pack" pre-migration). Confirm the VP badge still renders. Open a non-VP product. Confirm no badge.

- [ ] **Step 5: Build + tests**

Run: `npm run build && npm test`
Expected: clean (the only behavior change here is reading `master.is_vp` instead of comparing strings).

- [ ] **Step 6: Commit**

```bash
git add src/app/variations/[id]/page.tsx \
        src/app/api/products/route.ts \
        src/app/api/portal/products/route.ts
git commit -m "feat(variations): drive VP detection from master.is_vp instead of string match"
```

---

## Phase H — Cleanup

### Task 16: Drop `category_attributes` (separate migration 0048)

**Files:**
- Create: `drizzle/migrations/0048_drop_category_attributes.sql`
- Create: `scripts/run-migration-0048-drop-category-attributes.ts`
- Modify: `src/lib/db/schema.ts` (remove `categoryAttributes` export + import)

**ONLY** run this task after Phase F is fully deployed and the audit endpoint has run cleanly against post-migration data for at least 24 hours (gives the team a window to roll back the application changes without losing data).

- [ ] **Step 1: Take a logical dump for rollback safety**

```bash
pg_dump "$DATABASE_URL_DIRECT" \
  --table=public.column_attributes_backup_pre_unification \
  --table=public.category_attributes \
  --table=public.category_definitions \
  -F c -f /tmp/0047-rollback.dump
```

(Skip the `column_attributes_backup_…` line if you didn't snapshot upfront — it's belt-and-braces. Spec §Rollback recommends taking the dump.)

- [ ] **Step 2: Write the migration SQL**

```sql
-- 0048_drop_category_attributes.sql
-- Drop category_attributes after full backfill + reader migration.
-- Reversible only via the rollback dump from /tmp/0047-rollback.dump.
BEGIN;
DROP TABLE IF EXISTS category_attributes;
COMMIT;
```

- [ ] **Step 3: Write the runner**

(Same template as Task 2; reads `0048_drop_category_attributes.sql`, `:6543/` → `:5432/`.)

- [ ] **Step 4: Run + verify**

```bash
npx tsx scripts/run-migration-0048-drop-category-attributes.ts
psql "$DATABASE_URL_DIRECT" -c "\dt category_attributes" 
# Expected: "Did not find any relation named …".
```

- [ ] **Step 5: Drop `categoryAttributes` from `src/lib/db/schema.ts`**

Remove the `export const categoryAttributes = pgTable(...)` block (lines 480-505). Remove the `CategoryAttribute` type export (around line 1330 if present). Run `npm run build` — fail loudly on any straggler import.

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0048_drop_category_attributes.sql \
        scripts/run-migration-0048-drop-category-attributes.ts \
        src/lib/db/schema.ts
git commit -m "feat(db): drop category_attributes table (migration 0048)"
```

---

### Task 17: Final acceptance checklist

- [ ] **Step 1: Run the full build + lint + test suite**

Run: `npm run build && npm run lint && npm test`
Expected: clean. Pre-existing failures listed in primer.md (`clr-import/route.test.ts`, `monthly-report chromium`) remain — no new failures.

- [ ] **Step 2: Walk through spec acceptance criteria**

Open `docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md` §Acceptance criteria. Tick each line:

1. [ ] `attributes` table exists with all spec'd columns; Drizzle in sync.
2. [ ] 972 rows backfilled with sc_label, bq_label, description, clr_label, alr_label (where seedable), sb_label (best-effort).
3. [ ] `category_meta` populated with no data loss vs prior `category_attributes` snapshot.
4. [ ] `category_attributes` dropped; `category_definitions` retained.
5. [ ] CLR upload (admin + onboarding) writes into `category_meta`; unmatched fields land in `clr_unmatched_fields`.
6. [ ] Attribute audit dashboard at `/attributes` shows same gap counts as pre-migration on same client (compare snapshot).
7. [ ] ALR import correctly maps known headers (regression: `npx vitest run src/lib/alr-parser.test.ts src/app/api/onboarding/alr-link/route.test.ts` is green).
8. [ ] `clr-attribute-aliases.ts` no longer exports `ALIASES`; lookup is data-driven.
9. [ ] `IsVP` row exists with `is_vp_flag = true`; `master.is_vp` populated; UI VP detection reads it.
10. [ ] Free-text override + JSON-array values for variation attributes on VP products. (NB: spec §Acceptance bullet 10 is about UI behavior — this plan stages the foundation; if you have not yet wired the free-text override in the product detail form, log it as a follow-up issue, since spec §Edge cases makes it a per-product runtime check rather than a DB change.)
11. [ ] `syncAttributes()` reads VC/SB/ALR/CLR.

- [ ] **Step 3: Update `primer.md` with the next-session pointer**

Replace primer.md's "Last session" block with a short summary of the unification, including: branch name, migration numbers (0047 + 0048), and any remaining acceptance items deferred to a follow-up PR.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat: attributes table unification (0047 + 0048)" --body "$(cat <<'EOF'
## Summary
- Renamed `column_attributes` → `attributes`; added SC/VC/SB/CLR/ALR label columns + `category_meta` JSONB + `is_vp_flag`.
- Added `clr_unmatched_fields` audit log and `master.is_vp` boolean.
- Refactored CLR alias bridge and ALR parser to be data-driven against `attributes`.
- Dropped `category_attributes` (migration 0048); `category_definitions` retained as upload audit.
- Added `parseVariationTheme` + `isVariationAttribute` helpers; UI VP detection now reads `master.is_vp`.

Spec: `docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md`
Plan: `docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md`

## Test plan
- [ ] `alr-parser.test.ts`, `clr-row-parser.test.ts`, `clr-attribute-aliases.test.ts`, `clr-master-mapper.test.ts`, `category-definitions/upsert.test.ts` green
- [ ] CLR upload in `/admin/attributes` produces a populated `category_meta` and any unmatched fields show up in `clr_unmatched_fields`
- [ ] `/attributes` audit dashboard renders with same gap totals as pre-migration on a known client
- [ ] VP badge still appears on a known Variety Pack product

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Commit any final tweaks then merge through `/ship`**

The user prefers `/ship` for this — invoke from a fresh session.

---

## Self-review checklist

- **Spec coverage:** Final schema (Task 1, 3) ✓; backfill of all label variants (Task 4) ✓; `category_meta` rollup (Task 5) ✓; IsVP row + `master.is_vp` (Task 6) ✓; data-driven CLR (Tasks 7, 8) ✓; data-driven ALR (Task 9) ✓; CLR upload retargeted (Task 10) ✓; `clr_unmatched_fields` (Task 1 + 10) ✓; `syncAttributes()` extension (Task 13) ✓; Variation theme parsing (Task 14) ✓; VP UI rewire (Task 15) ✓; drop `category_attributes` (Task 16) ✓; `category_definitions` retained (no drop in plan) ✓.
- **Spec gap surfaced:** Acceptance criterion 10 ("for any product where attribute is in parseVariationTheme(...) UI renders free-text + accepts JSON array when is_vp=true") is partially deferred to a follow-up — Task 14 lays the helper, Task 15 wires VP detection, but the per-attribute free-text override on the product detail form is not in this plan. Flagged in Task 17 step 2 bullet 10.
- **Placeholder scan:** No "TBD" / "implement later" / vague error handling. The Task 10 SQL has a flagged complexity (`isKey` preservation merge) with a fallback strategy noted.
- **Type consistency:** `attributes` table fields used identically across tasks. `Alias` type defined in Task 7, consumed in Task 8. `AlrFieldMap` defined in Task 9. `CategoryMetaEntry` defined in Task 3, used in Task 10. Function names match between tasks (`loadClrAliases`, `loadAlrFieldMap`, `parseVariationTheme`, `isVariationAttribute`, `aliasesFromRows`, `fieldMapFromRows`, `getAttributesForCategory`, `matchHubFieldsWithIds`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-attributes-table-unification-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
