import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeOffSyncRuns } from "@/lib/db/schema";
import { gustoConfigured, gustoConnection } from "@/lib/gusto/client";
import { importFromGusto, type GustoImportReport } from "@/lib/gusto/sync";
import { addDaysIso } from "./calendar-events";
import { pullTeamCalendar, reconcileTimeOffEvents, teamCalendarConfigured } from "./team-calendar";

export type TimeOffSyncReport = {
  gusto: GustoImportReport | { skipped: string };
  calendarPush: { published: number; removed: number } | { skipped: string };
  calendarPull: { events: number; matched: number } | { skipped: string };
};

/**
 * Gusto → hub, hub → shared calendar, shared calendar → hub, in that order
 * (so time off imported from Gusto is published in the same run). Each part
 * is skipped while it isn't configured; a failing part doesn't stop the rest.
 */
export async function syncTimeOff(trigger: string): Promise<TimeOffSyncReport> {
  const [run] = await db.insert(timeOffSyncRuns).values({ trigger }).returning({ id: timeOffSyncRuns.id });
  const today = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  const attempt = async <T>(label: string, ready: boolean, why: string, fn: () => Promise<T>): Promise<T | { skipped: string }> => {
    if (!ready) return { skipped: why };
    try {
      return await fn();
    } catch (err) {
      // Drizzle wraps the database's own message in `cause`; that's the useful part.
      const cause = (err as { cause?: { message?: string } })?.cause?.message;
      const msg = cause ?? (err instanceof Error ? err.message : String(err));
      errors.push(`${label}: ${msg}`);
      return { skipped: msg };
    }
  };

  const report: TimeOffSyncReport = {
    gusto: await attempt("Gusto", gustoConfigured() && !!(await gustoConnection()), "Gusto isn't connected", importFromGusto),
    calendarPush: await attempt("Calendar publish", teamCalendarConfigured(), "Shared calendar isn't configured", () => reconcileTimeOffEvents(today)),
    calendarPull: await attempt("Calendar read", teamCalendarConfigured(), "Shared calendar isn't configured", () =>
      pullTeamCalendar(addDaysIso(today, -60), addDaysIso(today, 365)),
    ),
  };
  await db
    .update(timeOffSyncRuns)
    .set({ finishedAt: new Date(), report, error: errors.length ? errors.join(" · ") : null })
    .where(eq(timeOffSyncRuns.id, run.id));
  return report;
}

export function lastTimeOffRuns(limit = 10) {
  return db.select().from(timeOffSyncRuns).orderBy(desc(timeOffSyncRuns.startedAt)).limit(limit);
}
