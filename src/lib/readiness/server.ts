import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { asanaAssigneeMap, asanaSyncState, asanaTasks, readinessSnapshots, serviceProviders, users } from "@/lib/db/schema";
import { assigneeKey, chicagoToday, matchAssignee, matchProvider, norm, readinessDepartmentFor, readinessPct } from "./match";

/**
 * Defaults taken from the "Readiness" tab of the 1o8 Agency Dashboard sheet
 * (2026-10-21). Applied only when an assignee is first seen; admins change
 * them on the board afterwards.
 */
const SHEET_DEPARTMENTS: Record<string, string> = {
  "aalap shah": "AM",
  "alejandro bertoldi": "AM",
  "alexander krutko": "Paid",
  "althea ordonez": "Email",
  "andres gastin": "Paid",
  "arlo martin": "Creative",
  "aubrey hohisel": "AM",
  "barb mcdonald": "AM",
  "chohdi othman": "Web",
  "derrick haisman": "Web",
  "evan dorosheff": "Paid",
  "fabricio cardenas": "Paid",
  "jason geis": "Creative",
  jmann: "Creative",
  "komal patel": "Creative",
  "lauren svatos": "Creative",
  markie: "Creative",
  "med saad ben othman": "Web",
  "paulina gonzalez": "AM",
  "romi bello": "Creative",
  "rye hipolito": "Email",
  "tiffani bassett": "Email",
  wodo: "Web",
};
const SHEET_EXCLUDE = ["sam@goelk.com", "bvitanza@mission.com", "amctague@mission.com", "natalie macphee", "stephanie gomes"];

export type ReadinessRow = {
  key: string;
  label: string;
  department: string | null;
  userId: string | null;
  // Set when the assignee is a contracted service provider, not an employee.
  providerId: string | null;
  open: number;
  dueToday: number;
  overdue: number;
  readiness: number;
};
export type ReadinessBoard = {
  date: string;
  lastSyncAt: string | null;
  total: ReadinessRow;
  departments: ReadinessRow[];
  people: ReadinessRow[];
};

/**
 * Makes sure every Asana assignee has a mapping row, links it to a team
 * member when possible (and records their Asana email on the user) or else
 * to a service provider, and seeds department / excluded from the sheet the
 * first time it's seen.
 */
export async function syncAssigneeMap(): Promise<void> {
  const [assignees, existing, people, providers] = await Promise.all([
    db
      .selectDistinct({ name: asanaTasks.assigneeName, email: asanaTasks.assigneeEmail })
      .from(asanaTasks)
      .where(sql`${asanaTasks.assigneeName} is not null or ${asanaTasks.assigneeEmail} is not null`),
    db.select().from(asanaAssigneeMap),
    db.select({ id: users.id, name: users.name, email: users.email, asanaEmail: users.asanaEmail, status: users.employmentStatus }).from(users),
    db.select({ id: serviceProviders.id, name: serviceProviders.name, emails: serviceProviders.emails }).from(serviceProviders),
  ]);
  const known = new Map(existing.map((e) => [e.assigneeKey, e]));
  const active = people.filter((p) => p.status === "active");

  for (const a of assignees) {
    const key = assigneeKey(a);
    const row = known.get(key);
    const match = row?.userId || row?.providerId ? null : matchAssignee(a, active);
    const provider = match || row?.userId || row?.providerId ? null : matchProvider(a, providers);
    if (!row) {
      const nameKey = norm(a.name ?? "");
      await db
        .insert(asanaAssigneeMap)
        .values({
          assigneeKey: key,
          assigneeName: a.name,
          userId: match?.id ?? null,
          providerId: provider?.id ?? null,
          department: SHEET_DEPARTMENTS[nameKey] ?? null,
          excluded: SHEET_EXCLUDE.includes(key) || SHEET_EXCLUDE.includes(nameKey),
        })
        .onConflictDoNothing();
    } else if (match) {
      await db.update(asanaAssigneeMap).set({ userId: match.id, updatedAt: new Date() }).where(eq(asanaAssigneeMap.assigneeKey, key));
    } else if (provider) {
      await db.update(asanaAssigneeMap).set({ providerId: provider.id, updatedAt: new Date() }).where(eq(asanaAssigneeMap.assigneeKey, key));
    }
    if (match && a.email && !match.asanaEmail && a.email.toLowerCase() !== match.email.toLowerCase()) {
      await db.update(users).set({ asanaEmail: a.email.toLowerCase() }).where(eq(users.id, match.id));
    }
  }
}

