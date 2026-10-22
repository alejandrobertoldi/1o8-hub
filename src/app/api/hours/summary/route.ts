import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isValidDateString } from "@/lib/hours/validation";
import { summaryRows, categoriesInRange, internalBreakdownRows } from "@/lib/hours/queries";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const categories = req.nextUrl.searchParams.getAll("category");

  const [rows, catRows, internalRows] = await Promise.all([
    summaryRows(from, to, categories),
    categoriesInRange(from, to),
    internalBreakdownRows(from, to, categories),
  ]);

  const byMemberMap = new Map<
    string,
    { userId: string; name: string | null; email: string; totalHours: number; clients: { clientIdCode: string; hours: number }[] }
  >();
  const byClientMap = new Map<
    string,
    { clientIdCode: string; totalHours: number; members: { userId: string; name: string | null; hours: number }[] }
  >();

  for (const r of rows) {
    const hours = Number(r.totalHours);

    let member = byMemberMap.get(r.userId);
    if (!member) {
      member = { userId: r.userId, name: r.userName, email: r.userEmail, totalHours: 0, clients: [] };
      byMemberMap.set(r.userId, member);
    }
    member.totalHours = Math.round((member.totalHours + hours) * 100) / 100;
    member.clients.push({ clientIdCode: r.clientIdCode, hours });

    let client = byClientMap.get(r.clientIdCode);
    if (!client) {
      client = { clientIdCode: r.clientIdCode, totalHours: 0, members: [] };
      byClientMap.set(r.clientIdCode, client);
    }
    client.totalHours = Math.round((client.totalHours + hours) * 100) / 100;
    client.members.push({ userId: r.userId, name: r.userName, hours });
  }

  const byMember = [...byMemberMap.values()]
    .map((m) => ({ ...m, clients: m.clients.sort((a, b) => b.hours - a.hours) }))
    .sort((a, b) => b.totalHours - a.totalHours);
  const byClient = [...byClientMap.values()]
    .map((c) => ({ ...c, members: c.members.sort((a, b) => b.hours - a.hours) }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return NextResponse.json({
    byMember,
    byClient,
    categories: catRows.map((c) => c.category).filter((c): c is string => c !== null),
    internalBreakdown: {
      rows: internalRows.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        category: r.category,
        hours: Math.round(Number(r.totalHours) * 100) / 100,
        entries: Number(r.entryCount),
      })),
    },
  });
}
