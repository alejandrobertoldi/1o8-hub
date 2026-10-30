"use client";
import { DailyChart, KpiReportPage, MetricGrid, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { TRAFFIC } from "@/lib/kpi/report-metrics";

const metric = (key: string) => TRAFFIC.find((m) => m.key === key)!;

/** Google Analytics traffic and conversion for the selected client and range. */
export default function TrafficReportPage() {
  const { code, data, isLoading, error } = useKpiSeries();
  return (
    <KpiReportPage title="Traffic & Conversion">
      <SeriesState code={code} isLoading={isLoading} error={error} series={data} source="ga4" sourceLabel="Google Analytics">
        {(s) => (
          <>
            <MetricGrid metrics={TRAFFIC} series={s} />
            <DailyChart series={s} bar={metric("sessions")} line={metric("conversion_rate")} title="Daily sessions and conversion rate" />
          </>
        )}
      </SeriesState>
    </KpiReportPage>
  );
}
