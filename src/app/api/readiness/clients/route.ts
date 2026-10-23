export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { clientReadiness } from "@/lib/readiness/server";
import { guarded } from "@/lib/db/guarded-route";

/** GET /api/readiness/clients — open / due today / overdue / readiness per client (live). */
async function getHandler() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await clientReadiness());
}

export const GET = guarded("GET /api/readiness/clients", 15_000, getHandler);
