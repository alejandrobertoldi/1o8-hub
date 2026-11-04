import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { loadClientChecklists } from "@/lib/onboarding/checklist-server";

/** GET /api/clients/[code]/checklist — one client's profile checklist. */
export async function GET(_req: Request, { params }: { params: Promise<{ clientIdCode: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const code = (await params).clientIdCode.trim();
  const checklist = (await loadClientChecklists([code])).get(code);
  if (!checklist) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json(checklist);
}
