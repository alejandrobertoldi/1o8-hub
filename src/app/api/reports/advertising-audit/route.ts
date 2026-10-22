/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";
import { queryBigQuery } from "@/lib/bigquery";
import { maacAacTable } from "@/lib/bq-datasets";



function campaignTypeName(ct: string): string {
  const map: Record<string, string> = {
    "SP M PT":         "Sponsored Products - Product Targeting",
    "SP M KT":         "Sponsored Products - Keyword Targeting",
    "SB M PT":         "Sponsored Brands - Product Targeting",
    "SP A":            "Sponsored Products - Auto Targeting",
    "SB M KT":         "Sponsored Brands - Keyword Targeting",
    "SB M V":          "Sponsored Brands - Video",
    "SD PT":           "Sponsored Display - Product Targeting",
    "SD A":            "Sponsored Display - Auto Targeting",
    "SB M V PT":       "Sponsored Brands - Video - Product Targeting",
    "SP M KT,SP M PT": "Sponsored Products - Keyword/Product Targeting",
  };
  return map[ct] ?? ct;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const accountId = (await getEffectiveAccountId(req)) ?? "";
  const start     = searchParams.get("start") ?? "";
  const end       = searchParams.get("end") ?? "";
  const refresh   = searchParams.get("refresh") === "true";

  if (!accountId || !start || !end)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const cacheKey = buildDatedKey(accountId, start, end);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-advertising-audit", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const campaignTypeRows = await queryRedshift(`
    SELECT
      campaign_type,
      SUM(ad_spend)          AS ad_spend,
      SUM(ad_revenue)        AS ad_revenue,
      SUM(ad_clicks)         AS ad_clicks,
      SUM(ad_impressions)    AS ad_impressions,
      SUM(ad_conversions)    AS ad_conversions,
      SUM(ad_orders)         AS ad_orders,
      SUM(ntb_orders)        AS ntb_orders,
      SUM(ntb_ordered_units) AS ntb_units,
      SUM(ntb_revenue)       AS ntb_revenue
    FROM intentwise_ecommerce_graph.campaign_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY campaign_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const goalRows = await queryBigQuery<{ acos_goal: number }>(`
  SELECT
    SUM(ACOSGoal1D) AS acos_goal
  FROM \`${maacAacTable()}\`
  WHERE CAST(IntentwiseID AS STRING) = @accountId
`, { accountId });

const acosGoal = Number(goalRows?.[0]?.acos_goal ?? 0) * 100;

  const campaignNameRows = await queryRedshift(`
    SELECT
      campaign_name,
      campaign_type,
      SUM(ad_spend)          AS ad_spend,
      SUM(ad_revenue)        AS ad_revenue,
      SUM(ad_clicks)         AS ad_clicks,
      SUM(ad_impressions)    AS ad_impressions,
      SUM(ad_conversions)    AS ad_conversions,
      SUM(ad_orders)         AS ad_orders,
      SUM(ntb_orders)        AS ntb_orders,
      SUM(ntb_ordered_units) AS ntb_units,
      SUM(ntb_revenue)       AS ntb_revenue
    FROM intentwise_ecommerce_graph.campaign_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY campaign_name, campaign_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const dailyRows = await queryRedshift(`
    SELECT
      report_date::date::text AS day,
      SUM(ad_spend)           AS ad_spend,
      SUM(ad_revenue)         AS ad_revenue,
      SUM(ad_impressions)     AS ad_impressions,
      SUM(ad_clicks)          AS ad_clicks,
      SUM(ad_conversions)     AS ad_conversions
    FROM intentwise_ecommerce_graph.campaign_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY day
    ORDER BY day ASC
  `, [accountId, start, end]);

  const spBrandRows = await queryRedshift(`
    SELECT
      CASE WHEN is_brand_keyword THEN 'Brand' ELSE 'Non-Brand' END AS brand_type,
      SUM(ad_spend)       AS ad_spend,
      SUM(ad_revenue)     AS ad_revenue,
      SUM(ad_clicks)      AS ad_clicks,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_conversions) AS ad_conversions,
      SUM(ad_orders)      AS ad_orders
    FROM intentwise_ecommerce_graph.keyword_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      AND campaign_type LIKE 'SP%'
    GROUP BY brand_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const spMatchRows = await queryRedshift(`
    SELECT
      match_type,
      SUM(ad_spend)       AS ad_spend,
      SUM(ad_revenue)     AS ad_revenue,
      SUM(ad_clicks)      AS ad_clicks,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_conversions) AS ad_conversions,
      SUM(ad_orders)      AS ad_orders
    FROM intentwise_ecommerce_graph.keyword_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      AND campaign_type LIKE 'SP%'
    GROUP BY match_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const sbBrandRows = await queryRedshift(`
    SELECT
      CASE WHEN is_brand_keyword THEN 'Brand' ELSE 'Non-Brand' END AS brand_type,
      SUM(ad_spend)       AS ad_spend,
      SUM(ad_revenue)     AS ad_revenue,
      SUM(ad_clicks)      AS ad_clicks,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_conversions) AS ad_conversions,
      SUM(ad_orders)      AS ad_orders
    FROM intentwise_ecommerce_graph.keyword_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      AND campaign_type LIKE 'SB%'
    GROUP BY brand_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const sbMatchRows = await queryRedshift(`
    SELECT
      match_type,
      SUM(ad_spend)       AS ad_spend,
      SUM(ad_revenue)     AS ad_revenue,
      SUM(ad_clicks)      AS ad_clicks,
      SUM(ad_impressions) AS ad_impressions,
      SUM(ad_conversions) AS ad_conversions,
      SUM(ad_orders)      AS ad_orders
    FROM intentwise_ecommerce_graph.keyword_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
      AND campaign_type LIKE 'SB%'
    GROUP BY match_type
    ORDER BY ad_spend DESC
  `, [accountId, start, end]);

  const gapsByAsinRows = await queryRedshift(`
    SELECT
      product,
      product_title,
      SUM(CASE WHEN campaign_type = 'SD A'            THEN ad_spend ELSE 0 END) AS sd_a,
      SUM(CASE WHEN campaign_type = 'SD PT'           THEN ad_spend ELSE 0 END) AS sd_pt,
      SUM(CASE WHEN campaign_type = 'SP A'            THEN ad_spend ELSE 0 END) AS sp_a,
      SUM(CASE WHEN campaign_type = 'SP M KT'         THEN ad_spend ELSE 0 END) AS sp_m_kt,
      SUM(CASE WHEN campaign_type = 'SP M KT,SP M PT' THEN ad_spend ELSE 0 END) AS sp_m_kt_pt,
      SUM(CASE WHEN campaign_type = 'SP M PT'         THEN ad_spend ELSE 0 END) AS sp_m_pt
    FROM intentwise_ecommerce_graph.advertised_product_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY product, product_title
    ORDER BY sp_m_kt DESC
  `, [accountId, start, end]);

  const totalSpend   = campaignTypeRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_spend ?? 0), 0);
  const totalRevenue = campaignTypeRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_revenue ?? 0), 0);

  const fmtCampaignType = (rows: Record<string, unknown>[]) =>
    rows.map((r) => {
      const spend   = Number(r.ad_spend ?? 0);
      const revenue = Number(r.ad_revenue ?? 0);
      const clicks  = Number(r.ad_clicks ?? 0);
      const imps    = Number(r.ad_impressions ?? 0);
      const convs   = Number(r.ad_conversions ?? 0);
      return {
        campaign_type:      String(r.campaign_type ?? ""),
        campaign_type_name: campaignTypeName(String(r.campaign_type ?? "")),
        ad_spend:           spend,
        ad_spend_pct:       totalSpend !== 0 ? (spend / totalSpend) * 100 : 0,
        ad_revenue:         revenue,
        ad_revenue_pct:     totalRevenue !== 0 ? (revenue / totalRevenue) * 100 : 0,
        acos:               revenue !== 0 ? (spend / revenue) * 100 : 0,
        roas:               spend !== 0 ? revenue / spend : 0,
        clicks,
        impressions:        imps,
        ctr:                imps !== 0 ? (clicks / imps) * 100 : 0,
        conversions:        convs,
        cvr:                clicks !== 0 ? (convs / clicks) * 100 : 0,
        orders:             Number(r.ad_orders ?? 0),
        ntb_orders:         Number(r.ntb_orders ?? 0),
        ntb_units:          Number(r.ntb_units ?? 0),
        ntb_revenue:        Number(r.ntb_revenue ?? 0),
      };
    });

  const totalSpendName   = campaignNameRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_spend ?? 0), 0);
  const totalRevenueName = campaignNameRows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_revenue ?? 0), 0);

  const fmtCampaignName = (rows: Record<string, unknown>[]) =>
    rows.map((r) => {
      const spend   = Number(r.ad_spend ?? 0);
      const revenue = Number(r.ad_revenue ?? 0);
      const clicks  = Number(r.ad_clicks ?? 0);
      const imps    = Number(r.ad_impressions ?? 0);
      const convs   = Number(r.ad_conversions ?? 0);
      return {
        campaign_name:  String(r.campaign_name ?? ""),
        campaign_type:  campaignTypeName(String(r.campaign_type ?? "")),
        ad_spend:       spend,
        ad_spend_pct:   totalSpendName !== 0 ? (spend / totalSpendName) * 100 : 0,
        ad_revenue:     revenue,
        ad_revenue_pct: totalRevenueName !== 0 ? (revenue / totalRevenueName) * 100 : 0,
        acos:           revenue !== 0 ? (spend / revenue) * 100 : 0,
        roas:           spend !== 0 ? revenue / spend : 0,
        clicks,
        impressions:    imps,
        ctr:            imps !== 0 ? (clicks / imps) * 100 : 0,
        conversions:    convs,
        cvr:            clicks !== 0 ? (convs / clicks) * 100 : 0,
        orders:         Number(r.ad_orders ?? 0),
        ntb_orders:     Number(r.ntb_orders ?? 0),
        ntb_units:      Number(r.ntb_units ?? 0),
        ntb_revenue:    Number(r.ntb_revenue ?? 0),
      };
    });

  const fmtDaily = (rows: Record<string, unknown>[]) =>
    rows.map((r) => {
      const spend   = Number(r.ad_spend ?? 0);
      const revenue = Number(r.ad_revenue ?? 0);
      return {
        day:        String(r.day ?? ""),
        ad_spend:   spend,
        ad_revenue: revenue,
        acos:       revenue !== 0 ? (spend / revenue) * 100 : 0,
      };
    });

  const fmtSegmentation = (rows: Record<string, unknown>[], keyField: string) => {
    const totalS = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_spend ?? 0), 0);
    const totalR = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.ad_revenue ?? 0), 0);
    return rows.map((r) => {
      const spend   = Number(r.ad_spend ?? 0);
      const revenue = Number(r.ad_revenue ?? 0);
      const clicks  = Number(r.ad_clicks ?? 0);
      const imps    = Number(r.ad_impressions ?? 0);
      const convs   = Number(r.ad_conversions ?? 0);
      return {
        key:            String(r[keyField] ?? ""),
        ad_spend:       spend,
        ad_spend_pct:   totalS !== 0 ? (spend / totalS) * 100 : 0,
        ad_revenue:     revenue,
        ad_revenue_pct: totalR !== 0 ? (revenue / totalR) * 100 : 0,
        acos:           revenue !== 0 ? (spend / revenue) * 100 : 0,
        roas:           spend !== 0 ? revenue / spend : 0,
        clicks,
        impressions:    imps,
        ctr:            imps !== 0 ? (clicks / imps) * 100 : 0,
        conversions:    convs,
        cvr:            clicks !== 0 ? (convs / clicks) * 100 : 0,
        orders:         Number(r.ad_orders ?? 0),
      };
    });
  };

  const summaryTotals = {
    ad_spend:   totalSpend,
    ad_revenue: totalRevenue,
    acos:       totalRevenue !== 0 ? (totalSpend / totalRevenue) * 100 : 0,
  };


   const response = {
    acosGoal,
    campaignTypes:  fmtCampaignType(campaignTypeRows),
    campaignNames:  fmtCampaignName(campaignNameRows),
    daily:          fmtDaily(dailyRows),
    summaryTotals,
    spBrandType:    fmtSegmentation(spBrandRows,  "brand_type"),
    spMatchType:    fmtSegmentation(spMatchRows,  "match_type"),
    sbBrandType:    fmtSegmentation(sbBrandRows,  "brand_type"),
    sbMatchType:    fmtSegmentation(sbMatchRows,  "match_type"),
    gapsByAsin: gapsByAsinRows.map((r: Record<string, unknown>) => ({
      product:    String(r.product ?? ""),
      title:      String(r.product_title ?? ""),
      sd_a:       Number(r.sd_a ?? 0),
      sd_pt:      Number(r.sd_pt ?? 0),
      sp_a:       Number(r.sp_a ?? 0),
      sp_m_kt:    Number(r.sp_m_kt ?? 0),
      sp_m_kt_pt: Number(r.sp_m_kt_pt ?? 0),
      sp_m_pt:    Number(r.sp_m_pt ?? 0),
    })),
  };

  await setCachedReport("report-advertising-audit", cacheKey, response);
  return NextResponse.json(response);
}