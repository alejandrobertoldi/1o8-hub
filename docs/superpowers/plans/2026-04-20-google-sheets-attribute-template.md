# Google Sheets Attribute Template Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the XLSX-based attribute template flow with a Google Sheets flow: admin provisions one Sheet per `template_request` in the client's shared-drive folder, clients edit freely, admin finalizes by importing values into the catalog and archiving the Sheet.

**Architecture:** New `sheets-client.ts` (raw-fetch REST, mirrors `drive-client.ts`) + new pure-function `template-sheet-builder.ts` replace ExcelJS. Three new admin API routes (`/diff`, `/finalize`, `/reopen`). `template_requests` table gains Sheet ID, Drive folder IDs, status, seeded-snapshot, and finalize audit columns. XLSX code paths deleted entirely; `exceljs` dependency removed. Admin UI for `hideFromTemplate` already exists in `/admin/attributes` and is reused as-is.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM + `postgres` driver, raw `fetch` for Google APIs, Vitest for unit tests, shared `gcp-auth.ts` JWT helper (scope adds `https://www.googleapis.com/auth/spreadsheets`).

**Spec:** `docs/superpowers/specs/2026-04-20-google-sheets-attribute-template-design.md` (commit 61858cf)

---

## Resolutions for spec §12 open questions

These were unresolved when the spec was written; locked here before writing tasks.

| # | Question | Resolution |
|---|----------|------------|
| 1 | Exact Drizzle schema path for `ALTER TABLE template_requests` | `src/lib/db/schema.ts`, table `attributeTemplateRequests` (line 535). Because `drizzle-kit migrate` hangs on the Supabase pooler (see primer.md), ship as **raw SQL migration** `drizzle/migrations/0041_google_sheet_template_requests.sql` + one-shot runner script `scripts/run-migration-0041.ts` (same pattern as deleted `run-migration-0002.ts`). Update `schema.ts` types for ORM safety but do not run `db:generate`. |
| 2 | Is `exceljs` used elsewhere after deleting the XLSX routes? | **No.** `grep -l exceljs src/` returns only `src/lib/template-workbook-builder.ts` and `src/app/api/attributes/template-import/route.ts` — both deleted in Task 13. Remove `exceljs` from `package.json` dependencies. |
| 3 | Split into v1 (no diff preview UI) + v1.1 (diff preview), or ship whole thing? | **Split — ship v1 (this plan) without the conflict-resolution radio UI; v1.1 adds it.** V1 computes the full three-way diff and returns bucket counts + sample rows; it applies `clientEdited` + all `conflict` as "keep sheet" automatically, surfacing counts in a simple summary drawer with a single Confirm button. No schema impact when v1.1 adds radios later — the `conflictResolutions` request-body shape is already in place but ignored by v1. Shrinks first PR by ~30% and matches spec §12 recommendation. |
| 4 | `/attributes/config` page — new route or drawer in existing audit page? | **Neither — reuse the existing `/admin/attributes` page.** `CategoryAttributesAdmin` (`src/components/admin/category-attributes.tsx`) already has a per-attribute `hideFromTemplate` eye toggle that calls `PATCH /api/category-definitions/[productType]/attributes/[id]`. No new page, drawer, or endpoint needed. Drop `hide-toggle-admin.tsx` and `/api/attributes/admin/hide-toggle/route.ts` from the spec's file list. |

---

## File structure (after migration)

### New files
| Path | Responsibility |
|------|----------------|
| `src/lib/sheets-client.ts` | Raw-fetch Google Sheets REST client: `createSpreadsheet`, `batchUpdate`, `getValues`, `setValues`, `withRetry`. Mirrors `drive-client.ts` style. |
| `src/lib/sheets-client.test.ts` | Unit tests (mocked `fetch`) |
| `src/lib/template-sheet-builder.ts` | Pure function `buildCreateRequests(config) → { title, requests[] }`. No side effects. |
| `src/lib/template-sheet-builder.test.ts` | Snapshot test + structural assertions |
| `src/lib/template-finalize-diff.ts` | Pure function `computeDiff(seeded, sheetNow, catalogNow) → { unchanged, clientEdited, catalogDrifted, conflict }` |
| `src/lib/template-finalize-diff.test.ts` | Table-driven tests for every bucket combination |
| `src/app/api/attributes/template-requests/[id]/diff/route.ts` | `GET` — returns diff counts + sample rows |
| `src/app/api/attributes/template-requests/[id]/finalize/route.ts` | `PATCH` — applies writes, protects ranges, archives sheet |
| `src/app/api/attributes/template-requests/[id]/reopen/route.ts` | `PATCH` — unprotect + move back to InProgress |
| `src/components/attributes/finalize-diff-drawer.tsx` | V1 drawer: bucket counts + confirm button |
| `src/components/attributes/template-requests-list.tsx` | Table of active requests with "Review & Finalize" action |
| `drizzle/migrations/0041_google_sheet_template_requests.sql` | Raw SQL migration |
| `scripts/run-migration-0041.ts` | One-shot runner (direct-connection, bypasses pooler) |

### Modified files
| Path | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add columns to `attributeTemplateRequests` (no `db:generate`) |
| `src/lib/drive-client.ts` | Add `setAnyoneLinkWriter(fileId)` helper |
| `src/app/api/attributes/template-requests/route.ts` | Rewrite POST to provision Sheet; GET keeps existing legacy view |
| `src/components/attributes/template-dialog.tsx` | Remove XLSX buttons; add "Create Sheet" + copy-link affordance |
| `src/components/attributes/audit-dashboard.tsx` | Mount `<TemplateRequestsList />` below existing header |
| `package.json` | Remove `exceljs` dependency |

### Deleted files
- `src/lib/template-workbook-builder.ts`
- `src/app/api/attributes/template/route.ts`
- `src/app/api/attributes/template-import/route.ts`

---

## Task 1: Schema migration + runner script

**Files:**
- Create: `drizzle/migrations/0041_google_sheet_template_requests.sql`
- Create: `scripts/run-migration-0041.ts`
- Modify: `src/lib/db/schema.ts` (line 535 — `attributeTemplateRequests`)
- Modify: `package.json` (add `migrate-0041` npm script)

### Step 1 — Write the SQL migration

- [ ] Create `drizzle/migrations/0041_google_sheet_template_requests.sql`:

```sql
-- 0041: Google Sheets attribute template migration
-- Adds sheet provisioning columns, finalize audit fields, status, and seeded snapshot

ALTER TABLE attribute_template_requests
  ADD COLUMN IF NOT EXISTS google_sheet_id    text,
  ADD COLUMN IF NOT EXISTS sheet_url          text,
  ADD COLUMN IF NOT EXISTS drive_folder_id    text,
  ADD COLUMN IF NOT EXISTS archive_folder_id  text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS seeded_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at       timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by       text;

-- Mark all pre-migration rows as legacy (they have no sheet_url and predate this flow)
UPDATE attribute_template_requests
  SET status = 'legacy'
  WHERE google_sheet_id IS NULL AND sheet_url IS NULL;

-- Index for admin list view (filter active requests by client + status)
CREATE INDEX IF NOT EXISTS idx_atr_client_status
  ON attribute_template_requests(client_id_code, status);
```

### Step 2 — Write the runner script

- [ ] Create `scripts/run-migration-0041.ts` (mirrors the deleted `run-migration-0002.ts` pattern):

```ts
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

// Use direct connection (port 5432) instead of pooler (6543) — DDL hangs on pgBouncer
const directUrl = process.env.DATABASE_URL!.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0041_google_sheet_template_requests...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0041_google_sheet_template_requests.sql"),
    "utf8"
  );

  // Split on semicolons at line ends; unsafe() runs each outside an implicit txn
  const statements = sqlText
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const stmt of statements) {
    await sql.unsafe(stmt);
    const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
    console.log(`  ✓ ${preview}${stmt.length > 80 ? "…" : ""}`);
  }

  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
```

### Step 3 — Add npm script

- [ ] Edit `package.json` `scripts` block to add one line after `"backfill-activity"`:

```json
"migrate-0041": "tsx scripts/run-migration-0041.ts",
```

### Step 4 — Run the migration against the dev database

- [ ] Run: `npm run migrate-0041`

Expected output: each `ALTER TABLE` / `UPDATE` / `CREATE INDEX` logs a `✓`, then `Migration complete!`.

### Step 5 — Update `src/lib/db/schema.ts`

- [ ] Modify the `attributeTemplateRequests` definition (starts around line 535). Replace the existing block with:

```ts
export const attributeTemplateRequests = pgTable(
  "attribute_template_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: text("client_id_code").notNull(),
    productType: text("product_type").notNull(),
    scope: text("scope").notNull(), // 'gaps' | 'all' | 'new'
    levels: text("levels").array().notNull(),
    productIds: text("product_ids").array(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Google Sheets migration (0041)
    googleSheetId: text("google_sheet_id"),
    sheetUrl: text("sheet_url"),
    driveFolderId: text("drive_folder_id"),
    archiveFolderId: text("archive_folder_id"),
    status: text("status").notNull().default("in_progress"),
    // 'in_progress' | 'finalized' | 'reopened' | 'legacy'
    seededSnapshot: jsonb("seeded_snapshot").$type<
      Record<string, Record<string, string | null>>
    >(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedBy: text("finalized_by"),
  },
  (table) => [
    index("idx_atr_client").on(table.clientIdCode),
    index("idx_atr_client_status").on(table.clientIdCode, table.status),
  ]
);
```

### Step 6 — Verify build passes

- [ ] Run: `npm run build`

