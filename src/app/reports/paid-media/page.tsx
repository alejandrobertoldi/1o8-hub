"use client";
import { DailyChart, KpiReportPage, MetricGrid, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { PAID_MEDIA } from "@/lib/kpi/report-metrics";

const metric = (key: string) => PAID_MEDIA.find((m) => m.key === key)!;

/** Meta ads for the selected client and range. */
export default function PaidMediaReportPage() {
  const { code, data, isLoading, error } = useKpiSeries();
  return (
    <KpiReportPage title="Paid Media">
      <SeriesState code={code} isLoading={isLoading} error={error} series={data} source="meta" sourceLabel="Meta">
        {(s) => (
          <>
            <MetricGrid metrics={PAID_MEDIA.filter((m) => m.key !== "mer" || s.sources.includes("shopify"))} series={s} />
            <DailyChart series={s} bar={metric("spend")} line={metric("roas")} title="Daily spend and ROAS" />
          </>
        )}
      </SeriesState>
    </KpiReportPage>
  );
}
