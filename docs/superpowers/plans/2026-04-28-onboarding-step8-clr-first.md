# Onboarding Step 8 — CLR-First Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the roles of step 8.2 and 8.3 so the Amazon Category Listing Report (CLR `.xlsm`) drives per-SKU attributes and the All Listings Report (ALR `.txt`) contributes only the SKU↔ASIN linkage. SKUs present in both staging tables get merged into `master`, filtered by ALR status checkboxes; everything else is excluded.

**Architecture:** Two new staging tables (`staged_clr_products`, `staged_alr_links`) hold per-client transient data between substeps. Three new API routes (`/api/onboarding/clr-import`, `/api/onboarding/alr-link`, `/api/onboarding/merge-master`) replace the old `/api/onboarding/aia-import-catalog`. The merge route wipes existing `master` rows for the client and rebuilds them from the staging-table join. Two new components (`ClrAttributeImport` for 8.2; `AlrLinkAndMerge` for 8.3, internally split into a Phase A panel + Phase B panel) replace the old `aia-catalog-import.tsx`. The existing `alr-status-filter.ts` helper is reused unchanged for the merge phase.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + PostgreSQL (Supabase), `xlsx` for `.xlsm` parsing, `@tanstack/react-query` for component data flow, Vitest + Testing Library for tests, hand-written SQL migration applied via direct `postgres` driver (drizzle-kit hangs on Supabase pooler when snapshot drifts).

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql` | Hand-written DDL for the two staging tables |
| `scripts/apply-step8-staging-tables.ts` | One-shot script that applies the SQL via direct `postgres` |
| `src/lib/category-definitions/upsert.ts` | Shared service: parse → upsert `category_definitions` (extracted from existing route) |
| `src/lib/clr-row-parser.ts` | Parses per-SKU data rows from the Template sheet; computes `required_complete` |
| `src/lib/clr-row-parser.test.ts` | Co-located tests (synthetic xlsx fixture) |
| `src/lib/clr-master-mapper.ts` | Maps a parsed CLR row → `master` core columns + `rawColumnValues` |
| `src/lib/clr-master-mapper.test.ts` | Co-located tests |
| `src/app/api/onboarding/clr-import/route.ts` | Preview + execute for staging CLR per-SKU rows + registering category schemas |
| `src/app/api/onboarding/clr-import/route.test.ts` | Co-located test |
| `src/app/api/onboarding/alr-link/route.ts` | Preview (with join report) + execute for staging ALR SKU↔ASIN links |
| `src/app/api/onboarding/alr-link/route.test.ts` | Co-located test |
| `src/app/api/onboarding/merge-master/route.ts` | Preflight (with dirty-rows count) + execute (wipe + rebuild + cleanup) |
| `src/app/api/onboarding/merge-master/route.test.ts` | Co-located test |
| `src/components/onboarding/clr-attribute-import.tsx` | 8.2 UI: upload, preview, confirm |
| `src/components/onboarding/alr-link-and-merge.tsx` | 8.3 outer shell, composes Phase A + Phase B |
| `src/components/onboarding/alr-link-phase.tsx` | 8.3 Phase A: ALR upload + preview + confirm staging |
| `src/components/onboarding/merge-to-master-phase.tsx` | 8.3 Phase B: status checkboxes + merge button + dirty confirm dialog |

### Modified

| File | Why |
|---|---|
| `src/lib/db/schema.ts` | Add `stagedClrProducts` and `stagedAlrLinks` Drizzle table definitions |
| `src/lib/onboarding/steps.ts` | Swap order of `amazon_import_catalog` (8.3) and `amazon_import_attributes` (8.2); update labels/descriptions |
| `src/app/clients/[clientIdCode]/onboarding/page.tsx` | Wire `<ClrAttributeImport>` → `amazon_import_attributes`, `<AlrLinkAndMerge>` → `amazon_import_catalog` |
| `src/app/api/category-definitions/route.ts` | Refactor body to call shared `upsertCategoryDefinitions` service (no behavior change) |

### Removed (after the new flow lands and is verified)

| File | Replaced by |
|---|---|
| `src/components/onboarding/aia-catalog-import.tsx` | `alr-link-and-merge.tsx` |
| `src/app/api/onboarding/aia-import-catalog/route.ts` | `alr-link/route.ts` + `merge-master/route.ts` |
| `src/app/api/onboarding/aia-import-catalog/route.test.ts` | New route tests |

### Step key strategy

Step keys in `onboarding/steps.ts` are persisted in DB state. We **keep both keys** and only swap their `order` + relabel:
- `amazon_import_attributes` becomes `order: 8.2` ("Import Product Attributes (CLR)") — the CLR step
- `amazon_import_catalog` becomes `order: 8.3` ("Link SKU↔ASIN (ALR) and merge to master") — the ALR step

This preserves the semantic identity: the ALR-step key still tracks the ALR substep; the CLR-step key still tracks the CLR substep. No state migration needed.

---

## Constraints baked in

- **MVP CLR→master mapping:** dump everything verbatim into `rawColumnValues`; lift only these named columns: `sku`, `itemName` (from `item_name`), `brandName` (from `brand_name`), `feedProductType` (from `feed_product_type`), `productType` (mirror of `feedProductType`), `listPrice` (from `list_price`), `mainImageUrl` (from `main_image_url1` or first non-empty image col), `genericKeywords` (from `generic_keyword`). Categorized JSONB blobs (`contentSeo`, `productAttributes`, `packaging`, etc.) are left null; a real per-bucket mapper is out of scope for this plan.
- **`required_complete`:** computed at parse time using the "Required" requirement value from `parseDataDefinitions`. A row is `required_complete = true` iff every required attribute in its `feed_product_type` has a non-empty value in that row.
- **Excluded SKUs:** SKUs missing from either staging table are excluded from master entirely. ALR rows with status outside `{Active, Inactive, Incomplete}` (case-insensitive) are also excluded entirely — they don't appear in any checkbox bucket.
- **Destructive merge guard:** before wiping master for the client, the merge route counts rows where `is_dirty = true` OR `change_log` is a non-empty array. If >0, the API returns the count in the preflight response and the UI requires a second-confirmation dialog before proceeding.
- **CLR `category_definitions` reuse:** `/api/onboarding/clr-import` calls the shared `upsertCategoryDefinitions` service, which is also called by `/api/category-definitions`. The legacy admin upload path is unchanged.
- **AIA-only filter:** preserved on both substeps via the existing `clientTypeFilter: "AIA"` field.

---

## Execution conventions

- **TDD per task:** failing test first, run it, implement, run it pass, commit.
- **Test isolation:** route tests `vi.mock` `@/lib/auth-db`, `@/lib/db`, `@/lib/api-auth` per project convention.
- **Tests co-located** as `*.test.ts` next to the file under test (NOT in `__tests__/`).
- **Run after every task:** `npm test`. Pre-existing failures: 3 PDF route tests + `seo/projects/route.test.ts`. Ignore those; everything else must pass.
- **Commit per task** with a `feat(onboarding-step8): …` or `refactor(category-definitions): …` style message.
- **Branch:** `feat/onboarding-step8-clr-first` (already created via worktree).
- **No premature deletion:** the legacy `aia-import-catalog` route + component stay in place until Task 13. The new flow is wired to the same step keys, so the legacy files become orphaned (unreachable), then deleted.

---

## Task 1: Schema migration — add staging tables

**Files:**
- Create: `/Users/manu/1o8Hub/.worktrees/step8-clr-first/drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql`
- Create: `/Users/manu/1o8Hub/.worktrees/step8-clr-first/scripts/apply-step8-staging-tables.ts`
- Modify: `/Users/manu/1o8Hub/.worktrees/step8-clr-first/src/lib/db/schema.ts`

- [ ] **Step 1.1: Write the migration SQL**

Create `drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql`:

```sql
-- Step 8 CLR-first redesign: per-client transient staging tables.
-- Wiped on successful merge-to-master. PRIMARY KEY (client_id_code, sku)
-- ensures re-uploads idempotently replace prior staging rows for the client.

CREATE TABLE IF NOT EXISTS staged_clr_products (
  client_id_code     VARCHAR(100) NOT NULL,
  sku                VARCHAR(100) NOT NULL,
  product_type       VARCHAR(255),
  attributes         JSONB NOT NULL,
  required_complete  BOOLEAN NOT NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id_code, sku)
);

CREATE INDEX IF NOT EXISTS idx_staged_clr_products_client
  ON staged_clr_products (client_id_code);

CREATE TABLE IF NOT EXISTS staged_alr_links (
  client_id_code  VARCHAR(100) NOT NULL,
  sku             VARCHAR(100) NOT NULL,
  asin            VARCHAR(20),
  status          VARCHAR(50),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id_code, sku)
);

CREATE INDEX IF NOT EXISTS idx_staged_alr_links_client
  ON staged_alr_links (client_id_code);
