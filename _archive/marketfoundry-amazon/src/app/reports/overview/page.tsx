"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";

// The v2 reports overview — live controls in the top nav bar drive a single
// hub-surface performance overview.
export default function ReportsOverviewPage() {
  const controls = useReportControls();
  const { accountId, start, end, refreshKey } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar surface="hub" controls={controls} />
      </PageMetaSlot>
      <PerformanceOverviewV2 surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
    </div>
  );
}
