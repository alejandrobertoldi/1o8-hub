import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { aggregateClientReport } from "@/lib/client-report";
import { generateXlsx } from "@/lib/report-xlsx";
import { generatePdf } from "@/lib/report-pdf";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "reports")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const client = params.get("client");
  const format = params.get("format") || "xlsx";
  const fromParam = params.get("from");
  const toParam = params.get("to");

  if (!client) {
    return NextResponse.json(
      { error: "client parameter is required" },
      { status: 400 }
    );
  }

  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json(
      { error: "format must be xlsx or pdf" },
      { status: 400 }
    );
  }

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const reportData = await aggregateClientReport(client, from, to);

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = generateXlsx(reportData);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${client}_report_${dateStamp}.xlsx"`,
      },
    });
  }

  const buffer = generatePdf(reportData);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${client}_report_${dateStamp}.pdf"`,
    },
  });
}