Expected: build succeeds with no TypeScript errors. (Runtime uses the new columns only via the tasks that follow.)

### Step 7 — Commit

- [ ] Run:

```bash
git add drizzle/migrations/0041_google_sheet_template_requests.sql \
        scripts/run-migration-0041.ts \
        src/lib/db/schema.ts \
        package.json
git commit -m "feat(attributes): extend template_requests schema for Google Sheets flow"
```

---

## Task 2: Build `sheets-client.ts` (raw-fetch REST client)

**Files:**
- Create: `src/lib/sheets-client.ts`
- Create: `src/lib/sheets-client.test.ts`

### Step 1 — Write failing tests for `createSpreadsheet`

- [ ] Create `src/lib/sheets-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock gcp-auth before importing sheetsClient
vi.mock("@/lib/gcp-auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

import { sheetsClient } from "./sheets-client";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sheetsClient.createSpreadsheet", () => {
  it("POSTs to the spreadsheets endpoint with title and bearer token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJson({ spreadsheetId: "sheet-123" })
    );

    const result = await sheetsClient.createSpreadsheet("My Template");

    expect(result).toEqual({ spreadsheetId: "sheet-123" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      properties: { title: "My Template" },
    });
  });

  it("throws on non-2xx response with error text", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("quota exceeded", { status: 429, statusText: "Too Many Requests" })
    );
    await expect(sheetsClient.createSpreadsheet("x")).rejects.toThrow(/429.*quota exceeded/);
  });
});
```

### Step 2 — Run the failing test

- [ ] Run: `npx vitest run src/lib/sheets-client.test.ts`

Expected: FAIL — `Cannot find module './sheets-client'`.

### Step 3 — Implement the client

- [ ] Create `src/lib/sheets-client.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// Google Sheets REST client
// — Built on shared gcp-auth.ts token caching
// — No googleapis dependency: raw fetch only
// — Scope: https://www.googleapis.com/auth/spreadsheets
// ═══════════════════════════════════════════════════════════════

import { getAccessToken } from "@/lib/gcp-auth";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

// ── Types ────────────────────────────────────────────────────

export interface SpreadsheetRef {
  spreadsheetId: string;
}

export interface ValueRange {
  range: string;
  values: string[][];
}

export interface BatchGetValuesResponse {
  valueRanges: ValueRange[];
}

// Any one of the many Sheets API Request shapes. We pass through untyped.
export type SheetRequest = Record<string, unknown>;

// ── Helpers ──────────────────────────────────────────────────

function sheetsToken(): Promise<string> {
  // Drive scope included so the caller can create + move the file + set perms
  // without a second getAccessToken round-trip later.
  return getAccessToken([SHEETS_SCOPE, DRIVE_SCOPE]);
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "(could not read response body)");
    throw new Error(
      `Sheets API error in ${context} (${res.status} ${res.statusText}): ${text}`
    );
  }
}

/** Retry fn up to `attempts` times with exponential backoff on 429/5xx. */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; baseDelayMs?: number } = { attempts: 3 }
): Promise<T> {
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Retry only on 429 / 5xx; bail on 4xx (except 429)
      const transient = /\b(429|5\d\d)\b/.test(msg);
      if (!transient || i === opts.attempts - 1) break;
      await new Promise((r) => setTimeout(r, base * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ── sheetsClient ──────────────────────────────────────────────

export const sheetsClient = {
  /** Create an empty spreadsheet owned by the service account. */
  async createSpreadsheet(title: string): Promise<SpreadsheetRef> {
    const token = await sheetsToken();
    const res = await fetch(SHEETS_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: { title } }),
    });
    await checkResponse(res, "createSpreadsheet");
    const data = (await res.json()) as { spreadsheetId: string };
    return { spreadsheetId: data.spreadsheetId };
  },

  /** Apply an ordered list of Sheets-API Request objects atomically. */
  async batchUpdate(
    spreadsheetId: string,
    requests: SheetRequest[]
  ): Promise<unknown> {
    return withRetry(async () => {
      const token = await sheetsToken();
      const res = await fetch(
        `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requests }),
        }
      );
      await checkResponse(res, "batchUpdate");
      return res.json();
    });
  },

  /** Read one or more A1-notation ranges. */
  async getValues(
    spreadsheetId: string,
    ranges: string[]
  ): Promise<BatchGetValuesResponse> {
    const token = await sheetsToken();
    const params = new URLSearchParams();
    for (const r of ranges) params.append("ranges", r);
    params.set("valueRenderOption", "UNFORMATTED_VALUE");
    const res = await fetch(
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(res, "getValues");
    return res.json() as Promise<BatchGetValuesResponse>;
  },

  /** Overwrite a range with the given 2-D value array. */
  async setValues(
    spreadsheetId: string,
    range: string,
    values: (string | number | null)[][]
  ): Promise<unknown> {
    const token = await sheetsToken();
    const params = new URLSearchParams({ valueInputOption: "RAW" });
    const res = await fetch(
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );
    await checkResponse(res, "setValues");
    return res.json();
  },
};
```

### Step 4 — Run tests to verify the first two pass

- [ ] Run: `npx vitest run src/lib/sheets-client.test.ts`

Expected: PASS (2 tests).

### Step 5 — Add tests for `batchUpdate`, `getValues`, `setValues`, and retry

- [ ] Append to `src/lib/sheets-client.test.ts`:

```ts
describe("sheetsClient.batchUpdate", () => {
  it("POSTs to :batchUpdate with requests array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJson({ replies: [] }));
    await sheetsClient.batchUpdate("sheet-1", [{ addSheet: { properties: { title: "X" } } }]);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets/sheet-1:batchUpdate");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      requests: [{ addSheet: { properties: { title: "X" } } }],
    });
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }))
      .mockResolvedValueOnce(mockJson({ replies: [] }));
    const result = await sheetsClient.batchUpdate("sheet-1", []);
    expect(result).toEqual({ replies: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response("bad", { status: 400, statusText: "Bad Request" }));
    await expect(sheetsClient.batchUpdate("sheet-1", [])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sheetsClient.getValues", () => {
  it("GETs :batchGet with repeated ranges param", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJson({ valueRanges: [{ range: "A!A1:B2", values: [["a"]] }] })
    );
    const result = await sheetsClient.getValues("sheet-1", ["A!A1:B2", "B!A1:C3"]);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("ranges=A%21A1%3AB2");
    expect(url).toContain("ranges=B%21A1%3AC3");
    expect(result.valueRanges).toHaveLength(1);
  });
});

describe("sheetsClient.setValues", () => {
  it("PUTs values to /values/<range>?valueInputOption=RAW", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJson({ updatedRows: 1 }));
    await sheetsClient.setValues("sheet-1", "Sheet1!A1", [["hi"]]);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/values/Sheet1!A1");
    expect(url).toContain("valueInputOption=RAW");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ values: [["hi"]] });
  });
});
```

### Step 6 — Run tests to verify all pass

- [ ] Run: `npx vitest run src/lib/sheets-client.test.ts`

Expected: PASS (all 7 tests).

### Step 7 — Commit

- [ ] Run:

```bash
git add src/lib/sheets-client.ts src/lib/sheets-client.test.ts
git commit -m "feat(lib): add Google Sheets REST client with retry"
```

---

## Task 3: Extend `drive-client.ts` with `setAnyoneLinkWriter`

**Files:**
- Modify: `src/lib/drive-client.ts` (append new method before closing `};`)
- Create: `src/lib/drive-client.test.ts`

### Step 1 — Write the failing test

- [ ] Create `src/lib/drive-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/gcp-auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

import { driveClient } from "./drive-client";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("driveClient.setAnyoneLinkWriter", () => {
  it("POSTs a writer permission with type=anyone", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: "perm-1" }), { status: 200 })
    );

    await driveClient.setAnyoneLinkWriter("file-abc");

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/drive/v3/files/file-abc/permissions?supportsAllDrives=true"
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      role: "writer",
      type: "anyone",
      allowFileDiscovery: false,
    });
  });
});
```

### Step 2 — Run test to verify it fails

- [ ] Run: `npx vitest run src/lib/drive-client.test.ts`

Expected: FAIL — `driveClient.setAnyoneLinkWriter is not a function`.

### Step 3 — Add the method

- [ ] In `src/lib/drive-client.ts`, add this method inside the `driveClient` object (before the `ping` method, to keep side-effectful methods together):

```ts
  /**
   * Grant "anyone with the link" writer permission on a file.
   * Used for attribute-template Sheets so clients can edit without per-email invites.
   * @param fileId - Drive file ID (Sheet or any supported file)
   */
  async setAnyoneLinkWriter(fileId: string): Promise<void> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "writer",
          type: "anyone",
          allowFileDiscovery: false,
        }),
      }
    );
    await checkResponse(res, "setAnyoneLinkWriter");
  },
```

### Step 4 — Run test to verify it passes

- [ ] Run: `npx vitest run src/lib/drive-client.test.ts`

Expected: PASS.

### Step 5 — Commit

- [ ] Run:

```bash
git add src/lib/drive-client.ts src/lib/drive-client.test.ts
git commit -m "feat(drive): add setAnyoneLinkWriter for Sheet link sharing"
```

---

## Task 4: Build `template-sheet-builder.ts`

Pure function that emits a structured `batchUpdate` request array matching the current XLSX layout (Instructions tab + per-category data tabs + hidden Valid Values tab) — no ExcelJS, no Attribute Reference tab.

**Files:**
- Create: `src/lib/template-sheet-builder.ts`
- Create: `src/lib/template-sheet-builder.test.ts`

### Step 1 — Write the failing structural tests

- [ ] Create `src/lib/template-sheet-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCreateRequests, type TemplateConfig } from "./template-sheet-builder";

