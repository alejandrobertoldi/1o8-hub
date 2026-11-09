import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasHoursReportsAccess, isHubStaff } from "@/lib/roles";
import { isValidDateString } from "@/lib/hours/validation";
import { drillDayEntries, drillRangeEntries } from "@/lib/hours/analytics-queries";
import { hoursTeamScope } from "@/lib/hours/team-scope";

function mapEntry(r: {
  id: string;
  entryDate?: string;
  startTime: string;
  endTime: string;
  hours: string | number;
  note: string | null;
  category: string | null;
  clientIdCode: string;
  userId: string;
  userName: string | null;
  userEmail: string;
}) {
  return {
    id: r.id,
    entryDate: r.entryDate,
    startTime: r.startTime,
    endTime: r.endTime,
    hours: Math.round(Number(r.hours) * 100) / 100,
    note: r.note,
    category: r.category,
    clientIdCode: r.clientIdCode,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
  };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  // Admins drill into anyone; anyone else (or ?mine=1) only into their own entries.
  const own = !hasHoursReportsAccess(session.user.role) || sp.get("mine") === "1";
  if (own && (!isHubStaff(session.user.role) || !session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = own ? session.user.id! : sp.get("userId") || undefined;
  const clientIdCode = sp.get("clientIdCode") || undefined;
  const entryDate = sp.get("entryDate");
  const from = sp.get("from");
  const to = sp.get("to");
  const allDay = sp.get("all") === "1";
  const categories = sp.getAll("category");
  // Admins: only their team's entries (owners / super admins: everyone).
  const scope = own ? null : await hoursTeamScope(session.user);
  if (scope && userId && !scope.includes(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userIds = scope ?? undefined;

  // Single-day mode (heatmap cell detail).
  if (entryDate) {
    if (!isValidDateString(entryDate)) {
      return NextResponse.json(
        { error: "entryDate must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (!userId && !clientIdCode && !allDay) {
      return NextResponse.json(
        { error: "userId, clientIdCode, or all=1 is required" },
        { status: 400 }
      );
    }
    const rows = await drillDayEntries({
      entryDate,
      userId,
      userIds,
      clientIdCode,
      categories,
    });
    return NextResponse.json({ entries: rows.map(mapEntry) });
  }

  // Date-range mode (member/client summary drill).
  if (from && to) {
    if (!isValidDateString(from) || !isValidDateString(to)) {
      return NextResponse.json(
        { error: "from and to must be YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (!userId && !clientIdCode) {
      return NextResponse.json(
        { error: "userId or clientIdCode is required" },
        { status: 400 }
      );
    }
    const rows = await drillRangeEntries({
      from,
      to,
      userId,
      userIds,
      clientIdCode,
      categories,
    });
    return NextResponse.json({ entries: rows.map(mapEntry) });
  }

  return NextResponse.json(
    { error: "entryDate, or from and to, are required" },
    { status: 400 }
  );
}
