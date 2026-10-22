/* eslint-disable react-doctor/js-flatmap-filter */
import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributeTemplateRequests } from "@/lib/db/schema";
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const clientIdCode = url.searchParams.get("clientIdCode");
  const scope = url.searchParams.get("scope");
  // Single value or comma-separated list — match rows whose `levels`
  // array contains ANY one of these values.
  const levelsAnyParam = url.searchParams.get("levelsAny");
  const levelsAny = levelsAnyParam
    ? levelsAnyParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(100, Number(limitParam) || 100)) : 100;

  const conditions: SQL[] = [ne(attributeTemplateRequests.status, "legacy")];
  if (clientIdCode) conditions.push(eq(attributeTemplateRequests.clientIdCode, clientIdCode));
  if (scope) conditions.push(eq(attributeTemplateRequests.scope, scope));
  if (levelsAny.length > 0) {
    // Postgres array overlap: TRUE if `levels` shares any element with the input.
    // Must format as a literal array string e.g. '{"Essential","Advanced"}' — passing
    // a JS array directly causes Postgres to receive a plain string, not an array.
    const pgArrayLiteral = `{${levelsAny.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`;
    conditions.push(
      sql`${attributeTemplateRequests.levels} && ${pgArrayLiteral}::text[]`
    );
  }

  const rows = await db
    .select({
      id: attributeTemplateRequests.id,
      clientIdCode: attributeTemplateRequests.clientIdCode,
      productType: attributeTemplateRequests.productType,
      scope: attributeTemplateRequests.scope,
      levels: attributeTemplateRequests.levels,
      status: attributeTemplateRequests.status,
      sheetUrl: attributeTemplateRequests.sheetUrl,
      createdAt: attributeTemplateRequests.createdAt,
      createdBy: attributeTemplateRequests.createdBy,
      finalizedAt: attributeTemplateRequests.finalizedAt,
      finalizedBy: attributeTemplateRequests.finalizedBy,
    })
    .from(attributeTemplateRequests)
    .where(and(...conditions))
    .orderBy(desc(attributeTemplateRequests.createdAt))
    .limit(limit);

  return NextResponse.json({ requests: rows });
}
