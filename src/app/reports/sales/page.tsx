"use client";
import { DailyChart, KpiReportPage, MetricGrid, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { SALES } from "@/lib/kpi/report-metrics";

const metric = (key: string) => SALES.find((m) => m.key === key)!;

/** Shopify sales for the selected client and range. */
export default function SalesReportPage() {
  const { code, data, isLoading, error } = useKpiSeries();
  return (
    <KpiReportPage title="Sales">
      <SeriesState code={code} isLoading={isLoading} error={error} series={data} source="shopify" sourceLabel="Shopify">
        {(s) => (
          <>
            <MetricGrid metrics={SALES} series={s} />
            <DailyChart series={s} bar={metric("net_sales")} line={metric("orders")} title="Daily net sales and orders" />
            <p className="text-[11px] text-muted-foreground">
              From Shopify&apos;s own sales report: net sales = gross sales − discounts − returns, so it matches Shopify Analytics.
            </p>
          </>
        )}
      </SeriesState>
    </KpiReportPage>
  );
}
