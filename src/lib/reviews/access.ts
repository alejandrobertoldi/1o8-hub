import { NextRequest, NextResponse } from "next/server";
import { canAccessSection, getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";

type Session = NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;

/** Reviews sit between Catalog and SEO: either department (or the explicit `reviews` grant) can read them. */
export function canReadReviews(session: Session): boolean {
  if (hasAdminPowers(session.user.role)) return true;
  return canAccessSection(session, "reviews") || canAccessSection(session, "catalog") || canAccessSection(session, "seo");
}

export async function requireReviewsReader(): Promise<{ session: Session; error?: never } | { session?: never; error: NextResponse }> {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isHubStaff(session.user.role) || !canReadReviews(session)) {
    return { error: NextResponse.json({ error: "Reviews access is required." }, { status: 403 }) };
  }
  return { session };
}

const OPERATOR_ROLES = new Set(["owner", "super_admin", "admin", "editor"]);

/** Triggering a sync spends Rainforest credits and Helium 10 quota: editors and up, same-origin only. */
export async function requireReviewsOperator(req: NextRequest): Promise<{ session: Session; error?: never } | { session?: never; error: NextResponse }> {
  const access = await requireReviewsReader();
  if (access.error) return access;
  if (!OPERATOR_ROLES.has(access.session.user.role)) {
    return { error: NextResponse.json({ error: "Editing access is required to sync reviews." }, { status: 403 }) };
  }
  const origin = req.headers.get("origin");
  const expected = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : null;
  if (origin && expected && origin !== expected) {
    return { error: NextResponse.json({ error: "Invalid request origin." }, { status: 403 }) };
  }
  return { session: access.session };
}

export function parseAsinList(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((a) => a.trim().toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a)))];
}
