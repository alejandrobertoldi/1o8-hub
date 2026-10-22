export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";

// Authenticated proxy for Drive thumbnails. Drive files in the shared drive
// are private, so the public `drive.google.com/thumbnail?id=…` endpoint
// returns 403 for the browser. This route fetches the thumbnail server-side
// using the existing service-account token and streams it back.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ driveFileId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driveFileId } = await params;
  const sizeRaw = req.nextUrl.searchParams.get("size");
  const size = sizeRaw ? Math.min(Math.max(parseInt(sizeRaw, 10) || 400, 64), 1600) : 400;

  try {
    const { bytes, contentType } = await driveClient.getThumbnail(driveFileId, size);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Thumbnail unavailable", detail: e instanceof Error ? e.message : String(e) },
      { status: 404 }
    );
  }
}
