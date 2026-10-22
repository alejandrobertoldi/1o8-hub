import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { plansToCsv } from "@/lib/holiday-deals/calendar";
import { listHolidayDeals } from "@/lib/holiday-deals/store";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const { rows } = await listHolidayDeals({
    client: searchParams.get("client"),
    event: searchParams.get("event"),
    q: searchParams.get("q"),
  });
  const csv = plansToCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="q4-2026-holiday-deals.csv"',
    },
  });
}
