/**
 * Pure go-live / deprecation rules for the SEO ↔ PPC status page (spec §4).
 * Live state is per (project, ASIN); one live project per ASIN.
 */
export type AsinLiveStatus = "live" | "deprecated";

export interface AsinLiveRow {
  projectId: string;
  asin: string;
  status: AsinLiveStatus;
  liveDate: string;
  deprecatedDate: string | null;
  deprecatedByProjectId: string | null;
  versionNumber: number;
}

export function parseVersionFromName(name: string): number | null {
  const m = /_v(\d+)$/i.exec(name.trim());
  return m ? Number(m[1]) : null;
}

export interface GoLivePlan {
  upserts: AsinLiveRow[];
  deprecations: Array<{ projectId: string; asin: string; deprecatedDate: string; deprecatedByProjectId: string }>;
}

export function planGoLive(existing: AsinLiveRow[], projectId: string, asins: string[], liveDate: string, versionNumber: number): GoLivePlan {
  const plan: GoLivePlan = { upserts: [], deprecations: [] };
  for (const asin of new Set(asins)) {
    for (const r of existing) {
      if (r.asin === asin && r.projectId !== projectId && r.status === "live") {
        plan.deprecations.push({ projectId: r.projectId, asin, deprecatedDate: liveDate, deprecatedByProjectId: projectId });
      }
    }
    plan.upserts.push({ projectId, asin, status: "live", liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber });
  }
  return plan;
}

export interface NotLivePlan {
  deletes: Array<{ projectId: string; asin: string }>;
  restores: Array<{ projectId: string; asin: string }>;
}

export function planNotLive(existing: AsinLiveRow[], projectId: string, asins: string[]): NotLivePlan {
  const plan: NotLivePlan = { deletes: [], restores: [] };
  for (const asin of new Set(asins)) {
    const own = existing.find((r) => r.asin === asin && r.projectId === projectId);
    if (!own) continue;
    plan.deletes.push({ projectId, asin });
    // Only a project that is live right now can hand the ASIN back; if it was
    // itself deprecated by a newer project, that newer project stays live.
    if (own.status !== "live") continue;
    // Multiple prior rows can carry deprecatedByProjectId === projectId (P may
    // have deprecated several projects across successive go-lives on this
    // ASIN). Only ONE row may become live again — the partial unique index
    // allows a single live row per (client, asin) — so restore only the most
    // recently deprecated one; a tie keeps whichever is found first.
    let best: AsinLiveRow | null = null;
    for (const r of existing) {
      if (r.asin === asin && r.status === "deprecated" && r.deprecatedByProjectId === projectId) {
        if (!best || (r.deprecatedDate ?? "") > (best.deprecatedDate ?? "")) best = r;
      }
    }
    if (best) plan.restores.push({ projectId: best.projectId, asin });
  }
  return plan;
}

export function deriveProjectStatus(rows: Array<{ status: AsinLiveStatus }>): "live" | "deprecated" | "completed" {
  if (rows.some((r) => r.status === "live")) return "live";
  if (rows.length > 0) return "deprecated";
  return "completed";
}

export function affectedProjectIds(plan: GoLivePlan | NotLivePlan, projectId: string): string[] {
  const ids = new Set<string>([projectId]);
  if ("deprecations" in plan) for (const d of plan.deprecations) ids.add(d.projectId);
  if ("restores" in plan) for (const r of plan.restores) ids.add(r.projectId);
  return [...ids];
}
