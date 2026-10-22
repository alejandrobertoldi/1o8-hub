/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
// ═══════════════════════════════════════════════════════════════
// SEO → Product Migration API
//
// POST — Push the project's APPROVED revision (seo_revisions) to
//        master products. An owner/super admin may push the live S6
//        content without review, with a recorded reason.
//
// GET  — Preview: which keys change per ASIN, and catalog drift
//        since the approval. Writes nothing.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, seoProjects, seoAsins, activityLog } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, and, inArray } from "drizzle-orm";
import { logEvent } from "@/lib/event-logger";
import { snapshotFields, changedKeys } from "@/lib/seo/revision-fields";
import { buildPushUpdate, findDrift } from "@/lib/seo/revision-push";
import { currentApprovedRevision, recordPushes } from "@/lib/seo/revision-db";
import { hasSuperPowers, isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { pickProductByAsin } from "@/lib/seo/pick-product-by-asin";

/** The SKU each ASIN of this project is for (seo_asins.sku) — picks the right catalog row. */
async function projectSkus(projectId: string) {
  return db.select({ asin: seoAsins.asin, sku: seoAsins.sku }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
}

// ── GET: Preview ──────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: projectId } = await params;

  // Load project
  const [project] = await db.select({
    id: seoProjects.id,
    name: seoProjects.name,
    brandName: seoProjects.brandName,
    clientIdCode: seoProjects.clientIdCode,
  }).from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.clientIdCode) return NextResponse.json({ error: "Project has no client" }, { status: 400 });

  const current = await currentApprovedRevision(projectId);
  if (!current) return NextResponse.json({ source: "none", revision: null, asins: [] });
  const content = current.content as Record<string, Record<string, string>>;
  const asinCodes = Object.keys(content);
  const products = await db.select({
    id: master.id, asin: master.asin, sku: master.sku, itemName: master.itemName, itemHighlight: master.itemHighlight,
    genericKeywords: master.genericKeywords, contentSeo: master.contentSeo, changeLog: master.changeLog,
  }).from(master).where(project.clientIdCode ? and(inArray(master.asin, asinCodes), eq(master.clientIdCode, project.clientIdCode)) : inArray(master.asin, asinCodes));
  // Several catalog rows can share an ASIN — use the one on the project's SKU
  const byAsin = pickProductByAsin(products, await projectSkus(projectId));
  const approvedIso = current.approvedAt ? new Date(current.approvedAt).toISOString() : "";
  return NextResponse.json({
    source: "revision",
    revision: { id: current.id, revisionNumber: current.revisionNumber, approvedAt: current.approvedAt, finalVia: current.finalVia },
    asins: asinCodes.map((asin) => {
      const p = byAsin.get(asin);
      return {
        asin, productId: p?.id ?? null,
        changes: p ? changedKeys(p, content[asin]) : Object.keys(content[asin]),
        drift: p && approvedIso ? findDrift(p.changeLog, content[asin], approvedIso) : [],
      };
    }),
  });
}

