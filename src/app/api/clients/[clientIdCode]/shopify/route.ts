import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { deleteShopifyApp, hasOwnShopifyApp, normalizeShop, saveShopifyApp, shopifyApp, shopifyConnected } from "@/lib/kpi/shopify";

type Params = { params: Promise<{ clientIdCode: string }> };

async function clientShop(clientIdCode: string) {
  const [row] = await db.select({ raw: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  return normalizeShop(((row?.raw ?? {}) as Record<string, string>).ShopifyStore);
}

/** GET — this client's Shopify store, whether it has its own app, and whether the hub can read it. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const shop = await clientShop((await params).clientIdCode);
  if (!shop) return NextResponse.json({ configured: false, ownApp: false, shop: null, connected: false });
  const [app, ownApp, connected] = await Promise.all([shopifyApp(shop), hasOwnShopifyApp(shop), shopifyConnected(shop)]);
  return NextResponse.json({ configured: !!app, ownApp, shop, connected });
}

/** POST { clientId, clientSecret } — the store's own app (Dev Dashboard → its app → Settings). DELETE removes it. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can set Shopify apps" }, { status: 403 });
  const shop = await clientShop((await params).clientIdCode);
  if (!shop) return NextResponse.json({ error: "Set the client's brand.myshopify.com store first" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; clientSecret?: string };
  if (!body.clientId?.trim() || !body.clientSecret?.trim()) return NextResponse.json({ error: "Client ID and secret are both required" }, { status: 400 });
  await saveShopifyApp(shop, { clientId: body.clientId, clientSecret: body.clientSecret }, session.user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can set Shopify apps" }, { status: 403 });
  const shop = await clientShop((await params).clientIdCode);
  if (shop) await deleteShopifyApp(shop);
  return NextResponse.json({ ok: true });
}
