"use client";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { PrintDocument } from "./print-document";
import { PrintReady } from "./print-ready";
import { AutoPrint } from "./auto-print";
import { SECTION_RENDERERS } from "./section-renderers";
import { rangeLabelFor } from "./hub-print-page";

function PrintNotice({ children }: { children: React.ReactNode }) {
  return <div className="mf-paper p-10 text-[13px] text-mf-ink">{children}</div>;
}

/** The portal half of the print layer.
 *
 *  ⚠️ It takes NO accountId and NO client name. Identity comes from
 *  usePortalReportControls(), which resolves it through /api/portal/me/client —
 *  a route that applies the admin-preview ?client= override server-side and
 *  ignores it for non-admins. Adding an identity prop here, however convenient,
 *  would let one client print another's report by editing the URL.
 *
 *  Denial and loading branches deliberately render NEITHER the sentinel nor
 *  AutoPrint, so a refusal never reaches a printer. */
export function PortalPrintPage({
  sectionId,
  start,
  end,
  year,
  autoprint,
  generatedAt,
}: {
  sectionId: PrintSectionId;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
  /** YYYY-MM-DD, computed server-side by the route. */
  generatedAt: string;
}) {
  const controls = usePortalReportControls();

  if (controls.loading) return <PrintNotice>Preparing report…</PrintNotice>;
  if (controls.notFound) return <PrintNotice>This report is not available.</PrintNotice>;
  if (!controls.canAccessSection(sectionId)) {
    return <PrintNotice>This report is not available.</PrintNotice>;
  }
  if (!controls.accountId) {
    return <PrintNotice>No analytics account is linked to this client yet.</PrintNotice>;
  }

  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range" && !(start && end)) {
    return <PrintNotice>Missing report parameters.</PrintNotice>;
  }
  if (rangeKind === "year" && year === null) {
    return <PrintNotice>Missing report parameters.</PrintNotice>;
  }

  const resolvedStart = rangeKind === "year" ? `${year}-01-01` : start;
  const resolvedEnd = rangeKind === "year" ? `${year}-12-31` : end;
  const render = SECTION_RENDERERS[sectionId];

  /* Fail CLOSED, same reasoning as HubPrintPage: a missing renderer would give a
     cover block with no body, and since no skeleton ever appears PrintReady
     would emit immediately and AutoPrint would print the blank document. */
  if (!render) return <PrintNotice>This report is not available.</PrintNotice>;

  return (
    <PrintDocument
      surface="portal"
      sectionId={sectionId}
      clientName={controls.clientName}
      rangeLabel={rangeLabelFor(sectionId, { start, end, year })}
      generatedAt={generatedAt}
      start={resolvedStart}
      end={resolvedEnd}
    >
      {render({
        surface: "portal",
        accountId: controls.accountId,
        start: resolvedStart,
        end: resolvedEnd,
      })}
      <PrintReady />
      {autoprint && <AutoPrint />}
    </PrintDocument>
  );
}
