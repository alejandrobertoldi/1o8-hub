# Client Brand Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-client Brand Guidelines tab where the team uploads a brand book PDF, the app extracts a structured summary (logo / colors / typography / voice) via `pdf-parse` + Claude, and SEO projects snapshot from this single source of truth.

**Architecture:** Client-level DB tables (`client_brand_guidelines`, `client_brand_guideline_versions`, `client_brand_guideline_notes`) own the data. The brand book PDF is uploaded directly from the browser to Drive via the existing resumable-upload session pattern (`/api/drive/upload-session` + raw PUT to Drive), bypassing Vercel's 4.5MB body limit. The Vercel route then downloads the PDF buffer back from Drive (server-to-Drive, no body limit), runs `pdf-parse` + two Claude calls synchronously inside `maxDuration=300`, and persists summary jsonb. `renderBrandGuidelinesMd(clientIdCode)` is a pure server-side function consumed by SEO project creation and exposed via `GET /api/clients/[idCode]/brand-guidelines/md`. **No filesystem artifact** — DB is source of truth at runtime (Vercel is ephemeral).

**Tech Stack:** Next.js 16 App Router (Node runtime), Drizzle ORM + PostgreSQL (Supabase), `@anthropic-ai/sdk`, `pdf-parse` (new), `zod`, `@tanstack/react-query`, Tailwind + shadcn/ui, Vitest.

---

## Spec

The authoritative spec is `/Users/manu/1o8Hub/docs/superpowers/specs/2026-05-06-client-brand-guidelines-design.md`. Locked decisions, data shapes, prompts, and out-of-scope items live there. This plan executes that spec — do not re-litigate decisions; defer to the spec when in doubt.

## Resolutions for the spec's three open questions

These were settled while writing this plan; tasks below assume them:

1. **Vercel ~4.5MB body limit vs brand-book sizes.** The browser uploads the PDF directly to Drive via the existing resumable-upload session pattern (`POST /api/drive/upload-session` → returns `sessionUri` → browser PUTs binary to `sessionUri`). Vercel never sees the PDF body. The brand-guidelines version route accepts only the resulting `{ driveFileId, folderId, displayName, originalName, sizeBytes }` JSON (small), then **downloads the PDF buffer back from Drive server-side** (no body limit on that path) to feed `pdf-parse`. Cap at 25MB enforced client-side (Drive supports up to 5TB). `maxDuration = 300` on the version route covers the synchronous extraction.

2. **Polymorphic FK shape — `drive_files.entityId` is `uuid`, but the spec PK was `client_id_code text`.** Resolution: change the spec's `client_brand_guidelines` PK to a synthetic `id uuid` (`defaultRandom`), keep `client_id_code varchar(100) UNIQUE NOT NULL` as the natural lookup key. The render function and all DB queries continue to look up by `clientIdCode`; the synthetic `id` exists only so logo files can use the existing polymorphic `drive_files.entityId` shape (`entityType="brand_logo"` + `entityId=client_brand_guidelines.id`). Brand book PDFs use `entityType="brand_book_version"` + `entityId=client_brand_guideline_versions.id` (already uuid).

3. **SEO Manager Plan 1 amendment scope.** Plan 1 (`docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`) Tasks 9, 10, 11, 12 are obsoleted entirely; the `.claude/agent-memory/seo/brand-guidelines/` filesystem path is dropped. Concrete amendment is Task D3 below.

---

## File Structure

### New files (created by this plan)

```
src/lib/brand-guidelines/
  types.ts                         # zod + TS types for summary_logo/colors/typography/voice
  prompts.ts                       # BRAND_BOOK_TO_MD_PROMPT, BRAND_BOOK_SUMMARY_PROMPT, tool schema
  render.ts                        # renderBrandGuidelinesMd(clientIdCode)
  render.test.ts
  extraction.ts                    # runExtraction(versionId, pdfBuffer, clientIdCode)
  extraction.test.ts
  prompts.test.ts

src/app/api/clients/[clientIdCode]/brand-guidelines/
  route.ts                         # GET (full state)
  md/route.ts                      # GET text/markdown
  summary/route.ts                 # PATCH partial summary update
  versions/route.ts                # POST (record uploaded driveFile + archive prior + run extraction)
  versions/[versionId]/re-extract/route.ts
  notes/route.ts                   # GET, POST
  notes/[noteId]/route.ts          # PATCH, DELETE (soft)
  logo-files/route.ts              # POST
  logo-files/[driveFileId]/route.ts # DELETE

src/app/clients/[clientIdCode]/brand-guidelines/
  page.tsx                         # RSC: fetch initial state, render client component

src/components/clients/
  brand-guidelines-page.tsx        # client page composition
  brand-book-card.tsx              # active book + Replace/Re-extract
  brand-summary-cards.tsx          # 4 editable cards
  brand-logo-uploader.tsx          # 3 logo slots
  brand-notes-timeline.tsx         # Other Guidelines list + add
  brand-version-history.tsx        # collapsible table
  brand-md-preview.tsx             # collapsible markdown preview

drizzle/migrations/
  005X_client_brand_guidelines.sql # generated by drizzle-kit (3 new tables, indexes, unique)

src/lib/drive-client.ts            # ADD downloadFileContent method (modify)
src/lib/drive-upload.ts            # extend resolveUploadFolder for brand_guidelines (modify)
src/lib/db/schema.ts               # ADD 3 new tables (modify)
src/app/clients/[clientIdCode]/layout.tsx  # add 4th tab (modify)
```

### Existing files honored (not re-built)

- `src/lib/drive-client.ts` — full Drive REST client (`createFolder`, `uploadFile`, `moveFile`, `deleteFile`, `getFile`). Add only `downloadFileContent(fileId)`.
- `src/lib/drive-upload.ts` — `buildFileName` reused as-is; `resolveUploadFolder` extended with one new branch.
- `src/app/api/drive/upload-session/route.ts` — already supports `folderType="brand_guidelines"` once Task A3 lands; client-side flow reuses it verbatim.
- `src/lib/db/schema.ts:1233` `driveFolders`, `:1259` `driveFiles` — no schema change. `folder_type` is `text` so `'brand_guidelines'` and `'brand_guidelines_archive'` are valid values without migration.
- `src/lib/db/schema.ts:631` `seoProjects.brandGuidelines` + `brandGuidelinesLock` — columns stay; populate logic moves to use `renderBrandGuidelinesMd()`.
- `src/lib/auth-db.ts` `getAuthSession` — used as-is for auth gating.
- `@/lib/db` — Drizzle instance.

---

## Milestones

| Milestone | Tasks | Outcome |
|-----------|-------|---------|
| **A — Schema + Drive folder type** | A1 → A3 | DB tables exist in dev/prod; `resolveUploadFolder` handles `brand_guidelines` |
| **B — Upload + extraction pipeline + API** | B1 → B9 | Browser→Drive upload works; PDF extracted; all 11 API routes live + tested |
| **C — UI tab + components** | C1 → C7 | `/clients/[idCode]/brand-guidelines` end-to-end usable in dev |
| **D — SEO snapshot integration + SEO Plan 1 amendment** | D1 → D3 | New SEO projects auto-populate `brand_guidelines`; Plan 1 amended |

**Hard pause point:** Task A2 (db:migrate). Dev DB IS prod — implementer must stop and get explicit user go-ahead before running `npm run db:migrate`.

---

# Milestone A — Schema + Drive Folder Type

## Task A1: Add 3 new tables to Drizzle schema

**Files:**
- Modify: `src/lib/db/schema.ts` (append at end of file before any final exports — keep with other client/drive tables)

- [ ] **Step 1: Add the three table definitions**

Append the following to `src/lib/db/schema.ts`:

```ts
// ─── Client Brand Guidelines ─────────────────────────────────────────
// Per-client brand book + structured summary + dated team notes.
// Synthetic uuid PK on client_brand_guidelines so polymorphic
// drive_files.entityId (uuid) can reference logo uploads.

export const clientBrandGuidelines = pgTable(
  "client_brand_guidelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    activeVersionId: uuid("active_version_id"),

    summaryLogo: jsonb("summary_logo").$type<{
      primary_description: string | null;
      secondary_description: string | null;
      monochrome_description: string | null;
      clearspace_notes: string | null;
      misuse_notes: string | null;
      primary_url: string | null;
      secondary_url: string | null;
      monochrome_url: string | null;
    }>().default({
      primary_description: null,
      secondary_description: null,
      monochrome_description: null,
      clearspace_notes: null,
      misuse_notes: null,
      primary_url: null,
      secondary_url: null,
      monochrome_url: null,
    }),

    summaryColors: jsonb("summary_colors").$type<Array<{
      role: "primary" | "secondary" | "accent" | "neutral";
      name: string;
      hex: string;
      rgb: string | null;
      cmyk: string | null;
    }>>().default([]),

    summaryTypography: jsonb("summary_typography").$type<{
      primary: { family: string; weights: string[]; fallback: string | null } | null;
      secondary: { family: string; weights: string[]; fallback: string | null } | null;
    }>().default({ primary: null, secondary: null }),

    summaryVoice: jsonb("summary_voice").$type<{
      attributes: string[];
      dos: string[];
      donts: string[];
      sample_copy: string | null;
    }>().default({ attributes: [], dos: [], donts: [], sample_copy: null }),

    extractionStatus: varchar("extraction_status", { length: 20 }).notNull().default("idle"),
    // 'idle' | 'extracting' | 'failed'
    lastExtractedAt: timestamp("last_extracted_at", { withTimezone: true }),
    lastExtractionModel: text("last_extraction_model"),
    lastExtractionError: text("last_extraction_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_cbg_client").on(t.clientIdCode),
    index("idx_cbg_client").on(t.clientIdCode),
  ]
);

export const clientBrandGuidelineVersions = pgTable(
  "client_brand_guideline_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    driveFileId: text("drive_file_id").notNull(),
    originalFilename: text("original_filename").notNull(),
    byteSize: integer("byte_size"),
    pageCount: integer("page_count"),
    extractedMd: text("extracted_md"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cbgv_client").on(t.clientIdCode),
    index("idx_cbgv_active").on(t.clientIdCode, t.archivedAt),
    unique("uq_cbgv_client_version").on(t.clientIdCode, t.versionNumber),
  ]
);

export const clientBrandGuidelineNotes = pgTable(
  "client_brand_guideline_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    bodyMd: text("body_md").notNull(),
    authorEmail: text("author_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cbgn_client").on(t.clientIdCode),
    index("idx_cbgn_created").on(t.clientIdCode, t.createdAt),
  ]
);
```

Verify imports at top of schema.ts already include: `pgTable, uuid, varchar, jsonb, text, integer, timestamp, index, unique`. Add any missing.

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

Expected: a new file under `drizzle/migrations/` (e.g. `0052_client_brand_guidelines.sql`) containing `CREATE TABLE` statements for the 3 tables, plus the indexes and unique constraints.

- [ ] **Step 3: Inspect generated SQL**

Run: `ls -1 drizzle/migrations/ | tail -3`
Then read the new file. Verify:
- 3 `CREATE TABLE` statements (no `DROP`).
- Indexes match what was declared (`idx_cbg_client`, `idx_cbgv_client`, `idx_cbgv_active`, `uq_cbgv_client_version`, `idx_cbgn_client`, `idx_cbgn_created`, `uq_cbg_client`).
- `summary_logo` etc. defaults are JSON literals.

If wrong → `git checkout -- drizzle/migrations/` and revisit Step 1.

- [ ] **Step 4: Commit (do NOT migrate yet)**

```bash
git add src/lib/db/schema.ts drizzle/migrations/
git commit -m "feat(brand-guidelines): add client_brand_guidelines schema (3 tables)"
```

