"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lastCompletedPeriod, periodLabel, periodRange, shiftPeriod } from "@/lib/client-report/period";
import type { ReportListRow } from "@/lib/client-report/load";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = { shopify: "Shopify", ga4: "GA4", meta: "Meta", google_ads: "Google Ads", klaviyo: "Klaviyo" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type ListResponse = { period: string; clients: ReportListRow[]; canGenerate: boolean };

/** Client monthly reports: one row per active client for the chosen month. */
export default function MonthlyReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftPeriod(lastCompletedPeriod(today), -i)), [today]);
  const [period, setPeriod] = useState(months[0]);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ["client-reports", period],
    queryFn: async () => {
      const res = await fetch(`/api/reports/monthly?period=${period}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load reports");
      return res.json();
    },
  });

  const [busy, setBusy] = useState<Set<string>>(new Set());
  const generate = useMutation({
    mutationFn: async (codes: string[]) => {
      setBusy((b) => new Set([...b, ...codes]));
      const failed: string[] = [];
      // One request per client keeps each well under the function time limit.
      for (const code of codes) {
        const res = await fetch("/api/reports/monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, code }),
        });
        if (!res.ok) failed.push(code);
        setBusy((b) => {
          const n = new Set(b);
          n.delete(code);
          return n;
        });
        qc.invalidateQueries({ queryKey: ["client-reports", period] });
      }
      if (failed.length) throw new Error(`Couldn't generate: ${failed.join(", ")}`);
    },
    onSettled: () => setBusy(new Set()),
  });

  const rows = data?.clients ?? [];
  const withData = rows.filter((r) => r.sources.length);
  const missing = withData.filter((r) => !r.report);
  const noData = rows.filter((r) => !r.sources.length);
  const monthEnd = periodRange(period).end;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] leading-none tracking-tighter" aria-label="Monthly Reports">
          <span className="font-bold text-sidebar-foreground">Monthly</span>
          <span className="font-normal text-brand">Reports</span>
        </h1>
      </PageMetaSlot>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48" aria-label="Report month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {periodLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {withData.length} clients with data · {withData.length - missing.length} generated
          </p>
        </div>
        {data?.canGenerate && missing.length > 0 && (
          <Button onClick={() => generate.mutate(missing.map((r) => r.code))} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate {missing.length} missing
          </Button>
        )}
      </div>

      {generate.error && <p className="text-sm text-red-500">{(generate.error as Error).message}</p>}
      {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Client</th>
              <th className="px-4 py-2.5 font-semibold">Account manager</th>
              <th className="px-4 py-2.5 font-semibold">Data</th>
              <th className="px-4 py-2.5 font-semibold">Report</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {withData.map((r) => {
              const working = busy.has(r.code);
              const partial = r.report?.dataThrough && r.report.dataThrough < monthEnd;
              return (
                <tr key={r.code}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">{r.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.accountManager ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.sources.map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {SOURCE_LABEL[s] ?? s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.report ? (
                      <div>
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-600 dark:text-amber-400">{r.report.status}</span>
                        <div className={cn("mt-1 text-[11px]", partial ? "text-red-500" : "text-muted-foreground")}>
                          Numbers from {fmtDate(r.report.generatedAt)}
                          {partial && ` · data only through ${fmtDate(`${r.report.dataThrough}T12:00:00Z`)}`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not generated</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      {data?.canGenerate && (
                        <Button size="sm" variant="ghost" disabled={working || generate.isPending} onClick={() => generate.mutate([r.code])} title={r.report ? "Rebuild the numbers" : "Generate"}>
                          {working ? <Loader2 className="size-4 animate-spin" /> : r.report ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
                          {r.report ? "Refresh" : "Generate"}
                        </Button>
                      )}
                      {r.report && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/reports/monthly/${r.code}/${period}`}>
                              <FileText className="size-4" /> Open
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/api/reports/monthly/${r.code}/${period}/pdf`}>
                              <Download className="size-4" /> PDF
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {noData.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No KPI data for {periodLabel(period)}: {noData.map((r) => r.name).join(", ")}. Connect their sources on the client profile to report on them.
        </p>
      )}
    </div>
  );
}
