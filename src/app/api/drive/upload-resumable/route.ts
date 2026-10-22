import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-fetch-without-revalidate */
// ═══════════════════════════════════════════════════════════════
// POST /api/drive/upload-resumable
// Server-side proxy for resumable uploads (avoids CORS).
// Accepts raw binary body with metadata in headers.
// Streams the body to Google Drive instead of buffering for
// large file support (videos, high-res images).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveFiles } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== "editor" && !hasAdminPowers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Metadata from headers
    const sessionUri = req.headers.get("x-session-uri");
    const mimeType = req.headers.get("x-mime-type") || "application/octet-stream";
    const folderId = req.headers.get("x-folder-id");
    const displayName = req.headers.get("x-display-name");
    const originalName = req.headers.get("x-original-name");
    const entityType = req.headers.get("x-entity-type");
    const entityId = req.headers.get("x-entity-id");

    if (!sessionUri) {
      return NextResponse.json({ error: "Missing x-session-uri header" }, { status: 400 });
    }

    if (!req.body) {
      return NextResponse.json({ error: "No request body" }, { status: 400 });
    }

    // Read body into buffer — needed for size tracking and Drive PUT
    const buffer = Buffer.from(await req.arrayBuffer());
    const sizeBytes = buffer.length;


    // PUT to Google Drive session URI (server-side, no CORS)
    const putRes = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(sizeBytes),
      },
      body: buffer,
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      console.error("[upload-resumable] Drive PUT failed:", putRes.status, text);
      return NextResponse.json(
        { error: `Drive upload failed (${putRes.status}): ${text.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const putData = await putRes.json();
    const driveFileId: string = putData.id;

    // Record in DB
    if (folderId && displayName) {
      await db
        .insert(driveFiles)
        .values({
          driveFileId,
          folderId,
          originalName: originalName ?? "upload",
          displayName,
          mimeType,
          sizeBytes,
          entityType: entityType ?? undefined,
          entityId: entityId ?? undefined,
          uploadedBy: session.user.email!,
        })
        .returning({ id: driveFiles.id })
        .catch((err) => {
          console.warn("[upload-resumable] DB record failed:", err);
        });
    }

    return NextResponse.json({ driveFileId, displayName, sizeBytes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-resumable] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