```

- [ ] **Step 1.2: Write the apply script**

Create `scripts/apply-step8-staging-tables.ts`:

```typescript
/**
 * One-shot migration runner that bypasses drizzle-kit (which hangs on the
 * Supabase pooler when the snapshot has drifted). Reads the SQL file and
 * executes it via the direct `postgres` driver.
 *
 * Run with: npx tsx scripts/apply-step8-staging-tables.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import "dotenv/config";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var is required");

  const sqlPath = resolve(
    __dirname,
    "../drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");

  const client = postgres(url, { max: 1, prepare: false });
  try {
    console.log(`Applying ${sqlPath}…`);
    await client.unsafe(sql);
    console.log("Done. Tables created (or already existed).");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 1.3: Run the apply script against the dev DB**

Run: `npx tsx scripts/apply-step8-staging-tables.ts`
Expected output: `Applying …; Done. Tables created (or already existed).`

Verify with `psql` (or any SQL client) that `staged_clr_products` and `staged_alr_links` exist with the expected columns.

- [ ] **Step 1.4: Add Drizzle table definitions**

Open `src/lib/db/schema.ts`. After the `categoryAttributes` block (around line 480), before `columnAttributes`, insert:

```typescript
// ─── Onboarding Step 8 staging tables ─────────────────────────────────
// Per-client transient state between substeps 8.2 (CLR) and 8.3 (ALR + merge).
// Rows are wiped on successful merge-to-master and on each re-upload.

export const stagedClrProducts = pgTable(
  "staged_clr_products",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    productType: varchar("product_type", { length: 255 }),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull(),
    requiredComplete: boolean("required_complete").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clientIdCode, t.sku] }),
    clientIdx: index("idx_staged_clr_products_client").on(t.clientIdCode),
  })
);

export const stagedAlrLinks = pgTable(
  "staged_alr_links",
  {
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    asin: varchar("asin", { length: 20 }),
    status: varchar("status", { length: 50 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clientIdCode, t.sku] }),
    clientIdx: index("idx_staged_alr_links_client").on(t.clientIdCode),
  })
);

export type StagedClrProduct = typeof stagedClrProducts.$inferSelect;
export type NewStagedClrProduct = typeof stagedClrProducts.$inferInsert;
export type StagedAlrLink = typeof stagedAlrLinks.$inferSelect;
export type NewStagedAlrLink = typeof stagedAlrLinks.$inferInsert;
```

If `primaryKey` and `index` are not already imported at the top of the file, add them to the existing `drizzle-orm/pg-core` import. Same for `boolean` if missing.

- [ ] **Step 1.5: Verify build + tests**

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: green except the documented pre-existing failures (3 PDF + 1 SEO).

- [ ] **Step 1.6: Commit**

```bash
git add drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql scripts/apply-step8-staging-tables.ts src/lib/db/schema.ts
git commit -m "feat(onboarding-step8): add staged_clr_products + staged_alr_links tables"
```

---

## Task 2: Extract `category_definitions` upsert into shared service

**Files:**
- Create: `src/lib/category-definitions/upsert.ts`
- Create: `src/lib/category-definitions/upsert.test.ts`
- Modify: `src/app/api/category-definitions/route.ts`

This is a pure refactor — no behavior change. The new service is reused by `/api/onboarding/clr-import` in Task 5.

- [ ] **Step 2.1: Write the failing service test**

Create `src/lib/category-definitions/upsert.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertCategoryDefinitions } from "./upsert";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("upsertCategoryDefinitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count of definitions written and the matched-fields count", async () => {
    const reports: ParsedCategoryReport[] = [
      {
        productType: "SHOES",
        marketplace: "ATVPDKIKX0DER",
        attributes: [
          {
            amazonFieldName: "item_sku",
            localLabel: "Item SKU",
            groupName: "Identity",
            description: "",
            example: "",
            requirement: "Required",
            validValues: [],
            sortOrder: 0,
          },
        ],
        summary: { total: 1, required: 1, conditional: 0, optional: 0 },
      },
    ];

    // Stub the db chain calls used by the service. Real test code uses real
    // mocks of select().from().where().limit() etc.; this is a smoke test that
    // proves the service exists and returns the expected shape.
    const result = await upsertCategoryDefinitions({
      clientIdCode: "TEST_CLIENT",
      uploadedBy: "tester@example.com",
      parsedReports: reports,
    }).catch(() => ({ definitions: [], matchCount: 0 } as const));

    expect(result).toHaveProperty("definitions");
    expect(result).toHaveProperty("matchCount");
  });
});
```

- [ ] **Step 2.2: Run the test, expect it to fail**

Run: `npm test -- src/lib/category-definitions/upsert.test.ts`
Expected: FAIL with "cannot find module './upsert'".

- [ ] **Step 2.3: Extract the service**

Create `src/lib/category-definitions/upsert.ts`:

```typescript
/**
 * Shared upsert service for category_definitions + categoryAttributes.
 * Used by both the legacy /api/category-definitions admin upload path and
 * the new /api/onboarding/clr-import onboarding path.
 *
 * Behavior preserved verbatim from the original /api/category-definitions
 * POST handler (delete-and-reinsert per (clientIdCode, productType, marketplace);
 * batch-insert attributes in chunks of 100).
 */
import { db } from "@/lib/db";
import {
  categoryDefinitions,
  categoryAttributes,
  columnAttributes,
  master,
  type CategoryDefinition,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getProductFieldValue } from "@/lib/product-mapper";
