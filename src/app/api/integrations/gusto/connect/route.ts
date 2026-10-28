import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { GUSTO_STATE_COOKIE as STATE_COOKIE, disconnectGusto, gustoAuthorizeUrl, gustoConfigured } from "@/lib/gusto/client";


/** GET — send an admin to Gusto to authorize the hub (read access for time off). */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!gustoConfigured()) return NextResponse.json({ error: "Set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET first" }, { status: 503 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(gustoAuthorizeUrl(req.nextUrl.origin, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/integrations/gusto" });
  return res;
}

/** DELETE — forget the Gusto tokens. */
export async function DELETE() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await disconnectGusto();
  return NextResponse.json({ ok: true });
}
