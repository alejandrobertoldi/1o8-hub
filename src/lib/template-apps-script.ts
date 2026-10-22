// ═══════════════════════════════════════════════════════════════
// Apps Script source attached to attribute-template workbooks.
// — INCLUDE_TOGGLE_SCRIPT: onEdit simple trigger that live-hides/shows
//   columns in category tabs when users tick the Include checkbox in
//   the "Attributes Index" tab.
//
// The script reads two hidden helper columns on the Index tab:
//   G (col 7) — target sheet name (= category tab title)
//   H (col 8) — 1-based column index in that sheet
// Blank helpers mean "no-op" — that's the case for hideFromTemplate
// attrs which exist in the Index for visibility but have no column
// in any category tab to show/hide.
//
// ─── Master-template setup (one-time) ──────────────────────────
// Google's Apps Script API cannot be called by service accounts
// (it requires a per-user opt-in with no service-account UI), so
// template-requests/route.ts copies a pre-baked master spreadsheet
// instead of attaching the script at runtime.
//
// To (re)create the master:
//   1. In Google Drive, inside the same Shared Drive the service
//      account uses (GOOGLE_SHARED_DRIVE_ID), create a new blank
//      Google Sheet. Name it e.g. "1o8 Attribute Template Master".
//   2. Open Extensions → Apps Script.
//   3. In the editor's left rail, rename the project to match.
//   4. Paste the body of INCLUDE_TOGGLE_SCRIPT below into Code.gs,
//      replacing the default stub. Save.
//   5. The manifest (appsscript.json) is auto-created by the editor
//      and does not need manual edits.
//   6. Back in Drive, share the master file with the service account
//      email (GCP_CLIENT_EMAIL) with Editor access — or rely on
//      Shared Drive membership if the service account is a member.
//   7. Copy the file ID from the URL (…/spreadsheets/d/<ID>/edit)
//      and set it as ATTRIBUTE_TEMPLATE_MASTER_ID in the env.
// ═══════════════════════════════════════════════════════════════

// We intentionally do NOT use the onEdit(e) event object. When the script is
// carried through drive.files.copy the simple trigger sometimes fires with
// e=undefined (observed 2026-04-23) — reading from SpreadsheetApp.getActive*
// is resilient to that quirk and works identically for manual edits.
export const INCLUDE_TOGGLE_SCRIPT = `function onEdit() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    if (sheet.getName() !== 'Attributes Index') return;
    var range = sheet.getActiveRange();
    if (range.getColumn() !== 6) return;
    var row = range.getRow();
    if (row < 2) return;
    var targetSheetName = String(sheet.getRange(row, 7).getValue() || '');
    var targetCol = Number(sheet.getRange(row, 8).getValue() || 0);
    if (!targetSheetName || !targetCol) return;
    var target = ss.getSheetByName(targetSheetName);
    if (!target) return;
    var checked = range.getValue() === true;
    if (checked) {
      target.showColumns(targetCol);
    } else {
      target.hideColumns(targetCol);
    }
  } catch (err) {
    console.error(err);
  }
}
`;
