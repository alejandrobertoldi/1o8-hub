import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines } from "@/lib/db/schema";
import { summaryPatchSchema } from "@/lib/brand-guidelines/types";
import { snapshotActiveVersionAiPreview } from "@/lib/brand-guidelines/snapshot";

export async function PATCH(
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
  const json = await req.json().catch(() => null);
  const parsed = summaryPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Brand guidelines row not found — upload a brand book first" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.logo) updates.summaryLogo = { ...existing.summaryLogo, ...parsed.data.logo };
  if (parsed.data.colors) updates.summaryColors = parsed.data.colors;
  if (parsed.data.typography) updates.summaryTypography = { ...existing.summaryTypography, ...parsed.data.typography };
  if (parsed.data.voice) updates.summaryVoice = { ...existing.summaryVoice, ...parsed.data.voice };

  await db.update(clientBrandGuidelines).set(updates)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));

  try {
    await snapshotActiveVersionAiPreview(clientIdCode);
  } catch (err) {
    console.error("snapshotActiveVersionAiPreview failed", err);
  }

  return NextResponse.json({ ok: true });
}
