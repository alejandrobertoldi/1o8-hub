// ═══════════════════════════════════════════════════════════════
// 1o8 SEO Manager — Core Types
// Maps to AMAZON_SEO_GPT_v5_COMPLETE.md data structures
// ═══════════════════════════════════════════════════════════════

// ── Project ──────────────────────────────────────────────────

export type Phase = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
export type PhaseStatus = "locked" | "active" | "completed" | "approved";
export type ProjectStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "live"
  | "deprecated"
  | "archived";

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  status: ProjectStatus;
  current_phase: Phase;

  // S1 Metadata (from INTAKE rows 2-12)
  date: string | null;
  client_id_code: string | null;
  brand_name: string; // Required — from A4
  client_name: string | null;
  client_bible_url: string | null;
  brand_url: string | null;

  // Competitor context (from C2:C11)
  competitors: Competitor[];

  // Variation
  variation_theme: string | null;
  size_present: boolean;

  // Brand Guidelines Lock (S1.13)
  brand_guidelines_lock: BrandGuidelinesLock | null;

  // Phase approval timestamps
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
}

export interface Competitor {
  name: string;
  url: string;
}

export interface BrandGuidelinesLock {
  status: "locked" | "not_applicable";
  brand_voice: string | null;
  language_preferences: string | null;
  words_to_avoid: string[];
  audience_notes: string | null;
  positioning: string | null;
  raw_text: string | null;
}

// ── ASIN (S1.3 — Columns A-AM) ─────────────────────────────

export interface ASIN {
  id: string;
  project_id: string;

  // Columns A-L (structural)
  asin: string;
  sku: string;
  amazon_url: string;
  website_url: string | null;
  variation_id: string;
  variation_product: string;
  parentage_level: "Parent" | "Child";
  variation_theme_name: string;
  flavor: string | null;
  style: string | null;
  color: string | null;
  size: string | null;

  // Columns M-AM (existing content for baseline)
  existing_content: ExistingContent;

  // Baseline analysis (computed)
  baseline_analysis: BaselineAnalysis | null;

  // Generated content (from S7)
  generated_content: GeneratedContent | null;
}

export interface ExistingContent {
  item_name: string | null;                    // M
  detailed_bullets: string[];                   // N-R (5)
  product_description: string | null;           // S
  generic_keywords: string[];                   // T-X (5)
  concise_bullets: string[];                    // Y-AC (5)
  content_bullets: string[];                    // AD-AH (5) — PA/LI
  key_features: string[];                       // AI-AM (5)
}

export interface BaselineAnalysis {
  quality_score: number; // 1-5
  keyword_integration: string;
  compliance_flags: string[];
  top_improvements: string[];
}

export interface GeneratedContent {
  title: string;
  detailed_bullets: string[];    // 5
  concise_bullets: string[];     // 5
  content_bullets: string[];     // 5
  key_features: string[];        // 5
  description: string;
  search_terms_core: string;
  search_terms_supplement: string;
  search_terms_symptom: string;
  search_terms_audience: string;
  search_terms_longtail: string;
}

// ── Keywords (S2 — Keywords output) ─────────────────────────────────

export type KeywordTier = "T1" | "T2" | "T3" | "T4";
export type BuyerStage = "Awareness" | "Consideration" | "Decision";

export interface Keyword {
  id: string;
  project_id: string;
  text: string;
  search_volume: number;
  priority_tier: KeywordTier;
  search_intent: string;
  primary_use_location: string;
  match_type: string;
  cosmo_relationship: string;
  buyer_stage: BuyerStage;
  notes: string;
  keyword_source: string; // "Client" | "Competitor: [Name]"
}

// ── Reviews (S3 — Reviews analysis) ──────────────────────────────────

export interface Review {
  id: string;
  project_id: string;
  review_id: string;
  date: string;
  reviewer_name: string;
  asin: string;
  product_variation: string;
  star_rating: number;
  title: string;
  text: string;
  sentiment: string;
  key_themes: string;
  usage_mentioned: string;
  packaging_feedback: string;
  price_feedback: string;
  heat_level_feedback: string;
  rufus_usable_insight: string;
  bullet_mapping: string;
  helpful_votes: number;
}

