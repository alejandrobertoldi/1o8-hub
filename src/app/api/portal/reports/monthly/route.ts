import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { resolvePeriod } from "@/lib/monthly-report/period";
import {
  getMonthlyReport,
  listMonthlyReportsForClient,
  type MonthlyReportStatus,
} from "@/lib/monthly-report/report-store";
import { unauthorized, forbidden, badRequest, notFound } from "@/lib/api-utils";
import type { Report } from "@/components/monthly-report/types";

export const runtime = "nodejs";

const LISTABLE_STATUSES = new Set<MonthlyReportStatus>([
  "generated",
  "pm_review",
  "am_review",
  "ready",
  "sent",
]);

function firstClientCode(raw: string | null | undefined): string {
  return (raw ?? "").split(",")[0]?.trim() ?? "";
}

function periodLabel(period: string): string {
  try {
    return resolvePeriod(period).label;
  } catch {
    return period;
  }
}

function resolvePortalClient(
  session: { user: { role: string; clientIdCode?: string | null } },
  previewClient: string,
): { clientIdCode: string } | { error: ReturnType<typeof badRequest> | ReturnType<typeof notFound> } {
  const isAdmin = hasAdminPowers(session.user.role);
  const clientIdCode = isAdmin
    ? previewClient
    : firstClientCode(session.user.clientIdCode);

  if (isAdmin && !clientIdCode) {
    return { error: badRequest("client is required") };
  }
  if (!clientIdCode) {
    return { error: notFound("No client linked to your session") };
  }
  return { clientIdCode };
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  const isAdmin = hasAdminPowers(session.user.role);
  const previewClient = req.nextUrl.searchParams.get("client")?.trim() ?? "";
  const resolved = resolvePortalClient(session, previewClient);
  if ("error" in resolved) return resolved.error;
  const { clientIdCode } = resolved;

  const role = session.user.role;
  const isPortalUser = role === "client" || role === "prospect";
  if (!isPortalUser && !isAdmin) return forbidden();

  const rawPeriod = req.nextUrl.searchParams.get("period")?.trim() ?? "";
  if (!rawPeriod) {
    const rows = await listMonthlyReportsForClient(clientIdCode);
    const reports = rows
      .filter((row) => (isPortalUser ? row.status === "sent" : LISTABLE_STATUSES.has(row.status)))
      .map((row) => ({
        period: row.period,
        label: periodLabel(row.period),
        status: row.status,
      }));
    return NextResponse.json({ reports, clientIdCode });
  }

  try {
    resolvePeriod(rawPeriod);
  } catch {
    return badRequest("Invalid period (expected YYYY-MM)");
  }

  const row = await getMonthlyReport(clientIdCode, rawPeriod);
  const stored = row?.report && typeof row.report === "object" ? row.report as Report : null;
  if (!row || !stored?.meta) {
    return notFound("No monthly report for this period");
  }

  if (isPortalUser && row.status !== "sent") {
    return notFound("No monthly report for this period");
  }

  return NextResponse.json({
    report: stored,
    period: row.period,
    status: row.status,
    clientIdCode: row.clientIdCode,
  });
}
