import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { loadCaseStudy, blockersFor } from "@/lib/case-study/kit/load";
import { canTransition, STAGES, type Stage } from "@/lib/case-study/kit/stages";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres FK violation — drizzle may surface it on the error or on its `cause`. */
function isFkViolation(err: unknown): boolean {
  const code = (e: unknown) => (e && typeof e === "object" ? (e as { code?: unknown }).code : undefined);
  return code(err) === "23503" || code((err as { cause?: unknown } | null)?.cause) === "23503";
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cs = await loadCaseStudy((await params).id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...cs, blockers: blockersFor(cs) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const cs = await loadCaseStudy(id);
  if (!cs) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (body.ownerId !== undefined && body.ownerId !== null && !(typeof body.ownerId === "string" && UUID.test(body.ownerId)))
    return NextResponse.json({ error: "Invalid owner" }, { status: 400 });

  let to: Stage | undefined;
  if (body.stage !== undefined) {
    to = body.stage as Stage;
    if (!STAGES.includes(to) || !canTransition(cs.stage, to))
      return NextResponse.json({ error: `Cannot move from ${cs.stage} to ${String(body.stage)}` }, { status: 400 });
    if (to === "approved") {
      const b = blockersFor(cs);
      if (b.length) return NextResponse.json({ error: "Resolve these before approving", blockers: b }, { status: 409 });
    }
  }

  try {
  await db.transaction(async (tx) => {
    if (body.clientSector !== undefined || body.contactEmail !== undefined) {
      await tx.execute(sql`UPDATE case_studies SET
        client_sector = COALESCE(${body.clientSector === undefined ? null : String(body.clientSector ?? "")}, client_sector),
        contact_email = COALESCE(${body.contactEmail === undefined ? null : String(body.contactEmail ?? "")}, contact_email),
        stage = CASE WHEN stage IN ('approved','sent') THEN 'drafting'::case_study_stage ELSE stage END,
        updated_at = now() WHERE id = ${id}`);
    }
    if (body.ownerId !== undefined) {
      const owner = body.ownerId === null ? null : String(body.ownerId);
      await tx.execute(sql`UPDATE case_studies SET owner_id = ${owner}::uuid, updated_at = now() WHERE id = ${id}`);
    }
    // Stage transition runs LAST: it was validated against the deck/blockers loaded before
    // this transaction, and must not be undone by the contact/sector update's stage-drop CASE.
    if (to !== undefined) {
      await tx.execute(to === "sent"
        ? sql`UPDATE case_studies SET stage = 'sent', sent_at = now(), updated_at = now() WHERE id = ${id}`
        : sql`UPDATE case_studies SET stage = ${to}::case_study_stage, updated_at = now() WHERE id = ${id}`);
    }
  });
  } catch (err) {
    if (isFkViolation(err)) return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.execute(sql`DELETE FROM case_studies WHERE id = ${(await params).id}`);
  return NextResponse.json({ ok: true });
}
