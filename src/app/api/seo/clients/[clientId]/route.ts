/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, seoAsins, seoExports, seoQualityScores, users, aac, variations, seoRevisions, seoRevisionPushes, master } from "@/lib/db/schema";
import { projectAsinList } from "@/lib/seo/project-asin-list";
import type { TrailRow } from "@/lib/seo/phase-trail";
import { loadProjectTrails } from "@/lib/seo/project-trails";
import { getAuthSession } from "@/lib/auth-db";
import { eq, desc, count, sql, and, inArray } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { clientId } = await params;

    // Parallel queries
    const [projectRows, clientRow] = await Promise.all([
      // Projects for this client, joined with users
      db
        .select({
          id: seoProjects.id,
          name: seoProjects.name,
          brandName: seoProjects.brandName,
          status: seoProjects.status,
          currentPhase: seoProjects.currentPhase,
          clientIdCode: seoProjects.clientIdCode,
          createdBy: seoProjects.createdBy,
          assignedTo: seoProjects.assignedTo,
          createdAt: seoProjects.createdAt,
          updatedAt: seoProjects.updatedAt,
          s1ApprovedAt: seoProjects.s1ApprovedAt,
          s2ApprovedAt: seoProjects.s2ApprovedAt,
          s3ApprovedAt: seoProjects.s3ApprovedAt,
          s4ApprovedAt: seoProjects.s4ApprovedAt,
          s5ApprovedAt: seoProjects.s5ApprovedAt,
          s6ApprovedAt: seoProjects.s6ApprovedAt,
          variationId: seoProjects.variationId,
          version: seoProjects.version,
          assigneeName: users.name,
          assigneeImage: users.image,
          variationName: variations.name,
          variationCode: variations.code,
        })
        .from(seoProjects)
        .leftJoin(users, eq(seoProjects.assignedTo, users.id))
        .leftJoin(variations, eq(seoProjects.variationId, variations.id))
        .where(eq(seoProjects.clientIdCode, clientId))
        .orderBy(desc(seoProjects.createdAt)),

      // Client name lookup
      db
        .select({
          clientIdCode: aac.clientIdCode,
          clientName: aac.clientName,
        })
        .from(aac)
        .where(eq(aac.clientIdCode, clientId))
        .limit(1),
    ]);

    const projectIds = projectRows.map((p) => p.id);
    const clientName = clientRow[0]?.clientName ?? clientId;

    // Get ASIN counts and exports for these projects (only if projects exist)
    let asinCount = 0;
    let allExports: Array<{
      id: string;
      projectId: string;
      type: string;
      url: string | null;
      createdAt: Date;
    }> = [];

    if (projectIds.length > 0) {
      const [asinRows, exportRows] = await Promise.all([
        db
          .select({
            projectId: seoAsins.projectId,
            count: count(),
          })
          .from(seoAsins)
          .where(eq(seoAsins.projectId, projectIds[0]!))
          .groupBy(seoAsins.projectId),

        db
          .select({
            id: seoExports.id,
            projectId: seoExports.projectId,
            type: seoExports.type,
            url: seoExports.url,
            createdAt: seoExports.createdAt,
          })
          .from(seoExports)
          .orderBy(desc(seoExports.createdAt))
          .limit(50),
      ]);

      // For multiple projects, we need to sum up ASINs across all projects
      // The simple eq above only works for one project; let's use a broader approach
      // Re-query for all project ASIN counts
      if (projectIds.length > 1) {
        const allAsinRows = await db
          .select({
            projectId: seoAsins.projectId,
            count: count(),
          })
          .from(seoAsins)
          .groupBy(seoAsins.projectId);

        const asinMap: Record<string, number> = {};
        for (const r of allAsinRows) {
          asinMap[r.projectId] = Number(r.count);
        }
        asinCount = projectIds.reduce((sum, id) => sum + (asinMap[id] || 0), 0);
      } else {
        asinCount = asinRows.reduce((sum, r) => sum + Number(r.count), 0);
      }

      // Filter exports to only this client's projects
      const projectIdSet = new Set(projectIds);
      allExports = exportRows.filter((e) => projectIdSet.has(e.projectId));
    }

    // Quality score history per project (last 10 scores per project)
    const qualityScoreRows = projectIds.length > 0
      ? await db
          .select({
            projectId: seoQualityScores.projectId,
            overallScore: seoQualityScores.overallScore,
            createdAt: seoQualityScores.createdAt,
          })
          .from(seoQualityScores)
          .orderBy(desc(seoQualityScores.createdAt))
      : [];

    // Group by project, keep last 10 per project
    const qualityByProject = new Map<string, number[]>();
    for (const row of qualityScoreRows) {
      if (!projectIds.includes(row.projectId)) continue;
      const existing = qualityByProject.get(row.projectId) || [];
      if (existing.length < 10) {
        existing.push(row.overallScore);
        qualityByProject.set(row.projectId, existing);
      }
    }

    // Content previews from seoAsins (first ASIN per project with generated content)
    const contentRows = projectIds.length > 0
      ? await db
          .select({
            projectId: seoAsins.projectId,
            generatedContent: seoAsins.generatedContent,
            asin: seoAsins.asin,
            sku: seoAsins.sku,
            parentageLevel: seoAsins.parentageLevel,
          })
          .from(seoAsins)
          .where(inArray(seoAsins.projectId, projectIds))
      : [];

    // Targeted ASINs per project (card "standard view": parentage, ASIN, Amazon link, title)
    const cardAsins = contentRows.map((r) => r.asin);
    const asinProducts = cardAsins.length > 0
      ? await db.select({ id: master.id, asin: master.asin, sku: master.sku, summarizedTitle: master.summarizedTitle, itemName: master.itemName })
          .from(master).where(and(eq(master.clientIdCode, clientId), inArray(master.asin, [...new Set(cardAsins)])))
      : [];
    const asinsByProject = projectAsinList(contentRows, asinProducts);

    const contentMap = new Map<string, { title: string; bullet1: string; description: string }>();
    for (const row of contentRows) {
      if (!projectIds.includes(row.projectId) || contentMap.has(row.projectId)) continue;
      const gc = row.generatedContent as Record<string, string> | null;
      if (gc?.item_name) {
        contentMap.set(row.projectId, {
          title: gc.item_name || "",
          bullet1: gc.detailed_bullet_1 || gc.bullet_1 || "",
          description: gc.product_description || "",
        });
      }
    }

    // Export info per project
    const exportMap = new Map<string, { export_count: number; last_exported_at: string; last_url: string | null }>();
    for (const e of allExports) {
      const existing = exportMap.get(e.projectId);
      if (!existing) {
        exportMap.set(e.projectId, {
          export_count: 1,
          last_exported_at: e.createdAt.toISOString(),
          last_url: e.url,
        });
      } else {
        existing.export_count++;
      }
    }

    // Review-stage badge is decoration: a failure here must not break the client page.
    let openRevRows: Array<{ projectId: string; status: string }> = [];
    if (projectIds.length) {
      try {
        openRevRows = await db.select({ projectId: seoRevisions.projectId, status: seoRevisions.status }).from(seoRevisions)
          .where(and(inArray(seoRevisions.projectId, projectIds), inArray(seoRevisions.status, ["pm_review", "am_review", "client_review"])));
      } catch (err) {
        console.error("[api/seo/clients] open-revision lookup failed; review_stage omitted", err);
      }
    }
    const stageByProject = new Map(openRevRows.map((r) => [r.projectId, r.status]));

    // S7 / S8 dots: an approved revision exists / content was pushed (decoration — never breaks the page)
    const approvedProjects = new Set<string>();
    const pushedProjects = new Set<string>();
    if (projectIds.length) {
      try {
        const [appr, pushes] = await Promise.all([
          db.selectDistinct({ projectId: seoRevisions.projectId }).from(seoRevisions)
            .where(and(inArray(seoRevisions.projectId, projectIds), eq(seoRevisions.status, "approved"))),
          db.selectDistinct({ projectId: seoRevisionPushes.projectId }).from(seoRevisionPushes)
            .where(inArray(seoRevisionPushes.projectId, projectIds)),
        ]);
        appr.forEach((r) => approvedProjects.add(r.projectId));
        pushes.forEach((r) => pushedProjects.add(r.projectId));
      } catch (err) {
        console.error("[api/seo/clients] S7/S8 lookup failed; dots omitted", err);
      }
    }

    // Team column per phase (decoration — a failure leaves it out)
    const trails = await loadProjectTrails(projectRows).catch((err) => {
      console.error("[api/seo/clients] phase trail lookup failed; omitted", err);
      return new Map<string, TrailRow[]>();
    });

    // Build projects response
    const projects = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      brand_name: p.brandName,
      status: p.status,
      current_phase: p.currentPhase,
      client_id_code: p.clientIdCode,
      created_by: p.createdBy,
      assigned_to: p.assignedTo,
      assignee_name: p.assigneeName,
      assignee_image: p.assigneeImage,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      s1_approved_at: p.s1ApprovedAt,
      s2_approved_at: p.s2ApprovedAt,
      s3_approved_at: p.s3ApprovedAt,
      s4_approved_at: p.s4ApprovedAt,
      s5_approved_at: p.s5ApprovedAt,
      s6_approved_at: p.s6ApprovedAt,
      variation_id: p.variationId,
      variation_name: p.variationName,
      variation_code: p.variationCode,
      version: p.version,
      quality_scores: qualityByProject.get(p.id) || [],
      content_preview: contentMap.get(p.id) || null,
      quality_score: (qualityByProject.get(p.id) || []).length > 0
        ? { overall_score: (qualityByProject.get(p.id) || [])[0], scored_at: "" }
        : null,
      export_info: exportMap.get(p.id) || null,
      review_stage: stageByProject.get(p.id) ?? null,
      asins: asinsByProject.get(p.id) ?? [],
      review_approved: approvedProjects.has(p.id),
      pushed: pushedProjects.has(p.id),
      trail: trails.get(p.id),
    }));

    // Phase breakdown
    const phaseBreakdown = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0, completed: 0 };
    for (const p of projectRows) {
      if (p.status === "completed" || p.status === "live") {
        phaseBreakdown.completed++;
      } else if (p.status !== "archived" && p.status !== "deprecated") {
        const phase = p.currentPhase as keyof typeof phaseBreakdown;
        if (phase in phaseBreakdown && phase !== "completed") {
          (phaseBreakdown as Record<string, number>)[phase]++;
        }
      }
    }

    const recentExports = allExports.slice(0, 10).map((e) => ({
      id: e.id,
      projectId: e.projectId,
      type: e.type,
      url: e.url,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({
      clientIdCode: clientId,
      clientName,
      projects,
      asinCount,
      exportCount: allExports.length,
      recentExports,
      phaseBreakdown,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
