import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { actionNeedsNote, type RevisionAction } from "@/lib/seo/revision-rules";
import { decideRevision, getRevisionWithProject, listComments, listEvents, RevisionConflictError } from "@/lib/seo/revision-db";
import { pickProductByAsin } from "@/lib/seo/pick-product-by-asin";
import { listingImagesFor, projectKeywordList, projectSkus } from "@/lib/seo/revision-products";
import { CLIENT_PRODUCT_SELECT, portalClientAllowed, seoSectionEnabled, toClientProduct, toClientRevision } from "@/lib/seo/revision-portal";

type Ctx = { params: Promise<{ revisionId: string }> };

async function load(revisionId: string, session: { user: { role: string; clientIdCode?: string | null } }) {
  const found = await getRevisionWithProject(revisionId);
  if (!found?.project.clientIdCode) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!portalClientAllowed(session, found.project.clientIdCode) || !(await seoSectionEnabled(found.project.clientIdCode))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { found };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { revisionId } = await params;
  const r = await load(revisionId, session);
  if (r.error) return r.error;
  const { revision, project } = r.found;
  const [comments, events] = await Promise.all([listComments(revisionId), listEvents(revisionId)]);
  // Only revisions that were actually sent to the client; internal PM/AM decisions also produce approved/changes_requested.
  if (revision.status !== "client_review" && !events.some((e) => e.step === "client")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asins = Object.keys((revision.content as Record<string, unknown>) ?? {});
  const rows = asins.length ? await db.select({ ...CLIENT_PRODUCT_SELECT, sku: master.sku }).from(master).where(and(inArray(master.asin, asins), eq(master.clientIdCode, project.clientIdCode!))) : [];
  const picked = [...pickProductByAsin(rows, await projectSkus(project.id)).values()];
  // Listing Images go through the portal image route (access-checked) — Drive ids never reach the client
  const [listingImages, keywords] = await Promise.all([
    listingImagesFor(picked.map((p) => p.id), (img) => `/api/portal/seo/revisions/${revisionId}/image?productId=${encodeURIComponent(img.productId)}&slot=${encodeURIComponent(img.slot)}`),
    projectKeywordList(project.id),
  ]);
  return NextResponse.json({ revision: toClientRevision(revision, project.name, comments, events), products: picked.map(toClientProduct), clientName: project.clientName ?? null, listingImages, keywords });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "client") return NextResponse.json({ error: "Only the client can approve here" }, { status: 403 });
  const { revisionId } = await params;
  const body = (await req.json().catch(() => null)) as { action?: RevisionAction; expectedStatus?: string; note?: string } | null;
  if (body?.action !== "approve" && body?.action !== "request_changes") return NextResponse.json({ error: "action must be approve or request_changes" }, { status: 400 });
  const note = body.note?.trim() || null;
  if (actionNeedsNote(body.action) && !note) return NextResponse.json({ error: "Tell us what to change" }, { status: 400 });
  const r = await load(revisionId, session);
  if (r.error) return r.error;
  const { revision, project } = r.found;
  if (revision.status !== "client_review" || body.expectedStatus !== "client_review") return NextResponse.json({ error: "Already decided — reload" }, { status: 409 });
  try {
    await decideRevision({
      revisionId, projectId: project.id, expectedStatus: "client_review", action: body.action, step: "client",
      actor: { email: session.user.email, name: session.user.name ?? null }, actedAs: "client", note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RevisionConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
