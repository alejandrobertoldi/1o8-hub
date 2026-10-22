import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoProjectAsinLive, seoProjects } from "@/lib/db/schema";
import { deriveProjectStatus, type AsinLiveStatus, type GoLivePlan, type NotLivePlan } from "@/lib/seo/asin-live";

export async function getProject(id: string) {
  const [p] = await db.select({ id: seoProjects.id, name: seoProjects.name, clientIdCode: seoProjects.clientIdCode, status: seoProjects.status }).from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  return p ?? null;
}

export async function getProjectAsins(id: string): Promise<string[]> {
  const rows = await db.select({ asin: seoAsins.asin }).from(seoAsins).where(eq(seoAsins.projectId, id));
  return [...new Set(rows.map((r) => r.asin))];
}

/** Applies a go-live or not-live plan and re-derives seo_projects.status for every affected project, in one transaction. Returns the acting project's new status. */
export async function applyPlan(
  input: { clientIdCode: string; projectId: string; plan: GoLivePlan | NotLivePlan },
  affected: string[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const { plan, clientIdCode } = input;
    if ("deprecations" in plan) {
      for (const d of plan.deprecations) {
        await tx.update(seoProjectAsinLive)
          .set({ status: "deprecated", deprecatedDate: d.deprecatedDate, deprecatedByProjectId: d.deprecatedByProjectId, updatedAt: now })
          .where(and(eq(seoProjectAsinLive.projectId, d.projectId), eq(seoProjectAsinLive.asin, d.asin)));
      }
      for (const u of plan.upserts) {
        await tx.insert(seoProjectAsinLive)
          .values({ ...u, clientIdCode, updatedAt: now })
          .onConflictDoUpdate({
            target: [seoProjectAsinLive.projectId, seoProjectAsinLive.asin],
            set: { status: "live", liveDate: u.liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber: u.versionNumber, updatedAt: now },
          });
      }
    } else {
      for (const d of plan.deletes) {
        await tx.delete(seoProjectAsinLive).where(and(eq(seoProjectAsinLive.projectId, d.projectId), eq(seoProjectAsinLive.asin, d.asin)));
      }
      for (const r of plan.restores) {
        await tx.update(seoProjectAsinLive)
          .set({ status: "live", deprecatedDate: null, deprecatedByProjectId: null, updatedAt: now })
          .where(and(eq(seoProjectAsinLive.projectId, r.projectId), eq(seoProjectAsinLive.asin, r.asin)));
      }
    }
    let actingStatus = "completed";
    for (const pid of affected) {
      const rows = await tx.select({ status: seoProjectAsinLive.status }).from(seoProjectAsinLive).where(eq(seoProjectAsinLive.projectId, pid));
      const status = deriveProjectStatus(rows.map((r) => ({ status: r.status as AsinLiveStatus })));
      await tx.update(seoProjects).set({ status, updatedAt: now }).where(eq(seoProjects.id, pid));
      if (pid === input.projectId) actingStatus = status;
    }
    return actingStatus;
  });
}

export async function describeProjectAsins(projectId: string, asins: string[]) {
  const own = asins.length
    ? await db.select().from(seoProjectAsinLive).where(and(eq(seoProjectAsinLive.projectId, projectId), inArray(seoProjectAsinLive.asin, asins)))
    : [];
  const byIds = [...new Set(own.map((r) => r.deprecatedByProjectId).filter((x): x is string => !!x))];
  const names = byIds.length ? await db.select({ id: seoProjects.id, name: seoProjects.name }).from(seoProjects).where(inArray(seoProjects.id, byIds)) : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const list = asins.map((asin) => {
    const r = own.find((x) => x.asin === asin);
    return {
      asin,
      status: (r?.status ?? null) as AsinLiveStatus | null,
      liveDate: r?.liveDate ?? null,
      deprecatedDate: r?.deprecatedDate ?? null,
      deprecatedByProjectName: r?.deprecatedByProjectId ? nameOf.get(r.deprecatedByProjectId) ?? null : null,
    };
  });
  return { asins: list, liveCount: list.filter((a) => a.status === "live").length, total: list.length };
}
