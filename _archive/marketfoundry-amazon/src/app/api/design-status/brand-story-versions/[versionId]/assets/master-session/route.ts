import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/design-status/brand-story-versions/[versionId]/assets/master-session
 *
 * Initiates a resumable Google Drive upload for a master file (Photoshop, etc.).
 * The browser uploads the file bytes directly to Drive — the file never passes
 * through Next.js, so there are no body-size limits.
 *
 * Request body (JSON): { filename: string; mimeType: string; size: number }
 *
 * Response: { uploadUri: string; targetFilename: string }
 *   - uploadUri: Drive resumable URI — client PUT's the file here
 *   - targetFilename: the name Drive will store (slug-prefixed)
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { brandStoryVersions, driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;

  let body: { filename?: unknown; mimeType?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, mimeType, size } = body;
  if (typeof filename !== "string" || !filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "size must be a positive number" }, { status: 400 });
  }
  const safeMime = typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream";

  // 1. Look up the version + its Drive folder.
  const [versionRow] = await db
    .select({
      versionId: brandStoryVersions.id,
      clientIdCode: brandStoryVersions.clientIdCode,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
    })
    .from(brandStoryVersions)
    .innerJoin(driveFolders, eq(driveFolders.id, brandStoryVersions.driveFolderId))
    .where(eq(brandStoryVersions.id, versionId))
    .limit(1);

  if (!versionRow) {
    return NextResponse.json({ error: "Version not found or has no Drive folder" }, { status: 404 });
  }

  const slug = versionRow.folderName;
  const subfolderName = `${slug}_Master_Files`;
  const targetFilename = `${slug}_master_${filename}`;

  // 2. Find or create the Master Files subfolder.
  const [existingSubfolder] = await db
    .select({ id: driveFolders.id, driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(
      and(
        eq(driveFolders.name, subfolderName),
        eq(driveFolders.parentFolderId, versionRow.folderRowId)
      )
    )
    .limit(1);

  let subfolderGid: string;

  if (existingSubfolder) {
    subfolderGid = existingSubfolder.driveFolderId;
  } else {
    let driveFolder: { id: string };
    try {
      driveFolder = await driveClient.createFolder(subfolderName, versionRow.driveFolderGid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Drive folder creation failed: ${msg}` }, { status: 502 });
    }
    await db.insert(driveFolders).values({
      clientIdCode: versionRow.clientIdCode,
      driveFolderId: driveFolder.id,
      folderType: "brand_story_master",
      path: `${slug}/${subfolderName}`,
      parentFolderId: versionRow.folderRowId,
      name: subfolderName,
    });
    subfolderGid = driveFolder.id;
  }

  // 3. Create the Drive resumable upload session.
  // Pass the browser's origin so Drive adds CORS headers to upload URI responses,
  // enabling the browser to PUT file bytes directly to Drive.
  const browserOrigin = req.headers.get("origin") ?? undefined;
  let uploadUri: string;
  try {
    uploadUri = await driveClient.createResumableSession(
      targetFilename,
      subfolderGid,
      safeMime,
      size,
      browserOrigin
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive session creation failed: ${msg}` }, { status: 502 });
  }

  return NextResponse.json({ uploadUri, targetFilename });
}
