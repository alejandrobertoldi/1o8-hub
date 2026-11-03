import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { newBusinessOpportunities, newBusinessStageHistory, timeLogs, users } from "@/lib/db/schema";
import { ASANA_COMPLETED_WINDOW_DAYS } from "@/lib/my-dashboard/asana-map";
import { INTERNAL_CLIENT_CODE } from "@/lib/time-logs/catalog";
import {
  isClosedStage,
  pitchProjectNumber,
  type DealType,
  type OpportunityView,
  type StageId,
  opportunitySchema,
} from ".";

type OpportunityValues = ReturnType<typeof opportunitySchema.parse>;

/** Every opportunity, newest first, with its owner and the hours logged to its pitch number. */
export async function listOpportunities(): Promise<OpportunityView[]> {
  const [rows, hours] = await Promise.all([
    db
      .select({ o: newBusinessOpportunities, ownerName: users.name, ownerEmail: users.email })
      .from(newBusinessOpportunities)
      .leftJoin(users, eq(users.id, newBusinessOpportunities.ownerId))
      .orderBy(desc(newBusinessOpportunities.createdAt)),
    db
      .select({
        projectNumber: timeLogs.projectNumber,
        hours: sql<string>`sum(${timeLogs.hours})`,
        people: sql<number>`count(distinct ${timeLogs.userId})::int`,
      })
      .from(timeLogs)
      .where(and(eq(timeLogs.clientIdCode, INTERNAL_CLIENT_CODE), sql`${timeLogs.projectNumber} like '1O87%'`))
      .groupBy(timeLogs.projectNumber),
  ]);
  const byNumber = new Map(hours.map((h) => [h.projectNumber, h]));
  return rows.map(({ o, ownerName, ownerEmail }) => {
    const projectNumber = pitchProjectNumber(o.seq);
    const h = byNumber.get(projectNumber);
    return {
      id: o.id,
      seq: o.seq,
      projectNumber,
      prospectName: o.prospectName,
      website: o.website,
      contactName: o.contactName,
      contactEmail: o.contactEmail,
      ownerId: o.ownerId,
      ownerName: ownerName ?? ownerEmail ?? null,
      source: o.source,
      services: o.services,
      dealType: o.dealType as DealType,
      value: o.value == null ? null : Number(o.value),
      stage: o.stage as StageId,
      stageChangedAt: o.stageChangedAt.toISOString(),
      nextStep: o.nextStep,
      nextStepDate: o.nextStepDate,
      asanaUrl: o.asanaUrl,
      notes: o.notes,
      lostReason: o.lostReason,
      closedAt: o.closedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      hours: h ? Number(h.hours) : 0,
      people: h?.people ?? 0,
    };
  });
}

/** New opportunity with the next pitch number; its first stage goes into the history. */
export async function createOpportunity(values: OpportunityValues, actorId: string) {
  return db.transaction(async (tx) => {
    // Serialises numbering so two people adding a pitch at once can't get the same number.
    await tx.execute(sql`lock table ${newBusinessOpportunities} in share row exclusive mode`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${newBusinessOpportunities.seq}), 0)::int + 1` })
      .from(newBusinessOpportunities);
    const now = new Date();
    const [row] = await tx
      .insert(newBusinessOpportunities)
      .values({
        ...values,
        value: values.value == null ? null : String(values.value),
        seq: next,
        stageChangedAt: now,
        closedAt: isClosedStage(values.stage) ? now : null,
        createdBy: actorId,
      })
      .returning();
    await tx.insert(newBusinessStageHistory).values({ opportunityId: row.id, stage: row.stage, enteredAt: now, changedBy: actorId });
    return row;
  });
}

/** Edits any subset of fields; a stage change is stamped and added to the history. */
export async function updateOpportunity(id: string, set: Partial<OpportunityValues>, actorId: string) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(newBusinessOpportunities).where(eq(newBusinessOpportunities.id, id)).limit(1);
    if (!current) return null;
    const now = new Date();
    const stageChanged = set.stage !== undefined && set.stage !== current.stage;
    const { value, ...rest } = set;
    const [row] = await tx
      .update(newBusinessOpportunities)
      .set({
        ...rest,
        ...(value !== undefined ? { value: value == null ? null : String(value) } : {}),
        ...(stageChanged ? { stageChangedAt: now, closedAt: isClosedStage(set.stage!) ? now : null } : {}),
        updatedAt: now,
      })
      .where(eq(newBusinessOpportunities.id, id))
      .returning();
    if (stageChanged) await tx.insert(newBusinessStageHistory).values({ opportunityId: id, stage: set.stage!, enteredAt: now, changedBy: actorId });
    return row;
  });
}

/**
 * Pitches anyone can log hours to under the 1O8 client: every one not won or
 * lost, plus those closed in the last 14 days (the window Asana tasks use).
 */
export async function listPitchProjects() {
  const cutoff = new Date(Date.now() - ASANA_COMPLETED_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ seq: newBusinessOpportunities.seq, name: newBusinessOpportunities.prospectName, closedAt: newBusinessOpportunities.closedAt })
    .from(newBusinessOpportunities)
    .where(or(isNull(newBusinessOpportunities.closedAt), gte(newBusinessOpportunities.closedAt, cutoff)))
    .orderBy(newBusinessOpportunities.seq);
  return rows.map((r) => ({
    projectNumber: pitchProjectNumber(r.seq),
    name: `Pitch – ${r.name}`,
    asanaTaskGid: null,
    status: r.closedAt ? ("Completed" as const) : ("Open" as const),
    assignee: null,
    url: null,
  }));
}
