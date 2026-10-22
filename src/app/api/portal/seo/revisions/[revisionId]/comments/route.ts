import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { addComment, getRevisionWithProject } from "@/lib/seo/revision-db";
import { portalClientAllowed, seoSectionEnabled } from "@/lib/seo/revision-portal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "client") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { asin?: string; fieldKey?: string; body?: string; parentCommentId?: string } | null;
  const text = b?.body?.trim();
  if (!b?.asin || !b.fieldKey || !text) return NextResponse.json({ error: "asin, fieldKey and body are required" }, { status: 400 });
  const found = await getRevisionWithProject(revisionId);
  if (!found?.project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!portalClientAllowed(session, found.project.clientIdCode) || !(await seoSectionEnabled(found.project.clientIdCode))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (found.revision.status !== "client_review") return NextResponse.json({ error: "This revision is no longer open for comments" }, { status: 409 });
  if (typeof b.asin !== "string" || typeof b.fieldKey !== "string" || !Object.hasOwn(found.revision.content ?? {}, b.asin) || !Object.hasOwn(FIELD_MAP, b.fieldKey)) return NextResponse.json({ error: "Unknown ASIN or field" }, { status: 400 });
  const c = await addComment({ revisionId, asin: b.asin, fieldKey: b.fieldKey, parentCommentId: b.parentCommentId ?? null, audience: "client", authorEmail: session.user.email, authorName: session.user.name ?? null, body: text });
  return NextResponse.json({ comment: { id: c.id, asin: c.asin, fieldKey: c.fieldKey, parentCommentId: c.parentCommentId, authorName: c.authorName, body: c.body, createdAt: new Date(c.createdAt).toISOString(), resolved: false } }, { status: 201 });
}
