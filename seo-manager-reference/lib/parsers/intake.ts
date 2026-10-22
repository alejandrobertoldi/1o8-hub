/* eslint-disable react-doctor/js-set-map-lookups */
// ═══════════════════════════════════════════════════════════════
// INTAKE Tab Parser — S1.2-S1.6
// Parses pasted TSV from the SEO Tool INTAKE tab
// Rows 1-12: metadata, Row 13: headers, Row 14+: ASIN data
// Columns A-AM (39 columns)
// ═══════════════════════════════════════════════════════════════

import type {
  IntakeParseResult,
  IntakeMetadata,
  IntakeASIN,
  IntakeError,
  IntakeWarning,
  Competitor,
  ExistingContent,
} from "@/lib/types";

// Column headers expected at row 13 (0-indexed: row 12)
const REQUIRED_ASIN_FIELDS = [
  "ASIN",
  "SKU",
  "Amazon URL",
  "VariationID",
  "VariationProduct",
  "ParentageLevel",
  "VariationThemeName",
];

const COLUMN_MAP: Record<number, string> = {
  0: "asin",           // A
  1: "sku",            // B
  2: "amazon_url",     // C
  3: "website_url",    // D
  4: "variation_id",   // E
  5: "variation_product", // F
  6: "parentage_level",   // G
  7: "variation_theme_name", // H
  8: "flavor",         // I
  9: "style",          // J
  10: "color",         // K
  11: "size",          // L
};

export function parseIntakeTab(rawText: string): IntakeParseResult {
  const errors: IntakeError[] = [];
  const warnings: IntakeWarning[] = [];

  // Split into rows, handle both \r\n and \n
  const rows = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((row) => row.split("\t"));

  if (rows.length < 14) {
    errors.push({
      row: 0,
      column: "-",
      message: `Expected at least 14 rows (12 metadata + 1 header + 1 data). Got ${rows.length}.`,
    });
    return {
      metadata: emptyMetadata(),
      asins: [],
      errors,
      warnings,
    };
  }

  // ── Extract Metadata (Rows 2-12, 0-indexed: rows 1-11) ──

  const metadata = extractMetadata(rows, warnings);

  // ── Validate Brand Name ──
  if (!metadata.brand_name || metadata.brand_name.trim() === "") {
    errors.push({
      row: 4,
      column: "B4",
      message: "BrandName (B4) is required. Cannot proceed without it.",
    });
  }

  // ── Validate headers at row 13 (0-indexed: 12) ──
  const headerRow = rows[12] || [];
  if (headerRow.length < 13) {
    warnings.push({
      row: 13,
      column: "-",
      message: `Expected 39 columns (A-AM). Got ${headerRow.length}. Some existing content columns may be missing.`,
    });
  }

  // ── Parse ASIN data (Row 14+, 0-indexed: 13+) ──
  const asins: IntakeASIN[] = [];
  const seenAsins = new Set<string>();

  for (let i = 13; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2 || (row.length === 1 && row[0].trim() === "")) continue;

    const rowNum = i + 1; // 1-indexed for display
    const asin = (row[0] || "").trim();

    if (!asin) {
      warnings.push({ row: rowNum, column: "A", message: "Empty ASIN — skipping row." });
      continue;
    }

    // Duplicate check
    if (seenAsins.has(asin)) {
      errors.push({ row: rowNum, column: "A", message: `Duplicate ASIN: ${asin}` });
    }
    seenAsins.add(asin);

    // Validate required fields
    const sku = (row[1] || "").trim();
    const amazonUrl = (row[2] || "").trim();
    const variationId = (row[4] || "").trim();
    const variationProduct = (row[5] || "").trim();
    const parentageLevel = (row[6] || "").trim();
    const variationThemeName = (row[7] || "").trim();

    if (!sku) errors.push({ row: rowNum, column: "B", message: `Missing SKU for ${asin}` });
    if (!amazonUrl) errors.push({ row: rowNum, column: "C", message: `Missing Amazon URL for ${asin}` });
    else if (!amazonUrl.includes("amazon.")) warnings.push({ row: rowNum, column: "C", message: `URL may be malformed: ${amazonUrl.substring(0, 60)}` });

    if (!variationId) errors.push({ row: rowNum, column: "E", message: `Missing VariationID for ${asin}` });
    if (!variationProduct) errors.push({ row: rowNum, column: "F", message: `Missing VariationProduct for ${asin}` });

    if (!parentageLevel || !["Parent", "Child", "parent", "child"].includes(parentageLevel)) {
      errors.push({ row: rowNum, column: "G", message: `ParentageLevel must be "Parent" or "Child". Got: "${parentageLevel}"` });
    }

    if (!variationThemeName) {
      errors.push({ row: rowNum, column: "H", message: `Missing VariationThemeName for ${asin}` });
    }

    // Extract existing content (columns M-AM)
    const existingContent = extractExistingContent(row);

    // Apply Parent size rule (S1.4)
    let size = (row[11] || "").trim();
    const normalizedParentage = parentageLevel.charAt(0).toUpperCase() + parentageLevel.slice(1).toLowerCase();
    if (normalizedParentage === "Parent") {
      size = "Parent";
    }

    asins.push({
      row: rowNum,
      asin,
      sku,
      amazon_url: amazonUrl,
      website_url: (row[3] || "").trim(),
      variation_id: variationId,
      variation_product: variationProduct,
      parentage_level: normalizedParentage as "Parent" | "Child",
      variation_theme_name: variationThemeName,
      flavor: (row[8] || "").trim(),
      style: (row[9] || "").trim(),
      color: (row[10] || "").trim(),
      size,
      existing_content: existingContent,
    });
  }

  // ── Validate family structure ──
  const parents = asins.filter((a) => a.parentage_level === "Parent");
  const children = asins.filter((a) => a.parentage_level === "Child");

  if (parents.length === 0) {
    errors.push({ row: 0, column: "G", message: "No Parent ASIN found. Exactly one Parent required." });
  } else if (parents.length > 1) {
    errors.push({ row: 0, column: "G", message: `Multiple Parent ASINs found (${parents.map((p) => p.asin).join(", ")}). Exactly one allowed.` });
  }

  if (children.length === 0) {
    warnings.push({ row: 0, column: "G", message: "No Child ASINs found. Single-ASIN project." });
  }

  return { metadata, asins, errors, warnings };
}

