export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { listAssignments } from "@/lib/team/assignments";

/** GET /api/team/assignments — who covers which role on every active account (AAC). */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listAssignments());
}
