// Edit one field of a revision in place during staff review (PM / AM).
// Updates the revision (what is approved and pushed) and S6's copy together,
// and logs the before/after as an internal note on that field.
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { seoAsins, seoRevisionComments, seoRevisions } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { getRevisionWithProject } from "@/lib/seo/revision-db";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";
import { FIELD_MAP } from "@/app/api/seo/projects/[id]/migrate-to-products/field-map";
import { canEditRevision, editNote, parseSuggestion, withEditedField } from "@/lib/seo/revision-edit";

/** Hard limits: backend search terms 249 bytes (Amazon de-indexes above), bullets 200 characters. */
function overLimit(key: string, text: string): string | null {
  if (key === "BackendSearchTerms" && new TextEncoder().encode(text).length > 249) return "Backend search terms must be 249 bytes or fewer";
  if (/^DetailedBulletPoint_[1-5]$/.test(key) && text.length > 200) return "Bullet points must be 200 characters or fewer";
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role) || !isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const body = (await req.json().catch(() => null)) as { asin?: string; fieldKey?: string; value?: string; expectedValue?: string; acceptSuggestionId?: string } | null;
  const asin = body?.asin ?? "";
  const key = body?.fieldKey ?? "";
  const accepting = body?.acceptSuggestionId ?? null;
  const value = (body?.value ?? "").trim();
  if (!FIELD_MAP[key]) return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  if (!accepting && !value) return NextResponse.json({ error: "The text can't be empty" }, { status: 400 });

  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { revision, project } = found;
  // Staff edit during PM/AM review; accepting a client's suggestion is also allowed while the client reviews
  if (!canEditRevision(revision.status) && !(accepting && revision.status === "client_review")) {
    return NextResponse.json({ error: "Text can only be edited during PM or AM review" }, { status: 409 });
  }
  const content = revision.content as Record<string, Record<string, string>>;
  if (!content[asin]) return NextResponse.json({ error: "This ASIN is not in the revision" }, { status: 400 });
  const before = content[asin][key] ?? "";
  if (!accepting && body?.expectedValue !== undefined && body.expectedValue !== before) {
    return NextResponse.json({ error: "Someone changed this text meanwhile — reload", current: before }, { status: 409 });
  }
  if (!accepting && value === before) return NextResponse.json({ ok: true, unchanged: true });
  // Hard limits apply to direct edits and to accepted client suggestions alike
  const tooLong = !accepting ? overLimit(key, value) : null;
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

  const by = session.user.name || session.user.email || "Hub user";
  let suggestionTooLong: string | null = null;
  const result = await db.transaction(async (tx) => {
    let next = value;
    let noteBy = by;
    if (accepting) {
      const [c] = await tx.select({ id: seoRevisionComments.id, asin: seoRevisionComments.asin, fieldKey: seoRevisionComments.fieldKey, body: seoRevisionComments.body, resolvedAt: seoRevisionComments.resolvedAt, authorName: seoRevisionComments.authorName })
        .from(seoRevisionComments).where(and(eq(seoRevisionComments.id, accepting), eq(seoRevisionComments.revisionId, revisionId))).limit(1);
      const sg = c && c.asin === asin && c.fieldKey === key ? parseSuggestion(c.body) : null;
      if (!sg) return "bad" as const;
      if (c.resolvedAt) return "handled" as const;
      if (sg.before.trim() !== before.trim()) return "stale" as const;
      next = sg.after.trim();
      suggestionTooLong = overLimit(key, next);
      if (suggestionTooLong) return "too_long" as const;
      noteBy = `${by} (accepted ${c.authorName ?? "the client"}'s suggestion)`;
    }
    // Status guard in the WHERE: a decision landing meanwhile makes this a no-op → 409
    const updated = await tx.update(seoRevisions).set({ content: { ...content, [asin]: { ...content[asin], [key]: next } } })
      .where(and(eq(seoRevisions.id, revisionId), eq(seoRevisions.status, revision.status))).returning({ id: seoRevisions.id });
    if (updated.length === 0) return "conflict" as const;
    const [row] = await tx.select({ generatedContent: seoAsins.generatedContent }).from(seoAsins)
      .where(and(eq(seoAsins.projectId, project.id), eq(seoAsins.asin, asin))).limit(1);
    if (row) {
      await tx.update(seoAsins).set({ generatedContent: withEditedField(row.generatedContent, key, next) as never })
        .where(and(eq(seoAsins.projectId, project.id), eq(seoAsins.asin, asin)));
    }
    await tx.insert(seoRevisionComments).values({
      revisionId, asin, fieldKey: key, parentCommentId: null, audience: "internal",
      authorEmail: session.user.email ?? "system", authorName: session.user.name ?? null,
      body: editNote(FIELD_LABELS[key] ?? key, before, next, noteBy),
      // A log entry, not an open question — resolved from the start so it never counts
      resolvedAt: new Date(), resolvedBy: session.user.email ?? "system",
    });
    if (accepting) {
      await tx.update(seoRevisionComments).set({ resolvedAt: new Date(), resolvedBy: session.user.email ?? "system", updatedAt: new Date() })
        .where(and(eq(seoRevisionComments.id, accepting), eq(seoRevisionComments.revisionId, revisionId)));
    }
    return "ok" as const;
  });
  if (result === "bad") return NextResponse.json({ error: "That isn't a suggestion for this field" }, { status: 400 });
  if (result === "too_long") return NextResponse.json({ error: `${suggestionTooLong} — decline this suggestion` }, { status: 400 });
  if (result === "handled") return NextResponse.json({ error: "That suggestion was already handled — reload" }, { status: 409 });
  if (result === "stale") return NextResponse.json({ error: "The text changed since this suggestion — reload" }, { status: 409 });
  if (result === "conflict") return NextResponse.json({ error: "The review moved on meanwhile — reload" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
