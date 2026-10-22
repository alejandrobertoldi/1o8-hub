export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { holidayCalendarSettings, users } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { COUNTRY_FULL_NAMES, VALID_COUNTRY_CODES, isCountryCode } from "@/lib/constants";

/**
 * GET /api/holidays/calendars — every holiday calendar, whether it is shown
 * on the general calendar, and how many active people are assigned to it.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, counts] = await Promise.all([
    db.select().from(holidayCalendarSettings),
    db
      .select({ code: users.countryCode, n: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(sql`${users.employmentStatus} = 'active' and ${users.countryCode} is not null`)
      .groupBy(users.countryCode),
  ]);
  const visible = new Map(settings.map((s) => [s.countryCode, s.visible]));
  const people = new Map(counts.map((c) => [c.code, c.n]));
  return NextResponse.json(
    VALID_COUNTRY_CODES.map((code) => ({
      countryCode: code,
      name: COUNTRY_FULL_NAMES[code],
      visible: visible.get(code) ?? true,
      people: people.get(code) ?? 0,
    })),
  );
}

const putSchema = z.object({
  countryCode: z.string().refine(isCountryCode, `countryCode must be one of ${VALID_COUNTRY_CODES.join(", ")}`),
  visible: z.boolean(),
});

/** PUT /api/holidays/calendars — admins show or hide one calendar on the general calendar. */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Only admins can show or hide holiday calendars" }, { status: 403 });
  }
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { countryCode, visible } = parsed.data;
  await db
    .insert(holidayCalendarSettings)
    .values({ countryCode, visible, updatedBy: session.user.email ?? null })
    .onConflictDoUpdate({
      target: holidayCalendarSettings.countryCode,
      set: { visible, updatedBy: session.user.email ?? null, updatedAt: new Date() },
    });
  return NextResponse.json({ countryCode, visible });
}
