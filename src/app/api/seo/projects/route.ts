/* eslint-disable react-doctor/nextjs-no-redirect-in-try-catch */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db, recycleDbPool } from "@/lib/db";
import { seoProjects, seoAsins, users, master, aac, variations, seoRevisions, seoRevisionPushes } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { unauthorized, serverError, getErrorMessage } from "@/lib/api-utils";
import { withDbTimeout, DbTimeoutError } from "@/lib/db/with-timeout";
import { loadProjectTrails } from "@/lib/seo/project-trails";
import { loadProjectAsins } from "@/lib/seo/project-asins";
import type { ProjectAsin } from "@/lib/seo/project-asin-list";
import type { TrailRow } from "@/lib/seo/phase-trail";
import {
  getOrFillSeoProjectsCache,
  invalidateSeoProjectsCache,
  peekSeoProjectsCache,
} from "@/lib/seo-projects-cache";
import { snapshotClientBrandGuidelines } from "@/lib/brand-guidelines/snapshot";
import { getProductFieldValue } from "@/lib/product-mapper";
import { applyParentVariationFill } from "@/lib/seo/parent-variation-fill";
import { allocateVersionedProjectName } from "@/lib/seo/project-version-name";
import { buildSeoAsinRows, selectTargetProducts } from "@/lib/seo/project-asin-rows";

// Without this the route inherits the 300s platform ceiling, so a wedged pool
// connection held the request for five minutes (observed in production: 4 of 6
// requests on 2026-09-16 returned 504 after 300s). The budget below fires first;
// this is only the backstop. /api/seo/team already sets 60 for the same reason.
export const maxDuration = 60;

/** Per-attempt budget. Two attempts (after a pool recycle) still finish under the page's 25s fetch deadline. */
const PROJECTS_ATTEMPT_MS = 8_000;

export async function GET() {
  try {
    return await respondWithProjects();
  } catch (err: unknown) {
    if (!(err instanceof DbTimeoutError)) return serverError(err);

    // The query is still sitting on a dead socket. Drop the pool so the retry
    // opens a new connection instead of queueing behind the wedged one.
    recycleDbPool("GET /api/seo/projects timeout");
    const stale = peekSeoProjectsCache<unknown[]>();
    if (stale) return NextResponse.json(stale);

    // Drop the hung in-flight fill so the retry does not wait on it.
    invalidateSeoProjectsCache();

    try {
      return await respondWithProjects();
    } catch (retryErr: unknown) {
      if (retryErr instanceof DbTimeoutError) {
        const again = peekSeoProjectsCache<unknown[]>();
        if (again) return NextResponse.json(again);
        console.error("[api/seo/projects]", retryErr.message);
        return NextResponse.json(
          { error: "Request timed out, please retry" },
          { status: 503 },
        );
      }
      return serverError(retryErr);
    }
  }
}

async function respondWithProjects() {
  return withDbTimeout(loadProjectsResponse(), PROJECTS_ATTEMPT_MS, "GET /api/seo/projects");
}

async function loadProjectsResponse() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  const projects = await getOrFillSeoProjectsCache(queryProjectList);
  return NextResponse.json(projects);
}

