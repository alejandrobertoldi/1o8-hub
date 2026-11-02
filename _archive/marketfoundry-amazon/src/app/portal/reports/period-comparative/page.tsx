"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { PeriodComparativeSection } from "@/components/reports/v2/period-comparative-section";

// Portal twin of /reports/period-comparative, one block per visible client.
export default function PortalPeriodComparativePage() {
  return (
    <PortalStackedReport
      sectionId="period-comparative"
      sectionLabel="Period Comparative"
      title="Period comparative"
      description="Current period against previous month and previous year — trend, comparison cards, and daily detail."
    >
      {({ accountId, start, end }) => (
        <PeriodComparativeSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
      )}
    </PortalStackedReport>
  );
}
