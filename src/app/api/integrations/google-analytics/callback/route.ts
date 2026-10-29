import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { GA_STATE_COOKIE, connectGoogleAnalytics } from "@/lib/kpi/ga4";

/** GET — Google's OAuth redirect: store the refresh token, back to Sync & Export → KPIs. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const back = new URL("/publish?tab=kpis", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get(GA_STATE_COOKIE)?.value) {
    back.searchParams.set("ga", "failed");
    return NextResponse.redirect(back);
  }
  try {
    await connectGoogleAnalytics(req.nextUrl.origin, code, session.user.id);
    back.searchParams.set("ga", "connected");
  } catch (err) {
    console.error("[ga4] connect failed:", err instanceof Error ? err.message : err);
    back.searchParams.set("ga", "failed");
  }
  const res = NextResponse.redirect(back);
  res.cookies.delete(GA_STATE_COOKIE);
  return res;
}
