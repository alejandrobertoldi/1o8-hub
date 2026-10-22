import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";
import { isKnownSlideType, slideDef } from "@/lib/case-study/kit/slides";

const URL_OK = /^(https:\/\/|http:\/\/|\/api\/)/i;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, sectionId } = await params;
  const cs = await loadCaseStudy(id);
  const sec = cs?.sections.find((s) => s.id === sectionId);
  if (!cs || !sec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { copy?: Record<string, unknown>; manualImages?: Record<string, unknown> } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (!isKnownSlideType(sec.sectionType)) return NextResponse.json({ error: "This slide type can no longer be edited" }, { status: 400 });
  // Only keys the slide catalog defines for this slide type are stored; anything else is ignored.
  const def = slideDef(sec.sectionType);
  const copyKeys = new Set(def.copy.map((c) => c.key));
  const slotIds = new Set(def.images.map((i) => i.id));
  const copy = { ...sec.content.copy };
  for (const [k, v] of Object.entries(body.copy ?? {})) if (copyKeys.has(k)) copy[k] = String(v ?? "").slice(0, 2000);
  const manualImages = { ...sec.content.manualImages };
  for (const [slot, v] of Object.entries(body.manualImages ?? {})) {
    if (!slotIds.has(slot)) continue;
    const urls = (Array.isArray(v) ? v : [v]).map((u) => String(u ?? "").trim()).filter(Boolean);
    if (urls.some((u) => !URL_OK.test(u))) return NextResponse.json({ error: "Image links must start with https://, http:// or /api/" }, { status: 400 });
    manualImages[slot] = urls;
  }
  // Content write and stage drop succeed or fail together. Only the editor-owned keys are set, so
  // a concurrent refresh's designImages/creativeCounts are not overwritten with a stale copy.
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE case_study_sections SET content = jsonb_set(jsonb_set(COALESCE(content, '{}'::jsonb),
      '{copy}', ${JSON.stringify(copy)}::jsonb, true), '{manualImages}', ${JSON.stringify(manualImages)}::jsonb, true),
      updated_at = now() WHERE id = ${sectionId}`);
    await tx.execute(sql`UPDATE case_studies SET stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END, updated_at = now() WHERE id = ${id}`);
  });
  return NextResponse.json({ ok: true });
}
