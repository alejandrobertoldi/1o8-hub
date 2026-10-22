"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  clientLabel,
  buildCategoryQuery,
  enumerateDays,
  buildDayHeatmap,
  fmtHM,
  formatWeekdayLabel,
  hoursBucket,
  bucketFill,
  bucketText,
  trafficLight,
  trafficLightFill,
  trafficLightText,
  overtimeBorderClass,
  TEAM_DAY_TARGET_HOURS,
  yearColumnGroups,
  monthColumnGroups,
  weekColumnGroups,
  type DayRow,
} from "@/lib/hours/dashboard-utils";
import {
  HeatmapDayDetail,
  type HeatmapCellSelection,
} from "@/components/admin/heatmap-day-detail";

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";

export function DailyHoursHeatmap({
  from,
  to,
  categories,
  clientNameMap,
}: {
  from: string;
  to: string;
  categories: string[];
  clientNameMap: Map<string, string>;
}) {
  const [dimension, setDimension] = useState<"member" | "client">("member");
  const [selection, setSelection] = useState<HeatmapCellSelection | null>(null);

  useEffect(() => {
    setSelection(null);
  }, [from, to, categories]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["hours-daily", from, to, dimension, categories],
    queryFn: async () => {
      const res = await fetch(
        `/api/hours/summary/daily?from=${from}&to=${to}&dimension=${dimension}${buildCategoryQuery(categories)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load daily hours");
      return res.json() as Promise<{ rows: DayRow[] }>;
    },
  });

  const days = useMemo(() => enumerateDays(from, to), [from, to]);
  const h = useMemo(() => buildDayHeatmap(data?.rows ?? [], days), [data?.rows, days]);
  /**
   * Year/month/week headers keyed by day-column index. A column carrying a month label
   * also gets a left divider (except column 0, where it would draw on the grid's own edge).
   */
  const yearAt = useMemo(
    () => new Map(yearColumnGroups(days).map((g) => [g.index, g.label])),
    [days],
  );
  const monthAt = useMemo(
    () => new Map(monthColumnGroups(days).map((g) => [g.index, g.label])),
    [days],
  );
  const weekAt = useMemo(
    () => new Map(weekColumnGroups(days).map((g) => [g.index, g.label])),
    [days],
  );
  if (days.length === 0) return null;

  const labelFor = (key: string, keyName: string | null) =>
    dimension === "client" ? clientNameMap.get(key) ?? clientLabel(key) : keyName ?? key;

  /** Left divider on month-start columns, so month blocks read as groups. */
  const divider = (index: number) =>
    index > 0 && monthAt.has(index) ? "border-l border-stone-300 dark:border-zinc-700" : "";

  function isSelected(scope: HeatmapCellSelection["scope"], key: string, date: string) {
    return (
      selection?.scope === scope &&
      selection.key === key &&
      selection.date === date
    );
  }

  function selectCell(next: HeatmapCellSelection) {
    setSelection((prev) =>
      prev &&
      prev.scope === next.scope &&
      prev.key === next.key &&
      prev.date === next.date
        ? null
        : next,
    );
  }

  function switchDimension(d: "member" | "client") {
    setDimension(d);
    setSelection(null);
  }

  const selectedRing = "ring-2 ring-brand ring-offset-1 ring-offset-background";

  return (
    <div className="space-y-3">
      {selection && (
        <HeatmapDayDetail
          key={`${selection.scope}:${selection.key}:${selection.date}`}
          selection={selection}
          categories={categories}
          onClear={() => setSelection(null)}
        />
      )}
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Daily hours</div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-stone-200 p-0.5 text-xs dark:border-zinc-800">
            {(["member", "client"] as const).map((d) => (
              <Button
                key={d}
                type="button"
                variant={dimension === d ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => switchDimension(d)}
              >
                {d === "member" ? "Members" : "Clients"}
              </Button>
            ))}
          </div>
          {!isLoading && !error && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {dimension === "member" ? (
                <>
                  <span className="flex items-center gap-0.5">
                    {[1, 3, 5, 7].map((h) => (
                      <span
                        key={h}
                        className="h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"
                        style={{ backgroundColor: trafficLightFill(h) }}
                      />
                    ))}
                  </span>
                  <span>≤7:59</span>
                  <span
                    className="ml-2 h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"
                    style={{ backgroundColor: trafficLightFill(8) }}
                  />
                  <span>8:00</span>
                  <span className="ml-2 flex items-center gap-0.5">
                    {[9, 13, 17, 21].map((h) => (
                      <span
                        key={h}
                        className="h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"
                        style={{ backgroundColor: trafficLightFill(h) }}
                      />
                    ))}
                  </span>
                  <span>8:01+</span>
                </>
              ) : (
                <>
                  <span>Less</span>
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className="h-3 w-3 rounded-sm border border-stone-200 dark:border-zinc-800"
                      style={{ backgroundColor: bucketFill(level) }}
                    />
                  ))}
                  <span>More</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load daily hours"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid w-full gap-1 text-xs"
            style={{ gridTemplateColumns: `minmax(120px, max-content) repeat(${days.length}, minmax(2.75rem, 1fr))` }}
          >
            {/* Year header row. Same label-on-group-start pattern as the month row below,
                and a year change is always also a month change, so the two break together. */}
            <div />
            {days.map((d, i) => (
              <div
                key={d}
                className={`h-3 whitespace-nowrap px-0.5 text-[9px] font-semibold leading-none tabular-nums text-foreground ${divider(i)}`}
              >
                {yearAt.get(i) ?? ""}
              </div>
            ))}

            {/* Month header row. Labels are allowed to overflow their (blank) neighbours,
                matching the log-hours calendar's month strip — which is what lets the full
                month name ("September") sit in a 2.75rem column. */}
            <div />
            {days.map((d, i) => (
              <div
                key={d}
                className={`h-3 whitespace-nowrap px-0.5 text-[9px] font-semibold leading-none text-foreground ${divider(i)}`}
              >
                {monthAt.get(i) ?? ""}
              </div>
            ))}

            {/* ISO week header row. */}
            <div />
            {days.map((d, i) => (
              <div
                key={d}
                className={`h-3 px-0.5 text-[9px] leading-none tabular-nums text-muted-foreground ${divider(i)}`}
              >
                {weekAt.get(i) ?? ""}
              </div>
            ))}

            {/* Weekday header row. Every column carries a label here, so unlike the month
                row it cannot overflow — hence the abbreviation. The day-of-month it used to
                carry moved into the cells below. */}
            <div />
            {days.map((d, i) => (
              <div key={d} className={`flex items-end justify-center px-0.5 pb-1 text-center text-[9px] font-semibold leading-none text-muted-foreground ${divider(i)}`} title={d}>
                {formatWeekdayLabel(d)}
              </div>
            ))}

            {h.keys.map((row) => (
              <Fragment key={row.key}>
                <div className="truncate pr-2 text-[11px] font-medium text-muted-foreground" title={labelFor(row.key, row.keyName)}>
                  {labelFor(row.key, row.keyName)}
                </div>
                {days.map((d, i) => {
                  const v = h.cell(row.key, d);
                  // Per-member days use the 8h traffic light. Client cells are many
                  // people's combined hours, so they keep the orange intensity scale.
                  const useTraffic = dimension === "member";
                  const signal = trafficLight(v);
                  const level = hoursBucket(v);
                  const overtime = useTraffic && signal === "over";
                  const borderClass = useTraffic
                    ? overtimeBorderClass(v)
                    : "border border-stone-200 dark:border-zinc-800";
                  const textClass = useTraffic ? trafficLightText(v) : bucketText(level);
                  const fill = useTraffic ? trafficLightFill(v) : bucketFill(level);
                  const label = labelFor(row.key, row.keyName);
                  const selected = isSelected(dimension, row.key, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      title={`${label} · ${d}: ${fmtHM(v)}${overtime ? " · Overtime" : ""} — click for day detail`}
                      onClick={() =>
                        selectCell({
                          date: d,
                          scope: dimension,
                          key: row.key,
                          label,
                          hours: v,
                        })
                      }
                      className={`flex h-8 w-full min-w-0 cursor-pointer flex-col justify-between rounded-sm px-1 py-[3px] text-[9px] font-medium tabular-nums transition-shadow hover:brightness-95 ${borderClass} ${textClass} ${overtime ? "" : divider(i)} ${selected ? selectedRing : ""}`}
                      style={{ backgroundColor: fill }}
                    >
                      {/* Day-of-month, sliced off the ISO string rather than parsed via
                          Date - no timezone can shift it off by a day. Moved here from the
                          header when that row became weekday-only. */}
                      <span className="self-start text-[8px] font-normal leading-none opacity-60">
                        {Number(d.slice(8))}
                      </span>
                      <span className="self-center leading-none">{v > 0 ? fmtHM(v) : ""}</span>
                    </button>
                  );
                })}
              </Fragment>
            ))}

            {/* Hard rule between per-person/client days and the team All totals. */}
            <div
              className="col-span-full my-1.5 border-t-2 border-stone-400 dark:border-zinc-500"
              role="presentation"
            />

            {/* All (per-day team total): 40h traffic light — yellow under, green at
                exactly 40, scaled red above. */}
            <div className="truncate pr-2 text-[11px] font-semibold text-foreground">All</div>
            {days.map((d, i) => {
              const v = h.dayTotal(d);
              const signal = trafficLight(v, TEAM_DAY_TARGET_HOURS);
              const overtime = signal === "over";
              const selected = isSelected("all", "ALL", d);
              return (
                <button
                  key={d}
                  type="button"
                  title={`All · ${d}: ${fmtHM(v)}${overtime ? " · Over team day" : ""} — click for day detail`}
                  onClick={() =>
                    selectCell({
                      date: d,
                      scope: "all",
                      key: "ALL",
                      label: "All",
                      hours: v,
                    })
                  }
                  /* No day-of-month here - this is a per-day total, not a dated cell, and
                     the number is already in every cell above it. justify-end + the same
                     pb as the rows above keeps the totals on their baseline. */
                  className={`flex h-8 w-full min-w-0 cursor-pointer flex-col items-center justify-end rounded-sm px-1 pb-[3px] text-[9px] font-semibold leading-none tabular-nums transition-shadow hover:brightness-95 ${overtimeBorderClass(v, TEAM_DAY_TARGET_HOURS)} ${trafficLightText(v, TEAM_DAY_TARGET_HOURS)} ${overtime ? "" : divider(i)} ${selected ? selectedRing : ""}`}
                  style={{ backgroundColor: trafficLightFill(v, TEAM_DAY_TARGET_HOURS) }}
                >
                  {v > 0 ? fmtHM(v) : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
