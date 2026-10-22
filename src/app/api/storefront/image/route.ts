import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { STOREFRONT_IMAGE_PREVIEW_PX } from "@/lib/storefront/asset-mime";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId) return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });

  const kind = searchParams.get("kind");

  try {
    // Videos still stream from Drive (the editor <video> tag needs the file).
    // Images use a Drive JPEG thumbnail so a 5.7 MB original never hits
    // Vercel's ~4.5 MB function response cap.
    if (kind === "video") {
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
    }

    const { bytes, contentType } = await driveClient.getThumbnail(
      driveFileId,
      STOREFRONT_IMAGE_PREVIEW_PX
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[storefront image proxy]", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
