import type { Surface } from "@/components/reports/v2/primitives/palette";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";

/** Which params a print URL carries is decided by the section's range kind, so
 *  a snapshot section can never be handed a stale date range. */
export function buildPrintUrl({
  surface,
  sectionId,
  accountId,
  clientName,
  start,
  end,
  year,
  autoprint = false,
}: {
  surface: Surface;
  sectionId: PrintSectionId;
  accountId?: string;
  clientName?: string;
  start?: string;
  end?: string;
  year?: number;
  autoprint?: boolean;
}): string {
  const base =
    surface === "portal"
      ? `/portal/reports/${sectionId}/print`
      : `/reports/${sectionId}/print`;
  const params = new URLSearchParams();

  // Identity is a HUB-ONLY param. The portal resolves its client from the
  // session inside PortalPrintPage, so emitting either of these on a portal URL
  // would create exactly the cross-client leak the spec forbids.
  if (surface !== "portal") {
    if (accountId) params.set("accountId", accountId);
    if (clientName) params.set("client", clientName);
  }

  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  } else if (rangeKind === "year" && year) {
    params.set("year", String(year));
  }

  if (autoprint) params.set("autoprint", "1");

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** A four-digit STRING is not the same as a plausible year: "0000" parses to 0,
 *  which is falsy, so it slips past a `year !== null` gate and then renders an
 *  empty range label and a "0-01-01" date; "0999" yields "999-01-01", breaking
 *  the YYYY-MM-DD contract dates carry across module boundaries. The app's own
 *  picker only offers currentYear-2..+3 (reports-controls-bar.tsx:134), so this
 *  bound cannot reject a value a user could actually select. */
function numberOrNull(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const n = Number(value);
  if (n < 2000 || n > 2100) return null;
  return n;
}

/** Dates cross module boundaries as YYYY-MM-DD strings, never Date objects, and a
 *  print URL is an untrusted boundary. A malformed date is normalised to "" so it
 *  hits the same missing-params gate rather than being forwarded to the report
 *  APIs — the spec's error table asks for "missing OR invalid" params to be
 *  refused, and only "missing" was handled.
 *  Shape plus a real calendar check: "2026-13-45" is well-shaped but not a date. */
function dateOrEmpty(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  // Rejects overflow like 2026-02-30, which Date would silently roll forward.
  return parsed.toISOString().slice(0, 10) === value ? value : "";
}

export interface HubPrintParams {
  accountId: string;
  clientName: string;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
}

export function parseHubPrintParams(sp: RawParams): HubPrintParams {
  return {
    accountId: one(sp.accountId),
    clientName: one(sp.client),
    start: dateOrEmpty(one(sp.start)),
    end: dateOrEmpty(one(sp.end)),
    year: numberOrNull(one(sp.year)),
    autoprint: one(sp.autoprint) === "1",
  };
}

export interface PortalPrintParams {
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
}

/** Deliberately narrower than parseHubPrintParams: it cannot return an
 *  accountId or a client name, so no portal print page can accidentally trust
 *  one. Keep these two parsers separate — merging them and "just not reading"
 *  the identity fields is the regression this shape prevents. */
export function parsePortalPrintParams(sp: RawParams): PortalPrintParams {
  return {
    start: dateOrEmpty(one(sp.start)),
    end: dateOrEmpty(one(sp.end)),
    year: numberOrNull(one(sp.year)),
    autoprint: one(sp.autoprint) === "1",
  };
}

/* ── Saved-file name ──────────────────────────────────────────────────────
   Moved verbatim from export-report-pdf.ts (deleted in Task 13). It drives the
   browser's default Save-as-PDF name via document.title, which PrintDocument
   sets on the print page. */

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildReportPdfFilename(opts: {
  clientName?: string;
  sectionLabel?: string;
  start?: string;
  end?: string;
}): string {
  const parts = [
    opts.clientName ? slugPart(opts.clientName) : null,
    opts.sectionLabel ? slugPart(opts.sectionLabel) : "report",
    opts.start && opts.end ? `${opts.start}_${opts.end}` : null,
  ].filter(Boolean);
  return parts.join("_") || "report";
}
