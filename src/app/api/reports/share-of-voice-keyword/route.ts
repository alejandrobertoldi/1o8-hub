/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { requireAuthOrCron } from "@/lib/api-auth";
import { getCachedReport, setCachedReport, buildKeywordKey } from "@/lib/reports-cache";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthOrCron(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? "";
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const keyword = searchParams.get("keyword") ?? "";

  if (!accountId || !start || !end || !keyword) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const refresh = searchParams.get("refresh") === "true";
  const cacheKey = buildKeywordKey(accountId, start, end, keyword);

  if (!refresh) {
    const cached = await getCachedReport<unknown>("report-share-of-voice-keyword", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  const brandRows = await queryRedshift(`
    SELECT
      time_stamp::date::text AS day,

      COUNT(DISTINCT CASE
        WHEN seller_company_type = 'Your Brand'
          AND type = 'organic'
          AND page_num = 1
        THEN asin
      END) AS brand_asin_count,

      COUNT(DISTINCT CASE
        WHEN type = 'organic'
          AND page_num = 1
        THEN asin
      END) AS total_asin_count,

      MIN(CASE
        WHEN seller_company_type = 'Your Brand'
          AND type = 'organic'
          AND page_num = 1
        THEN position
      END) AS brand_best_position

    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND keyword = $4
    GROUP BY day
    ORDER BY day ASC
  `, [accountId, start, end, keyword]);

  const competitorRows = await queryRedshift(`
    SELECT
      time_stamp::date::text AS day,

      COUNT(DISTINCT CASE
        WHEN seller_company_type = 'Competitor'
          AND type = 'organic'
          AND page_num = 1
        THEN asin
      END) AS competitor_asin_count,

      COUNT(DISTINCT CASE
        WHEN type = 'organic'
          AND page_num = 1
        THEN asin
      END) AS total_asin_count,

      MIN(CASE
        WHEN seller_company_type = 'Competitor'
          AND type = 'organic'
          AND page_num = 1
        THEN position
      END) AS competitor_best_position

    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND keyword = $4
    GROUP BY day
    ORDER BY day ASC
  `, [accountId, start, end, keyword]);

  const brandSeries = brandRows.map((r: Record<string, unknown>) => {
    const brandCount = Number(r.brand_asin_count ?? 0);
    const totalCount = Number(r.total_asin_count ?? 0);

    return {
      day: String(r.day ?? ""),
      brand_asin_count: brandCount,
      brand_sov_pct: totalCount !== 0 ? (brandCount / totalCount) * 100 : 0,
      brand_best_position:
        r.brand_best_position !== null && r.brand_best_position !== undefined
          ? Number(r.brand_best_position)
          : null,
    };
  });

  const competitorSeries = competitorRows.map((r: Record<string, unknown>) => {
    const compCount = Number(r.competitor_asin_count ?? 0);
    const totalCount = Number(r.total_asin_count ?? 0);

    return {
      day: String(r.day ?? ""),
      competitor_asin_count: compCount,
      competitor_sov_pct: totalCount !== 0 ? (compCount / totalCount) * 100 : 0,
      competitor_best_position:
        r.competitor_best_position !== null && r.competitor_best_position !== undefined
          ? Number(r.competitor_best_position)
          : null,
    };
  });

  const response = { brandSeries, competitorSeries };
  await setCachedReport("report-share-of-voice-keyword", cacheKey, response);
  return NextResponse.json(response);
}