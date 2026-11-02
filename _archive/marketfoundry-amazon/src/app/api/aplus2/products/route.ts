import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, variations } from "@/lib/db/schema";
import { aplus2VariationIdSql } from "@/lib/aplus2/variation-scope.server";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  const q = (searchParams.get("q") ?? "").trim();
  const parentsOnly = searchParams.get("parentsOnly") === "1";
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });

  const filters = [eq(master.clientIdCode, clientIdCode)];
  if (parentsOnly) {
    filters.push(sql`lower(${master.parentageLevel}) = 'parent'`);
  }
  if (q) {
    filters.push(or(
      ilike(master.asin, `%${q}%`),
      ilike(master.sku, `%${q}%`),
      ilike(master.itemName, `%${q}%`),
      sql`${aplus2VariationIdSql} ILIKE ${`%${q}%`}`,
    )!);
  }
  const where = and(...filters);

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      parentAsin: master.parentAsin,
      country: master.country,
      marketplace: master.marketplace,
      status: master.status,
      parentageLevel: master.parentageLevel,
      variationId: aplus2VariationIdSql,
    })
    .from(master)
    .leftJoin(variations, eq(variations.id, master.variationRef))
    .where(where)
    // Sort order:
    //   1. Active products first (status = "Active", case-insensitive).
    //   2. Products that HAVE an Amazon VariationID come before those without
    //      (VariationID is only ~64% populated; surfacing grouped families first).
    //   3. Group by VariationID in NATURAL order: alpha prefix, then the trailing
    //      number as an integer so DRE_SC_US_2 sorts before DRE_SC_US_10.
    //   4. Within a family (and across VariationID-less products), cluster by
    //      parent ASIN — parent row first, then children by asin.
    .orderBy(
      sql`CASE WHEN lower(${master.status}) = 'active' THEN 0 ELSE 1 END ASC`,
      sql`(${aplus2VariationIdSql} IS NULL) ASC`,
      sql`regexp_replace(COALESCE(${aplus2VariationIdSql}, ''), '[0-9]+$', '') ASC NULLS LAST`,
      sql`NULLIF(substring(COALESCE(${aplus2VariationIdSql}, '') FROM '[0-9]+$'), '')::bigint ASC NULLS LAST`,
      sql`COALESCE(${master.parentAsin}, ${master.asin}) ASC NULLS LAST`,
      sql`${master.parentAsin} IS NOT NULL ASC`,
      sql`${master.asin} ASC NULLS LAST`,
    )
    .limit(50);

  return NextResponse.json(rows);
}
