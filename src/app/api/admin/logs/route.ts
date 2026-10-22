import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { adminEventLog } from "@/lib/db/schema";
import { desc, eq, and, gte, lte, or, ilike, sql } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "50", 10)));
  const section = params.get("section") || "";
  const status = params.get("status") || "";
  const user = params.get("user") || "";
  const search = params.get("search") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";

  const conditions = [];

  if (section) {
    conditions.push(eq(adminEventLog.section, section));
  }
  if (status) {
    conditions.push(eq(adminEventLog.status, status));
  }
  if (user) {
    conditions.push(eq(adminEventLog.userEmail, user));
  }
  if (from) {
    conditions.push(gte(adminEventLog.createdAt, new Date(from)));
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(adminEventLog.createdAt, toDate));
  }
  if (search) {
    conditions.push(
      or(
        ilike(adminEventLog.action, `%${search}%`),
        ilike(adminEventLog.message, `%${search}%`),
        ilike(adminEventLog.resourceLabel, `%${search}%`),
        ilike(adminEventLog.userEmail, `%${search}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(adminEventLog)
      .where(where)
      .orderBy(desc(adminEventLog.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)` })
      .from(adminEventLog)
      .where(where),
  ]);

  const total = Number(countResult[0].count);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
