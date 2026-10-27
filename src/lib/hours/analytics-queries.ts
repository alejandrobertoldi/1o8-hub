import { db } from "@/lib/db";
import { timeLogs, users } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { INTERNAL_CLIENT_CODE } from "@/lib/my-dashboard/asana-map";

/**
 * Hours Analytics (MarketFoundry's Admin Hours dashboard) over 1o8's time
 * logs — what My Timesheet writes. MF's version read `time_entries` (clock
 * in/out + category); here the category is the log's department, there is
 * no start/end clock, and 1o8's own time (client code "1O8") is reported as
 * "INTERNAL", the code the dashboard uses for the agency's own hours.
 */

const DASHBOARD_INTERNAL = "INTERNAL";

/** Client code as the dashboard sees it. */
const clientCode = sql<string>`case when ${timeLogs.clientIdCode} = ${INTERNAL_CLIENT_CODE} then ${DASHBOARD_INTERNAL} else ${timeLogs.clientIdCode} end`;
const toLogCode = (code: string) => (code === DASHBOARD_INTERNAL ? INTERNAL_CLIENT_CODE : code);

/** Comments column: project, then the note. */
const noteText = sql<string | null>`nullif(concat_ws(' — ', nullif(${timeLogs.projectName}, ''), nullif(${timeLogs.note}, '')), '')`;

function filters(opts: {
  from?: string;
  to?: string;
  entryDate?: string;
  userIds?: string[];
  clientIdCodes?: string[];
  categories?: string[];
}): SQL | undefined {
  const { from, to, entryDate, userIds, clientIdCodes, categories } = opts;
  return and(
    from ? gte(timeLogs.entryDate, from) : undefined,
    to ? lte(timeLogs.entryDate, to) : undefined,
    entryDate ? eq(timeLogs.entryDate, entryDate) : undefined,
    userIds?.length ? inArray(timeLogs.userId, userIds) : undefined,
    clientIdCodes?.length ? inArray(timeLogs.clientIdCode, clientIdCodes.map(toLogCode)) : undefined,
    categories?.length ? inArray(timeLogs.department, categories) : undefined,
  );
}

export function summaryRows(from: string, to: string, categories?: string[]) {
  return db
    .select({
      userId: timeLogs.userId,
      userName: users.name,
      userEmail: users.email,
      clientIdCode: clientCode,
      totalHours: sql<string>`sum(${timeLogs.hours})`,
    })
    .from(timeLogs)
    .innerJoin(users, eq(users.id, timeLogs.userId))
    .where(filters({ from, to, categories }))
    .groupBy(timeLogs.userId, users.name, users.email, timeLogs.clientIdCode);
}

/** 1o8's own hours grouped by member × department. */
export function internalBreakdownRows(from: string, to: string, categories?: string[]) {
  return db
    .select({
      userId: timeLogs.userId,
      userName: users.name,
      userEmail: users.email,
      category: timeLogs.department,
      totalHours: sql<string>`sum(${timeLogs.hours})`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeLogs)
    .innerJoin(users, eq(users.id, timeLogs.userId))
    .where(and(eq(timeLogs.clientIdCode, INTERNAL_CLIENT_CODE), filters({ from, to, categories })))
    .groupBy(timeLogs.userId, users.name, users.email, timeLogs.department);
}

export function categoriesInRange(from: string, to: string) {
  return db
    .selectDistinct({ category: timeLogs.department })
    .from(timeLogs)
    .where(filters({ from, to }))
    .orderBy(asc(timeLogs.department));
}

export function drillDays(from: string, to: string, userId: string, clientIdCode: string, categories?: string[]) {
  return db
    .select({
      entryDate: timeLogs.entryDate,
      hours: sql<string>`sum(${timeLogs.hours})`,
    })
    .from(timeLogs)
    .where(filters({ from, to, userIds: [userId], clientIdCodes: [clientIdCode], categories }))
    .groupBy(timeLogs.entryDate)
    .orderBy(asc(timeLogs.entryDate));
}

export function summaryByDay(from: string, to: string, dimension: "member" | "client", categories?: string[]) {
  if (dimension === "client") {
    return db
      .select({
        key: clientCode,
        keyName: sql<string | null>`${clientCode}`,
        entryDate: timeLogs.entryDate,
        totalHours: sql<string>`sum(${timeLogs.hours})`,
      })
      .from(timeLogs)
      .where(filters({ from, to, categories }))
      .groupBy(timeLogs.clientIdCode, timeLogs.entryDate)
      .orderBy(asc(timeLogs.entryDate));
  }
  return db
    .select({
      key: timeLogs.userId,
      keyName: users.name,
      entryDate: timeLogs.entryDate,
      totalHours: sql<string>`sum(${timeLogs.hours})`,
    })
    .from(timeLogs)
    .innerJoin(users, eq(users.id, timeLogs.userId))
    .where(filters({ from, to, categories }))
    .groupBy(timeLogs.userId, users.name, timeLogs.entryDate)
    .orderBy(asc(timeLogs.entryDate));
}

const entryColumns = {
  id: timeLogs.id,
  entryDate: timeLogs.entryDate,
  startTime: sql<string>`''`,
  endTime: sql<string>`''`,
  hours: timeLogs.hours,
  note: noteText,
  category: timeLogs.department,
  clientIdCode: clientCode,
  userId: timeLogs.userId,
  userName: users.name,
  userEmail: users.email,
};

/** All logs for a single day, optionally scoped to a member and/or client. */
export function drillDayEntries(opts: { entryDate: string; userId?: string; clientIdCode?: string; categories?: string[] }) {
  const { entryDate, userId, clientIdCode, categories } = opts;
  return db
    .select(entryColumns)
    .from(timeLogs)
    .innerJoin(users, eq(timeLogs.userId, users.id))
    .where(
      filters({
        entryDate,
        userIds: userId ? [userId] : undefined,
        clientIdCodes: clientIdCode ? [clientIdCode] : undefined,
        categories,
      }),
    )
    .orderBy(asc(users.name), asc(timeLogs.clientIdCode), asc(timeLogs.createdAt));
}

/** Chronological logs across a date range, optionally scoped to a member and/or client. */
export function drillRangeEntries(opts: { from: string; to: string; userId?: string; clientIdCode?: string; categories?: string[] }) {
  const { from, to, userId, clientIdCode, categories } = opts;
  return db
    .select(entryColumns)
    .from(timeLogs)
    .innerJoin(users, eq(timeLogs.userId, users.id))
    .where(
      filters({
        from,
        to,
        userIds: userId ? [userId] : undefined,
        clientIdCodes: clientIdCode ? [clientIdCode] : undefined,
        categories,
      }),
    )
    .orderBy(asc(timeLogs.entryDate), asc(users.name), asc(timeLogs.createdAt));
}

/** Every log in range matching the dashboard filters (empty list = no filter). */
export function adminExportEntries(opts: { from: string; to: string; userIds?: string[]; clientIdCodes?: string[]; categories?: string[] }) {
  return db
    .select({
      entryDate: timeLogs.entryDate,
      hours: timeLogs.hours,
      clientIdCode: clientCode,
      department: timeLogs.department,
      projectNumber: timeLogs.projectNumber,
      projectName: timeLogs.projectName,
      billingType: timeLogs.billingType,
      note: timeLogs.note,
      userName: users.name,
      userEmail: users.email,
    })
    .from(timeLogs)
    .innerJoin(users, eq(timeLogs.userId, users.id))
    .where(filters(opts))
    .orderBy(asc(users.name), asc(timeLogs.entryDate), asc(timeLogs.createdAt));
}
