export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { hasAsanaToken } from "@/lib/onboarding/create-asana-project";
import { dbAsanaSyncDeps, recordSyncState, runAsanaSync } from "@/lib/my-dashboard/asana-sync";

/** POST /api/readiness/sync — admins refresh the Asana mirror now (read-only towards Asana). */
export async function POST() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can sync Asana" }, { status: 403 });
  if (!hasAsanaToken()) return NextResponse.json({ error: "ASANA_ACCESS_TOKEN is not configured" }, { status: 400 });
  try {
    const r = await runAsanaSync(dbAsanaSyncDeps());
    await recordSyncState({ ok: true, open: r.open });
    return NextResponse.json(r);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncState({ ok: false, error: message }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
