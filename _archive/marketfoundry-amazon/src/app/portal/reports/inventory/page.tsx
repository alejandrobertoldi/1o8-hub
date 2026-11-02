"use client";
import { PortalStackedReport } from "@/components/reports/v2/portal-stacked-report";
import { InventorySection } from "@/components/reports/v2/inventory-section";
import { InventoryDateBadge } from "@/components/reports/inventory-date-badge";

// Portal twin of /reports/inventory, one block per visible client. Inventory is
// snapshot-based, so the date-range controls are hidden and each block carries
// its own snapshot-date badge next to its own data.
export default function PortalInventoryPage() {
  return (
    <PortalStackedReport
      sectionId="inventory"
      sectionLabel="Inventory"
      title="Inventory"
      description="Stock levels, availability and inventory health per ASIN — status tables and FBA breakdowns."
      showDates={false}
    >
      {({ accountId }) => (
        <>
          <div className="mb-3 flex justify-end">
            <InventoryDateBadge surface="portal" accountId={accountId} />
          </div>
          <InventorySection accountId={accountId} refreshKey={0} />
        </>
      )}
    </PortalStackedReport>
  );
}
