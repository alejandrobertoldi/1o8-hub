import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { parseLiveDate } from "@/lib/seo/ppc-status";
import { affectedProjectIds, parseVersionFromName, planGoLive, planNotLive } from "@/lib/seo/asin-live";
import { loadRowsForAsins, loadVersionTexts, versionKey } from "@/lib/seo/asin-live-data";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";
import { applyPlan, describeProjectAsins, getProject, getProjectAsins } from "./live-db";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEditorOrAbove(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

function asinList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every((a) => typeof a === "string" && a.trim())) return null;
  return [...new Set(v.map((a: string) => a.trim()))];
}

/** Drizzle 0.45 wraps every query error in DrizzleQueryError; the real Postgres
 * error (and its `code`) is on `.cause`, not on the wrapper itself. Check both
 * so a real unique-violation race is never mistaken for a generic 500 (repo
 * precedent: src/app/api/aplus/[productId]/route.ts:17, src/lib/db/master-scoring.ts:36). */
function isUniqueViolation(e: unknown): boolean {
  const top = (e as { code?: string })?.code;
  const cause = (e as { cause?: { code?: string } })?.cause?.code;
  return top === "23505" || cause === "23505";
}

async function parseJsonBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) ?? {};
  return typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asins = await getProjectAsins(id);
  const summary = await describeProjectAsins(id, asins);
  return NextResponse.json({ projectId: id, version: parseVersionFromName(project.name), ...summary });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const body = await parseJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const date = parseLiveDate(body.liveDate);
  if (!date.ok || !date.value) return NextResponse.json({ error: "liveDate must be YYYY-MM-DD" }, { status: 400 });
  const asins = asinList(body.asins);
  if (!asins) return NextResponse.json({ error: "asins must be a non-empty list" }, { status: 400 });

  const project = await getProject(id);
  if (!project || !project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const version = parseVersionFromName(project.name);
  if (version == null) return NextResponse.json({ error: "Project name has no version (_vNN)" }, { status: 400 });
  const own = new Set(await getProjectAsins(id));
  if (asins.some((a) => !own.has(a))) return NextResponse.json({ error: "Every ASIN must belong to this project" }, { status: 400 });

  let texts: Map<string, unknown>;
  try {
    texts = await loadVersionTexts(asins.map((asin) => ({ asin, version })));
  } catch {
    return NextResponse.json({ error: "Listing versions unavailable" }, { status: 502 });
  }
  const missing = asins.filter((a) => !texts.has(versionKey(a, version)));
  const tag = `V${String(version).padStart(2, "0")}`;
  if (missing.length) return NextResponse.json({ error: `Export ${tag} for these ASINs first`, missing }, { status: 409 });

  const existing = await loadRowsForAsins(project.clientIdCode, asins);
  const plan = planGoLive(existing, id, asins, date.value, version);
  try {
    const status = await applyPlan({ clientIdCode: project.clientIdCode, projectId: id, plan }, affectedProjectIds(plan, id));
    invalidateSeoProjectsCache();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Another project just went live on this ASIN — reload" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save go-live" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const body = await parseJsonBody(req);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const asins = asinList(body.asins);
  if (!asins) return NextResponse.json({ error: "asins must be a non-empty list" }, { status: 400 });
  const project = await getProject(id);
  if (!project || !project.clientIdCode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existing = await loadRowsForAsins(project.clientIdCode, asins);
  const plan = planNotLive(existing, id, asins);
  // A DELETE for ASINs this project has no live/deprecated rows for produces
  // an empty plan. Writing nothing still means the acting project's status
  // must NOT be re-derived — otherwise a manually-set draft/in_progress/
  // archived project would be silently flipped to "completed" (M3).
  if (plan.deletes.length === 0 && plan.restores.length === 0) {
    return NextResponse.json({ ok: true, status: project.status });
  }
  try {
    const status = await applyPlan({ clientIdCode: project.clientIdCode, projectId: id, plan }, affectedProjectIds(plan, id));
    invalidateSeoProjectsCache();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Another project just went live on this ASIN — reload" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