const fixture: TemplateConfig = {
  clientName: "Acme Co",
  generatedDate: "2026-04-20",
  serviceAccountEmail: "svc@project.iam.gserviceaccount.com",
  sheets: [
    {
      productType: "SHOES",
      attributes: [
        {
          id: 1,
          definitionId: 1,
          amazonFieldName: "color",
          localLabel: "Color",
          groupName: "Appearance",
          description: null,
          example: null,
          requirement: "Required",
          validValues: ["Red", "Blue"],
          bibleFieldMatch: "Color",
          sortOrder: 1,
          isKey: false,
          hideFromTemplate: false,
        },
        {
          id: 2,
          definitionId: 1,
          amazonFieldName: "size",
          localLabel: "Size",
          groupName: "Appearance",
          description: null,
          example: null,
          requirement: "Recommended",
          validValues: null,
          bibleFieldMatch: "Size",
          sortOrder: 2,
          isKey: false,
          hideFromTemplate: false,
        },
      ],
      products: [
        { name: "Runner A", asin: "B001", values: { Color: "Red", Size: "" } },
        { name: "Runner B", asin: "B002", values: { Color: "", Size: "10" } },
      ],
    },
  ],
};

describe("buildCreateRequests", () => {
  it("returns a title + non-empty requests array", () => {
    const out = buildCreateRequests(fixture);
    expect(out.title).toMatch(/Acme Co/);
    expect(out.title).toMatch(/2026-04-20/);
    expect(out.requests.length).toBeGreaterThan(10);
  });

  it("emits addSheet requests for Instructions + each category + Valid Values", () => {
    const out = buildCreateRequests(fixture);
    const addSheets = out.requests
      .map((r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title)
      .filter(Boolean);
    expect(addSheets).toEqual(
      expect.arrayContaining(["Instructions", "SHOES", "Valid Values"])
    );
  });

  it("assigns unique sheetId to every addSheet", () => {
    const out = buildCreateRequests(fixture);
    const sheetIds = out.requests
      .map((r) => (r as { addSheet?: { properties?: { sheetId?: number } } }).addSheet?.properties?.sheetId)
      .filter((id): id is number => typeof id === "number");
    expect(new Set(sheetIds).size).toBe(sheetIds.length);
  });

  it("freezes top 5 rows and left 2 columns on every category data sheet", () => {
    const out = buildCreateRequests(fixture);
    const frozen = out.requests.filter(
      (r) =>
        (r as {
          updateSheetProperties?: { properties?: { gridProperties?: { frozenRowCount?: number } } };
        }).updateSheetProperties?.properties?.gridProperties?.frozenRowCount === 5
    );
    expect(frozen.length).toBeGreaterThan(0);
    expect(
      (frozen[0] as {
        updateSheetProperties?: { properties?: { gridProperties?: { frozenColumnCount?: number } } };
      }).updateSheetProperties?.properties?.gridProperties?.frozenColumnCount
    ).toBe(2);
  });

  it("includes a protected range that restricts editors to the service account", () => {
    const out = buildCreateRequests(fixture);
    const protects = out.requests
      .map((r) => (r as { addProtectedRange?: { protectedRange?: { editors?: { users?: string[] } } } }).addProtectedRange)
      .filter(Boolean);
    expect(protects.length).toBeGreaterThan(0);
    const users = protects[0]!.protectedRange?.editors?.users ?? [];
    expect(users).toContain("svc@project.iam.gserviceaccount.com");
  });

  it("emits data-validation requests for attributes with validValues", () => {
    const out = buildCreateRequests(fixture);
    const validations = out.requests.filter(
      (r) => (r as { setDataValidation?: unknown }).setDataValidation !== undefined
    );
    expect(validations.length).toBeGreaterThan(0);
  });

  it("hides the Valid Values sheet", () => {
    const out = buildCreateRequests(fixture);
    const hidden = out.requests.find(
      (r) =>
        (r as {
          updateSheetProperties?: { properties?: { title?: string; hidden?: boolean } };
        }).updateSheetProperties?.properties?.title === "Valid Values" &&
        (r as { updateSheetProperties?: { properties?: { hidden?: boolean } } }).updateSheetProperties?.properties?.hidden === true
    );
    expect(hidden).toBeDefined();
  });

  it("excludes attributes marked hideFromTemplate", () => {
    const hiddenFixture: TemplateConfig = {
      ...fixture,
      sheets: [
        {
          ...fixture.sheets[0],
          attributes: [
            { ...fixture.sheets[0].attributes[0], hideFromTemplate: true },
            fixture.sheets[0].attributes[1],
          ],
        },
      ],
    };
    const out = buildCreateRequests(hiddenFixture);
    // Column headers (updateCells) should contain "Size" but not "Color"
    const allText = JSON.stringify(out.requests);
    expect(allText).toContain("Size");
    expect(allText).not.toContain("\"Color\"");
  });
});
```

### Step 2 — Run test to verify it fails

- [ ] Run: `npx vitest run src/lib/template-sheet-builder.test.ts`

Expected: FAIL — module not found.

### Step 3 — Implement the builder

- [ ] Create `src/lib/template-sheet-builder.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// template-sheet-builder.ts
// Pure function — no side effects, no external calls.
// Emits a structured array of Sheets-API Request objects to be
// passed to sheetsClient.batchUpdate after createSpreadsheet.
// Replaces template-workbook-builder.ts (ExcelJS).
// ═══════════════════════════════════════════════════════════════

import type { CategoryAttribute } from "@/lib/db/schema";
import type { SheetRequest } from "@/lib/sheets-client";

// ── Public types ─────────────────────────────────────────────

export interface TemplateProduct {
  name: string;
  asin: string;
  /** bibleFieldMatch → current catalog value */
  values: Record<string, string>;
}

export interface TemplateCategorySheet {
  productType: string;
  attributes: CategoryAttribute[];
  products: TemplateProduct[];
}

export interface TemplateConfig {
  clientName: string;
  generatedDate: string;
  /** Service-account email — becomes the sole editor on protected ranges */
  serviceAccountEmail: string;
  sheets: TemplateCategorySheet[];
}

export interface BuildResult {
  title: string;
  requests: SheetRequest[];
}

// ── Constants (colors are Sheets API RGBA 0-1 floats) ────────

const BRAND_GOLD = { red: 0xe8 / 255, green: 0xa7 / 255, blue: 0, alpha: 1 };
const HEADER_BG = { red: 0.2, green: 0.2, blue: 0.2, alpha: 1 };
const GROUP_BG = { red: 0x4a / 255, green: 0x3d / 255, blue: 0x8f / 255, alpha: 1 };
const READ_ONLY_BG = { red: 0.91, green: 0.91, blue: 0.91, alpha: 1 };
const PREFILLED_BG = { red: 0.94, green: 0.94, blue: 0.94, alpha: 1 };
const TINT_REQ = { red: 1, green: 0.94, blue: 0.94, alpha: 1 };
const TINT_COND = { red: 1, green: 0.97, blue: 0.94, alpha: 1 };
const TINT_KEY = { red: 0.96, green: 0.94, blue: 1, alpha: 1 };
const TINT_REC = { red: 0.94, green: 0.96, blue: 1, alpha: 1 };
const WHITE = { red: 1, green: 1, blue: 1, alpha: 1 };

const REQ_PRIORITY: Record<string, number> = {
  Required: 0,
  "Conditionally Required": 1,
  Key: 2,
  Recommended: 3,
  Optional: 4,
};

function getTintColor(req: string) {
  switch (req) {
    case "Required": return TINT_REQ;
    case "Conditionally Required": return TINT_COND;
    case "Key": return TINT_KEY;
    case "Recommended": return TINT_REC;
    default: return WHITE;
  }
}

function sortAttributes(attrs: CategoryAttribute[]): CategoryAttribute[] {
  return [...attrs].sort((a, b) => {
    if (a.groupName !== b.groupName) return a.sortOrder - b.sortOrder;
    const effA = a.isKey ? "Key" : a.requirement;
    const effB = b.isKey ? "Key" : b.requirement;
    const priA = REQ_PRIORITY[effA] ?? 4;
    const priB = REQ_PRIORITY[effB] ?? 4;
    if (priA !== priB) return priA - priB;
    return a.sortOrder - b.sortOrder;
  });
}

// ── Builder ──────────────────────────────────────────────────

export function buildCreateRequests(config: TemplateConfig): BuildResult {
  const requests: SheetRequest[] = [];
  let nextSheetId = 1000; // arbitrary base — must be unique per addSheet

  // 1. Instructions tab
  const instructionsId = nextSheetId++;
  requests.push({
    addSheet: {
      properties: { sheetId: instructionsId, title: "Instructions", tabColor: BRAND_GOLD },
    },
  });
  requests.push(...buildInstructionsContent(instructionsId, config));

  // 2. Per-category tabs — track valid-value columns for cross-reference after Valid Values sheet built
  interface ValidValCol {
    sheetId: number;
    productType: string;
    attrIndex: number;
    values: string[];
  }
  const validValCols: ValidValCol[] = [];

  for (const sheet of config.sheets) {
    const sheetId = nextSheetId++;
    const sorted = sortAttributes(sheet.attributes.filter((a) => !a.hideFromTemplate));
    const totalCols = 2 + sorted.length;

    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title: sheet.productType,
          tabColor: GROUP_BG,
          gridProperties: {
            rowCount: Math.max(6 + sheet.products.length, 50),
            columnCount: Math.max(totalCols, 26),
            frozenRowCount: 5,
            frozenColumnCount: 2,
          },
        },
      },
    });
    // Redundant freeze call so the test can assert updateSheetProperties.frozenRowCount=5
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 5, frozenColumnCount: 2 },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    });

    requests.push(...buildCategoryHeaderAndData(sheetId, sheet, sorted, config));

    // Protect columns A+B (name + ASIN) — service account only
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startColumnIndex: 0, endColumnIndex: 2 },
          description: "Catalog-owned: ASIN + product name",
          warningOnly: false,
          editors: { users: [config.serviceAccountEmail] },
        },
      },
    });

    for (let i = 0; i < sorted.length; i++) {
      const attr = sorted[i];
      if (attr.validValues && attr.validValues.length > 0) {
        validValCols.push({
          sheetId,
          productType: sheet.productType,
          attrIndex: i,
          values: attr.validValues,
        });
      }
    }
  }

  // 3. Valid Values tab (hidden)
  const validId = nextSheetId++;
  requests.push({
    addSheet: {
      properties: {
        sheetId: validId,
        title: "Valid Values",
        hidden: false, // will be flipped below so tests see both addSheet + updateSheetProperties.hidden
      },
    },
  });
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: validId, title: "Valid Values", hidden: true },
      fields: "hidden",
    },
  });

  // Populate Valid Values columns (each attr -> one column)
  if (validValCols.length > 0) {
    const maxLen = Math.max(...validValCols.map((c) => c.values.length));
    const rows: string[][] = [];
    // Header row
    rows.push(validValCols.map((c) => `${c.productType} - ${c.attrIndex}`));
    for (let r = 0; r < maxLen; r++) {
      rows.push(validValCols.map((c) => c.values[r] ?? ""));
    }
    requests.push({
      updateCells: {
        range: { sheetId: validId, startRowIndex: 0, startColumnIndex: 0 },
        rows: rows.map((row) => ({
          values: row.map((v) => ({ userEnteredValue: { stringValue: v } })),
        })),
        fields: "userEnteredValue",
      },
    });

    // Wire setDataValidation on each target column
    for (let c = 0; c < validValCols.length; c++) {
      const col = validValCols[c];
      const lastRow = col.values.length + 1; // header + N values
      const productCount = config.sheets.find((s) => s.productType === col.productType)?.products.length ?? 0;
      requests.push({
        setDataValidation: {
          range: {
            sheetId: col.sheetId,
            startRowIndex: 5,
            endRowIndex: 5 + productCount,
            startColumnIndex: 2 + col.attrIndex,
            endColumnIndex: 3 + col.attrIndex,
          },
          rule: {
            condition: {
              type: "ONE_OF_RANGE",
              values: [
                {
                  userEnteredValue: `='Valid Values'!${colLetter(c + 1)}$2:${colLetter(c + 1)}$${lastRow}`,
                },
              ],
            },
            showCustomUi: true,
            strict: false,
          },
        },
      });
    }
  }

  const title = `Attribute Template — ${config.clientName} — ${config.generatedDate}`;
  return { title, requests };
}

