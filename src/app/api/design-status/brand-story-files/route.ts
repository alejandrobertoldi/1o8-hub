import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { driveFolders, driveFiles, aac } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { eq, and } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");

  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const folderRows = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.clientIdCode, clientIdCode),
        eq(driveFolders.folderType, "bs_upload")
      )
    )
    .limit(1);

  const folder = folderRows[0] ?? null;

  const clientRows = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  const clientName = clientRows[0]?.clientName ?? clientIdCode;

  if (!folder) {
    return NextResponse.json({ files: [], driveFolderId: null, clientName });
  }

  const files = await db
    .select({
      id: driveFiles.id,
      driveFileId: driveFiles.driveFileId,
      originalName: driveFiles.originalName,
      displayName: driveFiles.displayName,
      mimeType: driveFiles.mimeType,
      sizeBytes: driveFiles.sizeBytes,
      createdAt: driveFiles.createdAt,
    })
    .from(driveFiles)
    .where(eq(driveFiles.folderId, folder.id))
    .orderBy(driveFiles.createdAt);

  const filesWithUrl = files.map((f) => ({
    ...f,
    driveFolderUrl: `https://drive.google.com/drive/folders/${folder.driveFolderId}`,
  }));

  return NextResponse.json({
    files: filesWithUrl,
    driveFolderId: folder.driveFolderId,
    clientName,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const rows = await db
    .select({ driveFileId: driveFiles.driveFileId })
    .from(driveFiles)
    .where(eq(driveFiles.id, fileId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    await driveClient.deleteFile(row.driveFileId);
  } catch {
    // File may already be deleted in Drive
  }

  await db.delete(driveFiles).where(eq(driveFiles.id, fileId));

  return NextResponse.json({ ok: true });
}
