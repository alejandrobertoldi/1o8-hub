export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { syncKpis } from "@/lib/kpi/sync";

/** Daily: pull every client's KPI sources (GA4 for now) through yesterday. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await syncKpis("daily");
  return NextResponse.json({ pulled: r.clients.length, errors: r.clients.filter((c) => c.error).length });
}
