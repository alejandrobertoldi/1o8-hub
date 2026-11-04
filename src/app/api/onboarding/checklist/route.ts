import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { loadClientChecklists } from "@/lib/onboarding/checklist-server";

/** GET /api/onboarding/checklist — every client's profile checklist, for the onboarding summary. */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(Object.fromEntries(await loadClientChecklists()));
}
