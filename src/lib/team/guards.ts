import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { readIsSuperAdmin } from "./access-db";
import { allowsTier, resolveAccess, type FieldTier } from "./access";

export type GuardResult =
  | {
      ok: true;
      session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
    }
  | { ok: false; response: NextResponse };

/**
 * Session + tier gate for whole-route authorization, as opposed to the
 * per-field canWriteField used by PATCH /api/team/[userId].
 *
 * ALWAYS resolves isSuperAdmin from the database (ruling F3). Every caller of
 * this helper is a tier-2 or tier-3 route, which is exactly the set that must
 * not trust the never-refreshed JWT flag.
 *
 * The resolved Access is used for the tier check and NOT returned: no call site
 * consumed it, and the one route that genuinely needs a per-field Access
 * (PATCH /api/team/[userId]) deliberately bypasses this helper. The
 * (tier, targetUserId) signature stays, so read and write gates keep resolving
 * through the same allowsTier.
 */
export async function requireTier(
  tier: FieldTier,
  targetUserId: string
): Promise<GuardResult> {
  const session = await getAuthSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    targetUserId,
    isSuperAdmin
  );
  if (!allowsTier(tier, access)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