---

## Task A2: Run migration (HARD PAUSE — user go-ahead required)

**Files:**
- Apply: `drizzle/migrations/<the-new-file>.sql` to dev DB (which IS prod per `feedback_local_db_is_prod.md`).

- [ ] **Step 1: STOP and request explicit go-ahead**

Halt and ask the user verbatim:

> "Schema migration is committed. Dev DB IS prod (Supabase). Ready to run `npm run db:migrate` against the production database. This will create 3 new tables. Confirm to proceed?"

Do not proceed without explicit "yes / go ahead / approve" — typed by the user. If user pauses, leave the branch in this state and exit.

- [ ] **Step 2: After approval, run migration**

Run: `npm run db:migrate`

Expected output: drizzle-kit prints `[✓] applied migrations`. No errors.

- [ ] **Step 3: Verify tables exist**

Run: `npm run db:studio &` then visually confirm the 3 new tables appear, OR run the following via `psql`:

```bash
psql "$DATABASE_URL" -c "\dt client_brand_guidelines client_brand_guideline_versions client_brand_guideline_notes"
```

Expected: 3 rows back. If 0 → migration didn't apply; investigate before continuing.

- [ ] **Step 4: No commit needed (migration files committed in A1).** Proceed to A3.

---

## Task A3: Extend resolveUploadFolder for "brand_guidelines"

**Files:**
- Modify: `src/lib/drive-upload.ts:152-158` (the `foldersToCreate` ternary).
- Test: `src/lib/drive-upload.brand-guidelines.test.ts` (new — colocated lib test).

The existing function already auto-creates intermediate folders with race-safe `onConflictDoNothing`. We add one branch for `brand_guidelines` (creates `Brand Guidelines/` directly under client root) and verify the archive subfolder helper.

- [ ] **Step 1: Write the failing test**

Create `src/lib/drive-upload.brand-guidelines.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drive-client and db before importing the SUT.
vi.mock("@/lib/drive-client", () => ({
  driveClient: {
    createFolder: vi.fn(async (name: string, _parent: string) => ({
      id: `drive-${name}`,
      name,
      mimeType: "application/vnd.google-apps.folder",
    })),
  },
}));

const selectFromMock = vi.fn();
const insertIntoMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: selectFromMock }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: insertIntoMock }) }) }),
  },
}));

import { resolveUploadFolder } from "@/lib/drive-upload";

describe("resolveUploadFolder — brand_guidelines branch", () => {
  beforeEach(() => {
    selectFromMock.mockReset();
    insertIntoMock.mockReset();
  });

  it("creates 'Brand Guidelines' folder directly under client root when missing", async () => {
    // First select: typed folder lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // Second select: client root lookup → found
    selectFromMock.mockResolvedValueOnce([
      { id: "db-root", driveFolderId: "drive-root", path: "/Clients/ACME" },
    ]);
    // Third select: existing-brand-guidelines path lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // Insert returns the new row
    insertIntoMock.mockResolvedValueOnce([
      { id: "db-bg", driveFolderId: "drive-Brand Guidelines", path: "/Clients/ACME/Brand Guidelines" },
    ]);

    const result = await resolveUploadFolder({
      clientIdCode: "ACME",
      folderType: "brand_guidelines",
    });

    expect(result).toEqual({
      id: "db-bg",
      driveFolderId: "drive-Brand Guidelines",
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- drive-upload.brand-guidelines`

Expected: FAIL with the resolve returning the wrong driveFolderId (because the existing `else` branch creates a folder named `${clientIdCode}_${folderType}` rather than the human-readable `Brand Guidelines`).

- [ ] **Step 3: Modify `src/lib/drive-upload.ts:152-158`**

Replace the `foldersToCreate` ternary with:

```ts
const foldersToCreate =
  folderType === "aplus"
    ? [
        { displayName: "Graphics", dbName: `${clientIdCode}_Graphics`, type: "graphics" },
        { displayName: "A+ Content", dbName: `${clientIdCode}_A+ Content`, type: "aplus" },
      ]
    : folderType === "brand_guidelines"
    ? [{ displayName: "Brand Guidelines", dbName: `${clientIdCode}_Brand Guidelines`, type: "brand_guidelines" }]
    : [{ displayName: folderType, dbName: `${clientIdCode}_${folderType}`, type: folderType }];
```

- [ ] **Step 4: Re-run test, confirm pass**

Run: `npm run test -- drive-upload.brand-guidelines`
Expected: PASS.

- [ ] **Step 5: Add the archive folder helper**

Append to `src/lib/drive-upload.ts` (after `resolveUploadFolder`):

```ts
/**
 * Resolve (find or create) the Brand Guidelines/Archive/ subfolder.
 * Called lazily on first re-upload (when there's a previous active version).
 * Returns null if the parent Brand Guidelines/ folder doesn't exist.
 */
export async function resolveBrandGuidelinesArchiveFolder(
  clientIdCode: string
): Promise<ResolvedFolder | null> {
  const parent = await resolveUploadFolder({ clientIdCode, folderType: "brand_guidelines" });
  if (!parent) return null;

  const parentRow = await db
    .select({ path: driveFolders.path })
    .from(driveFolders)
    .where(eq(driveFolders.id, parent.id))
    .limit(1);
  if (!parentRow[0]) return null;
  const archivePath = `${parentRow[0].path}/Archive`;

  const existing = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, archivePath))
    .limit(1);
  if (existing[0]) return existing[0];

  const driveFolder = await driveClient.createFolder(
    `${clientIdCode}_Brand Guidelines Archive`,
    parent.driveFolderId
  );

  const inserted = await db
    .insert(driveFolders)
    .values({
      clientIdCode,
      driveFolderId: driveFolder.id,
      folderType: "brand_guidelines_archive",
      path: archivePath,
      parentFolderId: parent.id,
      name: `${clientIdCode}_Brand Guidelines Archive`,
    })
    .onConflictDoNothing()
    .returning({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId });

  if (inserted[0]) return inserted[0];

  const refetched = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(eq(driveFolders.path, archivePath))
    .limit(1);
  return refetched[0] ?? null;
}
```

- [ ] **Step 6: Add a test for the archive helper**

Append to `src/lib/drive-upload.brand-guidelines.test.ts`:

```ts
import { resolveBrandGuidelinesArchiveFolder } from "@/lib/drive-upload";

describe("resolveBrandGuidelinesArchiveFolder", () => {
  beforeEach(() => {
    selectFromMock.mockReset();
    insertIntoMock.mockReset();
  });

  it("creates Archive/ subfolder under existing Brand Guidelines/", async () => {
    // resolveUploadFolder → typed brand_guidelines folder found
    selectFromMock.mockResolvedValueOnce([
      { id: "db-bg", driveFolderId: "drive-bg", path: "/Clients/ACME/Brand Guidelines" },
    ]);
    // parentRow lookup
    selectFromMock.mockResolvedValueOnce([
      { path: "/Clients/ACME/Brand Guidelines" },
    ]);
    // existing archive lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // insert returns the new row
    insertIntoMock.mockResolvedValueOnce([
      { id: "db-archive", driveFolderId: "drive-archive" },
    ]);

    const result = await resolveBrandGuidelinesArchiveFolder("ACME");
    expect(result).toEqual({ id: "db-archive", driveFolderId: "drive-archive" });
  });
});
```

Run: `npm run test -- drive-upload.brand-guidelines`
Expected: BOTH tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/drive-upload.ts src/lib/drive-upload.brand-guidelines.test.ts
git commit -m "feat(brand-guidelines): extend resolveUploadFolder + add archive helper"
```

---

# Milestone B — Upload + Extraction Pipeline + API Surface

## Task B1: Add `downloadFileContent` to drive-client + add pdf-parse

**Files:**
- Modify: `src/lib/drive-client.ts` (append a new method to the `driveClient` object).
- Modify: `package.json` — add `pdf-parse` dependency.

The Vercel route receives `{ driveFileId }` from the browser after the resumable upload completes. To run extraction it needs the raw PDF bytes; we download them server-to-Drive (no Vercel body limit applies to outbound fetches).

- [ ] **Step 1: Install pdf-parse**

Run: `npm install pdf-parse@^1.1.1 && npm install -D @types/pdf-parse`
Expected: `package.json` shows `pdf-parse` under dependencies and `@types/pdf-parse` under devDependencies.

- [ ] **Step 2: Append `downloadFileContent` method**

Add this method inside the `driveClient` object in `src/lib/drive-client.ts` (between `getFile` and `deleteFile`):

```ts
  /**
   * Download a file's binary content from Drive.
   * Used by server routes that need the bytes back from Drive
   * after a browser-resumable upload (Vercel body-size limit
   * means we never see the bytes during upload).
   * @param fileId - Drive file ID
   * @returns Buffer of the file content
   */
  async downloadFileContent(fileId: string): Promise<Buffer> {
    const token = await driveToken();
    const res = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(res, "downloadFileContent");
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  },
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/drive-client.ts package.json package-lock.json
git commit -m "feat(brand-guidelines): add driveClient.downloadFileContent + pdf-parse dep"
```

---

## Task B2: Create `src/lib/brand-guidelines/types.ts`

**Files:**
- Create: `src/lib/brand-guidelines/types.ts`

Single source of truth for the four `summary_*` jsonb shapes — used by the extraction tool schema, the PATCH /summary route validator, and TypeScript inference.

- [ ] **Step 1: Write the file**

Create `src/lib/brand-guidelines/types.ts`:

```ts
import { z } from "zod";

export const summaryLogoSchema = z.object({
  primary_description: z.string().nullable(),
  secondary_description: z.string().nullable(),
  monochrome_description: z.string().nullable(),
  clearspace_notes: z.string().nullable(),
  misuse_notes: z.string().nullable(),
  primary_url: z.string().nullable(),
  secondary_url: z.string().nullable(),
  monochrome_url: z.string().nullable(),
});
export type SummaryLogo = z.infer<typeof summaryLogoSchema>;

export const summaryColorRoleSchema = z.enum(["primary", "secondary", "accent", "neutral"]);
export const summaryColorSchema = z.object({
  role: summaryColorRoleSchema,
  name: z.string(),
  hex: z.string(),
  rgb: z.string().nullable(),
  cmyk: z.string().nullable(),
});
export const summaryColorsSchema = z.array(summaryColorSchema);
export type SummaryColor = z.infer<typeof summaryColorSchema>;

export const summaryFontSchema = z.object({
  family: z.string(),
  weights: z.array(z.string()),
  fallback: z.string().nullable(),
}).nullable();
export const summaryTypographySchema = z.object({
  primary: summaryFontSchema,
  secondary: summaryFontSchema,
});
export type SummaryTypography = z.infer<typeof summaryTypographySchema>;

export const summaryVoiceSchema = z.object({
  attributes: z.array(z.string()),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
  sample_copy: z.string().nullable(),
});
export type SummaryVoice = z.infer<typeof summaryVoiceSchema>;

export const summaryAllSchema = z.object({
  logo: summaryLogoSchema,
  colors: summaryColorsSchema,
  typography: summaryTypographySchema,
  voice: summaryVoiceSchema,
});
export type SummaryAll = z.infer<typeof summaryAllSchema>;

export const summaryPatchSchema = z.object({
  logo: summaryLogoSchema.partial().optional(),
  colors: summaryColorsSchema.optional(),
  typography: summaryTypographySchema.partial().optional(),
  voice: summaryVoiceSchema.partial().optional(),
});
export type SummaryPatch = z.infer<typeof summaryPatchSchema>;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/brand-guidelines/types.ts
git commit -m "feat(brand-guidelines): add zod types for summary fields"
```

---

## Task B3: Create prompts.ts with tool schema

**Files:**
- Create: `src/lib/brand-guidelines/prompts.ts`
- Create: `src/lib/brand-guidelines/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand-guidelines/prompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BRAND_BOOK_TO_MD_PROMPT,
  BRAND_BOOK_SUMMARY_PROMPT,
  BRAND_SUMMARY_TOOL_SCHEMA,
} from "./prompts";
import { summaryAllSchema } from "./types";

