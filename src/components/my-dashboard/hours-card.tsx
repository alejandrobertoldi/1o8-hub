"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { TIME_SETTINGS } from "@/lib/time-logs/catalog";
import { hoursFlag } from "@/lib/time-logs/flags";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 14;
const DAY = 86_400_000;
const back = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const h = (n: number) => `${Math.round(n * 100) / 100} h`;

/**
 * The hours flag on My Dashboard: workdays of the last two weeks under 8 h
 * (red until fixed), plus today, the last workday and this week at a glance.
 * Hidden when the viewer can't read that person's hours.
 */
export function HoursCard({ userId, today, self }: { userId: string; today: string; self: boolean }) {
  const { data: logs, isLoading, error } = useQuery<{ entryDate: string; hours: string }[]>({
    queryKey: ["dashboard-hours", userId, today],
    queryFn: async () => {
      const qs = new URLSearchParams({ from: back(today, WINDOW_DAYS), to: today, userId });
      const res = await fetch(`/api/time-logs?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });
  // Holidays on that person's calendar (US by default) aren't workdays.
  const { data: holidays } = useQuery<{ dates: string[] }>({
    queryKey: ["dashboard-holidays", userId, today],
    queryFn: async () => {
      const qs = new URLSearchParams({ from: back(today, WINDOW_DAYS), to: today, userId });
      const res = await fetch(`/api/time-logs/holidays?${qs}`);
      return res.ok ? res.json() : { dates: [] };
    },
    staleTime: 60 * 60_000,
  });
  if (error || isLoading || !logs) return null;

  const f = hoursFlag(logs, today, { windowDays: WINDOW_DAYS, holidays: new Set(holidays?.dates ?? []) });
  const min = TIME_SETTINGS.dailyMinimumHours;
  const short = f.shortDays.length > 0;

  return (
    <section id="hours" className={cn("rounded-lg border bg-card p-4", short && "border-brand-red/50")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {short ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand-red" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {short
                ? `${f.shortDays.length} workday${f.shortDays.length === 1 ? "" : "s"} under ${min} h in the last 2 weeks`
                : self
                  ? "Your hours are up to date"
                  : "Hours are up to date"}
            </h2>
            {short && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {f.shortDays.slice(0, 5).map((d, i) => (
                  <span key={d.date}>
                    {i > 0 && " · "}
                    {fmtDay(d.date)} <span className="font-semibold text-brand-red">{h(d.hours)}</span>
                  </span>
                ))}
                {f.shortDays.length > 5 && ` · +${f.shortDays.length - 5} more`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            Today <b className="tabular-nums text-foreground">{h(f.today)}</b>
          </span>
          {f.lastWorkday && (
            <span>
              {fmtDay(f.lastWorkday.date).split(",")[0]}{" "}
              <b className={cn("tabular-nums", f.lastWorkday.hours < min ? "text-brand-red" : "text-foreground")}>{h(f.lastWorkday.hours)}</b>
            </span>
          )}
          <span>
            This week <b className={cn("tabular-nums", f.week.logged < f.week.expected ? "text-orange-500" : "text-foreground")}>{h(f.week.logged)}</b>
            {f.week.expected > 0 && <> of {h(f.week.expected)} so far</>}
          </span>
        </div>
        {self && (
          <div className="flex gap-2 text-xs">
            <Link href="/hours" className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 font-semibold text-brand-foreground hover:opacity-90">
              <Clock className="size-3.5" /> Log hours
            </Link>
            <Link href="/hours/analytics?tab=mine" className="rounded-md border px-2.5 py-1.5 font-medium hover:border-brand">
              My hours
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
