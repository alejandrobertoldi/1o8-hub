// ============================================================================
// 1o8 Hub Monthly Report — DATA CONTRACT
// ============================================================================
// This is the single source of truth for what a report contains.
// Every field in every section component comes from here. No hardcoded copy
// in the .tsx files. If you need to add content, add it here first.
// ============================================================================

export type SectionId =
  | 'cover'
  | 'toc'
  | 'execSummary'
  | 'kpis'
  | 'campaigns'
  | 'mom'
  | 'highlights'
  | 'risks'
  | 'channels'
  | 'products'
  | 'financials'
  | 'team'
  | 'goals'
  | 'appendix';

export const ALL_SECTIONS: SectionId[] = [
  'cover', 'toc', 'execSummary', 'kpis', 'campaigns', 'mom',
  'highlights', 'risks', 'channels', 'products', 'financials',
  'team', 'goals', 'appendix',
];

export type SectionCommentRole = 'pm' | 'am' | 'ceo' | 'admin';

export interface SectionComment {
  text: string;
  authorName: string;
  role: SectionCommentRole;
  updatedAt: string;
}

// ---------- Report root ------------------------------------------------------

export interface Report {
  meta: ReportMeta;
  /** Ordered list of sections to render. Omit any id to skip that section. */
  sections: SectionId[];
  /** Client-facing notes keyed by section. Written by PM / AM / CEO. */
  sectionComments?: Partial<Record<SectionId, SectionComment>>;

  execSummary?: ExecSummaryData;
  kpis?: KPI[];
  compareSales?: CompareSalesData;
  campaigns?: CampaignManagerData;
  mom?: MoMData;
  highlights?: Highlight[];
  risks?: Risk[];
  channels?: Channel[];
  products?: ProductRow[];
  financials?: FinancialsData;
  team?: TeamMember[];
  goals?: Goal[];
  appendix?: AppendixData;
}

// ---------- Meta -------------------------------------------------------------

export interface ReportMeta {
  /** Client / brand name the report is for. */
  client: string;
  /** Human label, e.g. "March 2026". */
  month: string;
  /** e.g. "01 Mar – 31 Mar". */
  period: string;
  /** Account owner name — shown as Account Manager on the cover. */
  lead: string;
  /** Date issued, display-formatted, e.g. "Apr 02, 2026". */
  issued: string;
  /** Short ID shown on the cover. e.g. "2026|03|1899670". */
  reportId: string;
  /** Hex accent color — defaults to 1o8 burnt orange (#F7BF1D). */
  accent?: string;
  /** Optional tagline under the cover title. */
  tagline?: string;
  /** Optional hero headline. Defaults to a generic one if omitted. */
  headline?: string;
  /** Dense layout toggle. */
  dense?: boolean;
  /** AAC client ID code — used to resolve `/client-logos/{code}.png`. */
  clientIdCode?: string;
  /** Explicit client logo URL. Falls back to the public client-logos path. */
  clientLogoUrl?: string | null;
}

// ---------- Executive Summary ------------------------------------------------

export interface ExecSummaryData {
  lede: string;
  headlineStats: HeadlineStat[];   // exactly 4 recommended (strip layout)
  movers: Mover[];                 // 3–5 items
  quote?: { text: string; author: string };
  headlineDeltas?: BarItem[];      // for the "Headline deltas" bars on the right
}

export interface HeadlineStat {
  label: string;     // "Total Revenue"
  value: string;     // "$1.42M"
  foot: string;      // "+18.4% MoM · +32.1% YoY"
}

export interface Mover {
  title: string;
  body: string;
  meta: string;      // "Owner · Paid Media · Impact +$186K"
}

export interface BarItem {
  label: string;
  /** Percent width 0–100 */
  width: number;
  valueLabel: string;  // "+18.4%"
  accent?: boolean;    // highlight in brand accent
}

// ---------- KPIs -------------------------------------------------------------

export type Direction = 'up' | 'down' | 'flat';

export interface KPI {
  label: string;
  value: string;        // already formatted for display, e.g. "$1.42M" or "4.6×"
  delta: string;        // unsigned absolute, e.g. "$24K" or "0.20%"
  direction: Direction; // business-favourable direction
  foot: string;         // context line: "Goal: 1,200"
  highlight?: boolean;  // first 4 typically true → get the accent tick
  /** Prior calendar month, same formatting as `value`. */
  prev?: string;
}

// ---------- Compare Sales (current period vs same-period prior year) --------