describe("brand-guidelines prompts", () => {
  it("MD prompt mentions preserving headings, lists, tables", () => {
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/heading/i);
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/list/i);
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/table/i);
  });

  it("summary prompt instructs single tool call and no invention", () => {
    expect(BRAND_BOOK_SUMMARY_PROMPT).toMatch(/save_summary/);
    expect(BRAND_BOOK_SUMMARY_PROMPT).toMatch(/not invent/i);
  });

  it("tool input_schema declares logo, colors, typography, voice required", () => {
    const schema = BRAND_SUMMARY_TOOL_SCHEMA;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(
      expect.arrayContaining(["logo", "colors", "typography", "voice"])
    );
    // Spot-check shape — must match summaryAllSchema
    const sampleValid = {
      logo: {
        primary_description: "wordmark",
        secondary_description: null,
        monochrome_description: null,
        clearspace_notes: null,
        misuse_notes: null,
        primary_url: null,
        secondary_url: null,
        monochrome_url: null,
      },
      colors: [{ role: "primary", name: "ACME Red", hex: "#E10600", rgb: null, cmyk: null }],
      typography: { primary: null, secondary: null },
      voice: { attributes: [], dos: [], donts: [], sample_copy: null },
    };
    expect(summaryAllSchema.parse(sampleValid)).toEqual(sampleValid);
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `npm run test -- brand-guidelines/prompts`
Expected: FAIL with module-not-found on `./prompts`.

- [ ] **Step 3: Create prompts.ts**

Create `src/lib/brand-guidelines/prompts.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";

export const BRAND_BOOK_TO_MD_PROMPT = `You are converting raw text extracted from a brand book PDF into clean, well-structured Markdown.

Preserve all section headings, lists, and tables. Remove page numbers, running headers, footers, and orphan whitespace. Keep all substantive content — colors, hex values, font names, voice descriptors, logo guidance, dos and don'ts.

If a section is unclear or appears garbled (e.g. OCR artifacts, broken table layout), leave it as a quoted code block rather than guessing.

Do NOT invent content. If a section is missing, omit it. If unsure whether something is a heading or body text, prefer body text.

Output only the markdown — no preamble, no postscript, no explanations.`;

export const BRAND_BOOK_SUMMARY_PROMPT = `You are reading a brand book in Markdown. Extract structured fields and call the \`save_summary\` tool exactly once.

Fields to extract:
- logo: descriptions of primary / secondary / monochrome variants (text only — no image cropping), clearspace rules, misuse rules
- colors: every formal palette color with role, name, hex, rgb (if present), cmyk (if present)
- typography: primary and secondary typefaces with family name, weights, and web-safe fallback (if present)
- voice: brand voice attributes, dos, don'ts, and one short sample-copy excerpt (if present)

If a field is not present in the document, return null for nullable fields and an empty array for list fields. Do NOT invent values, brand colors, font names, or voice descriptors that aren't in the document.

Call \`save_summary\` exactly once with the complete payload.`;

// Anthropic Tool input_schema — JSON Schema flavor, NOT Zod.
// Must match types.ts SummaryAll. Kept hand-rolled to satisfy
// the SDK's expected shape and to enforce strict validation server-side.
export const BRAND_SUMMARY_TOOL_SCHEMA: Anthropic.Tool["input_schema"] = {
  type: "object",
  required: ["logo", "colors", "typography", "voice"],
  properties: {
    logo: {
      type: "object",
      required: [
        "primary_description",
        "secondary_description",
        "monochrome_description",
        "clearspace_notes",
        "misuse_notes",
        "primary_url",
        "secondary_url",
        "monochrome_url",
      ],
      properties: {
        primary_description: { type: ["string", "null"] },
        secondary_description: { type: ["string", "null"] },
        monochrome_description: { type: ["string", "null"] },
        clearspace_notes: { type: ["string", "null"] },
        misuse_notes: { type: ["string", "null"] },
        primary_url: { type: ["string", "null"] },
        secondary_url: { type: ["string", "null"] },
        monochrome_url: { type: ["string", "null"] },
      },
    },
    colors: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "name", "hex", "rgb", "cmyk"],
        properties: {
          role: { type: "string", enum: ["primary", "secondary", "accent", "neutral"] },
          name: { type: "string" },
          hex: { type: "string" },
          rgb: { type: ["string", "null"] },
          cmyk: { type: ["string", "null"] },
        },
      },
    },
    typography: {
      type: "object",
      required: ["primary", "secondary"],
      properties: {
        primary: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["family", "weights", "fallback"],
              properties: {
                family: { type: "string" },
                weights: { type: "array", items: { type: "string" } },
                fallback: { type: ["string", "null"] },
              },
            },
          ],
        },
        secondary: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["family", "weights", "fallback"],
              properties: {
                family: { type: "string" },
                weights: { type: "array", items: { type: "string" } },
                fallback: { type: ["string", "null"] },
              },
            },
          ],
        },
      },
    },
    voice: {
      type: "object",
      required: ["attributes", "dos", "donts", "sample_copy"],
      properties: {
        attributes: { type: "array", items: { type: "string" } },
        dos: { type: "array", items: { type: "string" } },
        donts: { type: "array", items: { type: "string" } },
        sample_copy: { type: ["string", "null"] },
      },
    },
  },
};
```

- [ ] **Step 4: Re-run test, confirm pass**

Run: `npm run test -- brand-guidelines/prompts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-guidelines/prompts.ts src/lib/brand-guidelines/prompts.test.ts
git commit -m "feat(brand-guidelines): prompts + Anthropic tool schema"
```

---

## Task B4: Create extraction.ts (pdf-parse + 2 Claude calls + DB writes)

**Files:**
- Create: `src/lib/brand-guidelines/extraction.ts`
- Create: `src/lib/brand-guidelines/extraction.test.ts`

- [ ] **Step 1: Write the failing test (mocks Anthropic + pdf-parse + db)**

Create `src/lib/brand-guidelines/extraction.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const pdfParseMock = vi.fn();
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({ default: pdfParseMock }));

const anthropicCreateMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock };
  },
}));

const txCalls: Array<{ table: string; values: unknown }> = [];
const dbUpdateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: (tbl: { name?: string }) => ({
          set: (values: unknown) => ({
            where: () => {
              txCalls.push({ table: String(tbl.name ?? "?"), values });
              return Promise.resolve();
            },
          }),
        }),
      };
      return fn(tx);
    },
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          dbUpdateMock(values);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  clientBrandGuidelines: { name: "client_brand_guidelines", clientIdCode: "client_id_code" },
  clientBrandGuidelineVersions: { name: "client_brand_guideline_versions", id: "id" },
}));

import { runExtraction } from "./extraction";

beforeEach(() => {
  pdfParseMock.mockReset();
  anthropicCreateMock.mockReset();
  dbUpdateMock.mockReset();
  txCalls.length = 0;
});

