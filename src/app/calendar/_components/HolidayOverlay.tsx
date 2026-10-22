"use client";

import { countryCodeToDisplayCode } from "@/lib/constants";
import { CountryFlag } from "@/components/country-flag";
import { PUBLIC_HOLIDAY_STYLE } from "./types";

export interface HolidayRow {
  id: string;
  countryCode: string;
  holidayDate: string;
  name: string;
}

/** Shared chip chrome for every public-holiday row — countries are told
 * apart by the leading flag + 3-letter code, never by a per-country colour.
 * Kept out of EVENT_STYLES because these are read-only overlays, not editable
 * calendar_events; deep blue stays distinct from Observance amber (D12) and
 * Content emerald. */
export const HOLIDAY_CHIP_CLASS = [
  PUBLIC_HOLIDAY_STYLE.bg,
  PUBLIC_HOLIDAY_STYLE.text,
  PUBLIC_HOLIDAY_STYLE.border,
].join(" ");

/** Rows landing exactly on `cellKey` — holidays are single-day, unlike
 * time-off ranges. Exported for isolated testing. */
export function rowsForCell(rows: HolidayRow[], cellKey: string): HolidayRow[] {
  return rows.filter((r) => r.holidayDate === cellKey);
}

/**
 * Read-only public-holiday chip(s) for one calendar day. Every country uses
 * the same deep-blue chip; a plain rectangular flag icon + 3-letter code
 * lead so multi-country overlays stay scannable. Distinct from the legacy
 * calendar_events "Observance" chips (amber): these ARE real non-working
 * days (D12), those are content-planning dates.
 */
export function HolidayOverlay({
  rows,
  cellKey,
}: {
  rows: HolidayRow[];
  cellKey: string;
}) {
  const covering = rowsForCell(rows, cellKey);
  if (covering.length === 0) return null;

  return (
    <>
      {covering.map((r) => {
        const displayCode = countryCodeToDisplayCode(r.countryCode);
        return (
          <div
            key={r.id}
            className={`pointer-events-none flex items-start gap-1.5 px-1.5 py-1 text-[11px] font-medium border w-full rounded-md ${HOLIDAY_CHIP_CLASS}`}
            title={`${displayCode} — ${r.name}`}
          >
            <CountryFlag code={r.countryCode} className="mt-0.5" />
            <span className="mt-0.5 shrink-0 text-[10px] font-bold tracking-wider tabular-nums leading-none">
              {displayCode}
            </span>
            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug font-medium">
              {r.name}
            </span>
          </div>
        );
      })}
    </>
  );
}
