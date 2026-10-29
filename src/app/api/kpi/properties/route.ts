import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { listGa4Properties } from "@/lib/kpi/ga4";

/** GET — GA4 properties the connected account can read (client profile dropdown). */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await listGa4Properties());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