describe("runExtraction", () => {
  it("on success: writes extracted_md + page_count to version, summary fields + status=idle to guidelines", async () => {
    pdfParseMock.mockResolvedValue({ text: "raw pdf text", numpages: 24 });
    anthropicCreateMock
      .mockResolvedValueOnce({ content: [{ type: "text", text: "# Brand book\n..." }] })
      .mockResolvedValueOnce({
        content: [{
          type: "tool_use",
          name: "save_summary",
          input: {
            logo: {
              primary_description: "wordmark", secondary_description: null,
              monochrome_description: null, clearspace_notes: null, misuse_notes: null,
              primary_url: null, secondary_url: null, monochrome_url: null,
            },
            colors: [{ role: "primary", name: "Red", hex: "#E10600", rgb: null, cmyk: null }],
            typography: { primary: null, secondary: null },
            voice: { attributes: [], dos: [], donts: [], sample_copy: null },
          },
        }],
      });

    await runExtraction({
      versionId: "v-1",
      clientIdCode: "ACME",
      pdfBuffer: Buffer.from("%PDF-1.4 ..."),
    });

    expect(pdfParseMock).toHaveBeenCalledOnce();
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
    expect(txCalls).toHaveLength(2);
    expect(txCalls[0].table).toBe("client_brand_guideline_versions");
    expect(txCalls[1].table).toBe("client_brand_guidelines");
    expect((txCalls[1].values as { extractionStatus: string }).extractionStatus).toBe("idle");
  });

  it("on Claude error: sets extraction_status='failed' with error message and rethrows", async () => {
    pdfParseMock.mockResolvedValue({ text: "raw", numpages: 5 });
    anthropicCreateMock.mockRejectedValueOnce(new Error("Claude went home"));

    await expect(
      runExtraction({ versionId: "v-1", clientIdCode: "ACME", pdfBuffer: Buffer.from("%PDF-1.4") })
    ).rejects.toThrow("Claude went home");

    expect(dbUpdateMock).toHaveBeenCalledOnce();
    const args = dbUpdateMock.mock.calls[0][0] as { extractionStatus: string; lastExtractionError: string };
    expect(args.extractionStatus).toBe("failed");
    expect(args.lastExtractionError).toContain("Claude went home");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test -- brand-guidelines/extraction`
Expected: FAIL — module not found.

- [ ] **Step 3: Create extraction.ts**

Create `src/lib/brand-guidelines/extraction.ts`:

```ts
// IMPORTANT: import from pdf-parse/lib/pdf-parse.js, not "pdf-parse" — the
// package's index.js does a "if (!module.parent)" debug check at load time
// that tries to read a test PDF and crashes Next.js's webpack bundler.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import {
  BRAND_BOOK_TO_MD_PROMPT,
  BRAND_BOOK_SUMMARY_PROMPT,
  BRAND_SUMMARY_TOOL_SCHEMA,
} from "./prompts";
import { summaryAllSchema, type SummaryAll } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_MD = 16000;
const MAX_TOKENS_SUMMARY = 4000;

// Cap input to ~150k tokens worth of chars (≈ 600k chars at 4 chars/tok).
// Brand books rarely exceed this; the cap protects against runaway PDFs.
const MAX_TEXT_CHARS = 600_000;

export interface RunExtractionArgs {
  versionId: string;
  clientIdCode: string;
  pdfBuffer: Buffer;
}

export async function runExtraction(args: RunExtractionArgs): Promise<void> {
  const { versionId, clientIdCode, pdfBuffer } = args;
  const anthropic = new Anthropic();

  try {
    const parsed = await pdfParse(pdfBuffer);
    const rawText = parsed.text.length > MAX_TEXT_CHARS
      ? parsed.text.slice(0, MAX_TEXT_CHARS)
      : parsed.text;
    const numpages: number = parsed.numpages;

    const mdResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_MD,
      system: BRAND_BOOK_TO_MD_PROMPT,
      messages: [{ role: "user", content: rawText }],
    });
    const mdBlock = mdResp.content.find((b) => b.type === "text");
    const extractedMd = mdBlock && mdBlock.type === "text" ? mdBlock.text : "";

    const summaryResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_SUMMARY,
      system: BRAND_BOOK_SUMMARY_PROMPT,
      messages: [{ role: "user", content: extractedMd }],
      tools: [{
        name: "save_summary",
        description: "Save the extracted brand summary",
        input_schema: BRAND_SUMMARY_TOOL_SCHEMA,
      }],
      tool_choice: { type: "tool", name: "save_summary" },
    });

    const toolBlock = summaryResp.content.find(
      (b) => b.type === "tool_use" && b.name === "save_summary"
    );
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Claude did not return a save_summary tool_use block");
    }
    const summary: SummaryAll = summaryAllSchema.parse(toolBlock.input);

    await db.transaction(async (tx) => {
      await tx.update(clientBrandGuidelineVersions)
        .set({ extractedMd, pageCount: numpages })
        .where(eq(clientBrandGuidelineVersions.id, versionId));
      await tx.update(clientBrandGuidelines)
        .set({
          summaryLogo: summary.logo,
          summaryColors: summary.colors,
          summaryTypography: summary.typography,
          summaryVoice: summary.voice,
          extractionStatus: "idle",
          lastExtractedAt: new Date(),
          lastExtractionModel: MODEL,
          lastExtractionError: null,
          updatedAt: new Date(),
        })
        .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
    });
  } catch (err) {
    await db.update(clientBrandGuidelines)
      .set({
        extractionStatus: "failed",
        lastExtractionError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
    throw err;
  }
}
```

- [ ] **Step 4: Re-run, confirm pass**

Run: `npm run test -- brand-guidelines/extraction`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-guidelines/extraction.ts src/lib/brand-guidelines/extraction.test.ts
git commit -m "feat(brand-guidelines): runExtraction (pdf-parse + 2 Claude calls)"
```

---

## Task B5: Create render.ts (renderBrandGuidelinesMd pure function)

**Files:**
- Create: `src/lib/brand-guidelines/render.ts`
- Create: `src/lib/brand-guidelines/render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand-guidelines/render.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let bgRows: unknown[] = [];
let versionRows: unknown[] = [];
let noteRows: unknown[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (tbl: { name: string }) => ({
        where: () => ({
          limit: () => Promise.resolve(
            tbl.name === "client_brand_guidelines" ? bgRows
              : tbl.name === "client_brand_guideline_versions" ? versionRows
              : []
          ),
          orderBy: () => Promise.resolve(noteRows),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  clientBrandGuidelines: { name: "client_brand_guidelines", clientIdCode: "client_id_code", id: "id" },
  clientBrandGuidelineVersions: { name: "client_brand_guideline_versions", id: "id" },
  clientBrandGuidelineNotes: { name: "client_brand_guideline_notes", clientIdCode: "client_id_code", deletedAt: "deleted_at", createdAt: "created_at" },
}));

import { renderBrandGuidelinesMd } from "./render";

beforeEach(() => {
  bgRows = [];
  versionRows = [];
  noteRows = [];
});

describe("renderBrandGuidelinesMd", () => {
  it("returns empty string when no row or no active version", async () => {
    expect(await renderBrandGuidelinesMd("ACME")).toBe("");
    bgRows = [{ activeVersionId: null }];
    expect(await renderBrandGuidelinesMd("ACME")).toBe("");
  });

  it("renders summary, version metadata, and notes when present", async () => {
    bgRows = [{
      id: "bg-1",
      clientIdCode: "ACME",
      activeVersionId: "v-1",
      summaryLogo: {
        primary_description: "ACME wordmark in red",
        secondary_description: null, monochrome_description: null,
        clearspace_notes: "1x cap height around all sides",
        misuse_notes: "Don't recolor",
        primary_url: null, secondary_url: null, monochrome_url: null,
      },
      summaryColors: [
        { role: "primary", name: "ACME Red", hex: "#E10600", rgb: "225,6,0", cmyk: null },
      ],
      summaryTypography: {
        primary: { family: "Inter", weights: ["400", "700"], fallback: "system-ui" },
        secondary: null,
      },
      summaryVoice: {
        attributes: ["bold", "playful"],
        dos: ["use active voice"],
        donts: ["use jargon"],
        sample_copy: "Less talk. More flavor.",
      },
    }];
    versionRows = [{
      id: "v-1", versionNumber: 3, originalFilename: "acme-brandbook-2025.pdf",
      uploadedAt: new Date("2026-05-06T10:00:00Z"), uploadedBy: "manu@",
      extractedMd: "# Brand book\n\nFull text here.",
    }];
    noteRows = [
      { createdAt: new Date("2026-04-22T10:00:00Z"), authorEmail: "sara@", bodyMd: "Voice should skew younger" },
      { createdAt: new Date("2026-05-06T10:00:00Z"), authorEmail: "manu@", bodyMd: "After call: client wants brighter red" },
    ];

    const md = await renderBrandGuidelinesMd("ACME");
    expect(md).toContain("# Brand Guidelines — ACME");
    expect(md).toContain("v3");
    expect(md).toContain("acme-brandbook-2025.pdf");
    expect(md).toContain("ACME wordmark in red");
    expect(md).toContain("| primary | ACME Red | #E10600 | 225,6,0 |  |");
    expect(md).toContain("Inter");
    expect(md).toContain("bold, playful");
    expect(md).toContain("use active voice");
    expect(md).toContain("use jargon");
    expect(md).toContain("Less talk. More flavor.");
    expect(md).toContain("Full text here.");
    expect(md).toContain("2026-04-22 — sara@");
    expect(md).toContain("2026-05-06 — manu@");
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `npm run test -- brand-guidelines/render`
Expected: FAIL — module not found.

- [ ] **Step 3: Create render.ts**

Create `src/lib/brand-guidelines/render.ts`:

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
} from "@/lib/db/schema";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/**
 * Pure server-side function. Renders a markdown document from DB rows
 * for a single client. Consumed by:
 *   • GET /api/clients/[idCode]/brand-guidelines/md (HTTP)
 *   • SEO project create handler (server-side import)
 *   • Future in-app AI agents (server-side import)
 *
 * Returns "" when there's no row or no active version. Callers treat
 * "" as "no brand guidelines uploaded".
 */
export async function renderBrandGuidelinesMd(clientIdCode: string): Promise<string> {
  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode))
    .limit(1);
  if (!bg || !bg.activeVersionId) return "";

  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, bg.activeVersionId))
    .limit(1);

  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));

  const lines: string[] = [];
  lines.push(`# Brand Guidelines — ${clientIdCode}`);
  lines.push("");
  lines.push(`> Last regenerated: ${new Date().toISOString()}`);
  if (activeVersion) {
    lines.push(`> Active brand book: v${activeVersion.versionNumber} — ${activeVersion.originalFilename} (uploaded ${fmtDate(activeVersion.uploadedAt as Date)} by ${activeVersion.uploadedBy})`);
  }
  lines.push("");

  // Summary — Logo
  lines.push("## Summary");
  lines.push("");
  lines.push("### Logo");
  const logo = bg.summaryLogo ?? null;
  if (logo) {
    const descs = [logo.primary_description, logo.secondary_description, logo.monochrome_description].filter(Boolean);
    if (descs.length) lines.push(descs.join(", "));
    if (logo.clearspace_notes) lines.push(`**Clearspace:** ${logo.clearspace_notes}`);
    if (logo.misuse_notes) lines.push(`**Misuse:** ${logo.misuse_notes}`);
    const filesLine = [
      logo.primary_url && `primary=${logo.primary_url}`,
      logo.secondary_url && `secondary=${logo.secondary_url}`,
      logo.monochrome_url && `monochrome=${logo.monochrome_url}`,
    ].filter(Boolean).join(", ");
    if (filesLine) lines.push(`**Files:** ${filesLine}`);
  }
  lines.push("");

  // Summary — Colors
  lines.push("### Colors");
  const colors = bg.summaryColors ?? [];
  if (colors.length) {
    lines.push("| Role | Name | Hex | RGB | CMYK |");
    lines.push("|------|------|-----|-----|------|");
    for (const c of colors) {
      lines.push(`| ${c.role} | ${c.name} | ${c.hex} | ${c.rgb ?? ""} | ${c.cmyk ?? ""} |`);
    }
  }
  lines.push("");

  // Summary — Typography
  lines.push("### Typography");
  const typo = bg.summaryTypography ?? { primary: null, secondary: null };
  if (typo.primary) {
    lines.push(`- **Primary:** ${typo.primary.family}, weights ${typo.primary.weights.join("/")}, fallback ${typo.primary.fallback ?? "—"}`);
  }
  if (typo.secondary) {
    lines.push(`- **Secondary:** ${typo.secondary.family}, weights ${typo.secondary.weights.join("/")}, fallback ${typo.secondary.fallback ?? "—"}`);
  }
  lines.push("");

  // Summary — Voice
  lines.push("### Brand voice & tone");
  const voice = bg.summaryVoice ?? { attributes: [], dos: [], donts: [], sample_copy: null };
  if (voice.attributes.length) lines.push(`**Attributes:** ${voice.attributes.join(", ")}`);
  if (voice.dos.length) {
    lines.push("**Do:**");
    for (const d of voice.dos) lines.push(`- ${d}`);
  }
  if (voice.donts.length) {
    lines.push("**Don't:**");
    for (const d of voice.donts) lines.push(`- ${d}`);
  }
  if (voice.sample_copy) lines.push(`**Sample copy:** ${voice.sample_copy}`);
  lines.push("");

  // Full extracted brand book
  if (activeVersion?.extractedMd) {
    lines.push(`## Full extracted brand book (v${activeVersion.versionNumber})`);
    lines.push("");
    lines.push(activeVersion.extractedMd);
    lines.push("");
  }

  // Notes timeline
  if (notes.length) {
    lines.push("## Other guidelines (chronological)");
    lines.push("");
    for (const n of notes) {
      lines.push(`### ${fmtDate(n.createdAt as Date)} — ${n.authorEmail}`);
      lines.push("");
      lines.push(n.bodyMd);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: Re-run, confirm pass**

Run: `npm run test -- brand-guidelines/render`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-guidelines/render.ts src/lib/brand-guidelines/render.test.ts
git commit -m "feat(brand-guidelines): renderBrandGuidelinesMd pure function"
```

---

## Task B6: POST /api/clients/[clientIdCode]/brand-guidelines/versions

**Files:**
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/versions/route.ts`

This is the **complete-the-upload** route. The browser has already uploaded the PDF directly to Drive via `/api/drive/upload-session` + raw PUT. The browser then POSTs `{ driveFileId, folderId, displayName, originalName, sizeBytes }` here. The route:

1. Validates input + auth.
2. In a transaction: archives the previous active version (moves its Drive file to `Brand Guidelines/Archive/`, sets `archived_at`), inserts the new `client_brand_guideline_versions` row, inserts a `drive_files` row pointing to it, upserts `client_brand_guidelines` with `extraction_status='extracting'`.
3. Outside the transaction: downloads the PDF buffer back from Drive and runs `runExtraction` synchronously.
4. Returns `{ activeVersion, summary, status }`.

`maxDuration = 300`.

- [ ] **Step 1: Create the route**

Create `src/app/api/clients/[clientIdCode]/brand-guidelines/versions/route.ts`:

```ts
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  driveFiles,
  driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { resolveBrandGuidelinesArchiveFolder } from "@/lib/drive-upload";
import { runExtraction } from "@/lib/brand-guidelines/extraction";

const bodySchema = z.object({
  driveFileId: z.string().min(1),
  folderId: z.string().uuid(),
  displayName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().default("application/pdf"),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { driveFileId, folderId, displayName, originalName, mimeType, sizeBytes } = parsed.data;

  // Step 1: archive previous active version (if any) + insert new version + drive_files in a tx.
  const result = await db.transaction(async (tx) => {
    const prior = await tx.select().from(clientBrandGuidelineVersions)
      .where(and(
        eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode),
        isNull(clientBrandGuidelineVersions.archivedAt),
      ))
      .limit(1);

    if (prior[0]) {
      const archive = await resolveBrandGuidelinesArchiveFolder(clientIdCode);
      if (!archive) throw new Error("Could not resolve Brand Guidelines/Archive/ folder");

      // Look up previous file's current Drive parent (the brand_guidelines folder).
      const [priorDriveFile] = await tx.select().from(driveFiles)
        .where(eq(driveFiles.driveFileId, prior[0].driveFileId))
        .limit(1);
      if (priorDriveFile) {
        const [priorFolder] = await tx.select({ driveFolderId: driveFolders.driveFolderId })
          .from(driveFolders).where(eq(driveFolders.id, priorDriveFile.folderId)).limit(1);
        if (priorFolder) {
          await driveClient.moveFile(prior[0].driveFileId, archive.driveFolderId, priorFolder.driveFolderId);
          await tx.update(driveFiles).set({ folderId: archive.id })
            .where(eq(driveFiles.id, priorDriveFile.id));
        }
      }
      await tx.update(clientBrandGuidelineVersions).set({ archivedAt: new Date() })
        .where(eq(clientBrandGuidelineVersions.id, prior[0].id));
    }

    const [maxRow] = await tx.select({
      maxV: sql<number>`COALESCE(MAX(${clientBrandGuidelineVersions.versionNumber}), 0)::int`,
    }).from(clientBrandGuidelineVersions)
      .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode));
    const nextVersion = (maxRow?.maxV ?? 0) + 1;

    const [newVersion] = await tx.insert(clientBrandGuidelineVersions).values({
      clientIdCode,
      versionNumber: nextVersion,
      driveFileId,
      originalFilename: originalName,
      byteSize: sizeBytes ?? null,
      uploadedBy: session.user.email!,
    }).returning();

    // Rename the Drive file to include the now-known version number (matches
    // spec naming: {clientIdCode}_noa_brand_guidelines_v{N}_{ts}.pdf). The
    // upload-session route used "0" as the imageSlot placeholder because
    // the version number isn't known until after the insert above.
    const versionedDisplayName = displayName.replace(
      /_brand_guidelines_[^_]+_/,
      `_brand_guidelines_v${nextVersion}_`
    );
    if (versionedDisplayName !== displayName) {
      await driveClient.renameFile(driveFileId, versionedDisplayName);
    }

    await tx.insert(driveFiles).values({
      driveFileId,
      folderId,
      originalName,
      displayName: versionedDisplayName,
      mimeType,
      sizeBytes: sizeBytes ?? null,
      entityType: "brand_book_version",
      entityId: newVersion.id,
      uploadedBy: session.user.email!,
    });

    // Upsert client_brand_guidelines.
    await tx.insert(clientBrandGuidelines).values({
      clientIdCode,
      activeVersionId: newVersion.id,
      extractionStatus: "extracting",
    }).onConflictDoUpdate({
      target: clientBrandGuidelines.clientIdCode,
      set: {
        activeVersionId: newVersion.id,
        extractionStatus: "extracting",
        lastExtractionError: null,
        updatedAt: new Date(),
      },
    });

    return { newVersionId: newVersion.id };
  });

  // Step 2: download PDF buffer from Drive (server→Drive, no body limit) and run extraction.
  let extractionError: string | null = null;
  try {
    const buffer = await driveClient.downloadFileContent(driveFileId);
    await runExtraction({ versionId: result.newVersionId, clientIdCode, pdfBuffer: buffer });
  } catch (err) {
    // runExtraction already updated DB with status='failed'. Capture the error for the response.
    extractionError = err instanceof Error ? err.message : String(err);
  }

  // Step 3: return current state.
  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  const [version] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, result.newVersionId)).limit(1);

  return NextResponse.json({
    activeVersion: version,
    status: bg?.extractionStatus ?? "idle",
    summary: bg ? {
      logo: bg.summaryLogo,
      colors: bg.summaryColors,
      typography: bg.summaryTypography,
      voice: bg.summaryVoice,
    } : null,
    error: extractionError,
  });
}
```

- [ ] **Step 2: Smoke-test types**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Manual integration test (via curl) — OPTIONAL but recommended**

Skip if running in subagent mode without dev server. With dev server up:
1. Upload a small PDF via curl to `/api/drive/upload-session` (folderType=brand_guidelines).
2. PUT the bytes to the returned `sessionUri`.
3. POST to `/api/clients/{idCode}/brand-guidelines/versions` with the result.
4. Verify response 200 and DB rows.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/\[clientIdCode\]/brand-guidelines/versions/route.ts
git commit -m "feat(brand-guidelines): POST /versions route (archive + extract)"
```

---

## Task B7: POST /versions/[versionId]/re-extract

**Files:**
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/versions/[versionId]/re-extract/route.ts`

- [ ] **Step 1: Create the route**

```ts
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { runExtraction } from "@/lib/brand-guidelines/extraction";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, versionId } = await params;

  const [version] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, versionId)).limit(1);
  if (!version || version.clientIdCode !== clientIdCode) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  await db.update(clientBrandGuidelines).set({
    extractionStatus: "extracting",
    lastExtractionError: null,
    updatedAt: new Date(),
  }).where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));

  let error: string | null = null;
  try {
    const buffer = await driveClient.downloadFileContent(version.driveFileId);
    await runExtraction({ versionId, clientIdCode, pdfBuffer: buffer });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  return NextResponse.json({
    status: bg?.extractionStatus ?? "idle",
    summary: bg ? {
      logo: bg.summaryLogo, colors: bg.summaryColors,
      typography: bg.summaryTypography, voice: bg.summaryVoice,
    } : null,
    error,
  });
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/clients/\[clientIdCode\]/brand-guidelines/versions/\[versionId\]/re-extract/route.ts
git commit -m "feat(brand-guidelines): POST re-extract route"
```

---

## Task B8: GET / + GET /md + PATCH /summary routes

**Files:**
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts`
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/md/route.ts`
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/summary/route.ts`

- [ ] **Step 1: Create GET / (full state)**

`src/app/api/clients/[clientIdCode]/brand-guidelines/route.ts`:

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
} from "@/lib/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);

  const versions = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode))
    .orderBy(desc(clientBrandGuidelineVersions.versionNumber));

  const activeVersion = versions.find((v) => v.archivedAt === null) ?? null;

  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));

  return NextResponse.json({
    state: bg ? {
      summary: {
        logo: bg.summaryLogo,
        colors: bg.summaryColors,
        typography: bg.summaryTypography,
        voice: bg.summaryVoice,
      },
      extractionStatus: bg.extractionStatus,
      lastExtractedAt: bg.lastExtractedAt,
      lastExtractionError: bg.lastExtractionError,
    } : null,
    activeVersion,
    versions,
    notes,
  });
}
```

- [ ] **Step 2: Create GET /md**

`src/app/api/clients/[clientIdCode]/brand-guidelines/md/route.ts`:

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { renderBrandGuidelinesMd } from "@/lib/brand-guidelines/render";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;
  const md = await renderBrandGuidelinesMd(clientIdCode);
  return new NextResponse(md, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
```

- [ ] **Step 3: Create PATCH /summary**

`src/app/api/clients/[clientIdCode]/brand-guidelines/summary/route.ts`:

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines } from "@/lib/db/schema";
import { summaryPatchSchema } from "@/lib/brand-guidelines/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const json = await req.json().catch(() => null);
  const parsed = summaryPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Brand guidelines row not found — upload a brand book first" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.logo) updates.summaryLogo = { ...existing.summaryLogo, ...parsed.data.logo };
  if (parsed.data.colors) updates.summaryColors = parsed.data.colors;
  if (parsed.data.typography) updates.summaryTypography = { ...existing.summaryTypography, ...parsed.data.typography };
  if (parsed.data.voice) updates.summaryVoice = { ...existing.summaryVoice, ...parsed.data.voice };

  await db.update(clientBrandGuidelines).set(updates)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/clients/\[clientIdCode\]/brand-guidelines/route.ts \
        src/app/api/clients/\[clientIdCode\]/brand-guidelines/md/route.ts \
        src/app/api/clients/\[clientIdCode\]/brand-guidelines/summary/route.ts
git commit -m "feat(brand-guidelines): GET state + GET md + PATCH summary"
```

---

## Task B9: Notes routes (GET/POST/PATCH/DELETE) + logo-files routes (POST/DELETE)

**Files:**
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/notes/route.ts`
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/notes/[noteId]/route.ts`
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/logo-files/route.ts`
- Create: `src/app/api/clients/[clientIdCode]/brand-guidelines/logo-files/[driveFileId]/route.ts`

- [ ] **Step 1: Create notes/route.ts (GET, POST)**

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineNotes } from "@/lib/db/schema";

const postSchema = z.object({ body_md: z.string().min(1).max(20_000) });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;
  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const [note] = await db.insert(clientBrandGuidelineNotes).values({
    clientIdCode,
    bodyMd: parsed.data.body_md,
    authorEmail: session.user.email!,
  }).returning();
  return NextResponse.json({ note });
}
```

- [ ] **Step 2: Create notes/[noteId]/route.ts (PATCH, DELETE)**

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineNotes } from "@/lib/db/schema";

const patchSchema = z.object({ body_md: z.string().min(1).max(20_000) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; noteId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientIdCode, noteId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const [existing] = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.id, noteId),
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
    )).limit(1);
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  // Own entries only, unless admin.
  if (role !== "admin" && existing.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.update(clientBrandGuidelineNotes).set({
    bodyMd: parsed.data.body_md,
    updatedAt: new Date(),
  }).where(eq(clientBrandGuidelineNotes.id, noteId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; noteId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientIdCode, noteId } = await params;
  const [existing] = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.id, noteId),
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
    )).limit(1);
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (role !== "admin" && existing.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.update(clientBrandGuidelineNotes).set({ deletedAt: new Date() })
    .where(eq(clientBrandGuidelineNotes.id, noteId));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create logo-files/route.ts (POST)**

The logo upload also uses the browser→Drive resumable pattern. The browser calls `/api/drive/upload-session` (folderType=`brand_guidelines`), PUTs the image, then POSTs here. We accept `{ driveFileId, folderId, displayName, originalName, mimeType, sizeBytes, slot }` where `slot ∈ {"primary","secondary","monochrome"}`.

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, driveFiles } from "@/lib/db/schema";

const bodySchema = z.object({
  driveFileId: z.string().min(1),
  folderId: z.string().uuid(),
  displayName: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  slot: z.enum(["primary", "secondary", "monochrome"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { driveFileId, folderId, displayName, originalName, mimeType, sizeBytes, slot } = parsed.data;

  // Ensure brand_guidelines row exists (logos can be uploaded before a PDF).
  const [bg] = await db.insert(clientBrandGuidelines).values({ clientIdCode })
    .onConflictDoUpdate({
      target: clientBrandGuidelines.clientIdCode,
      set: { updatedAt: new Date() },
    })
    .returning();

  await db.insert(driveFiles).values({
    driveFileId,
    folderId,
    originalName,
    displayName,
    mimeType,
    sizeBytes: sizeBytes ?? null,
    entityType: "brand_logo",
    entityId: bg.id,
    uploadedBy: session.user.email!,
  });

  // Build the public URL: drive uses a webViewLink; for now store a stable
  // openable URL using the file id (front-end can use it).
  const url = `https://drive.google.com/file/d/${driveFileId}/view`;

  const summaryLogo = bg.summaryLogo ?? {
    primary_description: null, secondary_description: null, monochrome_description: null,
    clearspace_notes: null, misuse_notes: null,
    primary_url: null, secondary_url: null, monochrome_url: null,
  };
  const updated = { ...summaryLogo, [`${slot}_url`]: url };

  await db.update(clientBrandGuidelines)
    .set({ summaryLogo: updated, updatedAt: new Date() })
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));

  return NextResponse.json({ ok: true, slot, url });
}
```

- [ ] **Step 4: Create logo-files/[driveFileId]/route.ts (DELETE)**

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; driveFileId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, driveFileId } = await params;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  if (!bg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [file] = await db.select().from(driveFiles)
    .where(and(
      eq(driveFiles.driveFileId, driveFileId),
      eq(driveFiles.entityType, "brand_logo"),
      eq(driveFiles.entityId, bg.id),
    )).limit(1);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await driveClient.deleteFile(driveFileId);
  await db.delete(driveFiles).where(eq(driveFiles.id, file.id));

  const url = `https://drive.google.com/file/d/${driveFileId}/view`;
  const logo = bg.summaryLogo ?? null;
  if (logo) {
    const next = { ...logo };
    if (next.primary_url === url) next.primary_url = null;
    if (next.secondary_url === url) next.secondary_url = null;
    if (next.monochrome_url === url) next.monochrome_url = null;
    await db.update(clientBrandGuidelines).set({ summaryLogo: next, updatedAt: new Date() })
      .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/clients/\[clientIdCode\]/brand-guidelines/notes \
        src/app/api/clients/\[clientIdCode\]/brand-guidelines/logo-files
git commit -m "feat(brand-guidelines): notes routes + logo-files routes"
```

---

# Milestone C — UI Tab + Components

## Task C1: Add 4th tab to client layout

**Files:**
- Modify: `src/app/clients/[clientIdCode]/layout.tsx:7-11`

- [ ] **Step 1: Add the entry**

Replace lines 7-11 of `src/app/clients/[clientIdCode]/layout.tsx`:

```tsx
const TABS = [
  { label: "Overview", href: "" },
  { label: "Inventory", href: "/inventory" },
  { label: "Forecast", href: "/forecast" },
  { label: "Brand Guidelines", href: "/brand-guidelines" },
] as const;
```

- [ ] **Step 2: Smoke test**

Run: `PORT=3000 npm run dev` (background), navigate to `/clients/<any-client>`. Expected: 4 tabs visible. Clicking "Brand Guidelines" gets a 404 — that's fine, page comes in C2.

- [ ] **Step 3: Commit**

```bash
git add src/app/clients/\[clientIdCode\]/layout.tsx
git commit -m "feat(brand-guidelines): add 4th tab"
```

---

## Task C2: Page scaffold + RSC data fetch

**Files:**
- Create: `src/app/clients/[clientIdCode]/brand-guidelines/page.tsx`
- Create: `src/components/clients/brand-guidelines-page.tsx`

The page is a thin RSC that fetches initial state (auth + DB) and passes it to a client component which manages mutations via `@tanstack/react-query`.

- [ ] **Step 1: Create the RSC page**

`src/app/clients/[clientIdCode]/brand-guidelines/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
  driveFiles,
} from "@/lib/db/schema";
import BrandGuidelinesPage from "@/components/clients/brand-guidelines-page";

export default async function Page({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  const versions = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode))
    .orderBy(desc(clientBrandGuidelineVersions.versionNumber));
  const activeVersion = versions.find((v) => v.archivedAt === null) ?? null;
  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));
  const logoFiles = bg
    ? await db.select().from(driveFiles)
        .where(and(eq(driveFiles.entityType, "brand_logo"), eq(driveFiles.entityId, bg.id)))
    : [];

  return (
    <BrandGuidelinesPage
      clientIdCode={clientIdCode}
      role={session.user.role}
      currentUserEmail={session.user.email!}
      initialState={{
        bg: bg ?? null,
        activeVersion,
        versions,
        notes,
        logoFiles,
      }}
    />
  );
}
```

- [ ] **Step 2: Create the client component skeleton**

`src/components/clients/brand-guidelines-page.tsx`:

```tsx
"use client";

