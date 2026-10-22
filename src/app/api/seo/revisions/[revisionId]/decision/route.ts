import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasSuperPowers, isEditorOrAbove } from "@/lib/roles";
import { actionNeedsNote, actionsFor, staffActedAs, stepFor, type RevisionAction } from "@/lib/seo/revision-rules";
import { decideRevision, getRevisionWithProject, RevisionConflictError, RevisionInputError } from "@/lib/seo/revision-db";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";
import { seoSectionEnabled } from "@/lib/seo/revision-portal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: RevisionAction; expectedStatus?: string; note?: string } | null;
  if (!body?.action || !body.expectedStatus) return NextResponse.json({ error: "action and expectedStatus are required" }, { status: 400 });
  const note = body.note?.trim() || null;
  if (actionNeedsNote(body.action) && !note) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { revision, project } = found;
  if (revision.status !== body.expectedStatus) return NextResponse.json({ error: "Already decided — reload" }, { status: 409 });
  const step = stepFor(revision.status);
  if (!step) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!actionsFor(step).includes(body.action)) return NextResponse.json({ error: `Cannot ${body.action} at the ${step.toUpperCase()} step` }, { status: 400 });

  let actedAs: "assigned" | "override" | null;
  if (step === "client") {
    // Only an Owner/Super Admin may decide on the client's behalf, never the author, always with a written reason.
    const isAuthor = (session.user.email ?? "").trim().toLowerCase() === revision.submittedByEmail.trim().toLowerCase();
    actedAs = hasSuperPowers(session.user.role) && !isAuthor ? "override" : null;
    if (actedAs && !note) return NextResponse.json({ error: "A note is required" }, { status: 400 });
  } else {
    const approvers = project.clientIdCode ? await loadClientApprovers(project.clientIdCode) : { pm: null, am: null };
    actedAs = staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, revision.submittedByEmail);
  }
  if (!actedAs) return NextResponse.json({ error: "Only the assigned approver or an Owner/Super Admin can decide this step" }, { status: 403 });

  if (body.action === "send_to_client" && !(project.clientIdCode && (await seoSectionEnabled(project.clientIdCode)))) {
    return NextResponse.json({ error: "This client's SEO portal section is off — enable it or approve as final" }, { status: 400 });
  }

  try {
    const updated = await decideRevision({
      revisionId, projectId: project.id, expectedStatus: body.expectedStatus, action: body.action, step,
      actor: { email: session.user.email, name: session.user.name ?? null }, actedAs, note,
    });
    return NextResponse.json({ revision: updated });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof RevisionInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