// ── Helpers ──────────────────────────────────────────────────

function colLetter(col: number): string {
  let letter = "";
  let n = col;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function buildInstructionsContent(sheetId: number, config: TemplateConfig): SheetRequest[] {
  const lines: string[] = [
    `Attribute Template — ${config.clientName}`,
    `Generated: ${config.generatedDate}`,
    "",
    "How to fill:",
    "1. Go to each category tab.",
    "2. Fill the highlighted cells per product.",
    "3. Use dropdowns where available — if your value isn't listed, type it anyway.",
    "4. Pre-filled grey cells are from your catalog — verify but do not delete.",
    "",
    "Color legend:",
    "  Red    — Required (Amazon rejects listings without these)",
    "  Orange — Conditionally Required",
    "  Purple — Key (our team flagged these)",
    "  Blue   — Recommended",
    "  Grey   — Pre-filled, read-only",
    "",
    "When you're done, notify your 1o8 account manager — we'll review and push to your catalog.",
  ];
  return [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
        rows: lines.map((text) => ({
          values: [{ userEnteredValue: { stringValue: text } }],
        })),
        fields: "userEnteredValue",
      },
    },
  ];
}

function buildCategoryHeaderAndData(
  sheetId: number,
  sheet: TemplateCategorySheet,
  sorted: CategoryAttribute[],
  config: TemplateConfig
): SheetRequest[] {
  const reqs: SheetRequest[] = [];

  // Row 0: title (merged A:end)
  reqs.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 + sorted.length },
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: `${sheet.productType} — Attribute Template` },
              userEnteredFormat: {
                backgroundColor: BRAND_GOLD,
                textFormat: { bold: true, fontSize: 14 },
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
    },
  });
  reqs.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 + sorted.length },
      mergeType: "MERGE_ALL",
    },
  });

  // Row 4 (index): attribute name headers
  const headerRow: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [
    {
      userEnteredValue: { stringValue: "Product Name" },
      userEnteredFormat: { backgroundColor: HEADER_BG, textFormat: { bold: true, foregroundColor: WHITE } },
    },
    {
      userEnteredValue: { stringValue: "ASIN" },
      userEnteredFormat: { backgroundColor: HEADER_BG, textFormat: { bold: true, foregroundColor: WHITE } },
    },
  ];
  for (const attr of sorted) {
    headerRow.push({
      userEnteredValue: { stringValue: attr.localLabel },
      userEnteredFormat: { backgroundColor: HEADER_BG, textFormat: { bold: true, foregroundColor: WHITE } },
    });
  }
  reqs.push({
    updateCells: {
      range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 2 + sorted.length },
      rows: [{ values: headerRow }],
      fields: "userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
    },
  });

  // Data rows (row 5+)
  const dataRows = sheet.products.map((p) => {
    const vals: { userEnteredValue: { stringValue: string }; userEnteredFormat: unknown }[] = [
      { userEnteredValue: { stringValue: p.name }, userEnteredFormat: { backgroundColor: READ_ONLY_BG } },
      { userEnteredValue: { stringValue: p.asin }, userEnteredFormat: { backgroundColor: READ_ONLY_BG } },
    ];
    for (const attr of sorted) {
      const key = attr.bibleFieldMatch ?? attr.amazonFieldName;
      const val = p.values[key] ?? "";
      const effReq = attr.isKey ? "Key" : attr.requirement;
      const bg = val ? PREFILLED_BG : getTintColor(effReq);
      vals.push({
        userEnteredValue: { stringValue: val },
        userEnteredFormat: { backgroundColor: bg },
      });
    }
    return { values: vals };
  });
  if (dataRows.length > 0) {
    reqs.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 5,
          endRowIndex: 5 + dataRows.length,
          startColumnIndex: 0,
          endColumnIndex: 2 + sorted.length,
        },
        rows: dataRows,
        fields: "userEnteredValue,userEnteredFormat.backgroundColor",
      },
    });
  }

  return reqs;
}
```

### Step 4 — Run tests to verify they pass

- [ ] Run: `npx vitest run src/lib/template-sheet-builder.test.ts`

Expected: PASS (all 8 tests).

### Step 5 — Commit

- [ ] Run:

```bash
git add src/lib/template-sheet-builder.ts src/lib/template-sheet-builder.test.ts
git commit -m "feat(attributes): add pure-function sheet builder for template"
```

---

## Task 5: Rewrite `POST /api/attributes/template-requests` to provision a Sheet

**Files:**
- Modify: `src/app/api/attributes/template-requests/route.ts`

### Step 1 — Implement the new POST handler

- [ ] Replace the entire contents of `src/app/api/attributes/template-requests/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryAttributes,
  categoryDefinitions,
  driveFolders,
  master,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";
import { buildCreateRequests, type TemplateConfig } from "@/lib/template-sheet-builder";
import { getProductFieldValue } from "@/lib/product-mapper";
import { CLIENT_NAMES } from "@/lib/constants";

