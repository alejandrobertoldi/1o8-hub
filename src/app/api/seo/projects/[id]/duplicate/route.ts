import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, sql } from "drizzle-orm";
import { serverError } from "@/lib/api-utils";
import { applyParentVariationFill } from "@/lib/seo/parent-variation-fill";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";
import { allocateVersionedProjectName } from "@/lib/seo/project-version-name";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Load the source project
    const [source] = await db
      .select()
      .from(seoProjects)
      .where(eq(seoProjects.id, id))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Load source ASINs
    const sourceAsins = await db
      .select()
      .from(seoAsins)
      .where(eq(seoAsins.projectId, id));

    // Create duplicate project in a transaction
    const result = await db.transaction(async (tx) => {
      // New version = new _vNN name (same locked allocator as project create).
      const name = await allocateVersionedProjectName(tx, source.clientIdCode, source.name);

      // Variation badge: highest on the variation + 1, under a per-variation lock
      // so concurrent duplicates can't both get the same number.
      let nextVersion = source.version + 1;
      if (source.variationId) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seo-variation:${source.variationId}`}))`);
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${seoProjects.version}), 0)::int` })
          .from(seoProjects)
          .where(eq(seoProjects.variationId, source.variationId));
        nextVersion = max + 1;
      }

      const [newProject] = await tx
        .insert(seoProjects)
        .values({
          createdBy: session.user.email!,
          name,
          brandName: source.brandName,
          status: "draft",
          currentPhase: "S1",
          assignedTo: source.assignedTo,
          clientIdCode: source.clientIdCode,
          clientName: source.clientName,
          brandUrl: source.brandUrl,
          clientBibleUrl: source.clientBibleUrl,
          competitors: source.competitors,
          variationId: source.variationId,
          variationTheme: source.variationTheme,
          sizePresent: source.sizePresent,
          brandGuidelines: source.brandGuidelines,
          brandGuidelinesLock: source.brandGuidelinesLock,
          varietyPackDetails: source.varietyPackDetails,
          linkedProductId: source.linkedProductId,
          version: nextVersion,
          date: new Date().toISOString().split("T")[0],
        })
        .returning();

      // Duplicate ASINs (without generated content — fresh start)
      if (sourceAsins.length > 0) {
        await tx.insert(seoAsins).values(
          sourceAsins.map((a) => applyParentVariationFill({
            projectId: newProject.id,
            asin: a.asin,
            sku: a.sku,
            amazonUrl: a.amazonUrl,
            websiteUrl: a.websiteUrl,
            variationId: a.variationId,
            variationProduct: a.variationProduct,
            parentageLevel: a.parentageLevel,
            variationThemeName: a.variationThemeName,
            flavor: a.flavor,
            style: a.style,
            color: a.color,
            size: a.size,
            variationGroup: a.variationGroup,
            existingContent: a.existingContent,
          }))
        );
      }

      return { project: newProject, asinCount: sourceAsins.length };
    });

    invalidateSeoProjectsCache();
    return NextResponse.json({
      id: result.project.id,
      name: result.project.name,
      version: result.project.version,
      asin_count: result.asinCount,
    });
  } catch (err: unknown) {
    return serverError(err);
  }
}
