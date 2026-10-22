import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { addComment, getRevisionWithProject, setCommentResolved } from "@/lib/seo/revision-db";

type Ctx = { params: Promise<{ revisionId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { asin?: string; fieldKey?: string; body?: string; parentCommentId?: string; audience?: string } | null;
  const text = b?.body?.trim();
  if (!b?.asin || !b.fieldKey || !text) return NextResponse.json({ error: "asin, fieldKey and body are required" }, { status: 400 });
  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (typeof b.asin !== "string" || typeof b.fieldKey !== "string" || !Object.hasOwn(found.revision.content ?? {}, b.asin) || !Object.hasOwn(FIELD_MAP, b.fieldKey)) return NextResponse.json({ error: "Unknown ASIN or field for this revision" }, { status: 400 });
  const comment = await addComment({
    revisionId, asin: b.asin, fieldKey: b.fieldKey, parentCommentId: b.parentCommentId ?? null,
    audience: b.audience === "client" ? "client" : "internal",
    authorEmail: session.user.email, authorName: session.user.name ?? null, body: text,
  });
  return NextResponse.json({ comment }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const b = (await req.json().catch(() => null)) as { commentId?: string; resolved?: boolean } | null;
  if (!b?.commentId || typeof b.resolved !== "boolean") return NextResponse.json({ error: "commentId and resolved are required" }, { status: 400 });
  await setCommentResolved(b.commentId, revisionId, b.resolved ? session.user.email : null);
  return NextResponse.json({ ok: true });
}
