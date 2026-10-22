// src/lib/seo/revision-db.ts
import { db } from "@/lib/db";
import { aac, seoAsins, seoProjects, seoRevisions, seoRevisionEvents, seoRevisionComments, seoRevisionPushes } from "@/lib/db/schema";
import type { SeoRevision, SeoRevisionComment, SeoRevisionEvent } from "@/lib/db/schema";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { nextStatus, type RevisionAction, type RevisionStep } from "./revision-rules";
import { snapshotFields, type RevisionContent } from "./revision-fields";
import { parseEditNote, sameContent } from "./revision-edit";

export class RevisionConflictError extends Error {}
export class RevisionInputError extends Error {}

function pgCode(e: unknown): string | undefined {
  const cause = (e as { cause?: { code?: string } })?.cause;
  return cause?.code ?? (e as { code?: string })?.code;
}

/** S6's current text as a revision would snapshot it. */
export async function s6Snapshot(projectId: string): Promise<RevisionContent> {
  const rows = await db.select({ asin: seoAsins.asin, generatedContent: seoAsins.generatedContent }).from(seoAsins).where(eq(seoAsins.projectId, projectId));
  const content: RevisionContent = {};
  for (const r of rows) {
    const fields = snapshotFields(r.generatedContent);
    if (Object.keys(fields).length > 0) content[r.asin] = fields;
  }
  return content;
}

