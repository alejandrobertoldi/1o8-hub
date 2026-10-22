"use client";
import { useEffect, type ReactNode } from "react";
import { getSurfacePalette, type Surface } from "@/components/reports/v2/primitives/palette";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { buildReportPdfFilename } from "./print-url";
import "./print.css";

/** The paper shell. Renders the MF cover block and a fixed-width canvas, then
 *  the section component itself as children. `surface` drives ONLY the accent —
 *  hub orange, portal charcoal blue — the same rule ReportsControlsBar follows. */
export function PrintDocument({
  surface,
  sectionId,
  clientName,
  rangeLabel,
  generatedAt,
  start,
  end,
  children,
}: {
  surface: Surface;
  sectionId: PrintSectionId;
  clientName: string;
  /** Pre-formatted for display: "2026-07-27 – 2026-08-02", "Current snapshot", "2026". */
  rangeLabel: string;
  /** YYYY-MM-DD. */
  generatedAt: string;
  /** Only for the saved-file name; the visible range is rangeLabel. */
  start?: string;
  end?: string;
  children: ReactNode;
}) {
  const meta = PRINT_SECTIONS[sectionId];
  const palette = getSurfacePalette(surface);

  // The browser's default Save-as-PDF name comes from document.title.
  useEffect(() => {
    const prev = document.title;
    document.title = buildReportPdfFilename({
      clientName,
      sectionLabel: meta.label,
      start,
      end,
    });
    return () => {
      document.title = prev;
    };
  }, [clientName, meta.label, start, end]);

  return (
    <div className="mf-paper">
      <header className="mf-cover">
        <div
          data-print-accent
          className="mb-4 h-[3px] w-[46mm]"
          style={{ background: palette.accent }}
        />
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-muted">
              MARKETFOUNDRY
            </div>
            <div className="mt-2 text-[22px] font-bold leading-none tracking-tight text-mf-ink">
              {clientName}
            </div>
          </div>
          <div className="text-right text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">
            <div>{rangeLabel}</div>
            <div className="mt-1 font-normal normal-case tracking-normal">
              Generated {generatedAt}
            </div>
          </div>
        </div>
        <h1 className="mt-6 m-0 text-[30px] font-bold uppercase leading-none tracking-tighter text-mf-ink">
          {meta.title}
        </h1>
        <p className="mt-2 max-w-[180mm] text-[11px] text-mf-muted">{meta.blurb}</p>
      </header>
      {children}
    </div>
  );
}
