import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoProjects } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { isOpen } from "@/lib/seo/revision-rules";
import { listRevisions, projectWasPushed, s6Snapshot, submitRevision, RevisionConflictError, RevisionInputError } from "@/lib/seo/revision-db";
import { displayRevisionId, sameContent } from "@/lib/seo/revision-edit";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";

type Ctx = { params: Promise<{ id: string }> };

async function loadProject(id: string) {
  const [p] = await db.select({ id: seoProjects.id, clientIdCode: seoProjects.clientIdCode, s6ApprovedAt: seoProjects.s6ApprovedAt }).from(seoProjects).where(eq(seoProjects.id, id));
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role) && session.user.role !== "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const revisions = await listRevisions(id);
  const open = revisions.find((r) => isOpen(r.status)) ?? null;
  const current = revisions.find((r) => r.isCurrent) ?? null;
  const approvers = project.clientIdCode ? await loadClientApprovers(project.clientIdCode) : { pm: null, am: null };
  // No Submit when S6 still holds exactly the approved text (would only create a duplicate round)
  const unchanged = !!current?.content && sameContent(await s6Snapshot(id), current.content as Record<string, Record<string, string>>);
  const canSubmit = isEditorOrAbove(session.user.role) && !open && !!project.s6ApprovedAt && !unchanged;
  // S8 tick after a reload: was content ever pushed? (decoration — never fails the request)
  const pushed = await projectWasPushed(id).catch(() => false);
  return NextResponse.json({ revisions, open, current, approvers, canSubmit, displayId: displayRevisionId(revisions), pushed });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.s6ApprovedAt) return NextResponse.json({ error: "Save & lock S6 before submitting for review" }, { status: 400 });
  try {
    const revision = await submitRevision(id, { email: session.user.email, name: session.user.name ?? null });
    return NextResponse.json({ revision }, { status: 201 });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof RevisionInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