// ── POST: Execute migration ───────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: projectId } = await params;
  const startTime = Date.now();

  // Load project
  const [project] = await db.select({
    id: seoProjects.id,
    name: seoProjects.name,
    brandName: seoProjects.brandName,
    clientIdCode: seoProjects.clientIdCode,
  }).from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.clientIdCode) return NextResponse.json({ error: "Project has no client" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { confirmDrift?: boolean; override?: { reason?: string } };
  const current = await currentApprovedRevision(projectId);
  let contentByAsin: Record<string, Record<string, string>>;
  let overrideReason: string | null = null;
  if (current) {
    contentByAsin = current.content as Record<string, Record<string, string>>;
  } else if (body.override) {
    if (!hasSuperPowers(session.user.role)) return NextResponse.json({ error: "Only an Owner or Super Admin can push without review" }, { status: 403 });
    overrideReason = body.override.reason?.trim() || null;
    if (!overrideReason) return NextResponse.json({ error: "A reason is required to push without review" }, { status: 400 });
    const asinRows = await db.select({ asin: seoAsins.asin, generatedContent: seoAsins.generatedContent }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
    contentByAsin = Object.fromEntries(asinRows.map((a) => [a.asin, snapshotFields(a.generatedContent)]).filter(([, f]) => Object.keys(f as object).length > 0));
  } else {
    return NextResponse.json({ error: "Needs an approved revision" }, { status: 409 });
  }

  const asinCodes = Object.keys(contentByAsin);
  if (asinCodes.length === 0) return NextResponse.json({ error: "No content to push" }, { status: 400 });
  const products = await db.select({
    id: master.id, asin: master.asin, sku: master.sku, clientIdCode: master.clientIdCode,
    itemName: master.itemName, itemHighlight: master.itemHighlight, genericKeywords: master.genericKeywords,
    contentSeo: master.contentSeo, rawColumnValues: master.rawColumnValues, changeLog: master.changeLog,
  }).from(master).where(project.clientIdCode ? and(inArray(master.asin, asinCodes), eq(master.clientIdCode, project.clientIdCode)) : inArray(master.asin, asinCodes));
  // Several catalog rows can share an ASIN — push only to the one on the project's SKU
  const productByAsin = pickProductByAsin(products, await projectSkus(projectId));

  const approvedIso = current?.approvedAt ? new Date(current.approvedAt).toISOString() : null;
  const driftFound = approvedIso
    ? asinCodes.flatMap((asin) => {
        const p = productByAsin.get(asin);
        return p ? findDrift(p.changeLog, contentByAsin[asin], approvedIso).map((d) => ({ asin, ...d })) : [];
      })
    : [];
  if (driftFound.length && !body.confirmDrift) {
    return NextResponse.json({ error: "Edited in the catalog after approval — confirm to overwrite", drift: driftFound }, { status: 409 });
  }

  const userEmail = session.user.email || "system";
  const nowIso = new Date().toISOString();
  const label = current
    ? `SEO ${project.name} r${current.revisionNumber} (${current.finalVia === "client" ? "approved by client" : "AM final"}, ${nowIso.slice(0, 10)})`
    : `SEO ${project.name} (pushed without review: ${overrideReason})`;
  let migratedCount = 0;
  let fieldsUpdated = 0;
  const unmatchedAsins: string[] = [];

  for (const asin of asinCodes) {
    const product = productByAsin.get(asin);
    if (!product) { unmatchedAsins.push(asin); continue; }
    const { updates, fieldsChanged } = buildPushUpdate(product, contentByAsin[asin], userEmail, nowIso);
    if (fieldsChanged === 0) continue;
    await db.transaction(async (tx) => {
      await tx.update(master).set(updates).where(eq(master.id, product.id));
      await tx.insert(activityLog).values({
        productId: product.id, asin: product.asin, sku: product.sku, clientIdCode: product.clientIdCode,
        itemName: (updates.itemName as string) || product.itemName,
        fieldLabel: label, bqName: "SEO_MIGRATION", oldValue: null, newValue: `${fieldsChanged} fields migrated`,
        changedBy: userEmail, editType: "single",
      });
      await recordPushes([{ revisionId: current?.id ?? null, projectId, productId: product.id, pushedBy: userEmail, overrideReason }], tx);
    });
    migratedCount++;
    fieldsUpdated += fieldsChanged;
  }

  logEvent({
    userEmail,
    userName: session.user?.name,
    section: "seo",
    action: "migrate-to-products",
    status: "success",
    resourceLabel: project.brandName,
    message: `Migrated ${fieldsUpdated} fields across ${migratedCount} products from ${project.name}`,
    detail: {
      projectId,
      projectName: project.name,
      migratedCount,
      fieldsUpdated,
      unmatchedAsins,
      revisionId: current?.id ?? null,
      override: overrideReason,
      drift: driftFound,
    },
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({
    success: true,
    migratedCount,
    fieldsUpdated,
    unmatchedAsins,
    totalAsins: asinCodes.length,
  });
}
