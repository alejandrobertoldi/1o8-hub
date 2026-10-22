import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { loadCaseStudy } from "@/lib/case-study/kit/load";
import { SCALAR_KEYS, type ScalarKey } from "@/lib/case-study/kit/metrics";

const DROP_STAGE = sql`stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END`;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await loadCaseStudy(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { key?: string; value?: unknown } | null;
  const key = body?.key as ScalarKey;
  if (!key || !SCALAR_KEYS.includes(key)) return NextResponse.json({ error: "key must be an overridable scalar metric" }, { status: 400 });

  const path = `{overrides,${key}}`;
  if (body!.value === null || body!.value === undefined || body!.value === "") {
    await db.execute(sql`UPDATE case_studies SET metrics = metrics #- ${path}::text[], ${DROP_STAGE}, updated_at = now() WHERE id = ${id}`);
    return NextResponse.json({ ok: true });
  }
  let value: number | string;
  if (key === "fulfilment") value = String(body!.value).slice(0, 40);
  else {
    value = Number(body!.value);
    if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  }
  await db.execute(sql`UPDATE case_studies
    SET metrics = jsonb_set(jsonb_set(metrics, '{overrides}', COALESCE(metrics->'overrides', '{}'::jsonb), true),
                            ${path}::text[], ${JSON.stringify(value)}::jsonb, true),
        ${DROP_STAGE}, updated_at = now()
    WHERE id = ${id}`);
  return NextResponse.json({ ok: true });
}
