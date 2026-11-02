import { hasAdminPowers, isHubStaff } from "@/lib/roles";
/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthlyReportAsanaLinks } from "@/lib/db/schema";
import {
  generateReport,
  resolveConfig,
  resolvePeriod,
  slugify,
  lastCompletedMonth,
} from "@/lib/monthly-report";
import {
  listActiveMonthlyClients,
  resolveMonthlyClient,
} from "@/lib/monthly-report/resolve-client";
import { saveMonthlyReportPdf } from "@/lib/monthly-report/drive-store";
import { fetchAccountDataThrough } from "@/lib/monthly-report/queries/account";
import { isMonthSettled } from "@/lib/monthly-report/settlement";
import {
  getMonthlyReport,
  listMonthlyReportSummaries,
  markMonthlyReportSendFailed,
  markMonthlyReportSent,
  updateMonthlyReportJson,
  updateMonthlyReportReview,
  upsertGeneratedMonthlyReport,
  type MonthlyReportStatus,
} from "@/lib/monthly-report/report-store";
import {
  canComment,
  canSend,
  commenterRole,
  nextReviewStatus,
  reviewPermissions,
  type ReviewAction,
} from "@/lib/monthly-report/review";
import { buildMonthlyReportEmail, formatIssuedDate } from "@/lib/monthly-report/letter";
import { staffThreadCopies } from "@/lib/monthly-report/recipients";
import { loadSendAddressBook } from "@/lib/monthly-report/send-context";
import {
  isFirstCeoQueueEntry,
  notifyCeoFirstQueue,
  notifyMonthlyReportStage,
  notifyPmReportsReady,
} from "@/lib/monthly-report/review-notify";
import { scheduleAsanaEnsureAndSync } from "@/lib/monthly-report/asana-link";
import { dispatchMonthlyClientLetter } from "@/lib/monthly-report/send-letter";
import { deliveryFromResend } from "@/lib/monthly-report/resend-status";
import { preserveSectionComments, applySectionComment } from "@/lib/monthly-report/section-comments";
import type { Report } from "@/components/monthly-report/types";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  getErrorMessage,
} from "@/lib/api-utils";

export const runtime = "nodejs";

