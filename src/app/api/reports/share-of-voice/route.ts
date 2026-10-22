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
    const cached = await getCachedReport<unknown>("report-share-of-voice", cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  // ── Top 10 Organic by seller_company ─────────────────────────────────────
  const topOrganicRows = await queryRedshift(`
    SELECT seller_company, COUNT(asin) AS count
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND type = 'organic'
    GROUP BY seller_company
    ORDER BY count DESC
    LIMIT 10
  `, [accountId, start, end]);

  // ── Top 10 Sponsored by seller_company ───────────────────────────────────
  const topSponsoredRows = await queryRedshift(`
    SELECT seller_company, COUNT(DISTINCT asin) AS count
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND type = 'sponsored'
    GROUP BY seller_company
    ORDER BY count DESC
    LIMIT 10
  `, [accountId, start, end]);

  // ── Brand Organic SOV (Your Brand, organic) ───────────────────────────────
  const brandOrganicRows = await queryRedshift(`
    SELECT seller_company, COUNT(asin) AS count
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND type = 'organic'
      AND seller_company_type = 'Your Brand'
    GROUP BY seller_company
    ORDER BY count DESC
  `, [accountId, start, end]);

  // ── Brand Ad SOV (Your Brand, sponsored) ─────────────────────────────────
  const brandAdRows = await queryRedshift(`
    SELECT seller_company, COUNT(DISTINCT asin) AS count
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
      AND type = 'sponsored'
      AND seller_company_type = 'Your Brand'
    GROUP BY seller_company
    ORDER BY count DESC
  `, [accountId, start, end]);

  // ── Brand Keyword Summary ─────────────────────────────────────────────────
  const brandKeywordRows = await queryRedshift(`
    SELECT
      keyword,
      COUNT(asin) AS asin_count,
      MIN(CASE WHEN seller_company_type = 'Your Brand' AND type = 'organic' AND page_num = 1 THEN position END) AS best_position
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
    GROUP BY keyword
    ORDER BY asin_count DESC
  `, [accountId, start, end]);

  // ── Competitor Keyword Summary ────────────────────────────────────────────
  const competitorKeywordRows = await queryRedshift(`
    SELECT
      keyword,
      COUNT(asin) AS asin_count,
      MIN(CASE WHEN seller_company_type = 'Competitor' AND type = 'organic' AND page_num = 1 THEN position END) AS best_position
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
    GROUP BY keyword
    ORDER BY asin_count DESC
  `, [accountId, start, end]);

  // ── Keywords list for selector ────────────────────────────────────────────
  const keywordsRows = await queryRedshift(`
    SELECT DISTINCT keyword
    FROM amazon_source_data.share_of_voice
    WHERE account_id = $1
      AND time_stamp::date BETWEEN $2 AND $3
    ORDER BY keyword ASC
  `, [accountId, start, end]);

  const fmt = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      seller_company: String(r.seller_company ?? ""),
      count:          Number(r.count ?? 0),
    }));

  const fmtKeyword = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      keyword:       String(r.keyword ?? ""),
      asin_count:    Number(r.asin_count ?? 0),
      best_position: r.best_position !== null && r.best_position !== undefined ? Number(r.best_position) : null,
    }));

  const response = {
    topOrganic:        fmt(topOrganicRows),
    topSponsored:      fmt(topSponsoredRows),
    brandOrganic:      fmt(brandOrganicRows),
    brandAd:           fmt(brandAdRows),
    brandKeywords:     fmtKeyword(brandKeywordRows),
    competitorKeywords: fmtKeyword(competitorKeywordRows),
    keywords:          keywordsRows.map((r: Record<string, unknown>) => String(r.keyword ?? "")),
  };

  await setCachedReport("report-share-of-voice", cacheKey, response);
  return NextResponse.json(response);
}