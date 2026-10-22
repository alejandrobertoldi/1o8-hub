# Attribute Section Rethink — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four concrete attribute-section bugs — phantom categories from multi-category XLSM uploads, shared valid-values across categories, no catalog source-of-truth snapshot, and coarse Create-Sheet column control — by rewriting the parser, adding `catalog_listing_snapshots`, extending Attribute Audit with drift, and adding a per-attribute checklist to the Create-Sheet dialog.

**Architecture:** Parser becomes authoritative (product types come from Valid Values' `Product Type - [ ]` row, attributes deep-copied per category with per-category valid values, and a new `parseTemplateSnapshot` extracts ASIN-keyed Template-tab rows). Snapshots land in a new immutable table; Attribute Audit joins latest snapshot ↔ `bible_field_match` ↔ Master for drift counts; Create-Sheet dialog adds a per-attribute checklist superseding the levels-only filter.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM + `postgres` driver, XLSX parser (`xlsx` package already in deps), Vitest for unit tests, Tailwind + shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-04-21-attribute-section-rethink-design.md` (commit d0dc529)

---

## Ground rules

- **Dev server:** `PORT=3000 npm run dev` (webpack, not Turbopack — known PostCSS panic bug).
- **Migrations:** `drizzle-kit migrate` hangs on the Supabase pooler. Ship every migration as raw SQL under `drizzle/migrations/NNNN_*.sql` + a one-shot runner in `scripts/run-migration-NNNN.ts` that rewrites `:6543/` → `:5432/` (direct connection). Mirror the pattern of `scripts/run-migration-0041.ts`.
- **Schema file:** Always update `src/lib/db/schema.ts` so Drizzle types stay accurate. Do **not** run `npm run db:generate`.
- **Commits:** One per task unless a task's steps say otherwise. Use Conventional Commits prefixes (`feat`, `fix`, `refactor`, `test`, `chore`).
- **Testing:** Vitest. Parser tests build fixtures with `XLSX.utils.aoa_to_sheet` + `XLSX.write` — no binary XLSM files checked into the repo.

---

## File structure (after implementation)

### New files
| Path | Responsibility |
|------|----------------|
| `src/lib/category-report-parser.test.ts` | Multi-category fixtures, per-category valid values, snapshot extraction, fallback & throw paths |
| `src/app/api/catalog-snapshots/route.ts` | `GET` — list snapshots for a `(clientIdCode, productType)` |
| `src/app/api/catalog-snapshots/[id]/route.ts` | `DELETE` — remove one snapshot, 409 on baseline unless `?force=1` |
| `src/components/attributes/drift-drill.tsx` | Per-ASIN diff view for a category's drift tab |
| `src/components/attributes/snapshot-history.tsx` | Collapsible row inside each client card with list + baseline badge + delete |
| `src/components/attributes/attribute-picker.tsx` | Grouped collapsible checklist used inside the Create-Sheet dialog |
| `drizzle/migrations/0042_catalog_listing_snapshots.sql` | New table + indexes |
| `drizzle/migrations/0043_template_requests_included_ids.sql` | `ALTER TABLE attribute_template_requests ADD COLUMN included_attribute_ids jsonb` |
| `scripts/run-migration-0042.ts` | Direct-connection runner for 0042 |
| `scripts/run-migration-0043.ts` | Direct-connection runner for 0043 |
| `scripts/cleanup-phantom-categories.ts` | Dry-run tool for deleting phantom `category_definitions` rows |

### Modified files
| Path | Change |
|------|--------|
| `src/lib/category-report-parser.ts` | Authoritative product types; per-category valid values (deep copy); new `parseTemplateSnapshot`; new `ParseResult` return type; remove `UNKNOWN` fallback |
| `src/lib/db/schema.ts` | Add `catalogListingSnapshots` table + types; add `includedAttributeIds` column to `attributeTemplateRequests` |
| `src/app/api/category-definitions/route.ts` | Consume new `ParseResult`; insert snapshots in batches; set `is_onboarding_baseline` per `(client, productType)` when no prior rows exist |
| `src/app/api/attributes/audit/route.ts` | Add `includeDrift` support — join latest snapshot ↔ `bible_field_match` ↔ `master`; return `driftCount` per category and optional `driftRows` on drill-down |
| `src/app/api/attributes/template-requests/route.ts` | Accept `includedAttributeIds` in POST body; filter `buildTemplateSheets` by ids when present |
| `src/components/attributes/audit-dashboard.tsx` | Drift pill per category; new "Drift" drill-down tab; mount `<SnapshotHistory />` inside each client card |
| `src/components/attributes/template-dialog.tsx` | Mount `<AttributePicker />` below levels; track `includedAttributeIds`; show live `N columns × M products`; submit new field |
| `package.json` | Add `migrate-0042` and `migrate-0043` npm scripts |

---

## Phase breakdown

Each phase is independently shippable.

| Phase | Tasks | Unblocks |
|-------|-------|----------|
| **P1: Parser + Migrations** | 1–6 | Cloud23 ACCESSORY bug; unblocks clients waiting on correct multi-category parsing |
| **P2: Snapshot write path** | 7 | Every subsequent XLSM upload captures an immutable Template snapshot |
| **P3: Drift read + UI** | 8–12 | Attribute Audit dashboard surfaces drift + snapshot admin tools |
| **P4: Create-Sheet picker** | 13–14 | Admins untick individual columns before generating client Sheet |
| **P5: Cleanup script** | 15 | One-time removal of existing phantom category rows in prod |

Each phase is committable and mergeable on its own. After P1+P2 land, re-uploading Cloud23 already fixes the visible bug; P3 adds UX on top.

---

# Phase 1 — Parser + Migrations

## Task 1: Migration 0042 — `catalog_listing_snapshots` table

**Files:**
- Create: `drizzle/migrations/0042_catalog_listing_snapshots.sql`
- Create: `scripts/run-migration-0042.ts`
- Modify: `package.json`
- Modify: `src/lib/db/schema.ts` (append new table after `productKeyOverrides`, line ~530)

### - [ ] Step 1: Write the SQL migration

Create `drizzle/migrations/0042_catalog_listing_snapshots.sql`:

```sql
-- 0042: catalog_listing_snapshots
-- Immutable per-upload snapshot of the Amazon Category Listing Report "Template" tab.
-- Used for drift detection (snapshot vs Master) and onboarding case-study archive.

CREATE TABLE IF NOT EXISTS catalog_listing_snapshots (
  id                      serial PRIMARY KEY,
  client_id_code          varchar(100) NOT NULL,
  product_type            varchar(255) NOT NULL,
  marketplace_id          varchar(50)  NOT NULL DEFAULT 'ATVPDKIKX0DER',
  asin                    varchar(20)  NOT NULL,
  sku                     varchar(255),
  parentage               varchar(20),
  values                  jsonb        NOT NULL,
  source_definition_id    integer REFERENCES category_definitions(id) ON DELETE SET NULL,
  uploaded_at             timestamptz  NOT NULL DEFAULT now(),
  uploaded_by             varchar(255) NOT NULL,
  is_onboarding_baseline  boolean      NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_cls_client_pt
  ON catalog_listing_snapshots(client_id_code, product_type);
CREATE INDEX IF NOT EXISTS idx_cls_asin
  ON catalog_listing_snapshots(asin);
CREATE INDEX IF NOT EXISTS idx_cls_uploaded
  ON catalog_listing_snapshots(uploaded_at DESC);

-- RLS: deny anon + authenticated; service role bypasses
ALTER TABLE catalog_listing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_catalog_listing_snapshots"
  ON catalog_listing_snapshots FOR ALL TO anon USING (false);
CREATE POLICY "deny_auth_catalog_listing_snapshots"
  ON catalog_listing_snapshots FOR ALL TO authenticated USING (false);
```

### - [ ] Step 2: Write the runner script

Create `scripts/run-migration-0042.ts`:

```ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Use direct connection (port 5432) instead of pooler (6543) — DDL hangs on pgBouncer
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0042_catalog_listing_snapshots...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0042_catalog_listing_snapshots.sql"),
    "utf8"
  );
  await sql.unsafe(sqlText);

  console.log("  ✓ CREATE TABLE catalog_listing_snapshots");
  console.log("  ✓ CREATE INDEX idx_cls_client_pt, idx_cls_asin, idx_cls_uploaded");
  console.log("  ✓ ALTER TABLE ... ENABLE ROW LEVEL SECURITY + deny policies");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
```

### - [ ] Step 3: Add the npm script

Edit `package.json` `scripts` block — add one line after `"migrate-0041"`:

```json
"migrate-0042": "tsx scripts/run-migration-0042.ts",
```

### - [ ] Step 4: Run the migration

Run: `npm run migrate-0042`

Expected output:
```
Running migration 0042_catalog_listing_snapshots...
  ✓ CREATE TABLE catalog_listing_snapshots
  ✓ CREATE INDEX idx_cls_client_pt, idx_cls_asin, idx_cls_uploaded
  ✓ ALTER TABLE ... ENABLE ROW LEVEL SECURITY + deny policies

Migration complete!
```

### - [ ] Step 5: Update the Drizzle schema

Edit `src/lib/db/schema.ts`. After the `productKeyOverrides` table block (ends around line 530), insert the new table:

```ts
// ─── Catalog Listing Snapshots ──────────────────────────────────────
// Immutable snapshot of the Amazon Category Listing Report "Template" tab
// at upload time. Keyed by ASIN; captures values Amazon has for the client's
// catalog. Used for drift detection (vs Master) and onboarding history.

export const catalogListingSnapshots = pgTable(
  "catalog_listing_snapshots",
  {
    id: serial("id").primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productType: varchar("product_type", { length: 255 }).notNull(),
    marketplaceId: varchar("marketplace_id", { length: 50 })
      .notNull()
      .default("ATVPDKIKX0DER"),
    asin: varchar("asin", { length: 20 }).notNull(),
    sku: varchar("sku", { length: 255 }),
    parentage: varchar("parentage", { length: 20 }),
    values: jsonb("values")
      .$type<Record<string, string>>()
      .notNull(),
    sourceDefinitionId: integer("source_definition_id").references(
      () => categoryDefinitions.id,
      { onDelete: "set null" }
    ),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
    isOnboardingBaseline: boolean("is_onboarding_baseline")
      .notNull()
      .default(false),
  },
  (table) => [
    index("idx_cls_client_pt").on(table.clientIdCode, table.productType),
    index("idx_cls_asin").on(table.asin),
    index("idx_cls_uploaded").on(table.uploadedAt),
  ]
);
```

In the type exports section near line 1273 (after `NewAttributeTemplateRequest`), add:

```ts
export type CatalogListingSnapshot = typeof catalogListingSnapshots.$inferSelect;
export type NewCatalogListingSnapshot = typeof catalogListingSnapshots.$inferInsert;
```

### - [ ] Step 6: Verify typecheck

Run: `npx tsc --noEmit`

Expected: no errors introduced by the schema change.

### - [ ] Step 7: Commit

```bash
git add drizzle/migrations/0042_catalog_listing_snapshots.sql scripts/run-migration-0042.ts package.json src/lib/db/schema.ts
git commit -m "feat(attributes): add catalog_listing_snapshots table (migration 0042)"
```

---

## Task 2: Migration 0043 — `attribute_template_requests.included_attribute_ids`

**Files:**
- Create: `drizzle/migrations/0043_template_requests_included_ids.sql`
- Create: `scripts/run-migration-0043.ts`
- Modify: `package.json`
- Modify: `src/lib/db/schema.ts` (line ~535 — inside `attributeTemplateRequests`)

### - [ ] Step 1: Write the SQL migration

Create `drizzle/migrations/0043_template_requests_included_ids.sql`:

```sql
-- 0043: Add included_attribute_ids to attribute_template_requests.
-- When set (not null), supersedes `levels` as the column filter for Create-Sheet.
-- Keys are numeric category_attributes.id values.

ALTER TABLE attribute_template_requests
  ADD COLUMN IF NOT EXISTS included_attribute_ids jsonb;
```

### - [ ] Step 2: Write the runner script

Create `scripts/run-migration-0043.ts`:

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
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0043_template_requests_included_ids...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0043_template_requests_included_ids.sql"),
    "utf8"
  );
  await sql.unsafe(sqlText);

  console.log("  ✓ ALTER TABLE attribute_template_requests ADD COLUMN included_attribute_ids jsonb");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
```

### - [ ] Step 3: Add the npm script

Edit `package.json` `scripts` block — add after `"migrate-0042"`:

```json
"migrate-0043": "tsx scripts/run-migration-0043.ts",
```

### - [ ] Step 4: Run the migration

Run: `npm run migrate-0043`

Expected:
```
Running migration 0043_template_requests_included_ids...
  ✓ ALTER TABLE attribute_template_requests ADD COLUMN included_attribute_ids jsonb

Migration complete!
```

### - [ ] Step 5: Update the Drizzle schema

Edit `src/lib/db/schema.ts`. In the `attributeTemplateRequests` table (starts line ~535), add the new column inside the columns object — after `finalizedBy`:

```ts
    finalizedBy: text("finalized_by"),

    // Per-attribute column picker (0043). When set, supersedes `levels`
    // as the column filter for Create-Sheet.
    includedAttributeIds: jsonb("included_attribute_ids").$type<number[]>(),
```

### - [ ] Step 6: Verify typecheck

Run: `npx tsc --noEmit`

Expected: no errors.

### - [ ] Step 7: Commit

```bash
git add drizzle/migrations/0043_template_requests_included_ids.sql scripts/run-migration-0043.ts package.json src/lib/db/schema.ts
git commit -m "feat(attributes): add included_attribute_ids column (migration 0043)"
```

---

## Task 3: Parser — authoritative product types from `Product Type - [ ]` row

**Goal:** Stop treating Template-tab example rows as real product types. Use Valid Values' `Product Type - [ ]` row (empty brackets) as the authoritative list; fall back to `[ PRODUCT_TYPE ]` label scan; never return `UNKNOWN`.

**Files:**
- Create: `src/lib/category-report-parser.test.ts`
- Modify: `src/lib/category-report-parser.ts`

### - [ ] Step 1: Scaffold the test file with a fixture helper

Create `src/lib/category-report-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCategoryReport } from "./category-report-parser";