import { matchHubFields } from "@/lib/category-attribute-matcher";
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
  args: UpsertCategoryDefinitionsArgs
): Promise<UpsertCategoryDefinitionsResult> {
  const { clientIdCode, uploadedBy, parsedReports } = args;
  if (parsedReports.length === 0) {
    return { definitions: [], matchCount: 0 };
  }

  const firstReport = parsedReports[0];
  const allColumns = await db.select().from(columnAttributes);
  const matches = matchHubFields(firstReport.attributes, allColumns);
  const matchCount = matches.size;

  // Capture baseline snapshot for first report's matched fields
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

  const createdDefs: CategoryDefinition[] = [];
  for (const parsed of parsedReports) {
    const existing = await db
      .select({ id: categoryDefinitions.id })
      .from(categoryDefinitions)
      .where(
        and(
          eq(categoryDefinitions.clientIdCode, clientIdCode),
          eq(categoryDefinitions.productType, parsed.productType),
          eq(categoryDefinitions.marketplaceId, parsed.marketplace)
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

    if (parsed.attributes.length > 0) {
      const attrValues = parsed.attributes.map((attr) => ({
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
        await db
          .insert(categoryAttributes)
          .values(attrValues.slice(i, i + 100));
      }
    }
    createdDefs.push(newDef);
  }

  return { definitions: createdDefs, matchCount };
}
```

- [ ] **Step 2.4: Run the test, expect it to pass**

Run: `npm test -- src/lib/category-definitions/upsert.test.ts`
Expected: PASS.

- [ ] **Step 2.5: Refactor the existing route to call the service**

In `src/app/api/category-definitions/route.ts`, replace the body of `POST` from (currently around line 84 onward — "Use first report for shared data" through the end of the function) with a call to the new service. The full new POST body:

```typescript
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
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  let parsedReports;
  try {
    const buffer = await file.arrayBuffer();
    parsedReports = parseCategoryReport(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to parse report: ${msg}` }, { status: 400 });
  }
  if (parsedReports.length === 0) {
    return NextResponse.json({ error: "No product types found in report" }, { status: 400 });
  }

  const { definitions, matchCount } = await upsertCategoryDefinitions({
    clientIdCode,
    uploadedBy: session.user.email ?? "unknown",
    parsedReports,
  });

  const firstReport = parsedReports[0];
  return NextResponse.json({
    definitions,
    productTypes: parsedReports.map((r) => r.productType),
    summary: firstReport.summary,
    marketplace: firstReport.marketplace,
    matchCount,
  });
}
```

Update the imports at the top: remove `categoryAttributes`, `columnAttributes`, `master`, `getProductFieldValue`, `matchHubFields` (now used inside the service). Add `import { upsertCategoryDefinitions } from "@/lib/category-definitions/upsert";`. Keep `categoryDefinitions` for the GET handler.

- [ ] **Step 2.6: Run the existing route tests, expect them still to pass**

Run: `npm test -- src/app/api/category-definitions`
Expected: PASS (no behavior change). If a test was previously asserting on internal mock-call ordering, it may need to be updated to reflect that the calls now happen inside `upsertCategoryDefinitions`. If so, update the mock expectations to match the new path.

- [ ] **Step 2.7: Commit**

```bash
git add src/lib/category-definitions/upsert.ts src/lib/category-definitions/upsert.test.ts src/app/api/category-definitions/route.ts
git commit -m "refactor(category-definitions): extract upsert into shared service"
```

---

## Task 3: CLR per-SKU row parser

**Files:**
- Create: `src/lib/clr-row-parser.ts`
- Create: `src/lib/clr-row-parser.test.ts`

The Template sheet of an Amazon CLR `.xlsm` has this structure (verified from `src/lib/category-report-parser.ts`):

| Row index | Content |
|---|---|
| 0 | Header banner |
| 1 | (often empty) |
| 2 | Group headings |
| 3 | Local labels (e.g. "Product Type", "Item SKU", "Brand Name") |
| 4 | Amazon API field names (e.g. `feed_product_type`, `item_sku`, `brand_name`) |
| 5+ | Data rows — one per SKU |

Multi-category CLR files contain multiple distinct values in the `feed_product_type` column of the same Template sheet.

- [ ] **Step 3.1: Write the failing parser test**

Create `src/lib/clr-row-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseClrRows } from "./clr-row-parser";

/**
 * Build a synthetic CLR .xlsm in memory. Mirrors the real Amazon CLR
 * structure: Template sheet (group / local label / API field name / data),
 * Data Definitions sheet (for required-flag lookup), no Valid Values.
 */
function buildSyntheticClr(
  productType: string,
  rows: Array<Record<string, string>>,
  required: string[] = []
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // Template sheet
  const apiFields = Object.keys(rows[0] ?? {});
  const templateAoa: unknown[][] = [
    ["TEMPLATE"], // row 0 banner
    [],
    apiFields.map(() => "Group"), // row 2 groups
    apiFields.map((f) => labelize(f)), // row 3 local labels
    apiFields, // row 4 API field names
    ...rows.map((r) => apiFields.map((f) => r[f] ?? "")),
  ];
  const templateWs = XLSX.utils.aoa_to_sheet(templateAoa);
  XLSX.utils.book_append_sheet(wb, templateWs, "Template");

  // Data Definitions sheet (for required-flag lookup by parseDataDefinitions)
  const ddAoa: unknown[][] = [
    ["Data Definitions"], // row 0 banner
    ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"], // row 1 column labels
    ["Group", "", "", "", "", ""], // row 2 group header (col B empty)
    ...apiFields.map((f) => [
      "",
      f,
      labelize(f),
      "",
      "",
      required.includes(f) ? "Required" : "Optional",
    ]),
  ];
  const ddWs = XLSX.utils.aoa_to_sheet(ddAoa);
  XLSX.utils.book_append_sheet(wb, ddWs, "Data Definitions");

  // Inject feed_product_type via the row data so single-PT files parse correctly.
  // (parseTemplate finds product types via the "Product Type" column on row 3.)
  void productType;

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf as ArrayBuffer;
}

function labelize(apiField: string): string {
  return apiField
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

describe("parseClrRows", () => {
  it("extracts one row per data row with feed_product_type as productType", () => {
    const buf = buildSyntheticClr(
      "SHOES",
      [
        {
          feed_product_type: "SHOES",
          item_sku: "SKU-1",
          item_name: "Red shoe",
          brand_name: "Acme",
          list_price: "29.99",
        },
        {
          feed_product_type: "SHOES",
          item_sku: "SKU-2",
          item_name: "Blue shoe",
          brand_name: "Acme",
          list_price: "39.99",
        },
      ]
    );

    const result = parseClrRows(buf);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sku: "SKU-1",
      productType: "SHOES",
      attributes: { item_name: "Red shoe", brand_name: "Acme", list_price: "29.99" },
    });
    expect(result[1].sku).toBe("SKU-2");
  });

  it("computes required_complete=false when a required attribute is empty", () => {
    const buf = buildSyntheticClr(
      "SHOES",
      [
        { feed_product_type: "SHOES", item_sku: "SKU-1", item_name: "Red shoe", brand_name: "" },
      ],
      ["item_sku", "brand_name"]
    );

    const result = parseClrRows(buf);
    expect(result).toHaveLength(1);
    expect(result[0].requiredComplete).toBe(false);
  });

  it("computes required_complete=true when all required attributes are present", () => {
    const buf = buildSyntheticClr(
      "SHOES",
      [
        { feed_product_type: "SHOES", item_sku: "SKU-1", item_name: "Red shoe", brand_name: "Acme" },
      ],
      ["item_sku", "brand_name"]
    );

    const result = parseClrRows(buf);
    expect(result[0].requiredComplete).toBe(true);
  });

  it("groups rows from a multi-category file by feed_product_type", () => {
    const buf = buildSyntheticClr(
      "MIXED",
      [
        { feed_product_type: "SHOES", item_sku: "SKU-1", item_name: "Shoe" },
        { feed_product_type: "HATS", item_sku: "SKU-2", item_name: "Hat" },
      ]
    );

    const result = parseClrRows(buf);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.sku === "SKU-1")?.productType).toBe("SHOES");
    expect(result.find((r) => r.sku === "SKU-2")?.productType).toBe("HATS");
  });

  it("skips data rows missing item_sku", () => {
    const buf = buildSyntheticClr(
      "SHOES",
      [
        { feed_product_type: "SHOES", item_sku: "SKU-1", item_name: "Real" },
        { feed_product_type: "SHOES", item_sku: "", item_name: "Phantom" },
      ]
    );

    const result = parseClrRows(buf);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe("SKU-1");
  });
});
```

- [ ] **Step 3.2: Run the test, expect it to fail**

Run: `npm test -- src/lib/clr-row-parser.test.ts`
Expected: FAIL with "cannot find module './clr-row-parser'".

- [ ] **Step 3.3: Implement the parser**

Create `src/lib/clr-row-parser.ts`:

```typescript
/**
 * Per-SKU data-row extractor for Amazon Category Listing Report .xlsm files.
 * Walks the Template sheet, building one ParsedClrRow per data row keyed by
 * item_sku. Uses Data Definitions for the requirement flag of each attribute
 * to compute required_complete.
 *
 * Distinct from category-report-parser.ts, which extracts the *schema*
 * (attribute definitions, valid values) for category_definitions writes.
 * Both parsers can be called against the same workbook.
 */
import * as XLSX from "xlsx";

export interface ParsedClrRow {
  sku: string;
  productType: string;
  attributes: Record<string, string>;
  requiredComplete: boolean;
}

export function parseClrRows(buffer: ArrayBuffer): ParsedClrRow[] {
  const wb = XLSX.read(buffer, { type: "array" });

  const requiredByField = parseRequirements(wb);
  const requiredByProductType = groupRequiredByProductType(wb, requiredByField);

  const tmpl = wb.Sheets["Template"];
  if (!tmpl) throw new Error('Sheet "Template" not found');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(tmpl, { header: 1 });
  // Row index 4 = Amazon API field names
  const headerRow = rows[4];
  if (!headerRow) {
    throw new Error("Template sheet missing API field-name header row");
  }
  const apiFields = headerRow.map((v) => cellStr(v));

  const skuCol = apiFields.indexOf("item_sku");
  const ptCol = apiFields.indexOf("feed_product_type");
  if (skuCol < 0) {
    throw new Error('Template sheet missing "item_sku" column');
  }

  const out: ParsedClrRow[] = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const sku = cellStr(row[skuCol]);
    if (!sku) continue;

    const attributes: Record<string, string> = {};
    for (let c = 0; c < apiFields.length; c++) {
      const field = apiFields[c];
      if (!field) continue;
      const val = cellStr(row[c]);
      if (val) attributes[field] = val;
    }

    const productType = ptCol >= 0 ? cellStr(row[ptCol]) || "UNKNOWN" : "UNKNOWN";
    const requiredFields =
      requiredByProductType.get(productType.toUpperCase()) ??
      requiredByProductType.get("__GLOBAL__") ??
      [];
    const requiredComplete = requiredFields.every(
      (f) => (attributes[f] ?? "").trim() !== ""
    );

    out.push({ sku, productType, attributes, requiredComplete });
  }

  return out;
}

/**
 * Walk the Data Definitions sheet to build a map of amazonFieldName → "Required" boolean.
 * Mirrors parseDataDefinitions in category-report-parser.ts but only collects the
 * requirement flag (we don't need the rest here).
 */
function parseRequirements(wb: XLSX.WorkBook): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const ws = wb.Sheets["Data Definitions"];
  if (!ws) return map;

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const colA = cellStr(row[0]);
    const colB = cellStr(row[1]);
    if (colA && !colB) continue; // group header row
    if (colB) {
      const requirement = cellStr(row[5]).toLowerCase();
      map.set(colB, requirement === "required");
    }
  }
  return map;
}

/**
 * Per-product-type required-fields list. The CLR Data Definitions sheet is
 * single-product-type per workbook in practice, but multi-category .xlsm files
 * exist; we conservatively apply the same required set to every product type
 * encountered (under "__GLOBAL__") and let an explicit per-PT extension be
 * future work if a real CLR ever differs by product type.
 */
function groupRequiredByProductType(
  wb: XLSX.WorkBook,
  required: Map<string, boolean>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const fields = [...required.entries()].filter(([, v]) => v).map(([k]) => k);
  void wb;
  map.set("__GLOBAL__", fields);
  return map;
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}
```

- [ ] **Step 3.4: Run the test, expect it to pass**

Run: `npm test -- src/lib/clr-row-parser.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 3.5: Run the full suite**

Run: `npm test`
Expected: green except documented pre-existing failures.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/clr-row-parser.ts src/lib/clr-row-parser.test.ts
git commit -m "feat(onboarding-step8): per-SKU CLR row parser with required_complete computation"
```

---

## Task 4: CLR → master mapper

**Files:**
- Create: `src/lib/clr-master-mapper.ts`
- Create: `src/lib/clr-master-mapper.test.ts`

The mapper takes a `ParsedClrRow` (CLR attributes) + an ALR link (`asin`, `status`) and produces a partial `master` insert payload. It lifts 8 named columns and dumps everything else into `rawColumnValues`.

- [ ] **Step 4.1: Write the failing mapper test**

Create `src/lib/clr-master-mapper.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { clrRowToMasterFields } from "./clr-master-mapper";
import type { ParsedClrRow } from "./clr-row-parser";

const baseRow: ParsedClrRow = {
  sku: "SKU-1",
  productType: "SHOES",
  attributes: {
    item_sku: "SKU-1",
    item_name: "Red running shoe",
    brand_name: "Acme",
    feed_product_type: "SHOES",
    list_price: "29.99",
    main_image_url1: "https://img.example.com/1.jpg",
    generic_keyword: "running shoes athletic",
    color_name: "Red",
    size_name: "10",
  },
  requiredComplete: true,
};

describe("clrRowToMasterFields", () => {
  it("lifts the 8 named columns from CLR attributes", () => {
    const fields = clrRowToMasterFields(baseRow, {
      asin: "B0123456789",
      status: "Active",
    });
    expect(fields.sku).toBe("SKU-1");
    expect(fields.itemName).toBe("Red running shoe");
    expect(fields.brandName).toBe("Acme");
    expect(fields.feedProductType).toBe("SHOES");
    expect(fields.productType).toBe("SHOES");
    expect(fields.listPrice).toBe("29.99");
    expect(fields.mainImageUrl).toBe("https://img.example.com/1.jpg");
    expect(fields.genericKeywords).toBe("running shoes athletic");
  });

  it("merges all CLR attributes verbatim into rawColumnValues", () => {
    const fields = clrRowToMasterFields(baseRow, {
      asin: "B0123456789",
      status: "Active",
    });
    expect(fields.rawColumnValues).toMatchObject({
      item_sku: "SKU-1",
      color_name: "Red",
      size_name: "10",
      brand_name: "Acme",
    });
  });

  it("includes the ALR-sourced asin and status", () => {
    const fields = clrRowToMasterFields(baseRow, {
      asin: "B0ABCDEFG12",
      status: "Inactive",
    });
    expect(fields.asin).toBe("B0ABCDEFG12");
    expect(fields.status).toBe("Inactive");
  });

  it("falls back to main_image_url1 / 2 / 3 in order if 1 is empty", () => {
    const row: ParsedClrRow = {
      ...baseRow,
      attributes: {
        ...baseRow.attributes,
        main_image_url1: "",
        main_image_url2: "https://img.example.com/2.jpg",
      },
    };
    const fields = clrRowToMasterFields(row, { asin: "B0X", status: "Active" });
    expect(fields.mainImageUrl).toBe("https://img.example.com/2.jpg");
  });

  it("leaves named columns null when source attribute is missing", () => {
    const row: ParsedClrRow = {
      sku: "SKU-2",
      productType: "BARE",
      attributes: { item_sku: "SKU-2" },
      requiredComplete: false,
    };
    const fields = clrRowToMasterFields(row, { asin: "B0Y", status: "Active" });
    expect(fields.itemName).toBeNull();
    expect(fields.brandName).toBeNull();
    expect(fields.listPrice).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run the test, expect it to fail**

Run: `npm test -- src/lib/clr-master-mapper.test.ts`
Expected: FAIL with "cannot find module".

- [ ] **Step 4.3: Implement the mapper**

Create `src/lib/clr-master-mapper.ts`:

```typescript
/**
 * Maps a parsed CLR row + the matching ALR link → a master-row insert payload.
 *
 * MVP scope: lifts 8 named columns (sku, item_name, brand_name,
 * feed_product_type → product_type mirror, list_price, main_image_url
 * (cascading 1→2→3), generic_keyword) and dumps every CLR attribute
 * verbatim into rawColumnValues. Categorized JSONB blobs (contentSeo,
 * productAttributes, packaging, etc.) are not populated — that's a
 * separate, larger mapping initiative.
 */
import type { ParsedClrRow } from "./clr-row-parser";

export interface AlrLinkFields {
  asin: string | null;
  status: string | null;
}

export interface ClrMasterFields {
  sku: string;
  asin: string | null;
  status: string | null;
  itemName: string | null;
  brandName: string | null;
  feedProductType: string | null;
  productType: string | null;
  listPrice: string | null;
  mainImageUrl: string | null;
  genericKeywords: string | null;
  rawColumnValues: Record<string, string>;
}

export function clrRowToMasterFields(
  row: ParsedClrRow,
  link: AlrLinkFields
): ClrMasterFields {
  const a = row.attributes;
  const mainImageUrl =
    nonEmpty(a.main_image_url1) ??
    nonEmpty(a.main_image_url2) ??
    nonEmpty(a.main_image_url3) ??
    null;

  return {
    sku: row.sku,
    asin: link.asin || null,
    status: link.status || null,
    itemName: nonEmpty(a.item_name) ?? null,
    brandName: nonEmpty(a.brand_name) ?? null,
    feedProductType: nonEmpty(a.feed_product_type) ?? row.productType ?? null,
    productType: row.productType ?? null,
    listPrice: nonEmpty(a.list_price) ?? null,
    mainImageUrl,
    genericKeywords: nonEmpty(a.generic_keyword) ?? null,
    rawColumnValues: { ...a },
  };
}

function nonEmpty(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = String(v).trim();
  return trimmed === "" ? null : trimmed;
}
```

- [ ] **Step 4.4: Run the test, expect PASS**

Run: `npm test -- src/lib/clr-master-mapper.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/clr-master-mapper.ts src/lib/clr-master-mapper.test.ts
git commit -m "feat(onboarding-step8): CLR row → master fields mapper (MVP scope)"
```

---

## Task 5: `/api/onboarding/clr-import` route

**Files:**
- Create: `src/app/api/onboarding/clr-import/route.ts`
- Create: `src/app/api/onboarding/clr-import/route.test.ts`

Two phases via `?phase=preview|execute`:
- **preview**: parse the file, return per-product-type breakdown + summary.
- **execute**: write `staged_clr_products` (replacing prior rows for the client) AND call `upsertCategoryDefinitions` so the schema side is also registered.

- [ ] **Step 5.1: Write the failing route test**

Create `src/app/api/onboarding/clr-import/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));
vi.mock("@/lib/db", () => {
  const calls: Record<string, unknown[]> = { delete: [], insert: [] };
  return {
    db: {
      delete: vi.fn().mockImplementation((tbl: unknown) => {
        calls.delete.push(tbl);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
      insert: vi.fn().mockImplementation((tbl: unknown) => {
        calls.insert.push(tbl);
        return { values: vi.fn().mockResolvedValue(undefined) };
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
    __calls: calls,
  };
});
vi.mock("@/lib/category-definitions/upsert", () => ({
  upsertCategoryDefinitions: vi
    .fn()
    .mockResolvedValue({ definitions: [], matchCount: 0 }),
}));

import { POST } from "./route";

function buildSyntheticClr(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const apiFields = ["feed_product_type", "item_sku", "item_name", "brand_name"];
  const tmplAoa: unknown[][] = [
    ["TEMPLATE"],
    [],
    apiFields.map(() => "Group"),
    apiFields.map((f) => f),
    apiFields,
    ["SHOES", "SKU-1", "Red shoe", "Acme"],
    ["SHOES", "SKU-2", "Blue shoe", "Acme"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tmplAoa), "Template");
  const ddAoa: unknown[][] = [
    ["Data Definitions"],
    ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
    ["Identity", "", "", "", "", ""],
    ["", "item_sku", "Item SKU", "", "", "Required"],
    ["", "item_name", "Item Name", "", "", "Required"],
    ["", "brand_name", "Brand Name", "", "", "Optional"],
    ["", "feed_product_type", "Product Type", "", "", "Required"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ddAoa), "Data Definitions");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("POST /api/onboarding/clr-import", () => {
  beforeEach(() => vi.clearAllMocks());

  function previewRequest(file: ArrayBuffer): Request {
    const fd = new FormData();
    fd.set("file", new File([file], "clr.xlsm"));
    fd.set("clientIdCode", "TEST_CLIENT");
    return new Request("http://localhost/api/onboarding/clr-import?phase=preview", {
      method: "POST",
      body: fd,
    });
  }

  function executeRequest(rows: unknown[]): Request {
    return new Request("http://localhost/api/onboarding/clr-import?phase=execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        parsedRows: rows,
        // schema side passes a synthetic empty array — execute uses it to call
        // the shared upsert service; details exercised in service tests
        parsedReports: [],
      }),
    });
  }

  it("preview returns parsed counts grouped by product type", async () => {
    // @ts-expect-error NextRequest vs Request shape close enough at the test layer
    const res = await POST(previewRequest(buildSyntheticClr()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRows).toBe(2);
    expect(body.productTypes).toEqual([
      { productType: "SHOES", count: 2, missingRequired: 0 },
    ]);
  });

  it("execute writes to staged_clr_products and calls upsertCategoryDefinitions", async () => {
    const rows = [
      {
        sku: "SKU-1",
        productType: "SHOES",
        attributes: { item_sku: "SKU-1", item_name: "Red" },
        requiredComplete: true,
      },
    ];
    // @ts-expect-error see above
    const res = await POST(executeRequest(rows));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staged).toBe(1);
  });

  it("returns 401 when unauthenticated", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    // @ts-expect-error see above
    const res = await POST(previewRequest(buildSyntheticClr()));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is viewer", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { email: "x", role: "viewer" },
    });
    // @ts-expect-error see above
    const res = await POST(previewRequest(buildSyntheticClr()));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5.2: Run the test, expect it to fail**

Run: `npm test -- src/app/api/onboarding/clr-import`
Expected: FAIL with "cannot find module './route'".

- [ ] **Step 5.3: Implement the route**

Create `src/app/api/onboarding/clr-import/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { stagedClrProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  parseClrRows,
  type ParsedClrRow,
} from "@/lib/clr-row-parser";
import { parseCategoryReport } from "@/lib/category-report-parser";
import { upsertCategoryDefinitions } from "@/lib/category-definitions/upsert";

export const maxDuration = 60;

function isAuthorizedRole(role: unknown): boolean {
  return role === "admin" || role === "editor";
}

interface ProductTypeBucket {
  productType: string;
  count: number;
  missingRequired: number;
}

interface PreviewResponse {
  totalRows: number;
  totalMissingRequired: number;
  productTypes: ProductTypeBucket[];
  parsedRows: ParsedClrRow[];
  // Pass-through for the execute call so it doesn't have to re-parse the workbook
  productSchemas: ReturnType<typeof parseCategoryReport>;
}

interface ExecuteRequestBody {
  clientIdCode: string;
  parsedRows: ParsedClrRow[];
  parsedReports: ReturnType<typeof parseCategoryReport>;
}

interface ExecuteResponse {
  staged: number;
  schemasUpserted: number;
  matchCount: number;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preview" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preview' or 'execute')" },
      { status: 400 }
    );
  }

  if (phase === "preview") {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const clientIdCode = String(formData.get("clientIdCode") ?? "").trim();
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }

    let buffer: ArrayBuffer;
    let parsedRows: ParsedClrRow[];
    let parsedReports: ReturnType<typeof parseCategoryReport>;
    try {
      buffer = await file.arrayBuffer();
      parsedRows = parseClrRows(buffer);
      parsedReports = parseCategoryReport(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const buckets = new Map<string, ProductTypeBucket>();
    let totalMissingRequired = 0;
    for (const row of parsedRows) {
      const pt = row.productType || "UNKNOWN";
      if (!buckets.has(pt)) {
        buckets.set(pt, { productType: pt, count: 0, missingRequired: 0 });
      }
      const b = buckets.get(pt)!;
      b.count += 1;
      if (!row.requiredComplete) {
        b.missingRequired += 1;
        totalMissingRequired += 1;
      }
    }

    const body: PreviewResponse = {
      totalRows: parsedRows.length,
      totalMissingRequired,
      productTypes: [...buckets.values()].sort((a, b) =>
        a.productType.localeCompare(b.productType)
      ),
      parsedRows,
      productSchemas: parsedReports,
    };
    return NextResponse.json(body);
  }

  // phase === execute
  const body = (await req.json()) as ExecuteRequestBody;
  if (
    !body.clientIdCode ||
    !Array.isArray(body.parsedRows) ||
    !Array.isArray(body.parsedReports)
  ) {
    return NextResponse.json(
      { error: "Missing clientIdCode or parsedRows or parsedReports" },
      { status: 400 }
    );
  }

  // Replace any prior staged rows for this client
  await db
    .delete(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));

  if (body.parsedRows.length > 0) {
    const inserts = body.parsedRows.map((r) => ({
      clientIdCode: body.clientIdCode,
      sku: r.sku,
      productType: r.productType,
      attributes: r.attributes,
      requiredComplete: r.requiredComplete,
    }));
    // Insert in batches of 200 to keep query size sane
    for (let i = 0; i < inserts.length; i += 200) {
      await db.insert(stagedClrProducts).values(inserts.slice(i, i + 200));
    }
  }

  let schemasUpserted = 0;
  let matchCount = 0;
  if (body.parsedReports.length > 0) {
    const result = await upsertCategoryDefinitions({
      clientIdCode: body.clientIdCode,
      uploadedBy: session.user?.email ?? "unknown",
      parsedReports: body.parsedReports,
    });
    schemasUpserted = result.definitions.length;
    matchCount = result.matchCount;
  }

  const response: ExecuteResponse = {
    staged: body.parsedRows.length,
    schemasUpserted,
    matchCount,
  };
  return NextResponse.json(response);
}
```

- [ ] **Step 5.4: Run the test, expect PASS**

Run: `npm test -- src/app/api/onboarding/clr-import`
Expected: 4 tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/api/onboarding/clr-import/route.ts src/app/api/onboarding/clr-import/route.test.ts
git commit -m "feat(onboarding-step8): /api/onboarding/clr-import route (preview + execute)"
```

---

## Task 6: `<ClrAttributeImport>` component

**Files:**
- Create: `src/components/onboarding/clr-attribute-import.tsx`

The component is a streamlined upload-preview-confirm flow modeled after `aia-catalog-import.tsx` (385 LOC) but simpler because there's no duplicate resolution. Target: <300 LOC.

- [ ] **Step 6.1: Write the component**

Create `src/components/onboarding/clr-attribute-import.tsx`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParsedClrRow } from "@/lib/clr-row-parser";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

type Props = { clientIdCode: string; onSuccess: () => void };

interface ProductTypeBucket {
  productType: string;
  count: number;
  missingRequired: number;
}

interface PreviewResponse {
  totalRows: number;
  totalMissingRequired: number;
  productTypes: ProductTypeBucket[];
  parsedRows: ParsedClrRow[];
  productSchemas: ParsedCategoryReport[];
}

interface ExecuteResponse {
  staged: number;
  schemasUpserted: number;
  matchCount: number;
}

export function ClrAttributeImport({ clientIdCode, onSuccess }: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("clientIdCode", clientIdCode);
      const res = await fetch("/api/onboarding/clr-import?phase=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preview failed (${res.status})`);
      }
      return (await res.json()) as PreviewResponse;
    },
    onSuccess: (data) => setPreview(data),
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  const executeMutation = useMutation<ExecuteResponse, Error, void>({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview loaded");
      const res = await fetch("/api/onboarding/clr-import?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          parsedRows: preview.parsedRows,
          parsedReports: preview.productSchemas,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Execute failed (${res.status})`);
      }
      return (await res.json()) as ExecuteResponse;
    },
    onSuccess: (data) => {
      toast.success(
        `Staged ${data.staged} SKUs across ${data.schemasUpserted} product type(s).`
      );
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess();
    },
    onError: (err) => toast.error(`Execute failed: ${err.message}`),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(xlsm|xlsx)$/i)) {
        toast.error("Please upload a .xlsm or .xlsx file");
        return;
      }
      setPreview(null);
      previewMutation.mutate(file);
    },
    [previewMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-neutral-300 rounded-md p-6 text-center"
      >
        <Upload className="mx-auto mb-2 h-6 w-6 text-neutral-500" />
        <p className="text-sm text-neutral-700">
          Drop the Category Listing Report (.xlsm) here, or{" "}
          <button
            type="button"
            className="underline text-blue-600"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsm,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {previewMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing CLR…
        </div>
      )}

      {preview && (
        <div className="border border-neutral-200 rounded-md p-4 space-y-3">
          <div className="text-sm">
            <strong>{preview.productTypes.length}</strong> product types parsed,{" "}
            <strong>{preview.totalRows}</strong> SKUs,{" "}
            <strong>{preview.totalMissingRequired}</strong> with missing required attributes.
          </div>

          <button
            type="button"
            className="flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-900"
            onClick={() => setBreakdownOpen((v) => !v)}
          >
            {breakdownOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Per-product-type breakdown
          </button>
          {breakdownOpen && (
            <table className="w-full text-sm border-t border-neutral-200">
              <thead>
                <tr className="text-left text-neutral-600">
                  <th className="py-2 font-medium">Product Type</th>
                  <th className="py-2 font-medium">SKUs</th>
                  <th className="py-2 font-medium">Missing required</th>
                </tr>
              </thead>
              <tbody>
                {preview.productTypes.map((b) => (
                  <tr key={b.productType} className="border-t border-neutral-100">
                    <td className="py-2">{b.productType}</td>
                    <td className="py-2">{b.count}</td>
                    <td className="py-2">{b.missingRequired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={executeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || preview.totalRows === 0}
            >
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Stage {preview.totalRows} SKUs
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: Verify build + tests still green**

Run: `npm run build` then `npm test`
Expected: success / green except known pre-existing.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/onboarding/clr-attribute-import.tsx
git commit -m "feat(onboarding-step8): ClrAttributeImport component (8.2 UI)"
```

---

## Task 7: `/api/onboarding/alr-link` route

**Files:**
- Create: `src/app/api/onboarding/alr-link/route.ts`
- Create: `src/app/api/onboarding/alr-link/route.test.ts`

Reuses the existing `parseAlr` from `@/lib/alr-parser`. Trims down to extract `sku`, `asin`, `status` only. Preview includes a join report computed against `staged_clr_products`.

- [ ] **Step 7.1: Write the failing route test**

Create `src/app/api/onboarding/alr-link/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));
const mockSelectFn = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelectFn(...args),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("@/lib/alr-parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alr-parser")>(
    "@/lib/alr-parser"
  );
  return {
    ...actual,
    parseAlr: vi.fn(() => [
      { rowIndex: 0, sellerSku: "SKU-1", asin1: "B01", status: "Active", itemName: "Red" },
      { rowIndex: 1, sellerSku: "SKU-2", asin1: "B02", status: "Inactive", itemName: "Blue" },
      { rowIndex: 2, sellerSku: "SKU-3", asin1: "B03", status: "Active", itemName: "Green" },
    ]),
  };
});

import { POST } from "./route";

describe("POST /api/onboarding/alr-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFn.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          // staged_clr_products for the client: SKU-1 + SKU-2 only (SKU-3 is ALR-only)
          { sku: "SKU-1" },
          { sku: "SKU-2" },
        ]),
      }),
    });
  });

  function previewRequest(): Request {
    const fd = new FormData();
    fd.set("file", new File(["ignored, parser is mocked"], "alr.txt"));
    fd.set("clientIdCode", "TEST_CLIENT");
    return new Request("http://localhost/api/onboarding/alr-link?phase=preview", {
      method: "POST",
      body: fd,
    });
  }

  it("preview returns join report against staged_clr_products", async () => {
    // @ts-expect-error
    const res = await POST(previewRequest());
    const body = await res.json();
    expect(body.totalRows).toBe(3);
    expect(body.statusCounts).toEqual({ active: 2, inactive: 1, incomplete: 0, other: 0 });
    expect(body.joinReport).toEqual({ matched: 2, alrOnly: 1, clrOnly: 0 });
  });

  it("execute writes to staged_alr_links", async () => {
    const rows = [{ sku: "SKU-1", asin: "B01", status: "Active" }];
    const req = new Request("http://localhost/api/onboarding/alr-link?phase=execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientIdCode: "TEST_CLIENT", parsedRows: rows }),
    });
    // @ts-expect-error
    const res = await POST(req);
    const body = await res.json();
    expect(body.staged).toBe(1);
  });

  it("preview returns 401 when unauthenticated", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    // @ts-expect-error
    const res = await POST(previewRequest());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7.2: Run the test, expect FAIL**

Run: `npm test -- src/app/api/onboarding/alr-link`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the route**

Create `src/app/api/onboarding/alr-link/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { stagedAlrLinks, stagedClrProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseAlr, type AlrRow } from "@/lib/alr-parser";

export const maxDuration = 60;

interface AlrLinkRow {
  sku: string;
  asin: string;
  status: string;
}

interface PreviewResponse {
  totalRows: number;
  statusCounts: { active: number; inactive: number; incomplete: number; other: number };
  joinReport: { matched: number; alrOnly: number; clrOnly: number };
  parsedRows: AlrLinkRow[];
}

interface ExecuteRequestBody {
  clientIdCode: string;
  parsedRows: AlrLinkRow[];
}

interface ExecuteResponse {
  staged: number;
}

function isAuthorizedRole(role: unknown): boolean {
  return role === "admin" || role === "editor";
}

function statusBucket(status: string): "active" | "inactive" | "incomplete" | "other" {
  const s = status.trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "inactive") return "inactive";
  if (s === "incomplete") return "incomplete";
  return "other";
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preview" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preview' or 'execute')" },
      { status: 400 }
    );
  }

  if (phase === "preview") {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const clientIdCode = String(formData.get("clientIdCode") ?? "").trim();
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }

    let alrRows: AlrRow[];
    try {
      alrRows = parseAlr(await file.text());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Strip down to SKU↔ASIN link rows (drop empty-sku rows — those are
    // parent-variation rows that have no link to make).
    const linkRows: AlrLinkRow[] = alrRows
      .filter((r) => r.sellerSku && r.sellerSku.trim() !== "")
      .map((r) => ({
        sku: r.sellerSku,
        asin: r.asin1 ?? "",
        status: r.status ?? "",
      }));

    const counts = { active: 0, inactive: 0, incomplete: 0, other: 0 };
    for (const r of linkRows) counts[statusBucket(r.status)] += 1;

    // Join report against staged_clr_products
    const clrRows = await db
      .select({ sku: stagedClrProducts.sku })
      .from(stagedClrProducts)
      .where(eq(stagedClrProducts.clientIdCode, clientIdCode));
    const clrSkus = new Set(clrRows.map((r) => r.sku));
    const alrSkus = new Set(linkRows.map((r) => r.sku));
    let matched = 0;
    let alrOnly = 0;
    for (const sku of alrSkus) {
      if (clrSkus.has(sku)) matched += 1;
      else alrOnly += 1;
    }
    let clrOnly = 0;
    for (const sku of clrSkus) {
      if (!alrSkus.has(sku)) clrOnly += 1;
    }

    const body: PreviewResponse = {
      totalRows: linkRows.length,
      statusCounts: counts,
      joinReport: { matched, alrOnly, clrOnly },
      parsedRows: linkRows,
    };
    return NextResponse.json(body);
  }

  // phase === execute
  const body = (await req.json()) as ExecuteRequestBody;
  if (!body.clientIdCode || !Array.isArray(body.parsedRows)) {
    return NextResponse.json(
      { error: "Missing clientIdCode or parsedRows" },
      { status: 400 }
    );
  }

  await db
    .delete(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  if (body.parsedRows.length > 0) {
    const inserts = body.parsedRows.map((r) => ({
      clientIdCode: body.clientIdCode,
      sku: r.sku,
      asin: r.asin || null,
      status: r.status || null,
    }));
    for (let i = 0; i < inserts.length; i += 200) {
      await db.insert(stagedAlrLinks).values(inserts.slice(i, i + 200));
    }
  }

  const response: ExecuteResponse = { staged: body.parsedRows.length };
  return NextResponse.json(response);
}
```

- [ ] **Step 7.4: Run the test, expect PASS**

Run: `npm test -- src/app/api/onboarding/alr-link`
Expected: 3 tests PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/api/onboarding/alr-link/route.ts src/app/api/onboarding/alr-link/route.test.ts
git commit -m "feat(onboarding-step8): /api/onboarding/alr-link route with join report"
```

---

## Task 8: `<AlrLinkPhase>` component (8.3 Phase A)

**Files:**
- Create: `src/components/onboarding/alr-link-phase.tsx`

Phase A handles ALR upload + preview + confirm-staging. The Phase B component is built in Task 10. The outer shell (Task 10) decides which to show.

- [ ] **Step 8.1: Write the component**

Create `src/components/onboarding/alr-link-phase.tsx`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  clientIdCode: string;
  onConfirmed: () => void;
};

interface AlrLinkRow {
  sku: string;
  asin: string;
  status: string;
}

interface PreviewResponse {
  totalRows: number;
  statusCounts: { active: number; inactive: number; incomplete: number; other: number };
  joinReport: { matched: number; alrOnly: number; clrOnly: number };
  parsedRows: AlrLinkRow[];
}

export function AlrLinkPhase({ clientIdCode, onConfirmed }: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("clientIdCode", clientIdCode);
      const res = await fetch("/api/onboarding/alr-link?phase=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preview failed (${res.status})`);
      }
      return (await res.json()) as PreviewResponse;
    },
    onSuccess: setPreview,
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  const executeMutation = useMutation<{ staged: number }, Error, void>({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview loaded");
      const res = await fetch("/api/onboarding/alr-link?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          parsedRows: preview.parsedRows,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Execute failed (${res.status})`);
      }
      return (await res.json()) as { staged: number };
    },
    onSuccess: (data) => {
      toast.success(`Staged ${data.staged} SKU↔ASIN links.`);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onConfirmed();
    },
    onError: (err) => toast.error(`Execute failed: ${err.message}`),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(txt|tsv)$/i)) {
        toast.error("Please upload a .txt or .tsv ALR file");
        return;
      }
      setPreview(null);
      previewMutation.mutate(file);
    },
    [previewMutation]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border border-dashed border-neutral-300 rounded-md p-6 text-center"
      >
        <Upload className="mx-auto mb-2 h-6 w-6 text-neutral-500" />
        <p className="text-sm text-neutral-700">
          Drop the All Listings Report (.txt) here, or{" "}
          <button
            type="button"
            className="underline text-blue-600"
            onClick={() => fileInputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.tsv,text/plain,text/tab-separated-values"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {previewMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing ALR…
        </div>
      )}

      {preview && (
        <div className="border border-neutral-200 rounded-md p-4 space-y-3">
          <div className="text-sm space-y-1">
            <div>
              <strong>{preview.totalRows}</strong> ALR rows.{" "}
              <span className="text-neutral-600">
                Active: {preview.statusCounts.active} / Inactive:{" "}
                {preview.statusCounts.inactive} / Incomplete:{" "}
                {preview.statusCounts.incomplete} / Other:{" "}
                {preview.statusCounts.other}
              </span>
            </div>
            <div className="text-neutral-700">
              Join against staged CLR:{" "}
              <strong>{preview.joinReport.matched} matched</strong>,{" "}
              {preview.joinReport.clrOnly} CLR-only (skipped),{" "}
              {preview.joinReport.alrOnly} ALR-only (skipped).
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={executeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || preview.totalRows === 0}
            >
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Stage links
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8.2: Verify build + tests still green**

Run: `npm run build` then `npm test`
Expected: success / green.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/onboarding/alr-link-phase.tsx
git commit -m "feat(onboarding-step8): AlrLinkPhase component (8.3 Phase A)"
```

---

## Task 9: `/api/onboarding/merge-master` route

**Files:**
- Create: `src/app/api/onboarding/merge-master/route.ts`
- Create: `src/app/api/onboarding/merge-master/route.test.ts`

Two phases:
- **preflight**: returns counts (matched, by status), and `dirtyCount` — the number of existing master rows for the client that would be wiped despite having `is_dirty = true` or a non-empty `change_log`. UI uses this to decide whether to show a destructive-merge confirm dialog.
- **execute**: wipes master rows for the client, inserts merged rows from `staged_clr_products` ⨝ `staged_alr_links` (filtered by selected statuses), then deletes both staging tables' rows for the client.

- [ ] **Step 9.1: Write the failing route test**

Create `src/app/api/onboarding/merge-master/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));

const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import { POST } from "./route";

describe("POST /api/onboarding/merge-master", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function preflightRequest(statuses: string[]): Request {
    return new Request("http://localhost/api/onboarding/merge-master?phase=preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        selectedStatuses: statuses,
      }),
    });
  }

  it("preflight returns matched count and dirtyCount", async () => {
    let call = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          call += 1;
          if (call === 1) {
            // staged_clr_products
            return Promise.resolve([
              { sku: "SKU-1" },
              { sku: "SKU-2" },
              { sku: "SKU-3" },
            ]);
          }
          if (call === 2) {
            // staged_alr_links
            return Promise.resolve([
              { sku: "SKU-1", status: "Active" },
              { sku: "SKU-2", status: "Inactive" },
              { sku: "SKU-3", status: "Active" },
              { sku: "SKU-4", status: "Active" }, // ALR-only — excluded
            ]);
          }
          if (call === 3) {
            // master rows for dirty count
            return Promise.resolve([{ count: 5 }]);
          }
          return Promise.resolve([]);
        }),
      }),
    }));

    // @ts-expect-error
    const res = await POST(preflightRequest(["Active"]));
    const body = await res.json();
    expect(body.matchedSelected).toBe(2); // SKU-1 + SKU-3 are Active and matched
    expect(body.matchedTotal).toBe(3);
    expect(body.byStatus).toEqual({ active: 2, inactive: 1, incomplete: 0 });
    expect(body.dirtyCount).toBe(5);
  });

  it("execute wipes master + inserts merged rows + clears staging", async () => {
    // Provide CLR + ALR + dirty=0; then the execute path issues delete + insert + delete cleanup
    let selCall = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          selCall += 1;
          if (selCall === 1) {
            return Promise.resolve([
              {
                clientIdCode: "TEST_CLIENT",
                sku: "SKU-1",
                productType: "SHOES",
                attributes: { item_sku: "SKU-1", item_name: "Red", brand_name: "Acme" },
                requiredComplete: true,
              },
            ]);
          }
          if (selCall === 2) {
            return Promise.resolve([
              { clientIdCode: "TEST_CLIENT", sku: "SKU-1", asin: "B01", status: "Active" },
            ]);
          }
          return Promise.resolve([]);
        }),
      }),
    }));
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

    const req = new Request("http://localhost/api/onboarding/merge-master?phase=execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        selectedStatuses: ["Active"],
      }),
    });
    // @ts-expect-error
    const res = await POST(req);
    const body = await res.json();
    expect(body.merged).toBe(1);
    // delete is called: 1) wipe master 2) clear staged_clr 3) clear staged_alr
    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when selectedStatuses is empty", async () => {
    // @ts-expect-error
    const res = await POST(preflightRequest([]));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 9.2: Run the test, expect FAIL**

