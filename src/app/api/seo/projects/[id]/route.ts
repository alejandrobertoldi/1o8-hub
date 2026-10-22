import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, variations } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { isProjectStatus } from "@/lib/seo/project-status";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";

export const maxDuration = 60;

function toSnakeCase(p: typeof seoProjects.$inferSelect, variation?: { name: string; code: string; primaryDimension: string | null; themeAttributes: string[] | null } | null) {
  return {
    id: p.id,
    name: p.name,
    brand_name: p.brandName,
    status: p.status,
    current_phase: p.currentPhase,
    client_id_code: p.clientIdCode,
    client_name: p.clientName,
    assigned_to: p.assignedTo,
    content_rules: p.contentRules,
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
    brand_url: p.brandUrl,
    client_bible_url: p.clientBibleUrl,
    competitors: p.competitors,
    brand_guidelines: p.brandGuidelines,
    brand_guidelines_lock: p.brandGuidelinesLock,
    brand_guidelines_notes: p.brandGuidelinesNotes,
    variety_pack_details: p.varietyPackDetails,
    version: p.version,
    variation: variation ? {
      name: variation.name,
      code: variation.code,
      primary_dimension: variation.primaryDimension,
      theme_attributes: variation.themeAttributes,
    } : null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let variation = null;
    if (project.variationId) {
      const [v] = await db.select({ name: variations.name, code: variations.code, primaryDimension: variations.primaryDimension, themeAttributes: variations.themeAttributes }).from(variations).where(eq(variations.id, project.variationId)).limit(1);
      variation = v || null;
    }
    return NextResponse.json(toSnakeCase(project, variation));
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session || session.user.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    // Map snake_case body keys to Drizzle camelCase
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.brand_name !== undefined) update.brandName = body.brand_name;
    if (body.status !== undefined) {
      if (!isProjectStatus(body.status)) {
        return NextResponse.json(
          { error: "Invalid status. Allowed: draft, in_progress, completed, live, deprecated, archived" },
          { status: 400 },
        );
      }
      if (body.status === "live" || body.status === "deprecated") {
        return NextResponse.json({ error: "Use Go live to set live/deprecated" }, { status: 400 });
      }
      update.status = body.status;
    }
    if (body.current_phase !== undefined) update.currentPhase = body.current_phase;
    if (body.assigned_to !== undefined) update.assignedTo = body.assigned_to || null;
    if (body.client_id_code !== undefined) update.clientIdCode = body.client_id_code || null;
    if (body.content_rules !== undefined) {
      // S0.3: content rules only shape S6 writing — editable until S6 is approved
      const rules = body.content_rules;
      if (rules !== null && (typeof rules !== "object" || Array.isArray(rules))) {
        return NextResponse.json({ error: "content_rules must be an object" }, { status: 400 });
      }
      const [current] = await db
        .select({ s6ApprovedAt: seoProjects.s6ApprovedAt })
        .from(seoProjects)
        .where(eq(seoProjects.id, id))
        .limit(1);
      if (current?.s6ApprovedAt) {
        return NextResponse.json({ error: "S6 is approved — content rules are locked." }, { status: 409 });
      }
      update.contentRules = rules;
    }
    const [project] = await db.update(seoProjects).set(update).where(eq(seoProjects.id, id)).returning();
    invalidateSeoProjectsCache();
    return NextResponse.json(toSnakeCase(project));
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session || session.user.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await db.delete(seoProjects).where(eq(seoProjects.id, id));
    invalidateSeoProjectsCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
