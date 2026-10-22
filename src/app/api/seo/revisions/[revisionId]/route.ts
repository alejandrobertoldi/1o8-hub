import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { hasSuperPowers, isEditorOrAbove, isHubStaff } from "@/lib/roles";
import { actionsFor, overrideRole, staffActedAs, stepFor, type RevisionAction } from "@/lib/seo/revision-rules";
import { getRevisionWithProject, listComments, listEvents, listOpenCommentsOfPrevious } from "@/lib/seo/revision-db";
import { loadClientApprovers } from "@/lib/seo/revision-approvers";
import { pickProductByAsin } from "@/lib/seo/pick-product-by-asin";
import { listingImagesFor, projectSkus } from "@/lib/seo/revision-products";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ revisionId: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { revisionId } = await params;
  const found = await getRevisionWithProject(revisionId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { revision, project } = found;
  const asins = Object.keys(revision.content ?? {});
  const [allProducts, skus, comments, events, approvers, previousOpenComments] = await Promise.all([
    asins.length && project.clientIdCode
      ? db.select().from(master).where(and(inArray(master.asin, asins), eq(master.clientIdCode, project.clientIdCode)))
      : Promise.resolve([]),
    projectSkus(project.id),
    listComments(revisionId),
    listEvents(revisionId),
    project.clientIdCode ? loadClientApprovers(project.clientIdCode) : Promise.resolve({ pm: null, am: null }),
    listOpenCommentsOfPrevious(project.id, revision.revisionNumber),
  ]);
  // One row per ASIN — the project's SKU — so the preview shows the listing that will be pushed
  const products = [...pickProductByAsin(allProducts, skus).values()];
  const listingImages = await listingImagesFor(products.map((p) => p.id));
  const step = stepFor(revision.status);
  const isAuthor = (session.user.email ?? "").trim().toLowerCase() === revision.submittedByEmail.trim().toLowerCase();
  let actedAs: "assigned" | "override" | null = null;
  let actions: RevisionAction[] = [];
  if (step === "pm" || step === "am") {
    actedAs = staffActedAs(step, { email: session.user.email, role: session.user.role }, approvers, revision.submittedByEmail);
    actions = actedAs && isEditorOrAbove(session.user.role) ? actionsFor(step) : [];
  } else if (step === "client" && hasSuperPowers(session.user.role) && isEditorOrAbove(session.user.role) && !isAuthor) {
    // Owner/Super Admin may decide on the client's behalf (mirrors the decision route).
    actedAs = "override";
    actions = actionsFor("client");
  }
  // Who an override is "as" (client team ladder or Owner) — the tracker labels its extra checkbox with it
  const overrideAs = actedAs !== "override" ? null
    : step === "client" ? "Owner" : step ? overrideRole(step, { email: session.user.email ?? "", role: session.user.role }, approvers) : null;
  return NextResponse.json({ revision, project, products, listingImages, comments, previousOpenComments, events, approvers, me: { step, actedAs, actions, overrideAs } });
}