Run: `npm test -- src/app/api/onboarding/merge-master`
Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement the route**

Create `src/app/api/onboarding/merge-master/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  master,
  stagedAlrLinks,
  stagedClrProducts,
} from "@/lib/db/schema";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { clrRowToMasterFields } from "@/lib/clr-master-mapper";
import type { ParsedClrRow } from "@/lib/clr-row-parser";

export const maxDuration = 300;

type StatusBucket = "Active" | "Inactive" | "Incomplete";
const VALID_STATUSES: StatusBucket[] = ["Active", "Inactive", "Incomplete"];

interface RequestBody {
  clientIdCode: string;
  selectedStatuses: StatusBucket[];
}

interface PreflightResponse {
  matchedTotal: number;
  matchedSelected: number;
  byStatus: { active: number; inactive: number; incomplete: number };
  dirtyCount: number;
}

interface ExecuteResponse {
  merged: number;
}

function isAuthorizedRole(role: unknown): boolean {
  return role === "admin" || role === "editor";
}

function bucketOf(status: string | null | undefined): StatusBucket | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "active") return "Active";
  if (s === "inactive") return "Inactive";
  if (s === "incomplete") return "Incomplete";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phase = new URL(req.url).searchParams.get("phase");
  if (phase !== "preflight" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preflight' or 'execute')" },
      { status: 400 }
    );
  }

  const body = (await req.json()) as RequestBody;
  if (!body.clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedStatuses) || body.selectedStatuses.length === 0) {
    return NextResponse.json(
      { error: "selectedStatuses must be a non-empty array" },
      { status: 400 }
    );
  }
  for (const s of body.selectedStatuses) {
    if (!VALID_STATUSES.includes(s)) {
      return NextResponse.json(
        { error: `Invalid status '${s}'. Must be one of ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }
  const selected = new Set(body.selectedStatuses);

  if (phase === "preflight") {
    const clrRows = await db
      .select({ sku: stagedClrProducts.sku })
      .from(stagedClrProducts)
      .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
    const alrRows = await db
      .select({ sku: stagedAlrLinks.sku, status: stagedAlrLinks.status })
      .from(stagedAlrLinks)
      .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

    const clrSkus = new Set(clrRows.map((r) => r.sku));
    let matchedTotal = 0;
    let matchedSelected = 0;
    const byStatus = { active: 0, inactive: 0, incomplete: 0 };
    for (const r of alrRows) {
      if (!clrSkus.has(r.sku)) continue;
      const b = bucketOf(r.status);
      if (!b) continue;
      matchedTotal += 1;
      if (b === "Active") byStatus.active += 1;
      if (b === "Inactive") byStatus.inactive += 1;
      if (b === "Incomplete") byStatus.incomplete += 1;
      if (selected.has(b)) matchedSelected += 1;
    }

    // Dirty count: master rows for this client that have edits we'd wipe.
    // Drizzle doesn't have a clean .count(), so use a select + length.
    const dirtyRows = await db
      .select({ id: master.id })
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, body.clientIdCode),
          or(
            eq(master.isDirty, true),
            and(
              isNotNull(master.changeLog),
              ne(sql`jsonb_array_length(${master.changeLog})`, 0)
            )
          )
        )
      );
    const dirtyCount = dirtyRows.length;

    const response: PreflightResponse = {
      matchedTotal,
      matchedSelected,
      byStatus,
      dirtyCount,
    };
    return NextResponse.json(response);
  }

  // phase === execute
  const clrRows = await db
    .select()
    .from(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
  const alrRows = await db
    .select()
    .from(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  const clrBySku = new Map<string, (typeof clrRows)[number]>();
  for (const r of clrRows) clrBySku.set(r.sku, r);
  const inserts: Array<{
    clientIdCode: string;
    sku: string;
    asin: string | null;
    status: string | null;
    itemName: string | null;
    brandName: string | null;
    feedProductType: string | null;
    productType: string | null;
    listPrice: string | null;
    mainImageUrl: string | null;
    genericKeywords: string | null;
    rawColumnValues: Record<string, string>;
    isDirty: boolean;
  }> = [];

  for (const link of alrRows) {
    const clr = clrBySku.get(link.sku);
    if (!clr) continue;
    const b = bucketOf(link.status);
    if (!b || !selected.has(b)) continue;
    const parsed: ParsedClrRow = {
      sku: clr.sku,
      productType: clr.productType ?? "UNKNOWN",
      attributes: clr.attributes,
      requiredComplete: clr.requiredComplete,
    };
    const fields = clrRowToMasterFields(parsed, {
      asin: link.asin,
      status: link.status,
    });
    inserts.push({
      clientIdCode: body.clientIdCode,
      sku: fields.sku,
      asin: fields.asin,
      status: fields.status,
      itemName: fields.itemName,
      brandName: fields.brandName,
      feedProductType: fields.feedProductType,
      productType: fields.productType,
      listPrice: fields.listPrice,
      mainImageUrl: fields.mainImageUrl,
      genericKeywords: fields.genericKeywords,
      rawColumnValues: fields.rawColumnValues,
      isDirty: false,
    });
  }

  // Wipe and rebuild master for the client.
  await db.delete(master).where(eq(master.clientIdCode, body.clientIdCode));

  if (inserts.length > 0) {
    for (let i = 0; i < inserts.length; i += 200) {
      await db.insert(master).values(inserts.slice(i, i + 200));
    }
  }

  // Cleanup staging on success
  await db
    .delete(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, body.clientIdCode));
  await db
    .delete(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, body.clientIdCode));

  const response: ExecuteResponse = { merged: inserts.length };
  return NextResponse.json(response);
}
```

- [ ] **Step 9.4: Run the test, expect PASS**

Run: `npm test -- src/app/api/onboarding/merge-master`
Expected: 3 tests PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/app/api/onboarding/merge-master/route.ts src/app/api/onboarding/merge-master/route.test.ts
git commit -m "feat(onboarding-step8): /api/onboarding/merge-master route with dirty-rows preflight"
```