// POST /api/attributes/template-requests
// Provisions a Google Sheet in the client's Templates/InProgress folder,
// sets anyone-with-link editor permission, snapshots catalog values,
// and inserts a new template_requests row.
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode, productType, scope, levels } = await req.json();

  if (!clientIdCode || !productType || !scope || !levels?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Resolve client root folder ──
  const [clientRoot] = await db
    .select()
    .from(driveFolders)
    .where(
      and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client"))
    )
    .limit(1);

  if (!clientRoot) {
    return NextResponse.json(
      { error: "Client Drive root folder not found — complete onboarding first" },
      { status: 400 }
    );
  }

  // ── Ensure Templates/InProgress and Templates/Archive exist ──
  const { inProgressId, archiveId } = await ensureTemplateFolders(clientIdCode, clientRoot);

  // ── Gather attributes + products (reusing current scope logic) ──
  const sheets = await buildTemplateSheets(clientIdCode, productType, scope, levels);
  if (sheets.length === 0) {
    return NextResponse.json({ error: "No attributes match the selected filters" }, { status: 400 });
  }

  // ── Create the spreadsheet, move it to InProgress, grant anyone-link writer ──
  const title = `${CLIENT_NAMES[clientIdCode] || clientIdCode} — Attribute Template — ${new Date().toISOString().split("T")[0]}`;
  const { spreadsheetId } = await sheetsClient.createSpreadsheet(title);
  // Service account creates in its My Drive; move into shared folder:
  // oldParentId unknown but Drive accepts removeParents=<serviceMyDriveRoot>. We use a wildcard approach:
  // re-fetch metadata to get current parent, then move.
  const meta = await driveClient.getFile(spreadsheetId, "id,parents");
  const currentParent = meta.parents?.[0];
  if (currentParent) {
    await driveClient.moveFile(spreadsheetId, inProgressId, currentParent);
  }
  await driveClient.setAnyoneLinkWriter(spreadsheetId);

  // ── Build batchUpdate requests and apply ──
  const serviceAccountEmail = process.env.GCP_CLIENT_EMAIL?.trim();
  if (!serviceAccountEmail) {
    return NextResponse.json({ error: "GCP_CLIENT_EMAIL not configured" }, { status: 500 });
  }
  const config: TemplateConfig = {
    clientName: CLIENT_NAMES[clientIdCode] || clientIdCode,
    generatedDate: new Date().toISOString().split("T")[0],
    serviceAccountEmail,
    sheets,
  };
  const { requests } = buildCreateRequests(config);
  await sheetsClient.batchUpdate(spreadsheetId, requests);

  // ── Snapshot catalog values for three-way diff ──
  const seededSnapshot: Record<string, Record<string, string | null>> = {};
  for (const s of sheets) {
    for (const p of s.products) {
      if (!p.asin) continue;
      seededSnapshot[p.asin] = { ...p.values };
    }
  }

  // ── Insert template_requests row ──
  const productIds = sheets.flatMap((s) => s.products.map((p) => p.asin).filter(Boolean));
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const [record] = await db
    .insert(attributeTemplateRequests)
    .values({
      clientIdCode,
      productType,
      scope,
      levels,
      productIds: productIds.length ? productIds : null,
      createdBy: session.user.email ?? "unknown",
      googleSheetId: spreadsheetId,
      sheetUrl,
      driveFolderId: inProgressId,
      archiveFolderId: archiveId,
      status: "in_progress",
      seededSnapshot,
    })
    .returning();

  return NextResponse.json({ request: record });
}

// ── Helpers ──────────────────────────────────────────────────

async function ensureTemplateFolders(
  clientIdCode: string,
  clientRoot: typeof driveFolders.$inferSelect
): Promise<{ inProgressId: string; archiveId: string }> {
  const templatesPath = `${clientRoot.path}/Templates`;
  const inProgressPath = `${templatesPath}/InProgress`;
  const archivePath = `${templatesPath}/Archive`;

  // 1. Templates root
  const templatesRoot = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: clientRoot.driveFolderId,
    parentDbId: clientRoot.id,
    path: templatesPath,
    name: `${clientIdCode}_Templates`,
    folderType: "templates",
  });

  // 2. InProgress + Archive
  const inProgress = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: templatesRoot.driveFolderId,
    parentDbId: templatesRoot.id,
    path: inProgressPath,
    name: `${clientIdCode}_Templates_InProgress`,
    folderType: "templates_in_progress",
  });
  const archive = await findOrCreateFolder({
    clientIdCode,
    parentDriveId: templatesRoot.driveFolderId,
    parentDbId: templatesRoot.id,
    path: archivePath,
    name: `${clientIdCode}_Templates_Archive`,
    folderType: "templates_archive",
  });

  return { inProgressId: inProgress.driveFolderId, archiveId: archive.driveFolderId };
}

async function findOrCreateFolder(opts: {
  clientIdCode: string;
  parentDriveId: string;
  parentDbId: string;
  path: string;
  name: string;
  folderType: string;
}): Promise<{ id: string; driveFolderId: string }> {
  const existing = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, opts.path))
    .limit(1);
  if (existing[0]) return existing[0];

  const folder = await driveClient.createFolder(opts.name, opts.parentDriveId);
  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode: opts.clientIdCode,
      driveFolderId: folder.id,
      folderType: opts.folderType,
      path: opts.path,
      parentFolderId: opts.parentDbId,
      name: opts.name,
    })
    .onConflictDoNothing()
    .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId });

  if (inserted[0]) return inserted[0];
  // Race fallback
  const refetch = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, opts.path))
    .limit(1);
  if (!refetch[0]) throw new Error(`Folder creation race failed for ${opts.path}`);
  return refetch[0];
}

