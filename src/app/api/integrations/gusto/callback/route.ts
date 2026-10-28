import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { GUSTO_STATE_COOKIE as STATE_COOKIE, connectGusto } from "@/lib/gusto/client";

/** GET — Gusto's OAuth redirect: store the tokens, then back to Sync & Export → Time Off. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const back = new URL("/publish?tab=time-off", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get(STATE_COOKIE)?.value) {
    back.searchParams.set("gusto", "failed");
    return NextResponse.redirect(back);
  }
  try {
    await connectGusto(req.nextUrl.origin, code, session.user.id);
    back.searchParams.set("gusto", "connected");
  } catch (err) {
    console.error("[gusto] connect failed:", err instanceof Error ? err.message : err);
    back.searchParams.set("gusto", "failed");
  }
  const res = NextResponse.redirect(back);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
