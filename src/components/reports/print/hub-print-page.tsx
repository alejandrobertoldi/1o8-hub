"use client";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { PrintDocument } from "./print-document";
import { PrintReady } from "./print-ready";
import { AutoPrint } from "./auto-print";
import { SECTION_RENDERERS } from "./section-renderers";

/** Display string for the cover block's range slot. */
export function rangeLabelFor(
  sectionId: PrintSectionId,
  { start, end, year }: { start: string; end: string; year: number | null },
): string {
  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "snapshot") return "Current snapshot";
  if (rangeKind === "year") return year ? String(year) : "";
  return start && end ? `${start} – ${end}` : "";
}

/** True when the URL lacks something the section cannot render without. */
export function hasRequiredParams(
  sectionId: PrintSectionId,
  { accountId, start, end, year }: { accountId: string; start: string; end: string; year: number | null },
): boolean {
  if (!accountId) return false;
  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range") return Boolean(start && end);
  if (rangeKind === "year") return year !== null;
  return true;
}

export function PrintMissingParams() {
  return (
    <div className="mf-paper p-10 text-[13px] text-mf-ink">
      Missing report parameters. Open this report from the PDF button on the report page.
    </div>
  );
}

/** The hub half of the print layer. All twelve route files are 4-line delegates
 *  to this or PortalPrintPage. */
export function HubPrintPage({
  sectionId,
  accountId,
  clientName,
  start,
  end,
  year,
  autoprint,
  generatedAt,
}: {
  sectionId: PrintSectionId;
  accountId: string;
  clientName: string;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
  /** YYYY-MM-DD, computed server-side by the route. */
  generatedAt: string;
}) {
  if (!hasRequiredParams(sectionId, { accountId, start, end, year })) {
    return <PrintMissingParams />;
  }

  // Subscribe & Save is keyed by year on screen too (page.tsx derives the same
  // bounds), so the print route reproduces that derivation rather than
  // inventing a second convention.
  const resolvedStart = PRINT_SECTIONS[sectionId].rangeKind === "year" ? `${year}-01-01` : start;
  const resolvedEnd = PRINT_SECTIONS[sectionId].rangeKind === "year" ? `${year}-12-31` : end;
  const render = SECTION_RENDERERS[sectionId];

  /* Fail CLOSED on a missing renderer. SECTION_RENDERERS is Partial until Task
     11 fills it, so an id without an entry would otherwise render a cover block
     with no body — and because PrintReady sees no skeletons it would emit the
     ready sentinel immediately and AutoPrint would send that blank report
     straight to the printer. A notice is the only safe output here. */
  if (!render) return <PrintMissingParams />;

  return (
    <PrintDocument
      surface="hub"
      sectionId={sectionId}
      clientName={clientName}
      rangeLabel={rangeLabelFor(sectionId, { start, end, year })}
      generatedAt={generatedAt}
      start={resolvedStart}
      end={resolvedEnd}
    >
      {render({ surface: "hub", accountId, start: resolvedStart, end: resolvedEnd })}
      <PrintReady />
      {autoprint && <AutoPrint />}
    </PrintDocument>
  );
}
