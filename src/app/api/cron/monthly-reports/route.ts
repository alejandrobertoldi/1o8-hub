/* eslint-disable react-doctor/server-fetch-without-revalidate */
import { NextResponse } from "next/server";
import { generateReport, resolveConfig, resolvePeriod, lastCompletedMonth, slugify } from "@/lib/monthly-report";
import { listActiveMonthlyClients, type MonthlyListClient } from "@/lib/monthly-report/resolve-client";
import { saveMonthlyReportPdf } from "@/lib/monthly-report/drive-store";
import { fetchAccountDataThrough } from "@/lib/monthly-report/queries/account";
import { isMonthSettled } from "@/lib/monthly-report/settlement";
import { getMonthlyReport, upsertGeneratedMonthlyReport } from "@/lib/monthly-report/report-store";
import { notifyPmReportsReady } from "@/lib/monthly-report/review-notify";
import { scheduleAsanaEnsureAndSync } from "@/lib/monthly-report/asana-link";
import { MONTHLY_REPORT_EMAIL_ASSET_ORIGIN } from "@/lib/monthly-report/letter";
import { resolveBaseUrl } from "@/lib/sales-warm";
import { cappedClients, recordGenerateFailure } from "@/lib/monthly-report/generate-failures";
import { getErrorMessage } from "@/lib/api-utils";
import type { MonthlyPeriod } from "@/lib/monthly-report/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type CronResult = { client: string; status: string; error?: string };

// The Asana ensure runs in after(), inside this function's 300s budget. Past 200s it could be killed between an
// Asana create and the DB save, so leave it to the next 30-min run on the 4th instead.
const ASANA_SCHEDULE_BUDGET_MS = 200_000;

function cronAuth(req: Request): string | null {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) return null;
  return cronSecret;
}

async function generateOne(
  row: MonthlyListClient,
  periodKey: string,
  period: MonthlyPeriod,
): Promise<CronResult> {
  if (!row.accountId) {
    return { client: row.name, status: "skipped_no_intentwise" };
  }
  const existing = await getMonthlyReport(row.clientIdCode, periodKey);
  if (existing) {
    return { client: row.name, status: "already_exists" };
  }
  const dataThrough = await fetchAccountDataThrough(row.accountId);
  if (!isMonthSettled(period.end, dataThrough)) {
    return { client: row.name, status: "data_not_settled" };
  }
  const client = {
    name: row.name,
    accountId: row.accountId,
    slug: slugify(row.name),
    clientIdCode: row.clientIdCode,
    accountManager: row.accountManager,
  };
  const config = await resolveConfig(row.accountId);
  const payload = await generateReport(client, period, config);
  const report = payload.report;
  const saved = await saveMonthlyReportPdf({
    clientIdCode: row.clientIdCode,
    period: periodKey,
    report,
    origin: MONTHLY_REPORT_EMAIL_ASSET_ORIGIN,
  });
  await upsertGeneratedMonthlyReport({
    clientIdCode: row.clientIdCode,
    period: periodKey,
    report,
    skipped: payload.skipped,
    driveUrl: saved.driveUrl,
    htmlUrl: saved.htmlUrl,
    dataThrough,
    generatedBy: null,
  });
  return { client: row.name, status: "generated" };
}

async function fanOutPending(
  pending: MonthlyListClient[],
  cronSecret: string,
): Promise<CronResult[]> {
  const origin = resolveBaseUrl();
  const settled = await Promise.allSettled(
    pending.map(async (row) => {
      const url = `${origin}/api/cron/monthly-reports?clientIdCode=${encodeURIComponent(row.clientIdCode)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({})) as { client?: unknown; status?: unknown; error?: unknown };
      if (!res.ok) {
        return {
          client: row.name,
          status: "error",
          error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
        };
      }
      return {
        client: typeof json.client === "string" ? json.client : row.name,
        status: typeof json.status === "string" ? json.status : "error",
        ...(typeof json.error === "string" ? { error: json.error } : {}),
      };
    }),
  );
  return settled.map((item, i) => {
    if (item.status === "fulfilled") return item.value;
    return { client: pending[i].name, status: "error", error: getErrorMessage(item.reason) };
  });
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const cronSecret = cronAuth(req);
  if (!cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const periodKey = lastCompletedMonth();
  const period = resolvePeriod(periodKey);
  const clients = await listActiveMonthlyClients();
  const clientIdCode = new URL(req.url).searchParams.get("clientIdCode")?.trim() ?? "";

  if (clientIdCode) {
    const row = clients.find((c) => c.clientIdCode === clientIdCode);
    if (!row) {
      return NextResponse.json({ error: `Unknown client ${clientIdCode}` }, { status: 404 });
    }
    try {
      const result = await generateOne(row, periodKey, period);
      return NextResponse.json(result);
    } catch (err) {
      await recordGenerateFailure(row.clientIdCode, periodKey, getErrorMessage(err)).catch(() => {});
      return NextResponse.json(
        { client: row.name, status: "error", error: getErrorMessage(err) },
        { status: 500 },
      );
    }
  }

  const results: CronResult[] = [];
  const pending: MonthlyListClient[] = [];
  const capped = new Set((await cappedClients(periodKey).catch(() => [])).map((c) => c.clientIdCode));
  for (const row of clients) {
    if (!row.accountId) {
      results.push({ client: row.name, status: "skipped_no_intentwise" });
      continue;
    }
    const existing = await getMonthlyReport(row.clientIdCode, periodKey);
    if (existing) {
      results.push({ client: row.name, status: "already_exists" });
      continue;
    }
    if (capped.has(row.clientIdCode)) {
      results.push({ client: row.name, status: "failed_capped" });
      continue;
    }
    pending.push(row);
  }
  results.push(...await fanOutPending(pending, cronSecret));
  const generatedNames = new Set(
    results.filter((r) => r.status === "generated").map((r) => r.client),
  );
  const digestRows = clients.filter((c) => generatedNames.has(c.name));
  if (digestRows.length > 0) {
    await notifyPmReportsReady({ periodLabel: period.label, rows: digestRows });
  }
  // Every main run (not only when something generated): a failed create/sync self-heals on the next 30-min run on the 4th; after the 4th the next review action re-syncs. Both never throw.
  const elapsed = Date.now() - startedAt;
  if (elapsed < ASANA_SCHEDULE_BUDGET_MS) {
    scheduleAsanaEnsureAndSync(periodKey);
  } else {
    console.log("[monthly-reports] asana ensure skipped: too little of the 300s budget left; the next run picks it up", { period: periodKey, elapsedMs: elapsed });
  }
  return NextResponse.json({ period: periodKey, results });
}
