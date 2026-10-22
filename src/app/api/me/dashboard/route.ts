import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { resolveTargetUser, resolveToday } from "@/lib/my-dashboard/access";
import { loadMyDashboard } from "@/lib/my-dashboard/load";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const viewer = { id: session.user.id as string, role: (session.user.role as string | undefined) ?? null };
  const target = resolveTargetUser(viewer, req.nextUrl.searchParams.get("user"));
  if (!target.ok) return NextResponse.json({ error: "Forbidden" }, { status: target.status });
  const today = resolveToday(req.nextUrl.searchParams.get("today"));
  const payload = await loadMyDashboard(target.id, { id: viewer.id, canPick: target.canPick }, today);
  if (!payload) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(payload);
}
