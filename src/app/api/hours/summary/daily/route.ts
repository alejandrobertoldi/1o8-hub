import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasHoursReportsAccess, isHubStaff } from "@/lib/roles";
import { isValidDateString } from "@/lib/hours/validation";
import { summaryByDay } from "@/lib/hours/analytics-queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admins see the team; anyone else (or ?mine=1) only their own hours.
  const own = !hasHoursReportsAccess(session.user.role) || req.nextUrl.searchParams.get("mine") === "1";
  if (own && (!isHubStaff(session.user.role) || !session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const dimension = req.nextUrl.searchParams.get("dimension") === "client" ? "client" : "member";
  const categories = req.nextUrl.searchParams.getAll("category");

  const rows = await summaryByDay(from, to, dimension, categories, own ? [session.user.id!] : undefined);

  return NextResponse.json({
    dimension,
    rows: rows.map((r) => ({
      key: r.key,
      keyName: r.keyName,
      entryDate: r.entryDate,
      totalHours: r.totalHours,
    })),
  });
}
