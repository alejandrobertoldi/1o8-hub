import { hasAdminPowers } from "@/lib/roles";
// ═══════════════════════════════════════════════════════════════
// POST /api/drive/upload/record
// Inserts a drive_files DB row after a resumable upload completes.
// Called by the client after the browser PUT to the session URI
// returns 200/201 from Drive with the file ID.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveFiles } from "@/lib/db/schema";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "editor" && !hasAdminPowers(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Parse JSON body ───────────────────────────────────────
    const body = await req.json() as {
      driveFileId?: string;
      folderId?: string;
      displayName?: string;
      originalName?: string;
      mimeType?: string;
      sizeBytes?: number;
      entityType?: string;
      entityId?: string;
    };

    const {
      driveFileId,
      folderId,
      displayName,
      originalName,
      mimeType,
      sizeBytes,
      entityType,
      entityId,
    } = body;

    // ── Validate ──────────────────────────────────────────────
    if (!driveFileId) {
      return NextResponse.json({ error: "Missing required field: driveFileId" }, { status: 400 });
    }
    if (!folderId) {
      return NextResponse.json({ error: "Missing required field: folderId" }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: "Missing required field: displayName" }, { status: 400 });
    }

    // ── Insert DB record ──────────────────────────────────────
    const [dbRecord] = await db
      .insert(driveFiles)
      .values({
        driveFileId,
        folderId,
        originalName: originalName ?? displayName,
        displayName,
        mimeType: mimeType ?? "application/octet-stream",
        sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
        uploadedBy: session.user.email!,
      })
      .returning({ id: driveFiles.id });

    return NextResponse.json({ dbId: dbRecord.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drive/upload/record] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
