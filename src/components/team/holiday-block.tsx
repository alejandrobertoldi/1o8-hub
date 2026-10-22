"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CountryFlag } from "@/components/country-flag";
import {
  COUNTRY_FULL_NAMES,
  countrySelectOptions,
  isCountryCode,
} from "@/lib/constants";
import { countWorkingDays } from "@/lib/time-off/working-days";
import { EditableField } from "./editable-field";

type Holiday = { id: string; countryCode: string; holidayDate: string; name: string };

const HOLIDAY_CALENDAR_OPTIONS = countrySelectOptions();

/** Whole years around the current one. No Date.now() in a render path beyond this. */
export function yearOptions(): number[] {
  const current = new Date().getUTCFullYear();
  return [current - 1, current, current + 1];
}

/** YYYY-MM-DD for "today" in the person's residence zone (UTC if unset). */
export function todayKeyInZone(timeZone: string | null, now = new Date()): string {
  const tz = timeZone && timeZone.trim() ? timeZone : "UTC";
  try {
    // en-CA → YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // Bad IANA zone — same fallback the rest of the app uses.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

function isWeekendDate(dateIso: string): boolean {
  const [y, m, d] = dateIso.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function partitionHolidays(
  holidays: Holiday[],
  todayKey: string
): { enjoyed: Holiday[]; upcoming: Holiday[]; weekend: Holiday[] } {
  const enjoyed: Holiday[] = [];
  const upcoming: Holiday[] = [];
  const weekend: Holiday[] = [];
  for (const h of holidays) {
    if (isWeekendDate(h.holidayDate)) {
      weekend.push(h);
      continue;
    }
    if (h.holidayDate <= todayKey) enjoyed.push(h);
    else upcoming.push(h);
  }
  return { enjoyed, upcoming, weekend };
}

function HolidayList({
  items,
  struck,
}: {
  items: Holiday[];
  struck?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-sm">
      {items.map((h) => (
        <li key={h.id} className="flex justify-between gap-3">
          <span className={struck ? "text-muted-foreground line-through" : ""}>
            {h.name}
          </span>
          <span
            className={`tabular-nums ${struck ? "text-muted-foreground" : ""}`}
            title={struck ? "Falls on a weekend — already a non-working day" : undefined}
          >
            {h.holidayDate}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HolidayBlock({
  countryCode,
  residenceTimezone,
  year: yearProp,
  onYearChange,
  hideYearSelect = false,
  canWriteCalendar = false,
  onSaveCalendar,
}: {
  countryCode: string | null;
  residenceTimezone: string | null;
  /** Controlled year (shared with ApprovedPtoBlock). */
  year?: number;
  onYearChange?: (year: number) => void;
  hideYearSelect?: boolean;
  canWriteCalendar?: boolean;
  onSaveCalendar?: (next: string | null) => void;
}) {
  const [yearInternal, setYearInternal] = useState(
    () => new Date().getUTCFullYear()
  );
  const year = yearProp ?? yearInternal;
  const setYear = (y: number) => {
    onYearChange?.(y);
    if (yearProp === undefined) setYearInternal(y);
  };

  const { data, isLoading, isError, error } = useQuery<Holiday[]>({
    queryKey: ["holidays", countryCode, year],
    enabled: Boolean(countryCode),
    queryFn: async () => {
      const res = await fetch(`/api/holidays?country=${countryCode}&year=${year}`);
      if (!res.ok) {
        // Surface the route's own message, as Tasks 10 and 12 both do. A
        // country outside the six-code allowlist returns
        // "country must be one of US, PK, ES, PT, PH, FI", which names the
        // fix; a generic string would hide it.
        const { error } = await res
          .json()
          .catch(() => ({ error: "Failed to load holidays" }));
        throw new Error(error ?? "Failed to load holidays");
      }
      return res.json();
    },
  });

  // Memoized so the identity is stable across renders — `data ?? []` would mint
  // a fresh array every render and defeat the useMemo below.
  const holidays = useMemo(() => data ?? [], [data]);

  /**
   * The weekday-effective count: how many of this year's holidays actually
   * cost or credit a day. countWorkingDays already skips Saturday and Sunday
   * (working-days.ts:77), so a holiday landing on a weekend is inert. Showing
   * the raw list without this number misrepresents what a person gets.
   *
   * Computed as "working days in the year, minus working days in the year once
   * the holidays are excluded" — which is exactly the number of holidays that
   * fell on a weekday, using the same function the time-off maths uses rather
   * than a second, drifting weekend rule.
   *
   * Memoized: this is TWO day-by-day walks of a whole year (730 iterations),
   * and it was re-running on every render — including every keystroke-free
   * re-render the year <select> and react-query trigger. The arithmetic is
   * unchanged; only when it runs is.
   */
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const effective = useMemo(
    () =>
      countWorkingDays(from, to, new Set()) -
      countWorkingDays(from, to, new Set(holidays.map((h) => h.holidayDate))),
    [from, to, holidays]
  );

  const todayKey = todayKeyInZone(residenceTimezone);
  const { enjoyed, upcoming, weekend } = useMemo(
    () => partitionHolidays(holidays, todayKey),
    [holidays, todayKey]
  );

  return (
    <div>
      <div className="mb-3 space-y-1">
        <EditableField
          label="Holiday calendar"
          value={countryCode}
          options={HOLIDAY_CALENDAR_OPTIONS}
          allowClear
          canWrite={canWriteCalendar && Boolean(onSaveCalendar)}
          onSave={onSaveCalendar ?? (() => {})}
          placeholder="Not assigned"
          accentLabel
          renderDisplay={(code) =>
            code && isCountryCode(code) ? (
              <span className="inline-flex items-center gap-1.5">
                <CountryFlag code={code} />
                <span>{COUNTRY_FULL_NAMES[code]}</span>
              </span>
            ) : (
              "Not assigned"
            )
          }
        />
      </div>

      {!countryCode ? (
        <p className="text-sm text-muted-foreground">
          No holiday calendar is assigned, so time-off requests are refused until an
          admin sets one here.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            {!hideYearSelect ? (
              <>
                <label
                  htmlFor="holiday-year"
                  className="text-[10px] font-bold uppercase text-muted-foreground"
                >
                  Year
                </label>
                <select
                  id="holiday-year"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-md border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
                >
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <span
              className={`text-xs text-muted-foreground ${hideYearSelect ? "" : "ml-auto"}`}
            >
              <strong className="text-foreground">{effective}</strong> of {holidays.length}{" "}
              fall on a weekday
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading holidays…</p>
          ) : isError ? (
            /* A failed fetch and a genuinely empty year are DIFFERENT facts and
               must read differently. `data` is undefined after react-query
               exhausts its retries, so `holidays` is [] and the branch below
               would otherwise assert "No holidays are seeded" — an affirmative
               false statement — on a 400, a 401 or a 500. It is reachable with
               a real value: users.country_code is a bare char(2) with no CHECK
               and no FK, while /api/holidays 400s for anything outside its
               six-code allowlist. */
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not load the holiday list for {countryCode} in {year}:{" "}
              {error?.message ?? "unknown error"}. This does not mean the
              calendar is empty.
            </p>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays are seeded for {countryCode} in {year}.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand">
                  Upcoming{" "}
                  <span className="tabular-nums">{upcoming.length}</span>
                </p>
                {upcoming.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None left this year.</p>
                ) : (
                  <HolidayList items={upcoming} />
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand">
                  Enjoyed{" "}
                  <span className="tabular-nums">{enjoyed.length}</span>
                </p>
                {enjoyed.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None yet this year.</p>
                ) : (
                  <HolidayList items={enjoyed} />
                )}
              </div>
              {weekend.length > 0 ? (
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Weekend{" "}
                    <span className="tabular-nums">{weekend.length}</span>
                  </p>
                  <HolidayList items={weekend} struck />
                </div>
              ) : null}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Holiday dates are country-level reference data. Enjoyed uses{" "}
            {residenceTimezone ?? "UTC"} for today.
          </p>
        </>
      )}
    </div>
  );
}