import { useState } from "react";
import BrandBookCard from "./brand-book-card";
import BrandSummaryCards from "./brand-summary-cards";
import BrandLogoUploader from "./brand-logo-uploader";
import BrandNotesTimeline from "./brand-notes-timeline";
import BrandVersionHistory from "./brand-version-history";
import BrandMdPreview from "./brand-md-preview";

type Role = "admin" | "editor" | "viewer" | "client" | "pending";

export interface InitialState {
  bg: any | null;
  activeVersion: any | null;
  versions: any[];
  notes: any[];
  logoFiles: any[];
}

export default function BrandGuidelinesPage({
  clientIdCode,
  role,
  currentUserEmail,
  initialState,
}: {
  clientIdCode: string;
  role: Role;
  currentUserEmail: string;
  initialState: InitialState;
}) {
  const [state, setState] = useState(initialState);
  const canEdit = role === "admin" || role === "editor";

  async function refresh() {
    const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines`);
    if (!r.ok) return;
    const data = await r.json();
    setState({
      bg: data.state ? { ...data.state } : null,
      activeVersion: data.activeVersion,
      versions: data.versions,
      notes: data.notes,
      logoFiles: state.logoFiles,
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Brand Guidelines</h1>
        <p className="text-sm text-muted-foreground">
          {clientIdCode}'s active brand book + team notes
        </p>
      </header>

      <BrandBookCard
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        activeVersion={state.activeVersion}
        bg={state.bg}
        onChange={refresh}
      />

      <BrandSummaryCards
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        bg={state.bg}
        onChange={refresh}
      />

      <BrandLogoUploader
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        bg={state.bg}
        logoFiles={state.logoFiles}
        onChange={refresh}
      />

      <BrandNotesTimeline
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        notes={state.notes}
        currentUserEmail={currentUserEmail}
        isAdmin={role === "admin"}
        onChange={refresh}
      />

      <BrandVersionHistory versions={state.versions} />

      <BrandMdPreview clientIdCode={clientIdCode} />
    </div>
  );
}
```

- [ ] **Step 3: Stub out the 6 child components so the page builds**

Create each of the following with a minimal placeholder render. Real implementations come in C3-C7. This unblocks `next build` and lets us see the layout in dev.

`src/components/clients/brand-book-card.tsx`:
```tsx
"use client";
export default function BrandBookCard(props: any) {
  return <section className="border rounded p-4"><h2 className="font-medium">Active brand book</h2><pre className="text-xs">{JSON.stringify(props.activeVersion, null, 2)}</pre></section>;
}
```

`src/components/clients/brand-summary-cards.tsx`:
```tsx
"use client";
export default function BrandSummaryCards(props: any) {
  return <section className="border rounded p-4"><h2 className="font-medium">Summary</h2><pre className="text-xs">{JSON.stringify(props.bg, null, 2)}</pre></section>;
}
```

`src/components/clients/brand-logo-uploader.tsx`:
```tsx
"use client";
export default function BrandLogoUploader(props: any) {
  return <section className="border rounded p-4"><h2 className="font-medium">Logo files</h2></section>;
}
```

`src/components/clients/brand-notes-timeline.tsx`:
```tsx
"use client";
export default function BrandNotesTimeline(props: any) {
  return <section className="border rounded p-4"><h2 className="font-medium">Other Guidelines</h2><pre className="text-xs">{JSON.stringify(props.notes, null, 2)}</pre></section>;
}
```

`src/components/clients/brand-version-history.tsx`:
```tsx
"use client";
export default function BrandVersionHistory({ versions }: { versions: any[] }) {
  return <section className="border rounded p-4"><h2 className="font-medium">Version history ({versions.length})</h2></section>;
}
```

`src/components/clients/brand-md-preview.tsx`:
```tsx
"use client";
export default function BrandMdPreview({ clientIdCode }: { clientIdCode: string }) {
  return <section className="border rounded p-4"><h2 className="font-medium">AI preview</h2><a className="text-sm underline" href={`/api/clients/${clientIdCode}/brand-guidelines/md`} target="_blank" rel="noreferrer">Open raw markdown</a></section>;
}
```

- [ ] **Step 4: Smoke test**

Run: `npm run build` (or load page in dev). Expected: page renders for a client without brand guidelines (empty state) and for one with data (JSON shown).

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/\[clientIdCode\]/brand-guidelines src/components/clients/brand-{guidelines-page,book-card,summary-cards,logo-uploader,notes-timeline,version-history,md-preview}.tsx
git commit -m "feat(brand-guidelines): page scaffold + 6 component stubs"
```

---

## Task C3: brand-book-card — upload (browser→Drive resumable) + Re-extract

**Files:**
- Modify: `src/components/clients/brand-book-card.tsx`

The card shows the active book, exposes `Download`, `Replace` (triggers full upload flow), and `Re-extract` (no upload, just re-runs extraction).

- [ ] **Step 1: Implement the upload flow**

Replace `src/components/clients/brand-book-card.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  activeVersion: any | null;
  bg: any | null;
  onChange: () => Promise<void>;
}

async function uploadPdf(clientIdCode: string, file: File): Promise<void> {
  // 1. Initiate resumable session (only metadata flows through Vercel).
  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientIdCode,
      folderType: "brand_guidelines",
      mimeType: file.type || "application/pdf",
      fileName: file.name,
    }),
  });
  if (!sessionRes.ok) throw new Error(`upload-session failed: ${sessionRes.status}`);
  const sessionJson: { sessionUri: string; displayName: string; folderId: string } = await sessionRes.json();

  // 2. PUT bytes directly to Drive (no Vercel involvement).
  const putRes = await fetch(sessionJson.sessionUri, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/pdf" },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Drive PUT failed: ${putRes.status}`);
  const driveResult: { id: string } = await putRes.json();

  // 3. Tell our API to archive the prior version, insert version row, run extraction.
  const recordRes = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveFileId: driveResult.id,
      folderId: sessionJson.folderId,
      displayName: sessionJson.displayName,
      originalName: file.name,
      mimeType: file.type || "application/pdf",
      sizeBytes: file.size,
    }),
  });
  if (!recordRes.ok) {
    const body = await recordRes.text().catch(() => "");
    throw new Error(`/versions failed: ${recordRes.status} ${body}`);
  }
}

