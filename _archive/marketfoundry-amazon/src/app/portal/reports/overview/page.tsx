"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";

// Portal twin of /reports/overview — same v2 section, one block per visible
// client. No client select and no Refresh button (hub/internal only). The
// canvas, H1 and standfirst come from PortalStackedReport, so the section
// renders embedded (its own chrome off).
export default function PortalOverviewPage() {
  return (
    <PortalStackedReport
      sectionId="overview"
      sectionLabel="Overview"
      title="Performance overview"
      description="An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis."
    >
      {({ accountId, start, end }) => (
        <PerformanceOverviewV2 surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} embedded />
      )}
    </PortalStackedReport>
  );
}
