import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sum, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { publicHolidays, timeOffRequests, users } from "@/lib/db/schema";
import { hasSuperPowers } from "@/lib/roles";

/** A request joined to its requester, for list and queue views. */
export interface RequestRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  workingDays: number;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** "hub" (booked here) or "gusto" (mirrored, read-only here). */
  source?: string;
}

/** An approved request as rendered on the shared calendar — NO reason (D8). */
export interface ApprovedRow {
  id: string;
  userId: string | null;
  userName: string | null;
  startDate: string;
  endDate: string;
  /** "hub" | "gusto" | "calendar" (put straight on the shared Google Calendar). */
  source?: string;
  /** Calendar events: the event title ("JMann Unavailable") and its hours when part-day. */
  label?: string;
  time?: string | null;
}

/**
 * Public-holiday dates for one country within an inclusive range.
 *
 * Returns an EMPTY set when `countryCode` is null, which is the documented
 * behaviour for a user with no country assigned (spec D6): weekends are still
 * excluded from their day count, public holidays are not.
 */
export async function getHolidayDates(
  countryCode: string | null,
  from: string,
  to: string
): Promise<Set<string>> {
  if (!countryCode) return new Set<string>();

  const rows = await db
    .select({ holidayDate: publicHolidays.holidayDate })
    .from(publicHolidays)
    .where(
      and(
        eq(publicHolidays.countryCode, countryCode),
        gte(publicHolidays.holidayDate, from),
        lte(publicHolidays.holidayDate, to)
      )
    );

  return new Set(rows.map((r) => r.holidayDate));
}

const REQUEST_COLUMNS = {
  id: timeOffRequests.id,
  userId: timeOffRequests.userId,
  userName: users.name,
  userEmail: users.email,
  startDate: timeOffRequests.startDate,
  endDate: timeOffRequests.endDate,
  reason: timeOffRequests.reason,
  status: timeOffRequests.status,
  workingDays: timeOffRequests.workingDays,
  decidedAt: timeOffRequests.decidedAt,
  decisionNote: timeOffRequests.decisionNote,
  createdAt: timeOffRequests.createdAt,
  source: timeOffRequests.source,
} as const;

/**
 * The row shape `select(REQUEST_COLUMNS)` actually returns: `RequestRow` with
 * the two timestamp columns still as `Date`. Naming it means a future drift
 * between REQUEST_COLUMNS and RequestRow is a compile error, not a silent cast.
 */
type RequestQueryRow = Omit<RequestRow, "decidedAt" | "createdAt"> & {
  decidedAt: Date | null;
  createdAt: Date;
};

function toRequestRow(r: RequestQueryRow): RequestRow {
  return {
    ...r,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Every request belonging to one user, newest first, all statuses. */
export async function getMyRequests(userId: string): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(eq(timeOffRequests.userId, userId))
    .orderBy(desc(timeOffRequests.startDate));
  return rows.map(toRequestRow);
}

export type Decider = { id: string; role: string };

/**
 * Pending hub requests this person may decide: their assignees', plus
 * everyone without an assigned approver; owners / super admins see all.
 * Gusto's are decided in Gusto.
 */
function decidableBy(decider: Decider): SQL | undefined {
  const pendingHub = and(eq(timeOffRequests.status, "pending"), eq(timeOffRequests.source, "hub"));
  if (hasSuperPowers(decider.role)) return pendingHub;
  return and(pendingHub, or(isNull(users.timeOffApproverId), eq(users.timeOffApproverId, decider.id)));
}

/** The review queue: pending only, oldest first so nothing rots. */
export async function getPendingRequests(decider: Decider): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(decidableBy(decider))
    .orderBy(asc(timeOffRequests.createdAt));
  return rows.map(toRequestRow);
}

/**
 * Count of pending requests only — for the nav badge poll, which needs a
 * number and nothing else. Cheaper than `getPendingRequests().length`: that
 * runs the same join and materialises every pending row, including
 * admin-only `reason` text, just to discard it.
 */
export async function getPendingCount(decider: Decider): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(decidableBy(decider));
  // Postgres `count(*)` returns `bigint`; drivers sometimes surface that as
  // a string, so coerce explicitly rather than trusting the inferred type.
  return Number(row?.count ?? 0);
}

/** Every request, newest first. Admin-only — includes reason text (D8). */
export async function getAllRequests(): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .orderBy(desc(timeOffRequests.startDate));
  return rows.map(toRequestRow);
}

/**
 * Approved requests overlapping an inclusive range, for calendar rendering.
 * Deliberately omits `reason` — the shared calendar must never show it (D8).
 */
