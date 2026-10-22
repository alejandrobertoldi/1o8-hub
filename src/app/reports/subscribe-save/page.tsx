"use client";
import { useState } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { SubscribeSaveSection } from "@/components/reports/v2/subscribe-save-section";

// Standalone Subscribe & Save report — same shell as /reports/overview.
// S&S is a full-year view, so the week/custom date controls are replaced by a
// single year selector.
export default function SubscribeSaveReportPage() {
  const controls = useReportControls();
  const { accountId, refreshKey } = controls;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Subscribe & Save"
          refreshSection="subscribe-save"
          showDates={false}
          refreshRange={{ start, end }}
          extras={
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          }
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Subscribe &amp; Save</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Weekly subscription performance across the selected year — subscriptions, sales, units and penetration vs previous year.</p>
          </div>
          <SubscribeSaveSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}
