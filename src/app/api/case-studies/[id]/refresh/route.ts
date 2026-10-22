import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";
import { pullEverything } from "@/lib/case-study/kit/pull";
import { designRefresh, isKnownSlideType, slideDef } from "@/lib/case-study/kit/slides";

export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const cs = await loadCaseStudy(id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { metrics, design, noAccount } = await pullEverything(cs.clientIdCode, cs.dateRangeStart, cs.dateRangeEnd, cs.metrics);
  // Write back ONLY what the pull owns. The pull can take minutes; anything an editor saved in
  // the meantime (metric overrides, copy, manual images) lives in the DB row, not in `cs`, so we
  // merge into the row's CURRENT jsonb instead of writing the stale pre-pull snapshot.
  const pulled = { pulledAt: metrics.pulledAt, period: metrics.period, auto: metrics.auto, failed: metrics.failed };
  await db.transaction(async (tx) => {
    for (const s of cs.sections) {
      if (!isKnownSlideType(s.sectionType)) continue; // legacy row — nothing in the catalog to refresh
      const { designImages, creativeCounts } = designRefresh(slideDef(s.sectionType), design);
      await tx.execute(sql`UPDATE case_study_sections SET content = jsonb_set(jsonb_set(COALESCE(content, '{}'::jsonb),
        '{designImages}', ${JSON.stringify(designImages)}::jsonb, true), '{creativeCounts}', ${JSON.stringify(creativeCounts)}::jsonb, true),
        updated_at = now() WHERE id = ${s.id}`);
    }
    await tx.execute(sql`UPDATE case_studies SET metrics = COALESCE(metrics, '{}'::jsonb) || ${JSON.stringify(pulled)}::jsonb, generated_at = now(),
      stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END, updated_at = now() WHERE id = ${id}`);
  });
  return NextResponse.json({ ok: true, noAccount, failed: metrics.failed });
}
