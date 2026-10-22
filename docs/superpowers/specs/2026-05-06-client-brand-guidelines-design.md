# Client Brand Guidelines — Design Spec

**Date:** 2026-05-06
**Status:** Draft (awaiting user review)
**Owner:** Manu (manuel.lancharro@1o8.agency)

## Goal

Add a per-client Brand Guidelines section to 1o8Hub. Each client gets a dedicated tab where the team uploads the client's brand book PDF, the app stores it in the client's Drive folder, automatically converts it to Markdown via pdf-parse + Claude (no Python / no Marker), extracts a structured summary (logo descriptions, color palette, typography, brand voice), and surfaces those summary fields as editable cards. A separate "Other Guidelines" timeline lets the team append dated notes from client calls. The Client level is the single source of truth; SEO projects and other features snapshot from here.

## Locked decisions

These were resolved during brainstorming (2026-05-06) and are not open for re-litigation:

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where do brand guidelines live | Client level (single source of truth). SEO projects snapshot from here. |
| 2 | PDF → MD converter | JS-native: `pdf-parse` for text + Anthropic Claude for MD reconstruction and summary extraction. **Not Marker.** |
| 3 | Structured summary fields | Logo, Colors, Typography, Voice & tone (all four). |
| 4 | Extraction flow | AI extracts, fully automatic. Team can edit cards post-hoc. |
| 5 | Brand books per client | Exactly one active + version history (archive on re-upload). |
| 6 | Other Guidelines shape | Timeline of dated notes (author + timestamp + markdown body). |
| 7 | AI consumption | DB is source of truth at runtime. Markdown is rendered on demand by `renderBrandGuidelinesMd()`. **No filesystem `.claude/agent-memory/...` artifact** (Vercel is ephemeral). |
| 8 | Page placement | New "Brand Guidelines" tab on Client detail (4th tab next to Overview / Inventory / Forecast). |
| 9 | Drive layout | Dedicated `Brand Guidelines/` subfolder under each client root, with nested `Brand Guidelines/Archive/` for superseded versions. Reuses existing `drive_folders` + `resolveUploadFolder` pattern. |
| 10 | SEO project columns | `seo_projects.brand_guidelines` + `brand_guidelines_lock` stay (no schema churn). They get auto-populated from the client's brand guidelines at SEO project creation, with a "Refresh from client" button on S1. |
| 11 | Logo handling (v1) | Text-only auto-extraction (descriptions, clearspace, misuse). Team uploads logo image files manually via a "Logo files" sub-uploader. **No PDF rasterization or Claude vision in v1.** |
| 12 | Extraction runtime | Synchronous in the upload route handler with `export const maxDuration = 300`. On failure, status flips to `failed` and the UI shows a "Re-extract" button. **No background-job queue.** |

## Architecture

### Data model

**New tables (3):**

```ts
// src/lib/db/schema.ts (additions)

export const clientBrandGuidelines = pgTable("client_brand_guidelines", {
  clientIdCode: varchar("client_id_code", { length: 100 }).primaryKey(),
  // FK to clients.id_code (or whatever the existing client identifier is)
  activeVersionId: uuid("active_version_id"),
  // FK to client_brand_guideline_versions.id, nullable until first upload

  summaryLogo: jsonb("summary_logo").$type<{
    primary_description: string | null
    secondary_description: string | null
    monochrome_description: string | null
    clearspace_notes: string | null
    misuse_notes: string | null
    // Manually uploaded logo files (Drive URLs):
    primary_url: string | null
    secondary_url: string | null
    monochrome_url: string | null
  }>().default({}),

  summaryColors: jsonb("summary_colors").$type<Array<{
    role: "primary" | "secondary" | "accent" | "neutral"
    name: string
    hex: string
    rgb: string | null
    cmyk: string | null
  }>>().default([]),

  summaryTypography: jsonb("summary_typography").$type<{
    primary: { family: string; weights: string[]; fallback: string | null } | null
    secondary: { family: string; weights: string[]; fallback: string | null } | null
  }>().default({ primary: null, secondary: null }),

  summaryVoice: jsonb("summary_voice").$type<{
    attributes: string[]
    dos: string[]
    donts: string[]
    sample_copy: string | null
  }>().default({ attributes: [], dos: [], donts: [], sample_copy: null }),

  extractionStatus: varchar("extraction_status", { length: 20 }).notNull().default("idle"),
  // 'idle' | 'extracting' | 'failed'
  lastExtractedAt: timestamp("last_extracted_at", { withTimezone: true }),
  lastExtractionModel: text("last_extraction_model"),
  lastExtractionError: text("last_extraction_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

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
    // null = active; set when superseded by a new upload
  },
  (t) => [
    index("idx_cbgv_client").on(t.clientIdCode),
    index("idx_cbgv_active").on(t.clientIdCode, t.archivedAt),
    unique("uq_cbgv_client_version").on(t.clientIdCode, t.versionNumber),
  ]
)

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
)
```

