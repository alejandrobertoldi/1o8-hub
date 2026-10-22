// Revisions awaiting this client user
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { parseClientIdCodes } from "@/lib/client-codes";
import { hasAdminPowers } from "@/lib/roles";
import { seoSectionEnabled } from "@/lib/seo/revision-portal";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  const codes = role === "client" || role === "prospect"
    ? parseClientIdCodes(session.user.clientIdCode)
    : hasAdminPowers(role) && req.nextUrl.searchParams.get("client") ? [req.nextUrl.searchParams.get("client")!] : [];
  const allowed: string[] = [];
  for (const c of codes) if (await seoSectionEnabled(c)) allowed.push(c);
  if (allowed.length === 0) return NextResponse.json({ items: [] });
  const items = await db
    .select({ revisionId: seoRevisions.id, revisionNumber: seoRevisions.revisionNumber, submittedAt: seoRevisions.submittedAt, projectName: seoProjects.name, clientIdCode: seoProjects.clientIdCode, content: seoRevisions.content })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    .where(and(eq(seoRevisions.status, "client_review"), inArray(seoProjects.clientIdCode, allowed)))
    .orderBy(desc(seoRevisions.submittedAt));
  return NextResponse.json({
    items: items.map(({ content, submittedAt, ...i }) => ({ ...i, submittedAt: new Date(submittedAt).toISOString(), asinCount: Object.keys(content ?? {}).length })),
  });
}
