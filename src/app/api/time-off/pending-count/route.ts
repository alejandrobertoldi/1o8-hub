import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canApproveTimeOff, canSubmitTimeOff } from "@/lib/time-off/guards";
import { getPendingCount } from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/time-off/pending-count — nav badge source.
 *
 * Counts only the requests this person can decide (their assignees', the
 * unassigned ones; everything for owners / super admins).
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canApproveTimeOff(session.user.role)) {
    return NextResponse.json({ count: 0 });
  }

  const pendingCount = await getPendingCount({ id: session.user.id, role: session.user.role });
  return NextResponse.json({ count: pendingCount });
}