/** Live board from asana_tasks (open = not completed), as of `date` (Chicago). */
export async function computeReadiness(date = chicagoToday()): Promise<ReadinessBoard> {
  await syncAssigneeMap();
  const [rows, map, people, providers, [state]] = await Promise.all([
    db
      .select({
        name: asanaTasks.assigneeName,
        email: asanaTasks.assigneeEmail,
        open: sql<number>`count(*)`.mapWith(Number),
        dueToday: sql<number>`count(*) filter (where ${asanaTasks.dueOn} = ${date})`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${asanaTasks.dueOn} < ${date})`.mapWith(Number),
      })
      .from(asanaTasks)
      .where(eq(asanaTasks.completed, false))
      .groupBy(asanaTasks.assigneeName, asanaTasks.assigneeEmail),
    db.select().from(asanaAssigneeMap),
    db.select({ id: users.id, name: users.name, departments: users.departments }).from(users),
    db.select({ id: serviceProviders.id, name: serviceProviders.name, department: serviceProviders.department }).from(serviceProviders),
    db.select({ lastSuccessAt: asanaSyncState.lastSuccessAt }).from(asanaSyncState).limit(1),
  ]);
  const mapByKey = new Map(map.map((m) => [m.assigneeKey, m]));
  const userById = new Map(people.map((p) => [p.id, p]));
  const providerById = new Map(providers.map((p) => [p.id, p]));

  const byPerson = new Map<string, ReadinessRow>();
  for (const r of rows) {
    const key = r.name || r.email ? assigneeKey(r) : "unassigned";
    const m = mapByKey.get(key);
    if (m?.excluded) continue;
    const user = m?.userId ? userById.get(m.userId) : undefined;
    const provider = !user && m?.providerId ? providerById.get(m.providerId) : undefined;
    const prev = byPerson.get(key);
    const open = (prev?.open ?? 0) + r.open;
    const overdue = (prev?.overdue ?? 0) + r.overdue;
    byPerson.set(key, {
      key,
      label: key === "unassigned" ? "Unassigned" : user?.name ?? provider?.name ?? r.name ?? r.email ?? key,
      department:
        key === "unassigned"
          ? null
          : m?.department ?? (user ? readinessDepartmentFor(user.departments) : provider?.department ?? null),
      userId: user?.id ?? null,
      providerId: provider?.id ?? null,
      open,
      dueToday: (prev?.dueToday ?? 0) + r.dueToday,
      overdue,
      readiness: readinessPct(open, overdue),
    });
  }
  // Worst readiness first, then the biggest queues.
  const people_ = [...byPerson.values()].sort((a, b) => a.readiness - b.readiness || b.open - a.open);
  const sum = (list: ReadinessRow[], key: string, label: string, department: string | null): ReadinessRow => {
    const open = list.reduce((s, r) => s + r.open, 0);
    const overdue = list.reduce((s, r) => s + r.overdue, 0);
    return { key, label, department, userId: null, providerId: null, open, dueToday: list.reduce((s, r) => s + r.dueToday, 0), overdue, readiness: readinessPct(open, overdue) };
  };
  const deptNames = [...new Set(people_.map((p) => p.department).filter(Boolean) as string[])].sort();
  const departments = deptNames.map((d) => sum(people_.filter((p) => p.department === d), d, d, d));
  const noDept = people_.filter((p) => !p.department && p.key !== "unassigned");
  if (noDept.length) departments.push(sum(noDept, "unmapped", "No department", null));

  return {
    date,
    lastSyncAt: state?.lastSuccessAt?.toISOString() ?? null,
    total: sum(people_, "all", "All team", null),
    departments,
    people: people_,
  };
}

/**
 * One person's readiness and their department's (their "team") from a board.
 * A person can sit behind several Asana assignees (e.g. a shared inbox), so
 * their rows are summed. Department = the first row's, else `fallbackDept`.
 */
export function personReadiness(
  board: ReadinessBoard,
  userId: string,
  fallbackDept: string | null = null,
): { person: ReadinessRow | null; team: ReadinessRow | null } {
  const mine = board.people.filter((p) => p.userId === userId);
  const department = mine.find((p) => p.department)?.department ?? fallbackDept;
  const team = department ? board.departments.find((d) => d.department === department) ?? null : null;
  if (!mine.length) return { person: null, team };
  const open = mine.reduce((s, r) => s + r.open, 0);
  const overdue = mine.reduce((s, r) => s + r.overdue, 0);
  return {
    person: {
      ...mine[0],
      key: `user:${userId}`,
      department,
      open,
      dueToday: mine.reduce((s, r) => s + r.dueToday, 0),
      overdue,
      readiness: readinessPct(open, overdue),
    },
    team,
  };
}

/**
 * Saves today's board (Chicago date). One snapshot per day: an existing one
 * is kept unless `force`, so the first (morning) capture is what history shows.
 */
export async function captureSnapshot(opts: { force?: boolean; date?: string } = {}): Promise<{ date: string; saved: boolean; rows: number }> {
  const date = opts.date ?? chicagoToday();
  const [existing] = await db.select({ id: readinessSnapshots.id }).from(readinessSnapshots).where(eq(readinessSnapshots.snapshotDate, date)).limit(1);
  if (existing && !opts.force) return { date, saved: false, rows: 0 };
  const board = await computeReadiness(date);
  const values = [
    { scope: "total", row: board.total },
    ...board.departments.map((row) => ({ scope: "department", row })),
    ...board.people.map((row) => ({ scope: "person", row })),
  ].map(({ scope, row }) => ({
    snapshotDate: date,
    scope,
    key: row.key,
    label: row.label,
    department: row.department,
    userId: row.userId,
    providerId: row.providerId,
    open: row.open,
    dueToday: row.dueToday,
    overdue: row.overdue,
  }));
  await db.transaction(async (tx) => {
    await tx.delete(readinessSnapshots).where(eq(readinessSnapshots.snapshotDate, date));
    await tx.insert(readinessSnapshots).values(values);
  });
  return { date, saved: true, rows: values.length };
}

export async function listSnapshotDates(limit = 400): Promise<string[]> {
  const rows = await db
    .selectDistinct({ d: readinessSnapshots.snapshotDate })
    .from(readinessSnapshots)
    .orderBy(desc(readinessSnapshots.snapshotDate))
    .limit(limit);
  return rows.map((r) => r.d);
}

/** A saved day as a board (same shape as the live one). */
export async function loadSnapshot(date: string): Promise<ReadinessBoard | null> {
  const rows = await db.select().from(readinessSnapshots).where(eq(readinessSnapshots.snapshotDate, date));
  if (!rows.length) return null;
  const toRow = (r: (typeof rows)[number]): ReadinessRow => ({
    key: r.key,
    label: r.label,
    department: r.department,
    userId: r.userId,
    providerId: r.providerId,
    open: r.open,
    dueToday: r.dueToday,
    overdue: r.overdue,
    readiness: readinessPct(r.open, r.overdue),
  });
  const total = rows.find((r) => r.scope === "total");
  return {
    date,
    lastSyncAt: rows[0].capturedAt.toISOString(),
    total: total ? toRow(total) : { key: "all", label: "All team", department: null, userId: null, providerId: null, open: 0, dueToday: 0, overdue: 0, readiness: 100 },
    departments: rows.filter((r) => r.scope === "department").map(toRow),
    people: rows.filter((r) => r.scope === "person").map(toRow),
  };
}

/** Totals + departments (and optionally one person's row) per saved day in a range, for the trend chart. */
export async function readinessHistory(from: string, to: string, personKey?: string | null) {
  const rows = await db
    .select({
      date: readinessSnapshots.snapshotDate,
      scope: readinessSnapshots.scope,
      key: readinessSnapshots.key,
      open: readinessSnapshots.open,
      dueToday: readinessSnapshots.dueToday,
      overdue: readinessSnapshots.overdue,
    })
    .from(readinessSnapshots)
    .where(
      and(
        gte(readinessSnapshots.snapshotDate, from),
        lte(readinessSnapshots.snapshotDate, to),
        personKey
          ? sql`(${readinessSnapshots.scope} in ('total', 'department') or (${readinessSnapshots.scope} = 'person' and ${readinessSnapshots.key} = ${personKey}))`
          : inArray(readinessSnapshots.scope, ["total", "department"]),
      ),
    )
    .orderBy(asc(readinessSnapshots.snapshotDate));
  return rows.map((r) => ({ ...r, readiness: readinessPct(r.open, r.overdue) }));
}

export type ClientReadiness = { clientIdCode: string; open: number; dueToday: number; overdue: number; readiness: number };

/** Readiness per client (all assignees, excluded assignees left out like on the board), as of `date` (Chicago). */
export async function clientReadiness(date = chicagoToday()): Promise<ClientReadiness[]> {
  const [rows, map] = await Promise.all([
    db
      .select({
        clientIdCode: asanaTasks.clientIdCode,
        name: asanaTasks.assigneeName,
        email: asanaTasks.assigneeEmail,
        open: sql<number>`count(*)`.mapWith(Number),
        dueToday: sql<number>`count(*) filter (where ${asanaTasks.dueOn} = ${date})`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${asanaTasks.dueOn} < ${date})`.mapWith(Number),
      })
      .from(asanaTasks)
      .where(and(eq(asanaTasks.completed, false), sql`${asanaTasks.clientIdCode} is not null`))
      .groupBy(asanaTasks.clientIdCode, asanaTasks.assigneeName, asanaTasks.assigneeEmail),
    db.select({ key: asanaAssigneeMap.assigneeKey, excluded: asanaAssigneeMap.excluded }).from(asanaAssigneeMap),
  ]);
  const excluded = new Set(map.filter((m) => m.excluded).map((m) => m.key));
  const byClient = new Map<string, ClientReadiness>();
  for (const r of rows) {
    if ((r.name || r.email) && excluded.has(assigneeKey(r))) continue;
    const c = byClient.get(r.clientIdCode!) ?? { clientIdCode: r.clientIdCode!, open: 0, dueToday: 0, overdue: 0, readiness: 100 };
    c.open += r.open;
    c.dueToday += r.dueToday;
    c.overdue += r.overdue;
    c.readiness = readinessPct(c.open, c.overdue);
    byClient.set(c.clientIdCode, c);
  }
  return [...byClient.values()];
}

/** Mapping rows with their current open-task count, for the admin editor. */
export async function listAssigneeMap() {
  await syncAssigneeMap();
  const counts = await db
    .select({ name: asanaTasks.assigneeName, email: asanaTasks.assigneeEmail, open: sql<number>`count(*)`.mapWith(Number) })
    .from(asanaTasks)
    .where(eq(asanaTasks.completed, false))
    .groupBy(asanaTasks.assigneeName, asanaTasks.assigneeEmail);
  const openByKey = new Map<string, number>();
  for (const c of counts) if (c.name || c.email) openByKey.set(assigneeKey(c), (openByKey.get(assigneeKey(c)) ?? 0) + c.open);
  const map = await db
    .select({ m: asanaAssigneeMap, userName: users.name, providerName: serviceProviders.name })
    .from(asanaAssigneeMap)
    .leftJoin(users, eq(users.id, asanaAssigneeMap.userId))
    .leftJoin(serviceProviders, eq(serviceProviders.id, asanaAssigneeMap.providerId))
    .orderBy(asc(asanaAssigneeMap.assigneeName));
  return map.map(({ m, userName, providerName }) => ({ ...m, userName, providerName, open: openByKey.get(m.assigneeKey) ?? 0 }));
}