// ── Metadata Extraction ─────────────────────────────────────

function extractMetadata(rows: string[][], warnings: IntakeWarning[]): IntakeMetadata {
  const cell = (r: number, c: number): string => {
    if (rows[r] && rows[r][c] !== undefined) return rows[r][c].trim();
    return "";
  };

  // The INTAKE tab uses: Column A = labels, Column B = values
  // Column C = competitor labels, Column D = competitor values
  // Row indices are 0-based: spreadsheet row 2 = index 1
  const date = cell(1, 1);           // B2 (value next to "Date" label in A2)
  const client_id_code = cell(2, 1); // B3
  const brand_name = cell(3, 1);     // B4
  const client_name = cell(4, 1);    // B5
  const client_bible_url = cell(5, 1); // B6
  const brand_url = cell(6, 1);      // B7

  // Column C has competitor labels, Column D has competitor values
  // C2=Competitor1Name label, D2=value; C3=Competitor1URL label, D3=value
  const competitors: Competitor[] = [];
  for (let i = 0; i < 5; i++) {
    const name = cell(1 + i * 2, 3);     // D2, D4, D6, D8, D10
    const url = cell(2 + i * 2, 3);      // D3, D5, D7, D9, D11
    if (name) {
      competitors.push({ name, url });
    }
  }

  return {
    date: date || null,
    client_id_code: client_id_code || null,
    brand_name: brand_name || null,
    client_name: client_name || null,
    client_bible_url: client_bible_url || null,
    brand_url: brand_url || null,
    competitors,
  };
}

// ── Existing Content Extraction (Columns M-AM) ─────────────

function extractExistingContent(row: string[]): ExistingContent {
  const c = (idx: number) => (row[idx] || "").trim();

  return {
    item_name: c(12) || null,                                    // M
    detailed_bullets: [c(13), c(14), c(15), c(16), c(17)],      // N-R
    product_description: c(18) || null,                           // S
    generic_keywords: [c(19), c(20), c(21), c(22), c(23)],      // T-X
    concise_bullets: [c(24), c(25), c(26), c(27), c(28)],       // Y-AC
    content_bullets: [c(29), c(30), c(31), c(32), c(33)],       // AD-AH
    key_features: [c(34), c(35), c(36), c(37), c(38)],          // AI-AM
  };
}

function emptyMetadata(): IntakeMetadata {
  return {
    date: null,
    client_id_code: null,
    brand_name: null,
    client_name: null,
    client_bible_url: null,
    brand_url: null,
    competitors: [],
  };
}

// ── Variation Analysis (S1.6) ───────────────────────────────

export function detectVariationAttributes(asins: IntakeASIN[]): {
  theme: string;
  attributes: string[];
  sizePresent: boolean;
} {
  const theme = asins[0]?.variation_theme_name || "Unknown";

  const attrs: string[] = [];
  const hasFlavor = asins.some((a) => a.flavor && a.parentage_level === "Child");
  const hasStyle = asins.some((a) => a.style && a.parentage_level === "Child");
  const hasColor = asins.some((a) => a.color && a.parentage_level === "Child");
  const hasSize = asins.some((a) => a.size && a.size !== "Parent" && a.parentage_level === "Child");

  if (hasFlavor) attrs.push("Flavor");
  if (hasStyle) attrs.push("Style");
  if (hasColor) attrs.push("Color");
  if (hasSize) attrs.push("Size");

  return {
    theme,
    attributes: attrs,
    sizePresent: hasSize,
  };
}
