import { hasAdminPowers } from "@/lib/roles";
/**
 * GET /api/aplus2/modules/[moduleId]/seo-qa-sources
 *   Lists SEO projects (for the module's set's client) that have a Premium A+
 *   Q&A subset matching one of the set's ASINs.
 *   Response: { sources: Array<{ projectId, projectName, asin, asinId, pairCount }> }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Modules,
  aplus2Versions,
  aplus2Sets,
  seoProjects,
  seoAsins,
  seoQa,
} from "@/lib/db/schema";
import { candidateAsins, pickQaRow, type QaRow } from "@/lib/aplus2/qa-from-seo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (!hasAdminPowers(role) && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod] = await db
    .select({
      moduleType: aplus2Modules.moduleType,
      clientIdCode: aplus2Sets.clientIdCode,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      coveredAsins: aplus2Sets.coveredAsins,
    })
    .from(aplus2Modules)
    .innerJoin(aplus2Versions, eq(aplus2Versions.id, aplus2Modules.versionId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });
  if (mod.moduleType !== "qa") return NextResponse.json({ sources: [] });

  const asins = candidateAsins(mod);
  if (asins.length === 0) return NextResponse.json({ sources: [] });

  const rows = await db
    .select({
      projectId: seoProjects.id,
      projectName: seoProjects.name,
      asin: seoAsins.asin,
      asinId: seoAsins.id,
      subset: seoQa.aplusQaSubset,
      version: seoQa.version,
    })
    .from(seoProjects)
    .innerJoin(seoAsins, eq(seoAsins.projectId, seoProjects.id))
    .innerJoin(seoQa, eq(seoQa.asinId, seoAsins.id))
    .where(and(eq(seoProjects.clientIdCode, mod.clientIdCode), inArray(seoAsins.asin, asins)))
    .orderBy(seoAsins.id, desc(seoQa.version));

  // Reduce to latest version per asinId (first occurrence wins due to ORDER BY version DESC).
  const latestByAsin = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!latestByAsin.has(r.asinId)) latestByAsin.set(r.asinId, r);
  }

  // Group latest rows by project, then pick the best row per project.
  const byProject = new Map<string, { name: string; rows: QaRow[] }>();
  for (const r of latestByAsin.values()) {
    const entry = byProject.get(r.projectId) ?? { name: r.projectName, rows: [] };
    entry.rows.push({ asin: r.asin, asinId: r.asinId, subset: r.subset ?? [] });
    byProject.set(r.projectId, entry);
  }

  const sources = [];
  for (const [projectId, entry] of byProject) {
    const picked = pickQaRow(entry.rows, mod.scopeIdentifier);
    if (!picked) continue;
    sources.push({
      projectId,
      projectName: entry.name,
      asin: picked.asin,
      asinId: picked.asinId,
      pairCount: picked.subset.length,
    });
  }
  sources.sort((a, b) => a.projectName.localeCompare(b.projectName));

  return NextResponse.json({ sources });
}
