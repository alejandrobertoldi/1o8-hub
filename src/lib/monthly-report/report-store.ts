import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthlyReports } from "@/lib/db/schema";
import type { Report } from "@/components/monthly-report/types";
import type { SectionKey } from "./types";
import { clearGenerateFailure } from "./generate-failures";
import { preserveSectionComments } from "./section-comments";
import { stripAppendixFromReport } from "./strip-appendix";

export type MonthlyReportStatus =
  | "blocked"
  | "generated"
  | "pm_review"
  | "am_review"
  | "jake_review"
  | "ready"
  | "sent"
  | "failed";

export type MonthlyReportSummary = {
  clientIdCode: string;
  period: string;
  status: MonthlyReportStatus;
  skipped: SectionKey[];
  driveUrl: string | null;
  htmlUrl: string | null;
  dataThrough: string | null;
  reviewNote: string | null;
  sentAt: string | null;
  sentTo: string[];
  sendError: string | null;
  resendEmailId: string | null;
  createdAt: string;
};

export async function listMonthlyReportSummaries(): Promise<MonthlyReportSummary[]> {
  const rows = await db
    .select({
      clientIdCode: monthlyReports.clientIdCode,
      period: monthlyReports.period,
      status: monthlyReports.status,
      skipped: monthlyReports.skipped,
      driveUrl: monthlyReports.driveUrl,
      htmlUrl: monthlyReports.htmlUrl,
      dataThrough: monthlyReports.dataThrough,
      reviewNote: monthlyReports.reviewNote,
      sentAt: monthlyReports.sentAt,
      sentTo: monthlyReports.sentTo,
      sendError: monthlyReports.sendError,
      resendEmailId: monthlyReports.resendEmailId,
      createdAt: monthlyReports.createdAt,
    })
    .from(monthlyReports);

  return rows.map((row) => ({
    clientIdCode: row.clientIdCode,
    period: row.period,
    status: row.status as MonthlyReportStatus,
    skipped: (row.skipped ?? []) as SectionKey[],
    driveUrl: row.driveUrl,
    htmlUrl: row.htmlUrl,
    dataThrough: row.dataThrough,
    reviewNote: row.reviewNote,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    sentTo: Array.isArray(row.sentTo) ? row.sentTo : [],
    sendError: row.sendError ?? null,
    resendEmailId: row.resendEmailId ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getMonthlyReport(clientIdCode: string, period: string) {
  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(and(
      eq(monthlyReports.clientIdCode, clientIdCode),
      eq(monthlyReports.period, period),
    ))
    .limit(1);
  return row
    ? { ...row, report: stripAppendixFromReport(row.report) }
    : null;
}

export type PortalMonthlyReportListItem = {
  period: string;
  status: MonthlyReportStatus;
  sentAt: string | null;
};

export async function listMonthlyReportsForClient(
  clientIdCode: string,
): Promise<PortalMonthlyReportListItem[]> {
  const rows = await db
    .select({
      period: monthlyReports.period,
      status: monthlyReports.status,
      sentAt: monthlyReports.sentAt,
      report: monthlyReports.report,
    })
    .from(monthlyReports)
    .where(eq(monthlyReports.clientIdCode, clientIdCode))
    .orderBy(desc(monthlyReports.period));

  return rows
    .filter((row) => row.report && typeof row.report === "object")
    .map((row) => ({
      period: row.period,
      status: row.status as MonthlyReportStatus,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    }));
}

export async function upsertGeneratedMonthlyReport(opts: {
  clientIdCode: string;
  period: string;
  report: unknown;
  skipped: SectionKey[];
  driveUrl: string | null;
  htmlUrl: string | null;
  dataThrough: string | null;
  generatedBy?: string | null;
}): Promise<void> {
  const existing = await getMonthlyReport(opts.clientIdCode, opts.period);
  const report = stripAppendixFromReport(
    preserveSectionComments(opts.report as Report, existing?.report),
  );
  await db
    .insert(monthlyReports)
    .values({
      clientIdCode: opts.clientIdCode,
      period: opts.period,
      status: "generated",
      report,
      skipped: opts.skipped,
      driveUrl: opts.driveUrl,
      htmlUrl: opts.htmlUrl,
      dataThrough: opts.dataThrough,
      reviewNote: null,
      generatedBy: opts.generatedBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [monthlyReports.clientIdCode, monthlyReports.period],
      set: {
        status: "generated",
        report,
        skipped: opts.skipped,
        driveUrl: opts.driveUrl,
        htmlUrl: opts.htmlUrl,
        dataThrough: opts.dataThrough,
        reviewNote: null,
        generatedBy: opts.generatedBy ?? null,
        updatedAt: new Date(),
      },
    });
  await clearGenerateFailure(opts.clientIdCode, opts.period).catch(() => {});
}

export async function updateMonthlyReportJson(opts: {
  clientIdCode: string;
  period: string;
  report: Report;
}): Promise<void> {
  await db
    .update(monthlyReports)
    .set({
      report: stripAppendixFromReport(opts.report),
      updatedAt: new Date(),
    })
    .where(and(
      eq(monthlyReports.clientIdCode, opts.clientIdCode),
      eq(monthlyReports.period, opts.period),
    ));
}

export async function updateMonthlyReportReview(opts: {
  clientIdCode: string;
  period: string;
  status: MonthlyReportStatus;
  reviewNote: string | null;
}): Promise<void> {
  await db
    .update(monthlyReports)
    .set({
      status: opts.status,
      reviewNote: opts.reviewNote,
      updatedAt: new Date(),
    })
    .where(and(
      eq(monthlyReports.clientIdCode, opts.clientIdCode),
      eq(monthlyReports.period, opts.period),
    ));
}

export async function markMonthlyReportSent(opts: {
  clientIdCode: string;
  period: string;
  sentTo: string[];
  emailHtml: string;
  sentBy: string | null;
  resendEmailId?: string | null;
}): Promise<void> {
  await db
    .update(monthlyReports)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentTo: opts.sentTo,
      emailHtml: opts.emailHtml,
      sentBy: opts.sentBy,
      sendError: null,
      resendEmailId: opts.resendEmailId ?? null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(monthlyReports.clientIdCode, opts.clientIdCode),
      eq(monthlyReports.period, opts.period),
    ));
}

export async function markMonthlyReportSendFailed(opts: {
  clientIdCode: string;
  period: string;
  error: string;
}): Promise<void> {
  await db
    .update(monthlyReports)
    .set({
      status: "failed",
      sendError: opts.error,
      updatedAt: new Date(),
    })
    .where(and(
      eq(monthlyReports.clientIdCode, opts.clientIdCode),
      eq(monthlyReports.period, opts.period),
    ));
}
