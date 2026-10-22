export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { orgPositions } from "@/lib/db/schema";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { listOrgSeats } from "@/lib/team/org-chart";

/** GET /api/team/org-chart — every seat (filled or open), readable by all staff. */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listOrgSeats());
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable().default(null),
});

/** POST — admins add a seat (open, or with a person) under a parent seat. */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can edit the org chart" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { title, parentId, userId } = parsed.data;

  let area: string | null = null;
  if (parentId) {
    const [parent] = await db.select({ area: orgPositions.area }).from(orgPositions).where(eq(orgPositions.id, parentId)).limit(1);
    if (!parent) return NextResponse.json({ error: "Parent seat not found" }, { status: 404 });
    area = parent.area;
  }
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${orgPositions.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(orgPositions)
    .where(parentId ? eq(orgPositions.parentId, parentId) : sql`${orgPositions.parentId} is null`);
  const [row] = await db.insert(orgPositions).values({ title, parentId, userId, area, sortOrder: next }).returning({ id: orgPositions.id });
  return NextResponse.json(row, { status: 201 });
}
