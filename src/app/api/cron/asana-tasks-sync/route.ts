/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
// Every 15 min: mirror open tasks of Asana project 1216052535915202 (which multi-homes every
// task in the workspace) into asana_tasks for the /me dashboard. Read-only towards Asana.
import { NextRequest, NextResponse } from "next/server";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { dbAsanaSyncDeps, recordSyncState, runAsanaSync } from "@/lib/my-dashboard/asana-sync";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAsanaToken()) return NextResponse.json({ skipped: true, reason: "No Asana token" });
  try {
    const result = await runAsanaSync(dbAsanaSyncDeps());
    await recordSyncState({ ok: true, open: result.open });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncState({ ok: false, error: message }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
