/**
 * 1o8 Hub ⇄ AAC sheet: tells the hub when someone edits the "AAC 1o8" tab, so
 * the change shows up in the hub within seconds. (Edits the hub itself writes
 * through the API don't fire this, so there are no loops.)
 *
 * Setup (once), in the AAC sheet: Extensions → Apps Script → paste this file →
 *   1. Project Settings → Script properties → add AAC_SYNC_SECRET (value from
 *      the hub's environment; never put it in the code).
 *   2. Run installTrigger() once and accept the permissions.
 */
const HUB_URL = "https://1o8-hub.vercel.app/api/webhooks/aac-sheet";
const TAB = "AAC 1o8";
const HEADER_ROWS = 3; // rows 1–3 are titles/headers

function onAacEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TAB) return;
  const first = Math.max(e.range.getRow(), HEADER_ROWS + 1);
  const last = e.range.getRow() + e.range.getNumRows() - 1;
  if (last < first) return;
  const rows = [];
  for (let r = first; r <= last && rows.length < 200; r++) rows.push(r);
  const secret = PropertiesService.getScriptProperties().getProperty("AAC_SYNC_SECRET");
  UrlFetchApp.fetch(HUB_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "x-aac-sync-secret": secret },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
}

/** Run once: installs the edit trigger (simple onEdit triggers can't call the hub). */
function installTrigger() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "onAacEdit")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onAacEdit").forSpreadsheet(ss).onEdit().create();
}
