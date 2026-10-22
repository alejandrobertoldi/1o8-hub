// Every morning (vercel.json): refresh the Asana mirror, then save today's
// Readiness snapshot. Read-only towards Asana.
import { NextRequest, NextResponse } from "next/server";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { dbAsanaSyncDeps, recordSyncState, runAsanaSync } from "@/lib/my-dashboard/asana-sync";
import { captureSnapshot } from "@/lib/readiness/server";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let sync: unknown = { skipped: "No Asana token" };
  if (hasAsanaToken()) {
    try {
      const r = await runAsanaSync(dbAsanaSyncDeps());
      await recordSyncState({ ok: true, open: r.open });
      sync = r;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordSyncState({ ok: false, error: message }).catch(() => {});
      sync = { error: message };
    }
  }
  // Snapshot even if the sync failed: yesterday's mirror is better than a gap.
  return NextResponse.json({ sync, snapshot: await captureSnapshot() });
}