async function persistClientLetter(opts: {
  report: Report;
  period: string;
  clientIdCode: string;
  accountManager: string | null;
  sentBy: string | null;
  requestedRecipients?: unknown;
  extraRecipients?: unknown;
  recordConflictAsFailed?: boolean;
  issuedAt?: Date | string | null;
}): Promise<NextResponse> {
  const result = await dispatchMonthlyClientLetter({
    report: opts.report,
    period: opts.period,
    clientIdCode: opts.clientIdCode,
    accountManager: opts.accountManager,
    requestedRecipients: opts.requestedRecipients,
    extraRecipients: opts.extraRecipients,
    issuedAt: opts.issuedAt,
  });
  if (!result.ok) {
    if (result.statusCode === 502 || opts.recordConflictAsFailed) {
      await markMonthlyReportSendFailed({
        clientIdCode: opts.clientIdCode,
        period: opts.period,
        error: result.error,
      });
    }
    return NextResponse.json(
      { error: result.error, status: result.statusCode === 502 ? "failed" : undefined, retryable: result.statusCode === 502 },
      { status: result.statusCode },
    );
  }
  await markMonthlyReportSent({
    clientIdCode: opts.clientIdCode,
    period: opts.period,
    sentTo: result.to,
    emailHtml: result.html,
    sentBy: opts.sentBy,
    resendEmailId: result.resendId,
  });
  return NextResponse.json({
    status: "sent",
    sentTo: result.to,
    replyTo: result.replyTo,
    cc: result.cc,
    clientIdCode: opts.clientIdCode,
    period: opts.period,
  });
}
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!isHubStaff(session.user.role)) return forbidden();

  const clientCode = req.nextUrl.searchParams.get("clientCode") ?? "";
  const rawPeriod = req.nextUrl.searchParams.get("period") ?? "";
  if (clientCode && rawPeriod) {
    const resolved = await resolveMonthlyClient(clientCode);
    if (resolved.status === "not_found") return notFound(`Unknown client code ${clientCode}`);
    if (resolved.status === "no_intentwise") {
      return badRequest(`No Intentwise account for ${resolved.name}`);
    }
    const row = await getMonthlyReport(resolved.client.clientIdCode, rawPeriod);
    if (!row) return notFound("No stored report for this client and period");
    if (req.nextUrl.searchParams.get("letter") === "1") {
      const stored = row.report && typeof row.report === "object" ? row.report as Report : null;
      if (!stored?.meta) {
        return notFound("No report data for this client and period");
      }
      const book = await loadSendAddressBook({
        clientIdCode: resolved.client.clientIdCode,
        accountManager: resolved.client.accountManager,
      });
      const thread = staffThreadCopies({
        to: book.recipients,
        accountManagerEmail: book.accountManagerEmail,
      });
      const letter = buildMonthlyReportEmail({
        report: stored,
        period: row.period,
        clientIdCode: row.clientIdCode,
        issuedAt: row.createdAt,
      });
      return NextResponse.json({
        subject: letter.subject,
        html: letter.html,
        text: letter.text,
        recipients: book.recipients,
        replyTo: thread.replyTo,
        cc: thread.cc,
        status: row.status,
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
        sentTo: Array.isArray(row.sentTo) ? row.sentTo : [],
        clientIdCode: row.clientIdCode,
        period: row.period,
      });
    }
    return NextResponse.json({
      report: row.report,
      skipped: row.skipped ?? [],
      createdAt: row.createdAt.toISOString(),
      driveUrl: row.driveUrl,
      htmlUrl: row.htmlUrl,
      status: row.status,
      reviewNote: row.reviewNote,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      sentTo: Array.isArray(row.sentTo) ? row.sentTo : [],
      clientIdCode: row.clientIdCode,
      period: row.period,
    });
  }

  const [clients, reports] = await Promise.all([
    listActiveMonthlyClients(),
    listMonthlyReportSummaries(),
  ]);
  // Never changes the response if the link table is missing/unreadable.
  const asanaUrl = await db.select({ parentUrl: monthlyReportAsanaLinks.parentUrl }).from(monthlyReportAsanaLinks)
    .orderBy(desc(monthlyReportAsanaLinks.period)).limit(1)
    .then((r) => r[0]?.parentUrl ?? null, () => null);
  const reportsWithDelivery = await Promise.all(reports.map(async (row) => ({
    ...row,
    sendDelivery: await deliveryFromResend({
      resendEmailId: row.resendEmailId,
      sentAt: row.sentAt,
      sentTo: row.sentTo,
      failed: row.status === "failed",
    }),
  })));
  return NextResponse.json({
    clients,
    reports: reportsWithDelivery,
    asanaUrl,
    viewer: {
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      canOverride: hasAdminPowers(session.user.role),
      canGenerate: hasAdminPowers(session.user.role),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  let body: {
    clientCode?: unknown;
    period?: unknown;
    skipPmNotify?: unknown;
    pmDigestClientCodes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const rawPeriod = typeof body.period === "string" ? body.period : "";
  if (!rawPeriod) return badRequest("Missing period");

  const digestCodes = Array.isArray(body.pmDigestClientCodes)
    ? body.pmDigestClientCodes.filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    : null;
  if (digestCodes) {
    let period;
    try {
      period = resolvePeriod(rawPeriod);
    } catch (err) {
      return badRequest(getErrorMessage(err, "Invalid period"));
    }
    const clients = await listActiveMonthlyClients();
    const wanted = new Set(digestCodes);
    const rows = clients.filter((c) => wanted.has(c.clientIdCode));
    await notifyPmReportsReady({ periodLabel: period.label, rows });
    // Regenerate resets the report to "generated": create the task if missing, then reopen any ticked subtasks.
    scheduleAsanaEnsureAndSync(rawPeriod);
    return NextResponse.json({ ok: true, notified: rows.length });
  }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  if (!clientCode) return badRequest("Missing clientCode");

  const maxPeriod = lastCompletedMonth();
  if (rawPeriod > maxPeriod) {
    return badRequest(`Period ${rawPeriod} is in the future or not yet complete (latest: ${maxPeriod})`);
  }

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
  const { name: clientName, accountId, clientIdCode, accountManager } = resolved.client;
  const client = { name: clientName, accountId, slug: slugify(clientName), clientIdCode, accountManager };

  const dataThrough = await fetchAccountDataThrough(accountId);
  if (!isMonthSettled(period.end, dataThrough)) {
    return NextResponse.json(
      {
        error: `Intentwise data through ${dataThrough ?? "none"} has not reached ${period.end}`,
        retryable: true,
        code: "data_not_settled",
        dataThrough,
      },
      { status: 409 },
    );
  }

  try {
    const t0 = Date.now();
    const config = await resolveConfig(accountId);
    const payload = await generateReport(client, period, config);
    const existing = await getMonthlyReport(clientIdCode, period.period);
    const report = preserveSectionComments(payload.report, existing?.report);
    if (existing?.createdAt) {
      const issued = formatIssuedDate(existing.createdAt);
      if (issued) report.meta.issued = issued;
    }
    console.info("[monthly-report] data", { clientIdCode, ms: Date.now() - t0 });
    const origin = req.headers.get("x-forwarded-proto") && req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
      : "http://localhost:3000";
    const t1 = Date.now();
    const saved = await saveMonthlyReportPdf({
      clientIdCode,
      period: period.period,
      report,
      origin,
    });
    console.info("[monthly-report] pdf+drive", { clientIdCode, ms: Date.now() - t1 });
    await upsertGeneratedMonthlyReport({
      clientIdCode,
      period: period.period,
      report,
      skipped: payload.skipped,
      driveUrl: saved.driveUrl,
      htmlUrl: saved.htmlUrl,
      dataThrough,
      generatedBy: session.user.id ?? null,
    });
    try {
      if (body.skipPmNotify !== true) {
        await notifyPmReportsReady({
          periodLabel: period.label,
          rows: [{ name: clientName, projectManager: resolved.client.projectManager }],
        });
      }
    } catch (err) {
      console.error("[monthly-report] PM notify failed", err);
    }
    // Regenerate resets the report to "generated": create the task if missing, then reopen any ticked subtasks.
    scheduleAsanaEnsureAndSync(period.period);
    return NextResponse.json({
      skipped: payload.skipped,
      driveUrl: saved.driveUrl,
      htmlUrl: saved.htmlUrl,
      clientIdCode,
      status: "generated",
    });
  } catch (err) {
    const msg = getErrorMessage(err);
    console.error("[monthly-report] generate failed", err);
    const retryable = /redshift|econn|timeout|network|etxtbsy|text file busy/i.test(msg);
    return NextResponse.json(
      { error: msg, retryable },
      { status: retryable ? 502 : 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!isHubStaff(session.user.role)) return forbidden();

  let body: {
    clientCode?: unknown;
    period?: unknown;
    action?: unknown;
    note?: unknown;
    recipients?: unknown;
    extraRecipients?: unknown;
    sectionId?: unknown;
    text?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  const rawPeriod = typeof body.period === "string" ? body.period : "";
  const action = body.action;
  if (!clientCode) return badRequest("Missing clientCode");
  if (!rawPeriod) return badRequest("Missing period");
  if (action !== "approve" && action !== "send_back" && action !== "send" && action !== "comment") {
    return badRequest("action must be approve, send_back, send, or comment");
  }

  const resolved = await resolveMonthlyClient(clientCode);
  if (resolved.status === "not_found") return notFound(`Unknown client code ${clientCode}`);
  if (resolved.status === "no_intentwise") {
    return badRequest(`No Intentwise account for ${resolved.name}`);
  }

  const row = await getMonthlyReport(resolved.client.clientIdCode, rawPeriod);
  if (!row) return notFound("No stored report for this client and period");

  const perms = reviewPermissions({
    userName: session.user.name,
    userEmail: session.user.email,
    projectManager: resolved.client.projectManager,
    accountManager: resolved.client.accountManager,
    canOverride: hasAdminPowers(session.user.role),
  });

  if (action === "comment") {
    const role = commenterRole(perms);
    if (!canComment(perms) || !role) {
      return NextResponse.json({ error: "Only the AM or CEO can add client notes" }, { status: 403 });
    }
    const stored = row.report && typeof row.report === "object" ? row.report as Report : null;
    if (!stored?.meta) {
      return notFound("No report data for this client and period");
    }
    const next = applySectionComment(stored, {
      sectionId: body.sectionId,
      text: body.text,
      authorName: session.user.name,
      role,
      updatedAt: new Date().toISOString(),
    });
    if (!next.ok) return badRequest(next.error);
    await updateMonthlyReportJson({
      clientIdCode: resolved.client.clientIdCode,
      period: rawPeriod,
      report: next.report,
    });
    return NextResponse.json({
      report: next.report,
      clientIdCode: resolved.client.clientIdCode,
      period: rawPeriod,
    });
  }

  if (action === "send") {
    if (!canSend(row.status as MonthlyReportStatus, perms)) {
      if (row.status !== "ready" && row.status !== "failed") {
        return NextResponse.json(
          { error: `Report is ${row.status}, not ready to send` },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Only the CEO can send" }, { status: 403 });
    }
    const stored = row.report && typeof row.report === "object" ? row.report as Report : null;
    if (!stored?.meta) {
      return notFound("No report data for this client and period");
    }
    const sent = await persistClientLetter({
      report: stored,
      period: rawPeriod,
      clientIdCode: resolved.client.clientIdCode,
      accountManager: resolved.client.accountManager,
      sentBy: session.user.id ?? null,
      requestedRecipients: body.recipients,
      extraRecipients: body.extraRecipients,
      issuedAt: row.createdAt,
    });
    scheduleAsanaEnsureAndSync(rawPeriod);
    return sent;
  }

  const reviewAction = action as ReviewAction;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const next = nextReviewStatus(
    row.status as MonthlyReportStatus,
    reviewAction,
    perms,
  );
  if (!next.ok) {
    return NextResponse.json({ error: next.error }, { status: next.statusCode });
  }

  const reviewNote = reviewAction === "send_back" ? (note || null) : null;
  await updateMonthlyReportReview({
    clientIdCode: resolved.client.clientIdCode,
    period: rawPeriod,
    status: next.status,
    reviewNote,
  });
  scheduleAsanaEnsureAndSync(rawPeriod);
  let periodLabel = rawPeriod;
  try {
    periodLabel = resolvePeriod(rawPeriod).label;
  } catch {
    /* keep YYYY-MM */
  }

  if (reviewAction === "approve" && next.status === "ready") {
    const stored = row.report && typeof row.report === "object" ? row.report as Report : null;
    if (!stored?.meta) {
      await markMonthlyReportSendFailed({
        clientIdCode: resolved.client.clientIdCode,
        period: rawPeriod,
        error: "No report data for this client and period",
      });
      return NextResponse.json(
        { error: "No report data for this client and period", status: "failed", retryable: true },
        { status: 409 },
      );
    }
    return persistClientLetter({
      report: stored,
      period: rawPeriod,
      clientIdCode: resolved.client.clientIdCode,
      accountManager: resolved.client.accountManager,
      sentBy: session.user.id ?? null,
      recordConflictAsFailed: true,
      issuedAt: row.createdAt,
    });
  }

  try {
    if (next.status === "jake_review") {
      const summaries = await listMonthlyReportSummaries();
      const periodRows = summaries.filter((s) => s.period === rawPeriod);
      if (isFirstCeoQueueEntry(periodRows, resolved.client.clientIdCode)) {
        await notifyCeoFirstQueue({ periodLabel });
      }
    } else {
      await notifyMonthlyReportStage({
        status: next.status,
        previousStatus: row.status as MonthlyReportStatus,
        clientName: resolved.client.name,
        periodLabel,
        projectManager: resolved.client.projectManager,
        accountManager: resolved.client.accountManager,
        note: reviewNote,
      });
    }
  } catch (err) {
    console.error("[monthly-report] stage notify failed", err);
  }
  return NextResponse.json({
    status: next.status,
    reviewNote,
    clientIdCode: resolved.client.clientIdCode,
    period: rawPeriod,
  });
}
