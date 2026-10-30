import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { SHOPIFY_STATE_COOKIE, connectShopify, normalizeShop, verifyShopifyHmac } from "@/lib/kpi/shopify";

/** GET — Shopify's OAuth redirect: verify, store the store's token, back to the client's profile. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = req.nextUrl.searchParams;
  const shop = normalizeShop(params.get("shop"));
  const code = params.get("code");
  const state = params.get("state");
  const fail = (why: string) => {
    console.error("[shopify] connect failed:", why);
    const back = new URL("/publish?tab=kpis", req.nextUrl.origin);
    back.searchParams.set("shopify", "failed");
    return NextResponse.redirect(back);
  };
  if (!shop || !code || !state || state !== req.cookies.get(SHOPIFY_STATE_COOKIE)?.value) return fail("missing shop/code or state mismatch");
  if (!verifyShopifyHmac(params)) return fail("bad hmac");
  try {
    await connectShopify(shop, code, session.user.id);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  // Back to the client whose profile names this store, else the KPIs tab.
  const clients = await db.select({ code: aac.clientIdCode, raw: aac.rawData }).from(aac);
  const owner = clients.find((c) => normalizeShop(((c.raw ?? {}) as Record<string, string>).ShopifyStore) === shop);
  const back = new URL(owner ? `/clients/${owner.code}` : "/publish?tab=kpis", req.nextUrl.origin);
  back.searchParams.set("shopify", "connected");
  const res = NextResponse.redirect(back);
  res.cookies.delete(SHOPIFY_STATE_COOKIE);
  return res;
}
