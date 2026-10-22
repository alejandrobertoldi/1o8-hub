import { hasAdminPowers } from "@/lib/roles";
// ═══════════════════════════════════════════════════════════════
// GET /api/drive/ping
// Admin-only smoke test — verifies Drive credentials, shared drive
// access, and env vars are all correctly configured end-to-end.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";

export const maxDuration = 60;

export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await driveClient.ping();
    return NextResponse.json({
      ok: true,
      driveId: result.driveId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
