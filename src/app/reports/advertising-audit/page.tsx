"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { AdvertisingAuditSection } from "@/components/reports/v2/advertising-audit-section";

// Standalone Advertising Audit report — same shell as /reports/overview.
export default function AdvertisingAuditReportPage() {
  const controls = useReportControls();
  const { accountId, start, end, refreshKey } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Advertising Audit"
          refreshSection="advertising-audit"
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Advertising audit</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps.</p>
          </div>
          <AdvertisingAuditSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}
