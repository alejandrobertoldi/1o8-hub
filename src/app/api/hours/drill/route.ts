import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isValidDateString } from "@/lib/hours/validation";
import { drillDays } from "@/lib/hours/queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const userId = sp.get("userId");
  const clientIdCode = sp.get("clientIdCode");

  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (!userId || !clientIdCode) {
    return NextResponse.json(
      { error: "userId and clientIdCode are required" },
      { status: 400 }
    );
  }

  const categories = sp.getAll("category");

  const rows = await drillDays(from, to, userId, clientIdCode, categories);
  const days = rows.map((r) => ({
    entryDate: r.entryDate,
    hours: Math.round(Number(r.hours) * 100) / 100,
  }));
  return NextResponse.json({ days });
}
