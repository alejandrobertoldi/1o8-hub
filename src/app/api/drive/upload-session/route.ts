import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-fetch-without-revalidate */
// ═══════════════════════════════════════════════════════════════
// POST /api/drive/upload-session
// Initiates a resumable Drive upload session for files > 4 MB.
// Returns the session URI from the Drive API Location header.
// The client then PUTs the file directly to that URI.
// After the PUT completes, the client calls /api/drive/upload/record
// to persist the DB record.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { getAccessToken } from "@/lib/gcp-auth";
import {
  buildFileName,
  resolveUploadFolder,
  buildAplusFileName,
  resolveAplusFolder,
} from "@/lib/drive-upload";
import type { AplusModuleType } from "@/lib/aplus-module-specs";
import type { AplusDevice, AplusPlatform, AplusScopeType } from "@/lib/aplus-file-naming";

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
      clientIdCode?: string;
      asin?: string;
      folderType?: string;
      imageSlot?: string;
      mimeType?: string;
      entityType?: string;
      entityId?: string;
      fileName?: string;
      // SOP naming metadata
      moduleType?: string;
      modulePosition?: number;
      slotKey?: string;
      device?: string;
      marketplace?: string;
      isVideo?: boolean;
      // Set config values
      platform?: string;
      scopeType?: string;
      scopeIdentifier?: string;
      version?: number;
      clientIdCodeOverride?: string;
      groupNumber?: number;
    };

    const clientIdCode = body.clientIdCode?.trim();
    const asin = body.asin?.trim() || null;
    const folderType = body.folderType?.trim() || "aplus";
    const imageSlot = body.imageSlot?.trim() || null;
    const mimeType = body.mimeType?.trim();
    const entityType = body.entityType?.trim() || null;
    const entityId = body.entityId?.trim() || null;
    const fileName = body.fileName?.trim() || null;
    const moduleType = body.moduleType?.trim() || null;
    const modulePosition = body.modulePosition ?? null;
    const slotKey = body.slotKey?.trim() || null;
    const device = (body.device?.trim() || "DV") as AplusDevice;
    const marketplace = body.marketplace?.trim() || "US";
    // Set config values for folder resolution
    const platform = (body.platform?.trim() || "SC") as AplusPlatform;
    const scopeType = (body.scopeType?.trim() || "ASIN") as AplusScopeType;
    const version = body.version ?? 1;
    const groupNumber = body.groupNumber ?? undefined;
    const isVideo = body.isVideo ?? false;
    // Use clientIdCodeOverride from set config context if provided
    const resolvedClientIdCode = body.clientIdCodeOverride?.trim() || clientIdCode;

    // ── Validate ──────────────────────────────────────────────
    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing required field: clientIdCode" }, { status: 400 });
    }
    if (!mimeType) {
      return NextResponse.json({ error: "Missing required field: mimeType" }, { status: 400 });
    }

    // ── Build display name ────────────────────────────────────
    const useAplusNaming = !!(moduleType && modulePosition && slotKey && resolvedClientIdCode);
    const displayName = useAplusNaming
      ? buildAplusFileName({
          clientIdCode: resolvedClientIdCode!,
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
          clientIdCode: clientIdCode!,
          asin,
          folderType,
          imageSlot,
          mimeType,
        });

    // ── Resolve target folder ─────────────────────────────────
    const folder = useAplusNaming
      ? await resolveAplusFolder({
          clientIdCode: resolvedClientIdCode!,
          marketplace,
          platform,
          scopeType,
          version,
          asin: scopeType === "ASIN" ? (asin || undefined) : undefined,
          groupNumber: scopeType === "GRP" ? groupNumber : undefined,
        })
      : await resolveUploadFolder({ clientIdCode: clientIdCode!, folderType, asin });
    if (!folder) {
      return NextResponse.json(
        { error: `No Drive folder found for client "${clientIdCode}" with folderType "${folderType}". Client may not be onboarded yet.` },
        { status: 404 }
      );
    }

    // ── Get Drive access token ────────────────────────────────
    const token = await getAccessToken(["https://www.googleapis.com/auth/drive"]);

    // ── Initiate resumable session ────────────────────────────
    // Forward the browser's Origin so Google enables CORS on the returned
    // session URL — required when the browser PUTs bytes directly to Drive
    // (per-doc.google.com/drive/api/guides/manage-uploads). Without this,
    // browsers see "blocked by CORS policy" on the PUT.
    const browserOrigin = req.headers.get("origin");
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          ...(browserOrigin ? { Origin: browserOrigin } : {}),
        },
        body: JSON.stringify({
          name: displayName,
          parents: [folder.driveFolderId],
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "(could not read Drive error body)");
      console.error("[drive/upload-session] Drive error:", res.status, text);
      return NextResponse.json(
        { error: `Drive API error (${res.status}): ${text}` },
        { status: 500 }
      );
    }

    // ── Extract session URI from Location header ──────────────
    const sessionUri = res.headers.get("Location");
    if (!sessionUri) {
      return NextResponse.json(
        { error: "Drive API did not return a Location header for the resumable session" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sessionUri,
      displayName,
      folderId: folder.id,
      entityType,
      entityId,
      originalName: fileName,
      mimeType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drive/upload-session] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
