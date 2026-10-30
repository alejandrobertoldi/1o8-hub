import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { SHOPIFY_STATE_COOKIE, normalizeShop, shopifyAuthorizeUrl, shopifyConfigured, verifyShopifyHmac } from "@/lib/kpi/shopify";

/**
 * GET ?shop= — the 1o8 Hub app's URL. Shopify opens it right after a store
 * installs the app (signed with hmac), and the client profile's "Connect"
 * button links here too; either way it starts OAuth for that store.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    const signin = new URL("/auth/signin", req.nextUrl.origin);
    signin.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signin);
  }
  if (!hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can connect Shopify stores" }, { status: 403 });
  if (!shopifyConfigured()) return NextResponse.json({ error: "SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are not set" }, { status: 503 });
  const params = req.nextUrl.searchParams;
  const shop = normalizeShop(params.get("shop"));
  if (!shop) return NextResponse.json({ error: "shop must be a *.myshopify.com domain" }, { status: 400 });
  if (params.has("hmac") && !verifyShopifyHmac(params)) return NextResponse.json({ error: "Invalid Shopify signature" }, { status: 401 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(shopifyAuthorizeUrl(shop, req.nextUrl.origin, state));
  res.cookies.set(SHOPIFY_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/integrations/shopify" });
  return res;
}
