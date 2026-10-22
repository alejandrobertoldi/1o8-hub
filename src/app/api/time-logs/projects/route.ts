export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timeLogSession } from "@/lib/time-logs/auth";
import { listProjects } from "@/lib/time-logs/server";

/** GET /api/time-logs/projects?client=MSN&department=Paid%20Media */
export async function GET(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = req.nextUrl.searchParams.get("client");
  if (!client) return NextResponse.json({ error: "client is required" }, { status: 400 });
  return NextResponse.json(await listProjects(client, req.nextUrl.searchParams.get("department")));
}
