import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { publicHolidays, users } from "@/lib/db/schema";

/**
 * Public holidays for hour logging: a holiday on a person's calendar isn't a
 * workday, so it never counts toward expected hours, capacity or "under 8 h".
 * The calendar is the person's assigned one (users.country_code, Admin →
 * Users), US when none is set.
 */
export const DEFAULT_HOLIDAY_CALENDAR = "US";
export const holidayCalendar = (countryCode: string | null | undefined) => countryCode?.trim() || DEFAULT_HOLIDAY_CALENDAR;

/** Every calendar's holiday dates within a range: country code → dates. */
export async function holidaysByCalendar(from: string, to: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ country: publicHolidays.countryCode, date: publicHolidays.holidayDate })
    .from(publicHolidays)
    .where(and(gte(publicHolidays.holidayDate, from), lte(publicHolidays.holidayDate, to)));
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.country) ?? new Set<string>();
    set.add(r.date);
    out.set(r.country, set);
  }
  return out;
}

/** One person's holiday dates within a range (their calendar, US by default). */
export async function holidaysForUser(userId: string, from: string, to: string): Promise<{ calendar: string; dates: string[] }> {
  const [u] = await db.select({ countryCode: users.countryCode }).from(users).where(eq(users.id, userId)).limit(1);
  const calendar = holidayCalendar(u?.countryCode);
  const rows = await db
    .select({ date: publicHolidays.holidayDate })
    .from(publicHolidays)
    .where(and(eq(publicHolidays.countryCode, calendar), gte(publicHolidays.holidayDate, from), lte(publicHolidays.holidayDate, to)));
  return { calendar, dates: rows.map((r) => r.date).sort() };
}
