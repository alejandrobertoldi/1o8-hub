import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoProjects, users } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq, desc, sql } from "drizzle-orm";
import { unauthorized, resolvePortalClient } from "@/lib/api-utils";
import { PORTAL_DEMO } from "@/lib/portal-demo";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  if (session.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.seo);

  const resolved = resolvePortalClient(session, req.nextUrl.searchParams);
  if (resolved.response) return resolved.response;
  const clientIdCode = resolved.clientIdCode;

  const [projectRows, asinCounts] = await Promise.all([
    db
      .select({
        id: seoProjects.id,
        name: seoProjects.name,
        brandName: seoProjects.brandName,
        status: seoProjects.status,
        currentPhase: seoProjects.currentPhase,
        createdAt: seoProjects.createdAt,
        updatedAt: seoProjects.updatedAt,
        assigneeName: users.name,
        assigneeImage: users.image,
        s1ApprovedAt: seoProjects.s1ApprovedAt,
        s2ApprovedAt: seoProjects.s2ApprovedAt,
        s3ApprovedAt: seoProjects.s3ApprovedAt,
        s4ApprovedAt: seoProjects.s4ApprovedAt,
        s5ApprovedAt: seoProjects.s5ApprovedAt,
        s6ApprovedAt: seoProjects.s6ApprovedAt,
      })
      .from(seoProjects)
      .leftJoin(users, eq(seoProjects.assignedTo, users.id))
      .where(eq(seoProjects.clientIdCode, clientIdCode))
      .orderBy(desc(seoProjects.createdAt)),

    db.execute<{ project_id: string; asin_count: number }>(sql`
      SELECT sp.id as project_id, count(sa.id)::int as asin_count
      FROM seo_projects sp
      LEFT JOIN seo_asins sa ON sa.project_id = sp.id
      WHERE sp.client_id_code = ${clientIdCode}
      GROUP BY sp.id
    `),
  ]);

  const asinMap = new Map(asinCounts.map((r) => [r.project_id, r.asin_count]));

  const projects = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    brand_name: p.brandName,
    status: p.status,
    current_phase: p.currentPhase,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    assignee_name: p.assigneeName,
    assignee_image: p.assigneeImage,
    asin_count: asinMap.get(p.id) ?? 0,
    s1_approved_at: p.s1ApprovedAt,
    s2_approved_at: p.s2ApprovedAt,
    s3_approved_at: p.s3ApprovedAt,
    s4_approved_at: p.s4ApprovedAt,
    s5_approved_at: p.s5ApprovedAt,
    s6_approved_at: p.s6ApprovedAt,
  }));

  return NextResponse.json(projects);
}
