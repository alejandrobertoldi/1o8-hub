"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Eye, Loader2, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { ClientReportDocument } from "@/components/client-report/client-report-document";
import { ReportTextEditor } from "@/components/client-report/text-editor";
import { TEXT_LABELS, type TextSection } from "@/lib/client-report/text";
import type { TextVersion } from "@/lib/client-report/texts-store";
import type { ClientReportData } from "@/lib/client-report/types";

type ReportResponse = { status: string; generatedAt: string; dataThrough: string | null; data: ClientReportData };
type TextsResponse = {
  sections: TextSection[];
  current: Partial<Record<TextSection, TextVersion>>;
  versions: TextVersion[];
  warnings: Partial<Record<TextSection, string[]>>;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

/** One client's monthly report, as it will print, with its text editable in place. */
export default function MonthlyReportPage({ params }: { params: Promise<{ code: string; period: string }> }) {
  const { code, period } = use(params);
  const qc = useQueryClient();
  const base = `/api/reports/monthly/${code}/${period}`;
  const reportKey = ["client-report", code, period];
  const textsKey = ["client-report-texts", code, period];
  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery<ReportResponse>({ queryKey: reportKey, queryFn: () => call(base, "GET") });
  const texts = useQuery<TextsResponse>({ queryKey: textsKey, queryFn: () => call(`${base}/texts`, "GET"), enabled: !!data });
  const reloadTexts = () => qc.invalidateQueries({ queryKey: textsKey });

  const refresh = useMutation({
    mutationFn: () => call("/api/reports/monthly", "POST", { period, code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKey });
      qc.invalidateQueries({ queryKey: ["client-reports", period] });
      reloadTexts();
    },
  });
  const writeAll = useMutation({
    mutationFn: () => call(`${base}/write`, "POST", {}),
    onSuccess: () => {
      reloadTexts();
      setEditing(true);
    },
  });

  const report = data?.data;
  const partial = report?.dataThrough && report.dataThrough < report.period.end;
  const t = texts.data;
  const hasText = !!t && Object.keys(t.current).length > 0;
  const html = Object.fromEntries(Object.entries(t?.current ?? {}).map(([k, v]) => [k, v!.html])) as Partial<Record<TextSection, string>>;

  const render = (k: TextSection) => (
    <ReportTextEditor
      label={k === "summary" ? "Executive summary" : ["wins", "watchouts", "next_steps"].includes(k) ? TEXT_LABELS[k] : "Our read"}
      html={html[k] ?? ""}
      versions={(t?.versions ?? []).filter((v) => v.section === k)}
      warnings={t?.warnings[k]}
      canEdit
      onSave={async (h) => {
        await call(`${base}/texts`, "PUT", { section: k, html: h });
        await reloadTexts();
      }}
      onRewrite={async (instruction) => {
        await call(`${base}/write`, "POST", { sections: [k], instruction });
        await reloadTexts();
      }}
      onRestore={async (id) => {
        await call(`${base}/texts`, "POST", { restore: id });
        await reloadTexts();
      }}
    />
  );

  return (
    <div className="px-4 py-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] leading-none tracking-tighter" aria-label="Monthly Report">
          <span className="font-bold text-sidebar-foreground">Monthly</span>
          <span className="font-normal text-brand">Report</span>
        </h1>
      </PageMetaSlot>

      <div className="mx-auto mb-5 flex max-w-[8.5in] flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending || !report} title="Rebuild the numbers; the text stays">
            {refresh.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh numbers
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={writeAll.isPending || !report}
            onClick={() => {
              if (!hasText || confirm("Claude will write every section again. The current text stays in each section's history. Continue?")) writeAll.mutate();
            }}
          >
            {writeAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {writeAll.isPending ? "Claude is writing… (about a minute)" : hasText ? "Rewrite all with Claude" : "Write with Claude"}
          </Button>
          <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing((e) => !e)} disabled={!report}>
            {editing ? <Eye className="size-4" /> : <PenLine className="size-4" />}
            {editing ? "Preview" : "Edit text"}
          </Button>
          <Button size="sm" asChild disabled={!report}>
            <a href={`${base}/pdf`}>
              <Download className="size-4" /> PDF
            </a>
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-center text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-center text-sm text-red-500">{(error as Error).message}</p>}
      {[refresh.error, writeAll.error].filter(Boolean).map((e, i) => (
        <p key={i} className="mb-3 text-center text-sm text-red-500">
          {(e as Error).message}
        </p>
      ))}
      {report && !hasText && !editing && !writeAll.isPending && (
        <p className="mx-auto mb-4 max-w-[8.5in] rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No commentary yet. <strong className="text-foreground">Write with Claude</strong> drafts the executive summary, each section and next steps in 1o8&apos;s
          writing style; then edit anything in place.
        </p>
      )}
      {report && (
        <div className="overflow-x-auto pb-6">
          <ClientReportDocument data={report} texts={{ html, render: editing ? render : undefined }} screen />
        </div>
      )}
    </div>
  );
}
