// Team column ("phase trail") for many projects with a fixed number of queries: the review shown per
// project (open > current approved > newest), its events, each client's PM/AM, and the latest push.
import { db } from "@/lib/db";
import { seoRevisions, seoRevisionEvents, seoRevisionPushes, users } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { phaseTrail, type TrailEvent, type TrailRow } from "./phase-trail";
import { loadApproversForClients } from "./revision-approvers";

type Stamp = Date | string | null;
export interface TrailProject {
  id: string; clientIdCode: string | null; assigneeName: string | null;
  s1ApprovedAt: Stamp; s2ApprovedAt: Stamp; s3ApprovedAt: Stamp; s4ApprovedAt: Stamp; s5ApprovedAt: Stamp; s6ApprovedAt: Stamp;
}

const OPEN = new Set(["pm_review", "am_review", "client_review"]);
const iso = (d: Stamp) => (d ? new Date(d).toISOString() : null);

export async function loadProjectTrails(projects: TrailProject[]): Promise<Map<string, TrailRow[]>> {
  const ids = projects.map((p) => p.id);
  const out = new Map<string, TrailRow[]>();
  if (!ids.length) return out;
  const [revs, pushes, approvers] = await Promise.all([
    db.select({ id: seoRevisions.id, projectId: seoRevisions.projectId, status: seoRevisions.status, isCurrent: seoRevisions.isCurrent, n: seoRevisions.revisionNumber })
      .from(seoRevisions).where(inArray(seoRevisions.projectId, ids)),
    db.select({ projectId: seoRevisionPushes.projectId, by: seoRevisionPushes.pushedBy, at: seoRevisionPushes.createdAt, name: users.name })
      .from(seoRevisionPushes).leftJoin(users, eq(users.email, seoRevisionPushes.pushedBy))
      .where(inArray(seoRevisionPushes.projectId, ids)).orderBy(desc(seoRevisionPushes.createdAt)),
    loadApproversForClients(projects.map((p) => p.clientIdCode ?? "")),
  ]);
  const pick = new Map<string, { id: string; status: string }>();
  for (const id of ids) {
    const mine = revs.filter((r) => r.projectId === id).sort((a, b) => b.n - a.n);
    const r = mine.find((x) => OPEN.has(x.status)) ?? mine.find((x) => x.isCurrent) ?? mine[0];
    if (r) pick.set(id, { id: r.id, status: r.status });
  }
  const lastPush = new Map<string, { by: string; at: string }>();
  for (const ps of pushes) if (!lastPush.has(ps.projectId)) lastPush.set(ps.projectId, { by: ps.name ?? ps.by, at: new Date(ps.at).toISOString() });
  const events = new Map<string, TrailEvent[]>();
  const revIds = [...pick.values()].map((r) => r.id);
  if (revIds.length) {
    const evs = await db.select({ revisionId: seoRevisionEvents.revisionId, step: seoRevisionEvents.step, action: seoRevisionEvents.action, actorName: seoRevisionEvents.actorName, createdAt: seoRevisionEvents.createdAt })
      .from(seoRevisionEvents).where(inArray(seoRevisionEvents.revisionId, revIds)).orderBy(seoRevisionEvents.createdAt);
    for (const e of evs) {
      const list = events.get(e.revisionId) ?? [];
      list.push({ step: e.step, action: e.action, actorName: e.actorName, createdAt: new Date(e.createdAt).toISOString() });
      events.set(e.revisionId, list);
    }
  }
  for (const p of projects) {
    const rev = pick.get(p.id);
    out.set(p.id, phaseTrail({
      assigneeName: p.assigneeName,
      approvedAt: { S1: iso(p.s1ApprovedAt), S2: iso(p.s2ApprovedAt), S3: iso(p.s3ApprovedAt), S4: iso(p.s4ApprovedAt), S5: iso(p.s5ApprovedAt), S6: iso(p.s6ApprovedAt) },
      revision: rev ? { status: rev.status, events: events.get(rev.id) ?? [] } : null,
      approvers: (p.clientIdCode && approvers.get(p.clientIdCode)) || { pm: null, am: null },
      push: lastPush.get(p.id) ?? null,
    }));
  }
  return out;
}
