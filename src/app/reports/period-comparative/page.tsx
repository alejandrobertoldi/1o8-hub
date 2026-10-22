"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PeriodComparativeSection } from "@/components/reports/v2/period-comparative-section";

// Standalone Period Comparative report — same shell as /reports/overview:
// live controls in the top nav bar drive the hub-surface section below.
export default function PeriodComparativeReportPage() {
  const controls = useReportControls();
  const { accountId, start, end, refreshKey } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Period Comparative"
          refreshSection="period-comparative"
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Period comparative</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Current period against previous month and previous year — trend, comparison cards, and daily detail.</p>
          </div>
          <PeriodComparativeSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}
