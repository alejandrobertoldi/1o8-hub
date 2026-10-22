import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canSubmitTimeOff, isApprover } from "@/lib/time-off/guards";
import { getPendingCount } from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/time-off/pending-count — nav badge source.
 *
 * Jake-only: he is the only person who can act on a pending request
 * (spec D2), so a badge on any other admin's screen would be noise. Other
 * admins still see the full queue read-only at /calendar/requests.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isApprover(session.user.email)) {
    return NextResponse.json({ count: 0 });
  }

  const pendingCount = await getPendingCount();
  return NextResponse.json({ count: pendingCount });
}
