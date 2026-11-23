"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { ClientReportDocument } from "@/components/client-report/client-report-document";
import type { ClientReportData } from "@/lib/client-report/types";

type ReportResponse = { status: string; generatedAt: string; dataThrough: string | null; data: ClientReportData };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** One client's monthly report, as it will print. */
export default function MonthlyReportPage({ params }: { params: Promise<{ code: string; period: string }> }) {
  const { code, period } = use(params);
  const qc = useQueryClient();
  const key = ["client-report", code, period];
  const { data, isLoading, error } = useQuery<ReportResponse>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/reports/monthly/${code}/${period}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load the report");
      return res.json();
    },
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, code }),
      });
      if (!res.ok) throw new Error("Couldn't refresh the numbers");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["client-reports", period] });
    },
  });

  const report = data?.data;
  const partial = report?.dataThrough && report.dataThrough < report.period.end;

  return (
    <div className="px-4 py-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] leading-none tracking-tighter" aria-label="Monthly Report">
          <span className="font-bold text-sidebar-foreground">Monthly</span>
          <span className="font-normal text-brand">Report</span>
        </h1>
      </PageMetaSlot>

      <div className="mx-auto mb-5 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports/monthly" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> All reports
          </Link>
          {report && (
            <p className="mt-1 text-sm">
              <span className="font-semibold">{report.client.name}</span> · {report.period.label} · numbers from {fmtDate(data!.generatedAt)}
            </p>
          )}
          {partial && (
            <p className="text-xs text-red-500">
              The data only goes through {fmtDate(`${report!.dataThrough}T12:00:00Z`)}. Refresh the numbers once the month&apos;s data is in.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending || !report}>
            {refresh.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh numbers
          </Button>
          <Button size="sm" asChild disabled={!report}>
            <a href={`/api/reports/monthly/${code}/${period}/pdf`}>
              <Download className="size-4" /> Download PDF
            </a>
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-center text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-center text-sm text-red-500">{(error as Error).message}</p>}
      {refresh.error && <p className="text-center text-sm text-red-500">{(refresh.error as Error).message}</p>}
      {report && (
        <div className="overflow-x-auto pb-6">
          <ClientReportDocument data={report} screen />
        </div>
      )}
    </div>
  );
}