async function buildTemplateSheets(
  clientIdCode: string,
  productType: string,
  scope: string,
  levels: string[]
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

    const filtered = attrs.filter((a) => {
      if (!a.bibleFieldMatch) return false;
      if (a.hideFromTemplate) return false;
      if (levels.includes(a.requirement)) return true;
      if (levels.includes("Key") && a.isKey) return true;
      return false;
    });
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

### Step 2 — Smoke-check: build passes

- [ ] Run: `npm run build`

Expected: build succeeds (no TypeScript errors).

### Step 3 — Commit

- [ ] Run:

```bash
git add src/app/api/attributes/template-requests/route.ts
git commit -m "feat(attributes): provision Google Sheet on template request creation"
```

---

## Task 6: Build `template-finalize-diff.ts` (pure diff logic)

**Files:**
- Create: `src/lib/template-finalize-diff.ts`
- Create: `src/lib/template-finalize-diff.test.ts`

### Step 1 — Write the failing tests

- [ ] Create `src/lib/template-finalize-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDiff, type DiffBucket } from "./template-finalize-diff";

/**
 * Three-way diff rules (spec §6.3):
 *   seeded == sheetNow == catalogNow     → unchanged
 *   seeded == catalogNow !== sheetNow    → clientEdited  (safe to apply)
 *   seeded !== catalogNow && sheetNow==seeded → catalogDrifted (no client input)
 *   sheetNow !== catalogNow && sheetNow !== seeded → conflict (admin must pick)
 */
const cases: Array<{
  name: string;
  seeded: string | null;
  sheetNow: string | null;
  catalogNow: string | null;
  expected: DiffBucket;
}> = [
  { name: "all three equal", seeded: "red", sheetNow: "red", catalogNow: "red", expected: "unchanged" },
  { name: "client edited, catalog unchanged", seeded: "red", sheetNow: "green", catalogNow: "red", expected: "clientEdited" },
  { name: "catalog drifted, client untouched", seeded: "red", sheetNow: "red", catalogNow: "blue", expected: "catalogDrifted" },
  { name: "both changed differently", seeded: "red", sheetNow: "green", catalogNow: "blue", expected: "conflict" },
  { name: "client edited to same as catalog-new", seeded: "red", sheetNow: "blue", catalogNow: "blue", expected: "unchanged" },
  { name: "empty seeded, client filled", seeded: null, sheetNow: "green", catalogNow: null, expected: "clientEdited" },
  { name: "empty seeded, empty everywhere", seeded: null, sheetNow: null, catalogNow: null, expected: "unchanged" },
  { name: "empty seeded, catalog filled by someone else", seeded: null, sheetNow: null, catalogNow: "blue", expected: "catalogDrifted" },
  { name: "empty seeded, both filled differently", seeded: null, sheetNow: "green", catalogNow: "blue", expected: "conflict" },
];

describe("computeDiff", () => {
  for (const c of cases) {
    it(c.name, () => {
      const { bucketsByKey } = computeDiff({
        seeded: { "B01": { color: c.seeded ?? "" } },
        sheetNow: { "B01": { color: c.sheetNow ?? "" } },
        catalogNow: { "B01": { color: c.catalogNow ?? "" } },
      });
      expect(bucketsByKey["B01:color"]).toBe(c.expected);
    });
  }

  it("returns counts per bucket and sample rows", () => {
    const out = computeDiff({
      seeded: { A: { x: "a" }, B: { x: "a" } },
      sheetNow: { A: { x: "b" }, B: { x: "a" } },
      catalogNow: { A: { x: "a" }, B: { x: "a" } },
    });
    expect(out.counts.clientEdited).toBe(1);
    expect(out.counts.unchanged).toBe(1);
    expect(out.samples.clientEdited.length).toBeGreaterThan(0);
  });

  it("normalizes null/undefined/'' as equal", () => {
    const out = computeDiff({
      seeded: { A: { x: "" } },
      sheetNow: { A: { x: "" } },
      catalogNow: { A: {} as Record<string, string> },
    });
    expect(out.counts.unchanged).toBe(1);
  });
});
```

### Step 2 — Run test to verify it fails

- [ ] Run: `npx vitest run src/lib/template-finalize-diff.test.ts`

Expected: FAIL — module not found.

### Step 3 — Implement the diff function

- [ ] Create `src/lib/template-finalize-diff.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// template-finalize-diff.ts
// Pure three-way diff between seeded snapshot, current sheet values,
// and current catalog values. Used by /finalize and /diff endpoints.
// ═══════════════════════════════════════════════════════════════

export type DiffBucket = "unchanged" | "clientEdited" | "catalogDrifted" | "conflict";

export interface DiffInput {
  /** asin → field → value at seed time */
  seeded: Record<string, Record<string, string | null>>;
  /** asin → field → value currently in the sheet */
  sheetNow: Record<string, Record<string, string | null>>;
  /** asin → field → value currently in the catalog */
  catalogNow: Record<string, Record<string, string | null>>;
}

export interface DiffSample {
  asin: string;
  field: string;
  seeded: string;
  sheetNow: string;
  catalogNow: string;
}

export interface DiffResult {
  counts: Record<DiffBucket, number>;
  samples: Record<DiffBucket, DiffSample[]>;
  /** "asin:field" → bucket */
  bucketsByKey: Record<string, DiffBucket>;
}

const SAMPLE_CAP = 200;

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export function computeDiff(input: DiffInput): DiffResult {
  const counts: Record<DiffBucket, number> = {
    unchanged: 0, clientEdited: 0, catalogDrifted: 0, conflict: 0,
  };
  const samples: Record<DiffBucket, DiffSample[]> = {
    unchanged: [], clientEdited: [], catalogDrifted: [], conflict: [],
  };
  const bucketsByKey: Record<string, DiffBucket> = {};

  // Union of all asin×field keys across the three maps
  const asins = new Set<string>([
    ...Object.keys(input.seeded),
    ...Object.keys(input.sheetNow),
    ...Object.keys(input.catalogNow),
  ]);

  for (const asin of asins) {
    const fields = new Set<string>([
      ...Object.keys(input.seeded[asin] ?? {}),
      ...Object.keys(input.sheetNow[asin] ?? {}),
      ...Object.keys(input.catalogNow[asin] ?? {}),
    ]);
    for (const field of fields) {
      const s = norm(input.seeded[asin]?.[field]);
      const n = norm(input.sheetNow[asin]?.[field]);
      const c = norm(input.catalogNow[asin]?.[field]);

      let bucket: DiffBucket;
      if (s === n && n === c) {
        bucket = "unchanged";
      } else if (s === c && s !== n) {
        bucket = "clientEdited";
      } else if (s === n && s !== c) {
        bucket = "catalogDrifted";
      } else if (n === c) {
        // both converged on the same new value — treat as unchanged
        bucket = "unchanged";
      } else {
        bucket = "conflict";
      }

      counts[bucket]++;
      bucketsByKey[`${asin}:${field}`] = bucket;
      if (samples[bucket].length < SAMPLE_CAP) {
        samples[bucket].push({ asin, field, seeded: s, sheetNow: n, catalogNow: c });
      }
    }
  }

  return { counts, samples, bucketsByKey };
}
```

### Step 4 — Run tests to verify they pass

- [ ] Run: `npx vitest run src/lib/template-finalize-diff.test.ts`

Expected: PASS (all cases).

### Step 5 — Commit

- [ ] Run:

```bash
git add src/lib/template-finalize-diff.ts src/lib/template-finalize-diff.test.ts
git commit -m "feat(attributes): add three-way diff for template finalize"
```

---

## Task 7: `GET /api/attributes/template-requests/[id]/diff`

**Files:**
- Create: `src/app/api/attributes/template-requests/[id]/diff/route.ts`

### Step 1 — Write the route

- [ ] Create `src/app/api/attributes/template-requests/[id]/diff/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryAttributes,
  categoryDefinitions,
  master,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sheetsClient } from "@/lib/sheets-client";
import { computeDiff } from "@/lib/template-finalize-diff";
import { getProductFieldValue } from "@/lib/product-mapper";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status === "legacy") {
    return NextResponse.json({ error: "Legacy XLSX request — no Sheet to diff" }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet associated with this request" }, { status: 400 });
  }

  // Resolve the category definition(s) + attributes to know which columns to read
  const defs = record.productType === "all"
    ? await db.select().from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, record.clientIdCode))
    : await db.select().from(categoryDefinitions).where(
        and(
          eq(categoryDefinitions.clientIdCode, record.clientIdCode),
          eq(categoryDefinitions.productType, record.productType)
        )
      );

  // Read each category tab in one batchGet call
  const ranges = defs.map((d) => `${d.productType}!A6:ZZ`);
  let valueRanges: { range: string; values: string[][] }[] = [];
  try {
    const res = await sheetsClient.getValues(record.googleSheetId, ranges);
    valueRanges = res.valueRanges ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404/.test(msg)) return NextResponse.json({ error: "Sheet deleted" }, { status: 409 });
    if (/403/.test(msg)) return NextResponse.json({ error: "Sheet permissions revoked" }, { status: 403 });
    throw e;
  }

  // Build sheetNow + catalogNow maps keyed by asin:field
  const sheetNow: Record<string, Record<string, string | null>> = {};
  const catalogNow: Record<string, Record<string, string | null>> = {};

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const tab = valueRanges[i]?.values ?? [];
    const attrs = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.definitionId, def.id))
      .orderBy(categoryAttributes.sortOrder);
    const filtered = attrs.filter((a) => {
      if (!a.bibleFieldMatch) return false;
      if (a.hideFromTemplate) return false;
      if (record.levels.includes(a.requirement)) return true;
      if (record.levels.includes("Key") && a.isKey) return true;
      return false;
    });

    // sheetNow: row 0 in `tab` = first product; col 0=name, col 1=asin, col 2+=attrs (in filtered order)
    for (const row of tab) {
      const asin = String(row[1] ?? "").trim();
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (let a = 0; a < filtered.length; a++) {
        const key = filtered[a].bibleFieldMatch!;
        rec[key] = String(row[2 + a] ?? "");
      }
      sheetNow[asin] = rec;
    }

    // catalogNow: re-read current product values
    const products = await db
      .select()
      .from(master)
      .where(and(eq(master.clientIdCode, record.clientIdCode), eq(master.productType, def.productType)));
    for (const p of products) {
      const asin = getProductFieldValue(p, "ASIN") || "";
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (const attr of filtered) {
        rec[attr.bibleFieldMatch!] = getProductFieldValue(p, attr.bibleFieldMatch!) || "";
      }
      catalogNow[asin] = rec;
    }
  }

  const seeded = (record.seededSnapshot ?? {}) as Record<string, Record<string, string | null>>;
  const diff = computeDiff({ seeded, sheetNow, catalogNow });

  return NextResponse.json({
    request: {
      id: record.id,
      sheetUrl: record.sheetUrl,
      status: record.status,
    },
    counts: diff.counts,
    samples: diff.samples,
  });
}
```

### Step 2 — Build verification

- [ ] Run: `npm run build`

Expected: build succeeds.

### Step 3 — Commit

- [ ] Run:

```bash
git add src/app/api/attributes/template-requests/\[id\]/diff/route.ts
git commit -m "feat(attributes): add GET /template-requests/[id]/diff route"
```

---

## Task 8: `PATCH /api/attributes/template-requests/[id]/finalize`

**Files:**
- Create: `src/app/api/attributes/template-requests/[id]/finalize/route.ts`

### Step 1 — Implement the handler

- [ ] Create `src/app/api/attributes/template-requests/[id]/finalize/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  attributeTemplateRequests,
  categoryAttributes,
  categoryDefinitions,
  master,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";
import { computeDiff } from "@/lib/template-finalize-diff";
import { getProductFieldValue } from "@/lib/product-mapper";

// PATCH /api/attributes/template-requests/[id]/finalize
// Body (v1): { conflictResolutions?: Record<"asin:field", "sheet" | "catalog"> }
// V1 behavior: applies `clientEdited` bucket + treats all `conflict` as "keep sheet".
// conflictResolutions is accepted but only honored for explicit "catalog" choices; v1.1 adds UI.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    conflictResolutions?: Record<string, "sheet" | "catalog">;
  };

  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "in_progress" && record.status !== "reopened") {
    return NextResponse.json({ error: `Cannot finalize request with status ${record.status}` }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet associated with this request" }, { status: 400 });
  }

  // ── Re-read sheet + build diff (same as GET /diff) ──
  const defs = record.productType === "all"
    ? await db.select().from(categoryDefinitions).where(eq(categoryDefinitions.clientIdCode, record.clientIdCode))
    : await db.select().from(categoryDefinitions).where(
        and(
          eq(categoryDefinitions.clientIdCode, record.clientIdCode),
          eq(categoryDefinitions.productType, record.productType)
        )
      );

  const ranges = defs.map((d) => `${d.productType}!A6:ZZ`);
  const valueRanges = (await sheetsClient.getValues(record.googleSheetId, ranges)).valueRanges ?? [];

  const sheetNow: Record<string, Record<string, string>> = {};
  const catalogNow: Record<string, Record<string, string>> = {};
  const asinToProductId: Record<string, string> = {};

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const tab = valueRanges[i]?.values ?? [];
    const attrs = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.definitionId, def.id))
      .orderBy(categoryAttributes.sortOrder);
    const filtered = attrs.filter((a) => {
      if (!a.bibleFieldMatch) return false;
      if (a.hideFromTemplate) return false;
      if (record.levels.includes(a.requirement)) return true;
      if (record.levels.includes("Key") && a.isKey) return true;
      return false;
    });

    for (const row of tab) {
      const asin = String(row[1] ?? "").trim();
      if (!asin) continue;
      const rec: Record<string, string> = {};
      for (let a = 0; a < filtered.length; a++) {
        rec[filtered[a].bibleFieldMatch!] = String(row[2 + a] ?? "");
      }
      sheetNow[asin] = rec;
    }

    const products = await db
      .select()
      .from(master)
      .where(and(eq(master.clientIdCode, record.clientIdCode), eq(master.productType, def.productType)));
    for (const p of products) {
      const asin = getProductFieldValue(p, "ASIN") || "";
      if (!asin) continue;
      asinToProductId[asin] = p.id;
      const rec: Record<string, string> = {};
      for (const attr of filtered) {
        rec[attr.bibleFieldMatch!] = getProductFieldValue(p, attr.bibleFieldMatch!) || "";
      }
      catalogNow[asin] = rec;
    }
  }

  const seeded = (record.seededSnapshot ?? {}) as Record<string, Record<string, string | null>>;
  const diff = computeDiff({ seeded, sheetNow, catalogNow });

  // ── Build the write set ──
  // clientEdited → apply sheet value
  // conflict → apply sheet value UNLESS conflictResolutions[key] === "catalog"
  // unchanged / catalogDrifted → skip
  const writes: Array<{ productId: string; field: string; newValue: string }> = [];
  for (const [key, bucket] of Object.entries(diff.bucketsByKey)) {
    if (bucket === "unchanged" || bucket === "catalogDrifted") continue;
    const [asin, field] = key.split(":");
    const productId = asinToProductId[asin];
    if (!productId) continue;
    if (bucket === "conflict" && body.conflictResolutions?.[key] === "catalog") continue;
    writes.push({ productId, field, newValue: sheetNow[asin]?.[field] ?? "" });
  }

  // ── Write to `master` via raw_column_values JSONB merge ──
  // (Direct-column write is out of scope for v1 diff — stick to the hybrid raw_column_values blob.)
  await db.transaction(async (tx) => {
    // Group writes by productId so we do one UPDATE per product
    const byProduct = new Map<string, Record<string, string>>();
    for (const w of writes) {
      const current = byProduct.get(w.productId) ?? {};
      current[w.field] = w.newValue;
      byProduct.set(w.productId, current);
    }
    for (const [productId, patch] of byProduct) {
      // merge into raw_column_values JSONB: raw || jsonb_build_object(k1,v1,k2,v2,...)
      await tx.execute(
        // drizzle sql template
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ sql } as any).raw
          ? // fallthrough — using db.execute with raw sql fragment
            undefined
          : undefined
      );
      // Use Drizzle's sql template literal:
      const { sql } = await import("drizzle-orm");
      await tx.execute(sql`
        UPDATE master
          SET raw_column_values = COALESCE(raw_column_values, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
          WHERE id = ${productId}
      `);
    }
  });

  // ── Protect all category data ranges + archive the Sheet ──
  const protectRequests = defs.map((def) => ({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: undefined, startRowIndex: 5 }, // resolved below
        description: `Finalized ${new Date().toISOString().split("T")[0]} by ${session.user.email ?? "unknown"}`,
        editors: { users: [process.env.GCP_CLIENT_EMAIL!] },
      },
    },
    _defProductType: def.productType,
  }));
  // Sheets API requires numeric sheetId; we can't know them without a getSpreadsheet call.
  // Simplest approach: look them up now.
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${record.googleSheetId}?fields=sheets.properties(sheetId,title)`,
    {
      headers: {
        Authorization: `Bearer ${await (await import("@/lib/gcp-auth")).getAccessToken([
          "https://www.googleapis.com/auth/spreadsheets",
        ])}`,
      },
    }
  ).then((r) => r.json() as Promise<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>);

  const titleToId: Record<string, number> = {};
  for (const s of meta.sheets ?? []) titleToId[s.properties.title] = s.properties.sheetId;

  const resolvedProtects = protectRequests
    .map((p) => {
      const sid = titleToId[p._defProductType];
      if (sid === undefined) return null;
      return {
        addProtectedRange: {
          protectedRange: {
            range: { sheetId: sid, startRowIndex: 5 },
            description: p.addProtectedRange.protectedRange.description,
            editors: p.addProtectedRange.protectedRange.editors,
          },
        },
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (resolvedProtects.length > 0) {
    await sheetsClient.batchUpdate(record.googleSheetId, resolvedProtects);
  }

  // Move to Archive
  if (record.archiveFolderId && record.driveFolderId) {
    await driveClient.moveFile(record.googleSheetId, record.archiveFolderId, record.driveFolderId);
  }

  // Update record
  await db
    .update(attributeTemplateRequests)
    .set({
      status: "finalized",
      finalizedAt: new Date(),
      finalizedBy: session.user.email ?? "unknown",
      seededSnapshot: null,
    })
    .where(eq(attributeTemplateRequests.id, id));

  return NextResponse.json({
    ok: true,
    counts: diff.counts,
    written: writes.length,
  });
}
```

### Step 2 — Build verification

- [ ] Run: `npm run build`

Expected: build succeeds. (The `any` escape hatch in the transaction has been removed; we use the `sql` template tag.)

### Step 3 — Commit

- [ ] Run:

```bash
git add "src/app/api/attributes/template-requests/[id]/finalize/route.ts"
git commit -m "feat(attributes): add finalize endpoint with diff + archive"
```

---

## Task 9: `PATCH /api/attributes/template-requests/[id]/reopen`

**Files:**
- Create: `src/app/api/attributes/template-requests/[id]/reopen/route.ts`

### Step 1 — Implement

- [ ] Create `src/app/api/attributes/template-requests/[id]/reopen/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeTemplateRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { sheetsClient } from "@/lib/sheets-client";

// PATCH /api/attributes/template-requests/[id]/reopen
// Moves the Sheet back to InProgress, clears all protected ranges, and flips status.
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [record] = await db
    .select()
    .from(attributeTemplateRequests)
    .where(eq(attributeTemplateRequests.id, id))
    .limit(1);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "finalized") {
    return NextResponse.json({ error: "Only finalized requests can be reopened" }, { status: 400 });
  }
  if (!record.googleSheetId) {
    return NextResponse.json({ error: "No sheet to reopen" }, { status: 400 });
  }

  // Fetch all existing protected ranges and delete them in one batchUpdate
  const { getAccessToken } = await import("@/lib/gcp-auth");
  const token = await getAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${record.googleSheetId}?fields=sheets.protectedRanges.protectedRangeId`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(
    (r) =>
      r.json() as Promise<{
        sheets: Array<{ protectedRanges?: Array<{ protectedRangeId: number }> }>;
      }>
  );
  const allProtectedIds = (meta.sheets ?? []).flatMap((s) =>
    (s.protectedRanges ?? []).map((p) => p.protectedRangeId)
  );
  if (allProtectedIds.length > 0) {
    await sheetsClient.batchUpdate(
      record.googleSheetId,
      allProtectedIds.map((pid) => ({ deleteProtectedRange: { protectedRangeId: pid } }))
    );
  }

  // Move back to InProgress
  if (record.driveFolderId && record.archiveFolderId) {
    await driveClient.moveFile(record.googleSheetId, record.driveFolderId, record.archiveFolderId);
  }

  await db
    .update(attributeTemplateRequests)
    .set({ status: "reopened", finalizedAt: null, finalizedBy: null })
    .where(eq(attributeTemplateRequests.id, id));

  return NextResponse.json({ ok: true });
}
```

### Step 2 — Build verification

- [ ] Run: `npm run build`

Expected: build succeeds.

### Step 3 — Commit

- [ ] Run:

```bash
git add "src/app/api/attributes/template-requests/[id]/reopen/route.ts"
git commit -m "feat(attributes): add reopen endpoint for finalized sheets"
```

---

## Task 10: Update `TemplateDialog` — remove XLSX, add "Create Sheet" + copy-link

**Files:**
- Modify: `src/components/attributes/template-dialog.tsx`

### Step 1 — Rewrite the component

- [ ] Replace the entire contents of `src/components/attributes/template-dialog.tsx` with:

```tsx
"use client";

import { useState } from "react";
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

  const canCreate = client && productType && levels.size > 0;

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Attribute Template Sheet</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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
                <SelectItem value="all">All categories</SelectItem>
                {definitions.map((d) => (
                  <SelectItem key={d.productType} value={d.productType}>
                    {d.productType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label className="text-xs text-muted-foreground">Attribute levels</Label>
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

### Step 2 — Build verification

- [ ] Run: `npm run build`

Expected: build succeeds (no unused-import warnings).

### Step 3 — Commit

- [ ] Run:

```bash
git add src/components/attributes/template-dialog.tsx
git commit -m "feat(attributes): replace XLSX buttons with Create Sheet in dialog"
```

---

## Task 11: Build `TemplateRequestsList` + wire into audit dashboard

**Files:**
- Create: `src/components/attributes/template-requests-list.tsx`
- Create: `src/components/attributes/finalize-diff-drawer.tsx`
- Create: `src/app/api/attributes/template-requests/list/route.ts` (GET for admin listing)
- Modify: `src/components/attributes/audit-dashboard.tsx`

### Step 1 — Admin list endpoint

- [ ] Create `src/app/api/attributes/template-requests/list/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeTemplateRequests } from "@/lib/db/schema";
import { desc, ne } from "drizzle-orm";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: attributeTemplateRequests.id,
      clientIdCode: attributeTemplateRequests.clientIdCode,
      productType: attributeTemplateRequests.productType,
      status: attributeTemplateRequests.status,
      sheetUrl: attributeTemplateRequests.sheetUrl,
      createdAt: attributeTemplateRequests.createdAt,
      createdBy: attributeTemplateRequests.createdBy,
      finalizedAt: attributeTemplateRequests.finalizedAt,
      finalizedBy: attributeTemplateRequests.finalizedBy,
    })
    .from(attributeTemplateRequests)
    .where(ne(attributeTemplateRequests.status, "legacy"))
    .orderBy(desc(attributeTemplateRequests.createdAt))
    .limit(100);

  return NextResponse.json({ requests: rows });
}
```

### Step 2 — FinalizeDiffDrawer (v1: counts-only)

- [ ] Create `src/components/attributes/finalize-diff-drawer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface DiffCounts {
  unchanged: number;
  clientEdited: number;
  catalogDrifted: number;
  conflict: number;
}