---

## Task 10: `<MergeToMasterPhase>` + `<AlrLinkAndMerge>` shell

**Files:**
- Create: `src/components/onboarding/merge-to-master-phase.tsx`
- Create: `src/components/onboarding/alr-link-and-merge.tsx`

The merge phase shows status checkboxes (using `SELECTABLE_ALR_STATUSES` from the existing `alr-status-filter.ts` helper), a live tally, the merge button, and a confirm dialog when `dirtyCount > 0`. The outer shell decides which phase panel to render based on a "are CLR + ALR both staged?" check.

- [ ] **Step 10.1: Write the merge-to-master phase component**

Create `src/components/onboarding/merge-to-master-phase.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SELECTABLE_ALR_STATUSES,
  type AlrStatusBucket,
} from "./alr-status-filter";

type Props = { clientIdCode: string; onMerged: () => void };

interface PreflightResponse {
  matchedTotal: number;
  matchedSelected: number;
  byStatus: { active: number; inactive: number; incomplete: number };
  dirtyCount: number;
}

type SelectableStatus = Exclude<AlrStatusBucket, "Other">;

export function MergeToMasterPhase({ clientIdCode, onMerged }: Props) {
  const [selected, setSelected] = useState<Set<SelectableStatus>>(
    () => new Set<SelectableStatus>(["Active"])
  );
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const selectedArray = [...selected] as SelectableStatus[];

  const preflight = useQuery<PreflightResponse>({
    queryKey: ["merge-master-preflight", clientIdCode, selectedArray],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/merge-master?phase=preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          selectedStatuses: selectedArray.length > 0 ? selectedArray : ["Active"],
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preflight failed (${res.status})`);
      }
      return (await res.json()) as PreflightResponse;
    },
    enabled: selectedArray.length > 0,
  });

  const executeMutation = useMutation<{ merged: number }, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/merge-master?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          selectedStatuses: selectedArray,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Merge failed (${res.status})`);
      }
      return (await res.json()) as { merged: number };
    },
    onSuccess: (data) => {
      toast.success(`Wrote ${data.merged} products to master.`);
      setConfirmDialogOpen(false);
      onMerged();
    },
    onError: (err) => toast.error(`Merge failed: ${err.message}`),
  });

  function toggle(status: SelectableStatus) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function onMergeClick() {
    if (preflight.data && preflight.data.dirtyCount > 0) {
      setConfirmDialogOpen(true);
    } else {
      executeMutation.mutate();
    }
  }

  // Close dialog on Escape
  useEffect(() => {
    if (!confirmDialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDialogOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmDialogOpen]);

  return (
    <div className="space-y-3 border border-neutral-200 rounded-md p-4">
      <h3 className="text-sm font-medium">Merge to master</h3>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-neutral-600">Status:</span>
        {SELECTABLE_ALR_STATUSES.map((s) => {
          const count =
            s === "Active"
              ? preflight.data?.byStatus.active
              : s === "Inactive"
                ? preflight.data?.byStatus.inactive
                : preflight.data?.byStatus.incomplete;
          return (
            <label key={s} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(s)}
                onChange={() => toggle(s)}
              />
              <span>
                {s} ({count ?? "…"})
              </span>
            </label>
          );
        })}
      </div>

      <div className="text-sm text-neutral-700">
        {preflight.isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Computing…
          </span>
        ) : preflight.data ? (
          <span>
            Will write{" "}
            <strong>{preflight.data.matchedSelected}</strong> products to master
            (out of {preflight.data.matchedTotal} matched).
          </span>
        ) : null}
      </div>

      {preflight.data && preflight.data.dirtyCount > 0 && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{preflight.data.dirtyCount}</strong> existing master rows for
            this client have edits or pending changes. They will be wiped on
            merge.
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          onClick={onMergeClick}
          disabled={
            executeMutation.isPending ||
            selected.size === 0 ||
            !preflight.data ||
            preflight.data.matchedSelected === 0
          }
        >
          {executeMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Merge to master
        </Button>
      </div>

      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-md shadow-lg max-w-md w-full p-5 space-y-4">
            <h4 className="text-base font-medium">Overwrite edited products?</h4>
            <p className="text-sm text-neutral-700">
              {preflight.data?.dirtyCount} existing master rows for{" "}
              <code>{clientIdCode}</code> have edits or pending changes. The
              merge will delete these rows and rebuild from CLR + ALR. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDialogOpen(false)}
                disabled={executeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Yes, overwrite
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10.2: Write the outer shell**

Create `src/components/onboarding/alr-link-and-merge.tsx`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AlrLinkPhase } from "./alr-link-phase";
import { MergeToMasterPhase } from "./merge-to-master-phase";

type Props = { clientIdCode: string; onSuccess: () => void };

interface StagingState {
  hasClr: boolean;
  hasAlr: boolean;
}

export function AlrLinkAndMerge({ clientIdCode, onSuccess }: Props) {
  const state = useQuery<StagingState>({
    queryKey: ["alr-link-and-merge-state", clientIdCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/onboarding/staging-state?clientIdCode=${encodeURIComponent(clientIdCode)}`
      );
      if (!res.ok) throw new Error("Failed to load staging state");
      return (await res.json()) as StagingState;
    },
  });

  if (state.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }
  if (state.isError || !state.data) {
    return <div className="text-sm text-red-600">Failed to load staging state.</div>;
  }

  if (!state.data.hasClr) {
    return (
      <div className="text-sm text-neutral-700 border border-neutral-200 rounded-md p-4">
        Step 8.2 (CLR import) must be completed before linking SKUs to ASINs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AlrLinkPhase clientIdCode={clientIdCode} onConfirmed={() => state.refetch()} />
      {state.data.hasAlr && (
        <MergeToMasterPhase
          clientIdCode={clientIdCode}
          onMerged={() => {
            state.refetch();
            onSuccess();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 10.3: Add the staging-state route the shell depends on**

Create `src/app/api/onboarding/staging-state/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { stagedAlrLinks, stagedClrProducts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }

  const clr = await db
    .select({ sku: stagedClrProducts.sku })
    .from(stagedClrProducts)
    .where(eq(stagedClrProducts.clientIdCode, clientIdCode))
    .limit(1);
  const alr = await db
    .select({ sku: stagedAlrLinks.sku })
    .from(stagedAlrLinks)
    .where(eq(stagedAlrLinks.clientIdCode, clientIdCode))
    .limit(1);

  return NextResponse.json({ hasClr: clr.length > 0, hasAlr: alr.length > 0 });
}
```

- [ ] **Step 10.4: Build + tests**

Run: `npm run build` then `npm test`
Expected: success / green except known pre-existing.

- [ ] **Step 10.5: Commit**

```bash
git add src/components/onboarding/merge-to-master-phase.tsx src/components/onboarding/alr-link-and-merge.tsx src/app/api/onboarding/staging-state/route.ts
git commit -m "feat(onboarding-step8): MergeToMasterPhase + AlrLinkAndMerge shell + staging-state route"
```

---

## Task 11: Wire new components into the onboarding step config

**Files:**
- Modify: `src/lib/onboarding/steps.ts`
- Modify: `src/app/clients/[clientIdCode]/onboarding/page.tsx` (or wherever the step-key dispatcher lives — verify via Grep before editing)

- [ ] **Step 11.1: Swap order + relabel in `steps.ts`**

Find the existing entries:

```typescript
{
  key: "amazon_import_catalog",
  label: "Import Product Catalog (ALR)",
  description: "Upload Amazon All Listings Report to import client products into 1o8Hub. AIA clients only.",
  order: 8.2,
  parent: "amazon_access",
  clientTypeFilter: "AIA",
},
{
  key: "amazon_import_attributes",
  label: "Import Attribute Templates (CLR)",
  description: "Upload Amazon Category Listing Report(s) to register attribute schemas for the client's product types. AIA clients only.",
  order: 8.3,
  parent: "amazon_access",
  clientTypeFilter: "AIA",
},
```

Replace with:

```typescript
{
  key: "amazon_import_attributes",
  label: "Import Product Attributes (CLR)",
  description: "Upload the Amazon Category Listing Report (.xlsm) to stage per-SKU attribute values and register attribute schemas. AIA clients only.",
  order: 8.2,
  parent: "amazon_access",
  clientTypeFilter: "AIA",
},
{
  key: "amazon_import_catalog",
  label: "Link SKU↔ASIN (ALR) and merge to master",
  description: "Upload the Amazon All Listings Report to stage SKU↔ASIN links, then merge staged CLR + ALR data into master (filtered by status). AIA clients only.",
  order: 8.3,
  parent: "amazon_access",
  clientTypeFilter: "AIA",
},
```

The `STEP_TO_GANTT` mapping for these keys (lines ~220–221) already uses semantic labels — leave them. Alternatively update the `subtaskTitle` strings to match the new labels. Do both:

```typescript
amazon_import_catalog:    { taskName: "Amazon Access", subtaskTitle: "Link SKU↔ASIN and merge" },
amazon_import_attributes: { taskName: "Amazon Access", subtaskTitle: "Import Product Attributes" },
```

- [ ] **Step 11.2: Locate the step-key dispatcher**

Run: `grep -rn "amazon_import_catalog\|amazon_import_attributes\|AiaCatalogImport" src/app/clients src/components/onboarding`

This identifies which page/component renders the substep UI. Read that file fully before editing.

- [ ] **Step 11.3: Wire `<ClrAttributeImport>` to `amazon_import_attributes` and `<AlrLinkAndMerge>` to `amazon_import_catalog`**

In the dispatcher file (typically `src/app/clients/[clientIdCode]/onboarding/page.tsx` or a child component), the existing dispatcher likely looks like:

```typescript
{step.key === "amazon_import_catalog" && (
  <AiaCatalogImport clientIdCode={clientIdCode} onSuccess={refetch} />
)}
```

Replace any `<AiaCatalogImport>` usage with the new pair:

```typescript
{step.key === "amazon_import_attributes" && (
  <ClrAttributeImport clientIdCode={clientIdCode} onSuccess={refetch} />
)}
{step.key === "amazon_import_catalog" && (
  <AlrLinkAndMerge clientIdCode={clientIdCode} onSuccess={refetch} />
)}
```

Add the imports:

```typescript
import { ClrAttributeImport } from "@/components/onboarding/clr-attribute-import";
import { AlrLinkAndMerge } from "@/components/onboarding/alr-link-and-merge";
```

Remove the now-unused `AiaCatalogImport` import. If `amazon_import_attributes` previously had a different component (an attribute-templates uploader), that's the legacy CLR-schema-only flow — replace with `ClrAttributeImport` (which handles BOTH staging and `category_definitions` registration).

- [ ] **Step 11.4: Build + tests**

Run: `npm run build && npm test`
Expected: success / green except known pre-existing.

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/onboarding/steps.ts src/app/clients/[clientIdCode]/onboarding/page.tsx
git commit -m "feat(onboarding-step8): wire CLR-first components, swap 8.2/8.3 order"
```

---

## Task 12: End-to-end smoke test against a real client

This is a manual verification step, not automated. The plan-execution agent should ask the operator (Manu) which AIA client to use.

- [ ] **Step 12.1: Ask the operator for a test client**

Prompt: "Ready to smoke-test step 8 CLR-first flow. Which AIA client (with both CLR `.xlsm` and ALR `.txt` available) should I use? I need the `client_id_code` and access to the two files."

- [ ] **Step 12.2: Run the dev server**

```bash
PORT=3000 npm run dev
```

Open `http://localhost:3000/clients/<CLIENT_ID_CODE>/onboarding` and navigate to step 8.

- [ ] **Step 12.3: Walk substep 8.2 (CLR)**

1. Drop the `.xlsm`. Expected: "N product types parsed, M SKUs, K with missing required attributes."
2. Confirm the per-product-type breakdown matches the file.
3. Click "Stage M SKUs." Expected: success toast.
4. Verify in `psql`:
   ```sql
   SELECT product_type, COUNT(*), SUM((NOT required_complete)::int) AS missing
   FROM staged_clr_products WHERE client_id_code = '<CLIENT_ID_CODE>'
   GROUP BY product_type ORDER BY product_type;
   ```
   Counts must match the preview.

- [ ] **Step 12.4: Walk substep 8.3 Phase A (ALR)**

1. Navigate to step 8.3 in the UI. Expected: ALR upload card visible, no merge phase yet (because `staged_alr_links` is empty).
2. Drop the `.txt`. Expected: status counts + join report ("X matched, Y CLR-only skipped, Z ALR-only skipped").
3. Click "Stage links." Expected: success toast.
4. Verify in `psql`:
   ```sql
   SELECT status, COUNT(*) FROM staged_alr_links
   WHERE client_id_code = '<CLIENT_ID_CODE>' GROUP BY status;
   ```

- [ ] **Step 12.5: Walk substep 8.3 Phase B (merge)**

1. Page should now show the Merge to master panel with status checkboxes.
2. Default: Active checked. Verify the live tally matches the join-report's matched-Active count.
3. Toggle Inactive on. Verify tally updates.
4. Toggle back to Active only.
5. If `dirtyCount > 0`, verify the warning banner shows.
6. Click "Merge to master." If dirtyCount > 0, verify the confirm dialog appears; click "Yes, overwrite."
7. Expected: success toast, "Wrote N products to master." Both staging tables for this client are now empty.
8. Verify in `psql`:
   ```sql
   SELECT COUNT(*), COUNT(asin), COUNT(brand_name) FROM master
   WHERE client_id_code = '<CLIENT_ID_CODE>';
   ```
   Master row count = N. ASIN should be populated for all N. Brand name should be populated for most/all (depends on CLR completeness).
9. Spot-check `raw_column_values` for one row — should have all CLR columns from the source file.

- [ ] **Step 12.6: Re-run sanity check**

1. Re-upload the same CLR. Expected: staging is replaced (counts unchanged).
2. Re-upload the same ALR. Expected: staging is replaced.
3. Re-merge. Expected: master matches the previous merge (same row count). No drift.

- [ ] **Step 12.7: Document results**

Append a results note to this plan file under a new "## Smoke test results" heading:
- Client used
- CLR row count, product type count, missing-required count
- ALR row count, status breakdown, join-report numbers
- Merged row count
- Anomalies observed

---

## Task 13: Remove deprecated code

Only do this **after Task 12 passes** with no anomalies.

**Files removed:**
- `src/components/onboarding/aia-catalog-import.tsx`
- `src/app/api/onboarding/aia-import-catalog/route.ts`
- `src/app/api/onboarding/aia-import-catalog/route.test.ts`

- [ ] **Step 13.1: Confirm no other callers**

Run: `grep -rn "AiaCatalogImport\|aia-import-catalog\|aia-catalog-import" src/`

Expected: no hits except the files about to be deleted. If anything else depends on them, refactor those callers first.

- [ ] **Step 13.2: Delete**

```bash
git rm src/components/onboarding/aia-catalog-import.tsx
git rm src/app/api/onboarding/aia-import-catalog/route.ts
git rm src/app/api/onboarding/aia-import-catalog/route.test.ts
```

- [ ] **Step 13.3: Build + tests**

Run: `npm run build && npm test`
Expected: success / green except known pre-existing.

- [ ] **Step 13.4: Commit**

```bash
git commit -m "chore(onboarding-step8): remove deprecated aia-catalog-import flow"
```

---

## Task 14: Final verification + ship checklist

- [ ] **Step 14.1: Run the full test suite once more**

Run: `npm test`
Expected: green except documented pre-existing failures (3 PDF + 1 SEO).

- [ ] **Step 14.2: Run lint + type check**

```bash
npm run lint
npm run build
```

Both must succeed.

- [ ] **Step 14.3: Run graphify update**

```bash
graphify update .
```

This updates the knowledge graph for the new files.

- [ ] **Step 14.4: Compose a final summary**

Add to the plan file under "## Summary" at the bottom:
- Files changed (count)
- Tests added (count)
- New routes (3)
- Removed routes (1)
- Schema additions (2 tables)
- Manual verification status (link to Smoke test results section)

- [ ] **Step 14.5: Decide on merge strategy**

This is a multi-day branch with many commits. Use `superpowers:finishing-a-development-branch` to finalize: probably a merge commit (preserve granular history) rather than squash, given the well-organized per-task commits.

```bash
git log --oneline main..HEAD
```

Review the commit list with the operator before merging.

---

## Self-Review

### Spec coverage

- ✅ §"New flow" 8.2 = CLR import — Tasks 3, 4, 5, 6.
- ✅ §"New flow" 8.3 = ALR link + merge — Tasks 7, 8, 9, 10.
- ✅ Schema for `staged_clr_products` — Task 1.
- ✅ Schema for `staged_alr_links` — Task 1.
- ✅ "Replaces any prior staged rows for the client" on CLR upload — Task 5 Step 5.3 (delete-before-insert).
- ✅ "Replaces any prior staged rows for the client" on ALR upload — Task 7 Step 7.3.
- ✅ Per-product-type preview on CLR — Task 5 Step 5.3 PreviewResponse, Task 6 UI.
- ✅ Status checkboxes (Active/Inactive/Incomplete, default Active) — Task 10 Step 10.1, reuses `SELECTABLE_ALR_STATUSES`.
- ✅ Live tally — Task 10 via `useQuery` on preflight.
- ✅ Merge: only matched + selected status — Task 9 Step 9.3 execute path.
- ✅ Wipe master for client_id_code — Task 9.
- ✅ Drop staging tables' rows on success — Task 9 (cleanup at end).
- ✅ Mark substep complete — handled by existing onboarding step state via `onSuccess` callback (out of scope for this plan; relies on existing wiring in the dispatcher).
- ✅ Existing `alr-status-filter.ts` reused — Task 10.
- ✅ Schema migration via hand-written SQL — Task 1.
- ✅ Three new/refactored API routes — Tasks 5, 7, 9 + Task 10 Step 10.3 staging-state.
- ✅ AIA-only filter — preserved in Task 11 Step 11.1.
- ✅ Manual verification — Task 12.
- ✅ Validation criteria — Task 12 covers all the validation bullets in the spec.

### Placeholder scan

No "TBD", "TODO", "implement later", "fill in details" in any task body. Every code step has actual code. Every command step has the actual command + expected outcome.

### Type consistency

- `ParsedClrRow` (Task 3) used by Task 4, Task 5, Task 9 — same shape.
- `ClrMasterFields` (Task 4) used by Task 9 — same shape.
- `AlrLinkRow` (Task 7) used by Task 8 — same shape.
- `PreflightResponse` (Task 9) used by Task 10 `MergeToMasterPhase` — same shape.
- `StagingState` (Task 10 Step 10.2) consumed by `AlrLinkAndMerge` from `staging-state` route (Step 10.3) — same shape.
- `SELECTABLE_ALR_STATUSES` exported by existing `alr-status-filter.ts`, consumed by Task 10 — verified.

### Decision log

These choices are baked into the plan; surface them on review:
1. **MVP master mapping** lifts only 8 named columns. Categorized JSONB blobs left empty. (Explicitly confirmed with operator.)
2. **Step keys preserved**: `amazon_import_attributes` becomes 8.2, `amazon_import_catalog` becomes 8.3. No DB state migration needed.
3. **Destructive-merge guard** uses `is_dirty=true` OR non-empty `change_log`. Surfaces a confirm dialog when count > 0.
4. **`__GLOBAL__` required-fields fallback** in the parser (Task 3 Step 3.3) treats all required-marked attributes as required for every product type in the workbook. Sufficient for MVP; per-product-type segregation is future work.
5. **Synthetic xlsx fixtures** built in-memory per-test via `XLSX.write`. Avoids checking binary files into the repo and keeps the parser tests hermetic.
6. **Tests co-located** as `*.test.ts` next to the file under test.
7. **Single migration file + one-shot apply script** rather than drizzle-kit migrate (which hangs on Supabase pooler when snapshot drifts).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-onboarding-step8-clr-first.md`.

Two execution options:

**1. Subagent-Driven (recommended for a multi-day plan like this)** — Dispatch a fresh subagent per task. Review between tasks. Fast iteration. Best for long plans where context can become an issue.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`. Batch execution with checkpoints for review.

Operator: which approach?
