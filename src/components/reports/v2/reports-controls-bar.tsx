"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { DatePicker } from "@/components/ui/date-picker";
import { RefreshButton } from "@/components/reports/refresh-button";
import { exportReportPagePdf } from "./export-report-pdf";
import type { ReportControls, ReportRangeControls } from "./use-report-controls";

/** The bar needs the shared range fields; the client-select and refresh fields
 *  are optional because the portal omits both. Hub still passes a full
 *  ReportControls, which satisfies this structurally with no call-site change. */
export type ControlsBarControls = ReportRangeControls &
  Partial<Omit<ReportControls, keyof ReportRangeControls>>;

// Mounted into the top app nav bar (via PageMetaSlot), styled with app theme
// tokens to match the old /reports controls. `surface` drives only the emphasis
// accent (active toggle + brand text) so portal stays teal, never orange.
export function ReportsControlsBar({
  surface,
  controls,
  sectionLabel = "Performance Overview",
  refreshSection = "overview",
  showDates = true,
  showClientSelect = true,
  showRefreshButton = true,
  showPdfExport = true,
  clientLabel,
  backHref,
  refreshRange,
  extras,
}: {
  surface: SurfaceKind;
  controls: ControlsBarControls;
  sectionLabel?: string;
  refreshSection?: string;
  showDates?: boolean;
  /** false on portal: the client is resolved from the session, not selectable. */
  showClientSelect?: boolean;
  /** false on portal: forcing a Redshift re-query is a hub/internal action. */
  showRefreshButton?: boolean;
  /** Print/Save-as-PDF for the current report page (hub + portal). */
  showPdfExport?: boolean;
  /** Portal only — static client identification replacing the select, e.g.
      "Acme Co · AC01". */
  clientLabel?: string;
  /** Portal only — renders a "← Back to reports" link before the heading. */
  backHref?: string;
  /** Overrides the range sent to RefreshButton (e.g. a year range when the
      date pickers are hidden). */
  refreshRange?: { start: string; end: string };
  extras?: ReactNode;
}) {
  const palette = getSurfacePalette(surface);
  const {
    clients = [], clientsLoading = false, selectedClient = "", setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, accountId, start, end, bumpRefresh,
  } = controls;
  const fieldCls = `bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 ${
    surface === "portal" ? "focus:ring-portal-accent" : "focus:ring-brand"
  }`;
  const toggleBase = "px-2 py-0.5 rounded-md text-xs font-bold transition-all";

  return (
    <div className="flex items-center gap-3 min-w-0 flex-wrap w-full">
      {backHref && (
        <Link
          href={backHref}
          className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground shrink-0"
        >
          <ArrowLeft className="size-3.5" />
          Back to reports
        </Link>
      )}
      <div className="flex flex-col min-w-0 shrink-0">
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
          <span className="font-bold text-sidebar-foreground">Client</span>
          <span className="font-normal" style={{ color: palette.accent }}>Reports</span>
        </h1>
        {clientLabel && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{clientLabel}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground/70 truncate">{sectionLabel}</span>

      <div className="glass-card rounded-lg border border-border/60 px-3 py-1 text-sm flex items-center gap-2 shrink-0 flex-wrap ml-auto">
        {/* Client select — 3 states: loading / empty / populated. Hidden on
            portal, where the client is resolved from the session. The
            `setSelectedClient &&` guard is load-bearing as well as a type
            narrowing: a controls object without it can never render the
            select, so the portal cannot grow one by accident. */}
        {showClientSelect && setSelectedClient && (<>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          disabled={clientsLoading || clients.length === 0}
          className={fieldCls}
        >
          {clientsLoading && <option>Loading clients…</option>}
          {!clientsLoading && clients.length === 0 && <option>No clients available</option>}
          {!clientsLoading &&
            clients.map((c) => (
              <option key={c.clientIdCode} value={c.clientName}>
                {c.clientName}
              </option>
            ))}
        </select>

        <div className="h-4 w-px bg-border/40" />
        </>)}

        {showDates && (<>
        {/* Week / Custom toggle */}
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/30 border border-border/40">
          {(["week", "custom"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`${toggleBase} ${mode === m ? "text-white shadow-sm" : "text-foreground/70 hover:text-foreground"}`}
              style={mode === m ? { background: palette.accent } : undefined}
            >
              {m === "week" ? "Week" : "Custom"}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border/40" />

        {mode === "week" ? (
          <div className="flex items-center gap-2">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${fieldCls} tabular-nums`}>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select value={week} onChange={(e) => setWeek(Number(e.target.value))} className={`${fieldCls} tabular-nums`}>
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>W{w}</option>
              ))}
            </select>
            <span className="text-foreground/70 text-xs tabular-nums">{start} – {end}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <DatePicker value={customStart} onChange={setCustomStart} className="h-6 text-xs font-bold" />
            <span className="text-foreground/40">–</span>
            <DatePicker value={customEnd} onChange={setCustomEnd} className="h-6 text-xs font-bold" />
          </div>
        )}

        <div className="h-4 w-px bg-border/40" />
        </>)}

        {extras}

        {showPdfExport && (
          <button
            type="button"
            onClick={() =>
              exportReportPagePdf({
                clientName: clientLabel?.split("·")[0]?.trim() || selectedClient || undefined,
                sectionLabel,
                start: refreshRange ? refreshRange.start : showDates ? start : undefined,
                end: refreshRange ? refreshRange.end : showDates ? end : undefined,
              })
            }
            className={`inline-flex items-center gap-1 bg-background border rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
              surface === "portal"
                ? "border-portal-accent/60 text-portal-accent hover:bg-portal-accent/10"
                : "border-brand/60 text-brand hover:bg-brand/10"
            }`}
            title="Download this page as PDF"
          >
            <FileDown className="size-3.5" />
            PDF
          </button>
        )}

        {/* Hub/internal only. The `bumpRefresh &&` guard is load-bearing as well
            as a type narrowing: a controls object without it can never render
            the button, so the portal cannot grow one by accident. */}
        {showRefreshButton && bumpRefresh && (
          <RefreshButton
            section={refreshSection}
            accountId={accountId}
            start={refreshRange ? refreshRange.start : showDates ? start : ""}
            end={refreshRange ? refreshRange.end : showDates ? end : ""}
            onRefreshed={bumpRefresh}
          />
        )}
      </div>
    </div>
  );
}