/**
 * Build an in-memory XLSM buffer from structured sheet data.
 * Shape mirrors real Amazon Category Listing Reports.
 */
interface FixtureOpts {
  /** Template sheet rows. Row index 4 = Amazon field names; 5+ = data rows. */
  templateRows?: unknown[][];
  /** Valid Values rows. Col B = "Label - [ PRODUCT_TYPE ]" or "Product Type - [ ]". */
  validValuesRows?: unknown[][];
  /** Data Definitions rows. Row 0/1 are headers; 2+ = data. */
  dataDefinitionsRows?: unknown[][];
}

function buildXlsmBuffer(opts: FixtureOpts): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(opts.dataDefinitionsRows ?? []),
    "Data Definitions"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(opts.validValuesRows ?? []),
    "Valid Values"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(opts.templateRows ?? []),
    "Template"
  );
  const buf = XLSX.write(wb, { bookType: "xlsm", type: "array" }) as ArrayBuffer;
  return buf;
}

/** Minimal Data Definitions with two attributes; no product-type context. */
const MINIMAL_DATA_DEFS: unknown[][] = [
  ["Category Listing Report", "", "", "", "", ""], // row 1 (header)
  ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"], // row 2
  ["Product Identity", "", "", "", "", ""], // group header
  ["", "item_name", "Product Name", "", "", "Required"],
  ["", "brand", "Brand", "", "", "Required"],
];

