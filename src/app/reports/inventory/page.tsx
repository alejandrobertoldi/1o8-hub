"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { InventorySection } from "@/components/reports/v2/inventory-section";
import { InventoryDateBadge } from "@/components/reports/inventory-date-badge";

// Standalone Inventory report — same shell as /reports/overview. Inventory is
// snapshot-based, so the date-range controls are hidden; the badge shows the
// snapshot date instead.
export default function InventoryReportPage() {
  const controls = useReportControls();
  const { accountId, refreshKey } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Inventory"
          refreshSection="inventory"
          showDates={false}
          extras={<InventoryDateBadge surface="hub" accountId={accountId} />}
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Inventory</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Stock levels, availability and inventory health per ASIN — status tables and FBA breakdowns.</p>
          </div>
          <InventorySection accountId={accountId} refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}
