"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CountryFlag } from "@/components/country-flag";
import { countryCodeToDisplayCode, isCountryCode, type CountryCode } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type HolidayCalendar = { countryCode: CountryCode; name: string; visible: boolean; people: number };

export const HOLIDAY_CALENDARS_KEY = ["holiday-calendars"] as const;

/** Every holiday calendar + whether it's shown on the general calendar. */
export function useHolidayCalendars() {
  return useQuery<HolidayCalendar[]>({
    queryKey: HOLIDAY_CALENDARS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/holidays/calendars");
      if (!res.ok) throw new Error("Failed to load holiday calendars");
      return res.json();
    },
    staleTime: 60_000,
  });
}

/**
 * Admin-only switches: show or hide each country's holidays on the general
 * calendar. Hiding a calendar never changes anyone's time-off day count.
 */
export function HolidayCalendarToggles() {
  const qc = useQueryClient();
  const { data = [] } = useHolidayCalendars();
  const toggle = useMutation({
    mutationFn: async (c: HolidayCalendar) => {
      const res = await fetch("/api/holidays/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: c.countryCode, visible: !c.visible }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update the calendar");
      return json as { countryCode: string; visible: boolean };
    },
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: HOLIDAY_CALENDARS_KEY });
      const prev = qc.getQueryData<HolidayCalendar[]>(HOLIDAY_CALENDARS_KEY);
      qc.setQueryData<HolidayCalendar[]>(HOLIDAY_CALENDARS_KEY, (old) =>
        old?.map((x) => (x.countryCode === c.countryCode ? { ...x, visible: !x.visible } : x)),
      );
      return { prev };
    },
    onError: (e: Error, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(HOLIDAY_CALENDARS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: HOLIDAY_CALENDARS_KEY }),
  });

  if (!data.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Holiday calendars shown">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Holiday calendars</span>
      {data.map((c) => (
        <button
          key={c.countryCode}
          type="button"
          aria-pressed={c.visible}
          title={`${c.name} · ${c.people} ${c.people === 1 ? "person" : "people"} · ${c.visible ? "shown" : "hidden"} on the calendar`}
          onClick={() => toggle.mutate(c)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all",
            c.visible ? "border-brand/60 bg-brand/10" : "border-border opacity-45 grayscale hover:opacity-80",
          )}
        >
          {isCountryCode(c.countryCode) && <CountryFlag code={c.countryCode} />}
          {countryCodeToDisplayCode(c.countryCode)}
        </button>
      ))}
    </div>
  );
}
