import fs from "node:fs";
import path from "node:path";
import { google, type sheets_v4 } from "googleapis";
import { columnLetter } from "./columns";

/**
 * Google Sheets access for the AAC sync, as the hub's service account.
 * Credentials: GOOGLE_SERVICE_ACCOUNT_JSON (the key file's JSON, raw or
 * base64 — Vercel), else ./google-service-account.json (local, gitignored).
 * Target: AAC_SYNC_SPREADSHEET_ID (e.g. a test copy) or AAC_SPREADSHEET_ID;
 * tab AAC_SHEET_TAB (default "AAC 1o8").
 */
type ServiceAccount = { client_email: string; private_key: string };

function credentials(): ServiceAccount | null {
  const env = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (env) {
    try {
      const json = env.startsWith("{") ? env : Buffer.from(env, "base64").toString("utf8");
      return JSON.parse(json) as ServiceAccount;
    } catch {
      console.error("[aac-sync] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (raw or base64)");
      return null;
    }
  }
  const file = path.join(process.cwd(), "google-service-account.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as ServiceAccount) : null;
}

export function aacSheetConfigured(): boolean {
  return !!credentials() && !!(process.env.AAC_SYNC_SPREADSHEET_ID || process.env.AAC_SPREADSHEET_ID);
}

export function aacSheetTarget() {
  return {
    spreadsheetId: process.env.AAC_SYNC_SPREADSHEET_ID || process.env.AAC_SPREADSHEET_ID || "",
    tab: process.env.AAC_SHEET_TAB || "AAC 1o8",
  };
}

let client: sheets_v4.Sheets | null = null;
function sheets(): sheets_v4.Sheets {
  if (client) return client;
  const sa = credentials();
  if (!sa) throw new Error("No Google service account configured (GOOGLE_SERVICE_ACCOUNT_JSON or google-service-account.json)");
  const auth = new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  client = google.sheets({ version: "v4", auth });
  return client;
}

const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

/** Every cell of the tab as displayed (strings). */
export async function readAacGrid(): Promise<string[][]> {
  const { spreadsheetId, tab } = aacSheetTarget();
  const res = await sheets().spreadsheets.values.get({ spreadsheetId, range: quote(tab), valueRenderOption: "FORMATTED_VALUE" });
  return (res.data.values ?? []).map((r) => r.map((v) => (v == null ? "" : String(v))));
}

export type CellWrite = { rowNumber: number; colIndex: number; value: string };

/** Writes cells as plain text (RAW: nothing is parsed as a formula). */
export async function writeAacCells(writes: CellWrite[]): Promise<void> {
  if (!writes.length) return;
  const { spreadsheetId, tab } = aacSheetTarget();
  await sheets().spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: writes.map((w) => ({ range: `${quote(tab)}!${columnLetter(w.colIndex)}${w.rowNumber}`, values: [[w.value]] })),
    },
  });
}

/** Adds rows after the last one (cells by column index). */
export async function appendAacRows(rows: Record<number, string>[]): Promise<void> {
  if (!rows.length) return;
  const { spreadsheetId, tab } = aacSheetTarget();
  const width = Math.max(...rows.flatMap((r) => Object.keys(r).map(Number))) + 1;
  await sheets().spreadsheets.values.append({
    spreadsheetId,
    range: `${quote(tab)}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) },
  });
}
