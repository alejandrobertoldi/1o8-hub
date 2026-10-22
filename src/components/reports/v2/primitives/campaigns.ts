/** One aggregated campaign row from GET /api/reports/campaigns.
 *  `rows` keys on campaign_type; `rowsByName` keys on campaign_name — same shape. */
export interface CampaignRow {
  campaignType?: string;
  campaignName?: string;
  adSpend: number;
  adRevenue: number;
  acos: number;
  roas: number;
  avgCpc: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;
  /** Attributed ad orders (denominator for New-to-brand %). Absent on cached payloads. */
  orders?: number;
  ntbOrders?: number;
  /** New-to-brand order % = ntbOrders ÷ orders × 100. Absent on cached payloads. */
  ntbPct?: number;
}

export interface CampaignsResponse {
  rows: CampaignRow[];
  rowsByName: CampaignRow[];
}
