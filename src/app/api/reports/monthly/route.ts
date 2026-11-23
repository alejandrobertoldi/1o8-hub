export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { generateReport, listReports } from "@/lib/client-report/load";
import { isPeriod } from "@/lib/client-report/period";

/** Generating needs a hub staff role that edits (viewers only read). */
const canGenerate = (role: string | undefined) => isHubStaff(role) && role !== "viewer";

/** GET ?period=YYYY-MM — every active client with its data sources and report for the month. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const period = req.nextUrl.searchParams.get("period");
  if (!isPeriod(period)) return NextResponse.json({ error: "period (YYYY-MM) is required" }, { status: 400 });
  return NextResponse.json({ period, clients: await listReports(period), canGenerate: canGenerate(session.user.role) });
}

/**
 * POST { period, code } — builds (or rebuilds) one client's report numbers.
 * POST { period, codes: [...] } — several, one after another.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canGenerate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { period?: unknown; code?: unknown; codes?: unknown } | null;
  const period = body?.period;
  if (!isPeriod(period)) return NextResponse.json({ error: "period (YYYY-MM) is required" }, { status: 400 });
  const codes = (Array.isArray(body?.codes) ? body.codes : [body?.code]).filter((c): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(c));
  if (!codes.length) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const results: { code: string; ok: boolean; error?: string }[] = [];
  for (const code of codes) {
    try {
      const row = await generateReport(code, period, session.user.id ?? null);
      results.push(row ? { code, ok: true } : { code, ok: false, error: "Client not found" });
    } catch (e) {
      console.error("[client-report] generate", code, period, e);
      results.push({ code, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ results }, { status: failed.length === results.length ? 500 : 200 });
}