export async function getApprovedInRange(
  from: string,
  to: string
): Promise<ApprovedRow[]> {
  return db
    .select({
      id: timeOffRequests.id,
      userId: timeOffRequests.userId,
      userName: users.name,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      source: timeOffRequests.source,
    })
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        lte(timeOffRequests.startDate, to),
        gte(timeOffRequests.endDate, from)
      )
    )
    .orderBy(asc(timeOffRequests.startDate));
}

/**
 * A user's pending and approved ranges — the set a new submission must not
 * overlap. Cancelled and denied requests are free to be superseded.
 */
export async function getOwnActiveRequests(
  userId: string
): Promise<{ id: string; startDate: string; endDate: string }[]> {
  return db
    .select({
      id: timeOffRequests.id,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
    })
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        inArray(timeOffRequests.status, ["pending", "approved"])
      )
    );
}

export interface DaysTakenRow {
  userId: string;
  userName: string | null;
  days: number;
}

/**
 * One user's approved requests for a calendar year (bucketed by startDate,
 * same rule as getDaysTakenByUser / spec §4.3). Includes reason + decision
 * note for the team profile detail view — callers that must honour D8
 * (shared calendar) should keep using getApprovedInRange instead.
 */
export async function getApprovedRequestsForUser(
  userId: string,
  year: number
): Promise<RequestRow[]> {
  const rows = await db
    .select(REQUEST_COLUMNS)
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        eq(timeOffRequests.status, "approved"),
        gte(timeOffRequests.startDate, `${year}-01-01`),
        lte(timeOffRequests.startDate, `${year}-12-31`)
      )
    )
    .orderBy(desc(timeOffRequests.startDate));
  return rows.map(toRequestRow);
}

/**
 * Sum of `workingDays` over one user's approved requests, bucketed by each
 * request's startDate year (spec §4.3) — a request spanning New Year's counts
 * entirely toward the year its start date falls in, since workingDays is a
 * frozen snapshot, not a per-day ledger.
 */
export async function getDaysTakenByUser(
  userId: string,
  year: number
): Promise<number> {
  const [row] = await db
    .select({ total: sum(timeOffRequests.workingDays) })
    .from(timeOffRequests)
    .where(
      and(
        eq(timeOffRequests.userId, userId),
        eq(timeOffRequests.status, "approved"),
        gte(timeOffRequests.startDate, `${year}-01-01`),
        lte(timeOffRequests.startDate, `${year}-12-31`)
      )
    );
  // Postgres SUM returns numeric-as-string over the wire; coerce explicitly
  // rather than trusting the inferred type (same reasoning as getPendingCount).
  return Number(row?.total ?? 0);
}

/**
 * Per-person days-taken for one year, approved requests only — Jake's
 * breakdown table (spec §4.2/§4.3). Only users with at least one matching
 * approved request appear (a plain GROUP BY, not a LEFT JOIN against every
 * user) — nobody in this feature needs a zero-row placeholder for staff who
 * took no time off.
 */
export async function getDaysTakenBreakdown(year: number): Promise<DaysTakenRow[]> {
  const rows = await db
    .select({
      userId: timeOffRequests.userId,
      userName: users.name,
      total: sum(timeOffRequests.workingDays),
    })
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        gte(timeOffRequests.startDate, `${year}-01-01`),
        lte(timeOffRequests.startDate, `${year}-12-31`)
      )
    )
    .groupBy(timeOffRequests.userId, users.name)
    .orderBy(asc(users.name));
  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    days: Number(r.total ?? 0),
  }));
}

/**
 * Who gets the "new request" email for a person: their assigned approver, or
 * the owners and super admins when nobody is assigned.
 */
export async function approverEmailsFor(userId: string): Promise<string[]> {
  const [person] = await db.select({ approverId: users.timeOffApproverId }).from(users).where(eq(users.id, userId)).limit(1);
  if (person?.approverId) {
    const [approver] = await db.select({ email: users.email }).from(users).where(eq(users.id, person.approverId)).limit(1);
    if (approver?.email) return [approver.email];
  }
  const supers = await db.select({ email: users.email }).from(users).where(inArray(users.role, ["owner", "super_admin"]));
  return supers.map((u) => u.email);
}

/** The assigned approver of a person (null: any admin). */
export async function assignedApproverOf(userId: string): Promise<string | null> {
  const [person] = await db.select({ approverId: users.timeOffApproverId }).from(users).where(eq(users.id, userId)).limit(1);
  return person?.approverId ?? null;
}
