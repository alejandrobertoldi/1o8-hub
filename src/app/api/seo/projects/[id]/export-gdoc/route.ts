/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
// ═══════════════════════════════════════════════════════════════
// POST /api/seo/projects/[id]/export-gdoc
// Builds the SEO Content .docx and uploads to Google Drive
// Uses shared gcp-auth + drive-client (same creds as rest of app)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoExports, seoKeywords } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildDocxBuffer, type DocxRow } from "@/lib/seo-docx-builder";
import { driveClient } from "@/lib/drive-client";
import { resolveSeoExportLocation } from "@/lib/seo/drive-export-location";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

// ── Route handler ────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

    if (!rootFolderId) {
      return NextResponse.json(
        { error: "Google Drive not configured. Add GOOGLE_DRIVE_FOLDER_ID to env.", setup: true },
        { status: 400 }
      );
    }

    const { id } = await params;

    // ── Load data from Hub DB ──────────────────────────────
    const [project] = await db.select({ brandName: seoProjects.brandName, name: seoProjects.name })
      .from(seoProjects).where(eq(seoProjects.id, id)).limit(1);

    const asins = await db.select({
      asin: seoAsins.asin, parentageLevel: seoAsins.parentageLevel,
      variationProduct: seoAsins.variationProduct, flavor: seoAsins.flavor,
      style: seoAsins.style, color: seoAsins.color, size: seoAsins.size,
      generatedContent: seoAsins.generatedContent,
    }).from(seoAsins).where(eq(seoAsins.projectId, id));

    const keywordRows = await db.select({ text: seoKeywords.text })
      .from(seoKeywords).where(eq(seoKeywords.projectId, id));
    const keywords = keywordRows.map((k) => k.text).filter(Boolean);

    if (!asins.length) {
      return NextResponse.json({ error: "No ASIN data found for this project." }, { status: 400 });
    }

    const hasContent = asins.some(a => {
      const gc = (a.generatedContent as any) || {};
      return !!gc.Title;
    });
    if (!hasContent) {
      return NextResponse.json({ error: "No SEO content generated yet. Complete S6 first." }, { status: 400 });
    }

    const brand       = project?.brandName || "Unknown Brand";
    const projectName = project?.name || "Untitled Project";
    const today       = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const dateSlug    = new Date().toISOString().slice(0, 10);

    // ── Map to DocxRow format ─────────────────────────────────
    const rows: DocxRow[] = asins
      .sort((a, b) => {
        const aP = (a.parentageLevel || "").toLowerCase() === "parent";
        const bP = (b.parentageLevel || "").toLowerCase() === "parent";
        if (aP && !bP) return -1; if (!aP && bP) return 1;
        return a.asin.localeCompare(b.asin);
      })
      .map(a => {
        const gc = (a.generatedContent as any) || {};
        return {
          asin:     a.asin || "",
          parentage: a.parentageLevel || "",
          product:  a.variationProduct || "",
          flavor:   a.flavor || "", style: a.style || "",
          color:    a.color || "", size: a.size || "",
          title:    gc.Title || "",                titleC: gc.Title_CharLength || 0,
          itemHighlight: gc.ItemHighlight ?? "",
          d1: gc.DetailedBulletPoint_1 || "",      d1c: gc.DetailedBulletPoint_1_CharLength || 0,
          d2: gc.DetailedBulletPoint_2 || "",      d2c: gc.DetailedBulletPoint_2_CharLength || 0,
          d3: gc.DetailedBulletPoint_3 || "",      d3c: gc.DetailedBulletPoint_3_CharLength || 0,
          d4: gc.DetailedBulletPoint_4 || "",      d4c: gc.DetailedBulletPoint_4_CharLength || 0,
          d5: gc.DetailedBulletPoint_5 || "",      d5c: gc.DetailedBulletPoint_5_CharLength || 0,
          c1: gc.ConciseBulletPoint_1 || "",       c1c: gc.ConciseBulletPoint_1_CharLength || 0,
          c2: gc.ConciseBulletPoint_2 || "",       c2c: gc.ConciseBulletPoint_2_CharLength || 0,
          c3: gc.ConciseBulletPoint_3 || "",       c3c: gc.ConciseBulletPoint_3_CharLength || 0,
          c4: gc.ConciseBulletPoint_4 || "",       c4c: gc.ConciseBulletPoint_4_CharLength || 0,
          c5: gc.ConciseBulletPoint_5 || "",       c5c: gc.ConciseBulletPoint_5_CharLength || 0,
          ct1: gc.ContentBulletPoint_1 || "",      ct1c: gc.ContentBulletPoint_1_CharLength || 0,
          ct2: gc.ContentBulletPoint_2 || "",      ct2c: gc.ContentBulletPoint_2_CharLength || 0,
          ct3: gc.ContentBulletPoint_3 || "",      ct3c: gc.ContentBulletPoint_3_CharLength || 0,
          ct4: gc.ContentBulletPoint_4 || "",      ct4c: gc.ContentBulletPoint_4_CharLength || 0,
          ct5: gc.ContentBulletPoint_5 || "",      ct5c: gc.ContentBulletPoint_5_CharLength || 0,
          kf1: gc.KeyFeaturesBulletPoint_1 || "",  kf1c: gc.KeyFeaturesBulletPoint_1_CharLength || 0,
          kf2: gc.KeyFeaturesBulletPoint_2 || "",  kf2c: gc.KeyFeaturesBulletPoint_2_CharLength || 0,
          kf3: gc.KeyFeaturesBulletPoint_3 || "",  kf3c: gc.KeyFeaturesBulletPoint_3_CharLength || 0,
          kf4: gc.KeyFeaturesBulletPoint_4 || "",  kf4c: gc.KeyFeaturesBulletPoint_4_CharLength || 0,
          kf5: gc.KeyFeaturesBulletPoint_5 || "",  kf5c: gc.KeyFeaturesBulletPoint_5_CharLength || 0,
          desc:    gc.ProductDescription || "",    descC: gc.ProductDescription_CharLength || 0,
          backend: gc.BackendSearchTerms || "",    backendB: gc.BackendSearchTerms_ByteLength || 0,
          aplusQA: Array.isArray(gc._aplusQA) ? gc._aplusQA : undefined,
        };
      });

    // ── Build .docx ───────────────────────────────────────────
    const buffer = await buildDocxBuffer(rows, brand, today, projectName, keywords);

    // ── Find or create brand subfolder ────────────────────────
    const safeBrand = brand.replace(/[/\\?%*:|"<>]/g, "-").trim();
    const existingFolders = await driveClient.listFiles(
      `name='${safeBrand.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
    );
    const brandFolderId = existingFolders.files.length
      ? existingFolders.files[0].id
      : (await driveClient.createFolder(safeBrand, rootFolderId)).id;
    // New-convention names get their own folder; legacy names stay in the brand folder
    const { parentId: exportFolderId, docName } = await resolveSeoExportLocation(brandFolderId, projectName);

    // ── Delete old file with same name ────────────────────────
    try {
      const old = await driveClient.listFiles(
        `(name='${docName}' or name='${docName}.docx') and '${exportFolderId}' in parents and trashed=false`,
      );
      for (const f of old.files) await driveClient.deleteFile(f.id);
    } catch (err) {
      console.warn("[export-gdoc] Failed to clean up old Drive file:", err instanceof Error ? err.message : err);
    }

    // ── Upload ────────────────────────────────────────────────
    const uploaded = await driveClient.uploadFile(
      `${docName}.docx`, exportFolderId, buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const exportUrl = `https://drive.google.com/file/d/${uploaded.id}/view`;

    // Track export in seo_exports (insert-after-upload)
    await db.insert(seoExports).values({
      projectId: id,
      type: "google_doc",
      url: exportUrl,
      contentSnapshot: { brand, asinsCount: asins.length, date: dateSlug },
    });

    return NextResponse.json({
      url: exportUrl,
      brand,
      filename: docName,
    });

  } catch (err: unknown) {
    console.error("export-gdoc error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 });
  }
}
