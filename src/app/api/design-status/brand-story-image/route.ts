import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { canReadDriveFile, untrustedFileHeaders } from "@/lib/drive-access";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");

  if (!driveFileId) {
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  }

  if (!(await canReadDriveFile(session.user, driveFileId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const bytes = await driveClient.downloadFileContent(driveFileId);
    const metadata = await driveClient.getFile(driveFileId);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...untrustedFileHeaders(metadata.mimeType, metadata.name),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
