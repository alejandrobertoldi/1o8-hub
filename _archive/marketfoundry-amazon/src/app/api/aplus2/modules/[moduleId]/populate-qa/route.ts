import { hasAdminPowers } from "@/lib/roles";
/**
 * POST /api/aplus2/modules/[moduleId]/populate-qa
 *   Body: { projectId: string }
 *   Re-resolves the matching seo_qa.aplusQaSubset server-side and REPLACES the
 *   module's Q&A items in a transaction. Truncates text to the qa field limits.
 *   Response: { items: [...], truncated: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Modules,
  aplus2Versions,
  aplus2Sets,
  aplus2ModuleItems,
  seoAsins,
  seoQa,
  seoProjects,
} from "@/lib/db/schema";
import { candidateAsins, pickQaRow, subsetToItems, type QaRow } from "@/lib/aplus2/qa-from-seo";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = (await req.json().catch(() => null)) as { projectId?: string } | null;
  if (!body?.projectId) {
    return NextResponse.json({ error: "Body must contain 'projectId'" }, { status: 400 });
  }

  const [mod] = await db
    .select({
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      coveredAsins: aplus2Sets.coveredAsins,
      clientIdCode: aplus2Sets.clientIdCode,
    })
    .from(aplus2Modules)
    .innerJoin(aplus2Versions, eq(aplus2Versions.id, aplus2Modules.versionId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });
  if (mod.moduleType !== "qa") {
    return NextResponse.json({ error: "Module is not a Premium Q&A module" }, { status: 400 });
  }

  const asins = candidateAsins(mod);
  if (asins.length === 0) {
    return NextResponse.json({ error: "Set has no ASINs to match" }, { status: 400 });
  }

  const rows = await db
    .select({
      asin: seoAsins.asin,
      asinId: seoAsins.id,
      subset: seoQa.aplusQaSubset,
      version: seoQa.version,
    })
    .from(seoAsins)
    .innerJoin(seoQa, eq(seoQa.asinId, seoAsins.id))
    .innerJoin(seoProjects, eq(seoProjects.id, seoAsins.projectId))
    .where(and(eq(seoAsins.projectId, body.projectId), inArray(seoAsins.asin, asins), eq(seoProjects.clientIdCode, mod.clientIdCode)))
    .orderBy(seoAsins.id, desc(seoQa.version));

  const latestByAsin = new Map<string, QaRow>();
  for (const r of rows) {
    if (!latestByAsin.has(r.asinId)) {
      latestByAsin.set(r.asinId, { asin: r.asin, asinId: r.asinId, subset: r.subset ?? [] });
    }
  }

  const picked = pickQaRow([...latestByAsin.values()], mod.scopeIdentifier);
  if (!picked) {
    return NextResponse.json(
      { error: "No SEO Q&A found for this project and ASIN" },
      { status: 400 }
    );
  }

  const { items, truncated } = subsetToItems(picked.subset);

  const inserted = await db.transaction(async (tx) => {
    await tx.delete(aplus2ModuleItems).where(eq(aplus2ModuleItems.moduleId, moduleId));
    const values = items.map((data, i) => ({ moduleId, position: i + 1, data }));
    const result = values.length
      ? await tx.insert(aplus2ModuleItems).values(values).returning()
      : [];
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, mod.versionId));
    return result;
  });

  return NextResponse.json({ items: inserted, truncated });
}
