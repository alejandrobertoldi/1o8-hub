/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getCachedReport, setCachedReport, buildDatedKey } from "@/lib/reports-cache";
import { requireAuthOrCron, getEffectiveAccountId } from "@/lib/api-auth";

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
    const cached = await getCachedReport<unknown>("report-keywords-gaps", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const query = async (campaignPrefix: string) => {
    // Match type summary
    const matchTypeRows = await queryRedshift(`
      SELECT
        match_type,
        COUNT(DISTINCT keyword_text) AS keyword_count
      FROM intentwise_ecommerce_graph.keyword_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_type LIKE $4
        AND match_type IS NOT NULL
      GROUP BY match_type
      ORDER BY keyword_count DESC
    `, [accountId, start, end, `${campaignPrefix}%`]);

    // Keywords gap table
    const keywordsRows = await queryRedshift(`
      SELECT
        keyword_text,
        SUM(CASE WHEN match_type = 'broad'  THEN ad_revenue ELSE 0 END) AS broad_revenue,
        SUM(CASE WHEN match_type = 'broad'  THEN ad_spend   ELSE 0 END) AS broad_spend,
        SUM(CASE WHEN match_type = 'exact'  THEN ad_revenue ELSE 0 END) AS exact_revenue,
        SUM(CASE WHEN match_type = 'exact'  THEN ad_spend   ELSE 0 END) AS exact_spend,
        SUM(CASE WHEN match_type = 'phrase' THEN ad_revenue ELSE 0 END) AS phrase_revenue,
        SUM(CASE WHEN match_type = 'phrase' THEN ad_spend   ELSE 0 END) AS phrase_spend
      FROM intentwise_ecommerce_graph.keyword_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_type LIKE $4
      GROUP BY keyword_text
      ORDER BY exact_spend DESC
    `, [accountId, start, end, `${campaignPrefix}%`]);

    // Word cloud data — exact
    const exactRows = await queryRedshift(`
      SELECT
        keyword_text,
        SUM(ad_revenue) AS revenue
      FROM intentwise_ecommerce_graph.keyword_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_type LIKE $4
        AND match_type = 'exact'
      GROUP BY keyword_text
      ORDER BY revenue DESC
      LIMIT 50
    `, [accountId, start, end, `${campaignPrefix}%`]);

    // Word cloud data — phrase
    const phraseRows = await queryRedshift(`
      SELECT
        keyword_text,
        SUM(ad_revenue) AS revenue
      FROM intentwise_ecommerce_graph.keyword_summary
      WHERE account_id = $1
        AND report_date BETWEEN $2 AND $3
        AND campaign_type LIKE $4
        AND match_type = 'phrase'
      GROUP BY keyword_text
      ORDER BY revenue DESC
      LIMIT 50
    `, [accountId, start, end, `${campaignPrefix}%`]);

    return {
      matchType: matchTypeRows.map((r: Record<string, unknown>) => ({
        match_type:     String(r.match_type ?? ""),
        keyword_count:  Number(r.keyword_count ?? 0),
      })),
      keywords: keywordsRows.map((r: Record<string, unknown>) => ({
        keyword_text:   String(r.keyword_text ?? ""),
        broad_revenue:  Number(r.broad_revenue ?? 0),
        broad_spend:    Number(r.broad_spend ?? 0),
        exact_revenue:  Number(r.exact_revenue ?? 0),
        exact_spend:    Number(r.exact_spend ?? 0),
        phrase_revenue: Number(r.phrase_revenue ?? 0),
        phrase_spend:   Number(r.phrase_spend ?? 0),
      })),
      exactCloud:  exactRows.map((r: Record<string, unknown>) => ({
        text:  String(r.keyword_text ?? ""),
        value: Number(r.revenue ?? 0),
      })),
      phraseCloud: phraseRows.map((r: Record<string, unknown>) => ({
        text:  String(r.keyword_text ?? ""),
        value: Number(r.revenue ?? 0),
      })),
    };
  };

  const [sp, sb] = await Promise.all([query("SP"), query("SB")]);

  const response = { sp, sb };
  await setCachedReport("report-keywords-gaps", cacheKey, response);
  return NextResponse.json(response);
}