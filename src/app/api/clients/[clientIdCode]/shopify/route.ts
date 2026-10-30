import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { normalizeShop, shopifyConfigured, shopifyConnected } from "@/lib/kpi/shopify";

/** GET — this client's Shopify store and whether the hub can read it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientIdCode: string }> }) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { clientIdCode } = await params;
  const [row] = await db.select({ raw: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  const shop = normalizeShop(((row?.raw ?? {}) as Record<string, string>).ShopifyStore);
  return NextResponse.json({ configured: shopifyConfigured(), shop, connected: shop ? await shopifyConnected(shop) : false });
}
