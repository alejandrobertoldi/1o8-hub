import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { desc, eq, and, gte, lte, or, ilike, sql, not } from "drizzle-orm";

/**
 * Map department IDs to field label patterns for filtering activity.
 * Activity entries are product field edits — we categorize by field name.
 */
const DEPARTMENT_FIELD_PATTERNS: Record<string, string[]> = {
  seo: ["seo", "keyword", "search_term", "backend_keyword"],
  design: ["aplus", "a+", "image", "alt_text", "video", "photo"],
  ppc: ["ad_", "ppc", "campaign", "acos", "roas", "spend"],
  catalog: ["title", "bullet", "description", "brand", "manufacturer", "category", "item_type"],
  finances: ["price", "revenue", "cost", "fee", "margin"],
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "50", 10)));
  const client = params.get("client") || "";
  const user = params.get("user") || "";
  const editType = params.get("editType") || "";
  const search = params.get("search") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const department = params.get("department") || "";

  const conditions = [];

  if (client) {
    conditions.push(eq(activityLog.clientIdCode, client));
  }
  if (user) {
    conditions.push(eq(activityLog.changedBy, user));
  }
  if (editType) {
    conditions.push(eq(activityLog.editType, editType));
  }
  if (from) {
    conditions.push(gte(activityLog.changedAt, new Date(from)));
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(activityLog.changedAt, toDate));
  }
  if (search) {
    conditions.push(
      or(
        ilike(activityLog.asin, `%${search}%`),
        ilike(activityLog.sku, `%${search}%`),
        ilike(activityLog.fieldLabel, `%${search}%`),
        ilike(activityLog.itemName, `%${search}%`)
      )
    );
  }
  if (department && DEPARTMENT_FIELD_PATTERNS[department]) {
    const patterns = DEPARTMENT_FIELD_PATTERNS[department];
    const deptCondition = or(
      ...patterns.map((p) => ilike(activityLog.bqName, `%${p}%`)),
      ...patterns.map((p) => ilike(activityLog.fieldLabel, `%${p}%`)),
    );
    if (deptCondition) conditions.push(deptCondition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(activityLog)
      .where(where)
      .orderBy(desc(activityLog.changedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)` })
      .from(activityLog)
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
