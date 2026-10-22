/* eslint-disable react-doctor/js-set-map-lookups */
// ═══════════════════════════════════════════════════════════════
// Helium 10 Cerebro CSV Parser — S2.3-S2.5
// Parses Cerebro keyword exports, normalizes, validates
// ═══════════════════════════════════════════════════════════════

// Known Cerebro column headers (case-insensitive matching)
const COL_MAP: Record<string, keyof CerebroRow> = {
  "keyword phrase": "keyword_phrase",
  "search volume": "search_volume",
  "keyword sales": "keyword_sales",
  "cerebro iq score": "cerebro_iq_score",
  "search volume trend": "search_volume_trend",
  "competing products": "competing_products",
  "cpr": "cpr",
  "title density": "title_density",
  "position": "position",
  "position (rank)": "position",
  "relative rank": "relative_rank",
  "competitor rank": "competitor_rank",
  "competitor rank (avg)": "competitor_rank",
  "ranking competitors": "ranking_count",
  "ranking competitors (count)": "ranking_count",
  "organic": "organic",
  "h10 ppc suggested bid": "ppc_bid",
  "sponsored": "sponsored",
  "amazon recommended": "amazon_recommended",
};

export interface CerebroRow {
  /** MCP fields unavailable from the provider; numeric zeroes here are legacy sentinels. */
  missing_metrics?: string[];
  keyword_phrase: string;
  search_volume: number;
  keyword_sales: number;
  cerebro_iq_score: number;
  search_volume_trend: number;
  competing_products: number;
  cpr: number;
  title_density: number;
  position: number;
  relative_rank: number;
  competitor_rank: number;
  ranking_count: number;
  organic: number;
  ppc_bid: number;
  sponsored: number;
  amazon_recommended: number;
}

export interface CerebroParseResult {
  keywords: CerebroRow[];
  source: string;
  totalRaw: number;
  duplicatesRemoved: number;
  invalidRemoved: number;
  errors: string[];
}

export function parseCerebroCSV(
  csvText: string,
  source: string = "Client"
): CerebroParseResult {
  const errors: string[] = [];

  // Parse CSV (handle commas inside quotes)
  const rows = parseCSVRows(csvText);

  if (rows.length < 2) {
    errors.push("CSV has fewer than 2 rows. Expected header + data.");
    return { keywords: [], source, totalRaw: 0, duplicatesRemoved: 0, invalidRemoved: 0, errors };
  }

  // Map headers to indices
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const colIndices: Record<string, number> = {};

  for (const [headerName, fieldName] of Object.entries(COL_MAP)) {
    const idx = headers.indexOf(headerName);
    if (idx !== -1) {
      colIndices[fieldName] = idx;
    }
  }

  // Check required column
  if (colIndices["keyword_phrase"] === undefined) {
    // Try alternative: just "keyword"
    const altIdx = headers.indexOf("keyword");
    if (altIdx !== -1) {
      colIndices["keyword_phrase"] = altIdx;
    } else {
      errors.push('Required column "Keyword Phrase" not found in CSV headers.');
      return { keywords: [], source, totalRaw: 0, duplicatesRemoved: 0, invalidRemoved: 0, errors };
    }
  }

  if (colIndices["search_volume"] === undefined) {
    errors.push('Required column "Search Volume" not found. Keywords will have volume=0.');
  }

  // Parse data rows
  const raw: CerebroRow[] = [];
  const totalRaw = rows.length - 1;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const phrase = (row[colIndices["keyword_phrase"]] || "").trim().toLowerCase();

    if (!phrase) continue;

    // S2.5: Remove punctuation-only variants
    if (/^[^a-z0-9]+$/.test(phrase)) continue;

    // S2.5: Reject keywords > 250 bytes
    if (new TextEncoder().encode(phrase).length > 250) continue;

    raw.push({
      keyword_phrase: phrase,
      search_volume: num(row, colIndices["search_volume"]),
      keyword_sales: num(row, colIndices["keyword_sales"]),
      cerebro_iq_score: num(row, colIndices["cerebro_iq_score"]),
      search_volume_trend: num(row, colIndices["search_volume_trend"]),
      competing_products: num(row, colIndices["competing_products"]),
      cpr: num(row, colIndices["cpr"]),
      title_density: num(row, colIndices["title_density"]),
      position: num(row, colIndices["position"]),
      relative_rank: num(row, colIndices["relative_rank"]),
      competitor_rank: num(row, colIndices["competitor_rank"]),
      ranking_count: num(row, colIndices["ranking_count"]),
      organic: num(row, colIndices["organic"]),
      ppc_bid: numFloat(row, colIndices["ppc_bid"]),
      sponsored: num(row, colIndices["sponsored"]),
      amazon_recommended: num(row, colIndices["amazon_recommended"]),
    });
  }

  // S2.11: Deduplicate (exact match)
  const seen = new Set<string>();
  const deduped: CerebroRow[] = [];
  let duplicatesRemoved = 0;

  for (const kw of raw) {
    if (seen.has(kw.keyword_phrase)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(kw.keyword_phrase);
    deduped.push(kw);
  }

  // Sort by search volume descending
  deduped.sort((a, b) => b.search_volume - a.search_volume);

  return {
    keywords: deduped,
    source,
    totalRaw,
    duplicatesRemoved,
    invalidRemoved: totalRaw - raw.length,
    errors,
  };
}

// ── CSV Parser (handles quoted fields with commas) ──────────

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim())) rows.push(current);
        current = [];
        if (ch === "\r") i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }

  // Last field/row
  current.push(field);
  if (current.some((c) => c.trim())) rows.push(current);

  return rows;
}

// ── Helpers ─────────────────────────────────────────────────

function num(row: string[], idx: number | undefined): number {
  if (idx === undefined || !row[idx]) return 0;
  const v = parseInt(row[idx].replace(/[^0-9-]/g, ""), 10);
  return isNaN(v) ? 0 : v;
}

function numFloat(row: string[], idx: number | undefined): number {
  if (idx === undefined || !row[idx]) return 0;
  const v = parseFloat(row[idx].replace(/[^0-9.-]/g, ""));
  return isNaN(v) ? 0 : v;
}
