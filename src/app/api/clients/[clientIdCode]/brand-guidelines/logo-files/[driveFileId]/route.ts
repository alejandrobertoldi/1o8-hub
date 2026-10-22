import { hasAdminPowers } from "@/lib/roles";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientBrandGuidelines, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string; driveFileId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "editor" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode, driveFileId } = await params;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  if (!bg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [file] = await db.select().from(driveFiles)
    .where(and(
      eq(driveFiles.driveFileId, driveFileId),
      eq(driveFiles.entityType, "brand_logo"),
      eq(driveFiles.entityId, bg.id),
    )).limit(1);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await driveClient.deleteFile(driveFileId);
  await db.delete(driveFiles).where(eq(driveFiles.id, file.id));

  const url = `https://drive.google.com/file/d/${driveFileId}/view`;
  const logo = bg.summaryLogo ?? null;
  if (logo) {
    const next = { ...logo };
    if (next.primary_url === url) next.primary_url = null;
    if (next.secondary_url === url) next.secondary_url = null;
    if (next.monochrome_url === url) next.monochrome_url = null;
    await db.update(clientBrandGuidelines).set({ summaryLogo: next, updatedAt: new Date() })
      .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
  }
  return NextResponse.json({ ok: true });
}
