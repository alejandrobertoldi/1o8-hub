import { hasAdminPowers } from "@/lib/roles";
/**
 * PUT /api/design-status/brand-story-versions/[versionId]/assets/master-upload
 *
 * Chunked proxy for large master file uploads.
 * Browser sends the file in 5 MB slices; each slice is forwarded to the
 * Drive resumable URI with the correct Content-Range header.
 * Small per-request bodies avoid compilation/buffering timeouts.
 *
 * Query params:
 *   uploadUri — Drive resumable upload URI (from master-session)
 *   start     — byte offset of this chunk (inclusive)
 *   end       — last byte of this chunk (inclusive)
 *   total     — total file size in bytes
 *
 * Response:
 *   { status: "partial" }                — chunk accepted, more needed (Drive 308)
 *   { status: "complete", driveFileId }  — upload finished (Drive 200/201)
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

export async function PUT(
  req: NextRequest,
  { params: _params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const uploadUri = searchParams.get("uploadUri");
  const start = parseInt(searchParams.get("start") ?? "0", 10);
  const end = parseInt(searchParams.get("end") ?? "0", 10);
  const total = parseInt(searchParams.get("total") ?? "0", 10);

  if (!uploadUri) {
    return NextResponse.json({ error: "uploadUri is required" }, { status: 400 });
  }
  if (isNaN(start) || isNaN(end) || isNaN(total) || total <= 0) {
    return NextResponse.json({ error: "start, end, total must be valid numbers" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") || "application/octet-stream";

  let chunk: Uint8Array;
  try {
    chunk = new Uint8Array(await req.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to read chunk: ${msg}` }, { status: 400 });
  }

  const driveRes = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
    body: chunk.buffer as ArrayBuffer,
  });

  const responseText = await driveRes.text();
  console.log(`[master-upload] Drive status=${driveRes.status} bytes=${start}-${end}/${total} chunkLen=${chunk.length} body=${responseText.slice(0, 300)}`);

  // 308 Resume Incomplete = chunk received, more needed
  if (driveRes.status === 308) {
    return NextResponse.json({ status: "partial" });
  }

  // 200/201 = upload complete, Drive returns file metadata
  if (driveRes.status === 200 || driveRes.status === 201) {
    let driveFile: { id?: string };
    try { driveFile = JSON.parse(responseText) as { id?: string }; } catch { driveFile = {}; }
    if (!driveFile.id) {
      return NextResponse.json({ error: "Drive did not return a file ID" }, { status: 502 });
    }
    return NextResponse.json({ status: "complete", driveFileId: driveFile.id });
  }

  const text = responseText;
  console.error("[master-upload] Unexpected Drive status:", driveRes.status, text);
  return NextResponse.json(
    { error: `Drive upload error (${driveRes.status}): ${text}` },
    { status: 502 }
  );
}
