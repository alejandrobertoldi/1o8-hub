/**
 * IANA timezone helpers.
 *
 * `users.residence_timezone` holds a raw IANA zone string, so it must be
 * validated before it reaches `Intl.DateTimeFormat` — verified on Node
 * v24.13.1, `new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angles" })`
 * throws `RangeError: Invalid time zone specified`.
 */

/**
 * True only for a string the runtime's `Intl.DateTimeFormat` actually accepts.
 *
 * This is deliberately a try/catch and NOT a membership test against
 * `SUPPORTED_TIME_ZONES`. Verified on Node v24.13.1:
 * `Intl.supportedValuesOf("timeZone")` returns 418 CANONICAL zones and
 * EXCLUDES `UTC`, `Etc/UTC`, `Europe/Kyiv` and `Asia/Kolkata` — all four of
 * which `DateTimeFormat` accepts. A membership check would reject the UTC
 * fallback itself and would reject `Europe/Kyiv` for a Ukraine-based team
 * member. A try/catch accepts exactly what the runtime accepts, and never
 * drifts as ICU updates.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    void new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The runtime's canonical zone list, for populating a picker. 418 entries on
 * Node v24.13.1. NEVER use this to validate — see `isValidTimeZone`.
 */
export const SUPPORTED_TIME_ZONES: readonly string[] =
  Intl.supportedValuesOf("timeZone");

/**
 * UTC offset label for a zone at `now`, e.g. "UTC+08:00" / "UTC-05:00".
 * Uses Intl longOffset so DST is reflected for the given instant.
 */
export function utcOffsetLabel(timeZone: string, now = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return "UTC";
    // "GMT+08:00" | "GMT-5" | "GMT" → UTC-prefixed with minutes when missing
    let s = part.replace(/^GMT/i, "UTC");
    if (s === "UTC") return "UTC+00:00";
    const m = s.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return s;
    const hh = m[2].padStart(2, "0");
    const mm = (m[3] ?? "00").padStart(2, "0");
    return `UTC${m[1]}${hh}:${mm}`;
  } catch {
    return "UTC";
  }
}

function offsetMinutes(label: string): number {
  const m = label.match(/^UTC([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

export type TimeZoneOption = { value: string; label: string };

/**
 * Select options for every canonical zone (+ UTC), labeled with current UTC
 * offset and sorted west→east then by name. Pass `current` so a stored value
 * missing from the canonical list still appears.
 */
export function timeZoneSelectOptions(
  current: string | null = null,
  now = new Date()
): TimeZoneOption[] {
  const zones = new Set<string>(["UTC", ...SUPPORTED_TIME_ZONES]);
  if (current && isValidTimeZone(current)) zones.add(current);

  return [...zones]
    .map((value) => {
      const offset = utcOffsetLabel(value, now);
      return {
        value,
        label: `(${offset}) ${value}`,
        _sort: offsetMinutes(offset),
      };
    })
    .sort((a, b) => a._sort - b._sort || a.value.localeCompare(b.value))
    .map(({ value, label }) => ({ value, label }));
}