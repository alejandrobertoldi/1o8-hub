"use client";
import { DailyChart, KpiReportPage, MetricGrid, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { EMAIL } from "@/lib/kpi/report-metrics";

const metric = (key: string) => EMAIL.find((m) => m.key === key)!;

/** Klaviyo email & SMS for the selected client and range. */
export default function EmailReportPage() {
  const { code, data, isLoading, error } = useKpiSeries();
  return (
    <KpiReportPage title="Email & SMS">
      <SeriesState code={code} isLoading={isLoading} error={error} series={data} source="klaviyo" sourceLabel="Klaviyo">
        {(s) => (
          <>
            <MetricGrid metrics={EMAIL} series={s} />
            <DailyChart series={s} bar={metric("attributed_revenue")} line={metric("net_subscribers")} title="Daily email & SMS revenue and list growth" />
            <p className="text-[11px] text-muted-foreground">
              Klaviyo&apos;s API counts revenue on the day the order happened, so totals can differ slightly from the Klaviyo dashboard&apos;s attribution.
            </p>
          </>
        )}
      </SeriesState>
    </KpiReportPage>
  );
}
