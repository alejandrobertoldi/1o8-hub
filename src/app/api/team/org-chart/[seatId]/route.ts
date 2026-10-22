export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { orgPositions } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";

type Ctx = { params: Promise<{ seatId: string }> };

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can edit the org chart" }, { status: 403 });
  return null;
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    // null = make the seat Open
    userId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.userId !== undefined, "Nothing to update");

/** PATCH — admins rename a seat or put a person in it (null → Open). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { seatId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const res = await db
    .update(orgPositions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(orgPositions.id, seatId))
    .returning({ id: orgPositions.id });
  return res.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** DELETE — admins remove a seat. Seats that report to it are removed too (FK cascade). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { seatId } = await params;
  const res = await db.delete(orgPositions).where(eq(orgPositions.id, seatId)).returning({ id: orgPositions.id });
  return res.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
