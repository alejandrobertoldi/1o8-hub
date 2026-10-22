"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { AdvertisingAuditSection } from "@/components/reports/v2/advertising-audit-section";

// Portal twin of /reports/advertising-audit, one block per visible client.
export default function PortalAdvertisingAuditPage() {
  return (
    <PortalStackedReport
      sectionId="advertising-audit"
      sectionLabel="Advertising Audit"
      title="Advertising audit"
      description="Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps."
    >
      {({ accountId, start, end }) => (
        <AdvertisingAuditSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
      )}
    </PortalStackedReport>
  );
}
