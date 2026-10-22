"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { PortalReportState } from "@/components/reports/v2/portal-report-state";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report as ReportData } from "@/components/monthly-report/types";

type MonthlyPayload = {
  report: ReportData;
  period: string;
  status: string;
};

type MonthlyListPayload = {
  reports: Array<{ period: string; label: string; status: string }>;
};

/** The list of generated reports for ONE client. Each card links to the
 *  detail view with `&client=` so the detail resolves that client, not the
 *  first visible one. */
function MonthlyListForClient({ clientIdCode }: { clientIdCode: string }) {
  const listQuery = useQuery<MonthlyListPayload>({
    queryKey: ["portal-monthly-reports", clientIdCode],
    queryFn: async () => {
      const qs = new URLSearchParams({ client: clientIdCode });
      const res = await fetch(`/api/portal/reports/monthly?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Reports unavailable");
      }
      return res.json();
    },
    retry: false,
  });

  if (listQuery.isLoading) return <PortalReportState kind="loading" />;
  if ((listQuery.data?.reports.length ?? 0) === 0) {
    return (
      <div className="p-8 text-muted-foreground" role="status">
        {listQuery.error instanceof Error ? listQuery.error.message : "No monthly reports yet."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 px-4 pb-8">
      {listQuery.data!.reports.map((item) => {
        const href = `/portal/reports/monthly?period=${encodeURIComponent(item.period)}&client=${encodeURIComponent(clientIdCode)}`;
        return (
          <Link
            key={item.period}
            href={href}
            className="group block rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-portal-accent/30"
          >
            <div className="inline-flex items-center justify-center rounded-lg p-2.5 bg-portal-accent/10 text-portal-accent">
              <FileText className="size-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Monthly performance
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{item.label}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Detailed Performance Report
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
              View
              <ArrowRight className="size-4" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// List view: one block of report cards per visible client, stacked. Detail
// view (?period=): a single client's report — the card link carries `client=`,
// which the report controls resolve when that client is enabled.
export default function PortalMonthlyReportPage() {
  const controls = usePortalReportControls();
  const searchParams = useSearchParams();
  const period = searchParams.get("period")?.trim() ?? "";
  const clientParam = controls.clientParam;
  const listHref = `/portal/reports/monthly${clientParam}`;
  const { label, showHeaders } = usePortalStackedClients();

  const detailQuery = useQuery<MonthlyPayload>({
    queryKey: ["portal-monthly-report", period, controls.clientIdCode],
    queryFn: async () => {
      const qs = new URLSearchParams({ period });
      if (controls.clientIdCode) qs.set("client", controls.clientIdCode);
      const res = await fetch(`/api/portal/reports/monthly?${qs.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Report unavailable");
      }
      return res.json();
    },
    enabled: Boolean(period) && !controls.loading && !controls.notFound,
    retry: false,
  });

  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;

  const subtitleClient = period ? controls.clientName : showHeaders ? label : controls.clientName;

  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Monthly Report"
          >
            <span className="font-bold text-sidebar-foreground">Monthly</span>
            <span className="font-normal text-portal-accent">Report</span>
          </h1>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {period
              ? (detailQuery.data?.report.meta.month ?? period)
              : "Generated reports"}
            {subtitleClient ? ` · ${subtitleClient}` : ""}
          </p>
        </div>
      </PageMetaSlot>

      <div className="px-4 pt-3 pb-2">
        <Link
          href={period ? listHref : `/portal/reports${clientParam}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          {period ? "Back to monthly reports" : "Back to Reports"}
        </Link>
      </div>

      {period ? (
        detailQuery.isLoading ? (
          <PortalReportState kind="loading" />
        ) : detailQuery.data?.report ? (
          <ReportView data={detailQuery.data.report} showTopBar={false} showToc />
        ) : (
          <div className="p-8 text-muted-foreground" role="status">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "No monthly report for this period."}
          </div>
        )
      ) : (
        <PortalStackedClients empty={<PortalReportState kind="not-found" />} className="px-4">
          {(code) => <MonthlyListForClient clientIdCode={code} />}
        </PortalStackedClients>
      )}
    </div>
  );
}
