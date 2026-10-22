/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
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
      const m = /\((\d{3}) /.exec(msg);
      const code = m ? Number(m[1]) : 0;
      const transient = code === 429 || (code >= 500 && code < 600);
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

  /** List the sheet IDs + titles of every tab in a spreadsheet. */
  async getSheetIds(
    spreadsheetId: string
  ): Promise<{ sheetId: number; title: string }[]> {
    const token = await sheetsToken();
    const params = new URLSearchParams({
      fields: "sheets.properties(sheetId,title)",
    });
    const res = await fetch(
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await checkResponse(res, "getSheetIds");
    const data = (await res.json()) as {
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    };
    return (data.sheets ?? [])
      .map((s) => ({
        sheetId: s.properties?.sheetId ?? -1,
        title: s.properties?.title ?? "",
      }))
      .filter((s) => s.sheetId >= 0);
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
