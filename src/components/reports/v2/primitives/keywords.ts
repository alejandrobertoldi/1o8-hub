/** One aggregated keyword row from GET /api/reports/keywords.
 *  Field names + units verified against src/app/api/reports/keywords/route.ts. */
export interface KeywordRow {
  keyword: string;
  campaignType: string;
  matchType: string;      // raw from Redshift (e.g. "BROAD" | "PHRASE" | "EXACT")
  isBrand: boolean;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adConversions: number;
  adImpressions: number;
  acos: number;           // PERCENT POINTS (spend/rev*100); 0 when ad revenue is 0
  roas: number;           // ratio; 0 when ad spend is 0
  cpc: number;
  ctr: number;            // percent points (not rendered by the table)
  cvr: number;            // percent points
}

export interface KeywordsResponse {
  keywords: KeywordRow[];
}
