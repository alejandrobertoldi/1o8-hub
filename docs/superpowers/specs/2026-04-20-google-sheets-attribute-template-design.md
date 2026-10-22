# Google Sheets Attribute Template — Design Spec

**Date:** 2026-04-20
**Status:** Approved (brainstorming) — pending implementation plan
**Supersedes:** [2026-04-20-attribute-template-workbook-design.md](./2026-04-20-attribute-template-workbook-design.md) (XLSX flow)

## 1. Context & motivation

The current attribute-template flow ships an XLSX workbook: admin generates, client downloads, fills, returns, admin imports. Pain points:

- **Two-trip latency.** Clients stall between download and upload. Admins can't see progress until the file comes back.
- **Excel quirks on macOS.** Prior VBA / CFB binary attempts blocked features like dynamic column hiding. Conditional formatting + dropdown behavior differs across Excel-for-Mac / Excel-Win / LibreOffice.
- **No collaboration.** A single client contact owns the file; larger client teams can't split the work.
- **Drift.** The XLSX is a snapshot at download time. If the catalog updates (new ASINs, changed attribute metadata) between download and upload, the import either overwrites recent work or silently ignores it.

Google Sheets solves all three by (a) being the live fill-in surface, (b) supporting native multi-user edit, (c) giving the hub server-side read access at any moment.

## 2. Scope

**In scope (v1):**

- Create-new-request flow that provisions a Google Sheet in the client's shared-drive folder and returns a shareable link
- Sheet structure equivalent to the current XLSX (Instructions + per-category tabs + hidden Valid Values), minus the Attribute Reference round-trip
- Admin-side finalize: read sheet → diff against catalog → write into `products` table → protect sheet ranges → archive the Drive file
- Admin screen for `hideFromTemplate` toggle (replaces the in-sheet Attribute Reference tab)
- Deletion of XLSX generation and XLSX import routes + UI buttons

**Out of scope (explicit non-goals for v1):**

- Real-time webhook-driven sync (Drive push notifications) — deferred; the design chose sync model D (seed-once / finalize-once) over model C (webhook)
- Automatic catalog→sheet updates while edit is in progress — if catalog drifts mid-edit it surfaces at finalize time only
- Per-row partial finalize — finalize is whole-sheet; partial drift is resolved in the diff review UI, not via granular state
- Email / Slack notifications to clients when the sheet is created — link-sharing is out-of-band (admin copies URL)
- Support for clients without Google accounts to edit (Google requires sign-in to edit, even on anyone-with-link). This is a platform constraint, not a build choice.

## 3. Decisions locked during brainstorming

| # | Decision | Chosen | Consequence |
|---|----------|--------|-------------|
| 1 | Primary value | A+B+C — no downloads, real-time collab, always-current | Google Sheet replaces XLSX as fill-in surface |
| 2 | Sync model | D — seed once, fill freely, finalize imports & locks | No Drive-push webhooks; diff resolution at finalize |
| 3 | Sheet lifecycle | A — one Sheet per `template_request` | Sheet ID stored on request row |
| 4 | Access model | A — anyone-with-link, editor | Hub sets `writer` anyone-with-link permission at create |
| 5 | XLSX fate | A — deleted entirely; `hideFromTemplate` moves to admin UI | No dual codepath; single admin screen |
| 6 | Drive location | C — `Templates/InProgress/` in client folder → moves to `Templates/Archive/` on finalize | Archive move = one PATCH |

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Admin UI (TemplateDialog + new /attributes/config)       │
└────────────┬─────────────────────────────────────────────┘
             │
      ┌──────┴───────┬───────────────┬─────────────┬──────────────────┐
      ▼              ▼               ▼             ▼                  ▼
 [Create req]   [Preview diff]  [Finalize]    [Reopen]   [hideFromTemplate admin]
      │              │               │             │                  │
      ▼              ▼               ▼             ▼                  ▼
 POST   /template-requests              PATCH  /template-requests/{id}/reopen
 GET    /template-requests/{id}/diff    PATCH  /attributes/admin/hide-toggle
 PATCH  /template-requests/{id}/finalize
      │
      ▼
┌───────────────────┐     ┌─────────────────────────┐
│ sheets-client.ts  │ +   │ drive-client.ts         │
│  createSpreadsheet│     │  (existing, extended)   │
│  batchUpdate      │     │  + setAnyoneLinkWriter  │
│  getValues        │     │  + moveFile (exists)    │
│  setValues        │     └─────────────────────────┘
└───────────────────┘                │
            └─────────────┬───────────┘
                          ▼
              Google Drive / Sheets APIs
              (shared drive, client folder /Templates/{InProgress|Archive})
