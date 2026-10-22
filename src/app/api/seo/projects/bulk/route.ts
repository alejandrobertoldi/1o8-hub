/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoExports, seoKeywords } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, inArray } from "drizzle-orm";
import { buildDocxBuffer, type DocxRow } from "@/lib/seo-docx-builder";
import { driveClient } from "@/lib/drive-client";
import { resolveSeoExportLocation } from "@/lib/seo/drive-export-location";
import { serverError } from "@/lib/api-utils";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";

export const maxDuration = 120;

// PATCH /api/seo/projects/bulk — bulk operations
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { action, projectIds, assignTo } = await req.json();

    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: "projectIds array required" }, { status: 400 });
    }

    switch (action) {
      case "approve": {
        // Mark S6 as approved for all selected projects
        await db
          .update(seoProjects)
          .set({
            s6ApprovedAt: new Date(),
            status: "completed",
            updatedAt: new Date(),
          })
          .where(inArray(seoProjects.id, projectIds));

        invalidateSeoProjectsCache();
        return NextResponse.json({ success: true, action: "approve", count: projectIds.length });
      }

      case "reassign": {
        if (!assignTo) {
          return NextResponse.json({ error: "assignTo required for reassign" }, { status: 400 });
        }
        await db
          .update(seoProjects)
          .set({ assignedTo: assignTo, updatedAt: new Date() })
          .where(inArray(seoProjects.id, projectIds));

        invalidateSeoProjectsCache();
        return NextResponse.json({ success: true, action: "reassign", count: projectIds.length });
      }

      case "export": {
        const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
        if (!rootFolderId) {
          return NextResponse.json(
            { error: "Google Drive not configured" },
            { status: 400 }
          );
        }

        // Use dynamic import for p-limit (ESM)
        const pLimit = (await import("p-limit")).default;
        const limit = pLimit(5);

        const results = await Promise.allSettled(
          projectIds.map((id: string) =>
            limit(async () => {
              const [project] = await db
                .select({ brandName: seoProjects.brandName, name: seoProjects.name })
                .from(seoProjects)
                .where(eq(seoProjects.id, id))
                .limit(1);

              const asins = await db
                .select({
                  asin: seoAsins.asin,
                  parentageLevel: seoAsins.parentageLevel,
                  variationProduct: seoAsins.variationProduct,
                  flavor: seoAsins.flavor,
                  style: seoAsins.style,
                  color: seoAsins.color,
                  size: seoAsins.size,
                  generatedContent: seoAsins.generatedContent,
                })
                .from(seoAsins)
                .where(eq(seoAsins.projectId, id));

              if (!asins.length) throw new Error("No ASIN data");

              const hasContent = asins.some((a) => {
                const gc = (a.generatedContent as unknown as Record<string, string>) || {};
                return !!gc.Title;
              });
              if (!hasContent) throw new Error("No content generated");

              const brand = project?.brandName || "Unknown Brand";
              const dateSlug = new Date().toISOString().slice(0, 10);
              const today = new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

              const rows: DocxRow[] = asins
                .sort((a, b) => {
                  const aP = (a.parentageLevel || "").toLowerCase() === "parent";
                  const bP = (b.parentageLevel || "").toLowerCase() === "parent";
                  if (aP && !bP) return -1;
                  if (!aP && bP) return 1;
                  return a.asin.localeCompare(b.asin);
                })
                .map((a) => {
                  const gc = (a.generatedContent as unknown as Record<string, string | number>) || {};
                  return {
                    asin: a.asin || "", parentage: a.parentageLevel || "",
                    product: a.variationProduct || "",
                    flavor: a.flavor || "", style: a.style || "",
                    color: a.color || "", size: a.size || "",
                    title: (gc.Title as string) || "", titleC: (gc.Title_CharLength as number) || 0,
                    itemHighlight: (gc.ItemHighlight as string) ?? "",
                    d1: (gc.DetailedBulletPoint_1 as string) || "", d1c: (gc.DetailedBulletPoint_1_CharLength as number) || 0,
                    d2: (gc.DetailedBulletPoint_2 as string) || "", d2c: (gc.DetailedBulletPoint_2_CharLength as number) || 0,
                    d3: (gc.DetailedBulletPoint_3 as string) || "", d3c: (gc.DetailedBulletPoint_3_CharLength as number) || 0,
                    d4: (gc.DetailedBulletPoint_4 as string) || "", d4c: (gc.DetailedBulletPoint_4_CharLength as number) || 0,
                    d5: (gc.DetailedBulletPoint_5 as string) || "", d5c: (gc.DetailedBulletPoint_5_CharLength as number) || 0,
                    c1: (gc.ConciseBulletPoint_1 as string) || "", c1c: (gc.ConciseBulletPoint_1_CharLength as number) || 0,
                    c2: (gc.ConciseBulletPoint_2 as string) || "", c2c: (gc.ConciseBulletPoint_2_CharLength as number) || 0,
                    c3: (gc.ConciseBulletPoint_3 as string) || "", c3c: (gc.ConciseBulletPoint_3_CharLength as number) || 0,
                    c4: (gc.ConciseBulletPoint_4 as string) || "", c4c: (gc.ConciseBulletPoint_4_CharLength as number) || 0,
                    c5: (gc.ConciseBulletPoint_5 as string) || "", c5c: (gc.ConciseBulletPoint_5_CharLength as number) || 0,
                    ct1: (gc.ContentBulletPoint_1 as string) || "", ct1c: (gc.ContentBulletPoint_1_CharLength as number) || 0,
                    ct2: (gc.ContentBulletPoint_2 as string) || "", ct2c: (gc.ContentBulletPoint_2_CharLength as number) || 0,
                    ct3: (gc.ContentBulletPoint_3 as string) || "", ct3c: (gc.ContentBulletPoint_3_CharLength as number) || 0,
                    ct4: (gc.ContentBulletPoint_4 as string) || "", ct4c: (gc.ContentBulletPoint_4_CharLength as number) || 0,
                    ct5: (gc.ContentBulletPoint_5 as string) || "", ct5c: (gc.ContentBulletPoint_5_CharLength as number) || 0,
                    kf1: (gc.KeyFeaturesBulletPoint_1 as string) || "", kf1c: (gc.KeyFeaturesBulletPoint_1_CharLength as number) || 0,
                    kf2: (gc.KeyFeaturesBulletPoint_2 as string) || "", kf2c: (gc.KeyFeaturesBulletPoint_2_CharLength as number) || 0,
                    kf3: (gc.KeyFeaturesBulletPoint_3 as string) || "", kf3c: (gc.KeyFeaturesBulletPoint_3_CharLength as number) || 0,
                    kf4: (gc.KeyFeaturesBulletPoint_4 as string) || "", kf4c: (gc.KeyFeaturesBulletPoint_4_CharLength as number) || 0,
                    kf5: (gc.KeyFeaturesBulletPoint_5 as string) || "", kf5c: (gc.KeyFeaturesBulletPoint_5_CharLength as number) || 0,
                    desc: (gc.ProductDescription as string) || "", descC: (gc.ProductDescription_CharLength as number) || 0,
                    backend: (gc.BackendSearchTerms as string) || "", backendB: (gc.BackendSearchTerms_ByteLength as number) || 0,
                  };
                });

              const projectName = project?.name || "Untitled Project";
              const keywordRows = await db
                .select({ text: seoKeywords.text })
                .from(seoKeywords)
                .where(eq(seoKeywords.projectId, id));
              const keywords = keywordRows.map((k) => k.text).filter(Boolean);

              const buffer = await buildDocxBuffer(rows, brand, today, projectName, keywords);

              const safeBrand = brand.replace(/[/\\?%*:|"<>]/g, "-").trim();
              const existingFolders = await driveClient.listFiles(
                `name='${safeBrand.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
              );
              const brandFolderId = existingFolders.files.length
                ? existingFolders.files[0].id
                : (await driveClient.createFolder(safeBrand, rootFolderId)).id;
              // New-convention names get their own folder; legacy names stay in the brand folder
              const { parentId: exportFolderId, docName } = await resolveSeoExportLocation(brandFolderId, projectName);

              try {
                const old = await driveClient.listFiles(
                  `(name='${docName}' or name='${docName}.docx') and '${exportFolderId}' in parents and trashed=false`,
                );
                for (const f of old.files) await driveClient.deleteFile(f.id);
              } catch (err) {
                console.warn("[bulk-export] Failed to clean up old Drive file:", err instanceof Error ? err.message : err);
              }

              const uploaded = await driveClient.uploadFile(
                `${docName}.docx`,
                exportFolderId,
                buffer,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              );

              const url = `https://drive.google.com/file/d/${uploaded.id}/view`;

              // Insert export record after successful upload
              await db.insert(seoExports).values({
                projectId: id,
                type: "google_doc",
                url,
                contentSnapshot: { brand, asinsCount: asins.length, date: dateSlug },
              });

              return { projectId: id, url, brand };
            })
          )
        );

        const exported = results.map((r, i) => {
          const base = { id: projectIds[i], status: r.status };
          if (r.status === "fulfilled") {
            return { ...base, url: r.value.url, brand: r.value.brand };
          }
          return { ...base, error: (r as PromiseRejectedResult).reason?.message };
        });

        const successCount = results.filter((r) => r.status === "fulfilled").length;
        return NextResponse.json({
          success: true,
          action: "export",
          total: projectIds.length,
          successCount,
          failedCount: projectIds.length - successCount,
          results: exported,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    return serverError(err);
  }
}
