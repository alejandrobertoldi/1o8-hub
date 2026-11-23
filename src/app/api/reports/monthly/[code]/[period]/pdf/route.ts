export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { getReport } from "@/lib/client-report/load";
import { isPeriod } from "@/lib/client-report/period";
import { renderReportPdf, reportPdfName } from "@/lib/client-report/pdf";
import type { ClientReportData } from "@/lib/client-report/types";

/** GET — the saved report as a PDF download. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string; period: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { code, period } = await params;
  if (!isPeriod(period)) return NextResponse.json({ error: "Bad period" }, { status: 400 });
  const row = await getReport(code, period);
  if (!row) return NextResponse.json({ error: "Not generated yet" }, { status: 404 });
  const data = row.data as ClientReportData;
  try {
    const pdf = await renderReportPdf(req.nextUrl.origin, data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("inline") ? "inline" : "attachment"}; filename="${reportPdfName(data)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[client-report] pdf", code, period, e);
    return NextResponse.json({ error: "Could not build the PDF" }, { status: 500 });
  }
}
