import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { isHubStaff } from "@/lib/roles";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Sets, aplus2Versions, driveFiles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Whether a client user's own A+ assets reference this Google Drive file id
 * (drive_files.drive_file_id → aplus2_assets → aplus2_versions → aplus2_sets).
 */
async function clientOwnsDriveFile(driveFileId: string, clientIdCode: string): Promise<boolean> {
  const [row] = await db
    .select({ id: aplus2Assets.id })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(aplus2Assets.driveFileId, driveFiles.id))
    .innerJoin(aplus2Versions, eq(aplus2Assets.versionId, aplus2Versions.id))
    .innerJoin(aplus2Sets, eq(aplus2Versions.setId, aplus2Sets.id))
    .where(and(eq(driveFiles.driveFileId, driveFileId), eq(aplus2Sets.clientIdCode, clientIdCode)))
    .limit(1);
  return !!row;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId) return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });

  try {
    // Staff may fetch any file; client users only files referenced by their own A+ assets.
    if (!isHubStaff(session.user.role)) {
      const clientIdCode = (session.user as { clientIdCode?: string | null }).clientIdCode ?? null;
      if (
        session.user.role !== "client" ||
        !clientIdCode ||
        !(await clientOwnsDriveFile(driveFileId, clientIdCode))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [bytes, metadata] = await Promise.all([
      driveClient.downloadFileContent(driveFileId),
      driveClient.getFile(driveFileId),
    ]);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": metadata.mimeType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[aplus2 image proxy]", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
