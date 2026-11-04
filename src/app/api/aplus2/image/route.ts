import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { canReadDriveFile, untrustedFileHeaders } from "@/lib/drive-access";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId) return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });

  try {
    // Staff may fetch any file; client users only files referenced by their own A+ assets.
    if (!(await canReadDriveFile(session.user, driveFileId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [bytes, metadata] = await Promise.all([
      driveClient.downloadFileContent(driveFileId),
      driveClient.getFile(driveFileId),
    ]);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...untrustedFileHeaders(metadata.mimeType, metadata.name),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[aplus2 image proxy]", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