export interface CompareSalesData {
  /** Human label for the current period, e.g. "Mar 2026". */
  currentLabel: string;
  /** Human label for the prior-year same period, e.g. "Mar 2025". */
  previousLabel: string;
  /** Daily sales ($) for the current period; label is day-of-month, e.g. "1". */
  sales: SeriesPoint[];
  /** Daily sales ($) for the prior-year same period, aligned by day-of-month. */
  salesPrev: SeriesPoint[];
  /** Daily units (#) for the current period; label is day-of-month. */
  units: SeriesPoint[];
  /** Daily units (#) for the prior-year same period, aligned by day-of-month. */
  unitsPrev: SeriesPoint[];
  /** Amazon-style 5-column comparison table (current vs YoY + absolute delta). */
  table: CompareSalesTable;
}

export interface CompareSalesTable {
  /** Column headers, in display order. */
  columns: string[];
  /** Pre-formatted values for the current period, one per column. */
  current: string[];
  /** Pre-formatted values for the prior-year same period, one per column. */
  previous: string[];
  /** Pre-formatted absolute delta row, one entry per column.
   *  direction is the colour cue: 'up' = green, 'down' = red, 'flat' = grey. */
  changes: { value: string; direction: Direction }[];
}

// ---------- Campaign Manager (Amazon Ads performance) -----------------------

export interface CampaignManagerData {
  /** Human label for the period, e.g. "Mar 1 - Mar 31, 2026". */
  dateRange: string;
  /** Pre-formatted top-row stats (Total Sales, Ad Spend, Ad Revenue, ACoS). */
  stats: CampaignStat[];
  /** Daily series, day-of-month aligned over the full current month. */
  series: {
    /** Total ordered product sales ($) per day. */
    totalSales: SeriesPoint[];
    adSpend: SeriesPoint[];
    adRevenue: SeriesPoint[];
    /** ACoS as percent (0–100+); 0 when ad_revenue is 0. */
    acos: SeriesPoint[];
  };
}

export interface CampaignStat {
  /** Display label, e.g. "Impressions". */
  label: string;
  /** Pre-formatted value, e.g. "251,492" or "$5,914.62". */
  value: string;
  /** Prior calendar month, same formatting as `value`. */
  prev?: string;
  /** Month-over-month absolute delta, unsigned (e.g. "$50.30" or "1.65%"). */
  delta?: string;
  direction?: Direction;
}

// ---------- Month-over-month -------------------------------------------------

export interface MoMData {
  revenueSeries: SeriesPoint[];           // 6–12 points
  revenueTargetSeries?: SeriesPoint[];    // same length as revenueSeries; omit to hide target line
  cacSeries?: SeriesPoint[];             // omit to hide CAC chart
  highlightLastCac?: boolean;
  narrative: string;
  table: MoMTableRow[];
}

export interface SeriesPoint {
  label: string;   // "MAR"
  value: number;
}

export interface MoMTableRow {
  metric: string;
  prev: string;
  curr: string;
  delta: string;
  deltaDirection: Direction;
}

// ---------- Highlights -------------------------------------------------------

export interface Highlight {
  title: string;
  body: string;
  meta: string;
}

// ---------- Risks ------------------------------------------------------------

export type Severity = 'high' | 'med' | 'low';

export interface Risk {
  item: string;
  owner: string;
  severity: Severity;
  impact: string;    // "−$61K"
  status: string;    // "Mitigating"
  /** Optional explicit color grade for the scorecard pill.
   *  Falls back to severity mapping (high→red, med→amber, low→green). */
  grade?: 'red' | 'amber' | 'green';
}

// ---------- Channels ---------------------------------------------------------

export interface Channel {
  name: string;
  spend: number;        // dollars
  revenue: number;      // dollars
  roas: number;
  cac: number;
  leads: number;
  trend6mo: number[];   // 6 values for sparkline
}

// ---------- Products ---------------------------------------------------------

export interface ProductRow {
  asin: string;
  title: string;
  sku: string;
  sessions: number;
  units: number;
  sales: number;
  cvr: number | null;
  buyBox: number | null;
}

// ---------- Financials -------------------------------------------------------

export interface FinancialsData {
  headlineKPIs: KPI[];       // shown as 4 large cards above the table
  lines: BudgetLine[];
}

export interface BudgetLine {
  category: string;
  planK: number;       // in $K
  actualK: number;
  note: string;
}

// ---------- Team -------------------------------------------------------------

export interface TeamMember {
  initials: string;
  name: string;
  role: string;
  hours: number;
  capacity: number;
}

// ---------- Goals ------------------------------------------------------------

export interface Goal {
  title: string;
  body: string;
  owner: string;
  success: string;
}

// ---------- Appendix ---------------------------------------------------------

export interface AppendixData {
  methodology: string;
  sources: [string, string][];    // [description, source]
  glossary: [string, string][];   // [term, definition]
  changelog: string[];
  contactLine: string;            // "Alex Moreno · account@marketfoundry.agency"
}
