# Onboarding Step 8 — AIA Catalog & Attribute Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new AIA-only sub-steps to onboarding step 8 — **8.2 Import Product Catalog (ALR)** that uploads an Amazon All Listings Report (TSV) and bulk-imports rows into `master` with a hybrid duplicate dialog, and **8.3 Import Attribute Templates (CLR)** that wraps the existing CLR upload as a re-runnable onboarding sub-step.

**Architecture:** Pure additive feature on top of existing onboarding infrastructure. New `clientTypeFilter` field on `OnboardingStepDef` (analogous to existing `marketplaceFilter`) gates both new steps to `clientType === "AIA"`. New TSV parser (`src/lib/alr-parser.ts`) feeds a new two-phase API route (`/api/onboarding/aia-import-catalog`) that mirrors the conflict-mode semantics (`skip`/`overwrite`/`merge`) from `/api/import/execute`. New UI component renders preview summary + hybrid duplicate dialog. The 8.3 wrapper is a thin shell that re-uses the existing `<CategoryUpload>` component and `/api/category-definitions` endpoint unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (`postgres` driver), Tailwind CSS 4 + shadcn/ui (Radix), Vitest + Testing Library, TanStack Query, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-04-28-onboarding-step8-aia-import-design.md`

**Branch:** `feat/onboarding-aia-import` off `main` at `80cc4a5`. Recommend running this in a worktree (`/Users/manu/1o8Hub/.worktrees/aia-import/`).

---

## File Structure

**New files (production):**
- `src/lib/alr-parser.ts` — TSV parsing + ALR-row → master-row mapping helpers
- `src/app/api/onboarding/aia-import-catalog/route.ts` — two-phase POST endpoint (preview, execute)
- `src/components/onboarding/aia-catalog-import.tsx` — upload UI + hybrid duplicate dialog

**New files (tests):**
- `src/lib/alr-parser.test.ts`
- `src/app/api/onboarding/aia-import-catalog/route.test.ts`

**Modified files:**
- `src/lib/onboarding/steps.ts` — add `clientTypeFilter` field + 2 step entries + 2 Gantt mappings
- `src/app/api/clients/[clientIdCode]/onboarding/route.ts` — fetch `aac.clientType` and add a filter pass on `clientTypeFilter`
- `src/app/clients/[clientIdCode]/onboarding/page.tsx` — render the new substeps with their custom panels (catalog import component on 8.2, `<CategoryUpload>` on 8.3)

**Total estimate:** ~700–900 LOC including tests.

---

## Master schema reality check

The spec describes ALR-to-master mappings using property names (`master.title`, `master.description`, `master.price`, `master.imageUrl`, `master.fulfillmentChannel`, `master.openDate`, `master.quantity`) that **do not match** the actual Drizzle schema in `src/lib/db/schema.ts:130-235`. Real columns:

| ALR column | Master column |
|---|---|
| `seller-sku` | `sku` |
| `asin1` | `asin` |
| `item-name` | `itemName` (text) |
| `image-url` | `mainImageUrl` (text) |
| `price` | `listPrice` (varchar 50) |
| `status` | `status` |
| (default `"US"`) | `marketplace` |
| (param) | `clientIdCode` |
| `item-description` | (no core col → `rawColumnValues.ItemDescription`) |
| `quantity` | (no core col → `rawColumnValues.Quantity`) |
| `fulfillment-channel` | (no core col → `rawColumnValues.FulfillmentChannel`) |
| `open-date` | (no core col → `rawColumnValues.OpenDate`) |
| `listing-id` | (no core col → `rawColumnValues.ListingID`) |

**Decision:** raw blob lives in `rawColumnValues` (jsonb, `Record<string, string>` per `src/lib/db/schema.ts:200-202`) — same pattern the existing import path uses. Every ALR column lands verbatim in `rawColumnValues` for zero data loss; the subset above also flows into core columns.

---

## Task 1: ALR parser + tests

**Goal:** Pure-function TSV parser that converts raw ALR text into typed `AlrRow[]`, plus a mapping helper that produces a partial master-row object suitable for insert/update.

**Files:**
- Create: `src/lib/alr-parser.ts`
- Test: `src/lib/alr-parser.test.ts`

### Step 1.1: Write failing test for header parsing

- [ ] Create `src/lib/alr-parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAlr, alrRowToMasterFields } from "./alr-parser";

const HEADER =
  "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url";

function tsv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseAlr", () => {
  it("parses header row and a single Active listing", () => {
    const text = tsv([
      "Apollo Hat Black\tA classic black hat\tLISTING-1\tAPOLLO-HAT-BLK\t29.99\t12\tB000111111\tActive\tAMAZON_NA\t2024-01-01\thttps://m.media-amazon.com/images/I/abc.jpg",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      itemName: "Apollo Hat Black",
      itemDescription: "A classic black hat",
      listingId: "LISTING-1",
      sellerSku: "APOLLO-HAT-BLK",
      price: "29.99",
      quantity: "12",
      asin1: "B000111111",
      status: "Active",
      fulfillmentChannel: "AMAZON_NA",
      openDate: "2024-01-01",
      imageUrl: "https://m.media-amazon.com/images/I/abc.jpg",
      raw: {
        "item-name": "Apollo Hat Black",
        "item-description": "A classic black hat",
        "listing-id": "LISTING-1",
        "seller-sku": "APOLLO-HAT-BLK",
        price: "29.99",
        quantity: "12",
        asin1: "B000111111",
        status: "Active",
        "fulfillment-channel": "AMAZON_NA",
        "open-date": "2024-01-01",
        "image-url": "https://m.media-amazon.com/images/I/abc.jpg",
      },
      rowIndex: 0,
    });
  });
});
```

### Step 1.2: Run test to verify it fails

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/lib/alr-parser.test.ts`
- Expected: FAIL — module `./alr-parser` not found.

### Step 1.3: Implement minimal parser

