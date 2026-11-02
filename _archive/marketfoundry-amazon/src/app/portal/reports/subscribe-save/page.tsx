"use client";
import { useState } from "react";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { SubscribeSaveSection } from "@/components/reports/v2/subscribe-save-section";

// Portal twin of /reports/subscribe-save, one block per visible client. S&S is
// a full-year view, so the week/custom date controls are replaced by a single
// year selector shared by every block. Defaults to the current year.
export default function PortalSubscribeSavePage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  return (
    <PortalStackedReport
      sectionId="subscribe-save"
      sectionLabel="Subscribe & Save"
      title="Subscribe & Save"
      description="Weekly subscription performance across the selected year — subscriptions, sales, units and penetration vs previous year."
      showDates={false}
      extras={
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-portal-accent"
        >
          {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      }
    >
      {({ accountId }) => (
        <SubscribeSaveSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
      )}
    </PortalStackedReport>
  );
}