export default function BrandBookCard({ clientIdCode, canEdit, activeVersion, bg, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Must be a PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setErr(`File too large (>${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB).`);
      return;
    }
    setBusy(true);
    try {
      await uploadPdf(clientIdCode, file);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onReExtract() {
    if (!activeVersion) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/clients/${clientIdCode}/brand-guidelines/versions/${activeVersion.id}/re-extract`,
        { method: "POST" }
      );
      if (!r.ok) throw new Error(`re-extract failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const status = bg?.extractionStatus ?? "idle";
  const driveUrl = activeVersion ? `https://drive.google.com/file/d/${activeVersion.driveFileId}/view` : null;

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <h2 className="font-medium">Active brand book</h2>
      {activeVersion ? (
        <div className="text-sm flex flex-col gap-1">
          <div>
            <span className="font-medium">{activeVersion.originalFilename}</span>
            {" · "}
            v{activeVersion.versionNumber}
            {" · uploaded "}
            {new Date(activeVersion.uploadedAt).toLocaleDateString()}
            {" by "}
            {activeVersion.uploadedBy}
          </div>
          <div className="flex gap-2 mt-2">
            {driveUrl && (
              <a className="border px-3 py-1 rounded text-sm" href={driveUrl} target="_blank" rel="noreferrer">Download</a>
            )}
            {canEdit && (
              <button className="border px-3 py-1 rounded text-sm disabled:opacity-50" disabled={busy} onClick={() => inputRef.current?.click()}>Replace</button>
            )}
            {canEdit && (
              <button className="border px-3 py-1 rounded text-sm disabled:opacity-50" disabled={busy} onClick={onReExtract}>Re-extract</button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">No brand book uploaded yet.</p>
          {canEdit && (
            <button className="border px-3 py-1 rounded text-sm w-fit disabled:opacity-50" disabled={busy} onClick={() => inputRef.current?.click()}>Upload PDF</button>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickFile} />
      {busy && <div className="text-sm text-muted-foreground">Working — extraction can take 30-90s for a typical brand book.</div>}
      {status === "extracting" && <div className="text-sm text-blue-600">Extraction in progress…</div>}
      {status === "failed" && (
        <div className="text-sm text-red-600">Extraction failed: {bg?.lastExtractionError ?? "unknown error"}. Try Re-extract.</div>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Smoke test (manual, dev)**

With dev server up, upload a small PDF. Verify it appears in the active-book card with v1 + status idle. Verify Drive folder structure has been created (`Brand Guidelines/{clientIdCode}_noa_brand_guidelines_0_<ts>.pdf`).

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/brand-book-card.tsx
git commit -m "feat(brand-guidelines): brand-book-card with browser→Drive resumable upload"
```

---

## Task C4: brand-summary-cards — 4 editable cards

**Files:**
- Modify: `src/components/clients/brand-summary-cards.tsx`

Four side-by-side cards (collapse to vertical on narrow). Each has an "Edit" toggle that swaps the read view for a textarea/JSON editor and a Save button (PATCH /summary). Initial implementation uses raw textareas with JSON; refining to per-field forms is OOS for v1.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  bg: any | null;
  onChange: () => Promise<void>;
}

type FieldKey = "logo" | "colors" | "typography" | "voice";

const TITLES: Record<FieldKey, string> = {
  logo: "Logo",
  colors: "Colors",
  typography: "Typography",
  voice: "Voice & tone",
};

function getFieldValue(bg: any | null, key: FieldKey) {
  if (!bg) return null;
  if (key === "logo") return bg.summary?.logo ?? bg.summaryLogo ?? null;
  if (key === "colors") return bg.summary?.colors ?? bg.summaryColors ?? [];
  if (key === "typography") return bg.summary?.typography ?? bg.summaryTypography ?? null;
  return bg.summary?.voice ?? bg.summaryVoice ?? null;
}

export default function BrandSummaryCards({ clientIdCode, canEdit, bg, onChange }: Props) {
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startEdit(key: FieldKey) {
    setEditing(key);
    setDraft(JSON.stringify(getFieldValue(bg, key), null, 2));
    setErr(null);
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      const parsed = JSON.parse(draft);
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editing]: parsed }),
      });
      if (!r.ok) throw new Error(`save failed: ${r.status}`);
      await onChange();
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {(Object.keys(TITLES) as FieldKey[]).map((key) => {
        const value = getFieldValue(bg, key);
        const isEditing = editing === key;
        return (
          <div key={key} className="border rounded p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{TITLES[key]}</h3>
              {canEdit && !isEditing && (
                <button className="text-xs underline" onClick={() => startEdit(key)}>Edit</button>
              )}
            </div>
            {isEditing ? (
              <>
                <textarea
                  className="border rounded p-2 text-xs font-mono h-48"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="border px-2 py-1 rounded text-xs disabled:opacity-50" disabled={busy} onClick={save}>Save</button>
                  <button className="border px-2 py-1 rounded text-xs" onClick={() => setEditing(null)}>Cancel</button>
                </div>
                {err && <div className="text-xs text-red-600">{err}</div>}
              </>
            ) : (
              <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                {value ? JSON.stringify(value, null, 2) : "—"}
              </pre>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Smoke test**

Edit one card → save → verify the value persists after refresh.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/brand-summary-cards.tsx
git commit -m "feat(brand-guidelines): editable summary cards (JSON editor v1)"
```

---

## Task C5: brand-logo-uploader — 3 slots + delete

**Files:**
- Modify: `src/components/clients/brand-logo-uploader.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useRef, useState } from "react";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  bg: any | null;
  logoFiles: any[];
  onChange: () => Promise<void>;
}

const SLOTS = ["primary", "secondary", "monochrome"] as const;
type Slot = (typeof SLOTS)[number];

async function uploadLogo(clientIdCode: string, slot: Slot, file: File): Promise<void> {
  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientIdCode,
      folderType: "brand_guidelines",
      mimeType: file.type || "image/png",
      fileName: file.name,
      imageSlot: `logo_${slot}`,
    }),
  });
  if (!sessionRes.ok) throw new Error(`upload-session failed: ${sessionRes.status}`);
  const session: { sessionUri: string; displayName: string; folderId: string } = await sessionRes.json();

  const putRes = await fetch(session.sessionUri, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Drive PUT failed: ${putRes.status}`);
  const driveResult: { id: string } = await putRes.json();

  const recordRes = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/logo-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driveFileId: driveResult.id,
      folderId: session.folderId,
      displayName: session.displayName,
      originalName: file.name,
      mimeType: file.type || "image/png",
      sizeBytes: file.size,
      slot,
    }),
  });
  if (!recordRes.ok) throw new Error(`logo-files POST failed: ${recordRes.status}`);
}

export default function BrandLogoUploader({ clientIdCode, canEdit, bg, logoFiles, onChange }: Props) {
  const refs = useRef<Record<Slot, HTMLInputElement | null>>({ primary: null, secondary: null, monochrome: null });
  const [busy, setBusy] = useState<Slot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const logo = bg?.summary?.logo ?? bg?.summaryLogo ?? null;

  async function onPick(slot: Slot, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (file.size > MAX_LOGO_BYTES) {
      setErr(`Logo too large (>${MAX_LOGO_BYTES / 1024 / 1024}MB).`);
      return;
    }
    setBusy(slot);
    try {
      await uploadLogo(clientIdCode, slot, file);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      const ref = refs.current[slot];
      if (ref) ref.value = "";
    }
  }

  async function onDelete(slot: Slot) {
    const url: string | null = logo?.[`${slot}_url`] ?? null;
    if (!url) return;
    const driveFileId = url.split("/d/")[1]?.split("/")[0];
    if (!driveFileId) return;
    setBusy(slot);
    setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/logo-files/${driveFileId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <h2 className="font-medium">Logo files</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SLOTS.map((slot) => {
          const url: string | null = logo?.[`${slot}_url`] ?? null;
          return (
            <div key={slot} className="border rounded p-3 flex flex-col gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{slot}</div>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="text-sm underline break-all">View</a>
              ) : (
                <div className="text-sm text-muted-foreground">No file</div>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                    disabled={busy === slot}
                    onClick={() => refs.current[slot]?.click()}
                  >
                    {url ? "Replace" : "Upload"}
                  </button>
                  {url && (
                    <button
                      className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                      disabled={busy === slot}
                      onClick={() => onDelete(slot)}
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={(el) => { refs.current[slot] = el; }}
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onPick(slot, e)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/clients/brand-logo-uploader.tsx
git commit -m "feat(brand-guidelines): logo uploader (3 slots + delete)"
```

---

## Task C6: brand-notes-timeline — list + add + edit + delete

**Files:**
- Modify: `src/components/clients/brand-notes-timeline.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";

interface Note {
  id: string;
  bodyMd: string;
  authorEmail: string;
  createdAt: string;
}
interface Props {
  clientIdCode: string;
  canEdit: boolean;
  notes: Note[];
  currentUserEmail: string;
  isAdmin: boolean;
  onChange: () => Promise<void>;
}

export default function BrandNotesTimeline({
  clientIdCode, canEdit, notes, currentUserEmail, isAdmin, onChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!draft.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_md: draft }),
      });
      if (!r.ok) throw new Error(`add failed: ${r.status}`);
      setDraft("");
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function saveEdit(noteId: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_md: editDraft }),
      });
      if (!r.ok) throw new Error(`edit failed: ${r.status}`);
      setEditingId(null);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function del(noteId: string) {
    if (!confirm("Delete this note?")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes/${noteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <h2 className="font-medium">Other Guidelines</h2>
      {canEdit && (
        <div className="flex flex-col gap-2">
          <textarea
            className="border rounded p-2 text-sm h-24"
            placeholder="Add a dated note (markdown)…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="border px-3 py-1 rounded text-sm w-fit disabled:opacity-50" disabled={busy || !draft.trim()} onClick={add}>
            + Add note
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {notes.map((n) => {
          const isEditing = editingId === n.id;
          const canMutate = canEdit && (isAdmin || n.authorEmail === currentUserEmail);
          return (
            <li key={n.id} className="border-l pl-3">
              <div className="text-xs text-muted-foreground">
                {new Date(n.createdAt).toISOString().slice(0, 10)} — {n.authorEmail}
              </div>
              {isEditing ? (
                <>
                  <textarea
                    className="border rounded p-2 text-sm h-24 w-full"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1">
                    <button className="border px-2 py-1 rounded text-xs disabled:opacity-50" disabled={busy} onClick={() => saveEdit(n.id)}>Save</button>
                    <button className="border px-2 py-1 rounded text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm whitespace-pre-wrap">{n.bodyMd}</div>
                  {canMutate && (
                    <div className="flex gap-2 text-xs mt-1">
                      <button className="underline" onClick={() => { setEditingId(n.id); setEditDraft(n.bodyMd); }}>Edit</button>
                      <button className="underline text-red-600" onClick={() => del(n.id)}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {err && <div className="text-sm text-red-600">{err}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/clients/brand-notes-timeline.tsx
git commit -m "feat(brand-guidelines): notes timeline with add/edit/delete"
```

---

## Task C7: brand-version-history + brand-md-preview (real)

**Files:**
- Modify: `src/components/clients/brand-version-history.tsx`
- Modify: `src/components/clients/brand-md-preview.tsx`

- [ ] **Step 1: Replace `brand-version-history.tsx`**

```tsx
"use client";

import { useState } from "react";

interface Version {
  id: string;
  versionNumber: number;
  originalFilename: string;
  uploadedBy: string;
  uploadedAt: string;
  archivedAt: string | null;
  driveFileId: string;
  pageCount: number | null;
}

export default function BrandVersionHistory({ versions }: { versions: Version[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border rounded p-4">
      <button className="font-medium flex items-center gap-2" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▼" : "▶"}</span>
        Version history ({versions.length})
      </button>
      {open && (
        <table className="text-sm mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-3">v</th>
              <th className="py-1 pr-3">Filename</th>
              <th className="py-1 pr-3">Uploaded</th>
              <th className="py-1 pr-3">By</th>
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Pages</th>
              <th className="py-1 pr-3">File</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-1 pr-3">{v.versionNumber}</td>
                <td className="py-1 pr-3">{v.originalFilename}</td>
                <td className="py-1 pr-3">{new Date(v.uploadedAt).toLocaleString()}</td>
                <td className="py-1 pr-3">{v.uploadedBy}</td>
                <td className="py-1 pr-3">{v.archivedAt ? "archived" : "active"}</td>
                <td className="py-1 pr-3">{v.pageCount ?? "—"}</td>
                <td className="py-1 pr-3">
                  <a className="underline" href={`https://drive.google.com/file/d/${v.driveFileId}/view`} target="_blank" rel="noreferrer">Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Replace `brand-md-preview.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function BrandMdPreview({ clientIdCode }: { clientIdCode: string }) {
  const [open, setOpen] = useState(false);
  const [md, setMd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/md`);
      setMd(r.ok ? await r.text() : `(error: ${r.status})`);
    } finally { setBusy(false); }
  }

  return (
    <section className="border rounded p-4">
      <button
        className="font-medium flex items-center gap-2"
        onClick={() => { setOpen((o) => { const next = !o; if (next && md === null) load(); return next; }); }}
      >
        <span>{open ? "▼" : "▶"}</span>
        AI preview (what AI agents see)
      </button>
      {open && (
        <pre className="text-xs whitespace-pre-wrap break-words mt-2 max-h-96 overflow-auto">
          {busy ? "Loading…" : md ?? ""}
        </pre>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Smoke test full flow (manual, dev)**

Upload a small PDF → wait for extraction → edit a card → add a note → expand AI preview → confirm note + edited card both appear in the markdown.

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/brand-version-history.tsx src/components/clients/brand-md-preview.tsx
git commit -m "feat(brand-guidelines): version history table + AI preview"
```

---

# Milestone D — SEO Snapshot Integration + SEO Plan 1 Amendment

## Task D1: Populate seo_projects.brand_guidelines on project create

**Files:**
- Create: `src/lib/brand-guidelines/snapshot.ts` (helper used by all SEO project insert sites — keeps logic DRY).
- Modify: `src/app/api/seo/projects/route.ts:252-266` (targeted-create insert) and `:352-364` (legacy-create insert).
- Modify: `src/app/api/variations/[id]/seo-projects/route.ts:237-249` and `:294-302` (variation-bulk inserts).

There are four `db.insert(seoProjects)` sites across two files. We extract one helper and call it at each site so the snapshot logic stays in lockstep.

- [ ] **Step 1: Create the helper**

Create `src/lib/brand-guidelines/snapshot.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import { renderBrandGuidelinesMd } from "./render";

export interface BrandGuidelinesSnapshot {
  brandGuidelines: string;
  brandGuidelinesLock:
    | {
        status: "locked";
        brand_voice: string | null;
        language_preferences: string | null;
        words_to_avoid: string[];
        audience_notes: string | null;
        positioning: string | null;
        raw_text: string | null;
      }
    | null;
}

/**
 * Build a snapshot of the client's current brand guidelines for embedding
 * into a new SEO project at creation time. Returns empty values if the
 * client has no guidelines yet — callers should treat that as "leave empty".
 */
export async function snapshotClientBrandGuidelines(
  clientIdCode: string | null | undefined
): Promise<BrandGuidelinesSnapshot> {
  if (!clientIdCode) return { brandGuidelines: "", brandGuidelinesLock: null };

  const [clientBg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  if (!clientBg?.activeVersionId) {
    return { brandGuidelines: "", brandGuidelinesLock: null };
  }

  const md = await renderBrandGuidelinesMd(clientIdCode);
  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, clientBg.activeVersionId)).limit(1);

  return {
    brandGuidelines: md,
    brandGuidelinesLock: {
      status: "locked",
      brand_voice: clientBg.summaryVoice?.attributes?.join(", ") || null,
      language_preferences: null,
      words_to_avoid: clientBg.summaryVoice?.donts ?? [],
      audience_notes: null,
      positioning: null,
      raw_text: activeVersion?.extractedMd ?? null,
    },
  };
}
```

- [ ] **Step 2: Wire into `src/app/api/seo/projects/route.ts`**

At top of file, import:

```ts
import { snapshotClientBrandGuidelines } from "@/lib/brand-guidelines/snapshot";
```

At line 252 (targeted-create), replace the `.values({ ... })` block to add the snapshot. Just before `db.transaction` at line 250, add:

```ts
const bgSnapshot = await snapshotClientBrandGuidelines(body.client_id_code);
```

Then inside the `.values({...})` object (around line 253-266), add:

```ts
            brandGuidelines: bgSnapshot.brandGuidelines,
            brandGuidelinesLock: bgSnapshot.brandGuidelinesLock,
```

Repeat for the legacy-create insert at line 352-364: just before `.insert(seoProjects)` at line 351, add:

```ts
const legacyBgSnapshot = await snapshotClientBrandGuidelines(body.client_id_code);
```

And inside `.values({...})`:

```ts
        brandGuidelines: legacyBgSnapshot.brandGuidelines,
        brandGuidelinesLock: legacyBgSnapshot.brandGuidelinesLock,
```

- [ ] **Step 3: Wire into `src/app/api/variations/[id]/seo-projects/route.ts`**

At top of file, import the same helper. At each of the two insert sites (lines 237-249 and 294-302), repeat the pattern: compute `await snapshotClientBrandGuidelines(clientId)` just before each insert and add `brandGuidelines` + `brandGuidelinesLock` to the values.

- [ ] **Step 4: Type-check + manual smoke test**

Run: `npx tsc --noEmit`
Then in dev: create a new SEO project for a client that has brand guidelines uploaded (any of the 4 paths — single, targeted, legacy, variation-bulk). Open the project's S1 page and confirm `brand_guidelines` is the rendered markdown and `brand_guidelines_lock.raw_text` is the extracted MD.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-guidelines/snapshot.ts \
        src/app/api/seo/projects/route.ts \
        src/app/api/variations/\[id\]/seo-projects/route.ts
git commit -m "feat(seo): snapshot client brand guidelines on project create (4 sites)"
```

---

## Task D2: "Refresh from client" button on S1

**Files:**
- Locate the S1 phase UI that renders `brand_guidelines` / `brand_guidelines_lock` editor. Likely candidate: `src/components/seo/s1-*.tsx` or `src/app/seo/projects/[id]/page.tsx`. Find via:
  ```bash
  grep -rn "brand_guidelines\|brandGuidelines\|brandGuidelinesLock" src/components/seo src/app/seo 2>/dev/null | head
  ```
- Create: `src/app/api/seo/projects/[id]/brand-guidelines/refresh/route.ts`

- [ ] **Step 1: Create the refresh route**

```ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  seoProjects,
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
} from "@/lib/db/schema";
import { renderBrandGuidelinesMd } from "@/lib/brand-guidelines/render";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [project] = await db.select().from(seoProjects)
    .where(eq(seoProjects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.clientIdCode) {
    return NextResponse.json({ error: "Project has no clientIdCode" }, { status: 400 });
  }

  const [clientBg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, project.clientIdCode)).limit(1);
  if (!clientBg?.activeVersionId) {
    return NextResponse.json({ error: "Client has no active brand guidelines" }, { status: 400 });
  }

  const md = await renderBrandGuidelinesMd(project.clientIdCode);
  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, clientBg.activeVersionId)).limit(1);

  await db.update(seoProjects).set({
    brandGuidelines: md,
    brandGuidelinesLock: {
      status: "locked",
      brand_voice: clientBg.summaryVoice?.attributes?.join(", ") || null,
      language_preferences: null,
      words_to_avoid: clientBg.summaryVoice?.donts ?? [],
      audience_notes: null,
      positioning: null,
      raw_text: activeVersion?.extractedMd ?? null,
    },
    updatedAt: new Date(),
  }).where(eq(seoProjects.id, id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Wire button into S1 UI**

In the S1 phase component (located in Step 1 above), add a "Refresh from client brand guidelines" button next to the brand-guidelines field. On click it shows a confirm dialog: "Refresh will overwrite project-specific edits to brand guidelines. Continue?". On confirm, POST to `/api/seo/projects/[id]/brand-guidelines/refresh` and then refresh the project state.

Minimum implementation (drop-in inside the existing S1 component):

```tsx
async function refreshFromClient(projectId: string) {
  if (!confirm("Refresh will overwrite project-specific edits to brand guidelines. Continue?")) return;
  const r = await fetch(`/api/seo/projects/${projectId}/brand-guidelines/refresh`, { method: "POST" });
  if (!r.ok) {
    alert(`Refresh failed: ${r.status}`);
    return;
  }
  // ...trigger whatever reload mechanism the S1 component already uses
}

// Then render: <button onClick={() => refreshFromClient(project.id)}>Refresh from client</button>
```

- [ ] **Step 3: Smoke test + commit**

```bash
npx tsc --noEmit
git add src/app/api/seo/projects/\[id\]/brand-guidelines/refresh/route.ts <S1 component file>
git commit -m "feat(seo): refresh brand guidelines from client snapshot button"
```

---

## Task D3: Amend SEO Manager Plan 1 (delete obsolete tasks + filesystem refs)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`

This is a documentation-only change. The Plan 1 file is mid-flight; Tasks 9-12 are obsoleted by the present plan; the `.claude/agent-memory/seo/brand-guidelines/{client_id_code}.md` filesystem path is dropped entirely (Vercel is ephemeral).

- [ ] **Step 1: Make the edits**

Apply the following changes:

1. **Line 11 (architecture summary):** replace
   ```
   Brand guidelines source-of-truth is the `.md` file at `.claude/agent-memory/seo/brand-guidelines/{client_id_code}.md`; DB mirror is `seo_projects.brand_guidelines_lock` jsonb, kept in sync via `syncBrandGuidelinesToProject`.
   ```
   with
   ```
   Brand guidelines source-of-truth is the `client_brand_guidelines` table (see `docs/superpowers/specs/2026-05-06-client-brand-guidelines-design.md` and the implementation plan `2026-05-06-client-brand-guidelines-implementation.md`). SEO projects snapshot from there at creation via `renderBrandGuidelinesMd()`; `seo_projects.brand_guidelines_lock` is populated from the snapshot. No filesystem artifact.
   ```

2. **Line 36 (milestone B summary row):** replace
   ```
   | **B — Brand guidelines storage** | 9-12 | `.md` ↔ DB sync working, `/api/seo/projects/[id]/brand-guidelines` route live |
   ```
   with
   ```
   | **B — Brand guidelines storage** | — | OBSOLETED by client-level brand guidelines. See `2026-05-06-client-brand-guidelines-implementation.md` (D1, D2). |
   ```

3. **Lines 65, 73, 80, 89, 90 (file-tree references):** delete the `.claude/agent-memory/seo/brand-guidelines/` directory line, the `brand-guidelines.ts` line, the `brand-guidelines/` skill subfolder line, and the two test files (`brand-guidelines.test.ts`, `brand-guidelines-sync.test.ts`).

4. **Tasks 9, 10, 11, 12 (whole sections, lines ~922-1413):** delete entirely. Keep Task numbering of subsequent tasks as-is — these are deletions, not renumbers, so add a one-line marker:
   ```
   ### Tasks 9-12 — DELETED
   See `2026-05-06-client-brand-guidelines-implementation.md` (Tasks D1, D2). These tasks were obsoleted before execution.
   ```

5. **Task 22 (SKILL.md draft, around line 1584):** remove any line that references a filesystem brand-guidelines artifact. Replace with a one-liner pointing to `renderBrandGuidelinesMd()`.

- [ ] **Step 2: Verify no stale references remain**

Run: `grep -n ".claude/agent-memory/seo/brand-guidelines\|syncBrandGuidelinesToProject\|brand-guidelines.test.ts\|brand-guidelines-sync.test.ts" docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md
git commit -m "docs(seo): amend Plan 1 — delete Tasks 9-12, drop filesystem brand-guidelines path"
```

---

# Final verification

Run all of these in order. Stop at the first failure and fix before moving on.

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test`
- [ ] `npm run build`

End-to-end smoke (dev server up on PORT=3000):

- [ ] On a client without brand guidelines, the tab loads with empty state.
- [ ] Upload a small (≤5MB) brand book PDF → 4 summary cards populate within ~2 minutes.
- [ ] Edit one summary card → save → reload → edit persisted.
- [ ] Add a note → it appears in timeline.
- [ ] Re-upload another PDF → previous version moves to Archive/ in Drive; version history table shows v1 archived + v2 active.
- [ ] Re-extract on the active version → status flips extracting → idle without re-uploading.
- [ ] `GET /api/clients/{idCode}/brand-guidelines/md` returns coherent markdown with summary + extracted MD + notes.
- [ ] Create a new SEO project for that client → `seo_projects.brand_guidelines` is populated; the S1 "Refresh from client" button works.

If all pass, move to `superpowers:finishing-a-development-branch` to land.