```

### 4.1 New files

| Path | Purpose |
|------|---------|
| `src/lib/sheets-client.ts` | Raw-fetch REST client mirroring `drive-client.ts` style. Methods: `createSpreadsheet(title)`, `batchUpdate(spreadsheetId, requests[])`, `getValues(spreadsheetId, ranges[])`, `setValues(spreadsheetId, range, values[][])`. Auth via `gcp-auth.ts` with added scope `https://www.googleapis.com/auth/spreadsheets`. |
| `src/lib/template-sheet-builder.ts` | Replaces `template-workbook-builder.ts`. Pure function: `buildCreateRequests(config: TemplateConfig) → { title, addSheetRequests, formatRequests }`. Returns structured `batchUpdate` request array; no side effects. |
| `src/app/api/attributes/template-requests/[id]/finalize/route.ts` | `PATCH` — reads sheet values, writes to `products`, protects ranges, archives Drive file. |
| `src/app/api/attributes/template-requests/[id]/diff/route.ts` | `GET` — returns three-way diff (seeded snapshot / sheet now / catalog now) for the admin review UI. |
| `src/app/api/attributes/template-requests/[id]/reopen/route.ts` | `PATCH` — unprotect ranges, move back to `InProgress/`, set `status='reopened'`. |
| `src/app/api/attributes/admin/hide-toggle/route.ts` | `PATCH` — admin flips `hideFromTemplate` for one or more `category_attributes` rows. |
| `src/components/attributes/hide-toggle-admin.tsx` | Admin table UI replacing the in-sheet Reference tab. |
| `src/components/attributes/finalize-diff-drawer.tsx` | Diff preview UI shown before finalize. |

### 4.2 Modified files

| Path | Change |
|------|--------|
| `src/app/api/attributes/template-requests/route.ts` | Replace XLSX-generation branch with Sheet-creation flow |
| `src/components/attributes/template-dialog.tsx` | Remove "Download XLSX" and "Import Reference XLSX" buttons; replace with "Create Sheet" (primary) + copy-link affordance |
| `src/lib/drive-client.ts` | Add `setAnyoneLinkWriter(fileId)` helper wrapping the permissions API |
| `src/lib/gcp-auth.ts` | No change — scopes are passed per call; document the new scope in a comment |
| `drizzle/schema.ts` (or equivalent — exact path verified in planning) | Add columns listed in §5 |

### 4.3 Deleted files

- `src/lib/template-workbook-builder.ts`
- `src/app/api/attributes/template/route.ts` (XLSX download endpoint)
- `src/app/api/attributes/template-import/route.ts` (XLSX upload / Attribute Reference parser)

