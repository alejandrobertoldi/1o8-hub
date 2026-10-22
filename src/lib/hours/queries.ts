import { db } from "@/lib/db";
import { timeEntries, aac, users, hourCategories } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";

export type TimeEntryRow = typeof timeEntries.$inferSelect;

export async function clientCodeExists(code: string): Promise<boolean> {
  if (code === "INTERNAL") return true;
  const [row] = await db
    .select({ c: aac.clientIdCode })
    .from(aac)
    .where(eq(aac.clientIdCode, code))
    .limit(1);
  return Boolean(row);
}

export function listEntries(userId: string, from: string, to: string) {
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to)
      )
    )
    .orderBy(asc(timeEntries.entryDate), asc(timeEntries.startTime));
}

export function entriesOnDate(userId: string, entryDate: string, excludeId?: string) {
  const conds = [eq(timeEntries.userId, userId), eq(timeEntries.entryDate, entryDate)];
  if (excludeId) conds.push(ne(timeEntries.id, excludeId));
  return db.select().from(timeEntries).where(and(...conds));
}

export async function insertEntries(
  values: Array<{
    userId: string;
    clientIdCode: string;
    entryDate: string;
    startTime: string;
    endTime: string;
    hours: number;
    note: string | null;
    category: string | null;
  }>
): Promise<TimeEntryRow[]> {
  return db.transaction(async (tx) => {
    const rows: TimeEntryRow[] = [];
    for (const v of values) {
      const [row] = await tx
        .insert(timeEntries)
        .values({ ...v, hours: String(v.hours) })
        .returning();
      rows.push(row);
    }
    return rows;
  });
}

