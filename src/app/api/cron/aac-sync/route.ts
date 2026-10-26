export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { aacSheetConfigured } from "@/lib/aac-sync/google";
import { syncAac } from "@/lib/aac-sync/sync";

/** Daily full two-way sync with the AAC sheet: a backstop for missed edit hooks. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!aacSheetConfigured()) return NextResponse.json({ skipped: true, reason: "AAC sheet sync is not configured" });
  try {
    const r = await syncAac({ trigger: "daily" });
    return NextResponse.json({ toHub: r.toHub.length, toSheet: r.toSheet.length, created: r.createdInHub.length, appended: r.appendedToSheet.length, needsCode: r.needsCode.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
