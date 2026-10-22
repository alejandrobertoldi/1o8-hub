/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

/**
 * GET /api/ppc/competitor?clientIdCode=X
 * Returns competitor benchmark data from Rainforest API for all active ASINs.
 * V1: pulls live from Rainforest per request. Future: cached in DB.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = new URL(req.url).searchParams.get("clientIdCode");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  const rainforestKey = process.env.RAINFOREST_API_KEY;
  if (!rainforestKey) {
    return NextResponse.json({ error: "Rainforest API not configured" }, { status: 503 });
  }

  // Get client ASINs from raw product data
  const [client] = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client?.rawData) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const raw = typeof client.rawData === "string" ? JSON.parse(client.rawData) : (client.rawData as Record<string, string>);
  const asinStr = raw?.ASINs || raw?.ASIN || "";
  const asins = asinStr.split(/[,;\s]+/).filter((a: string) => a.match(/^B0[A-Z0-9]{8}$/));

  if (asins.length === 0) {
    return NextResponse.json({ asins: [], competitors: [], message: "No valid ASINs found for client" });
  }

  // Fetch top 3 per ASIN (limit to first 5 ASINs to respect rate limits)
  const results = [];
  for (const asin of asins.slice(0, 5)) {
    try {
      const res = await fetch(
        `https://api.rainforestapi.com/request?api_key=${encodeURIComponent(rainforestKey)}&type=product&amazon_domain=amazon.com&asin=${asin}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const product = data?.product;
      if (!product) continue;

      results.push({
        asin,
        title: product.title,
        price: product.buybox_winner?.price?.value ?? null,
        rating: product.rating ?? null,
        ratingsTotal: product.ratings_total ?? null,
        competitors: (product.frequently_bought_together || []).slice(0, 3).map((c: { asin: string; title: string; price?: { value: number } }) => ({
          asin: c.asin,
          title: c.title,
          price: c.price?.value ?? null,
        })),
      });
    } catch {
      // Skip failed ASINs
    }
  }

  return NextResponse.json({ asins: asins.slice(0, 5), products: results });
}