describe("parseCategoryReport — authoritative product types", () => {
  it("returns only product types listed in Valid Values 'Product Type - [ ]' row (ignores Template example rows)", () => {
    // Template tab has ACCESSORY as example data — must NOT be returned.
    const templateRows: unknown[][] = [
      [], // row 1
      [], // row 2
      [], // row 3
      ["Product Name", "Brand", "Product Type"], // row 4 — local labels
      ["item_name", "brand", "product_type"], // row 5 — field names
      ["Taco Sauce", "SauceCo", "SAUCE"], // row 6 — data
      ["Example Gadget", "AcmeCo", "ACCESSORY"], // row 7 — Amazon example leftover
    ];
    const validValuesRows: unknown[][] = [
      ["Valid Values", ""],
      ["", "Product Type - [ ]", "SAUCE", "COOKING_WINE"],
    ];
    const buf = buildXlsmBuffer({
      templateRows,
      validValuesRows,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    const result = parseCategoryReport(buf);
    const productTypes = result.reports.map((r) => r.productType).sort();

    expect(productTypes).toEqual(["COOKING_WINE", "SAUCE"]);
  });

  it("falls back to '[ PRODUCT_TYPE ]' label scan when no 'Product Type - [ ]' row exists", () => {
    const validValuesRows: unknown[][] = [
      ["Valid Values", ""],
      ["", "Color - [ SAUCE ]", "Red", "Blue"],
      ["", "Size - [ COOKING_WINE ]", "Small", "Large"],
    ];
    const buf = buildXlsmBuffer({
      validValuesRows,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    const result = parseCategoryReport(buf);
    const productTypes = result.reports.map((r) => r.productType).sort();

    expect(productTypes).toEqual(["COOKING_WINE", "SAUCE"]);
  });

  it("throws when no product types can be resolved (no UNKNOWN fallback)", () => {
    const validValuesRows: unknown[][] = [["Valid Values", ""]];
    const buf = buildXlsmBuffer({
      validValuesRows,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    expect(() => parseCategoryReport(buf)).toThrow(/product type/i);
  });
});
```

### - [ ] Step 2: Run the test to verify it fails

Run: `npx vitest run src/lib/category-report-parser.test.ts`

Expected: all three tests FAIL. The parser currently returns the `xlsx` package's `ParseResult` shape as an array, not an object with a `.reports` property. You'll see errors like `result.reports is undefined` and the `ACCESSORY` test will also fail because Strategy 1 scans the Template tab.

### - [ ] Step 3: Update the parser — new return shape + authoritative product types

Edit `src/lib/category-report-parser.ts`. Replace the entire file with:

```ts
/**
 * Parser for Amazon Category Listing Report XLSM files.
 *
 * Expected sheets:
 * - "Data Definitions": rows with group headers (col A only) and
 *   attribute rows (cols B–F: field name, local label, description, example, requirement)
 * - "Valid Values": rows where col B = "Label - [ PRODUCT_TYPE ]" and cols C+ = allowed values.
 *   The single "Product Type - [ ]" row (empty brackets) is the authoritative list
 *   of real product types — cols C+ list each one.
 * - "Template": row 5 (index 4) = Amazon API field names, rows 6+ (index 5+) = data rows.
 */

import * as XLSX from "xlsx";

export interface ParsedCategoryAttribute {
  amazonFieldName: string;
  localLabel: string;
  groupName: string;
  description: string;
  example: string;
  requirement: string; // "Required" | "Conditionally Required" | "Optional" | "Recommended"
  validValues: string[];
  sortOrder: number;
}

export interface ParsedCategoryReport {
  productType: string;
  marketplace: string;
  attributes: ParsedCategoryAttribute[];
  summary: {
    total: number;
    required: number;
    conditional: number;
    optional: number;
  };
}

export interface ParsedSnapshotRow {
  productType: string;
  asin: string;
  sku: string | null;
  parentage: string | null; // 'Parent' | 'Child' | null
  values: Record<string, string>; // amazonFieldName → value
}

export interface ParseResult {
  reports: ParsedCategoryReport[];
  snapshots: ParsedSnapshotRow[];
}

/**
 * Parse a Category Listing Report XLSM buffer into structured data.
 * Returns one report per authoritative product type + all snapshot rows from
 * the Template tab that belong to those product types.
 */
export function parseCategoryReport(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });

  const attributes = parseDataDefinitions(wb);
  const validValuesByType = parseValidValues(wb);
  const { productTypes, marketplace } = parseTemplate(wb, attributes);

  if (productTypes.length === 0) {
    throw new Error(
      "No product types could be resolved from the Valid Values sheet. " +
        "Expected a 'Product Type - [ ]' row or '[ PRODUCT_TYPE ]' label rows."
    );
  }

  // Build one report per product type with deep-copied attributes and
  // per-category valid values.
  const reports: ParsedCategoryReport[] = productTypes.map((pt) => {
    const vvForType = validValuesByType.get(pt) ?? new Map<string, string[]>();
    const perCategoryAttrs: ParsedCategoryAttribute[] = attributes.map((attr) => {
      const values = vvForType.get(attr.localLabel.toLowerCase()) ?? [];
      return { ...attr, validValues: values };
    });
    const summary = {
      total: perCategoryAttrs.length,
      required: perCategoryAttrs.filter((a) => a.requirement === "Required").length,
      conditional: perCategoryAttrs.filter(
        (a) => a.requirement === "Conditionally Required"
      ).length,
      optional: perCategoryAttrs.filter(
        (a) => a.requirement === "Optional" || a.requirement === "Recommended"
      ).length,
    };
    return { productType: pt, marketplace, attributes: perCategoryAttrs, summary };
  });

  const snapshots = parseTemplateSnapshot(wb, new Set(productTypes));

  return { reports, snapshots };
}

/**
 * Parse the "Data Definitions" sheet.
 * Row 1: header text. Row 2: column labels. Row 3+: data.
 * Group headers: col A has a value, col B is empty.
 * Attribute rows: col B has the amazon field name.
 */
function parseDataDefinitions(wb: XLSX.WorkBook): ParsedCategoryAttribute[] {
  const ws = wb.Sheets["Data Definitions"];
  if (!ws) throw new Error('Sheet "Data Definitions" not found');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const attributes: ParsedCategoryAttribute[] = [];
  let currentGroup = "";
  let sortOrder = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colA = cellStr(row[0]);
    const colB = cellStr(row[1]);

    if (colA && !colB) {
      currentGroup = colA.split(" - ")[0].trim();
      continue;
    }

    if (colB) {
      attributes.push({
        amazonFieldName: colB,
        localLabel: cellStr(row[2]) || colB,
        groupName: currentGroup,
        description: cellStr(row[3]),
        example: cellStr(row[4]),
        requirement: normalizeRequirement(cellStr(row[5])),
        validValues: [],
        sortOrder: sortOrder++,
      });
    }
  }

  return attributes;
}

/**
 * Parse the "Valid Values" sheet.
 * Value rows: col B = "Local Label - [ PRODUCT_TYPE ]", cols C+ = allowed values.
 * Returns Map<productType, Map<lowercase(localLabel), string[]>>.
 *
 * Rows with col B = "Product Type - [ ]" (empty brackets) are metadata —
 * handled separately in parseTemplate.
 */
function parseValidValues(
  wb: XLSX.WorkBook
): Map<string, Map<string, string[]>> {
  const ws = wb.Sheets["Valid Values"];
  const result = new Map<string, Map<string, string[]>>();
  if (!ws) return result;

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  for (const row of rows) {
    if (!row) continue;
    const colB = cellStr(row[1]);
    if (!colB) continue;

    // "Local Label - [ PRODUCT_TYPE ]" → label + productType
    const match = colB.match(/^(.+?)\s*-\s*\[\s*([A-Z0-9_]*)\s*\]\s*$/);
    if (!match) continue;

    const label = match[1].trim();
    const productType = match[2].trim();

    // Skip the "Product Type - [ ]" metadata row (empty bracket content)
    if (!productType) continue;

    const values: string[] = [];
    for (let c = 2; c < row.length; c++) {
      const v = cellStr(row[c]);
      if (v) values.push(v);
    }
    if (values.length === 0) continue;

    if (!result.has(productType)) result.set(productType, new Map());
    result.get(productType)!.set(label.toLowerCase(), values);
  }

  return result;
}

/**
 * Parse the "Template" sheet to extract product types and marketplace.
 *
 * Authoritative strategy (primary): scan "Valid Values" for a row where col B
 * is exactly "Product Type - [ ]" (empty brackets). Cols C+ = real product types.
 *
 * Fallback strategy: scan "Valid Values" for "[ PRODUCT_TYPE ]" label rows
 * and collect every bracketed product type across all rows.
 *
 * Never falls back to scanning Template-tab data rows — those contain
 * Amazon's example rows with non-client product types.
 */
function parseTemplate(
  wb: XLSX.WorkBook,
  attributes: ParsedCategoryAttribute[]
): { productTypes: string[]; marketplace: string } {
  let marketplace = "ATVPDKIKX0DER"; // US default
  const productTypeSet = new Set<string>();

  // Marketplace — look for marketplace_id= in any attribute field name
  for (const attr of attributes) {
    const mpMatch = attr.amazonFieldName.match(/marketplace_id=([A-Z0-9]+)/);
    if (mpMatch) {
      marketplace = mpMatch[1];
      break;
    }
  }

  const vvSheet = wb.Sheets["Valid Values"];
  if (!vvSheet) return { productTypes: [], marketplace };

  const vvRows: unknown[][] = XLSX.utils.sheet_to_json(vvSheet, { header: 1 });

  // Strategy 1 (authoritative): "Product Type - [ ]" row
  for (const row of vvRows) {
    if (!row) continue;
    const colB = cellStr(row[1]);
    if (!colB) continue;
    // Match exactly "Product Type - [ ]" with empty brackets
    if (!/^Product\s+Type\s*-\s*\[\s*\]\s*$/i.test(colB)) continue;
    for (let c = 2; c < row.length; c++) {
      const v = cellStr(row[c]);
      if (v) productTypeSet.add(v.toUpperCase());
    }
    if (productTypeSet.size > 0) break;
  }

  // Strategy 2 (fallback): "[ PRODUCT_TYPE ]" labels across all rows
  if (productTypeSet.size === 0) {
    for (const row of vvRows) {
      if (!row) continue;
      const colB = cellStr(row[1]);
      if (!colB) continue;
      const ptMatch = colB.match(/\[\s*([A-Z0-9_]+)\s*\]/);
      if (ptMatch && ptMatch[1].trim()) {
        productTypeSet.add(ptMatch[1].trim().toUpperCase());
      }
    }
  }

  return { productTypes: [...productTypeSet], marketplace };
}

/**
 * Parse the "Template" sheet data rows into ParsedSnapshotRow[].
 * Row 5 (index 4) = Amazon field names; rows 6+ (index 5+) = data rows.
 * Skips rows whose product_type isn't in `authoritativeTypes` — those are
 * Amazon's example rows.
 */
function parseTemplateSnapshot(
  wb: XLSX.WorkBook,
  authoritativeTypes: Set<string>
): ParsedSnapshotRow[] {
  const tmpl = wb.Sheets["Template"];
  if (!tmpl) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(tmpl, { header: 1 });
  // Row 5 (index 4) holds Amazon field names
  const fieldNameRow = rows[4];
  if (!fieldNameRow) return [];

  const fieldNames = fieldNameRow.map((c) => cellStr(c));
  const colByField = (name: string): number =>
    fieldNames.findIndex((f) => f.toLowerCase() === name.toLowerCase());

  const asinCol = colByField("asin");
  const skuCol = colByField("item_sku") >= 0 ? colByField("item_sku") : colByField("sku");
  const parentageCol =
    colByField("parent_child") >= 0
      ? colByField("parent_child")
      : colByField("parentage_level");
  const productTypeCol =
    colByField("product_type") >= 0 ? colByField("product_type") : colByField("feed_product_type");

  if (productTypeCol < 0 || asinCol < 0) return [];

  const snapshots: ParsedSnapshotRow[] = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawPt = cellStr(row[productTypeCol]);
    if (!rawPt) continue;
    const pt = rawPt.toUpperCase();
    if (!authoritativeTypes.has(pt)) continue;

    const asin = cellStr(row[asinCol]);
    if (!asin) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < fieldNames.length; c++) {
      const field = fieldNames[c];
      if (!field) continue;
      const v = cellStr(row[c]);
      if (v) values[field] = v;
    }

    snapshots.push({
      productType: pt,
      asin,
      sku: skuCol >= 0 ? cellStr(row[skuCol]) || null : null,
      parentage: parentageCol >= 0 ? cellStr(row[parentageCol]) || null : null,
      values,
    });
  }

  return snapshots;
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizeRequirement(raw: string): string {
  if (!raw) return "Optional";
  const lower = raw.toLowerCase();
  if (lower === "required") return "Required";
  if (lower.includes("conditional")) return "Conditionally Required";
  if (lower === "recommended") return "Recommended";
  return "Optional";
}
```

### - [ ] Step 4: Run the test to verify it passes

Run: `npx vitest run src/lib/category-report-parser.test.ts`

Expected: all 3 tests PASS.

### - [ ] Step 5: Run typecheck — caller will temporarily break

Run: `npx tsc --noEmit`

Expected: one error in `src/app/api/category-definitions/route.ts` (line ~68): `Property 'length' does not exist on type 'ParseResult'` or similar. This is addressed in Task 6 — **do not fix it now**.

### - [ ] Step 6: Commit (parser + test only)

```bash
git add src/lib/category-report-parser.ts src/lib/category-report-parser.test.ts
git commit -m "refactor(parser): authoritative product types + ParseResult return shape"
```

---

## Task 4: Parser — per-category valid values (test only; parser already handles it)

**Goal:** Lock in the per-category valid-values behavior with a dedicated test that fails before Task 3 and passes after. Since Task 3 already implemented the deep-copy in `parseCategoryReport`, this task **adds the regression test** so a future refactor can't silently collapse valid values again.

**Files:**
- Modify: `src/lib/category-report-parser.test.ts`

### - [ ] Step 1: Add the failing-case test first (it will actually pass — verify the test is meaningful)

Append to `src/lib/category-report-parser.test.ts`:

```ts
describe("parseCategoryReport — per-category valid values", () => {
  it("gives each report its own copy of validValues for shared attributes", () => {
    // Same attribute ("Variation Theme Name") has different allowed values for
    // SAUCE vs COOKING_WINE. Parser must NOT collapse them into one list.
    const dataDefs: unknown[][] = [
      ["Category Listing Report", "", "", "", "", ""],
      ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
      ["Variation", "", "", "", "", ""],
      ["", "variation_theme", "Variation Theme Name", "", "", "Required"],
    ];
    const validValuesRows: unknown[][] = [
      ["Valid Values", ""],
      ["", "Product Type - [ ]", "SAUCE", "COOKING_WINE"],
      ["", "Variation Theme Name - [ SAUCE ]", "FLAVOR", "SIZE"],
      ["", "Variation Theme Name - [ COOKING_WINE ]", "COLOR_NAME", "VINTAGE"],
    ];
    const buf = buildXlsmBuffer({
      validValuesRows,
      dataDefinitionsRows: dataDefs,
    });

    const result = parseCategoryReport(buf);
    const sauce = result.reports.find((r) => r.productType === "SAUCE")!;
    const wine = result.reports.find((r) => r.productType === "COOKING_WINE")!;

    expect(sauce.attributes[0].validValues).toEqual(["FLAVOR", "SIZE"]);
    expect(wine.attributes[0].validValues).toEqual(["COLOR_NAME", "VINTAGE"]);

    // And the arrays must be independent objects (deep copy, not shared ref)
    sauce.attributes[0].validValues.push("MUTATED");
    expect(wine.attributes[0].validValues).toEqual(["COLOR_NAME", "VINTAGE"]);
  });

  it("returns an empty validValues array when a category has no entry for an attribute", () => {
    const dataDefs: unknown[][] = [
      ["Category Listing Report", "", "", "", "", ""],
      ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
      ["Core", "", "", "", "", ""],
      ["", "color", "Color", "", "", "Optional"],
    ];
    const validValuesRows: unknown[][] = [
      ["Valid Values", ""],
      ["", "Product Type - [ ]", "SAUCE", "COOKING_WINE"],
      ["", "Color - [ SAUCE ]", "Red", "Brown"],
      // No entry for COOKING_WINE → wine.color.validValues === []
    ];
    const buf = buildXlsmBuffer({
      validValuesRows,
      dataDefinitionsRows: dataDefs,
    });

    const result = parseCategoryReport(buf);
    const wine = result.reports.find((r) => r.productType === "COOKING_WINE")!;
    expect(wine.attributes[0].validValues).toEqual([]);
  });
});
```

### - [ ] Step 2: Run the tests

Run: `npx vitest run src/lib/category-report-parser.test.ts`

Expected: both new tests PASS (the parser from Task 3 already implements this correctly).

**Verify the tests are meaningful** — temporarily revert `parseCategoryReport` in `category-report-parser.ts` to share a single `attributes` array across all reports (delete the `perCategoryAttrs = attributes.map(...)` block and use `attributes` directly for every product type). Re-run the tests. Both new tests must FAIL. Then restore the Task 3 implementation and verify tests PASS again. This step confirms the tests actually catch the regression.

### - [ ] Step 3: Commit

```bash
git add src/lib/category-report-parser.test.ts
git commit -m "test(parser): lock in per-category valid values behavior"
```

---

## Task 5: Parser — `parseTemplateSnapshot` regression tests

**Goal:** Lock in `ParsedSnapshotRow` extraction: correct `productType` filtering, ASIN keying, field-name values, and Amazon-example-row rejection.

**Files:**
- Modify: `src/lib/category-report-parser.test.ts`

### - [ ] Step 1: Add the snapshot extraction tests

Append to `src/lib/category-report-parser.test.ts`:

```ts
describe("parseCategoryReport — parseTemplateSnapshot", () => {
  const MULTI_PT_VALID_VALUES: unknown[][] = [
    ["Valid Values", ""],
    ["", "Product Type - [ ]", "SAUCE", "COOKING_WINE"],
  ];

  it("emits one ParsedSnapshotRow per authoritative data row, with Amazon-field-keyed values", () => {
    const templateRows: unknown[][] = [
      [], // row 1
      [], // row 2
      [], // row 3
      ["Product Name", "Brand", "ASIN", "Item SKU", "Parent/Child", "Product Type"], // row 4 — labels
      ["item_name", "brand", "asin", "item_sku", "parent_child", "product_type"], // row 5 — field names
      ["Hot Sauce", "SauceCo", "B001TACO", "SKU-001", "Parent", "SAUCE"], // row 6
      ["Red Wine", "WineCo", "B002WINE", "SKU-002", "Child", "COOKING_WINE"], // row 7
      ["Example Widget", "AcmeCo", "B999DEMO", "SKU-999", "Parent", "ACCESSORY"], // row 8 — example
    ];
    const buf = buildXlsmBuffer({
      templateRows,
      validValuesRows: MULTI_PT_VALID_VALUES,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    const { snapshots } = parseCategoryReport(buf);
    expect(snapshots).toHaveLength(2);

    const taco = snapshots.find((s) => s.asin === "B001TACO")!;
    expect(taco.productType).toBe("SAUCE");
    expect(taco.sku).toBe("SKU-001");
    expect(taco.parentage).toBe("Parent");
    expect(taco.values.item_name).toBe("Hot Sauce");
    expect(taco.values.brand).toBe("SauceCo");
    expect(taco.values.product_type).toBe("SAUCE");

    const wine = snapshots.find((s) => s.asin === "B002WINE")!;
    expect(wine.productType).toBe("COOKING_WINE");
    expect(wine.parentage).toBe("Child");

    // ACCESSORY row must NOT appear
    expect(snapshots.find((s) => s.productType === "ACCESSORY")).toBeUndefined();
  });

  it("skips rows missing ASIN", () => {
    const templateRows: unknown[][] = [
      [],
      [],
      [],
      ["ASIN", "Product Type"],
      ["asin", "product_type"],
      ["", "SAUCE"], // missing ASIN
      ["B001", "SAUCE"],
    ];
    const buf = buildXlsmBuffer({
      templateRows,
      validValuesRows: MULTI_PT_VALID_VALUES,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    const { snapshots } = parseCategoryReport(buf);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].asin).toBe("B001");
  });

  it("returns empty snapshots array when Template tab is missing product_type column", () => {
    const templateRows: unknown[][] = [
      [],
      [],
      [],
      ["ASIN"],
      ["asin"],
      ["B001"],
    ];
    const buf = buildXlsmBuffer({
      templateRows,
      validValuesRows: MULTI_PT_VALID_VALUES,
      dataDefinitionsRows: MINIMAL_DATA_DEFS,
    });

    const { snapshots } = parseCategoryReport(buf);
    expect(snapshots).toEqual([]);
  });
});
```

### - [ ] Step 2: Run the tests

Run: `npx vitest run src/lib/category-report-parser.test.ts`

Expected: all tests (including from Tasks 3, 4) PASS.

### - [ ] Step 3: Commit

```bash
git add src/lib/category-report-parser.test.ts
git commit -m "test(parser): lock in parseTemplateSnapshot extraction"
```

---

## Task 6: Rewrite caller — `POST /api/category-definitions` consumes `ParseResult`

**Goal:** Adapt the one call site to the new parser signature; insert `catalog_listing_snapshots` rows in batches; set `is_onboarding_baseline = true` for the first batch per `(client_id_code, product_type)`.

**Files:**
- Modify: `src/app/api/category-definitions/route.ts`

### - [ ] Step 1: Add a snapshot-batch smoke test

Create `src/app/api/category-definitions/route.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// Unit test for the pure helper that decides baseline flag per (client, productType).
// The helper is exported from the route file (Step 3) for testability.
import { shouldBeBaseline } from "./route";

describe("shouldBeBaseline", () => {
  it("returns true when no prior snapshots exist for the pair", () => {
    const existing = new Set<string>();
    expect(shouldBeBaseline(existing, "ACME", "SAUCE")).toBe(true);
  });

  it("returns false when any prior snapshot exists for the pair", () => {
    const existing = new Set<string>(["ACME::SAUCE"]);
    expect(shouldBeBaseline(existing, "ACME", "SAUCE")).toBe(false);
  });

  it("treats different product types under same client as independent", () => {
    const existing = new Set<string>(["ACME::SAUCE"]);
    expect(shouldBeBaseline(existing, "ACME", "COOKING_WINE")).toBe(true);
  });
});
```

### - [ ] Step 2: Run the test to verify it fails

Run: `npx vitest run src/app/api/category-definitions/route.test.ts`

Expected: FAIL — `shouldBeBaseline` is not exported yet.

### - [ ] Step 3: Rewrite `route.ts`

Replace the contents of `src/app/api/category-definitions/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  categoryAttributes,
  catalogListingSnapshots,
  columnAttributes,
  master,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import {
  parseCategoryReport,
  type ParsedSnapshotRow,
} from "@/lib/category-report-parser";
import { matchHubFields } from "@/lib/category-attribute-matcher";

/** Pure helper — true iff no prior snapshot exists for (client, productType). */
export function shouldBeBaseline(
  existingPairs: Set<string>,
  clientIdCode: string,
  productType: string
): boolean {
  return !existingPairs.has(`${clientIdCode}::${productType}`);
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");

  const query = clientIdCode
    ? db
        .select()
        .from(categoryDefinitions)
        .where(eq(categoryDefinitions.clientIdCode, clientIdCode))
        .orderBy(categoryDefinitions.productType)
    : db
        .select()
        .from(categoryDefinitions)
        .orderBy(categoryDefinitions.clientIdCode, categoryDefinitions.productType);

  const definitions = await query;
  return NextResponse.json({ definitions });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "editor" && session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: editors or admins only" },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientIdCode = formData.get("clientIdCode") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 }
    );
  }

  let parsed: Awaited<ReturnType<typeof parseCategoryReport>>;
  try {
    const buffer = await file.arrayBuffer();
    parsed = parseCategoryReport(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to parse report: ${msg}` },
      { status: 400 }
    );
  }

  if (parsed.reports.length === 0) {
    return NextResponse.json(
      { error: "No product types found in report" },
      { status: 400 }
    );
  }

  const firstReport = parsed.reports[0];

  // Hub column matches (shared — attribute metadata is identical across reports)
  const allColumns = await db.select().from(columnAttributes);
  const matches = matchHubFields(firstReport.attributes, allColumns);
  const matchCount = matches.size;

  // Master baseline snapshot (Master-at-upload, stored on category_definitions)
  const matchedBqNames = [...new Set(matches.values())];
  const clientProducts = await db
    .select()
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  const baselineSnapshot: Record<string, Record<string, string | null>> = {};
  for (const product of clientProducts) {
    const values: Record<string, string | null> = {};
    for (const bqName of matchedBqNames) {
      values[bqName] = getProductFieldValue(product, bqName) ?? null;
    }
    baselineSnapshot[product.id] = values;
  }

  // Pre-compute which (client, productType) pairs already have prior snapshot rows
  const productTypesInUpload = parsed.reports.map((r) => r.productType);
  const priorPairRows =
    productTypesInUpload.length > 0
      ? await db
          .select({
            productType: catalogListingSnapshots.productType,
          })
          .from(catalogListingSnapshots)
          .where(
            and(
              eq(catalogListingSnapshots.clientIdCode, clientIdCode),
              inArray(
                catalogListingSnapshots.productType,
                productTypesInUpload
              )
            )
          )
      : [];
  const existingPairs = new Set(
    priorPairRows.map((r) => `${clientIdCode}::${r.productType}`)
  );

  // Insert one category_definitions + its category_attributes per report
  const createdDefs: { id: number; productType: string }[] = [];
  const definitionIdByType = new Map<string, number>();

  for (const report of parsed.reports) {
    const existing = await db
      .select({ id: categoryDefinitions.id })
      .from(categoryDefinitions)
      .where(
        and(
          eq(categoryDefinitions.clientIdCode, clientIdCode),
          eq(categoryDefinitions.productType, report.productType),
          eq(categoryDefinitions.marketplaceId, report.marketplace)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(categoryDefinitions)
        .where(eq(categoryDefinitions.id, existing[0].id));
    }

    const [newDef] = await db
      .insert(categoryDefinitions)
      .values({
        clientIdCode,
        productType: report.productType,
        marketplaceId: report.marketplace,
        totalAttributes: report.summary.total,
        requiredCount: report.summary.required,
        conditionalCount: report.summary.conditional,
        optionalCount: report.summary.optional,
        uploadedBy: session.user.email ?? "unknown",
        baselineSnapshot:
          Object.keys(baselineSnapshot).length > 0 ? baselineSnapshot : null,
      })
      .returning();

    if (report.attributes.length > 0) {
      const attrValues = report.attributes.map((attr) => ({
        definitionId: newDef.id,
        amazonFieldName: attr.amazonFieldName,
        localLabel: attr.localLabel,
        groupName: attr.groupName,
        description: attr.description || null,
        example: attr.example || null,
        requirement: attr.requirement,
        validValues: attr.validValues.length > 0 ? attr.validValues : null,
        bibleFieldMatch: matches.get(attr.amazonFieldName) ?? null,
        sortOrder: attr.sortOrder,
      }));
      for (let i = 0; i < attrValues.length; i += 100) {
        await db.insert(categoryAttributes).values(attrValues.slice(i, i + 100));
      }
    }

    createdDefs.push({ id: newDef.id, productType: report.productType });
    definitionIdByType.set(report.productType, newDef.id);
  }

  // Insert catalog_listing_snapshots in batches of 100.
  // is_onboarding_baseline = true iff no prior rows existed for this (client, productType) pair.
  const snapshotInserts = parsed.snapshots.map((s: ParsedSnapshotRow) => ({
    clientIdCode,
    productType: s.productType,
    marketplaceId: firstReport.marketplace,
    asin: s.asin,
    sku: s.sku,
    parentage: s.parentage,
    values: s.values,
    sourceDefinitionId: definitionIdByType.get(s.productType) ?? null,
    uploadedBy: session.user.email ?? "unknown",
    isOnboardingBaseline: shouldBeBaseline(
      existingPairs,
      clientIdCode,
      s.productType
    ),
  }));
  for (let i = 0; i < snapshotInserts.length; i += 100) {
    await db
      .insert(catalogListingSnapshots)
      .values(snapshotInserts.slice(i, i + 100));
  }

  return NextResponse.json({
    definitions: createdDefs,
    productTypes: parsed.reports.map((r) => r.productType),
    summary: firstReport.summary,
    marketplace: firstReport.marketplace,
    matchCount,
    snapshotCount: snapshotInserts.length,
  });
}
```

### - [ ] Step 4: Run the helper test to verify it passes

Run: `npx vitest run src/app/api/category-definitions/route.test.ts`

Expected: all 3 tests PASS.

### - [ ] Step 5: Run typecheck

Run: `npx tsc --noEmit`

Expected: no errors.

### - [ ] Step 6: Manual QA — re-upload a multi-category XLSM against the dev DB

1. Start dev: `PORT=3000 npm run dev`
2. Navigate to `/admin/attributes` and upload the Cloud23 XLSM (or any multi-category file) for a test client.
3. Verify response JSON includes `snapshotCount > 0` and `productTypes` does NOT include `ACCESSORY`.
4. In `db:studio` (or `psql`), verify:
   - `SELECT DISTINCT product_type FROM category_definitions WHERE client_id_code = 'CLOUD23';` lists only real types.
   - `SELECT COUNT(*), is_onboarding_baseline FROM catalog_listing_snapshots WHERE client_id_code = 'CLOUD23' GROUP BY is_onboarding_baseline;` shows rows inserted; first upload should be all `true`.
   - Re-uploading the same file produces another batch where `is_onboarding_baseline = false`.

### - [ ] Step 7: Commit

```bash
git add src/app/api/category-definitions/route.ts src/app/api/category-definitions/route.test.ts
git commit -m "feat(category-definitions): consume ParseResult; write catalog_listing_snapshots"
```

**🎉 Phase 1 complete. Cloud23 ACCESSORY bug is fixed; per-category valid values work; every future upload captures a Template snapshot.**

---

# Phase 2 — Snapshot write path (integration test)

Phase 1 already wired snapshot writes into the upload route. Phase 2 adds an end-to-end integration test so we catch regressions before they reach a client upload.

## Task 7: Integration test — multi-category upload creates snapshots + no phantom categories

**Files:**
- Modify: `src/app/api/category-definitions/route.test.ts`

### - [ ] Step 1: Add a mocked-DB integration test

Append to `src/app/api/category-definitions/route.test.ts`:

```ts
import { vi } from "vitest";
import * as XLSX from "xlsx";

// Mock modules used by POST. We test the parse-and-shape side of the route
// without hitting the real database — a focused integration test that verifies
// what the route sends to `db.insert(catalogListingSnapshots)`.
vi.mock("@/lib/auth-db", () => ({
  getAuthSession: () => ({
    user: { email: "test@example.com", role: "editor" },
  }),
}));

const fromSelectResult = {
  where: () => ({
    orderBy: () => [],
    limit: () => [],
  }),
};
const insertedSnapshots: unknown[] = [];
const insertedDefs: unknown[] = [];
const insertedAttrs: unknown[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => [],
          limit: () => [],
        }),
        orderBy: () => [],
      }),
    }),
    delete: () => ({ where: async () => undefined }),
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        const name = (table as { _?: { name?: string } })?._?.name ?? "";
        const rows = Array.isArray(vals) ? vals : [vals];
        if (name === "catalog_listing_snapshots") insertedSnapshots.push(...rows);
        else if (name === "category_definitions") insertedDefs.push(...rows);
        else if (name === "category_attributes") insertedAttrs.push(...rows);
        return {
          returning: async () => [{ id: 1 + insertedDefs.length }],
        };
      },
    }),
  },
}));

vi.mock("@/lib/category-attribute-matcher", () => ({
  matchHubFields: () => new Map<string, string>(),
}));

import { POST } from "./route";

function buildMultiCategoryXlsm(): Blob {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Category Listing Report"],
      ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
      ["Core", "", "", "", "", ""],
      ["", "item_name", "Product Name", "", "", "Required"],
    ]),
    "Data Definitions"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Valid Values", ""],
      ["", "Product Type - [ ]", "SAUCE", "COOKING_WINE"],
    ]),
    "Valid Values"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [],
      [],
      [],
      ["Product Name", "ASIN", "Product Type"],
      ["item_name", "asin", "product_type"],
      ["Hot Sauce", "B001TACO", "SAUCE"],
      ["Red Wine", "B002WINE", "COOKING_WINE"],
      ["Example Widget", "B999DEMO", "ACCESSORY"], // must be filtered out
    ]),
    "Template"
  );

  const buf = XLSX.write(wb, { bookType: "xlsm", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.ms-excel.sheet.macroEnabled.12",
  });
}

describe("POST /api/category-definitions — multi-category upload", () => {
  it("creates one definition per real product type, skips ACCESSORY, writes snapshots", async () => {
    insertedSnapshots.length = 0;
    insertedDefs.length = 0;

    const form = new FormData();
    form.append("file", buildMultiCategoryXlsm(), "cloud23.xlsm");
    form.append("clientIdCode", "CLOUD23");
    const req = new Request("http://test/api/category-definitions", {
      method: "POST",
      body: form,
    });

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.productTypes).toEqual(
      expect.arrayContaining(["SAUCE", "COOKING_WINE"])
    );
    expect(data.productTypes).not.toContain("ACCESSORY");

    // Two real product types → two definitions; ACCESSORY row absent
    expect(insertedDefs).toHaveLength(2);

    // Two real ASINs → two snapshot rows; example row filtered
    expect(insertedSnapshots).toHaveLength(2);
    const byAsin = Object.fromEntries(
      (insertedSnapshots as Array<{ asin: string; productType: string; isOnboardingBaseline: boolean }>).map((s) => [
        s.asin,
        s,
      ])
    );
    expect(byAsin["B001TACO"].productType).toBe("SAUCE");
    expect(byAsin["B002WINE"].productType).toBe("COOKING_WINE");
    expect(byAsin["B999DEMO"]).toBeUndefined();

    // First upload for this client → baseline flag true
    expect(byAsin["B001TACO"].isOnboardingBaseline).toBe(true);
  });
});
```

### - [ ] Step 2: Run the test

Run: `npx vitest run src/app/api/category-definitions/route.test.ts`

Expected: PASS. If the `_.name` trick doesn't work with the Drizzle table object in your version, inspect with `console.log(table)` and adjust the discriminator (e.g. by reference equality on the imported `catalogListingSnapshots` value).

### - [ ] Step 3: Commit

```bash
git add src/app/api/category-definitions/route.test.ts
git commit -m "test(category-definitions): integration test for snapshot write path"
```

**🎉 Phase 2 complete. Re-uploading any XLSM captures a snapshot; next phase exposes it in the UI.**

---

# Phase 3 — Drift read + UI

## Task 8: `GET /api/attributes/audit?includeDrift=true`

**Goal:** Return a `driftCount` per category when `includeDrift=true`, plus per-ASIN `driftRows` when `includeProducts=true`. Drift = ASINs where the latest snapshot row has a value in any `bible_field_match`-mapped field that disagrees with Master.

**Files:**
- Modify: `src/app/api/attributes/audit/route.ts`

### - [ ] Step 1: Add a failing unit test for the pure drift comparator

Create `src/lib/attribute-drift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDriftForAsin, type BibleFieldMapping } from "./attribute-drift";

const mappings: BibleFieldMapping[] = [
  { amazonFieldName: "item_name", bibleFieldMatch: "ItemName" },
  { amazonFieldName: "brand", bibleFieldMatch: "BrandName" },
];

describe("computeDriftForAsin", () => {
  it("returns empty when snapshot matches master on every mapped field", () => {
    const diffs = computeDriftForAsin(
      { item_name: "Hot Sauce", brand: "SauceCo" },
      { ItemName: "Hot Sauce", BrandName: "SauceCo" },
      mappings
    );
    expect(diffs).toEqual([]);
  });

  it("returns diffs on every mapped field that differs (case-sensitive, trim-insensitive)", () => {
    const diffs = computeDriftForAsin(
      { item_name: "Hot Sauce ", brand: "SauceCo" }, // trailing space OK
      { ItemName: "Hot Sauce", BrandName: "SauceCoooo" },
      mappings
    );
    expect(diffs).toEqual([
      { amazonFieldName: "brand", bibleFieldMatch: "BrandName", snapshotValue: "SauceCo", masterValue: "SauceCoooo" },
    ]);
  });

  it("skips fields where the snapshot has no value", () => {
    const diffs = computeDriftForAsin(
      { item_name: "" },
      { ItemName: "Hot Sauce", BrandName: "SauceCo" },
      mappings
    );
    expect(diffs).toEqual([]);
  });

  it("treats null master as a diff when snapshot has a value", () => {
    const diffs = computeDriftForAsin(
      { item_name: "Hot Sauce" },
      { ItemName: null },
      mappings
    );
    expect(diffs).toEqual([
      { amazonFieldName: "item_name", bibleFieldMatch: "ItemName", snapshotValue: "Hot Sauce", masterValue: null },
    ]);
  });
});
```

### - [ ] Step 2: Run — verify failure

Run: `npx vitest run src/lib/attribute-drift.test.ts`

Expected: FAIL — file `src/lib/attribute-drift.ts` doesn't exist.

### - [ ] Step 3: Implement the comparator

Create `src/lib/attribute-drift.ts`:

```ts
export interface BibleFieldMapping {
  amazonFieldName: string;
  bibleFieldMatch: string;
}

export interface DriftDiff {
  amazonFieldName: string;
  bibleFieldMatch: string;
  snapshotValue: string;
  masterValue: string | null;
}

/** Pure: compare a snapshot's values against the master record for one ASIN. */
export function computeDriftForAsin(
  snapshotValues: Record<string, string>,
  masterValues: Record<string, string | null>,
  mappings: BibleFieldMapping[]
): DriftDiff[] {
  const diffs: DriftDiff[] = [];
  for (const m of mappings) {
    const raw = snapshotValues[m.amazonFieldName];
    if (raw === undefined) continue;
    const snap = raw.trim();
    if (snap === "") continue;
    const masterRaw = masterValues[m.bibleFieldMatch];
    const master = masterRaw == null ? null : String(masterRaw).trim();
    if (master === snap) continue;
    diffs.push({
      amazonFieldName: m.amazonFieldName,
      bibleFieldMatch: m.bibleFieldMatch,
      snapshotValue: snap,
      masterValue: master,
    });
  }
  return diffs;
}
```

### - [ ] Step 4: Run — verify all drift unit tests pass

Run: `npx vitest run src/lib/attribute-drift.test.ts`

Expected: all 4 tests PASS.

### - [ ] Step 5: Wire drift into the audit endpoint

Edit `src/app/api/attributes/audit/route.ts`. Insert the new imports at the top (merging with existing):

```ts
import { catalogListingSnapshots } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { computeDriftForAsin, type BibleFieldMapping, type DriftDiff } from "@/lib/attribute-drift";
```

> **Note:** existing imports already include `eq, and, inArray, or` from `drizzle-orm` — merge the new `desc` import into the existing line rather than adding a duplicate.

Extend the interfaces near the top of the file:

```ts
interface DriftRow {
  asin: string;
  diffs: DriftDiff[];
}

interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  driftCount?: number;
  driftRows?: DriftRow[];
  products?: ProductAudit[];
}
```

Inside `GET`, after the existing `includeProducts` parse, add:

```ts
  const includeDrift = req.nextUrl.searchParams.get("includeDrift") === "true";
```

After the per-category `productAudits` loop (just before `client.categories.push(catAudit)`), add the drift computation:

```ts
    let driftCount: number | undefined;
    let driftRows: DriftRow[] | undefined;
    if (includeDrift) {
      // Latest snapshot row per ASIN for this (client, productType)
      const latest = await db
        .select()
        .from(catalogListingSnapshots)
        .where(
          and(
            eq(catalogListingSnapshots.clientIdCode, def.clientIdCode),
            eq(catalogListingSnapshots.productType, def.productType)
          )
        )
        .orderBy(desc(catalogListingSnapshots.uploadedAt));

      // Reduce to one row per ASIN (first occurrence wins — ordered DESC by uploaded_at)
      const byAsin = new Map<string, typeof latest[number]>();
      for (const row of latest) {
        if (!byAsin.has(row.asin)) byAsin.set(row.asin, row);
      }

      // Build mappings from attributes with bibleFieldMatch
      const mappings: BibleFieldMapping[] = attrs
        .filter((a) => a.bibleFieldMatch)
        .map((a) => ({
          amazonFieldName: a.amazonFieldName,
          bibleFieldMatch: a.bibleFieldMatch!,
        }));

      // Index master products by ASIN for lookup
      const productByAsin = new Map<string, typeof products[number]>();
      for (const p of products) {
        const a = getProductFieldValue(p, "ASIN");
        if (a) productByAsin.set(a, p);
      }

      driftRows = [];
      for (const [asin, snap] of byAsin) {
        const product = productByAsin.get(asin);
        if (!product) continue; // ASIN in snapshot but not in Master — skip for drift
        const masterValues: Record<string, string | null> = {};
        for (const m of mappings) {
          masterValues[m.bibleFieldMatch] =
            getProductFieldValue(product, m.bibleFieldMatch) ?? null;
        }
        const diffs = computeDriftForAsin(snap.values, masterValues, mappings);
        if (diffs.length > 0) driftRows.push({ asin, diffs });
      }
      driftCount = driftRows.length;
      if (!includeProducts) driftRows = undefined; // only return rows on drill-down
    }
```

Then when assembling `catAudit`, include them:

```ts
    const catAudit: CategoryAudit = {
      definitionId: def.id,
      productType: def.productType,
      totalAuditable: auditableAttrs.length,
      productCount: products.length,
      productsWithGaps,
      gapBreakdown,
      totalGaps,
    };
    if (includeProducts) catAudit.products = productAudits;
    if (driftCount !== undefined) catAudit.driftCount = driftCount;
    if (driftRows !== undefined) catAudit.driftRows = driftRows;
```

### - [ ] Step 6: Smoke-test the endpoint

1. Start dev: `PORT=3000 npm run dev`
2. Ensure Cloud23 has been re-uploaded (Phase 1/2) so snapshots exist.
3. `curl 'http://localhost:3000/api/attributes/audit?clientIdCode=CLOUD23&includeDrift=true'` — verify each category has a `driftCount` number (may be 0).
4. `curl 'http://localhost:3000/api/attributes/audit?clientIdCode=CLOUD23&productType=SAUCE&includeDrift=true&includeProducts=true'` — verify `driftRows` is an array.

### - [ ] Step 7: Commit

```bash
git add src/lib/attribute-drift.ts src/lib/attribute-drift.test.ts src/app/api/attributes/audit/route.ts
git commit -m "feat(audit): compute drift count per category + per-ASIN diffs on drill-down"
```

---

## Task 9: Snapshot list + delete endpoints

**Goal:** Admin can list snapshots for a `(client, productType)` and delete individual rows. Baseline rows require `?force=1`.

**Files:**
- Create: `src/app/api/catalog-snapshots/route.ts`
- Create: `src/app/api/catalog-snapshots/[id]/route.ts`
- Create: `src/app/api/catalog-snapshots/[id]/route.test.ts`

### - [ ] Step 1: Add a delete test

Create `src/app/api/catalog-snapshots/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let foundRow: { id: number; isOnboardingBaseline: boolean } | null = null;
const deleteCalls: number[] = [];

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: () => ({ user: { email: "a@b.c", role: "admin" } }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (foundRow ? [foundRow] : []) }),
      }),
    }),
    delete: () => ({
      where: async () => {
        if (foundRow) deleteCalls.push(foundRow.id);
        return undefined;
      },
    }),
  },
}));

import { DELETE } from "./route";

describe("DELETE /api/catalog-snapshots/[id]", () => {
  beforeEach(() => {
    foundRow = null;
    deleteCalls.length = 0;
  });

  it("returns 404 when the snapshot does not exist", async () => {
    const res = await DELETE(
      new Request("http://test/api/catalog-snapshots/99") as unknown as Parameters<typeof DELETE>[0],
      { params: Promise.resolve({ id: "99" }) } as unknown as Parameters<typeof DELETE>[1]
    );
    expect(res.status).toBe(404);
    expect(deleteCalls).toEqual([]);
  });

  it("returns 409 when deleting a baseline row without ?force=1", async () => {
    foundRow = { id: 7, isOnboardingBaseline: true };
    const res = await DELETE(
      new Request("http://test/api/catalog-snapshots/7") as unknown as Parameters<typeof DELETE>[0],
      { params: Promise.resolve({ id: "7" }) } as unknown as Parameters<typeof DELETE>[1]
    );
    expect(res.status).toBe(409);
    expect(deleteCalls).toEqual([]);
  });

  it("deletes a baseline row when ?force=1 is passed", async () => {
    foundRow = { id: 7, isOnboardingBaseline: true };
    const res = await DELETE(
      new Request("http://test/api/catalog-snapshots/7?force=1") as unknown as Parameters<typeof DELETE>[0],
      { params: Promise.resolve({ id: "7" }) } as unknown as Parameters<typeof DELETE>[1]
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual([7]);
  });

  it("deletes a non-baseline row without force", async () => {
    foundRow = { id: 8, isOnboardingBaseline: false };
    const res = await DELETE(
      new Request("http://test/api/catalog-snapshots/8") as unknown as Parameters<typeof DELETE>[0],
      { params: Promise.resolve({ id: "8" }) } as unknown as Parameters<typeof DELETE>[1]
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual([8]);
  });
});
```

### - [ ] Step 2: Run — verify failure

Run: `npx vitest run src/app/api/catalog-snapshots`

Expected: FAIL — route file not yet written.

### - [ ] Step 3: Implement the DELETE endpoint

Create `src/app/api/catalog-snapshots/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { catalogListingSnapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: catalogListingSnapshots.id,
      isOnboardingBaseline: catalogListingSnapshots.isOnboardingBaseline,
    })
    .from(catalogListingSnapshots)
    .where(eq(catalogListingSnapshots.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (row.isOnboardingBaseline && !force) {
    return NextResponse.json(
      {
        error:
          "Cannot delete an onboarding-baseline snapshot without force=1. Pass ?force=1 to override.",
      },
      { status: 409 }
    );
  }

  await db.delete(catalogListingSnapshots).where(eq(catalogListingSnapshots.id, id));
  return NextResponse.json({ deleted: id });
}
```

### - [ ] Step 4: Implement the list endpoint

Create `src/app/api/catalog-snapshots/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { catalogListingSnapshots } from "@/lib/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
// `sql` is used for the count aggregate in the grouped SELECT below.

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const productType = req.nextUrl.searchParams.get("productType");

  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const where = productType
    ? and(
        eq(catalogListingSnapshots.clientIdCode, clientIdCode),
        eq(catalogListingSnapshots.productType, productType)
      )
    : eq(catalogListingSnapshots.clientIdCode, clientIdCode);

  // Group by upload batch (uploaded_at + uploaded_by) so the UI shows one row per upload
  const rows = await db
    .select({
      uploadedAt: catalogListingSnapshots.uploadedAt,
      uploadedBy: catalogListingSnapshots.uploadedBy,
      productType: catalogListingSnapshots.productType,
      isOnboardingBaseline: catalogListingSnapshots.isOnboardingBaseline,
      asinCount: sql<number>`count(*)::int`,
      // Representative id per batch (min id within that batch) for deletion
      representativeId: sql<number>`min(${catalogListingSnapshots.id})::int`,
    })
    .from(catalogListingSnapshots)
    .where(where)
    .groupBy(
      catalogListingSnapshots.uploadedAt,
      catalogListingSnapshots.uploadedBy,
      catalogListingSnapshots.productType,
      catalogListingSnapshots.isOnboardingBaseline
    )
    .orderBy(desc(catalogListingSnapshots.uploadedAt));

  return NextResponse.json({ snapshots: rows });
}
```

Add a **batch DELETE** in the same file (below the GET) so the history UI can remove an entire upload in one call:

```ts
export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const productType = req.nextUrl.searchParams.get("productType");
  const uploadedAt = req.nextUrl.searchParams.get("uploadedAt");
  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!clientIdCode || !productType || !uploadedAt) {
    return NextResponse.json(
      { error: "clientIdCode, productType, and uploadedAt are all required" },
      { status: 400 }
    );
  }

  // Check for baseline rows in this batch
  const baselineCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(catalogListingSnapshots)
    .where(
      and(
        eq(catalogListingSnapshots.clientIdCode, clientIdCode),
        eq(catalogListingSnapshots.productType, productType),
        eq(catalogListingSnapshots.uploadedAt, new Date(uploadedAt)),
        eq(catalogListingSnapshots.isOnboardingBaseline, true)
      )
    );
  if ((baselineCount[0]?.n ?? 0) > 0 && !force) {
    return NextResponse.json(
      {
        error:
          "Batch includes onboarding-baseline rows. Pass ?force=1 to override.",
      },
      { status: 409 }
    );
  }

  const result = await db
    .delete(catalogListingSnapshots)
    .where(
      and(
        eq(catalogListingSnapshots.clientIdCode, clientIdCode),
        eq(catalogListingSnapshots.productType, productType),
        eq(catalogListingSnapshots.uploadedAt, new Date(uploadedAt))
      )
    )
    .returning({ id: catalogListingSnapshots.id });

  return NextResponse.json({ deleted: result.length });
}
```

> **Why two endpoints?** The `[id]` route supports the rare case of surgically removing one row (e.g. a single bad ASIN); the batch endpoint handles the common "delete this upload" case from the history UI. Keep both.

### - [ ] Step 5: Run delete tests

Run: `npx vitest run src/app/api/catalog-snapshots/[id]/route.test.ts`

Expected: all 4 tests PASS.

### - [ ] Step 6: Commit

```bash
git add src/app/api/catalog-snapshots
git commit -m "feat(catalog-snapshots): list and delete endpoints with baseline protection"
```

---

## Task 10: Audit dashboard — drift pill per category

**Goal:** Each category row inside a client card shows a **Drift** pill alongside the existing missing-fields pills. Grey at 0, amber when > 0. Clicking the pill drills down to the drift tab.

**Files:**
- Modify: `src/components/attributes/audit-dashboard.tsx`

### - [ ] Step 1: Extend types and query to request drift

In `src/components/attributes/audit-dashboard.tsx`, update the `CategoryAudit` interface near the top of the file (around line 47):

```ts
interface CategoryAudit {
  definitionId: number;
  productType: string;
  totalAuditable: number;
  productCount: number;
  productsWithGaps: number;
  gapBreakdown: { required: number; conditional: number; key: number };
  totalGaps: number;
  driftCount?: number;
  driftRows?: Array<{ asin: string; diffs: Array<{ amazonFieldName: string; bibleFieldMatch: string; snapshotValue: string; masterValue: string | null }> }>;
  products?: ProductAudit[];
}
```

Update the audit list query (around line 92) to request `includeDrift=true`:

```ts
  const { data: auditData, isLoading } = useQuery({
    queryKey: ["attribute-audit", clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ includeDrift: "true" });
      if (clientFilter !== "all") params.set("clientIdCode", clientFilter);
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit data");
      return res.json() as Promise<{ clients: ClientAudit[] }>;
    },
  });
```

Update the drill-down query (around line 103) to also request drift rows:

```ts
  const { data: drillDownData, isLoading: drillDownLoading } = useQuery({
    queryKey: [
      "attribute-audit-drill",
      drillDown?.clientIdCode,
      drillDown?.productType,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        clientIdCode: drillDown!.clientIdCode,
        productType: drillDown!.productType,
        includeProducts: "true",
        includeDrift: "true",
      });
      const res = await fetch(`/api/attributes/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch drill-down data");
      return res.json() as Promise<{ clients: ClientAudit[] }>;
    },
    enabled: !!drillDown,
  });
```

### - [ ] Step 2: Add drift pill to `ClientCard`

Locate the category row renderer inside `ClientCard` (around line 385 — `{client.categories.map((cat) => (...))}`). Replace the `<div className="flex items-center gap-2">` that contains pills with:

```tsx
                <div className="flex items-center gap-2">
                  {cat.totalGaps > 0 ? (
                    <>
                      <span className="text-xs tabular-nums">
                        {cat.gapBreakdown.required > 0 && (
                          <span className="text-red-400 mr-1.5">
                            {cat.gapBreakdown.required}R
                          </span>
                        )}
                        {cat.gapBreakdown.conditional > 0 && (
                          <span className="text-orange-400 mr-1.5">
                            {cat.gapBreakdown.conditional}C
                          </span>
                        )}
                        {cat.gapBreakdown.key > 0 && (
                          <span className="text-purple-400">
                            {cat.gapBreakdown.key}K
                          </span>
                        )}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-red-500/30 text-red-400"
                      >
                        {cat.totalGaps} missing
                      </Badge>
                    </>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 text-emerald-400"
                    >
                      Complete
                    </Badge>
                  )}
                  {typeof cat.driftCount === "number" && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        cat.driftCount > 0
                          ? "border-amber-500/30 text-amber-400"
                          : "border-border/40 text-muted-foreground"
                      }`}
                    >
                      {cat.driftCount} drifted
                    </Badge>
                  )}
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </div>
```

### - [ ] Step 3: Manual smoke

`PORT=3000 npm run dev` → visit `/attributes`. Each category row inside an expanded client card now shows a drift pill. Grey for `0 drifted`; amber when `> 0`.

### - [ ] Step 4: Commit

```bash
git add src/components/attributes/audit-dashboard.tsx
git commit -m "feat(audit-ui): drift pill per category with amber/grey state"
```

---

## Task 11: Audit dashboard — drift drill-down tab

**Goal:** On drill-down, add a tabbed view: "Gaps" (existing) and "Drift" (new). Drift tab lists per-ASIN two-column diffs.

**Files:**
- Create: `src/components/attributes/drift-drill.tsx`
- Modify: `src/components/attributes/audit-dashboard.tsx`

### - [ ] Step 1: Create the `<DriftDrill />` component

Create `src/components/attributes/drift-drill.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";

interface Diff {
  amazonFieldName: string;
  bibleFieldMatch: string;
  snapshotValue: string;
  masterValue: string | null;
}

interface DriftRow {
  asin: string;
  diffs: Diff[];
}

export function DriftDrill({ rows }: { rows: DriftRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No drift detected — latest snapshot matches Master for every mapped field.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.asin}
          className="rounded-lg border bg-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium font-mono">{row.asin}</span>
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/30 text-amber-400"
            >
              {row.diffs.length} drifted field{row.diffs.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal py-1 pr-2">Field</th>
                <th className="text-left font-normal py-1 pr-2">Amazon snapshot</th>
                <th className="text-left font-normal py-1">Master current</th>
              </tr>
            </thead>
            <tbody>
              {row.diffs.map((d) => (
                <tr key={d.amazonFieldName} className="border-t border-border/40">
                  <td className="py-1 pr-2 text-muted-foreground">{d.bibleFieldMatch}</td>
                  <td className="py-1 pr-2 text-foreground">{d.snapshotValue}</td>
                  <td className="py-1 text-foreground">
                    {d.masterValue ?? <span className="text-muted-foreground italic">empty</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

### - [ ] Step 2: Mount tabs in the drill-down view

In `src/components/attributes/audit-dashboard.tsx`, replace the `// ─── Drill-down view ───` block (starting with `if (drillDown) {` around line 128) with:

```tsx
  // ─── Drill-down view ───────────────────────────────────────────
  if (drillDown) {
    const clientData = drillDownData?.clients?.[0];
    const category = clientData?.categories?.[0];
    const products = category?.products ?? [];
    const productsWithGaps = products.filter((p) => p.gaps.length > 0);
    const completeProducts = products.filter((p) => p.gaps.length === 0);
    const driftRows = category?.driftRows ?? [];

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDrillDown(null)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Audit
          </button>
          <span className="text-muted-foreground">/</span>
          <span>
            {CLIENT_NAMES[drillDown.clientIdCode] || drillDown.clientIdCode}
          </span>
          <span className="text-muted-foreground">/</span>
          <Badge
            variant="outline"
            className="font-mono text-xs border-brand/30 text-brand"
          >
            {drillDown.productType}
          </Badge>
        </div>

        {/* Tab nav */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setDrillTab("gaps")}
            className={`px-3 py-2 text-xs border-b-2 -mb-px ${
              drillTab === "gaps"
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Gaps ({category?.totalGaps ?? 0})
          </button>
          <button
            onClick={() => setDrillTab("drift")}
            className={`px-3 py-2 text-xs border-b-2 -mb-px ${
              drillTab === "drift"
                ? "border-amber-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Drift ({category?.driftCount ?? 0})
          </button>
        </div>

        {/* Summary bar */}
        {category && drillTab === "gaps" && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
            <span className="text-sm text-muted-foreground">
              {category.productCount} products, {category.totalGaps} missing
              fields across {category.productsWithGaps} products
            </span>
          </div>
        )}

        {drillDownLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : drillTab === "gaps" ? (
          <div className="space-y-2">
            {productsWithGaps.map((product) => (
              <div
                key={product.productId}
                className="rounded-lg border bg-card p-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() =>
                      router.push(`/products/${product.productId}`)
                    }
                    className="text-sm font-medium hover:underline text-left"
                  >
                    {product.productName}
                  </button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {product.asin}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.gaps.map((gap) => (
                    <Badge
                      key={gap.attributeName}
                      variant="outline"
                      className={`text-[10px] ${
                        gap.effectiveLevel === "Required"
                          ? "border-red-500/50 text-red-400"
                          : gap.effectiveLevel === "Conditionally Required"
                            ? "border-orange-500/50 text-orange-400"
                            : "border-purple-500/50 text-purple-400"
                      }`}
                    >
                      {gap.effectiveLevel === "Required"
                        ? "R"
                        : gap.effectiveLevel === "Conditionally Required"
                          ? "C"
                          : "K"}{" "}
                      {gap.localLabel}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}

            {completeProducts.length > 0 && (
              <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <span className="text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 inline-block mr-1.5" />
                  {completeProducts.length} product
                  {completeProducts.length !== 1 ? "s" : ""} complete
                </span>
              </div>
            )}
          </div>
        ) : (
          <DriftDrill rows={driftRows} />
        )}
      </div>
    );
  }
```

Add the tab state and import at the top of the file. In the top-level imports:

```tsx
import { DriftDrill } from "./drift-drill";
```

In `AuditDashboard`, after the `drillDown` state hook (around line 77):

```tsx
  const [drillTab, setDrillTab] = useState<"gaps" | "drift">("gaps");
```

### - [ ] Step 3: Manual smoke

`PORT=3000 npm run dev` → `/attributes` → expand a client → click a category row. Tabs appear at the top. Drift tab shows either "No drift detected" or a list of ASINs with diff tables.

### - [ ] Step 4: Commit

```bash
git add src/components/attributes/drift-drill.tsx src/components/attributes/audit-dashboard.tsx
git commit -m "feat(audit-ui): drift drill-down tab with per-ASIN diff table"
```

---

## Task 12: Audit dashboard — snapshot history row inside each client card

**Goal:** Inside an expanded client card, below the category list, add a "Snapshot history" collapsible. Lists uploads with uploaded_at, uploaded_by, ASIN count, onboarding-baseline badge, and a Delete action that prompts for force when needed.

**Files:**
- Create: `src/components/attributes/snapshot-history.tsx`
- Modify: `src/components/attributes/audit-dashboard.tsx`

### - [ ] Step 1: Create `<SnapshotHistory />`

Create `src/components/attributes/snapshot-history.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

interface SnapshotBatch {
  uploadedAt: string;
  uploadedBy: string;
  productType: string;
  asinCount: number;
  isOnboardingBaseline: boolean;
  representativeId: number;
}

export function SnapshotHistory({ clientIdCode }: { clientIdCode: string }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState<SnapshotBatch | null>(null);
  const qc = useQueryClient();

  const { data: snapshots = [] } = useQuery({
    queryKey: ["catalog-snapshots", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog-snapshots?clientIdCode=${clientIdCode}`
      );
      if (!res.ok) return [];
      const json = await res.json();
      return json.snapshots as SnapshotBatch[];
    },
    enabled: expanded,
  });

  const deleteMutation = useMutation({
    mutationFn: async (batch: SnapshotBatch) => {
      const params = new URLSearchParams({
        clientIdCode,
        productType: batch.productType,
        uploadedAt: batch.uploadedAt,
      });
      if (batch.isOnboardingBaseline) params.set("force", "1");
      const res = await fetch(`/api/catalog-snapshots?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete snapshot");
      }
    },
    onSuccess: () => {
      toast.success("Snapshot deleted");
      qc.invalidateQueries({ queryKey: ["catalog-snapshots", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["attribute-audit"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded hover:bg-muted/30 transition-colors text-left">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">Snapshot history</span>
          {snapshots.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({snapshots.length} upload{snapshots.length !== 1 ? "s" : ""})
            </span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-2 space-y-1">
            {snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No snapshots yet. Next XLSM upload will create one.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal py-1">Uploaded</th>
                    <th className="text-left font-normal py-1">By</th>
                    <th className="text-left font-normal py-1">Category</th>
                    <th className="text-right font-normal py-1">ASINs</th>
                    <th className="text-left font-normal py-1">Flag</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr
                      key={`${s.uploadedAt}-${s.productType}`}
                      className="border-t border-border/40"
                    >
                      <td className="py-1">
                        {new Date(s.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="py-1 text-muted-foreground">
                        {s.uploadedBy}
                      </td>
                      <td className="py-1 font-mono">{s.productType}</td>
                      <td className="py-1 text-right tabular-nums">
                        {s.asinCount}
                      </td>
                      <td className="py-1">
                        {s.isOnboardingBaseline && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-emerald-500/30 text-emerald-400"
                          >
                            Baseline
                          </Badge>
                        )}
                      </td>
                      <td className="py-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirm(s)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirm?.productType} snapshot?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.isOnboardingBaseline
                ? "This is an onboarding-baseline snapshot. Deleting it removes the authoritative 'before' picture for this client + category. Are you sure?"
                : `This removes the ${confirm?.asinCount} ASIN row${
                    confirm?.asinCount === 1 ? "" : "s"
                  } in this upload batch. Subsequent uploads will still be kept.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                deleteMutation.mutate(confirm);
                setConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

### - [ ] Step 2: Mount inside `ClientCard`

In `src/components/attributes/audit-dashboard.tsx`, add import:

```tsx
import { SnapshotHistory } from "./snapshot-history";
```

Inside `ClientCard` (around line 386), after the category rows `</div>` (end of category list) but still inside the `<CollapsibleContent>`, add:

```tsx
          <div className="border-t mt-1 pt-1">
            <SnapshotHistory clientIdCode={client.clientIdCode} />
          </div>
```

### - [ ] Step 3: Smoke

`PORT=3000 npm run dev` → `/attributes`. Expand a client that has had XLSM uploads. "Snapshot history" row appears under the categories. Clicking expands the list. Baseline rows show the green badge. Clicking the trash icon shows the baseline-protection confirm dialog.

### - [ ] Step 4: Commit

```bash
git add src/components/attributes/snapshot-history.tsx src/components/attributes/audit-dashboard.tsx
git commit -m "feat(audit-ui): snapshot history row inside each client card with delete"
```

**🎉 Phase 3 complete. Drift + snapshot admin surfaces are live inside the existing Attribute Audit dashboard.**

---

# Phase 4 — Create-Sheet picker

## Task 13: `POST /api/attributes/template-requests` accepts `includedAttributeIds`

**Files:**
- Modify: `src/app/api/attributes/template-requests/route.ts`

### - [ ] Step 1: Add a unit test for `buildTemplateSheets` column filter

Create `src/app/api/attributes/template-requests/route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterAttributesByIds, filterAttributesByLevels } from "./route";

const attrs = [
  { id: 1, requirement: "Required", isKey: false, hideFromTemplate: false, bibleFieldMatch: "A" },
  { id: 2, requirement: "Recommended", isKey: false, hideFromTemplate: false, bibleFieldMatch: "B" },
  { id: 3, requirement: "Optional", isKey: true, hideFromTemplate: false, bibleFieldMatch: "C" },
  { id: 4, requirement: "Required", isKey: false, hideFromTemplate: true, bibleFieldMatch: "D" },
  { id: 5, requirement: "Required", isKey: false, hideFromTemplate: false, bibleFieldMatch: null },
];

describe("filterAttributesByIds", () => {
  it("keeps only attributes whose id is in the set", () => {
    const out = filterAttributesByIds(attrs, [1, 3]);
    expect(out.map((a) => a.id)).toEqual([1, 3]);
  });

  it("still filters out hideFromTemplate and null bibleFieldMatch", () => {
    const out = filterAttributesByIds(attrs, [1, 3, 4, 5]);
    expect(out.map((a) => a.id)).toEqual([1, 3]);
  });

  it("returns an empty array when the set is empty", () => {
    expect(filterAttributesByIds(attrs, [])).toEqual([]);
  });
});

describe("filterAttributesByLevels", () => {
  it("keeps Required + Key when levels = [Required, Key]", () => {
    const out = filterAttributesByLevels(attrs, ["Required", "Key"]);
    expect(out.map((a) => a.id)).toEqual([1, 3]);
  });
});
```

### - [ ] Step 2: Run — verify failure

Run: `npx vitest run src/app/api/attributes/template-requests/route.test.ts`

Expected: FAIL — `filterAttributesByIds` / `filterAttributesByLevels` not exported.

### - [ ] Step 3: Extract the filter helpers and accept `includedAttributeIds`

Edit `src/app/api/attributes/template-requests/route.ts`. At the top-level (outside `POST`), add the exported helpers:

```ts
type FilterableAttr = {
  id: number;
  requirement: string;
  isKey: boolean;
  hideFromTemplate: boolean;
  bibleFieldMatch: string | null;
};

export function filterAttributesByLevels<T extends FilterableAttr>(
  attrs: T[],
  levels: string[]
): T[] {
  return attrs.filter((a) => {
    if (!a.bibleFieldMatch) return false;
    if (a.hideFromTemplate) return false;
    if (levels.includes(a.requirement)) return true;
    if (levels.includes("Key") && a.isKey) return true;
    return false;
  });
}

export function filterAttributesByIds<T extends FilterableAttr>(
  attrs: T[],
  ids: number[]
): T[] {
  const set = new Set(ids);
  return attrs.filter((a) => {
    if (!set.has(a.id)) return false;
    if (!a.bibleFieldMatch) return false;
    if (a.hideFromTemplate) return false;
    return true;
  });
}
```

Update the `POST` handler signature to accept `includedAttributeIds`:

```ts
  const { clientIdCode, productType, scope, levels, includedAttributeIds } =
    await req.json();

  if (!clientIdCode || !productType || !scope) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const hasIds =
    Array.isArray(includedAttributeIds) && includedAttributeIds.length > 0;
  if (!hasIds && !levels?.length) {
    return NextResponse.json(
      { error: "Either levels[] or includedAttributeIds[] is required" },
      { status: 400 }
    );
  }
```

Update the call to `buildTemplateSheets` and pass the ids:

```ts
  const sheets = await buildTemplateSheets(
    clientIdCode,
    productType,
    scope,
    levels ?? [],
    hasIds ? (includedAttributeIds as number[]) : null
  );
```

Update `buildTemplateSheets`'s signature and internal filter logic:

```ts
async function buildTemplateSheets(
  clientIdCode: string,
  productType: string,
  scope: string,
  levels: string[],
  includedAttributeIds: number[] | null
): Promise<TemplateConfig["sheets"]> {
  let defs: (typeof categoryDefinitions.$inferSelect)[];
  if (productType === "all") {
    defs = await db.select().from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, clientIdCode));
  } else {
    defs = await db
      .select()
      .from(categoryDefinitions)
      .where(
        and(eq(categoryDefinitions.clientIdCode, clientIdCode), eq(categoryDefinitions.productType, productType))
      );
  }

  const result: TemplateConfig["sheets"] = [];
  for (const def of defs) {
    const attrs = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.definitionId, def.id))
      .orderBy(categoryAttributes.sortOrder);

    const filtered = includedAttributeIds
      ? filterAttributesByIds(attrs, includedAttributeIds)
      : filterAttributesByLevels(attrs, levels);
    if (filtered.length === 0) continue;

    let products: TemplateConfig["sheets"][number]["products"] = [];
    if (scope === "new") {
      products = Array.from({ length: 10 }, () => ({ name: "", asin: "", values: {} }));
    } else {
      let dbProducts = await db
        .select()
        .from(master)
        .where(and(eq(master.clientIdCode, clientIdCode), eq(master.productType, def.productType)));
      if (scope === "gaps") {
        dbProducts = dbProducts.filter((p) =>
          filtered.some((attr) => {
            const val = getProductFieldValue(p, attr.bibleFieldMatch!);
            return !val || val.trim() === "";
          })
        );
      }
      products = dbProducts.map((p) => {
        const values: Record<string, string> = {};
        for (const attr of filtered) {
          if (attr.bibleFieldMatch) {
            values[attr.bibleFieldMatch] = getProductFieldValue(p, attr.bibleFieldMatch) || "";
          }
        }
        return {
          name: getProductFieldValue(p, "ItemName") || "",
          asin: getProductFieldValue(p, "ASIN") || "",
          values,
        };
      });
    }
    result.push({ productType: def.productType, attributes: filtered, products });
  }
  return result;
}
```

Finally, persist `includedAttributeIds` on the insert. Find the `.insert(attributeTemplateRequests).values({ ... })` call and add:

```ts
      includedAttributeIds: hasIds ? (includedAttributeIds as number[]) : null,
```

### - [ ] Step 4: Run the tests

Run: `npx vitest run src/app/api/attributes/template-requests/route.test.ts`

Expected: all 4 tests PASS.

### - [ ] Step 5: Commit

```bash
git add src/app/api/attributes/template-requests/route.ts src/app/api/attributes/template-requests/route.test.ts
git commit -m "feat(template-requests): accept includedAttributeIds and filter columns by id"
```

---

## Task 14: Create-Sheet dialog — per-attribute checklist

**Goal:** Levels filter stays as a preset. Below it, a collapsible attribute checklist (grouped by `groupName`) with per-attribute checkboxes. Live counter `N columns × M products`. Submit sends `includedAttributeIds`.

**Files:**
- Create: `src/components/attributes/attribute-picker.tsx`
- Modify: `src/components/attributes/template-dialog.tsx`

### - [ ] Step 1: Add a GET endpoint for category attributes (if one doesn't exist)

Check first — run `grep -rn "GET" /Users/manu/1o8Hub/src/app/api/category-definitions`:

If there is NO endpoint that returns `category_attributes` for a given `(clientIdCode, productType)`, create one.

Create `src/app/api/category-definitions/[id]/attributes/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryAttributes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const definitionId = Number(idStr);
  if (!Number.isFinite(definitionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const attrs = await db
    .select()
    .from(categoryAttributes)
    .where(eq(categoryAttributes.definitionId, definitionId))
    .orderBy(categoryAttributes.sortOrder);

  return NextResponse.json({ attributes: attrs });
}
```

(If a similar endpoint already exists, skip this step and reuse it — just note the URL in Step 2.)

### - [ ] Step 2: Create `<AttributePicker />`

Create `src/components/attributes/attribute-picker.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface PickerAttribute {
  id: number;
  localLabel: string;
  groupName: string;
  requirement: string; // Required | Conditionally Required | Optional | Recommended
  isKey: boolean;
  hideFromTemplate: boolean;
  bibleFieldMatch: string | null;
}

interface Props {
  attributes: PickerAttribute[];
  selectedIds: Set<number>;
  onChange: (next: Set<number>) => void;
}

export function AttributePicker({ attributes, selectedIds, onChange }: Props) {
  const eligible = useMemo(
    () => attributes.filter((a) => a.bibleFieldMatch && !a.hideFromTemplate),
    [attributes]
  );

  const groups = useMemo(() => {
    const map = new Map<string, PickerAttribute[]>();
    for (const a of eligible) {
      const g = a.groupName || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [eligible]);

  // Default: required groups expanded; others collapsed
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const [g, attrs] of groups) {
      if (attrs.some((a) => a.requirement === "Required")) open.add(g);
    }
    return open;
  });

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleGroup(group: string) {
    const next = new Set(openGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setOpenGroups(next);
  }

  return (
    <div className="rounded border bg-card max-h-[320px] overflow-y-auto">
      {groups.map(([group, attrs]) => {
        const open = openGroups.has(group);
        const selectedInGroup = attrs.filter((a) => selectedIds.has(a.id)).length;
        return (
          <Collapsible
            key={group}
            open={open}
            onOpenChange={() => toggleGroup(group)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/30 transition-colors text-left border-b border-border/40">
              <div className="flex items-center gap-2">
                {open ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-xs font-medium">{group}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({selectedInGroup}/{attrs.length})
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 py-1 space-y-0.5">
                {attrs.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-xs py-1 hover:bg-muted/20 rounded px-1"
                  >
                    <Checkbox
                      checked={selectedIds.has(a.id)}
                      onCheckedChange={() => toggle(a.id)}
                    />
                    <span className="flex-1 truncate">{a.localLabel}</span>
                    <span
                      className={`text-[10px] ${
                        a.requirement === "Required"
                          ? "text-red-400"
                          : a.requirement === "Conditionally Required"
                            ? "text-orange-400"
                            : a.isKey
                              ? "text-purple-400"
                              : "text-muted-foreground"
                      }`}
                    >
                      {a.requirement === "Conditionally Required"
                        ? "Cond."
                        : a.isKey && a.requirement === "Optional"
                          ? "Key"
                          : a.requirement}
                    </span>
                  </label>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
```

### - [ ] Step 3: Wire into `<TemplateDialog />`

Replace the contents of `src/components/attributes/template-dialog.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExternalLink, Loader2, FileSpreadsheet, Copy } from "lucide-react";
import { CLIENT_NAMES } from "@/lib/constants";
import { AttributePicker, type PickerAttribute } from "./attribute-picker";

interface ClientEntry {
  clientIdCode: string;
  clientName: string;
}

interface CategoryDef {
  id: number;
  clientIdCode: string;
  productType: string;
}

interface TemplateDialogProps {
  defaultClient?: string;
  defaultProductType?: string;
  trigger?: React.ReactNode;
}

const SCOPE_OPTIONS = [
  { value: "gaps", label: "With gaps only" },
  { value: "all", label: "All products" },
  { value: "new", label: "New (empty)" },
] as const;

const LEVEL_OPTIONS = [
  { value: "Required", label: "Required" },
  { value: "Conditionally Required", label: "Cond. Required" },
  { value: "Key", label: "Key" },
  { value: "Recommended", label: "Recommended" },
  { value: "Optional", label: "Optional" },
] as const;

export function TemplateDialog({
  defaultClient,
  defaultProductType,
  trigger,
}: TemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(defaultClient || "");
  const [productType, setProductType] = useState(defaultProductType || "");
  const [scope, setScope] = useState<string>("gaps");
  const [levels, setLevels] = useState<Set<string>>(
    new Set(["Required", "Conditionally Required", "Key"])
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json() as Promise<ClientEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: definitions = [] } = useQuery({
    queryKey: ["category-definitions-list", client],
    queryFn: async () => {
      const res = await fetch(`/api/category-definitions?clientIdCode=${client}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.definitions as CategoryDef[];
    },
    enabled: !!client,
  });

  const currentDef = definitions.find((d) => d.productType === productType);

  const { data: attributes = [] } = useQuery({
    queryKey: ["category-attributes", currentDef?.id],
    queryFn: async () => {
      const res = await fetch(`/api/category-definitions/${currentDef!.id}/attributes`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.attributes as PickerAttribute[];
    },
    enabled: !!currentDef && productType !== "all",
  });

  // Seed selectedIds from levels whenever levels or attributes change.
  // Admin can further tick/untick individual rows.
  useEffect(() => {
    if (attributes.length === 0) return;
    const ids = attributes
      .filter((a) => {
        if (!a.bibleFieldMatch || a.hideFromTemplate) return false;
        if (levels.has(a.requirement)) return true;
        if (levels.has("Key") && a.isKey) return true;
        return false;
      })
      .map((a) => a.id);
    setSelectedIds(new Set(ids));
  }, [attributes, levels]);

  const productCount = useMemo(() => {
    // Rough live count: server reports the authoritative count after creation.
    // This uses the client-side definition list to approximate — OK for a live preview.
    return definitions.find((d) => d.productType === productType) ? "—" : 0;
  }, [definitions, productType]);

  const createSheetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attributes/template-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIdCode: client,
          productType,
          scope,
          levels: [...levels],
          includedAttributeIds: [...selectedIds],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create Sheet");
      }
      return res.json() as Promise<{ request: { id: string; sheetUrl: string } }>;
    },
    onSuccess: (data) => {
      setSheetUrl(data.request.sheetUrl);
      toast.success("Sheet created");
      queryClient.invalidateQueries({ queryKey: ["template-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleLevel(level: string) {
    if (level === "Required") return;
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  async function copyLink() {
    if (!sheetUrl) return;
    await navigator.clipboard.writeText(sheetUrl);
    toast.success("Link copied");
  }

  const canCreate =
    client && productType && selectedIds.size > 0 && productType !== "all";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Create Template Sheet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Attribute Template Sheet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select
                value={client}
                onValueChange={(v) => {
                  setClient(v);
                  setProductType("");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.clientIdCode} value={c.clientIdCode}>
                      {CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={productType} onValueChange={setProductType} disabled={!client}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {definitions.map((d) => (
                    <SelectItem key={d.productType} value={d.productType}>
                      {d.productType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Products scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Attribute levels (preset)
            </Label>
            <div className="flex flex-wrap gap-3">
              {LEVEL_OPTIONS.map((l) => (
                <label key={l.value} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={levels.has(l.value)}
                    onCheckedChange={() => toggleLevel(l.value)}
                    disabled={l.value === "Required"}
                  />
                  {l.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Changing a level re-ticks the checklist below. Untick individual
              attributes afterward to fine-tune.
            </p>
          </div>

          {productType && productType !== "all" && attributes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Attributes ({selectedIds.size} selected)
              </Label>
              <AttributePicker
                attributes={attributes}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
              />
            </div>
          )}

          {productType === "all" && (
            <p className="text-xs text-amber-400">
              Per-attribute picker is only available when a specific category
              is selected. Pick a category above to fine-tune columns.
            </p>
          )}

          <div className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Preview: <span className="tabular-nums font-medium text-foreground">{selectedIds.size}</span> columns × <span className="tabular-nums">{productCount}</span> products
            </span>
          </div>

          {sheetUrl && (
            <div className="rounded border bg-muted/30 p-3 text-xs flex items-center gap-2">
              <code className="flex-1 truncate text-brand">{sheetUrl}</code>
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={sheetUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => createSheetMutation.mutate()}
              disabled={!canCreate || createSheetMutation.isPending}
              className="flex-1"
            >
              {createSheetMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              )}
              Create Sheet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> **Note on live product count:** The rough preview uses `—` because computing the exact count client-side would require a round-trip for every level/picker change. Ship with `—` and surface the real product count from the response JSON (Create toast shows "Sheet created — 218 products"). If UX insists on a live number, add a debounced GET to `/api/attributes/template-requests/preview` in a follow-up — out of scope here.

### - [ ] Step 4: Smoke

`PORT=3000 npm run dev` → `/attributes` → click "Create Template Sheet". Select client + category → the per-attribute picker appears, seeded by the current levels. Untick Required → the Create button disables (levels filter requires one left; but picker can still have items). Untick every row in the picker → Create disables. Create a sheet → URL renders.

### - [ ] Step 5: Commit

```bash
git add src/components/attributes/attribute-picker.tsx src/components/attributes/template-dialog.tsx src/app/api/category-definitions/[id]/attributes/route.ts
git commit -m "feat(create-sheet): per-attribute checklist seeded by levels filter"
```

**🎉 Phase 4 complete. Admins can untick individual attributes before generating the client Sheet.**

---

# Phase 5 — Cleanup script

## Task 15: `scripts/cleanup-phantom-categories.ts` (dry-run by default)

**Goal:** One-time script that finds existing `category_definitions` rows likely to be phantoms (created by pre-fix parser from Amazon example rows) and prints them. Deletes only when `--delete` is passed.

**Heuristic:** A phantom row is a `category_definitions` row for a client where (a) no `catalog_listing_snapshots` row exists for that `(client, productType)` AND (b) that product type doesn't appear in any of that client's products (`master.productType`). Rationale: post-fix, every real upload writes snapshots; real product types also appear in the catalog. A phantom row fails both tests.

**Files:**
- Create: `scripts/cleanup-phantom-categories.ts`

### - [ ] Step 1: Write the script

Create `scripts/cleanup-phantom-categories.ts`:

```ts
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

const DELETE = process.argv.includes("--delete");
const CLIENT_FILTER = (() => {
  const i = process.argv.indexOf("--client");
  return i >= 0 ? process.argv[i + 1] : null;
})();

interface Row {
  id: number;
  client_id_code: string;
  product_type: string;
  uploaded_at: string;
  uploaded_by: string;
  total_attributes: number;
}

async function main() {
  console.log(
    `Mode: ${DELETE ? "DELETE" : "DRY-RUN"}${
      CLIENT_FILTER ? `  (client filter: ${CLIENT_FILTER})` : ""
    }\n`
  );

  // Candidates: category_definitions for which
  // (a) no catalog_listing_snapshots row exists AND
  // (b) no master product has the same product_type for the same client
  const where = CLIENT_FILTER
    ? sql`WHERE cd.client_id_code = ${CLIENT_FILTER}`
    : sql``;

  const rows = (await sql`
    SELECT cd.id, cd.client_id_code, cd.product_type, cd.uploaded_at,
           cd.uploaded_by, cd.total_attributes
      FROM category_definitions cd
      LEFT JOIN catalog_listing_snapshots cls
        ON cls.client_id_code = cd.client_id_code
       AND cls.product_type   = cd.product_type
      LEFT JOIN master m
        ON m.client_id_code = cd.client_id_code
       AND m.product_type   = cd.product_type
      ${where}
     GROUP BY cd.id, cd.client_id_code, cd.product_type, cd.uploaded_at,
              cd.uploaded_by, cd.total_attributes
    HAVING COUNT(cls.id) = 0
       AND COUNT(m.id)   = 0
     ORDER BY cd.client_id_code, cd.product_type
  `) as unknown as Row[];

  if (rows.length === 0) {
    console.log("No phantom category_definitions rows found. Nothing to do.");
    await sql.end();
    return;
  }

  console.log(`Found ${rows.length} suspected phantom row(s):\n`);
  console.log(
    "id".padEnd(6),
    "client_id_code".padEnd(16),
    "product_type".padEnd(24),
    "attrs".padEnd(6),
    "uploaded_at".padEnd(24),
    "uploaded_by"
  );
  for (const r of rows) {
    console.log(
      String(r.id).padEnd(6),
      r.client_id_code.padEnd(16),
      r.product_type.padEnd(24),
      String(r.total_attributes).padEnd(6),
      new Date(r.uploaded_at).toISOString().padEnd(24),
      r.uploaded_by
    );
  }

  if (!DELETE) {
    console.log("\nDry-run complete. Re-run with --delete to remove these rows.");
    console.log("(category_attributes are removed via ON DELETE CASCADE.)");
    await sql.end();
    return;
  }

  const ids = rows.map((r) => r.id);
  const deleted = await sql`
    DELETE FROM category_definitions WHERE id = ANY(${ids}) RETURNING id
  `;
  console.log(`\nDeleted ${deleted.length} row(s).`);
  await sql.end();
}

main().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
```

### - [ ] Step 2: Dry-run against dev DB

Run: `npx tsx scripts/cleanup-phantom-categories.ts`

Expected: either "No phantom category_definitions rows found." OR a table listing candidates. Verify the list looks right (e.g. for CLOUD23, it should include the `ACCESSORY` row).

For a focused check: `npx tsx scripts/cleanup-phantom-categories.ts --client CLOUD23`

### - [ ] Step 3: (When comfortable) run against prod

Coordinate with the user — this is a destructive operation. After review:

```bash
# Dry-run first, always
npx tsx scripts/cleanup-phantom-categories.ts
# Then, with explicit confirmation:
npx tsx scripts/cleanup-phantom-categories.ts --delete
```

### - [ ] Step 4: Commit

```bash
git add scripts/cleanup-phantom-categories.ts
git commit -m "chore(attributes): phantom category_definitions cleanup script (dry-run by default)"
```

**🎉 Phase 5 complete. Continue to Phase 6 for the valid-values dropdown rule.**

---

# Phase 6 — Valid-values dropdowns enforced everywhere

**Why this phase exists:** Attributes split into two fill categories:

1. **Free-text** — any string allowed.
2. **Valid-values** — `category_attributes.valid_values` (per-category after Task 3) defines the allowed list.

**Rule:** Every edit surface in the app that writes to a valid-values attribute MUST render a dropdown bound to that attribute's per-category allowed list. Never a free-text input. Users should not be able to type "BLU" for a Color attribute that accepts only `Red | Blue | Green`. This guarantees publish-time validity and keeps every edit surface consistent.

## Task 16: Shared `useAttributeOptions` hook + `<AttributeInput>` wrapper

**Files:**
- Create: `src/hooks/use-attribute-options.ts`
- Create: `src/components/attributes/attribute-input.tsx`
- Create: `src/app/api/attributes/options/route.ts`
- Create: `src/hooks/use-attribute-options.test.ts`

### - [ ] Step 1: Server endpoint — resolve (clientIdCode, productType) → { [bibleFieldMatch]: string[] }

Create `src/app/api/attributes/options/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryAttributes, categoryDefinitions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// GET /api/attributes/options?clientIdCode=X&productType=Y
// Returns { options: { [bibleFieldMatch]: string[] } } for every attribute
// in the category that has a non-null valid_values list.
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  const productType = req.nextUrl.searchParams.get("productType");
  if (!clientIdCode || !productType) {
    return NextResponse.json({ error: "clientIdCode and productType required" }, { status: 400 });
  }

  const [def] = await db
    .select({ id: categoryDefinitions.id })
    .from(categoryDefinitions)
    .where(
      and(
        eq(categoryDefinitions.clientIdCode, clientIdCode),
        eq(categoryDefinitions.productType, productType)
      )
    )
    .limit(1);

  if (!def) return NextResponse.json({ options: {} });

  const attrs = await db
    .select({
      bibleFieldMatch: categoryAttributes.bibleFieldMatch,
      validValues: categoryAttributes.validValues,
    })
    .from(categoryAttributes)
    .where(eq(categoryAttributes.definitionId, def.id));

  const options: Record<string, string[]> = {};
  for (const a of attrs) {
    if (!a.bibleFieldMatch) continue;
    if (!a.validValues || a.validValues.length === 0) continue;
    options[a.bibleFieldMatch] = a.validValues;
  }
  return NextResponse.json({ options });
}
```

### - [ ] Step 2: Client hook with TanStack Query caching

Create `src/hooks/use-attribute-options.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

export function useAttributeOptions(
  clientIdCode: string | null | undefined,
  productType: string | null | undefined
) {
  return useQuery({
    queryKey: ["attribute-options", clientIdCode, productType],
    queryFn: async () => {
      if (!clientIdCode || !productType) return { options: {} as Record<string, string[]> };
      const res = await fetch(
        `/api/attributes/options?clientIdCode=${encodeURIComponent(clientIdCode)}&productType=${encodeURIComponent(productType)}`
      );
      if (!res.ok) return { options: {} as Record<string, string[]> };
      return res.json() as Promise<{ options: Record<string, string[]> }>;
    },
    enabled: !!clientIdCode && !!productType,
    staleTime: 5 * 60 * 1000, // valid values only change on XLSM re-upload
  });
}
```

### - [ ] Step 3: `<AttributeInput>` wrapper — picks Select when options exist, Input otherwise

Create `src/components/attributes/attribute-input.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  /** The `bibleFieldMatch` / Hub column name for this attribute. */
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
  /** Map of fieldName → allowed list. Pass the result of useAttributeOptions(). */
  options: Record<string, string[]>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Universal attribute editor: if the field has valid values for the current
 * category, renders a Select bound to those values. Otherwise renders a free
 * text Input. Use this everywhere an attribute is edited.
 */
export function AttributeInput({ fieldName, value, onChange, options, placeholder, disabled, className }: Props) {
  const allowed = options[fieldName];
  if (allowed && allowed.length > 0) {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder ?? "Select..."} />
        </SelectTrigger>
        <SelectContent>
          {allowed.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
```

### - [ ] Step 4: Hook test

Create `src/hooks/use-attribute-options.test.ts` — mock `fetch`, assert the hook returns `{ options: {} }` when client/productType are missing and that it passes the query params through. (Pattern identical to other hook tests in `src/hooks/*.test.ts`.)

### - [ ] Step 5: Commit

```bash
git add src/app/api/attributes/options src/hooks/use-attribute-options.ts src/hooks/use-attribute-options.test.ts src/components/attributes/attribute-input.tsx
git commit -m "feat(attributes): shared useAttributeOptions hook + AttributeInput wrapper"
```

---

## Task 17: Replace free-text attribute inputs with `<AttributeInput>` across edit surfaces

**Goal:** Every edit surface that writes to a Hub column matching a `category_attributes.bibleFieldMatch` uses `<AttributeInput>`. If the field has valid values, it becomes a Select automatically.

**Approach:** Audit-then-edit. Do not attempt to rewrite every caller in one commit — ship one surface per commit so each can be verified independently.

### - [ ] Step 1: Enumerate edit surfaces

Run:
```bash
grep -rn "<Input" src/app/products src/components/products src/components/variations src/components/portal 2>/dev/null | grep -iE "value=|onChange" | head -40
```

Expected surfaces (non-exhaustive):
- `src/components/products/products-table.tsx` — inline cell editor
- `src/app/products/[id]/page.tsx` — product detail editor
- `src/components/variations/variation-builder.tsx` — theme/dimension editors
- `src/components/aplus/**` — anywhere an A+ module writes a Hub attribute

Capture the list in `docs/superpowers/handoffs/2026-04-22-attribute-input-audit.md` before editing — keeps the migration traceable.

### - [ ] Step 2: Per-surface replacement recipe

For each identified component:

1. At the top of the component, call `useAttributeOptions(clientIdCode, productType)` — both are usually already on the product record. Pass `product.clientIdCode` and `product.productType`.
2. Replace `<Input value={value} onChange={...} />` bound to a Hub attribute with:
   ```tsx
   <AttributeInput
     fieldName={bqName}
     value={value}
     onChange={setValue}
     options={optionsQuery.data?.options ?? {}}
   />
   ```
3. If the surface edits a **multi-product batch** (e.g. bulk edit), ensure all products share the same `productType` before rendering the Select — otherwise fall back to free text with a tooltip "Mixed categories — open each product individually to see its dropdown."
4. Commit per surface: `feat(<surface>): enforce valid-values dropdown via AttributeInput`.

### - [ ] Step 3: Manual QA per surface

For each commit:
1. `PORT=3000 npm run dev`
2. Pick a client + product whose category has at least one valid-values attribute (e.g. Cloud23 `SAUCE` → `VariationThemeName`).
3. Edit that attribute in the surface → dropdown appears with exactly the allowed values from the latest `category_attributes.valid_values`.
4. Edit an attribute without valid values → free-text input (unchanged behavior).
5. Regression-test the parent form's save path — value still round-trips.

### - [ ] Step 4: Publish guard (optional hardening)

In `src/app/api/publish/route.ts`, before writing to BigQuery, validate any field in the payload that has valid values against the category's allowed list. Reject with 400 + offending fields. This makes "someone bypassed the UI via the API" impossible.

Only ship this guard after Task 17 step 2 covers all surfaces — otherwise legitimate edits from not-yet-migrated screens fail loudly.

### - [ ] Step 5: Commit each surface independently

No batch commit — one PR or one commit per edit surface so bisect is easy if a regression slips in.

---

## Risks & notes for Phase 6

- **Products with no category definition.** If a product's `productType` has no `category_definitions` row (new client, pre-XLSM), `options` is `{}` and every field falls back to free text. Correct — we can't enforce what we don't know.
- **Category ambiguity.** If a product is assigned to multiple categories (shouldn't happen, but defend against it), pick the first definition deterministically by `definitionId ASC` — matches the parser's upload order.
- **Dropdown of >500 values.** Some valid-values lists are long (e.g. country codes). `<Select>` is fine at that size; if UX complains, swap for `<Command>` (shadcn combobox) inside `AttributeInput` behind the same API.
- **Stale options after XLSM re-upload.** The 5-minute staleTime on the query is intentional — after an upload the admin explicitly invalidates by reloading the page. If we later add live invalidation, hook into the `POST /api/category-definitions` success callback.
- **Do not inline the Select per call site.** The whole point is the wrapper — any future change (combobox swap, analytics, audit log) happens in one file.

**🎉 Phase 6 complete. Every edit surface enforces the valid-values contract.**

---

## Post-implementation verification checklist

Before declaring the feature done, run through this list (each item is a manual QA step):

- [ ] Re-upload a known-good multi-category XLSM against a test client. Response JSON: `productTypes` contains only real types, `snapshotCount > 0`, `matchCount` looks right.
- [ ] Open `/attributes` and confirm the drift pill shows `0 drifted` (grey) on a just-uploaded client.
- [ ] Manually modify a `master` product's value for a known `bible_field_match` field, refresh `/attributes`, confirm the drift pill ticks up.
- [ ] Click a category with drift → tab switches between Gaps and Drift. Drift tab shows per-ASIN diff rows.
- [ ] Open "Snapshot history" in a client card. Baseline row shows the green badge. Trash icon opens confirm dialog. Deleting a baseline requires the "are you sure" prompt to include the onboarding-baseline language.
- [ ] Open "Create Template Sheet" dialog. Pick client + category → picker appears, pre-ticked by level. Untick all → Create button disables. Tick only Required → generated Sheet has only Required columns.
- [ ] Run `npx tsx scripts/cleanup-phantom-categories.ts` on dev — confirms list of candidates. Running with `--delete` removes them. Re-running shows no candidates.

## Risks encountered during implementation (to watch)

- **Re-upload semantics.** `POST /api/category-definitions` deletes and re-inserts the `category_definitions` row on re-upload; snapshots are immutable and keep accumulating. This is intentional (spec §4, §7 — snapshots are the history; `category_definitions` is "current truth"). Don't accidentally cascade `source_definition_id` deletes to `catalog_listing_snapshots` — the `ON DELETE SET NULL` already protects this.
- **Parser fallback.** If Amazon ships an XLSM that lacks both the `Product Type - [ ]` row AND any `[ PRODUCT_TYPE ]` labels, the parser throws. The caller returns HTTP 400 with the message. This is intentional — never silently write `UNKNOWN`.
- **Attribute IDs in `includedAttributeIds` are tied to a specific `category_definitions` row.** If the client re-uploads the XLSM, the old definition row is deleted and ids change. Live Create-Sheet dialog always fetches the current def; saved `attribute_template_requests.included_attribute_ids` rows from old defs are historical audit only and aren't re-usable for sheet regeneration. Spec §2 accepts "regenerate if wrong"; do not add id migration.
- **`dropRow` for drift when the snapshot's ASIN doesn't exist in Master.** In Task 8 we skip those ASINs for drift (can't compare to Master). Snapshot history still shows them — this is the correct surface for "inherited catalog" ASINs. Don't show them on the drift tab.
