import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, asanaTasks } from "@/lib/db/schema";

/**
 * Team calendars built from Asana: tasks of one 1o8 team (service tag from
 * the "1o8 | Internal … Team" project) placed on their Go Live Date.
 *   Email      → Email → Send dates
 *   Paid Media → Paid Media → Campaign calendar
 *   Web Dev    → Web → Launch calendar
 */
export const TASK_CALENDAR_TAGS = ["Email", "Paid Media", "Web Dev"] as const;
export type TaskCalendarTag = (typeof TASK_CALENDAR_TAGS)[number];
export const isTaskCalendarTag = (v: unknown): v is TaskCalendarTag => TASK_CALENDAR_TAGS.includes(v as TaskCalendarTag);

export type CalendarTask = {
  gid: string;
  name: string;
  clientIdCode: string | null;
  clientName: string | null;
  goLiveDate: string | null;
  dueOn: string | null;
  completed: boolean;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  url: string;
};

const columns = {
  gid: asanaTasks.gid,
  name: asanaTasks.name,
  clientIdCode: asanaTasks.clientIdCode,
  clientName: aac.clientName,
  goLiveDate: asanaTasks.goLiveDate,
  dueOn: asanaTasks.dueOn,
  completed: asanaTasks.completed,
  status: asanaTasks.taskStatus,
  priority: asanaTasks.priority,
  assignee: asanaTasks.assigneeName,
  url: asanaTasks.permalinkUrl,
};

/** Tasks whose Go Live Date falls in the range, plus open ones with no Go Live Date yet. */
export async function listTaskCalendar(
  tag: TaskCalendarTag,
  from: string,
  to: string,
): Promise<{ scheduled: CalendarTask[]; unscheduled: CalendarTask[] }> {
  const inTeam = sql`${tag} = any(${asanaTasks.serviceTags})`;
  const [scheduled, unscheduled] = await Promise.all([
    db
      .select(columns)
      .from(asanaTasks)
      .leftJoin(aac, eq(aac.clientIdCode, asanaTasks.clientIdCode))
      .where(and(inTeam, gte(asanaTasks.goLiveDate, from), lte(asanaTasks.goLiveDate, to)))
      .orderBy(asc(asanaTasks.goLiveDate), asc(asanaTasks.clientIdCode), asc(asanaTasks.name)),
    db
      .select(columns)
      .from(asanaTasks)
      .leftJoin(aac, eq(aac.clientIdCode, asanaTasks.clientIdCode))
      .where(and(inTeam, isNull(asanaTasks.goLiveDate), eq(asanaTasks.completed, false)))
      .orderBy(asc(asanaTasks.dueOn), asc(asanaTasks.clientIdCode)),
  ]);
  return { scheduled, unscheduled };
}
