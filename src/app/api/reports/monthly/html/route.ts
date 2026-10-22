import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { resolvePeriod } from "@/lib/monthly-report";
import { resolveMonthlyClient } from "@/lib/monthly-report/resolve-client";
import { findMonthlyReportHtml } from "@/lib/monthly-report/drive-store";
import { driveClient } from "@/lib/drive-client";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  getErrorMessage,
} from "@/lib/api-utils";
import { isHubStaff } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!isHubStaff(session.user.role)) return forbidden();

  const clientCode = req.nextUrl.searchParams.get("clientCode") ?? "";
  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "";
  if (!clientCode) return badRequest("Missing clientCode");
  if (!rawPeriod) return badRequest("Missing period");

  let period;
  try {
    period = resolvePeriod(rawPeriod);
  } catch (err) {
    return badRequest(getErrorMessage(err, "Invalid period"));
  }

  const resolved = await resolveMonthlyClient(clientCode);
  if (resolved.status === "not_found") return notFound(`Unknown client code ${clientCode}`);
  if (resolved.status === "no_intentwise") {
    return badRequest(`No Intentwise account for ${resolved.name}`);
  }

  try {
    const file = await findMonthlyReportHtml({
      clientIdCode: resolved.client.clientIdCode,
      period: period.period,
    });
    if (!file) {
      return notFound("No HTML archive for this report. Generate the report first.");
    }

    const bytes = await driveClient.downloadFileContent(file.driveId);
    const safeName = file.filename.replace(/["\\\n\r]/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (err) {
    console.error("[monthly-report] html download failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