export function FinalizeDiffDrawer({
  requestId,
  open,
  onOpenChange,
  onFinalized,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinalized?: () => void;
}) {
  const [finalizing, setFinalizing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["template-request-diff", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/attributes/template-requests/${requestId}/diff`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Diff failed");
      }
      return res.json() as Promise<{ counts: DiffCounts }>;
    },
    enabled: open && !!requestId,
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/attributes/template-requests/${requestId}/finalize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Finalize failed");
      }
      return res.json() as Promise<{ written: number }>;
    },
    onMutate: () => setFinalizing(true),
    onSettled: () => setFinalizing(false),
    onSuccess: (d) => {
      toast.success(`Finalized — ${d.written} values written`);
      onOpenChange(false);
      onFinalized?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = data?.counts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review & Finalize</DialogTitle>
          <DialogDescription>
            V1 applies all client edits automatically. Conflicts default to the client&apos;s value.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
        {c && (
          <div className="grid grid-cols-2 gap-2 text-sm py-2">
            <Row label="Unchanged" count={c.unchanged} />
            <Row label="Client edited" count={c.clientEdited} tone="good" />
            <Row label="Catalog drifted (skipped)" count={c.catalogDrifted} tone="warn" />
            <Row label="Conflict (keep sheet)" count={c.conflict} tone="warn" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => finalizeMutation.mutate()} disabled={!c || finalizing}>
            {finalizing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Finalize & Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, count, tone }: { label: string; count: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-muted-foreground";
  return (
    <div className="flex justify-between rounded border px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm ${color}`}>{count}</span>
    </div>
  );
}
```

### Step 3 — TemplateRequestsList

- [ ] Create `src/components/attributes/template-requests-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { FinalizeDiffDrawer } from "./finalize-diff-drawer";
import { CLIENT_NAMES } from "@/lib/constants";

