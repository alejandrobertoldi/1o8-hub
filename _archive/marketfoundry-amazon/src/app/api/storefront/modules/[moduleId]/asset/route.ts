import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/storefront/modules/[moduleId]/asset
 *
 * multipart/form-data:
 *   file    — the binary asset
 *   width   — optional integer (client-provided; no server-side dimension parsing)
 *   height  — optional integer
 *
 * Replaces any previously uploaded asset: uploads new file to Drive, updates the
 * module row, then best-effort trashes the old Drive file.
 *
 * DELETE /api/storefront/modules/[moduleId]/asset
 * Trashes the Drive file (best-effort) and nulls the asset columns on the module.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { storefrontModules, storefrontPages, storefrontVersions } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { resolveStorefrontPageFolder } from "@/lib/storefront/drive";
import { STOREFRONT_MODULE_SPECS, validateAsset } from "@/lib/storefront/module-specs";
import { storefrontAssetFilename } from "@/lib/storefront/drive-naming";

// ─── MIME → extension map ────────────────────────────────────────────────────
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "video/quicktime": "mov",
  "video/mpeg": "mpg",
  "video/x-msvideo": "avi",
};

function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "bin";
}

function extFromFilename(name: string): string | undefined {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : undefined;
}

// ─── Shared auth + module lookup ─────────────────────────────────────────────

async function authorize() {
  const session = await getAuthSession();
  if (!session) return null;
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") return null;
  return session;
}

