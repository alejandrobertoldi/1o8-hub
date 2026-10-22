// Public type surface for the monthly-report module.
// Kept intentionally small — adding a section should not require editing this file
// unless the new section introduces a genuinely new concept.

export type SectionKey =
  | "kpis"
  | "mom"
  | "highlights"
  | "products"
  | "goals"
  | "risks"
  | "appendix";

export interface MonthlyPeriod {
  /** YYYY-MM */
  period: string;
  /** YYYY-MM-DD inclusive */
  start: string;
  /** YYYY-MM-DD inclusive */
  end: string;
  /** YYYY-MM-DD inclusive, previous calendar month */
  prevStart: string;
  /** YYYY-MM-DD inclusive, previous calendar month */
  prevEnd: string;
  /** Human-readable e.g. "March 2026" */
  label: string;
}

export interface HeadlineKpis {
  sales: number;
  units: number;
  sessions: number;
  pageviews: number;
  orderItems: number;
  /** CVR as a percentage, e.g. 8.12 for 8.12% */
  cvr: number | null;
  /** Buy-box as a percentage, weighted by sessions */
  buyBox: number | null;
  /** Average order value in currency units */
  aov: number | null;
}

export interface HeadlineDeltas {
  sales: number | null;
  units: number | null;
  sessions: number | null;
  cvr: number | null;
  buyBox: number | null;
  aov: number | null;
}

export interface HeadlineResult {
  current: HeadlineKpis;
  previous: HeadlineKpis | null;
  /** Absolute change vs previous (curr − prev). Rates are percentage points. null when previous is null. */
  deltas: HeadlineDeltas;
}

export interface ProductRow {
  asin: string;
  parent: string;
  title: string;
  sku: string;
  sessions: number;
  units: number;
  sales: number;
  orderItems: number;
  cvr: number | null;
  buyBox: number | null;
  aov: number | null;
}

export interface ProductsResult {
  rows: ProductRow[];
  nTotal: number;
}

export interface B2bResult {
  totalSales: number;
  b2bSales: number;
  /** B2B share of sales as a percentage (0-100) */
  b2bShareSales: number;
  totalUnits: number;
  b2bUnits: number;
  /** B2B share of units as a percentage (0-100) */
  b2bShareUnits: number;
}

/** Discriminated union so the registry stays type-safe. */
export type AnalyzerResult =
  | { kind: "products"; data: ProductsResult }
  | { kind: "b2b"; data: B2bResult };

export interface ReportConfig {
  /** section_key -> enabled? after resolving per-client > global > default=true */
  enabled: Record<SectionKey, boolean>;
}

export interface ClientContext {
  /** Display name, e.g. "Dr. Cuddles" */
  name: string;
  /** Intentwise account_id, e.g. "1899670" */
  accountId: string;
  /** URL-safe slug for filenames, e.g. "dr-cuddles" */
  slug: string;
  /** AAC client ID code, e.g. "DRC_SC_US" */
  clientIdCode?: string;
  /** AAC AccountManager_MF — shown as Account Manager on the cover. */
  accountManager?: string | null;
}
