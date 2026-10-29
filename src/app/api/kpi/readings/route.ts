import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { kpiReadings } from "@/lib/kpi/sync";

export const dynamic = "force-dynamic";

/** GET ?client= — Main KPI values this month and last month (one client, or all). */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = req.nextUrl.searchParams.get("client")?.trim().toUpperCase() || undefined;
  return NextResponse.json(await kpiReadings(client));
}
