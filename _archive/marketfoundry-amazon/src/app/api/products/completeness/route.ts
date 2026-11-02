import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, attributes } from "@/lib/db/schema";
import { selectMasterForScoring } from "@/lib/db/master-scoring";
import { eq, inArray } from "drizzle-orm";
import {
  calculateCompleteness,
  getScoreBucket,
} from "@/lib/completeness";

import type { ColumnAttribute, Product } from "@/lib/db/schema";

// In-memory cache for column attributes (5 minute TTL)
let cachedAttrs: ColumnAttribute[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedAttributes(): Promise<ColumnAttribute[]> {
  if (cachedAttrs && Date.now() - cacheTime < CACHE_TTL) {
    return cachedAttrs;
  }
  const attrs = await db.select().from(attributes);
  cachedAttrs = attrs;
  cacheTime = Date.now();
  return attrs;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const client = params.get("client");
  const productIdsParam = params.get("productIds");
  const summaryOnly = params.get("summary") === "true";

  if (!client) {
    return NextResponse.json(
      { error: "client parameter is required" },
      { status: 400 }
    );
  }

  // Fetch attributes (cached)
  const attrs = await getCachedAttributes();

  // Fetch products (change_log column excluded, one retry on a transient
  // connection reset — see selectMasterForScoring).
  let productList;
  if (productIdsParam) {
    const ids = productIdsParam.split(",").filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ scores: [], summary: null });
    }
    productList = await selectMasterForScoring(inArray(master.id, ids));
  } else {
    productList = await selectMasterForScoring(eq(master.clientIdCode, client));
  }

  // Calculate scores
  const scores = productList.map((product) => {
    // change_log is the only omitted column and completeness never reads it.
    const result = calculateCompleteness(product as unknown as Product, attrs);
    return {
      productId: product.id,
      asin: product.asin,
      sku: product.sku,
      itemName: product.itemName,
      score: result.score,
      totalRequired: result.totalRequired,
      filledRequired: result.filledRequired,
      missingRequired: result.missingRequired,
      missingConditionallyRequired: result.missingConditionallyRequired,
    };
  });

  // Build summary
  const totalProducts = scores.length;
  const averageScore =
    totalProducts > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.score, 0) / totalProducts
        )
      : 0;

  const distribution = { ready: 0, good: 0, incomplete: 0, poor: 0 };
  for (const s of scores) {
    distribution[getScoreBucket(s.score)]++;
  }

  const summary = { totalProducts, averageScore, distribution };

  if (summaryOnly) {
    return NextResponse.json({ summary });
  }

  return NextResponse.json(
    { scores, summary },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    }
  );
}
