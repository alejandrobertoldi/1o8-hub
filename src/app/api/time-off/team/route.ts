import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { teamTimeOff } from "@/lib/time-off/team";

export const dynamic = "force-dynamic";

/** GET /api/time-off/team — who's out in the next two weeks + balances (admins). */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await teamTimeOff(new Date().toISOString().slice(0, 10)));
}

/** PUT /api/time-off/team { userId, timeOffVia: "hub" | "gusto" } — where a person books time off. */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { userId?: unknown; timeOffVia?: unknown } | null;
  if (typeof body?.userId !== "string" || (body.timeOffVia !== "hub" && body.timeOffVia !== "gusto")) {
    return NextResponse.json({ error: "userId and timeOffVia ('hub' or 'gusto') are required" }, { status: 400 });
  }
  const [row] = await db.update(users).set({ timeOffVia: body.timeOffVia }).where(eq(users.id, body.userId)).returning({ id: users.id });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
