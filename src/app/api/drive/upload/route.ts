import { hasAdminPowers } from "@/lib/roles";
// ═══════════════════════════════════════════════════════════════
// POST /api/drive/upload
// Multipart upload for files <= 4MB.
// Accepts FormData, auto-renames via buildFileName, resolves the
// target Drive folder, uploads the file, and inserts a DB record.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { driveFiles } from "@/lib/db/schema";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";
import {
  buildFileName,
  resolveUploadFolder,
  buildAplusFileName,
  resolveAplusFolder,
} from "@/lib/drive-upload";
import type { AplusModuleType } from "@/lib/aplus-module-specs";
import { getErrorMessage } from "@/lib/api-utils";
import type { AplusDevice, AplusPlatform, AplusScopeType } from "@/lib/aplus-file-naming";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB for images
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB for videos

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



    // ── Parse FormData ────────────────────────────────────────
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const clientIdCode = (form.get("clientIdCode") as string | null)?.trim();
    const asin = (form.get("asin") as string | null)?.trim() || null;
    const folderType = (form.get("folderType") as string | null)?.trim() || "aplus";
    const entityType = (form.get("entityType") as string | null)?.trim() || null;
    const entityId = (form.get("entityId") as string | null)?.trim() || null;
    const imageSlot = (form.get("imageSlot") as string | null)?.trim() || null;
    // SOP naming metadata (optional — when present, uses A+ naming)
    const moduleType = (form.get("moduleType") as string | null)?.trim() || null;
    const modulePosition = form.get("modulePosition") ? parseInt(form.get("modulePosition") as string) : null;
    const slotKey = (form.get("slotKey") as string | null)?.trim() || null;
    const device = ((form.get("device") as string | null)?.trim() || "DV") as AplusDevice;
    const marketplace = (form.get("marketplace") as string | null)?.trim() || "US";
    // Set config values for folder resolution (from client SetConfigCtx)
    const platform = ((form.get("platform") as string | null)?.trim() || "SC") as AplusPlatform;
    const scopeType = ((form.get("scopeType") as string | null)?.trim() || "ASIN") as AplusScopeType;
    const scopeIdentifier = (form.get("scopeIdentifier") as string | null)?.trim() || asin || "unknown";
    const version = form.get("version") ? parseInt(form.get("version") as string) : 1;
    const groupNumber = form.get("groupNumber") ? parseInt(form.get("groupNumber") as string) : undefined;
    const isVideo = form.get("isVideo") === "true";

    // ── Validate ──────────────────────────────────────────────
    if (!file) {
      return NextResponse.json({ error: "Missing required field: file" }, { status: 400 });
    }
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing required field: clientIdCode" }, { status: 400 });
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      const maxMB = maxBytes / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large: ${file.size} bytes. Maximum is ${maxMB} MB. ${!isVideo ? "Use the resumable upload endpoint for larger files." : ""}` },
        { status: 413 }
      );
    }

    // ── Build display name ────────────────────────────────────
    const useAplusNaming = !!(moduleType && modulePosition && slotKey);
    const displayName = useAplusNaming
      ? buildAplusFileName({
          clientIdCode,
          version,
          scopeType,
          modulePosition: modulePosition!,
          moduleType: moduleType as AplusModuleType,
          slotKey: slotKey!,
          device,
          isVideo,
          asin: scopeType === "ASIN" ? (asin || undefined) : undefined,
          groupNumber: scopeType === "GRP" ? groupNumber : undefined,
        })
      : buildFileName({
          clientIdCode,
          asin,
          folderType,
          imageSlot,
          mimeType: file.type,
        });

    // ── Resolve target folder ─────────────────────────────────
    const folder = useAplusNaming
      ? await resolveAplusFolder({
          clientIdCode,
          marketplace,
          platform,
          scopeType,
          version,
          asin: scopeType === "ASIN" ? (asin || undefined) : undefined,
          groupNumber: scopeType === "GRP" ? groupNumber : undefined,
        })
      : await resolveUploadFolder({ clientIdCode, folderType, asin });
    if (!folder) {
      return NextResponse.json(
        { error: `No Drive folder found for client "${clientIdCode}" with folderType "${folderType}". Client may not be onboarded yet.` },
        { status: 404 }
      );
    }

    // ── Upload to Drive ───────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const driveFile = await driveClient.uploadFile(
      displayName,
      folder.driveFolderId,
      buffer,
      file.type
    );

    // ── Insert DB record ──────────────────────────────────────
    const [dbRecord] = await db
      .insert(driveFiles)
      .values({
        driveFileId: driveFile.id,
        folderId: folder.id,
        originalName: file.name,
        displayName,
        mimeType: file.type,
        sizeBytes: file.size,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined,
        uploadedBy: session.user.email!,
      })
      .returning({ id: driveFiles.id });

    return NextResponse.json({
      driveFileId: driveFile.id,
      displayName,
      dbId: dbRecord.id,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error("[drive/upload] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
