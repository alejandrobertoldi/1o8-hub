import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisionEvents, seoRevisionPushes, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [row] = await db
    .select({
      pushedAt: seoRevisionPushes.createdAt, pushedBy: seoRevisionPushes.pushedBy, overrideReason: seoRevisionPushes.overrideReason,
      revisionId: seoRevisions.id, revisionNumber: seoRevisions.revisionNumber, approvedAt: seoRevisions.approvedAt, finalVia: seoRevisions.finalVia,
      projectName: seoProjects.name, projectId: seoProjects.id,
    })
    .from(seoRevisionPushes)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisionPushes.projectId))
    .leftJoin(seoRevisions, eq(seoRevisions.id, seoRevisionPushes.revisionId))
    .where(eq(seoRevisionPushes.productId, id))
    .orderBy(desc(seoRevisionPushes.createdAt))
    .limit(1);
  if (!row) return NextResponse.json({ push: null });
  let approvedByName: string | null = null;
  if (row.revisionId) {
    const [ev] = await db
      .select({ actorName: seoRevisionEvents.actorName })
      .from(seoRevisionEvents)
      .where(and(
        eq(seoRevisionEvents.revisionId, row.revisionId),
        or(
          and(eq(seoRevisionEvents.step, "client"), eq(seoRevisionEvents.action, "approve")),
          eq(seoRevisionEvents.action, "approve_final"),
        ),
      ))
      .orderBy(desc(seoRevisionEvents.createdAt))
      .limit(1);
    approvedByName = ev?.actorName ?? null;
  }
  return NextResponse.json({ push: { ...row, approvedByName } });
}