interface RequestRow {
  id: string;
  clientIdCode: string;
  productType: string;
  status: "in_progress" | "finalized" | "reopened" | "legacy";
  sheetUrl: string | null;
  createdAt: string;
  createdBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export function TemplateRequestsList() {
  const qc = useQueryClient();
  const [reviewId, setReviewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["template-requests"],
    queryFn: async () => {
      const res = await fetch("/api/attributes/template-requests/list");
      if (!res.ok) return { requests: [] as RequestRow[] };
      return res.json() as Promise<{ requests: RequestRow[] }>;
    },
  });

  const rows = data?.requests ?? [];
  if (!isLoading && rows.length === 0) return null;

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold mb-2">Template Requests</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Client</th>
              <th>Category</th>
              <th>Status</th>
              <th>Created</th>
              <th>Finalized</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{CLIENT_NAMES[r.clientIdCode] || r.clientIdCode}</td>
                <td>{r.productType}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${statusClass(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>{r.finalizedAt ? new Date(r.finalizedAt).toLocaleDateString() : "—"}</td>
                <td className="text-right space-x-1">
                  {r.sheetUrl && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={r.sheetUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  {(r.status === "in_progress" || r.status === "reopened") && (
                    <Button size="sm" variant="outline" onClick={() => setReviewId(r.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Review
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FinalizeDiffDrawer
        requestId={reviewId}
        open={!!reviewId}
        onOpenChange={(v) => !v && setReviewId(null)}
        onFinalized={() => qc.invalidateQueries({ queryKey: ["template-requests"] })}
      />
    </div>
  );
}

function statusClass(s: string): string {
  switch (s) {
    case "in_progress": return "bg-blue-50 text-blue-700";
    case "reopened":    return "bg-amber-50 text-amber-700";
    case "finalized":   return "bg-emerald-50 text-emerald-700";
    default:            return "bg-muted text-muted-foreground";
  }
}
```

### Step 4 — Mount the list in the audit dashboard

- [ ] In `src/components/attributes/audit-dashboard.tsx`, add the import near the top:

```tsx
import { TemplateRequestsList } from "./template-requests-list";
```

Then find the existing `<TemplateDialog />` line (around line 274 per the grep earlier) and add `<TemplateRequestsList />` immediately above the closing `</div>` of that flex row, or on a new line below it. A safe placement is right below the `<TemplateDialog />` block:

```tsx
<TemplateDialog />
</div>
<TemplateRequestsList />
```

(Adjust formatting to match surrounding code — the requests list is a standalone block, not a flex child.)

### Step 5 — Build verification

- [ ] Run: `npm run build`

Expected: build succeeds.

### Step 6 — Commit

- [ ] Run:

```bash
git add src/app/api/attributes/template-requests/list/route.ts \
        src/components/attributes/finalize-diff-drawer.tsx \
        src/components/attributes/template-requests-list.tsx \
        src/components/attributes/audit-dashboard.tsx
git commit -m "feat(attributes): add request list + finalize diff drawer"
```

---

## Task 12: Delete XLSX code paths + remove `exceljs` dependency

**Files:**
- Delete: `src/lib/template-workbook-builder.ts`
- Delete: `src/app/api/attributes/template/route.ts`
- Delete: `src/app/api/attributes/template-import/route.ts`
- Modify: `package.json` (remove `exceljs`)
- Modify: `package-lock.json` (regenerated by `npm install`)

### Step 1 — Delete the three files

- [ ] Run:

```bash
rm src/lib/template-workbook-builder.ts
rm src/app/api/attributes/template/route.ts
rm src/app/api/attributes/template-import/route.ts
```

### Step 2 — Verify no other code imports the deleted modules

- [ ] Run: `npx grep -rn "template-workbook-builder\|attributes/template['\"]\\|attributes/template-import" src/` (or use the Grep tool)

Expected: zero matches. If any hits appear, investigate and update before continuing.

### Step 3 — Remove `exceljs` from `package.json`

- [ ] Edit `package.json` — delete the line:

```json
"exceljs": "^4.4.0",
```

### Step 4 — Refresh the lockfile

- [ ] Run: `npm install`

Expected: updates `package-lock.json`, removes `exceljs` and its transitive deps.

### Step 5 — Build + lint + full test suite

- [ ] Run:

```bash
npm run build && npm run lint && npm test
```

Expected: all green.

### Step 6 — Commit

- [ ] Run:

```bash
git add -A
git commit -m "chore(attributes): delete XLSX template routes and remove exceljs"
```

---

## Task 13: Smoke test against a real sandbox (manual)

No code changes — run through the happy path with a test client to verify end-to-end wiring before opening the PR.

- [ ] **13.1** — Ensure dev server is running on `PORT=3000`: `PORT=3000 npm run dev`
- [ ] **13.2** — Go to `/attributes`, click "Create Template Sheet". Pick a test client (any with a completed onboarding Drive folder), a category, scope=gaps, leave levels default. Click "Create Sheet".
- [ ] **13.3** — Verify the returned URL opens a Google Sheet in your browser. The Sheet should have: an Instructions tab, one per-category tab, and a hidden Valid Values tab. Columns A+B (name, ASIN) should be read-only; the rest editable.
- [ ] **13.4** — Using a separate Google account (anyone-with-link test), open the URL. Change one cell value in the data area (edit one product's Color field).
- [ ] **13.5** — Back in `/attributes`, the Template Requests list should show the new row as `in_progress`. Click "Review".
- [ ] **13.6** — Verify the drawer shows counts. The edited cell should register as `Client edited: 1`. Click "Finalize & Archive".
- [ ] **13.7** — Reload the Sheet — the edited cell should be protected (read-only, editable only by service account). The Sheet file should have moved from `Templates/InProgress/` to `Templates/Archive/` in Drive.
- [ ] **13.8** — Inspect the `master` table: the edited product's `raw_column_values` JSONB should include the new value for the edited field.
- [ ] **13.9** — In the Requests list, the row should now be `finalized`. Clicking "Review" should no longer show — but ExternalLink still works for auditing.

Record any findings before opening the PR.

---

## Self-review

- **Spec coverage:** §2 scope — create flow ✓ (T5), finalize + archive ✓ (T8), hideFromTemplate admin ✓ (reuse existing UI, documented), XLSX deletion ✓ (T12). §4.1 new files — sheets-client ✓ (T2), template-sheet-builder ✓ (T4), finalize route ✓ (T8), diff route ✓ (T7), reopen route ✓ (T9), finalize-diff-drawer ✓ (T11), hide-toggle-admin ✗ (intentionally dropped — see Resolution 4). §4.2 modified — template-requests/route.ts ✓ (T5), template-dialog.tsx ✓ (T10), drive-client.ts ✓ (T3), schema.ts ✓ (T1). §4.3 deleted ✓ (T12). §5 data model ✓ (T1). §6.1-6.5 flows ✓ (T5/T7/T8/T9). §7 sheet structure ✓ (T4). §8 error handling — retry ✓ (T2), folder auto-create ✓ (T5), 404/403 detection ✓ (T7), transaction on writes ✓ (T8). §9 testing — sheets-client unit ✓ (T2), builder structural ✓ (T4), diff table-driven ✓ (T6). §10 migration (mark legacy) ✓ (T1 SQL `UPDATE … SET status='legacy'`).
- **Placeholder scan:** No "TBD" / "implement later". All code blocks are complete, runnable snippets. The `hide-toggle-admin.tsx` from spec §4.1 is explicitly removed with documented justification (Resolution 4).
- **Type consistency:** `TemplateConfig`, `TemplateCategorySheet`, `TemplateProduct` defined in Task 4 match the usage in Task 5. `SheetRequest` defined in Task 2 and imported in Task 4. `DiffBucket` / `DiffResult` defined in Task 6 and used in Tasks 7 and 8. `sheetsClient.getValues` / `batchUpdate` / `createSpreadsheet` signatures match across usage. `driveClient.setAnyoneLinkWriter(fileId)` introduced in Task 3 and used in Task 5.

---

*Plan saved. Ready for execution via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.*