export async function submitRevision(projectId: string, author: { email: string; name: string | null }): Promise<SeoRevision> {
  const content = await s6Snapshot(projectId);
  if (Object.keys(content).length === 0) throw new RevisionInputError("No S6 content to submit");
  try {
    return await db.transaction(async (tx) => {
      // Nothing changed since the approved revision → no new review round (prevents duplicate r2s)
      const [cur] = (await tx.select({ n: seoRevisions.revisionNumber, content: seoRevisions.content }).from(seoRevisions)
        .where(and(eq(seoRevisions.projectId, projectId), eq(seoRevisions.isCurrent, true)))) as Array<{ n: number; content: RevisionContent | null }>;
      if (cur?.content && sameContent(content, cur.content)) throw new RevisionInputError(`No changes since r${cur.n} — nothing to review`);
      const [{ n }] = (await tx.select({ n: max(seoRevisions.revisionNumber) }).from(seoRevisions).where(eq(seoRevisions.projectId, projectId))) as Array<{ n: number | null }>;
      const [rev] = await tx.insert(seoRevisions).values({
        projectId, revisionNumber: (n ?? 0) + 1, status: "pm_review", content,
        submittedByEmail: author.email, submittedByName: author.name,
      }).returning();
      await tx.insert(seoRevisionEvents).values({ revisionId: rev.id, step: "submit", action: "submit", actorEmail: author.email, actorName: author.name, actedAs: "author", note: null });
      return rev;
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new RevisionConflictError("A revision of this project is still in review");
    throw e;
  }
}

export async function decideRevision(p: {
  revisionId: string; projectId: string; expectedStatus: string; action: RevisionAction; step: RevisionStep;
  actor: { email: string; name: string | null }; actedAs: "assigned" | "override" | "client"; note: string | null;
}): Promise<SeoRevision> {
  const next = nextStatus(p.expectedStatus, p.action);
  if (!next) throw new RevisionInputError(`Cannot ${p.action} a revision in ${p.expectedStatus}`);
  return db.transaction(async (tx) => {
    const set: Record<string, unknown> = { status: next, updatedAt: new Date() };
    if (next === "approved") {
      // An Owner/Super Admin override at the client step is NOT a client approval.
      const viaClient = p.step === "client" && p.actedAs === "client";
      await tx.update(seoRevisions).set({ isCurrent: false }).where(and(eq(seoRevisions.projectId, p.projectId), eq(seoRevisions.isCurrent, true)));
      Object.assign(set, { isCurrent: true, approvedAt: new Date(), finalVia: viaClient ? "client" : "am_final", finalReason: viaClient ? null : p.note });
    }
    const updated = await tx.update(seoRevisions).set(set).where(and(eq(seoRevisions.id, p.revisionId), eq(seoRevisions.status, p.expectedStatus))).returning();
    if (updated.length === 0) throw new RevisionConflictError("Already decided — reload");
    await tx.insert(seoRevisionEvents).values({ revisionId: p.revisionId, step: p.step, action: p.action, actorEmail: p.actor.email, actorName: p.actor.name, actedAs: p.actedAs, note: p.note });
    return updated[0] as SeoRevision;
  });
}

export async function listRevisions(projectId: string): Promise<SeoRevision[]> {
  return db.select().from(seoRevisions).where(eq(seoRevisions.projectId, projectId)).orderBy(desc(seoRevisions.revisionNumber));
}

export async function getRevisionWithProject(revisionId: string) {
  const [row] = await db
    .select({ revision: seoRevisions, project: { id: seoProjects.id, name: seoProjects.name, clientIdCode: seoProjects.clientIdCode, clientName: aac.clientName } })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    // Current client name (aac.client_id_code is unique) — the PDP store line shows it
    .leftJoin(aac, eq(aac.clientIdCode, seoProjects.clientIdCode))
    .where(eq(seoRevisions.id, revisionId));
  return row ?? null;
}

export async function listEvents(revisionId: string): Promise<SeoRevisionEvent[]> {
  return db.select().from(seoRevisionEvents).where(eq(seoRevisionEvents.revisionId, revisionId)).orderBy(asc(seoRevisionEvents.createdAt));
}

export async function listComments(revisionId: string): Promise<SeoRevisionComment[]> {
  return db.select().from(seoRevisionComments).where(eq(seoRevisionComments.revisionId, revisionId)).orderBy(asc(seoRevisionComments.createdAt));
}

export async function addComment(c: {
  revisionId: string; asin: string; fieldKey: string; parentCommentId: string | null; audience: "internal" | "client";
  authorEmail: string; authorName: string | null; body: string;
}): Promise<SeoRevisionComment> {
  const [row] = await db.insert(seoRevisionComments).values(c).returning();
  return row;
}

export async function setCommentResolved(commentId: string, revisionId: string, resolvedBy: string | null): Promise<void> {
  await db.update(seoRevisionComments)
    .set({ resolvedBy, resolvedAt: resolvedBy ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(seoRevisionComments.id, commentId), eq(seoRevisionComments.revisionId, revisionId)));
}

export async function listOpenCommentsOfPrevious(projectId: string, revisionNumber: number): Promise<SeoRevisionComment[]> {
  if (revisionNumber <= 1) return [];
  const [prev] = await db.select({ id: seoRevisions.id }).from(seoRevisions)
    .where(and(eq(seoRevisions.projectId, projectId), eq(seoRevisions.revisionNumber, revisionNumber - 1)));
  if (!prev) return [];
  const rows = await listComments(prev.id);
  // Edit notes are a log, not open questions — never carried over
  return rows.filter((c) => !c.resolvedAt && !parseEditNote(c.body));
}

export async function currentApprovedRevision(projectId: string): Promise<SeoRevision | null> {
  const [row] = await db.select().from(seoRevisions).where(and(eq(seoRevisions.projectId, projectId), eq(seoRevisions.isCurrent, true)));
  return row ?? null;
}

/** True once any S8 push was recorded for the project (with or without a reviewed revision). */
export async function projectWasPushed(projectId: string): Promise<boolean> {
  const rows = await db.select({ id: seoRevisionPushes.id }).from(seoRevisionPushes).where(eq(seoRevisionPushes.projectId, projectId)).limit(1);
  return rows.length > 0;
}

export async function recordPushes(rows: Array<{ revisionId: string | null; projectId: string; productId: string; pushedBy: string; overrideReason: string | null }>, exec: Pick<typeof db, "insert"> = db): Promise<void> {
  if (rows.length) await exec.insert(seoRevisionPushes).values(rows);
}
