import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import { isHubStaff } from "@/lib/roles";
import { DRIVE_FILE_ID_RE, clampPrintWidth } from "@/lib/case-study/kit/print-image-url";

// GET /api/case-studies/print-image?driveFileId=<gid>&w=<400..2000, default 1600>
// Always a Drive-generated JPEG preview at the requested width — never the original. forceJpeg
// matters: without Google's -rj option a PNG source comes back as a PNG (1–3 MB, embedded
// losslessly by Save as PDF — measured 38.8 MB / 86.1 MB decks on 2026-09-29). The print
// page (browser "Save as PDF") points every Design image here so the exported PDF stays small.
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId || !DRIVE_FILE_ID_RE.test(driveFileId)) {
    return NextResponse.json({ error: "Missing or invalid driveFileId" }, { status: 400 });
  }
  const width = clampPrintWidth(searchParams.get("w"));

  try {
    const { bytes, contentType } = await driveClient.getThumbnail(driveFileId, width, { forceJpeg: true });
    return new NextResponse(new Blob([new Uint8Array(bytes)], { type: contentType }), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[case-studies/print-image] error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
