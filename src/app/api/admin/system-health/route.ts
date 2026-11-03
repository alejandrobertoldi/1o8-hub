export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { claudeUsage, dailyJobs, databaseHealth, integrations, recentErrors, vercelUsage } from "@/lib/system-health/server";

/** GET — plan capacity (database, Vercel), the daily jobs, keys set, Claude usage and recent errors. */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [database, vercel, jobs, claude, errors] = await Promise.all([databaseHealth(), vercelUsage(), dailyJobs(), claudeUsage(), recentErrors()]);
  return NextResponse.json({ checkedAt: new Date().toISOString(), database, vercel, ...jobs, integrations: integrations(), claude, recentErrors: errors });
}
