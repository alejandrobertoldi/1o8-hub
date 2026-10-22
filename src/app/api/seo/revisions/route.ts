import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { staffActedAs, stepFor } from "@/lib/seo/revision-rules";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.nextUrl.searchParams.get("awaiting") !== "me") return NextResponse.json({ error: "awaiting=me is required" }, { status: 400 });
  const rows = await db
    .select({ revisionId: seoRevisions.id, projectId: seoProjects.id, projectName: seoProjects.name, clientIdCode: seoProjects.clientIdCode, revisionNumber: seoRevisions.revisionNumber, status: seoRevisions.status, submittedByEmail: seoRevisions.submittedByEmail })
    .from(seoRevisions)
    .innerJoin(seoProjects, eq(seoProjects.id, seoRevisions.projectId))
    .where(inArray(seoRevisions.status, ["pm_review", "am_review"]));
  const approversByClient = new Map<string, Awaited<ReturnType<typeof loadClientApprovers>>>();
  for (const code of new Set(rows.map((r) => r.clientIdCode).filter((c): c is string => !!c))) approversByClient.set(code, await loadClientApprovers(code));
  const items = rows.flatMap((r) => {
    const step = stepFor(r.status) as "pm" | "am";
    const approvers = (r.clientIdCode && approversByClient.get(r.clientIdCode)) || { pm: null, am: null };
    const unassigned = !approvers[step]?.email;
    const as = staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, r.submittedByEmail);
    if (as === "assigned" || (unassigned && as === "override")) {
      return [{ revisionId: r.revisionId, projectId: r.projectId, projectName: r.projectName, clientIdCode: r.clientIdCode, revisionNumber: r.revisionNumber, status: r.status, unassigned }];
    }
    return [];
  });
  return NextResponse.json({ items });
}
