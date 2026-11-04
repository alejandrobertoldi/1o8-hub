/* eslint-disable react-doctor/server-fetch-without-revalidate */
// ═══════════════════════════════════════════════════════════════
// GET /api/drive/file/[fileId]
// Proxies a Google Drive file through the server so the browser
// can display images that require service-account authentication.
// Returns the raw file bytes with the correct Content-Type.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getAccessToken } from "@/lib/gcp-auth";
import { canReadDriveFile, untrustedFileHeaders } from "@/lib/drive-access";

export const maxDuration = 60;

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;
  // Being signed in is not enough: a client may only read its own files.
  if (!(await canReadDriveFile(session.user, fileId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const token = await getAccessToken([DRIVE_SCOPE]);

    // Get file metadata first (for Content-Type)
    const metaRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=mimeType,name,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!metaRes.ok) {
      return NextResponse.json(
        { error: "File not found in Drive" },
        { status: metaRes.status }
      );
    }

    const meta = await metaRes.json();

    const fileSize = meta.size ? parseInt(meta.size, 10) : 0;
    const rangeHeader = _req.headers.get("range");

    // Build headers for the Drive download request
    const dlHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (rangeHeader) {
      dlHeaders["Range"] = rangeHeader;
    }

    // Download file content (passes Range header through to Drive)
    const dlRes = await fetch(
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: dlHeaders }
    );

    if (!dlRes.ok && dlRes.status !== 206) {
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: dlRes.status }
      );
    }

    // Stream the response body directly from Drive to the client
    // (avoids buffering entire file in memory — critical for video).
    // untrustedFileHeaders: uploaded HTML/SVG must never render on our origin.
    const responseHeaders: Record<string, string> = {
      ...untrustedFileHeaders(meta.mimeType, meta.name || fileId),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };

    // Forward Content-Length and Content-Range from Drive's response
    const dlContentLength = dlRes.headers.get("content-length");
    if (dlContentLength) {
      responseHeaders["Content-Length"] = dlContentLength;
    }
    const dlContentRange = dlRes.headers.get("content-range");
    if (dlContentRange) {
      responseHeaders["Content-Range"] = dlContentRange;
    }

    // For non-range requests, add the total size if known
    if (!rangeHeader && fileSize) responseHeaders["Content-Length"] = String(fileSize);

    return new NextResponse(dlRes.body, {
      status: dlRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drive/file] error:", message);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}
