import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canSubmitTimeOff } from "@/lib/time-off/guards";
import { getApprovedInRange, type ApprovedRow } from "@/lib/time-off/queries";
import { teamEventsInRange } from "@/lib/time-off/team-calendar";
import { timeRangeLabel } from "@/lib/time-off/calendar-events";
import { isDateString } from "@/lib/time-off/working-days";

export const dynamic = "force-dynamic";

/**
 * GET /api/time-off/approved?from=&to= — approved time-off rows for the
 * shared /calendar overlay (spec §4.1). Not in the spec's §3 backend-additions
 * list, but required to implement it: `getApprovedInRange` has zero existing
 * callers, and GET /api/time-off returns the caller's own/all requests (with
 * reason) — a different shape entirely. Open to any team member: the query
 * already omits `reason` (D8), so there's nothing further to gate.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDateString(from) || !isDateString(to)) {
    return NextResponse.json(
      { error: "from and to must be valid YYYY-MM-DD dates" },
      { status: 400 }
    );
  }
  if (to < from) {
    return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  }

  // Plus what people put straight on the shared Google Calendar (cached by the time off sync).
  const [rows, events] = await Promise.all([getApprovedInRange(from, to), teamEventsInRange(from, to).catch(() => [])]);
  const fromCalendar: ApprovedRow[] = events.map((e) => ({
    id: `gcal:${e.id}`,
    userId: e.userId,
    userName: e.userName,
    startDate: e.startDate,
    endDate: e.endDate,
    source: "calendar",
    label: e.summary,
    time: !e.allDay && e.startAt && e.endAt ? timeRangeLabel(e.startAt, e.endAt, e.timeZone) : null,
  }));
  return NextResponse.json([...rows, ...fromCalendar]);
}