- [ ] Create `src/lib/alr-parser.ts`:

```ts
/**
 * Parser for Amazon All Listings Reports (ALR).
 *
 * ALR is tab-separated with a header row. We expose a strongly-typed AlrRow
 * for the columns we map to master core columns, plus a verbatim `raw` map
 * holding every column for zero-data-loss into master.rawColumnValues.
 */

export interface AlrRow {
  /** ALR `item-name` → master.itemName */
  itemName: string;
  /** ALR `item-description` → rawColumnValues only */
  itemDescription: string;
  /** ALR `listing-id` → rawColumnValues only */
  listingId: string;
  /** ALR `seller-sku` → master.sku */
  sellerSku: string;
  /** ALR `price` → master.listPrice */
  price: string;
  /** ALR `quantity` → rawColumnValues only */
  quantity: string;
  /** ALR `asin1` → master.asin */
  asin1: string;
  /** ALR `status` → master.status (Active / Inactive / Incomplete) */
  status: string;
  /** ALR `fulfillment-channel` → rawColumnValues (AMAZON_NA = FBA, DEFAULT = FBM) */
  fulfillmentChannel: string;
  /** ALR `open-date` → rawColumnValues */
  openDate: string;
  /** ALR `image-url` → master.mainImageUrl */
  imageUrl: string;
  /** Verbatim header → cell map for the row, used for rawColumnValues */
  raw: Record<string, string>;
  /** Zero-based index of this data row (for error reporting and stable IDs) */
  rowIndex: number;
}

/**
 * Parse an ALR TSV string. Throws on a missing header row or required columns.
 * Required columns: seller-sku, asin1, item-name, status.
 */
export function parseAlr(text: string): AlrRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() === "") {
    throw new Error("ALR file is empty");
  }
  const header = lines[0].split("\t").map((h) => h.trim());
  const required = ["seller-sku", "asin1", "item-name", "status"];
  for (const col of required) {
    if (!header.includes(col)) {
      throw new Error(`ALR is missing required column: ${col}`);
    }
  }
  const idx = (col: string) => header.indexOf(col);

  const rows: AlrRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === "") continue;
    const cells = line.split("\t");
    const raw: Record<string, string> = {};
    for (let h = 0; h < header.length; h++) {
      raw[header[h]] = (cells[h] ?? "").trim();
    }
    const get = (col: string) => (cells[idx(col)] ?? "").trim();
    rows.push({
      itemName: get("item-name"),
      itemDescription: get("item-description"),
      listingId: get("listing-id"),
      sellerSku: get("seller-sku"),
      price: get("price"),
      quantity: get("quantity"),
      asin1: get("asin1"),
      status: get("status"),
      fulfillmentChannel: get("fulfillment-channel"),
      openDate: get("open-date"),
      imageUrl: get("image-url"),
      raw,
      rowIndex: rows.length,
    });
  }
  return rows;
}

/**
 * Master-table fields derived from an ALR row. Everything also lands in
 * rawColumnValues (the `raw` field of AlrRow) — these are just the subset
 * that maps to indexed/typed core columns on master.
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

/** Default marketplace when ALR has no marketplace column. */
export const DEFAULT_MARKETPLACE = "US";

export function alrRowToMasterFields(row: AlrRow): AlrMasterFields {
  return {
    asin: row.asin1 || null,
    sku: row.sellerSku || null,
    marketplace: DEFAULT_MARKETPLACE,
    status: row.status || null,
    itemName: row.itemName || null,
    mainImageUrl: row.imageUrl || null,
    listPrice: row.price || null,
    rawColumnValues: row.raw,
  };
}
```

