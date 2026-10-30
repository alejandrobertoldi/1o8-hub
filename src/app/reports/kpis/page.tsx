"use client";
import { DailyChart, KpiReportPage, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { KPI_SOURCE_LABELS, MAIN_KPIS_FIELD, kpiDef, kpiLabel, parseClientKpis } from "@/lib/clients/kpis";
import { delta } from "@/lib/kpi/report-metrics";
import { formatKpi, isRate, kpiValue, parseTarget } from "@/lib/kpi/values";
import { cn } from "@/lib/utils";
import Link from "next/link";

const pct = (d: number | null) => (d === null ? "—" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}%`);
const AVERAGES = new Set(["aov", "cac"]);

/** The client's Main KPIs for the range: value, vs previous period, vs last year, vs target. */
export default function KpiOverviewPage() {
  const { client, code, data, isLoading, error } = useKpiSeries();
  const kpis = parseClientKpis(client?.rawData?.[MAIN_KPIS_FIELD]);
  return (
    <KpiReportPage title="KPI Overview">
      {code && !kpis.length ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          This client has no Main KPIs yet.{" "}
          <Link href={`/clients/${code}`} className="text-brand hover:underline">
            Pick them on its profile
          </Link>
          .
        </div>
      ) : (
        <SeriesState code={code} isLoading={isLoading} error={error} series={data}>
          {(s) => {
            const days = s.days.length;
            return (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {kpis.map((k, i) => {
                    const now = kpiValue(k.key, s.totals);
                    const prev = kpiValue(k.key, s.previous);
                    const ly = kpiValue(k.key, s.lastYear);
                    const def = kpiDef(k.key);
                    const lower = k.key === "cac";
                    // Monthly targets: totals are scaled to the range's length; rates and averages compare as-is.
                    const rawTarget = now ? parseTarget(k.target, now.unit) : null;
                    const target = rawTarget === null || !now ? null : isRate(now.unit) || AVERAGES.has(k.key) ? rawTarget : (rawTarget * days) / 30.4;
                    const vsTarget = now && target ? delta(now.value, target) : null;
                    const onTrack = vsTarget === null ? null : lower ? vsTarget <= 0 : vsTarget >= 0;
                    return (
                      <div key={`${k.key}-${i}`} className="rounded-xl border bg-card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                              {i + 1}. {kpiLabel(k)}
                            </div>
                            {def && <div className="text-[10px] text-muted-foreground">{KPI_SOURCE_LABELS[def.source]}</div>}
                          </div>
                          {k.target && (
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", onTrack === null ? "bg-muted text-muted-foreground" : onTrack ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500")}>
                              Target {k.target}
                            </span>
                          )}
                        </div>
                        <div className={cn("mt-2 text-3xl font-bold tabular-nums", onTrack === true && "text-emerald-500", onTrack === false && "text-red-500")}>
                          {now ? formatKpi(now) : "—"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{now ? now.basis : "Its data source isn't connected yet"}</div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                          <div>
                            <div className="text-muted-foreground">Previous period</div>
                            <div>{prev ? formatKpi(prev) : "—"} <span className="text-muted-foreground">({pct(now && prev ? delta(now.value, prev.value) : null)})</span></div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Last year</div>
                            <div>{ly ? formatKpi(ly) : "—"} <span className="text-muted-foreground">({pct(now && ly ? delta(now.value, ly.value) : null)})</span></div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">vs target</div>
                            <div>{pct(vsTarget)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {kpis[0] && (() => {
                  const first = kpis[0];
                  const unit = kpiValue(first.key, s.totals)?.unit ?? "count";
                  return (
                    <DailyChart
                      series={s}
                      title={`Daily ${kpiLabel(first)}`}
                      bar={{ key: first.key, label: kpiLabel(first), unit, compute: (t) => kpiValue(first.key, t)?.value }}
                    />
                  );
                })()}
              </>
            );
          }}
        </SeriesState>
      )}
    </KpiReportPage>
  );
}
