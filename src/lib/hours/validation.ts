/**
 * Pure validation/normalization helpers for the team hours tracker.
 * Times are "HH:MM" 24h strings; Postgres `time` values ("HH:MM:SS")
 * are also accepted by parseTimeToMinutes.
 */

const TIME_RE = /^([01]\d|2[0-3]|24):([0-5]\d)(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTimeToMinutes(t: string): number | null {
  const m = TIME_RE.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidDateString(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const parsed = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

export type NormalizedRange = { startTime: string; endTime: string; hours: number };
export type RangeInput = { startTime: string; endTime?: string; durationHours?: number };

export const MAX_SHIFT_MIN = 16 * 60;

export type Segment = {
  dayOffset: 0 | 1;
  startTime: string;
  endTime: string;
  hours: number;
};

export function computeShift(
  input: RangeInput
): { ok: true; segments: Segment[] } | { ok: false; error: string } {
  const start = parseTimeToMinutes(input.startTime ?? "");
  if (start === null) {
    return { ok: false, error: "Invalid start time — expected HH:MM" };
  }

  const hasEnd = input.endTime !== undefined;
  const hasDuration = input.durationHours !== undefined;
  if (hasEnd === hasDuration) {
    return { ok: false, error: "Provide exactly one of endTime or durationHours" };
  }

  let endAbs: number; // absolute minutes from start-of-day-0; may exceed 1440
  if (hasEnd) {
    const parsed = parseTimeToMinutes(input.endTime as string);
    if (parsed === null) {
      return { ok: false, error: "Invalid end time — expected HH:MM" };
    }
    // end <= start means the shift runs into the next day
    endAbs = parsed <= start ? parsed + 24 * 60 : parsed;
  } else {
    const dur = input.durationHours as number;
    if (!Number.isFinite(dur) || dur <= 0) {
      return { ok: false, error: "Duration must be greater than 0" };
    }
    endAbs = start + Math.round(dur * 60);
  }

  const span = endAbs - start;
  if (span <= 0) {
    return { ok: false, error: "End time must be after start time" };
  }
  if (span > MAX_SHIFT_MIN) {
    return { ok: false, error: "End time must be after start time" };
  }

  const hoursOf = (a: number, b: number) => Math.round(((b - a) / 60) * 100) / 100;
  // An end that lands exactly on midnight is stored "24:00" (end-of-day) so it
  // satisfies the DB CHECK (end_time > start_time); "00:00" would violate it.
  const endLabel = (mins: number) =>
    mins % (24 * 60) === 0 ? "24:00" : minutesToTime(mins % (24 * 60));

  if (endAbs <= 24 * 60) {
    return {
      ok: true,
      segments: [
        {
          dayOffset: 0,
          startTime: minutesToTime(start),
          endTime: endLabel(endAbs),
          hours: hoursOf(start, endAbs),
        },
      ],
    };
  }

  // Crosses midnight → split
  return {
    ok: true,
    segments: [
      {
        dayOffset: 0,
        startTime: minutesToTime(start),
        endTime: "24:00",
        hours: hoursOf(start, 24 * 60),
      },
      {
        dayOffset: 1,
        startTime: "00:00",
        endTime: endLabel(endAbs),
        hours: hoursOf(24 * 60, endAbs),
      },
    ],
  };
}

export function normalizeRange(
  input: RangeInput
): { ok: true; range: NormalizedRange } | { ok: false; error: string } {
  const r = computeShift(input);
  if (!r.ok) return r;
  if (r.segments.length !== 1) {
    return { ok: false, error: "Entry would cross midnight — log it in the tracker to split it" };
  }
  const s = r.segments[0];
  return { ok: true, range: { startTime: s.startTime, endTime: s.endTime, hours: s.hours } };
}

/**
 * Format decimal hours as zero-padded "HH:MM" (e.g. 8.08 → "08:05", 0.5 → "00:30", 2 → "02:00").
 * A duration, not a clock time - totals above a day are not wrapped, so 30 hours reads
 * "30:00" rather than "06:00". Minutes are derived from the 2dp-rounded `hours` value; the
 * <0.3min error this introduces disappears when rounding to the nearest minute.
 */
export function formatHoursMinutes(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type OverlapCandidate = {
  id: string;
  clientIdCode: string;
  startTime: string;
  endTime: string;
};

/** Minutes for an end time, treating an end <= start (i.e. "00:00") as end-of-day (1440). */
export function endMinutes(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s === null || e === null) return 0;
  return e <= s ? e + 24 * 60 : e;
}

/** Add `n` days to a YYYY-MM-DD string using UTC math (month/year-rollover safe). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Where the next entry should start after one is logged: butted up against the
 * end of the entry just saved, so back-to-back logging never overlaps.
 * An end stored as end-of-day ("24:00", or "00:00" from a raw Postgres row)
 * becomes 00:00 on the following day.
 */
export function nextEntryStart(last: { entryDate: string; endTime: string }): {
  entryDate: string;
  startTime: string;
} {
  const end = last.endTime.slice(0, 5);
  if (end === "24:00" || end === "00:00") {
    return { entryDate: addDays(last.entryDate, 1), startTime: "00:00" };
  }
  return { entryDate: last.entryDate, startTime: end };
}

/** Strict interval overlap: s < otherEnd && otherStart < e. Touching edges do not overlap. */
export function findOverlaps(
  range: { startTime: string; endTime: string },
  others: OverlapCandidate[]
): OverlapCandidate[] {
  const s = parseTimeToMinutes(range.startTime);
  if (s === null) return [];
  const e = endMinutes(range.startTime, range.endTime);
  return others.filter((o) => {
    const os = parseTimeToMinutes(o.startTime);
    if (os === null) return false;
    const oe = endMinutes(o.startTime, o.endTime);
    return s < oe && os < e;
  });
}
