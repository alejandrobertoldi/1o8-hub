import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { listingImageThumbPx } from "@/lib/listing-image-slots";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const driveFileId = searchParams.get("driveFileId");
    const thumb = searchParams.get("thumb") === "1";

    if (!driveFileId) {
      return NextResponse.json({ error: "Missing driveFileId" }, { status: 400 });
    }

    // Always a Drive-generated JPEG preview — never the original PNG. Raw
    // listing files exceed Vercel's 4.5 MB function response cap
    // (FUNCTION_PAYLOAD_TOO_LARGE) which is the same error as a too-large
    // upload. Grid uses s400; lightbox uses s1600.
    const { bytes, contentType } = await driveClient.getThumbnail(
      driveFileId,
      listingImageThumbPx(thumb)
    );
    return new NextResponse(new Blob([new Uint8Array(bytes)], { type: contentType }), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": thumb
          ? "public, max-age=86400"
          : "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[listing-images/image] error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}