async function queryProjectList() {
  // One join. The previous handler also scanned seo_asins.generated_content,
  // seo_quality_scores, and seo_exports on every load — four queries against a
  // max:3 pool, so a single request could occupy every slot. Preview/quality/
  // export are nullable on the manager page; skipping them is what makes this
  // list survive a starved connection.
  const projectRows = await db
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
      linkedProductId: seoProjects.linkedProductId,
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
    .orderBy(desc(seoProjects.createdAt));

  const projectIds = projectRows.map((p) => p.id);
  // Review-stage badge is decoration: a failure here (e.g. migration not yet applied)
  // must never take the whole project list down.
  let openRows: Array<{ projectId: string; status: string }> = [];
  if (projectIds.length) {
    try {
      openRows = await db.select({ projectId: seoRevisions.projectId, status: seoRevisions.status }).from(seoRevisions)
        .where(and(inArray(seoRevisions.projectId, projectIds), inArray(seoRevisions.status, ["pm_review", "am_review", "client_review"])));
    } catch (err) {
      console.error("[api/seo/projects] open-revision lookup failed; review_stage omitted", err);
    }
  }
  const stageByProject = new Map(openRows.map((r) => [r.projectId, r.status]));
  // S7 / S8: an approved revision exists / content was pushed (decoration — never breaks the list)
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
      console.error("[api/seo/projects] S7/S8 lookup failed; omitted", err);
    }
  }

  // Team column per phase (decoration — a failure leaves it out)
  const [trails, asinsByProject] = await Promise.all([
    loadProjectTrails(projectRows).catch((err) => {
      console.error("[api/seo/projects] phase trail lookup failed; omitted", err);
      return new Map<string, TrailRow[]>();
    }),
    loadProjectAsins(projectRows).catch((err) => {
      console.error("[api/seo/projects] ASIN lookup failed; omitted", err);
      return new Map<string, ProjectAsin[]>();
    }),
  ]);

  return projectRows.map((p) => ({
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
    linked_product_id: p.linkedProductId,
    variation_id: p.variationId,
    variation_name: p.variationName,
    variation_code: p.variationCode,
    version: p.version,
    content_preview: null,
    quality_score: null,
    export_info: null,
    review_stage: stageByProject.get(p.id) ?? null,
    review_approved: approvedProjects.has(p.id),
    pushed: pushedProjects.has(p.id),
    trail: trails.get(p.id),
    asins: asinsByProject.get(p.id) ?? [],
  }));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const targeting = body.targeting as {
      mode: "family" | "group" | "single";
      product_ids: string[];
    } | undefined;

    // Validate client if targeting is provided
    if (targeting && body.client_id_code) {
      const [client] = await db
        .select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName, rawData: aac.rawData })
        .from(aac)
        .where(eq(aac.clientIdCode, body.client_id_code))
        .limit(1);

      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 400 });
      }

      if (!targeting.product_ids?.length) {
        return NextResponse.json({ error: "At least 1 product must be selected" }, { status: 400 });
      }

      // Validate product IDs belong to this client
      const selectedProducts = await selectTargetProducts(body.client_id_code, targeting.product_ids);

      if (selectedProducts.length !== targeting.product_ids.length) {
        return NextResponse.json(
          { error: "Some product IDs do not belong to this client" },
          { status: 400 }
        );
      }

      // Extract competitor info from AAC rawData
      let raw: Record<string, string> = {};
      if (typeof client.rawData === "string") {
        try { raw = JSON.parse(client.rawData); } catch { /* ignore */ }
      } else if (client.rawData) {
        raw = client.rawData as Record<string, string>;
      }

      const competitors: Array<{ name: string; url: string }> = [];
      for (let i = 1; i <= 5; i++) {
        const name = raw[`Competitor${i}Name`]?.trim();
        const url = raw[`Competitor${i}URL`]?.trim() || "";
        if (name) competitors.push({ name, url });
      }

      // Create project + asins in a transaction to avoid orphaned projects
      const bgSnapshot = await snapshotClientBrandGuidelines(body.client_id_code);
      const requestedName = body.name || "New Project";
      const result = await db.transaction(async (tx) => {
        // Any client-supplied _vNN suffix is stripped — server is the source of truth.
        const finalName = await allocateVersionedProjectName(tx, body.client_id_code, requestedName);

        const [project] = await tx
          .insert(seoProjects)
          .values({
            createdBy: session.user.email!,
            name: finalName,
            brandName: body.brand_name || selectedProducts[0]?.brandName || "",
            status: "draft",
            currentPhase: "S1",
            assignedTo: body.assigned_to || null,
            clientIdCode: body.client_id_code,
            clientName: client.clientName || "",
            brandUrl: raw.BrandURL || raw.WebsiteURL || "",
            competitors,
            contentRules: body.content_rules || null,
            date: new Date().toISOString().split("T")[0],
            brandGuidelines: bgSnapshot.brandGuidelines,
            brandGuidelinesLock: bgSnapshot.brandGuidelinesLock,
          })
          .returning();

        // Insert seoAsins rows for each targeted product (Hub copy = baseline)
        const asinRows = buildSeoAsinRows(project.id, selectedProducts);

        if (asinRows.length > 0) {
          await tx.insert(seoAsins).values(asinRows);
        }

        return { project, asinCount: asinRows.length };
      });

      invalidateSeoProjectsCache();
      return NextResponse.json({
        id: result.project.id,
        name: result.project.name,
        brand_name: result.project.brandName,
        status: result.project.status,
        current_phase: result.project.currentPhase,
        assigned_to: result.project.assignedTo,
        asin_count: result.asinCount,
      });
    }

    // Legacy create flow (no targeting — backwards compatible)
    let legacyVersion = 1;
    if (body.variation_id) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(seoProjects)
        .where(eq(seoProjects.variationId, body.variation_id));
      legacyVersion = (count || 0) + 1;
    }
    const legacyBgSnapshot = await snapshotClientBrandGuidelines(body.client_id_code);
    const [project] = await db
      .insert(seoProjects)
      .values({
        createdBy: session.user.email!,
        name: body.name || "New Project",
        brandName: body.brand_name || "",
        status: "draft",
        currentPhase: "S1",
        assignedTo: body.assigned_to || null,
        linkedProductId: body.linked_product_id || null,
        variationId: body.variation_id || null,
        version: legacyVersion,
        clientIdCode: body.client_id_code || null,
        brandGuidelines: legacyBgSnapshot.brandGuidelines,
        brandGuidelinesLock: legacyBgSnapshot.brandGuidelinesLock,
      })
      .returning();

    invalidateSeoProjectsCache();
    return NextResponse.json({
      id: project.id,
      name: project.name,
      brand_name: project.brandName,
      status: project.status,
      current_phase: project.currentPhase,
      assigned_to: project.assignedTo,
    });
  } catch (err: unknown) {
    console.error("[SEO Projects POST] Error:", err);
    const raw = getErrorMessage(err);
    const message = raw.startsWith("Failed query:") ? "Failed to create project" : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
