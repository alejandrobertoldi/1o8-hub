import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId) return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });

  try {
    const [bytes, metadata] = await Promise.all([
      driveClient.downloadFileContent(driveFileId),
      driveClient.getFile(driveFileId),
    ]);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": metadata.mimeType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[aplus2 image proxy]", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
