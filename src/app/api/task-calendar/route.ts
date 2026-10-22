export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { TASK_CALENDAR_TAGS, isTaskCalendarTag, listTaskCalendar } from "@/lib/task-calendar";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/task-calendar?tag=Email|Paid%20Media&from&to — team tasks by Go Live Date. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const tag = sp.get("tag");
  if (!isTaskCalendarTag(tag)) return NextResponse.json({ error: `tag must be one of ${TASK_CALENDAR_TAGS.join(", ")}` }, { status: 400 });
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD with from ≤ to" }, { status: 400 });
  }
  return NextResponse.json(await listTaskCalendar(tag, from, to));
}
