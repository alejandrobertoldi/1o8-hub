import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineNotes } from "@/lib/db/schema";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

const patchSchema = z.object({ body_md: z.string().min(1).max(20_000) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; noteId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientIdCode, noteId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const [existing] = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.id, noteId),
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
    )).limit(1);
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  // Own entries only, unless admin.
  if (!hasAdminPowers(role) && existing.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.update(clientBrandGuidelineNotes).set({
    bodyMd: parsed.data.body_md,
    updatedAt: new Date(),
  }).where(eq(clientBrandGuidelineNotes.id, noteId));

  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; noteId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientIdCode, noteId } = await params;
  const [existing] = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.id, noteId),
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
    )).limit(1);
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (!hasAdminPowers(role) && existing.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.update(clientBrandGuidelineNotes).set({ deletedAt: new Date() })
    .where(eq(clientBrandGuidelineNotes.id, noteId));

  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  return NextResponse.json({ ok: true });
}
