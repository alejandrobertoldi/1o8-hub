"use client";

import { CalendarClock, Plane } from "lucide-react";
import type { ApprovedRow } from "@/lib/time-off/queries";

/** Rows whose inclusive [startDate, endDate] range covers `cellKey`. Exported
 * so the filtering logic is unit-testable without mounting the component. */
export function rowsForCell(rows: ApprovedRow[], cellKey: string): ApprovedRow[] {
  return rows.filter((r) => r.startDate <= cellKey && cellKey <= r.endDate);
}

/**
 * Read-only "who's off" chips for one calendar day. Never renders `reason` —
 * `ApprovedRow` has no such field (D8; see getApprovedInRange). Deliberately
 * not wrapped in a Popover: unlike MonthGrid's editable chips, these rows
 * have no corresponding calendar_events row to PATCH or DELETE.
 *
 * Visually distinct (sky) from the editable `pto` EventType chip (violet,
 * "PTO / OOO"): the two can land in the same cell, and an inert chip that
 * looks identical to a clickable one reads as a broken control. Same reason
 * HolidayOverlay took indigo rather than the legacy Observance amber.
 */
export function ApprovedTimeOffOverlay({
  rows,
  cellKey,
}: {
  rows: ApprovedRow[];
  cellKey: string;
}) {
  const covering = rowsForCell(rows, cellKey);
  if (covering.length === 0) return null;

  return (
    <>
      {covering.map((r) =>
        r.source === "calendar" ? (
          // Put straight on the shared Google Calendar (part-day blocks, OOO…).
          <div
            key={r.id}
            className="pointer-events-none flex items-start gap-1.5 px-2 py-1 text-[11px] font-medium border w-full rounded-md bg-slate-500/12 text-slate-300 border-slate-500/25"
            title={`${r.label ?? "Time off"}${r.time ? ` · ${r.time}` : ""} — from the shared time off calendar`}
          >
            <CalendarClock className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
              {r.label ?? r.userName ?? "Time off"}
              {r.time && <span className="block text-[10px] font-normal opacity-80">{r.time}</span>}
            </span>
          </div>
        ) : (
          <div
            key={r.id}
            className="pointer-events-none flex items-start gap-1.5 px-2 py-1 text-[11px] font-medium border w-full rounded-md bg-sky-500/12 text-sky-400 border-sky-500/25"
            title={`${r.userName ?? "Team member"} — Time off${r.source === "gusto" ? " (Gusto)" : ""}`}
          >
            <Plane className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
              {r.userName ?? "Team member"}
            </span>
          </div>
        ),
      )}
    </>
  );
}
