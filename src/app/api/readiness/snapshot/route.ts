export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { captureSnapshot } from "@/lib/readiness/server";

/** POST /api/readiness/snapshot {force?} — admins save today's snapshot now. */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can save snapshots" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await captureSnapshot({ force: body?.force === true }));
}