export async function getEntryById(id: string): Promise<TimeEntryRow | null> {
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateEntry(
  id: string,
  v: {
    clientIdCode: string;
    entryDate: string;
    startTime: string;
    endTime: string;
    hours: number;
    note: string | null;
    category: string | null;
  }
): Promise<TimeEntryRow> {
  const [row] = await db
    .update(timeEntries)
    .set({ ...v, hours: String(v.hours), updatedAt: new Date() })
    .where(eq(timeEntries.id, id))
    .returning();
  return row;
}

export async function deleteEntry(id: string): Promise<void> {
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
}

export function summaryRows(from: string, to: string, categories?: string[]) {
  return db
    .select({
      userId: timeEntries.userId,
      userName: users.name,
      userEmail: users.email,
      clientIdCode: timeEntries.clientIdCode,
      totalHours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(
      and(
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      ),
    )
    .groupBy(timeEntries.userId, users.name, users.email, timeEntries.clientIdCode);
}

/** INTERNAL (1o8) hours grouped by member × category. */
export function internalBreakdownRows(from: string, to: string, categories?: string[]) {
  return db
    .select({
      userId: timeEntries.userId,
      userName: users.name,
      userEmail: users.email,
      category: timeEntries.category,
      totalHours: sql<string>`sum(${timeEntries.hours})`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(
      and(
        eq(timeEntries.clientIdCode, "INTERNAL"),
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      ),
    )
    .groupBy(timeEntries.userId, users.name, users.email, timeEntries.category);
}

export function categoriesInRange(from: string, to: string) {
  return db
    .selectDistinct({ category: timeEntries.category })
    .from(timeEntries)
    .where(
      and(
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        isNotNull(timeEntries.category),
      ),
    )
    .orderBy(asc(timeEntries.category));
}

export function drillDays(from: string, to: string, userId: string, clientIdCode: string, categories?: string[]) {
  return db
    .select({
      entryDate: timeEntries.entryDate,
      hours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.clientIdCode, clientIdCode),
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      )
    )
    .groupBy(timeEntries.entryDate)
    .orderBy(asc(timeEntries.entryDate));
}

export function summaryByDay(
  from: string,
  to: string,
  dimension: "member" | "client",
  categories?: string[],
) {
  const catCond =
    categories && categories.length ? inArray(timeEntries.category, categories) : undefined;

  if (dimension === "client") {
    return db
      .select({
        key: timeEntries.clientIdCode,
        keyName: sql<string | null>`${timeEntries.clientIdCode}`,
        entryDate: timeEntries.entryDate,
        totalHours: sql<string>`sum(${timeEntries.hours})`,
      })
      .from(timeEntries)
      .where(and(gte(timeEntries.entryDate, from), lte(timeEntries.entryDate, to), catCond))
      .groupBy(timeEntries.clientIdCode, timeEntries.entryDate)
      .orderBy(asc(timeEntries.entryDate));
  }

  return db
    .select({
      key: timeEntries.userId,
      keyName: users.name,
      entryDate: timeEntries.entryDate,
      totalHours: sql<string>`sum(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(gte(timeEntries.entryDate, from), lte(timeEntries.entryDate, to), catCond))
    .groupBy(timeEntries.userId, users.name, timeEntries.entryDate)
    .orderBy(asc(timeEntries.entryDate));
}

export function drillEntries(userId: string, clientIdCode: string, entryDate: string, categories?: string[]) {
  return db
    .select({
      id: timeEntries.id,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      hours: timeEntries.hours,
      note: timeEntries.note,
      category: timeEntries.category,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.clientIdCode, clientIdCode),
        eq(timeEntries.entryDate, entryDate),
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      )
    )
    .orderBy(asc(timeEntries.startTime));
}

/** All logged entries for a single day, optionally scoped to a member and/or client. */
export function drillDayEntries(opts: {
  entryDate: string;
  userId?: string;
  clientIdCode?: string;
  categories?: string[];
}) {
  const { entryDate, userId, clientIdCode, categories } = opts;
  return db
    .select({
      id: timeEntries.id,
      entryDate: timeEntries.entryDate,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      hours: timeEntries.hours,
      note: timeEntries.note,
      category: timeEntries.category,
      clientIdCode: timeEntries.clientIdCode,
      userId: timeEntries.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        eq(timeEntries.entryDate, entryDate),
        userId ? eq(timeEntries.userId, userId) : undefined,
        clientIdCode ? eq(timeEntries.clientIdCode, clientIdCode) : undefined,
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      )
    )
    .orderBy(asc(users.name), asc(timeEntries.clientIdCode), asc(timeEntries.startTime));
}

/** Chronological entries across a date range, optionally scoped to a member and/or client. */
export function drillRangeEntries(opts: {
  from: string;
  to: string;
  userId?: string;
  clientIdCode?: string;
  categories?: string[];
}) {
  const { from, to, userId, clientIdCode, categories } = opts;
  return db
    .select({
      id: timeEntries.id,
      entryDate: timeEntries.entryDate,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      hours: timeEntries.hours,
      note: timeEntries.note,
      category: timeEntries.category,
      clientIdCode: timeEntries.clientIdCode,
      userId: timeEntries.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        userId ? eq(timeEntries.userId, userId) : undefined,
        clientIdCode ? eq(timeEntries.clientIdCode, clientIdCode) : undefined,
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      )
    )
    .orderBy(asc(timeEntries.entryDate), asc(timeEntries.startTime), asc(users.name));
}

export function listActiveCategories() {
  return db
    .select({ id: hourCategories.id, name: hourCategories.name })
    .from(hourCategories)
    .where(eq(hourCategories.active, true))
    .orderBy(asc(hourCategories.sortOrder), asc(hourCategories.name));
}

export function listAllCategories() {
  return db
    .select({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    })
    .from(hourCategories)
    .orderBy(asc(hourCategories.sortOrder), asc(hourCategories.name));
}

export async function isActiveCategory(name: string): Promise<boolean> {
  const [row] = await db
    .select({ id: hourCategories.id })
    .from(hourCategories)
    .where(and(eq(hourCategories.name, name), eq(hourCategories.active, true)))
    .limit(1);
  return Boolean(row);
}

export async function insertCategory(v: { name: string; sortOrder?: number }) {
  const [row] = await db
    .insert(hourCategories)
    .values({ name: v.name, sortOrder: v.sortOrder ?? 0 })
    .returning({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    });
  return row;
}

export async function updateCategory(
  id: string,
  v: { name?: string; active?: boolean; sortOrder?: number }
) {
  const set: Partial<{ name: string; active: boolean; sortOrder: number }> = {};
  if (v.name !== undefined) set.name = v.name;
  if (v.active !== undefined) set.active = v.active;
  if (v.sortOrder !== undefined) set.sortOrder = v.sortOrder;
  const [row] = await db
    .update(hourCategories)
    .set(set)
    .where(eq(hourCategories.id, id))
    .returning({
      id: hourCategories.id,
      name: hourCategories.name,
      active: hourCategories.active,
      sortOrder: hourCategories.sortOrder,
    });
  return row;
}

/** Every entry in range matching the admin dashboard filters (empty list = no filter). */
export function adminExportEntries(opts: {
  from: string;
  to: string;
  userIds?: string[];
  clientIdCodes?: string[];
  categories?: string[];
}) {
  const { from, to, userIds, clientIdCodes, categories } = opts;
  return db
    .select({
      entryDate: timeEntries.entryDate,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      hours: timeEntries.hours,
      note: timeEntries.note,
      category: timeEntries.category,
      clientIdCode: timeEntries.clientIdCode,
      userName: users.name,
      userEmail: users.email,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(
      and(
        gte(timeEntries.entryDate, from),
        lte(timeEntries.entryDate, to),
        userIds && userIds.length ? inArray(timeEntries.userId, userIds) : undefined,
        clientIdCodes && clientIdCodes.length ? inArray(timeEntries.clientIdCode, clientIdCodes) : undefined,
        categories && categories.length ? inArray(timeEntries.category, categories) : undefined,
      )
    )
    .orderBy(asc(users.name), asc(timeEntries.entryDate), asc(timeEntries.startTime));
}