// ── Alexa for Shopping (S4 — Q&A insights) ───────────────────────────────────

export interface RufusData {
  id: string;
  project_id: string;

  // Phase 1: Fixed 5 questions + user answers
  phase1_questions: string[];
  phase1_answers: string[];

  // Phase 2: AI-generated strategic questions + user answers
  phase2_questions: string[];
  phase2_answers: string[];

  // Phase 3: Clarification questions + user answers
  phase3_questions: string[];
  phase3_answers: string[];

  // Final optimization summary (AI-generated)
  optimization_summary: RufusOptimizationSummary | null;
}

export interface RufusOptimizationSummary {
  seo_strategy: string;
  listing_plan: string;
  image_strategy: string;
  audience_segmentation: string;
  action_list: string[];
}

// ── COSMO (S5 — COSMO map) ───────────────────────────────────

export type COSMOCategory =
  // Functional/Usage
  | "USED_FOR_FUNC"
  | "USED_TO"
  | "CAPABLE_OF"
  // Event/Context
  | "USED_FOR_EVE"
  | "USED_ON"
  | "USED_IN_LOC"
  // Product/Concept
  | "USED_AS"
  | "IS_A"
  | "xIS_A"
  // Body/Interaction
  | "USED_IN_BODY"
  // Complementary
  | "USED_WITH"
  // Audience/User
  | "USED_FOR_AUD"
  | "USED_BY"
  // Interest/Motivation
  | "xINTERESTED_IN"
  | "xWANT";

export interface COSMOTriple {
  entity1: string;
  relationship: COSMOCategory;
  entity2: string;
  confidence: number; // 0-1
  supporting_keyword_tier: KeywordTier | null;
}

export interface COSMOMap {
  id: string;
  project_id: string;
  triples: COSMOTriple[];
  keyword_coverage: Record<KeywordTier, number>; // % per tier
  competitive_positioning: string | null;
}

// ── Compliance (S6) ─────────────────────────────────────────

export interface ComplianceIssue {
  id: string;
  asin: string;
  field: string;       // "title" | "detailed_1" | "description" | etc.
  type: "restricted_word" | "structural" | "character_limit";
  severity: "error" | "warning";
  message: string;
  word?: string;
  position?: number;
  bypassed: boolean;
}

export interface ComplianceReport {
  id: string;
  project_id: string;
  issues: ComplianceIssue[];
  status: "clean" | "has_issues" | "bypassed";
  generated_at: string;
}

// ── Export ───────────────────────────────────────────────────

export interface ExportRecord {
  id: string;
  project_id: string;
  type: "google_doc" | "csv" | "tsv";
  url: string | null;
  created_at: string;
}

// ── INTAKE Parser Types ─────────────────────────────────────

export interface IntakeParseResult {
  metadata: IntakeMetadata;
  asins: IntakeASIN[];
  errors: IntakeError[];
  warnings: IntakeWarning[];
}

export interface IntakeMetadata {
  date: string | null;
  client_id_code: string | null;
  brand_name: string | null; // Required — must prompt if missing
  client_name: string | null;
  client_bible_url: string | null;
  brand_url: string | null;
  competitors: Competitor[];
}

export interface IntakeASIN {
  row: number; // Original row number for error reporting
  asin: string;
  sku: string;
  amazon_url: string;
  website_url: string;
  variation_id: string;
  variation_product: string;
  parentage_level: string;
  variation_theme_name: string;
  flavor: string;
  style: string;
  color: string;
  size: string;
  existing_content: ExistingContent;
}

export interface IntakeError {
  row: number;
  column: string;
  message: string;
}

export interface IntakeWarning {
  row: number;
  column: string;
  message: string;
}

// ── Cerebro Parser Types ────────────────────────────────────

export interface CerebroRow {
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
  amazon_recommended: boolean;
}

export interface CerebroParseResult {
  keywords: CerebroRow[];
  source: string; // "Client" or competitor name
  totalRaw: number;
  duplicatesRemoved: number;
  invalidRemoved: number;
  errors: string[];
}
