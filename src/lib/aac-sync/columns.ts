/**
 * The "AAC 1o8" tab of the "All 1o8 Clients (Final)" sheet, read by COLUMN
 * NAME (never position), so a column added or moved in the sheet — e.g.
 * "Main KPI" — is picked up without code changes. Pure; unit-tested.
 *
 * Hub raw_data keys: every column is stored under its header (whitespace
 * collapsed). The services block repeats labels used elsewhere ("Strategy",
 * "Dashboard"…), so those headers are namespaced "Service: X" ("Service: X (2)"
 * for a repeat inside the block). A few columns are also mirrored onto the
 * MarketFoundry key the hub UI edits (COLUMN_ALIASES).
 */

/** First header of the services block and how many columns it spans (AB..BE today). */
export const SERVICE_FIRST = "SEO";
export const SERVICE_COUNT = 30;

/** Sheet header → MarketFoundry key the hub reads and edits. */
export const COLUMN_ALIASES: Record<string, string> = {
  "ClientIDCode - ASANA": "ClientIDCode",
  ExecutiveStrategist_1o8: "ExecutiveStrategist_MF",
  AccountManager1_1o8: "AccountManager_MF",
  ProjectManager_1o8: "ProjectManager_MF",
  CreativeManager_1o8: "DesignManager_MF",
  SEOManager_1o8: "SEOManager_MF",
  PaidManager_1o8: "PPCManager_MF",
  Billingemail1: "BillingEmail1",
  Billingemail2: "BillingEmail2",
  Billingemail3: "BillingEmail3",
  Billingemail4: "BillingEmail4",
  Dashboard: "DashboardURL",
};

/** Columns whose header (not the alias) is the key the hub UI edits. */
const HEADER_IS_CANONICAL = new Set(["Billingemail1", "Billingemail2", "Billingemail3", "Billingemail4"]);

/** Columns the sync never writes back to the sheet (bookkeeping / identity). */
export const READ_ONLY_IN_SHEET = new Set(["MasterAACRow"]);

export const CODE_HEADER = "ClientIDCode - ASANA";
export const NAME_HEADER = "ClientName";

export type SheetColumn = {
  /** 0-based column index in the sheet. */
  index: number;
  header: string;
  /** raw_data key the hub edits for this column. */
  key: string;
  /** Every raw_data key that mirrors this column (key first). */
  keys: string[];
};

export type SheetRow = {
  /** 1-based sheet row number (what A1 notation uses). */
  rowNumber: number;
  code: string;
  name: string;
  /** Hub key → trimmed cell value, for every column (empty string when blank). */
  values: Record<string, string>;
};

export type ParsedSheet = { headerRow: number; columns: SheetColumn[]; rows: SheetRow[] };

const clean = (h: string) => h.replace(/\s+/g, " ").trim();

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Builds the column map from the header row ("ClientStatus" in column A). */
export function parseSheet(grid: string[][]): ParsedSheet {
  const headerIdx = grid.findIndex((r) => clean(r[0] ?? "") === "ClientStatus");
  if (headerIdx < 0) throw new Error('AAC sheet: header row ("ClientStatus") not found');
  const raw = grid[headerIdx].map((h) => clean(h ?? ""));
  const svcStart = raw.indexOf(SERVICE_FIRST);
  const seenService = new Map<string, number>();

  const columns: SheetColumn[] = [];
  raw.forEach((header, index) => {
    if (!header) return;
    let base = header;
    if (svcStart >= 0 && index >= svcStart && index < svcStart + SERVICE_COUNT) {
      const n = (seenService.get(header) ?? 0) + 1;
      seenService.set(header, n);
      base = n === 1 ? `Service: ${header}` : `Service: ${header} (${n})`;
    }
    const alias = COLUMN_ALIASES[header];
    const key = alias && !HEADER_IS_CANONICAL.has(header) ? alias : base;
    const keys = alias ? [key, key === alias ? base : alias] : [base];
    columns.push({ index, header: base, key, keys });
  });

  const codeCol = columns.find((c) => c.header === CODE_HEADER);
  const nameCol = columns.find((c) => c.header === NAME_HEADER);
  const rows: SheetRow[] = [];
  grid.slice(headerIdx + 1).forEach((r, i) => {
    const values: Record<string, string> = {};
    for (const c of columns) values[c.key] = (r[c.index] ?? "").trim();
    const name = nameCol ? values[nameCol.key] : "";
    if (!name) return;
    rows.push({ rowNumber: headerIdx + 2 + i, code: codeCol ? values[codeCol.key] : "", name, values });
  });
  return { headerRow: headerIdx + 1, columns, rows };
}

/** The hub's current value for a column: its canonical key, else any mirror. */
export function hubValue(raw: Record<string, unknown>, col: SheetColumn): string {
  for (const k of col.keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Finds the sheet column behind a raw_data key the hub edited (canonical key or mirror). */
export function columnForKey(columns: SheetColumn[], rawKey: string): SheetColumn | undefined {
  return columns.find((c) => c.keys.includes(rawKey));
}