### Step 1.4: Run test to verify it passes

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/lib/alr-parser.test.ts`
- Expected: PASS (1 test).

### Step 1.5: Add edge-case tests

- [ ] Append to `src/lib/alr-parser.test.ts`:

```ts
describe("parseAlr edge cases", () => {
  it("throws on empty input", () => {
    expect(() => parseAlr("")).toThrow(/empty/i);
  });

  it("throws when required columns are missing", () => {
    expect(() => parseAlr("item-name\tprice\nfoo\t1.00")).toThrow(/seller-sku/);
  });

  it("skips blank trailing lines", () => {
    const text = tsv([
      "X\t\t\tSKU1\t\t\tB1\tActive\t\t\t",
      "",
      "",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(1);
  });

  it("parses Inactive and Incomplete (parent variation) rows", () => {
    const text = tsv([
      "Apollo Hat\t\t\tAPOLLO-HAT\t\t\t\tIncomplete\t\t\t",
      "Old Hat\t\t\tOLD-HAT\t\t\tB000222\tInactive\t\t\t",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("Incomplete");
    expect(rows[0].asin1).toBe(""); // parent variation has no ASIN
    expect(rows[1].status).toBe("Inactive");
  });

  it("handles row with blank ASIN (parent variation placeholder)", () => {
    const text = tsv([
      "Structured Visor\t\t\tSTRUCTUREDVISOR\t\t\t\tIncomplete\t\t\t",
    ]);
    const rows = parseAlr(text);
    expect(rows[0].asin1).toBe("");
    expect(rows[0].sellerSku).toBe("STRUCTUREDVISOR");
  });
});

describe("alrRowToMasterFields", () => {
  it("maps ALR row to master core fields with US default marketplace", () => {
    const text = tsv([
      "Apollo Hat\tA hat\tL1\tSKU1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ]);
    const [row] = parseAlr(text);
    expect(alrRowToMasterFields(row)).toEqual({
      asin: "B000111",
      sku: "SKU1",
      marketplace: "US",
      status: "Active",
      itemName: "Apollo Hat",
      mainImageUrl: "https://img/a.jpg",
      listPrice: "10.00",
      rawColumnValues: row.raw,
    });
  });

  it("returns null for blank ASIN/SKU (parent variations)", () => {
    const text = tsv([
      "Apollo Hat\t\t\t\t\t\t\tIncomplete\t\t\t",
    ]);
    const [row] = parseAlr(text);
    const fields = alrRowToMasterFields(row);
    expect(fields.asin).toBe(null);
    expect(fields.sku).toBe(null);
    expect(fields.itemName).toBe("Apollo Hat");
  });
});
```

### Step 1.6: Run all parser tests

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/lib/alr-parser.test.ts`
- Expected: PASS (7 tests).

### Step 1.7: Commit

- [ ] Run:

```bash
cd /Users/manu/1o8Hub
git add src/lib/alr-parser.ts src/lib/alr-parser.test.ts
git commit -m "feat(alr-parser): TSV parser + master-field mapper for AIA catalog import"
```

---

## Task 2: API route — POST /api/onboarding/aia-import-catalog (preview + execute)

**Goal:** Two-phase endpoint. **Phase 1 (`?phase=preview`)** parses the TSV, runs the duplicate-match algorithm, and returns a summary + duplicates list. **Phase 2 (`?phase=execute`)** receives parsed rows + per-row decisions and writes to `master`. Editor/admin only.

**Files:**
- Create: `src/app/api/onboarding/aia-import-catalog/route.ts`
- Test: `src/app/api/onboarding/aia-import-catalog/route.test.ts`

### Match algorithm (recap from spec)

For each ALR row scoped to `clientIdCode = currentClient`:

1. **Strict** — `WHERE asin = :asin1 AND sku = :sellerSku AND marketplace = "US" AND clientIdCode = :code`
2. **Fallback** — when strict misses: `WHERE asin = :asin1 AND clientIdCode = :code AND (sku IS NULL OR sku = '')`
3. If either matches → flag as duplicate. Else → insert as new.

Rows with blank `asin1` (parent variations) skip the strict probe and go straight to insert (no fallback either, since fallback also keys on ASIN).

### Conflict modes (mirroring `src/app/api/import/execute/route.ts:211-248`)

- **skip** — `skipped++`, leave master untouched.
- **overwrite** — replace mapped fields, `set isDirty: true`.
- **merge** — only fill fields where the existing master value is empty/null, `set isDirty: true`.

### Step 2.1: Write failing test — auth gate

- [ ] Create `src/app/api/onboarding/aia-import-catalog/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockedGetAuthSession, mockedDb } = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/db", () => ({ db: mockedDb }));

import { POST } from "./route";

const editorSession = { user: { email: "ed@1o8.agency", role: "editor" } };
const viewerSession = { user: { email: "vw@1o8.agency", role: "viewer" } };

function form(file: { content: string; name?: string }, fields: Record<string, string>): NextRequest {
  const fd = new FormData();
  fd.append(
    "file",
    new File([file.content], file.name ?? "alr.txt", { type: "text/tab-separated-values" })
  );
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest("http://localhost/api/onboarding/aia-import-catalog?phase=preview", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/onboarding/aia-import-catalog — auth", () => {
  it("401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(form({ content: "" }, { clientIdCode: "ABC123" }));
    expect(res.status).toBe(401);
  });

  it("403 when role is viewer", async () => {
    mockedGetAuthSession.mockResolvedValue(viewerSession);
    const res = await POST(form({ content: "" }, { clientIdCode: "ABC123" }));
    expect(res.status).toBe(403);
  });
});
```

### Step 2.2: Run test to verify it fails

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/app/api/onboarding/aia-import-catalog/route.test.ts`
- Expected: FAIL — module `./route` not found.

### Step 2.3: Implement the route — skeleton + auth + preview phase

- [ ] Create `src/app/api/onboarding/aia-import-catalog/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { parseAlr, alrRowToMasterFields, DEFAULT_MARKETPLACE, type AlrRow } from "@/lib/alr-parser";

export const maxDuration = 60;

type ConflictMode = "skip" | "overwrite" | "merge";

interface DuplicateInfo {
  rowIndex: number;
  sku: string;
  asin: string;
  masterTitle: string | null;
  incomingTitle: string;
  matchType: "strict" | "fallback";
}

interface PreviewResponse {
  totalRows: number;
  newCount: number;
  activeCount: number;
  inactiveCount: number;
  incompleteCount: number;
  duplicates: DuplicateInfo[];
  parsedRows: AlrRow[]; // echoed back so phase 2 doesn't have to re-parse
}

interface ExecuteRequestBody {
  clientIdCode: string;
  parsedRows: AlrRow[];
  globalMode: ConflictMode;
  rowOverrides?: Record<number, ConflictMode | "use-global">;
}

interface ExecuteResponse {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  duration: string;
}

function isAuthorizedRole(role: unknown): boolean {
  return role === "admin" || role === "editor";
}

async function findExistingMaster(clientIdCode: string, asin: string, sku: string) {
  const strict = await db
    .select()
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        eq(master.asin, asin),
        eq(master.sku, sku),
        eq(master.marketplace, DEFAULT_MARKETPLACE)
      )
    )
    .limit(1);
  if (strict.length > 0) {
    return { row: strict[0], matchType: "strict" as const };
  }
  const fallback = await db
    .select()
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        eq(master.asin, asin),
        or(isNull(master.sku), eq(master.sku, ""))
      )
    )
    .limit(1);
  if (fallback.length > 0) {
    return { row: fallback[0], matchType: "fallback" as const };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAuthorizedRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const phase = url.searchParams.get("phase");
  if (phase !== "preview" && phase !== "execute") {
    return NextResponse.json(
      { error: "Missing or invalid ?phase= (must be 'preview' or 'execute')" },
      { status: 400 }
    );
  }

  if (phase === "preview") {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientIdCode = (formData.get("clientIdCode") as string | null)?.trim() ?? "";
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    if (!clientIdCode) return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });

    let parsedRows: AlrRow[];
    try {
      parsedRows = parseAlr(await file.text());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse error";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    let activeCount = 0;
    let inactiveCount = 0;
    let incompleteCount = 0;
    const duplicates: DuplicateInfo[] = [];

    for (const row of parsedRows) {
      const status = row.status.toLowerCase();
      if (status === "active") activeCount++;
      else if (status === "inactive") inactiveCount++;
      else if (status === "incomplete") incompleteCount++;

      // Skip duplicate probe for rows missing ASIN (parent variations)
      if (!row.asin1 || !row.sellerSku) continue;

      const existing = await findExistingMaster(clientIdCode, row.asin1, row.sellerSku);
      if (existing) {
        duplicates.push({
          rowIndex: row.rowIndex,
          sku: row.sellerSku,
          asin: row.asin1,
          masterTitle: existing.row.itemName ?? null,
          incomingTitle: row.itemName,
          matchType: existing.matchType,
        });
      }
    }

    const body: PreviewResponse = {
      totalRows: parsedRows.length,
      newCount: parsedRows.length - duplicates.length,
      activeCount,
      inactiveCount,
      incompleteCount,
      duplicates,
      parsedRows,
    };
    return NextResponse.json(body);
  }

  // phase === "execute"
  const startTime = Date.now();
  const body = (await req.json()) as ExecuteRequestBody;
  if (!body.clientIdCode || !Array.isArray(body.parsedRows)) {
    return NextResponse.json({ error: "Missing clientIdCode or parsedRows" }, { status: 400 });
  }
  const globalMode: ConflictMode = body.globalMode ?? "merge";
  const overrides = body.rowOverrides ?? {};

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of body.parsedRows) {
    try {
      const fields = alrRowToMasterFields(row);

      // Skip parent-variation rows that have no ASIN AND no SKU — nothing to key on
      if (!fields.asin && !fields.sku) {
        // Insert anyway as a bare row keyed only on clientIdCode + itemName
        await db.insert(master).values({
          clientIdCode: body.clientIdCode,
          itemName: fields.itemName,
          status: fields.status,
          rawColumnValues: fields.rawColumnValues,
          isDirty: true,
        });
        inserted++;
        continue;
      }

      const existing =
        fields.asin && fields.sku
          ? await findExistingMaster(body.clientIdCode, fields.asin, fields.sku)
          : null;

      if (existing) {
        const override = overrides[row.rowIndex];
        const mode: ConflictMode = override && override !== "use-global" ? override : globalMode;

        if (mode === "skip") {
          skipped++;
          continue;
        }

        if (mode === "overwrite") {
          await db
            .update(master)
            .set({
              asin: fields.asin,
              sku: fields.sku,
              marketplace: fields.marketplace,
              status: fields.status,
              itemName: fields.itemName,
              mainImageUrl: fields.mainImageUrl,
              listPrice: fields.listPrice,
              rawColumnValues: fields.rawColumnValues,
              updatedAt: new Date(),
              isDirty: true,
            })
            .where(eq(master.id, existing.row.id));
          updated++;
        } else {
          // merge — only fill empty/null core fields, but always merge raw blob (incoming wins per-key on empty)
          const existingRaw = existing.row.rawColumnValues ?? {};
          const mergedRaw: Record<string, string> = { ...existingRaw };
          for (const [k, v] of Object.entries(fields.rawColumnValues)) {
            const cur = existingRaw[k];
            if (v && (!cur || cur.trim() === "")) mergedRaw[k] = v;
          }
          await db
            .update(master)
            .set({
              status: existing.row.status || fields.status,
              itemName: existing.row.itemName || fields.itemName,
              mainImageUrl: existing.row.mainImageUrl || fields.mainImageUrl,
              listPrice: existing.row.listPrice || fields.listPrice,
              // sku/asin/marketplace are the keys we matched on — do not overwrite in merge mode
              rawColumnValues: mergedRaw,
              updatedAt: new Date(),
              isDirty: true,
            })
            .where(eq(master.id, existing.row.id));
          updated++;
        }
      } else {
        await db.insert(master).values({
          clientIdCode: body.clientIdCode,
          asin: fields.asin,
          sku: fields.sku,
          marketplace: fields.marketplace,
          status: fields.status,
          itemName: fields.itemName,
          mainImageUrl: fields.mainImageUrl,
          listPrice: fields.listPrice,
          rawColumnValues: fields.rawColumnValues,
          isDirty: true,
        });
        inserted++;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (errors.length < 10) errors.push(`row ${row.rowIndex}: ${msg}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
  const response: ExecuteResponse = { inserted, updated, skipped, failed, errors, duration };
  return NextResponse.json(response);
}
```

### Step 2.4: Run test to verify auth tests pass

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/app/api/onboarding/aia-import-catalog/route.test.ts`
- Expected: PASS (2 tests).

### Step 2.5: Add preview-phase happy-path test

- [ ] Append to `src/app/api/onboarding/aia-import-catalog/route.test.ts`:

```ts
function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

describe("POST ?phase=preview", () => {
  it("400 when file is missing", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    const fd = new FormData();
    fd.append("clientIdCode", "ABC123");
    const req = new NextRequest("http://localhost/api/onboarding/aia-import-catalog?phase=preview", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns summary with no duplicates when master is empty", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    mockedDb.select.mockReturnValue(selectChain([])); // every probe misses

    const tsvBody = [
      "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url",
      "Apollo Hat\t\tL1\tSKU-1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
      "Old Hat\t\tL2\tSKU-2\t12.00\t0\tB000222\tInactive\tAMAZON_NA\t2024-01-01\thttps://img/b.jpg",
      "Parent\t\t\tPARENT-SKU\t\t\t\tIncomplete\t\t\t",
    ].join("\n");

    const res = await POST(form({ content: tsvBody }, { clientIdCode: "ABC123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRows).toBe(3);
    expect(body.newCount).toBe(3);
    expect(body.activeCount).toBe(1);
    expect(body.inactiveCount).toBe(1);
    expect(body.incompleteCount).toBe(1);
    expect(body.duplicates).toEqual([]);
    expect(body.parsedRows).toHaveLength(3);
  });

  it("flags strict-match duplicates with master title", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    // First probe (strict) hits; we don't need to mock fallback
    const masterRow = { id: "m1", itemName: "Existing Hat" };
    mockedDb.select.mockReturnValueOnce(selectChain([masterRow]));

    const tsvBody = [
      "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url",
      "Incoming Hat\t\tL1\tSKU-1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ].join("\n");

    const res = await POST(form({ content: tsvBody }, { clientIdCode: "ABC123" }));
    const body = await res.json();
    expect(body.duplicates).toEqual([
      {
        rowIndex: 0,
        sku: "SKU-1",
        asin: "B000111",
        masterTitle: "Existing Hat",
        incomingTitle: "Incoming Hat",
        matchType: "strict",
      },
    ]);
    expect(body.newCount).toBe(0);
  });

  it("flags fallback-match duplicates when existing master.sku is empty", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    // Strict miss, fallback hit
    mockedDb.select
      .mockReturnValueOnce(selectChain([])) // strict miss
      .mockReturnValueOnce(selectChain([{ id: "m1", itemName: "Manual Title" }])); // fallback hit

    const tsvBody = [
      "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url",
      "Incoming Hat\t\tL1\tSKU-NEW\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ].join("\n");

    const res = await POST(form({ content: tsvBody }, { clientIdCode: "ABC123" }));
    const body = await res.json();
    expect(body.duplicates[0].matchType).toBe("fallback");
    expect(body.duplicates[0].masterTitle).toBe("Manual Title");
  });

  it("skips duplicate probe for rows with blank ASIN", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    mockedDb.select.mockReturnValue(selectChain([])); // shouldn't be called

    const tsvBody = [
      "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url",
      "Parent\t\t\tPARENT-SKU\t\t\t\tIncomplete\t\t\t",
    ].join("\n");

    const res = await POST(form({ content: tsvBody }, { clientIdCode: "ABC123" }));
    const body = await res.json();
    expect(body.duplicates).toEqual([]);
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});
```

### Step 2.6: Run preview-phase tests

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/app/api/onboarding/aia-import-catalog/route.test.ts`
- Expected: PASS (6 tests total).

### Step 2.7: Add execute-phase tests

- [ ] Append to `src/app/api/onboarding/aia-import-catalog/route.test.ts`:

```ts
function executeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/aia-import-catalog?phase=execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST ?phase=execute", () => {
  it("inserts new rows when no duplicates exist", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    mockedDb.select.mockReturnValue(selectChain([])); // no existing rows
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockedDb.insert.mockReturnValue({ values: insertValues });

    const parsedRows = [
      {
        itemName: "Apollo Hat",
        itemDescription: "",
        listingId: "L1",
        sellerSku: "SKU-1",
        price: "10.00",
        quantity: "5",
        asin1: "B000111",
        status: "Active",
        fulfillmentChannel: "AMAZON_NA",
        openDate: "2024-01-01",
        imageUrl: "https://img/a.jpg",
        raw: { "seller-sku": "SKU-1", asin1: "B000111" },
        rowIndex: 0,
      },
    ];

    const res = await POST(
      executeReq({
        clientIdCode: "ABC123",
        parsedRows,
        globalMode: "merge",
        rowOverrides: {},
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        clientIdCode: "ABC123",
        asin: "B000111",
        sku: "SKU-1",
        marketplace: "US",
        status: "Active",
        itemName: "Apollo Hat",
        listPrice: "10.00",
        isDirty: true,
      })
    );
  });

  it("respects globalMode=skip on duplicates", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    const masterRow = { id: "m1", asin: "B000111", sku: "SKU-1", itemName: "Existing", rawColumnValues: {} };
    mockedDb.select.mockReturnValueOnce(selectChain([masterRow]));
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockedDb.update.mockReturnValue({ set: updateSet });

    const parsedRows = [
      {
        itemName: "Incoming",
        itemDescription: "",
        listingId: "",
        sellerSku: "SKU-1",
        price: "",
        quantity: "",
        asin1: "B000111",
        status: "Active",
        fulfillmentChannel: "",
        openDate: "",
        imageUrl: "",
        raw: {},
        rowIndex: 0,
      },
    ];

    const res = await POST(
      executeReq({
        clientIdCode: "ABC123",
        parsedRows,
        globalMode: "skip",
        rowOverrides: {},
      })
    );
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.updated).toBe(0);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("per-row override beats globalMode", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    const masterRow = { id: "m1", itemName: "Existing", rawColumnValues: {} };
    mockedDb.select.mockReturnValueOnce(selectChain([masterRow]));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockedDb.update.mockReturnValue({ set: updateSet });

    const parsedRows = [
      {
        itemName: "Incoming",
        itemDescription: "",
        listingId: "",
        sellerSku: "SKU-1",
        price: "",
        quantity: "",
        asin1: "B000111",
        status: "Active",
        fulfillmentChannel: "",
        openDate: "",
        imageUrl: "",
        raw: {},
        rowIndex: 0,
      },
    ];

    const res = await POST(
      executeReq({
        clientIdCode: "ABC123",
        parsedRows,
        globalMode: "skip",
        rowOverrides: { 0: "overwrite" },
      })
    );
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ itemName: "Incoming", isDirty: true })
    );
  });

  it("merge mode preserves manual edits in master core fields", async () => {
    mockedGetAuthSession.mockResolvedValue(editorSession);
    const masterRow = {
      id: "m1",
      itemName: "Manually Edited Title", // user already curated
      mainImageUrl: null,
      listPrice: null,
      status: null,
      rawColumnValues: { foo: "kept" },
    };
    mockedDb.select.mockReturnValueOnce(selectChain([masterRow]));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockedDb.update.mockReturnValue({ set: updateSet });

    const parsedRows = [
      {
        itemName: "Amazon Default Title",
        itemDescription: "",
        listingId: "",
        sellerSku: "SKU-1",
        price: "9.99",
        quantity: "",
        asin1: "B000111",
        status: "Active",
        fulfillmentChannel: "",
        openDate: "",
        imageUrl: "https://img/new.jpg",
        raw: { foo: "incoming-loses", bar: "incoming-wins" },
        rowIndex: 0,
      },
    ];

    await POST(
      executeReq({
        clientIdCode: "ABC123",
        parsedRows,
        globalMode: "merge",
        rowOverrides: {},
      })
    );
    const updateArg = updateSet.mock.calls[0][0];
    expect(updateArg.itemName).toBe("Manually Edited Title"); // preserved
    expect(updateArg.mainImageUrl).toBe("https://img/new.jpg"); // filled empty
    expect(updateArg.listPrice).toBe("9.99"); // filled empty
    expect(updateArg.status).toBe("Active"); // filled empty
    expect(updateArg.rawColumnValues).toEqual({ foo: "kept", bar: "incoming-wins" });
    expect(updateArg.isDirty).toBe(true);
  });
});
```

### Step 2.8: Run all route tests

- [ ] Run: `cd /Users/manu/1o8Hub && npx vitest run src/app/api/onboarding/aia-import-catalog/route.test.ts`
- Expected: PASS (10 tests total — 2 auth, 5 preview, 4 execute, 1 missing-file).

> Note: if test count differs from 10, recount the `it(...)` blocks above and update this expectation rather than skipping.

### Step 2.9: Run typecheck

- [ ] Run: `cd /Users/manu/1o8Hub && npx tsc --noEmit`
- Expected: zero new errors.

### Step 2.10: Commit

- [ ] Run:

```bash
cd /Users/manu/1o8Hub
git add src/app/api/onboarding/aia-import-catalog/
git commit -m "feat(api): POST /api/onboarding/aia-import-catalog preview+execute phases"
```

---

## Task 3: UI component — `<AiaCatalogImport>` with hybrid duplicate dialog

**Goal:** Drag-and-drop upload, parse summary card, hybrid duplicate dialog with global selector + expandable per-row overrides, execute action.

**Files:**
- Create: `src/components/onboarding/aia-catalog-import.tsx`

### Step 3.1: Implement the component

- [ ] Create `src/components/onboarding/aia-catalog-import.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlrRow } from "@/lib/alr-parser";

type ConflictMode = "skip" | "overwrite" | "merge";
type RowDecision = ConflictMode | "use-global";

interface DuplicateInfo {
  rowIndex: number;
  sku: string;
  asin: string;
  masterTitle: string | null;
  incomingTitle: string;
  matchType: "strict" | "fallback";
}

interface PreviewResponse {
  totalRows: number;
  newCount: number;
  activeCount: number;
  inactiveCount: number;
  incompleteCount: number;
  duplicates: DuplicateInfo[];
  parsedRows: AlrRow[];
}

interface ExecuteResponse {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  duration: string;
}

interface Props {
  clientIdCode: string;
  onSuccess?: () => void;
}

const MODE_LABELS: Record<ConflictMode, string> = {
  merge: "Merge fields (default)",
  overwrite: "Overwrite all",
  skip: "Skip duplicates",
};

export function AiaCatalogImport({ clientIdCode, onSuccess }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [globalMode, setGlobalMode] = useState<ConflictMode>("merge");
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowDecision>>({});
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const previewMutation = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientIdCode", clientIdCode);
      const res = await fetch("/api/onboarding/aia-import-catalog?phase=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Preview failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(data);
      setRowDecisions({});
      setDuplicatesOpen(false);
    },
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  const executeMutation = useMutation<ExecuteResponse, Error, void>({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview loaded");
      const res = await fetch("/api/onboarding/aia-import-catalog?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          parsedRows: preview.parsedRows,
          globalMode,
          rowOverrides: rowDecisions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Execute failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        `Imported ${preview?.totalRows ?? 0} listings: ${data.inserted} new + ${data.updated} updated, ${data.skipped} skipped, ${data.failed} failed (${data.duration}).`
      );
      setPreview(null);
      setRowDecisions({});
      qc.invalidateQueries({ queryKey: ["onboarding", clientIdCode] });
      onSuccess?.();
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const handleFile = useCallback(
    (file: File) => {
      const ok = /\.(txt|tsv)$/i.test(file.name) || file.type === "text/tab-separated-values";
      if (!ok) {
        toast.error("Please upload a .txt or .tsv ALR file");
        return;
      }
      previewMutation.mutate(file);
    },
    [previewMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const updatedCount = preview ? preview.duplicates.filter((d) => {
    const dec = rowDecisions[d.rowIndex] ?? "use-global";
    const mode = dec === "use-global" ? globalMode : dec;
    return mode !== "skip";
  }).length : 0;
  const skippedCount = preview ? preview.duplicates.length - updatedCount : 0;

  const isPending = previewMutation.isPending || executeMutation.isPending;

  return (
    <div className="space-y-3">
      {!preview && (
        <div
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-brand bg-brand/5" : "border-border hover:border-muted-foreground/30"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {previewMutation.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
              <p className="text-sm text-muted-foreground">Parsing ALR…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop an Amazon All Listings Report (.txt / .tsv) here, or{" "}
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.tsv,text/tab-separated-values,text/plain"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm">
            ALR contains <strong>{preview.totalRows}</strong> listings (
            {preview.activeCount} Active, {preview.inactiveCount} Inactive,{" "}
            {preview.incompleteCount} Incomplete).{" "}
            <strong>{preview.duplicates.length}</strong> already exist in 1o8Hub.
          </div>

          {preview.duplicates.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">For duplicates:</label>
                <select
                  className="text-xs rounded-md border bg-background px-2 py-1"
                  value={globalMode}
                  onChange={(e) => setGlobalMode(e.target.value as ConflictMode)}
                  disabled={isPending}
                >
                  {(["merge", "overwrite", "skip"] as ConflictMode[]).map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDuplicatesOpen((v) => !v)}
              >
                {duplicatesOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {preview.duplicates.length} existing products — review individually
              </button>

              {duplicatesOpen && (
                <div className="rounded-md border bg-background/50 max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">SKU</th>
                        <th className="px-2 py-1 text-left font-medium">ASIN</th>
                        <th className="px-2 py-1 text-left font-medium">Current title</th>
                        <th className="px-2 py-1 text-left font-medium">Incoming title</th>
                        <th className="px-2 py-1 text-left font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.duplicates.map((d) => {
                        const dec = rowDecisions[d.rowIndex] ?? "use-global";
                        return (
                          <tr key={d.rowIndex} className="border-t">
                            <td className="px-2 py-1 font-mono">{d.sku}</td>
                            <td className="px-2 py-1 font-mono">{d.asin}</td>
                            <td className="px-2 py-1 truncate max-w-[160px]">
                              {d.masterTitle ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1 truncate max-w-[160px]">{d.incomingTitle}</td>
                            <td className="px-2 py-1">
                              <select
                                className="text-xs rounded border bg-background px-1 py-0.5"
                                value={dec}
                                onChange={(e) =>
                                  setRowDecisions((prev) => ({
                                    ...prev,
                                    [d.rowIndex]: e.target.value as RowDecision,
                                  }))
                                }
                                disabled={isPending}
                              >
                                <option value="use-global">Use global</option>
                                <option value="skip">Skip</option>
                                <option value="overwrite">Overwrite</option>
                                <option value="merge">Merge</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {preview.newCount} new + {updatedCount} updated, {skippedCount} skipped
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setPreview(null);
                  setRowDecisions({});
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => executeMutation.mutate()}
              >
                {executeMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Import {preview.totalRows} listings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 3.2: Typecheck

- [ ] Run: `cd /Users/manu/1o8Hub && npx tsc --noEmit`
- Expected: zero new errors. If `@/components/ui/button` import path differs from existing usage in `src/components/products/category-upload.tsx`, mirror that.

### Step 3.3: Commit

- [ ] Run:

```bash
cd /Users/manu/1o8Hub
git add src/components/onboarding/aia-catalog-import.tsx
git commit -m "feat(onboarding): AiaCatalogImport component with hybrid duplicate dialog"
```

---

## Task 4: Steps wiring + clientTypeFilter renderer

**Goal:** Add the `clientTypeFilter` field to `OnboardingStepDef`, register the two new step entries, add Gantt mappings, and wire the new substeps into the onboarding GET endpoint and the renderer.

**Files:**
- Modify: `src/lib/onboarding/steps.ts`
- Modify: `src/app/api/clients/[clientIdCode]/onboarding/route.ts`
- Modify: `src/app/clients/[clientIdCode]/onboarding/page.tsx`

### Step 4.1: Extend `OnboardingStepDef` and register new steps

- [ ] Edit `src/lib/onboarding/steps.ts`:

  Replace the interface block (lines 6-16):

  ```ts
  export interface OnboardingStepDef {
    key: string;
    label: string;
    description: string;
    /** Order in which steps appear in the UI */
    order: number;
    /** Optional parent key for visual grouping as substep */
    parent?: string;
    /** If set, only show when client Marketplace matches (e.g. "VC" for Vendor Central) */
    marketplaceFilter?: string;
    /** If set, only show when client.clientType matches (e.g. "AIA") */
    clientTypeFilter?: "AIA" | "NTA";
  }
  ```

  In the `ONBOARDING_STEPS` array, locate the `amazon_access_team` entry (currently at lines 104-110, ending with a closing brace before the Step 9 `// ── Step 9` comment). After it, insert:

  ```ts
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

  In the `STEP_TO_GANTT` block (line 189 onward), after the `amazon_access_team` line, insert:

  ```ts
    amazon_import_catalog:    { taskName: "Amazon Access", subtaskTitle: "Import Product Catalog" },
    amazon_import_attributes: { taskName: "Amazon Access", subtaskTitle: "Import Attribute Templates" },
  ```

### Step 4.2: Apply `clientTypeFilter` in onboarding GET

- [ ] Edit `src/app/api/clients/[clientIdCode]/onboarding/route.ts`:

  At the top of the file change the import to include `aac.clientType`:

  ```ts
  import { ONBOARDING_STEPS, PARENT_GROUP_LABELS, isMultiStepParent, getStepsForParent } from "@/lib/onboarding/steps";
  ```
  (no change — already correct)

  In the `db.select(...).from(aac)` block at line 53-58, add `clientType: aac.clientType` to the projection:

  ```ts
    const [client] = await db
      .select({ rawData: aac.rawData, onboardingDate: aac.onboardingDate, clientType: aac.clientType })
      .from(aac)
      .where(eq(aac.clientIdCode, clientIdCode))
      .limit(1);
  ```

  Below where `marketplaceType` is computed (around line 63), add:

  ```ts
    const clientType = client?.clientType ?? null;
  ```

  Replace the `applicableSteps` filter (lines 81-84) with:

  ```ts
    // Filter steps by marketplace and client type
    const applicableSteps = ONBOARDING_STEPS.filter((def) => {
      if (def.marketplaceFilter && !marketplaceType.includes(def.marketplaceFilter)) {
        return false;
      }
      if (def.clientTypeFilter && def.clientTypeFilter !== clientType) {
        return false;
      }
      return true;
    });
  ```

### Step 4.3: Wire components into the renderer

- [ ] Edit `src/app/clients/[clientIdCode]/onboarding/page.tsx`:

  Add imports near the existing component imports (search for `import { CategoryUpload }` — there is no such import yet; add both):

  ```tsx
  import { CategoryUpload } from "@/components/products/category-upload";
  import { AiaCatalogImport } from "@/components/onboarding/aia-catalog-import";
  ```

  In `CollapsibleGroup`, the **default** branch renders each step as a `StepCard` (lines 1898-1914 in the current file). Special-case the two new keys to render their import panels in the place of (or in addition to) the right-rail Asana panel. Replace the default branch's `steps.map(...)`:

  ```tsx
            // Default: render each step as a StepCard
            return (
              <>
                {steps.map((step) => {
                  if (step.key === "amazon_import_catalog") {
                    return (
                      <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                        <div className="rounded-xl border bg-card text-card-foreground p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{step.label}</h3>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {step.status === "completed" ? "DONE" : "AIA"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                          <AiaCatalogImport clientIdCode={clientIdCode} />
                        </div>
                        <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                      </div>
                    );
                  }
                  if (step.key === "amazon_import_attributes") {
                    return (
                      <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                        <div className="rounded-xl border bg-card text-card-foreground p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{step.label}</h3>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {step.status === "completed" ? "DONE" : "AIA"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                          <CategoryUpload clientIdCode={clientIdCode} />
                        </div>
                        <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                      </div>
                    );
                  }
                  return (
                    <div key={step.key} className="grid grid-cols-[7fr_3fr] gap-3 items-stretch">
                      <StepCard
                        step={step}
                        clientIdCode={clientIdCode}
                        onEdit={step.key === "create_client" ? onEditClient : undefined}
                        allSteps={allSteps}
                        teamMembers={teamMembers}
                      />
                      {ASANA_STEP_KEYS.has(step.key) && (
                        <AsanaPanel clientIdCode={clientIdCode} stepKey={step.key} teamMembers={teamMembers} />
                      )}
                    </div>
                  );
                })}
              </>
            );
  ```

  Add the two new keys to the `ASANA_STEP_KEYS` set (currently around line 709-717):

  ```tsx
  const ASANA_STEP_KEYS = new Set([
    "create_client", "assign_team", "add_contact_emails", "drive_folders", "setup_timeline",
    "send_onboarding_email", "hub_add_user", "hub_assign_role", "hub_assign_client",
    "setup_asana", "amazon_access_request", "amazon_access_team",
    "amazon_import_catalog", "amazon_import_attributes",
    "iw_add_sponsored_ads", "iw_add_seller_central", "iw_add_vendor_central",
    "intentwise_id_provided", "iw_enabled",
    "iw_amc_add_account", "intentwise_amc_id_provided", "iw_amc_enabled",
    "feedbackwhiz",
  ]);
  ```

### Step 4.4: Run typecheck

- [ ] Run: `cd /Users/manu/1o8Hub && npx tsc --noEmit`
- Expected: zero new errors.

### Step 4.5: Run the full test suite

- [ ] Run: `cd /Users/manu/1o8Hub && npm test`
- Expected: all new tests pass; no previously-passing test regressed. (Pre-existing failure noted in primer at `src/app/api/seo/projects/route.test.ts` may still be present — confirm it is the same failure and not a regression.)

### Step 4.6: Lint

- [ ] Run: `cd /Users/manu/1o8Hub && npm run lint`
- Expected: clean for new files. Fix any warnings before committing.

### Step 4.7: Manual smoke test (dev server)

- [ ] In the worktree, run: `PORT=3000 npm run dev`
- [ ] Open `/clients/<aia-client-code>/onboarding` for an existing AIA client. Verify:
  - Step 8 group shows 4 substeps: 8.0 Request, 8.1 Provide Team Access, 8.2 Import Product Catalog, 8.3 Import Attribute Templates.
  - Open `/clients/<nta-client-code>/onboarding` for an NTA client and verify only 8.0 + 8.1 are visible.
  - On 8.2 for an AIA client: drag a sample ALR `.txt` → preview card appears with totals; if duplicates exist, accordion opens and per-row dropdowns work; "Import" → toast with inserted/updated counts; visit `/products?client=<code>` to confirm new master rows.
  - On 8.3: drag a CLR `.xlsm` → existing toast appears (re-uses `<CategoryUpload>`).

### Step 4.8: Commit

- [ ] Run:

```bash
cd /Users/manu/1o8Hub
git add src/lib/onboarding/steps.ts \
        src/app/api/clients/\[clientIdCode\]/onboarding/route.ts \
        src/app/clients/\[clientIdCode\]/onboarding/page.tsx
git commit -m "feat(onboarding): wire 8.2 ALR + 8.3 CLR substeps with clientTypeFilter gate"
```

---

## Wrap-up

### Step 5.1: Final type + test sweep

- [ ] Run: `cd /Users/manu/1o8Hub && npx tsc --noEmit && npm run lint && npm test`
- Expected: typecheck clean, lint clean, tests green (modulo the pre-existing `src/app/api/seo/projects/route.test.ts` failure noted in the primer).

### Step 5.2: Push branch

- [ ] Run:

```bash
cd /Users/manu/1o8Hub
git push -u origin feat/onboarding-aia-import
```

### Step 5.3: Hand off to finishing-a-development-branch

- [ ] In a fresh session, invoke `superpowers:finishing-a-development-branch` to open the PR against `main`.

---

## Out of scope (per spec)

- Multi-marketplace ALR (no marketplace dropdown — ALR always parsed as `"US"`).
- CLR data-row extraction (per-SKU attribute values). Today CLR upload only registers attribute *schemas*.
- Auto-trigger of 8.3 from 8.2. Each substep is operator-driven.
- Background job / async progress UI (~300 rows fits inside Vercel function timeout; if larger catalogs land, follow up with a job queue).
- Tests against the live DB. Route tests mock `@/lib/db` and `@/lib/auth-db` per existing pattern in `src/app/api/reports/monthly/route.test.ts`.