**Reused as-is (no schema changes):**
- `drive_folders` — gets a new allowed value `folder_type = "brand_guidelines"` (column is `text`, no migration needed for the type itself).
- `drive_files` — used via polymorphic FK: `entityType="brand_book_version"` + `entityId=client_brand_guideline_versions.id` for the PDF; `entityType="brand_logo"` + `entityId=client_brand_guidelines.client_id_code` (cast as string) for manually uploaded logo files.
- `seo_projects.brand_guidelines` + `seo_projects.brand_guidelines_lock` — columns stay; populated from `client_brand_guidelines` at SEO project creation.

### Drive integration

**Folder structure (auto-created on first upload):**
```
{shared drive root}/
  {client root folder}/                 (existing, folder_type='client')
    Brand Guidelines/                   (NEW, folder_type='brand_guidelines')
      Archive/                          (NEW, folder_type='brand_guidelines_archive')
      {clientIdCode}_noa_brand_guidelines_v3_<unix_ts>.pdf   (active)
      logo_primary.png                  (manual logo uploads)
      ...
```

**Implementation:** extend [src/lib/drive-upload.ts:107](src/lib/drive-upload.ts#L107) `resolveUploadFolder` to handle `folderType: "brand_guidelines"`. The function already auto-creates intermediate folders with race-safe `onConflictDoNothing` — same pattern as `aplus`. New branch:

```ts
const foldersToCreate =
  folderType === "aplus"
    ? [...]
    : folderType === "brand_guidelines"
    ? [{ displayName: "Brand Guidelines", dbName: `${clientIdCode}_Brand Guidelines`, type: "brand_guidelines" }]
    : [{ displayName: folderType, dbName: `${clientIdCode}_${folderType}`, type: folderType }]
```

**Archive subfolder:** created lazily on the first re-upload (when there's an existing version to archive). Same race-safe insert pattern.

**File naming:** reuses [src/lib/drive-upload.ts:73](src/lib/drive-upload.ts#L73) `buildFileName({ clientIdCode, asin: null, folderType: "brand_guidelines", imageSlot: \`v${versionNumber}\`, mimeType })` → `{clientIdCode}_noa_brand_guidelines_v3_1746547200.pdf`.

### Upload + extraction flow

```
POST /api/clients/{idCode}/brand-guidelines/versions   (multipart, PDF only, ≤25MB)
  ├─ Validate (mime=application/pdf, size cap, clientIdCode exists)
  ├─ resolveUploadFolder({ clientIdCode, folderType: "brand_guidelines" })
  ├─ driveClient.uploadFile(buildFileName(...), folder.driveFolderId, buffer, "application/pdf")
  ├─ Insert drive_files row (entityType="brand_book_version", entityId=null for now)
  ├─ DB transaction:
  │    ├─ If a previous active version exists:
  │    │    ├─ Resolve Brand Guidelines/Archive/ folder (create if needed)
  │    │    ├─ driveClient.moveFile(previous.driveFileId, archiveFolderId, currentFolderId)
  │    │    └─ UPDATE client_brand_guideline_versions SET archived_at=now() WHERE id=previous.id
  │    ├─ INSERT client_brand_guideline_versions (versionNumber = MAX+1, archived_at=NULL)
  │    ├─ UPDATE drive_files SET entity_id = new.id
  │    └─ UPSERT client_brand_guidelines: active_version_id=new.id, extraction_status='extracting'
  ├─ Run extraction (synchronous, blocking — see below)
  └─ Return 200 { activeVersion, summary, status }
```

**Extraction body (also entered by `/re-extract`):**

```ts
async function runExtraction(versionId: uuid, pdfBuffer: Buffer) {
  try {
    const { text, numpages } = await pdfParse(pdfBuffer)

    const extractedMd = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: BRAND_BOOK_TO_MD_PROMPT,   // see prompts section
      messages: [{ role: "user", content: text }]
    }).then(r => r.content[0].type === "text" ? r.content[0].text : "")

    const summary = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: BRAND_BOOK_SUMMARY_PROMPT,
      messages: [{ role: "user", content: extractedMd }],
      tools: [{
        name: "save_summary",
        description: "Save the extracted brand summary",
        input_schema: BRAND_SUMMARY_TOOL_SCHEMA  // logo / colors / typography / voice
      }],
      tool_choice: { type: "tool", name: "save_summary" }
    }).then(r => extractToolUse(r, "save_summary"))

    await db.transaction(async (tx) => {
      await tx.update(clientBrandGuidelineVersions)
        .set({ extractedMd, pageCount: numpages })
        .where(eq(clientBrandGuidelineVersions.id, versionId))
      await tx.update(clientBrandGuidelines)
        .set({
          summaryLogo: summary.logo,
          summaryColors: summary.colors,
          summaryTypography: summary.typography,
          summaryVoice: summary.voice,
          extractionStatus: "idle",
          lastExtractedAt: new Date(),
          lastExtractionModel: "claude-sonnet-4-6",
          lastExtractionError: null,
          updatedAt: new Date(),
        })
        .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode))
    })
  } catch (err) {
    await db.update(clientBrandGuidelines).set({
      extractionStatus: "failed",
      lastExtractionError: String(err instanceof Error ? err.message : err),
      updatedAt: new Date(),
    }).where(eq(clientBrandGuidelines.clientIdCode, clientIdCode))
    throw err
  }
}
```

The route handler sets `export const maxDuration = 300` (Vercel Pro). pdf-parse runs in <2s for typical brand books; the two Claude calls dominate (typical 30-90s combined for a 30-page book at sonnet-4-6).

### `renderBrandGuidelinesMd()` — runtime markdown rendering

Pure function in `src/lib/brand-guidelines/render.ts`. Reads DB; returns markdown string. No filesystem.

```ts
export async function renderBrandGuidelinesMd(clientIdCode: string): Promise<string> {
  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1)
  if (!bg || !bg.activeVersionId) return ""  // empty string = "no guidelines uploaded"

  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, bg.activeVersionId)).limit(1)

  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt)
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt))

  return formatMarkdown({ bg, activeVersion, notes })  // template below
}
```

**Markdown template:**

```markdown
# Brand Guidelines — {clientName} ({clientIdCode})

> Last regenerated: {now ISO}
> Active brand book: v{N} — {originalFilename} (uploaded {uploadedAt} by {uploadedBy})

## Summary

### Logo
{primary_description}, {secondary_description}, {monochrome_description}
**Clearspace:** {clearspace_notes}
**Misuse:** {misuse_notes}
**Files:** primary={primary_url}, secondary={secondary_url}, monochrome={monochrome_url}

### Colors
| Role | Name | Hex | RGB | CMYK |
|------|------|-----|-----|------|
| primary | ... | #... | ... | ... |
| ... |

### Typography
- **Primary:** {family}, weights {…}, fallback {…}
- **Secondary:** {family}, weights {…}, fallback {…}

### Brand voice & tone
**Attributes:** {comma-joined attributes}
**Do:**
- ...
**Don't:**
- ...
**Sample copy:** {sample_copy}

## Full extracted brand book (v{N})
{extracted_md verbatim}

## Other guidelines (chronological)

### {YYYY-MM-DD} — {authorEmail}
{bodyMd}

### {YYYY-MM-DD} — {authorEmail}
{bodyMd}
```

**Consumers:**
1. `GET /api/clients/[idCode]/brand-guidelines/md` returns this string as `text/markdown`.
2. In-app AI features (SEO Manager S1, Content Specialist drafts, future A+ generators) `import { renderBrandGuidelinesMd }` and inject the result into prompts before calling the Anthropic API. Server-side, no HTTP.

### SEO snapshot

`seo_projects.brand_guidelines` and `brand_guidelines_lock` stay in their currently-planned shape (per SEO Manager Plan 1). Population logic changes:

```ts
// In the SEO project create handler (POST /api/seo/projects):
const clientBg = await getClientBrandGuidelines(clientIdCode)
if (clientBg?.activeVersionId) {
  const activeVersion = await getActiveVersion(clientIdCode)
  insertValues.brandGuidelines = await renderBrandGuidelinesMd(clientIdCode)
  insertValues.brandGuidelinesLock = {
    status: "locked",
    brand_voice:           clientBg.summaryVoice.attributes.join(", ") || null,
    language_preferences:  null,
    words_to_avoid:        clientBg.summaryVoice.donts ?? [],
    audience_notes:        null,
    positioning:           null,
    raw_text:              activeVersion?.extractedMd ?? null,
  }
}
```

A new "Refresh from client brand guidelines" button on the SEO project's S1 phase UI re-runs this populate logic with a confirm dialog (clobbers project-specific edits).

**SEO Plan 1 amendment (follow-up to this spec, not part of this implementation):**
- Tasks 9-12 (brand guidelines MD parser + DB sync + filesystem path + tests) become **obsolete** — delete from Plan 1.
- The `.claude/agent-memory/seo/brand-guidelines/{client_id_code}.md` path planned in Plan 1 → **dropped entirely**, replaced by `renderBrandGuidelinesMd()` server-side function.
- Task 22 / SKILL.md remains as planned but no longer references a filesystem brand-guidelines artifact.
- This amendment is captured in the implementation plan for this spec as a Milestone D follow-up.

### UI — Brand Guidelines tab

**Layout extension:** `src/app/clients/[clientIdCode]/layout.tsx` `TABS` constant gets `{ label: "Brand Guidelines", href: "/brand-guidelines" }`.

**Page:** `src/app/clients/[clientIdCode]/brand-guidelines/page.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ Brand Guidelines                                                │
│ {clientName}'s active brand book + team notes                   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ACTIVE BRAND BOOK                                           │ │
│ │ acme-brandbook-2025.pdf · v3 · uploaded 2026-05-06 by manu@ │ │
│ │ [Download]  [Replace]  [Re-extract]                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ {extraction status banner if extracting/failed}                 │
│                                                                 │
│ SUMMARY                                                         │
│ ┌──────────┬──────────┬──────────────┬──────────────┐          │
│ │ Logo     │ Colors   │ Typography   │ Voice        │  [Edit] │
│ │ (text)   │ (swatch  │ (font sample │ (attr chips, │          │
│ │ + thumbs │  grid)   │  + weights)  │  do/don't)   │          │
│ └──────────┴──────────┴──────────────┴──────────────┘          │
│                                                                 │
│ OTHER GUIDELINES                                                │
│ [+ Add note] textarea (markdown)                                │
│                                                                 │
│ • 2026-05-06 — manu@ · "After call: client wants…" [edit][del] │
│ • 2026-04-22 — sara@ · "Voice should skew younger…"  [edit]    │
│                                                                 │
│ ▶ VERSION HISTORY (3 total)                                     │
│ ▶ AI PREVIEW (what AI agents see) — dev toggle                  │
└─────────────────────────────────────────────────────────────────┘
```

**Components (new):**
- `src/components/clients/brand-guidelines-page.tsx` (page composition)
- `src/components/clients/brand-book-card.tsx` (active book + upload dialog)
- `src/components/clients/brand-summary-cards.tsx` (4 summary cards with inline edit)
- `src/components/clients/brand-logo-uploader.tsx` (manual logo file uploader)
- `src/components/clients/brand-notes-timeline.tsx` (Other Guidelines list + add)
- `src/components/clients/brand-version-history.tsx` (collapsible table)
- `src/components/clients/brand-md-preview.tsx` (collapsible markdown preview)

**State:** SWR or React Query (whichever the codebase already uses for `/clients/*` — to be confirmed during implementation).

**Permissions:** existing role gate. `editor` and `admin` can mutate; `viewer` is read-only; `client` doesn't see the tab.

### API surface

All under `src/app/api/clients/[clientIdCode]/brand-guidelines/`. All routes auth-gated by existing NextAuth middleware; all validate `clientIdCode` exists in `clients`; all mutations wrap in transactions; all return zod-typed JSON.

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/` | Full state: active version + summary fields + notes + recent versions list |
| GET    | `/md` | Returns `text/markdown` from `renderBrandGuidelinesMd()` |
| POST   | `/versions` | Multipart PDF upload → drive upload → archive previous → run extraction |
| POST   | `/versions/[versionId]/re-extract` | Re-run extraction on an existing version |
| PATCH  | `/summary` | Update summary fields (partial of logo / colors / typography / voice) |
| POST   | `/logo-files` | Multipart upload of logo image (PNG/SVG) into Brand Guidelines/ Drive folder |
| DELETE | `/logo-files/[driveFileId]` | Remove a logo file (Drive + drive_files row + clear summary_logo URL) |
| GET    | `/notes` | List notes (chronological, excludes soft-deleted) |
| POST   | `/notes` | Create note `{ body_md }` |
| PATCH  | `/notes/[noteId]` | Edit note (own entries only, unless admin) |
| DELETE | `/notes/[noteId]` | Soft-delete note |

### Prompts (initial)

Lives in `src/lib/brand-guidelines/prompts.ts`.

**`BRAND_BOOK_TO_MD_PROMPT`** — converts raw extracted PDF text to clean markdown:
> "You are converting raw text extracted from a brand book PDF into clean, well-structured Markdown. Preserve all section headings, lists, and tables. Remove page numbers, headers, footers, and orphan whitespace. Do NOT invent content; if a section is unclear, leave it as quoted raw text. Output only the markdown — no preamble."

**`BRAND_BOOK_SUMMARY_PROMPT`** — extracts structured summary fields:
> "You are reading a brand book in Markdown. Extract structured fields and call the `save_summary` tool exactly once. Fields: logo (descriptions, clearspace, misuse), colors (role / name / hex / rgb / cmyk), typography (primary + secondary), voice & tone (attributes, dos, donts, sample copy). If a field is not present in the document, return null/empty array — do NOT invent values."

The tool input schema enforces the exact `summary_*` shape from the data model.

## Out of scope (v1)

1. **No PDF rasterization / Claude vision logo cropping.** Logos are text-only auto-extraction + manual file uploads.
2. **No multi-brand portfolio.** One active brand book per client.
3. **No automated brand-compliance checking** of generated content. Future spec.
4. **No client portal exposure.** Clients don't see their guidelines via `/portal/*`.
5. **No multi-language brand books.** Assumes English; degrades silently otherwise.
6. **No external sync** to Asana / Notion / etc.
7. **No backfill.** Existing clients start empty; team uploads ad hoc.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Vercel function exceeds 300s on a giant brand book | Cap upload size at 25MB; truncate input to Claude at ~150k tokens; mark `failed` and surface "Re-extract" button. |
| Claude extracts wrong colors / fonts | Every summary card is editable. UI hint shown for 7 days post-upload: "Review and edit each card." |
| Concurrent uploads create duplicate folders | `resolveUploadFolder` already uses `onConflictDoNothing` — race-safe. |
| Old SEO projects get out-of-date snapshots | "Refresh from client" button on S1 with confirm dialog. |
| Notes deleted by mistake | Soft delete via `deleted_at`; admin-only restore via DB query in v1 (UI restore = future). |
| pdf-parse fails on encrypted / scanned PDFs | Caught in try/catch; status=`failed`, error message surfaced. Team's workaround: re-export the PDF unencrypted, re-upload. |
| Drive upload succeeds but DB transaction fails → orphaned Drive file | Acceptable v1 tradeoff (existing `resolveUploadFolder` pattern has the same property). Mitigation: after the transaction commits, the orphaned-file detection job (future, not v1) can sweep `Brand Guidelines/` folders for files with no `drive_files` row and delete them. For v1, manually clean up if it happens. |

## Open questions

(Each should be settled during planning, not implementation.)

1. **File-size cap exact value.** Spec says 25MB; confirm this matches Vercel's body-size limit (currently 4.5MB on serverless functions by default — may need to use a Vercel Blob upload or a presigned Drive URL pattern for larger files). **Most likely the upload needs to go directly to Drive from the browser using a resumable upload, with the API only handling metadata.** Resolve during Plan 1 of this spec.
2. **Logo file storage entity-type naming.** `entityType="brand_logo"` and casting client_id_code to a uuid-shaped column — is the existing `drive_files.entityId` (uuid) compatible, or do we need to rethink the polymorphic FK for a string PK? Likely we use the `client_brand_guidelines` row's synthetic `id` (would need to change `client_id_code` from PK to a regular unique column + add a uuid `id` PK). Resolve during data-model task.
3. **Auth for in-app AI imports of `renderBrandGuidelinesMd`.** Server-side only — the function reads from DB directly. The HTTP `/md` endpoint enforces NextAuth. Confirm there's no path where the function is exposed to client code.

## Coordination with other plans

**SEO Manager Plan 1 (mid-flight, not yet executed) — `docs/superpowers/plans/2026-05-06-1o8-seo-manager-implementation.md`**

After this Brand Guidelines spec is approved and the implementation plan is written, the SEO Plan 1 file needs amendment:
- Delete Tasks 9-12 (brand guidelines MD parser + DB sync + API route + tests). They're replaced by this spec's `renderBrandGuidelinesMd()`.
- Adjust the SEO project create handler description to populate `brand_guidelines` and `brand_guidelines_lock` from `client_brand_guidelines` instead of from a filesystem MD file.
- Remove all references to `.claude/agent-memory/seo/brand-guidelines/{client_id_code}.md`.
- Task 22 (SKILL.md) loses any mention of a filesystem brand-guidelines artifact.

This amendment is itself a Milestone D follow-up in the implementation plan for the present spec — not implementation work.

## Success criteria

- [ ] A team member can upload a brand book PDF on `/clients/{idCode}/brand-guidelines` and within ≤2 minutes see the four summary cards populated with extracted data.
- [ ] Each summary card is independently editable; edits persist and are visible in the AI preview pane.
- [ ] Re-uploading a new PDF archives the previous version into `Brand Guidelines/Archive/` in Drive and shows it in the version history table.
- [ ] Adding a note to "Other Guidelines" appears in the timeline immediately and shows up in the AI preview.
- [ ] `GET /api/clients/{idCode}/brand-guidelines/md` returns a valid markdown string consumable by Claude with no post-processing.
- [ ] Creating a new SEO project for a client with brand guidelines auto-populates `brand_guidelines` and `brand_guidelines_lock` on the seo_projects row.
- [ ] An extraction failure (e.g. encrypted PDF) sets `extraction_status='failed'`, surfaces the error in the UI, and a "Re-extract" button works after the user re-uploads or corrects the input.
- [ ] All tests (unit + route + integration) pass; type-check passes; lint passes.
