import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { GA_STATE_COOKIE, disconnectGoogleAnalytics, gaAuthorizeUrl, gaOAuthConfigured } from "@/lib/kpi/ga4";

/** GET — send an admin to Google to connect the account that reads the clients' GA4 properties. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!gaOAuthConfigured()) return NextResponse.json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set" }, { status: 503 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(gaAuthorizeUrl(req.nextUrl.origin, state));
  res.cookies.set(GA_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/integrations/google-analytics" });
  return res;
}

/** DELETE — forget the connected Google Analytics account. */
export async function DELETE() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await disconnectGoogleAnalytics();
  return NextResponse.json({ ok: true });
}
