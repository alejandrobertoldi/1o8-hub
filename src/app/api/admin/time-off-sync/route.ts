export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { googleServiceAccount } from "@/lib/google-service-account";
import { gustoConfigured, gustoConnection } from "@/lib/gusto/client";
import { teamCalendarConfigured, teamCalendarId, teamCalendarReadOnly } from "@/lib/time-off/team-calendar";
import { lastTimeOffRuns, syncTimeOff } from "@/lib/time-off/sync";

async function admin() {
  const s = await getAuthSession();
  return s && hasAdminPowers(s.user.role) ? s : null;
}

/** GET — connection status of the shared calendar and Gusto, plus recent runs. */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can see the time off sync" }, { status: 403 });
  const conn = await gustoConnection();
  return NextResponse.json({
    calendar: {
      configured: teamCalendarConfigured(),
      readOnly: teamCalendarReadOnly(),
      calendarId: teamCalendarId(),
      // The address the calendar has to be shared with.
      serviceAccount: googleServiceAccount()?.client_email ?? null,
    },
    gusto: {
      configured: gustoConfigured(),
      connected: !!conn,
      companyName: conn?.companyName ?? null,
      companyKnown: !!conn?.companyUuid,
      updatedAt: conn?.updatedAt ?? null,
    },
    runs: await lastTimeOffRuns(10),
  });
}

/** POST — run the time off sync now. */
export async function POST() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can run the time off sync" }, { status: 403 });
  try {
    return NextResponse.json(await syncTimeOff("manual"));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
