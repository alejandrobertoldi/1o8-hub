import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { serverError } from "@/lib/api-utils";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";
import { buildSeoAsinRows, selectTargetProducts } from "@/lib/seo/project-asin-rows";

/**
 * PUT /api/seo/projects/[id]/targets  { product_ids: string[] }
 *
 * S0.2 "Target ASINs" edit. Replaces the project's ASIN list — only while S1
 * isn't approved, because S1's baseline and everything after it is built for
 * those ASINs. Products must belong to the project's client.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session || session.user.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await req.json()) as { product_ids?: unknown };
    const productIds = Array.isArray(body.product_ids)
      ? [...new Set(body.product_ids.filter((x): x is string => typeof x === "string" && !!x))]
      : [];
    if (productIds.length === 0) {
      return NextResponse.json({ error: "Select at least one ASIN" }, { status: 400 });
    }

    const [project] = await db
      .select({ clientIdCode: seoProjects.clientIdCode, s1ApprovedAt: seoProjects.s1ApprovedAt })
      .from(seoProjects)
      .where(eq(seoProjects.id, id))
      .limit(1);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.s1ApprovedAt) {
      return NextResponse.json(
        { error: "S1 is approved — the target ASINs are locked. Create a new project version instead." },
        { status: 409 }
      );
    }
    if (!project.clientIdCode) {
      return NextResponse.json({ error: "Project has no client" }, { status: 400 });
    }

    const products = await selectTargetProducts(project.clientIdCode, productIds);
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Some product IDs do not belong to this client" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.delete(seoAsins).where(eq(seoAsins.projectId, id));
      await tx.insert(seoAsins).values(buildSeoAsinRows(id, products));
      await tx.update(seoProjects).set({ updatedAt: new Date() }).where(eq(seoProjects.id, id));
    });
    invalidateSeoProjectsCache();
    return NextResponse.json({ success: true, asin_count: products.length });
  } catch (err) {
    return serverError(err);
  }
}
