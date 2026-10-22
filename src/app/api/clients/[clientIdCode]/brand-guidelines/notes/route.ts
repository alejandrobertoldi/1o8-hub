import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelineNotes } from "@/lib/db/schema";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

const postSchema = z.object({ body_md: z.string().min(1).max(20_000) });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;
  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const [note] = await db.insert(clientBrandGuidelineNotes).values({
    clientIdCode,
    bodyMd: parsed.data.body_md,
    authorEmail: session.user.email!,
  }).returning();

  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  return NextResponse.json({ note });
}