async function loadModule(moduleId: string) {
  const [row] = await db
    .select({
      id: storefrontModules.id,
      position: storefrontModules.position,
      moduleType: storefrontModules.moduleType,
      driveFileId: storefrontModules.driveFileId,
      posterDriveFileId: storefrontModules.posterDriveFileId,
      pageId: storefrontModules.pageId,
      clientIdCode: storefrontPages.clientIdCode,
      slug: storefrontPages.slug,
      versionNumber: storefrontVersions.versionNumber,
    })
    .from(storefrontModules)
    .innerJoin(storefrontPages, eq(storefrontPages.id, storefrontModules.pageId))
    .innerJoin(storefrontVersions, eq(storefrontVersions.id, storefrontPages.versionId))
    .where(eq(storefrontModules.id, moduleId))
    .limit(1);
  return row ?? null;
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await authorize();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Optional client-provided dimensions (soft-warning only — no server-side reading).
  const widthRaw = formData.get("width");
  const heightRaw = formData.get("height");
  const width = widthRaw !== null && widthRaw !== "" ? Number(widthRaw) : undefined;
  const height = heightRaw !== null && heightRaw !== "" ? Number(heightRaw) : undefined;

  // Optional slot: "main" (default) or "poster".
  const slotRaw = formData.get("slot");
  const slot: "main" | "poster" = slotRaw === "poster" ? "poster" : "main";
  if (slotRaw !== null && slotRaw !== "main" && slotRaw !== "poster") {
    return NextResponse.json({ error: 'Invalid slot. Must be "main" or "poster"' }, { status: 400 });
  }

  // Load module + page context.
  const mod = await loadModule(moduleId);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  // For "poster" slot: validate against cover_image spec (≥3000×1500).
  // For "main" slot: validate against the module's own spec.
  const spec = slot === "poster"
    ? STOREFRONT_MODULE_SPECS["cover_image"]
    : STOREFRONT_MODULE_SPECS[mod.moduleType];

  const bytes = file.size;
  const mime = file.type;

  // Validate (hard reject on mime mismatch; size/dimension mismatches become warnings).
  const { ok, warnings } = validateAsset(spec, { width, height, bytes, mime });
  if (!ok) {
    return NextResponse.json(
      { error: warnings[0] ?? "Unsupported file type" },
      { status: 400 }
    );
  }

  // Derive extension: prefer MIME map (ground truth), fall back to filename extension, then "bin".
  const ext = MIME_EXT[mime.toLowerCase()] ?? extFromFilename(file.name) ?? "bin";

  const filename = storefrontAssetFilename({
    clientIdCode: mod.clientIdCode,
    slug: mod.slug,
    position: mod.position,
    moduleType: mod.moduleType,
    ext,
    slot: slot === "poster" ? "poster" : undefined,
  });

  // Resolve Drive folder: the page folder under the current storefront version.
  let folderGid: string;
  try {
    folderGid = await resolveStorefrontPageFolder({
      clientIdCode: mod.clientIdCode,
      slug: mod.slug,
      version: mod.versionNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive folder error: ${msg}` }, { status: 502 });
  }

  const oldGid = slot === "poster"
    ? (mod.posterDriveFileId ?? null)
    : (mod.driveFileId ?? null);

  // Upload new file.
  const buffer = Buffer.from(await file.arrayBuffer());
  let uploadedGid: string;
  try {
    const uploaded = await driveClient.uploadFile(filename, folderGid, buffer, mime);
    uploadedGid = uploaded.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 });
  }

  // Update module row — poster columns vs main columns depending on slot.
  try {
    if (slot === "poster") {
      await db
        .update(storefrontModules)
        .set({ posterDriveFileId: uploadedGid, posterMimeType: mime, posterFilename: filename, updatedAt: new Date() })
        .where(eq(storefrontModules.id, moduleId));
    } else {
      await db
        .update(storefrontModules)
        .set({ driveFileId: uploadedGid, assetMimeType: mime, assetFilename: filename, updatedAt: new Date() })
        .where(eq(storefrontModules.id, moduleId));
    }
  } catch (err) {
    // DB failed — best-effort clean up the orphaned Drive file.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[storefront POST asset] DB update failed:", msg);
    try { await driveClient.deleteFile(uploadedGid); }
    catch (cleanupErr) { console.error("[storefront POST asset] orphan cleanup failed:", cleanupErr); }
    return NextResponse.json({ error: `DB update failed: ${msg}` }, { status: 500 });
  }

  // Best-effort trash the old file.
  if (oldGid) {
    try { await driveClient.deleteFile(oldGid); }
    catch (cleanupErr) {
      const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      console.error(`[storefront POST asset] old ${slot} file ${oldGid} trash failed: ${m}`);
    }
  }

  return NextResponse.json({ driveFileId: uploadedGid, slot, warnings });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await authorize();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { moduleId } = await params;

  // Resolve slot from query param or JSON body (query param takes precedence).
  const url = new URL(req.url);
  const slotParam = url.searchParams.get("slot");
  let slot: "main" | "poster" = "main";
  if (slotParam === "poster") {
    slot = "poster";
  } else if (slotParam !== null && slotParam !== "main") {
    return NextResponse.json({ error: 'Invalid slot. Must be "main" or "poster"' }, { status: 400 });
  } else if (slotParam === null) {
    // Try JSON body as fallback.
    try {
      const body = await req.json().catch(() => null);
      if (body?.slot === "poster") slot = "poster";
      else if (body?.slot !== undefined && body?.slot !== "main") {
        return NextResponse.json({ error: 'Invalid slot. Must be "main" or "poster"' }, { status: 400 });
      }
    } catch {
      // no body — fine, default "main"
    }
  }

  const mod = await loadModule(moduleId);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  if (slot === "poster") {
    // Trash poster Drive file (best-effort).
    if (mod.posterDriveFileId) {
      try { await driveClient.deleteFile(mod.posterDriveFileId); }
      catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[storefront DELETE asset] Drive trash failed for poster ${mod.posterDriveFileId}: ${m}`);
      }
    }

    // Null out poster columns.
    try {
      await db
        .update(storefrontModules)
        .set({ posterDriveFileId: null, posterMimeType: null, posterFilename: null, updatedAt: new Date() })
        .where(eq(storefrontModules.id, moduleId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[storefront DELETE asset] DB update failed (poster):", msg);
      return NextResponse.json({ error: "Failed to clear poster asset" }, { status: 500 });
    }
  } else {
    // Best-effort trash main Drive file.
    if (mod.driveFileId) {
      try { await driveClient.deleteFile(mod.driveFileId); }
      catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[storefront DELETE asset] Drive trash failed for ${mod.driveFileId}: ${m}`);
      }
    }

    // Null out main asset columns.
    try {
      await db
        .update(storefrontModules)
        .set({ driveFileId: null, assetMimeType: null, assetFilename: null, updatedAt: new Date() })
        .where(eq(storefrontModules.id, moduleId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[storefront DELETE asset] DB update failed:", msg);
      return NextResponse.json({ error: "Failed to clear asset" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