The `exceljs` dependency is kept (used elsewhere if so — verified in planning; if unused it's also removed).

## 5. Data model

Extend `template_requests`:

```sql
ALTER TABLE template_requests
  ADD COLUMN google_sheet_id    text,
  ADD COLUMN sheet_url          text,
  ADD COLUMN drive_folder_id    text,                               -- InProgress folder
  ADD COLUMN archive_folder_id  text,                               -- destination on finalize
  ADD COLUMN status             text NOT NULL DEFAULT 'in_progress',-- 'in_progress' | 'finalized' | 'reopened' | 'legacy'
  ADD COLUMN seeded_snapshot    jsonb,                              -- catalog values at seed time
  ADD COLUMN finalized_at       timestamptz,
  ADD COLUMN finalized_by       text;                               -- admin email
```

`seeded_snapshot` shape:

```json
{
  "<productAsin>": {
    "<bibleFieldMatch>": "<value>"
  }
}
```

Enables three-way diff at finalize: `{seeded, sheetNow, catalogNow}` per cell.

**Status state machine:**
- `in_progress`: Sheet in `Templates/InProgress/`, editable by anyone-with-link
- `finalized`: Sheet in `Templates/Archive/`, all data ranges protected (read-only for link users, edit for service account only)
- `reopened`: Admin manually moved back to `in_progress`; same file, unprotected, audit entry written
- `legacy`: Pre-migration XLSX-era request; hub UI shows read-only

## 6. Key flows

### 6.1 Create request

1. Admin submits `TemplateDialog` form (client, category(ies), scope, levels) → `POST /api/attributes/template-requests`
2. Server resolves client's Drive folder (via existing onboarding-folder lookup). Ensures `Templates/InProgress/` and `Templates/Archive/` subfolders exist; creates if missing via `driveClient.createFolder`.
3. `sheetsClient.createSpreadsheet(title)` returns `spreadsheetId`. Default creates in service account's "My Drive."
4. `driveClient.moveFile(spreadsheetId, inProgressFolderId, rootParent)` moves it into the shared-drive folder.
5. `driveClient.setAnyoneLinkWriter(spreadsheetId)` grants anyone-with-link editor permission.
6. Compute `TemplateConfig` (sheets × products × attributes), excluding attributes where `hideFromTemplate = true`.
7. `buildCreateRequests(config)` → array of Sheets API `Request` objects (addSheet, updateSheetProperties, mergeCells, repeatCell, updateCells, setDataValidation, addProtectedRange, addConditionalFormatRule).
8. `sheetsClient.batchUpdate(spreadsheetId, requests)` — single API call.
9. Snapshot current catalog values into `seeded_snapshot` and insert the `template_requests` row.
10. Response: `{ request: { id, sheetUrl, status: 'in_progress' } }`.

### 6.2 Client fills (no server involvement)

Client opens the URL, signs into Google, edits the per-category tabs. Data validation provides dropdowns from the hidden Valid Values tab. Rows the admin marked `hideFromTemplate=true` are not present.

### 6.3 Preview diff (before finalize)

1. Admin opens the request row → clicks "Review & Finalize" → `GET /api/attributes/template-requests/{id}/diff`.
2. Server calls `sheetsClient.getValues(id, ranges=['Category A!A6:ZZ', ...])` — one range per data tab.
3. Parses values into `{ asin, field, sheetValue }` tuples.
4. Loads current catalog snapshot (`catalogNow`) and the stored `seeded_snapshot`.
5. Three-way diff per cell:
   - `unchanged`: `seeded == sheetNow == catalogNow`
   - `clientEdited`: `seeded == catalogNow ≠ sheetNow` → client filled something; safe to apply
   - `catalogDrifted`: `seeded ≠ catalogNow ≠ sheetNow` and `sheetNow == seeded` → someone changed catalog since seed; client saw stale; no client input
   - `conflict`: `sheetNow ≠ catalogNow ≠ seeded` and `sheetNow ≠ seeded` → both edited independently; admin must choose
6. Response: counts + up-to-200 sample rows for each bucket.
7. `FinalizeDiffDrawer` renders buckets; conflicts shown with a radio {keep sheet, keep catalog} selector.

### 6.4 Finalize

1. Admin confirms → `PATCH /api/attributes/template-requests/{id}/finalize` with `{ conflictResolutions: { "<asin>:<field>": "sheet" | "catalog" } }`.
2. Server re-reads sheet values (source of truth at this instant).
3. Builds the write set: apply `clientEdited` wholesale + `conflict` per resolution + skip `unchanged` and `catalogDrifted`.
4. Writes to `products` table via the existing product-update code path (same validation, same activity log).
5. `sheetsClient.batchUpdate(id, [protectData, prependFinalizedBanner])` — adds a `FINALIZED on YYYY-MM-DD by <admin>` banner row at top of each data tab; every non-header data cell protected (editors: service account only).
6. `driveClient.moveFile(id, archiveFolderId, inProgressFolderId)`.
7. Updates `template_requests`: `status='finalized'`, `finalized_at=now()`, `finalized_by=<admin email>`, `seeded_snapshot=null`.
8. Response: import summary (counts written, conflicts resolved, errors).

### 6.5 Reopen (rare)

`PATCH /api/attributes/template-requests/{id}/reopen` — unprotect ranges, move back to InProgress, `status='reopened'`. Activity log records the reopen.

### 6.6 Admin: hide-toggle

`/attributes/config` page lists every `category_attribute` (grouped by client + category) with a `hideFromTemplate` checkbox. `PATCH /api/attributes/admin/hide-toggle` accepts `{ ids: number[], hide: boolean }`. Changes take effect on the *next* generated sheet — does not retroactively mutate in-progress sheets.

## 7. Sheet structure (what `buildCreateRequests` emits)

Same visual layout as the current ExcelJS builder, minus the Attribute Reference tab. Tab list:

- **Instructions** — title, color legend, how-to, do's/don'ts. Unprotected but static.
- **Per-category** tabs (one per productType in request) — rows 1-5 are title/meta/group-headers/requirement-badges/attribute-labels; row 6+ is data. Frozen at `xSplit=2, ySplit=5`. Columns A (name) and B (ASIN) are protected (editors: service account only). Data cells use `setDataValidation` referencing the Valid Values tab.
- **Valid Values** (hidden) — one column per constrained attribute. Data validation formulae reference `='Valid Values'!$<col>$2:$<col>$<n>`.

**Formatting → Sheets API mapping:**

| Current ExcelJS | Sheets API equivalent |
|-----------------|-----------------------|
| Solid fill per requirement tint | `addConditionalFormatRule` with `BooleanCondition: TEXT_EQUALS` on header label OR direct `repeatCell` with `userEnteredFormat.backgroundColor` |
| Merged group header cells | `mergeCells` request |
| Frozen panes | `updateSheetProperties.gridProperties.frozenRowCount / frozenColumnCount` |
| Data validation | `setDataValidation` with `condition.type = ONE_OF_RANGE` pointing to Valid Values |
| Protected ranges | `addProtectedRange` with `editors.users: [serviceAccountEmail]` |
| Column widths | `updateDimensionProperties` with `pixelSize` |
| Conditional formatting (TRUE/FALSE) | N/A — Attribute Reference tab removed |

## 8. Error handling

- **Sheets API quotas** (default 60 writes/user/minute) — `sheets-client.ts` includes a small `withRetry(fn, {attempts:3, backoff:'exponential'})` helper. Create + all formatting collapses into a single `batchUpdate`, keeping worst case at 2 write calls per request creation.
- **Drive folder missing** — auto-create `Templates/InProgress/` and `Templates/Archive/` on first request for a client; surface as activity log entry.
- **Sheet deleted by client** — `diff` endpoint detects 404 from `getValues`, returns 409 with recovery instructions (create a new request). Finalize refuses on 404.
- **Catalog drift at finalize** — surfaced in diff preview; never silent. Admin resolves per-row in UI before confirming.
- **Permission lost** (admin accidentally revoked anyone-with-link) — diff endpoint detects 403, UI offers "Re-share link" button → calls `driveClient.setAnyoneLinkWriter` again.
- **Service-account quota exhaustion** — `gcp-auth.ts` already handles token refresh; monitor via existing observability route.
- **Partial write failure on finalize** — wrap DB writes in a transaction; if transaction fails, do not protect / move the sheet. Return error with row-level details; admin retries.
- **Oversized sheet** (>5 million cells — hard Sheets limit) — builder pre-checks total cell count; if >4M, returns 400 with "Split into multiple requests." Unlikely at current catalog size but documented.

## 9. Testing strategy

- **Unit — `sheets-client.ts`**: mock `fetch`, assert request shapes (URL, method, headers, body) match Sheets API spec for each method.
- **Unit — `template-sheet-builder.ts`**: snapshot-test the emitted `batchUpdate` request array for a fixture `TemplateConfig`; assert structural invariants (no duplicate sheet IDs, every data cell's column has a header, frozen-pane counts match).
- **Unit — finalize diff logic**: table-driven tests for every combination of (seeded / sheetNow / catalogNow) → expected bucket.
- **Integration — real Sheets sandbox**: happy-path seed → external write via test helper → diff → finalize → archive. Gated behind `TEST_GOOGLE_SHEETS=1`; skipped in CI by default. Uses a sandbox service account + dedicated test-client Drive folder.
- **E2E — Playwright**: single test through `TemplateDialog` create flow, then programmatically edit cells via `sheets-client.ts`, then click Review & Finalize, assert catalog updated and sheet archived. Gated same as integration.

## 10. Migration

Existing `template_requests` rows (XLSX era) are marked `status='legacy'` by a one-time script. The `TemplateDialog` filters them from the active list and shows them read-only under an "Archive" accordion with a "file_path" link to the original uploaded XLSX (if stored) or a note "No archive available." XLSX routes are deleted in the same PR — no in-flight XLSX requests can exist by the time this lands (verified during planning by checking `template_requests` table state).

## 11. Environment

No new env vars. Reuses:
- `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY` — service account credentials (existing)
- `GOOGLE_SHARED_DRIVE_ID` — shared drive root (existing, used by `drive-client.ts`)

Documented in `.env.example` with a note about the new `https://www.googleapis.com/auth/spreadsheets` scope usage.

## 12. Open questions (resolve in planning phase, not blocking spec approval)

- Exact schema path for the ALTER TABLE migration (Drizzle schema file location + whether to use `db:generate` or a raw SQL migration given the known `drizzle-kit migrate` hang)
- Whether any other feature currently depends on `exceljs` (if not, remove the dep)
- The `/attributes/config` page routing — new page vs. drawer inside existing attributes audit page
- Whether to ship v1 without the diff preview UI (finalize just applies `clientEdited` + all `conflict` as "keep sheet") and add preview in v1.1 — reduces first-PR scope by ~30%

## 13. Success criteria

- An admin can create a template request and receive a working Sheet URL in <10 seconds
- A client with no prior setup can open the link, sign into Google, and edit cells with working dropdowns
- Two client users can edit different categories concurrently without conflicts
- Admin finalize imports client-edited values into the catalog, archives the sheet, and the archived sheet is read-only to link holders
- All XLSX code paths (generator, import route, dialog buttons) are removed; no dead code
- Existing `drive-client.ts` usage is unaffected; new `sheets-client.ts` follows the same raw-fetch pattern

## 14. Non-decisions (documented for future reference)

- Chose native REST over `googleapis` SDK to stay consistent with `drive-client.ts`
- Chose model D (seed-once) over model C (webhook) for v1 — model C can replace finalize import later without schema changes
- Chose anyone-with-link over per-email sharing — matches current XLSX email/link trust model; per-email sharing can be added as a sibling option later without migration

---

*Implementation plan to be written next via the writing-plans skill.*
