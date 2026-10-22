import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import {
  generateReport, resolveConfig, resolvePeriod, slugify, lastCompletedMonth,
} from "@/lib/monthly-report";
import { resolveMonthlyClient } from "@/lib/monthly-report/resolve-client";
import { signReportToken } from "@/lib/monthly-report/pdf-token";
import { badRequest, forbidden, notFound, unauthorized, getErrorMessage } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 30;

// Returns a signed print URL; the browser opens it and uses window.print().
// Puppeteer/Lambda-based PDF generation is not viable on Vercel (missing libnss3).
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  let body: { clientCode?: unknown; period?: unknown };
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  const rawPeriod  = typeof body.period    === "string" ? body.period    : "";
  if (!clientCode) return badRequest("Missing clientCode");
  if (!rawPeriod)  return badRequest("Missing period");

  const maxPeriod = lastCompletedMonth();
  if (rawPeriod > maxPeriod) return badRequest(`Period ${rawPeriod} not complete`);

  let period;
  try { period = resolvePeriod(rawPeriod); } catch (err) { return badRequest(getErrorMessage(err, "Invalid period")); }

  const resolved = await resolveMonthlyClient(clientCode);
  if (resolved.status === "not_found") return notFound(`Unknown client code ${clientCode}`);
  if (resolved.status === "no_intentwise") {
    return badRequest(`No Intentwise account for ${resolved.name}`);
  }
  const { name: clientName, accountId, clientIdCode, accountManager } = resolved.client;
  const client = { name: clientName, accountId, slug: slugify(clientName), clientIdCode, accountManager };

  try {
    const config  = await resolveConfig(accountId);
    const payload = await generateReport(client, period, config);
    const token   = signReportToken({ report: payload.report });

    const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
      : "http://localhost:3000";

    const printUrl = `${origin}/reports/monthly/print?token=${encodeURIComponent(token)}&autoprint=1`;
    const filename = `${client.slug}-${period.period}-mf-monthly`;

    return NextResponse.json({ printUrl, filename });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
