"use client";
import { DailyChart, KpiReportPage, MetricGrid, SeriesState, useKpiSeries } from "@/components/reports/kpi/kpi-report";
import { BLENDED, GOOGLE_ADS, META, type ReportMetric } from "@/lib/kpi/report-metrics";
import type { KpiSeries } from "@/lib/kpi/series";

const pick = (list: ReportMetric[], key: string) => list.find((m) => m.key === key)!;
const hasAny = (s: KpiSeries, keys: string[]) => keys.some((k) => (s.totals[k] ?? 0) !== 0);

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{children}</div>;

/** Paid media for the selected client and range: all platforms together, then Meta and Google Ads. */
export default function PaidMediaReportPage() {
  const { code, data, isLoading, error } = useKpiSeries();
  return (
    <KpiReportPage title="Paid Media">
      <SeriesState code={code} isLoading={isLoading} error={error} series={data}>
        {(s) => {
          const meta = hasAny(s, ["meta:spend"]);
          const google = hasAny(s, ["ga4:google_ads_cost"]);
          return (
            <div className="space-y-8">
              <Section title="Blended" note="Meta + Google Ads together. MER uses Shopify net sales once the store is connected.">
                {meta || google ? (
                  <>
                    <MetricGrid metrics={BLENDED.filter((m) => m.key !== "mer" || s.sources.includes("shopify"))} series={s} />
                    <DailyChart series={s} bar={pick(BLENDED, "spend")} line={pick(BLENDED, "roas")} title="Daily total spend and platform ROAS" />
                  </>
                ) : (
                  <Empty>No ad spend for this client in this range.</Empty>
                )}
              </Section>

              <Section title="Meta">
                {meta ? (
                  <>
                    <MetricGrid metrics={META} series={s} />
                    <DailyChart series={s} bar={pick(META, "spend")} line={pick(META, "roas")} title="Daily Meta spend and ROAS" />
                  </>
                ) : (
                  <Empty>No Meta spend in this range. Check the client&apos;s Meta ad accounts on its profile (Main KPIs → data sources).</Empty>
                )}
              </Section>

              <Section title="Google Ads" note="From Google Analytics: cost of the Google Ads account linked to the GA4 property, and revenue of google / cpc sessions.">
                {google ? (
                  <>
                    <MetricGrid metrics={GOOGLE_ADS} series={s} />
                    <DailyChart series={s} bar={pick(GOOGLE_ADS, "spend")} line={pick(GOOGLE_ADS, "roas")} title="Daily Google Ads spend and ROAS" />
                  </>
                ) : (
                  <Empty>No Google Ads cost in this range. It shows up once the client&apos;s Google Ads account is linked to its GA4 property (GA4 → Admin → Google Ads links).</Empty>
                )}
              </Section>
            </div>
          );
        }}
      </SeriesState>
    </KpiReportPage>
  );
}
