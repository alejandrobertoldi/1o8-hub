// src/lib/monthly-report/orchestrator.ts
import { getClientLogoCodes } from "@/lib/client-logos/logo-index";
import type {
  ClientContext, HeadlineResult, MonthlyPeriod, ReportConfig, SectionKey,
} from "./types";
import type { Report } from "@/components/monthly-report/types";
import { fetchAccountRollup, fetchCampaignDailySeries, fetchDailySeries, fetchRevenueSeries } from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { buildHeadlineResult } from "./analyzers/headline-kpis";
import { analyzeProducts } from "./analyzers/products";
import { buildReportData } from "./build-report-data";

export interface ReportPayload {
  report: Report;
  headline: HeadlineResult | null;
  skipped: SectionKey[];
}

/** Same calendar window shifted back one year — March 2026 → March 2025. */
function priorYearWindow(start: string, end: string): { start: string; end: string } {
  const shift = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${Number(y) - 1}-${m}-${d}`;
  };
  return { start: shift(start), end: shift(end) };
}

export async function generateReport(
  client: ClientContext,
  period: MonthlyPeriod,
  config: ReportConfig,
  lead?: string,
): Promise<ReportPayload> {
  const resolvedLead = (lead ?? client.accountManager ?? "").trim() || "Manu Lancharro";
  const py = priorYearWindow(period.start, period.end);
  const [curr, prev, revenueSeries, dailyCurrent, dailyPrevYear, campaignDaily, campaignDailyPrev] = await Promise.all([
    fetchAccountRollup(client.accountId, period.start, period.end),
    fetchAccountRollup(client.accountId, period.prevStart, period.prevEnd),
    fetchRevenueSeries(client.accountId, period.start),
    fetchDailySeries(client.accountId, period.start, period.end),
    fetchDailySeries(client.accountId, py.start, py.end),
    fetchCampaignDailySeries(client.accountId, period.start, period.end),
    fetchCampaignDailySeries(client.accountId, period.prevStart, period.prevEnd),
  ]);
  const headline = buildHeadlineResult(curr, prev);

  let products = null;
  const skipped: SectionKey[] = [];
  if (config.enabled.products) {
    const rows = await fetchProductRows(client.accountId, period.start, period.end);
    products = analyzeProducts(rows);
    if (!products) skipped.push("products");
  } else {
    skipped.push("products");
  }
  const logoCodes = await getClientLogoCodes();
  const report = buildReportData({
    client, period, headline, products, revenueSeries, lead: resolvedLead,
    dailyCurrent, dailyPrevYear, campaignDaily, campaignDailyPrev, logoCodes,
  });
  return { report, headline, skipped };
}
