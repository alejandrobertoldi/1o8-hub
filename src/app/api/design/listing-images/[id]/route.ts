import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { driveFiles, listingImageSlotVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "editor" && !hasAdminPowers(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    }

    const [record] = await db
      .select()
      .from(driveFiles)
      .where(eq(driveFiles.id, fileId))
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await driveClient.deleteFile(record.driveFileId);

    // Hard-delete the version row, then the drive_files row, in one transaction.
    // The FK is onDelete:"set null", which would otherwise leave the version row
    // orphaned (null pointer) — that orphan inflates MAX(version_number) so the
    // number is never freed, and the innerJoin in the GET routes hides it, making
    // the version "vanish". Deleting the row outright frees the number for reuse.
    await db.transaction(async (tx) => {
      await tx
        .delete(listingImageSlotVersions)
        .where(eq(listingImageSlotVersions.driveFileId, fileId));
      await tx.delete(driveFiles).where(eq(driveFiles.id, fileId));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[listing-images/delete] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}