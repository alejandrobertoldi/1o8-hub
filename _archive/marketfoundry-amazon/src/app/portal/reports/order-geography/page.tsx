"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { OrderGeographySection } from "@/components/reports/v2/order-geography-section";
import { TrailingRangePicker, useTrailingRange } from "@/components/reports/v2/trailing-range-picker";

// Portal twin of /reports/order-geography, one block per visible client. The
// lookback picker is page chrome shared by every block; the client comes from
// the session, so the select and the Redshift refresh are off.
export default function PortalOrderGeographyPage() {
  const range = useTrailingRange();

  return (
    <PortalStackedReport
      sectionId="order-geography"
      sectionLabel="Order Geography"
      title="Order Geography"
      description="Where your orders land across the United States, mapped by ship-to state and broken down by product. Pick a product to see its own footprint, or click a state to see everything that sells there."
      showDates={false}
      refreshRange={{ start: range.start, end: range.end }}
      extras={<TrailingRangePicker surface="portal" range={range} />}
    >
      {({ accountId }) => (
        <OrderGeographySection surface="portal" accountId={accountId} start={range.start} end={range.end} />
      )}
    </PortalStackedReport>
  );
}
