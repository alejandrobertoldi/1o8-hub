export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timeLogSession } from "@/lib/time-logs/auth";
import { listDepartmentEstimates, saveDepartmentEstimates } from "@/lib/time-logs/estimates";

/** GET: every client's monthly estimate by department (admins and up). */
export async function GET() {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.teamReports) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listDepartmentEstimates());
}

/** PUT { client, estimates: { [department]: monthlyHours } } replaces that client's split (admins and up). */
export async function PUT(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.teamReports) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { client?: unknown; estimates?: unknown } | null;
  const client = typeof body?.client === "string" ? body.client.trim().slice(0, 100) : "";
  if (!client || !body?.estimates || typeof body.estimates !== "object") {
    return NextResponse.json({ error: "client and estimates are required" }, { status: 400 });
  }
  const saved = await saveDepartmentEstimates(client, body.estimates as Record<string, unknown>, me.userId);
  return NextResponse.json({ client: client.toUpperCase(), estimates: saved });
}
