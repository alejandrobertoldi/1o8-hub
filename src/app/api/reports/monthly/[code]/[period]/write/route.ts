export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canEditReports } from "@/lib/client-report/access";
import { getReport } from "@/lib/client-report/load";
import { isPeriod } from "@/lib/client-report/period";
import { isTextSection } from "@/lib/client-report/text";
import type { ClientReportData } from "@/lib/client-report/types";
import { WriterError, writeReportTexts } from "@/lib/client-report/writer";

/**
 * POST { sections?: string[], instruction?: string } — Claude writes the
 * report's commentary (every section when none are given) or rewrites the
 * given ones following the instruction. Saved as new versions.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string; period: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditReports(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { code, period } = await params;
  if (!isPeriod(period)) return NextResponse.json({ error: "Bad period" }, { status: 400 });
  const row = await getReport(code, period);
  if (!row) return NextResponse.json({ error: "Generate the report first" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { sections?: unknown; instruction?: unknown };
  const keys = Array.isArray(body.sections) ? body.sections.filter(isTextSection) : [];
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 1000) : undefined;
  try {
    const result = await writeReportTexts({
      reportId: row.id,
      data: row.data as ClientReportData,
      keys,
      instruction,
      actor: { id: session.user.id ?? null, email: session.user.email ?? null, name: session.user.name ?? null },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WriterError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[client-report] write", code, period, e);
    return NextResponse.json({ error: "Claude couldn't write the report. Check the server logs." }, { status: 500 });
  }
}
