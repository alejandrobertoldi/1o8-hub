/* eslint-disable react-doctor/js-flatmap-filter */
// ═══════════════════════════════════════════════════════════════
// Amazon Review CSV Parser — S3.4-S3.6
// Parses review scraper exports with variant column flexibility
// ═══════════════════════════════════════════════════════════════

export interface ParsedReview {
  review_id: string;
  profile_name: string;
  text: string;
  title: string;
  date_raw: string;
  date_iso: string;
  rating_raw: string;
  star_rating: number;
  images: string;
  helpful_votes: number;
  variant_raw: string;
  product_variation: string;
}

export interface ReviewParseResult {
  reviews: ParsedReview[];
  totalRaw: number;
  variantColumns: string[];
  starDistribution: Record<number, number>;
  errors: string[];
}

const REQUIRED_COLUMNS = ["id", "text", "date", "title", "rating"];
const OPTIONAL_COLUMNS = ["profilename", "images", "helpful"];

export function parseReviewCSV(csvText: string): ReviewParseResult {
  const errors: string[] = [];
  const rows = parseCSVRows(csvText);

  if (rows.length < 2) {
    errors.push("CSV has fewer than 2 rows.");
    return { reviews: [], totalRaw: 0, variantColumns: [], starDistribution: {}, errors };
  }

  // Map headers
  const headers = rows[0].map((h) => h.trim());
  const headersLower = headers.map((h) => h.toLowerCase());

  // Check required columns
  const missing = REQUIRED_COLUMNS.filter((c) => !headersLower.includes(c));
  if (missing.length > 0) {
    errors.push(`Missing required columns: ${missing.join(", ")}`);
    return { reviews: [], totalRaw: 0, variantColumns: [], starDistribution: {}, errors };
  }

  // Find column indices
  const idx = (name: string) => headersLower.indexOf(name.toLowerCase());
  const idIdx = idx("id");
  const profileIdx = headersLower.indexOf("profilename");
  const textIdx = idx("text");
  const dateIdx = idx("date");
  const titleIdx = idx("title");
  const ratingIdx = idx("rating");
  const imagesIdx = headersLower.indexOf("images");
  const helpfulIdx = headersLower.indexOf("helpful");

  // S3.4: Find variant columns (begins with "variant:" and ends with "name")
  const variantColumns: string[] = [];
  const variantIndices: number[] = [];
  headers.forEach((h, i) => {
    const lower = h.toLowerCase();
    if (lower.startsWith("variant:") && lower.endsWith("name")) {
      variantColumns.push(h);
      variantIndices.push(i);
    }
  });

  // Parse data rows
  const reviews: ParsedReview[] = [];
  const starDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const totalRaw = rows.length - 1;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const reviewId = (row[idIdx] || "").trim();
    const text = (row[textIdx] || "").trim();

    if (!reviewId && !text) continue; // Skip empty rows

    // Parse star rating — handles "4.0 out of 5 stars", "4", "4.0", etc.
    const ratingRaw = (row[ratingIdx] || "").trim();
    let starRating = 0;
    const ratingMatch = ratingRaw.match(/(\d+\.?\d*)/);
    if (ratingMatch) {
      starRating = Math.round(parseFloat(ratingMatch[1]));
      if (starRating >= 1 && starRating <= 5) {
        starDistribution[starRating] = (starDistribution[starRating] || 0) + 1;
      }
    }

    // Parse date — strip locale prefix, try to extract ISO date
    const dateRaw = (row[dateIdx] || "").trim();
    const dateIso = normalizeDate(dateRaw);

    // Parse helpful votes
    const helpfulRaw = helpfulIdx >= 0 ? (row[helpfulIdx] || "").trim() : "";
    const helpfulVotes = parseInt(helpfulRaw.replace(/[^0-9]/g, ""), 10) || 0;

    // S3.6: Build variant value — concatenate multiple variant columns with " | "
    let variantRaw = "";
    if (variantIndices.length > 0) {
      const parts = variantIndices
        .map((vi) => (row[vi] || "").trim())
        .filter(Boolean);
      variantRaw = parts.join(" | ");
    }

    reviews.push({
      review_id: reviewId || `row-${i}`,
      profile_name: profileIdx >= 0 ? (row[profileIdx] || "").trim() : "Anonymous",
      text,
      title: (row[titleIdx] || "").trim(),
      date_raw: dateRaw,
      date_iso: dateIso,
      rating_raw: ratingRaw,
      star_rating: starRating,
      images: imagesIdx >= 0 ? (row[imagesIdx] || "").trim() : "",
      helpful_votes: helpfulVotes,
      variant_raw: variantRaw,
      product_variation: variantRaw || "None",
    });
  }

  return { reviews, totalRaw, variantColumns, starDistribution, errors };
}

// ── Date normalization ──────────────────────────────────────

function normalizeDate(raw: string): string {
  // Handle "Reviewed in the United States on January 15, 2024"
  const usMatch = raw.match(
    /(\w+ \d{1,2},?\s*\d{4})/
  );
  if (usMatch) {
    try {
      const d = new Date(usMatch[1]);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch {}
  }

  // Handle ISO-ish dates
  const isoMatch = raw.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (isoMatch) return isoMatch[1].replace(/\//g, "-");

  // Handle DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = raw.match(/(\d{1,2})[/](\d{1,2})[/](\d{4})/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;

  return raw; // Return as-is if unparseable
}

// ── CSV Parser ──────────────────────────────────────────────

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
        i++;
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
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }

  current.push(field);
  if (current.some((c) => c.trim())) rows.push(current);

  return rows;
}
