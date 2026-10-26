export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { aacSheetConfigured, aacSheetTarget } from "@/lib/aac-sync/google";
import { lastAacRuns, syncAac } from "@/lib/aac-sync/sync";

async function admin() {
  const s = await getAuthSession();
  return s && hasAdminPowers(s.user.role) ? s : null;
}

/** GET — sync status and recent runs (admins). */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can see the AAC sheet sync" }, { status: 403 });
  const { spreadsheetId, tab } = aacSheetTarget();
  return NextResponse.json({
    configured: aacSheetConfigured(),
    spreadsheetId,
    isTestCopy: !!process.env.AAC_SYNC_SPREADSHEET_ID && process.env.AAC_SYNC_SPREADSHEET_ID !== process.env.AAC_SPREADSHEET_ID,
    tab,
    runs: await lastAacRuns(15),
  });
}

/** POST { preview?: boolean } — run a full sync now, or a dry run. */
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "Only admins can run the AAC sheet sync" }, { status: 403 });
  if (!aacSheetConfigured()) return NextResponse.json({ error: "AAC sheet sync is not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { preview?: boolean };
  try {
    return NextResponse.json(await syncAac({ trigger: "manual", dryRun: !!body.preview }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
