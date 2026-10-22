"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Flag, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type CalendarEvent,
  type CalendarFilterKey,
  type EventType,
  DEFAULT_FILTERS,
  EVENT_STYLES,
  FILTER_CHIPS,
  MONTH_NAMES,
  formatDateKey,
  getGridWindow,
  toLocalDateParts,
  eventCoversDate,
} from "./types";
import { MonthGrid } from "./MonthGrid";
import { EventPopoverForm } from "./EventPopover";
import { useSession } from "next-auth/react";
import { hasAdminPowers } from "@/lib/roles";
import { HolidayCalendarToggles, useHolidayCalendars } from "./HolidayCalendarToggles";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { VALID_COUNTRY_CODES } from "@/lib/constants";
import { canSubmitTimeOff } from "@/lib/time-off/guards";
import { RequestTimeOffDialog } from "./RequestTimeOffDialog";
import type { HolidayRow } from "./HolidayOverlay";
import type { ApprovedRow } from "@/lib/time-off/queries";

interface CalendarViewProps {
  initialEvents: CalendarEvent[];
}

type ActivePopover =
  | { kind: "create"; dateKey: string }
  | { kind: "edit"; eventId: string; cellKey: string }
  | null;

export function CalendarView({ initialEvents }: CalendarViewProps) {
  const router = useRouter();
  const today = new Date();

  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [activeFilters, setActiveFilters] = useState<Set<CalendarFilterKey>>(
    () => new Set(DEFAULT_FILTERS)
  );
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [headerCreateOpen, setHeaderCreateOpen] = useState(false);

  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const { data: session } = useSession();
  const canSubmit = canSubmitTimeOff(session?.user?.role ?? "");
  const queryClient = useQueryClient();

  const { data: selfData } = useQuery({
    queryKey: ["time-off", "self"],
    queryFn: async () => {
      const res = await fetch("/api/time-off");
      if (!res.ok) throw new Error("Failed to load time-off data");
      return res.json() as Promise<{ requests: unknown[]; countryCode: string | null }>;
    },
    enabled: canSubmit,
  });
  const countryCode = selfData?.countryCode ?? null;

  // MonthGrid always renders 42 cells, so up to 18 of them are real dates from
  // the adjacent months. Fetching only [1st, last] left those cells blank while
  // the editable events beside them rendered — fetch the whole visible window.
  const { gridStart, gridEnd } = getGridWindow(currentYear, currentMonth);
  const gridStartYear = Number(gridStart.slice(0, 4));
  const gridEndYear = Number(gridEnd.slice(0, 4));

  const { data: approvedTimeOff = [] } = useQuery({
    queryKey: ["time-off", "approved", gridStart, gridEnd],
    queryFn: async () => {
      const res = await fetch(`/api/time-off/approved?from=${gridStart}&to=${gridEnd}`);
      if (!res.ok) throw new Error("Failed to load approved time off");
      return res.json() as Promise<ApprovedRow[]>;
    },
    enabled: canSubmit,
  });

  // A December or January view straddles a year boundary and /api/holidays is
  // keyed by a single year, so run ONE QUERY PER (country × year) the grid
  // window touches. Every VALID_COUNTRY_CODES calendar is overlaid — chips
  // share one deep-blue colour and lead with flag + 3-letter code. Each query keeps
  // the locked ["holidays", country, year] key shape so a year's holidays
  // occupy one cache entry shared with every sibling month and with the
  // admin holidays page — and one country/year failing still leaves the
  // others visible. `combine` keeps the flattened array referentially
  // stable across renders.
  // Only calendars an admin has left switched on (holiday_calendar_settings).
  const { data: calendars } = useHolidayCalendars();
  const visibleCodes = calendars
    ? calendars.filter((c) => c.visible).map((c) => c.countryCode)
    : [...VALID_COUNTRY_CODES];
  const isAdmin = hasAdminPowers(session?.user?.role);
  const holidayYears =
    gridStartYear === gridEndYear ? [gridStartYear] : [gridStartYear, gridEndYear];
  const { data: holidays = [] } = useQueries({
    queries: holidayYears.flatMap((y) =>
      visibleCodes.map((code) => ({
        queryKey: ["holidays", code, y],
        queryFn: async () => {
          const res = await fetch(`/api/holidays?country=${code}&year=${y}`);
          if (!res.ok) throw new Error("Failed to load holidays");
          return res.json() as Promise<HolidayRow[]>;
        },
      }))
    ),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
    }),
  });

  // Events that touch the current visible month
  const monthEvents = useMemo(() => {
    return events.filter((e) => {
      const startParts = toLocalDateParts(e.startDate);
      const endParts = toLocalDateParts(e.endDate);
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);
      const evStart = new Date(startParts.year, startParts.month, startParts.day);
      const evEnd = new Date(endParts.year, endParts.month, endParts.day);
      return evEnd >= monthStart && evStart <= monthEnd;
    });
  }, [events, currentYear, currentMonth]);

  const monthEventCount = monthEvents.filter((e) => activeFilters.has(e.type)).length;

  const handlePrevMonth = useCallback(() => {
    setActivePopover(null);
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth]);

  const handleNextMonth = useCallback(() => {
    setActivePopover(null);
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  const handleToday = useCallback(() => {
    setActivePopover(null);
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleFilter = useCallback((key: CalendarFilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (data: {
      title: string;
      startDate: string;
      endDate: string;
      type: EventType;
      memberName: string | null;
      description: string | null;
    }) => {
      setBusyId("creating");
      try {
        const res = await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to create event");
        }
        const created: CalendarEvent = await res.json();
        setEvents((prev) => [...prev, created]);
        setActivePopover(null);
        setHeaderCreateOpen(false);
        router.refresh();
      } catch (e) {
        console.error("[calendar] create failed", e);
        alert(e instanceof Error ? e.message : "Failed to create event");
      } finally {
        setBusyId(null);
      }
    },
    [router]
  );

  const handleSaveEdit = useCallback(
    async (
      id: string,
      data: {
        title: string;
        startDate: string;
        endDate: string;
        type: EventType;
        memberName: string | null;
        description: string | null;
      }
    ) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/calendar/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to update event");
        }
        const updated: CalendarEvent = await res.json();
        setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
        setActivePopover(null);
        router.refresh();
      } catch (e) {
        console.error("[calendar] update failed", e);
        alert(e instanceof Error ? e.message : "Failed to update event");
      } finally {
        setBusyId(null);
      }
    },
    [router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/calendar/events/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed to delete event");
        }
        setEvents((prev) => prev.filter((e) => e.id !== id));
        setActivePopover(null);
        router.refresh();
      } catch (e) {
        console.error("[calendar] delete failed", e);
        alert(e instanceof Error ? e.message : "Failed to delete event");
      } finally {
        setBusyId(null);
      }
    },
    [router]
  );

  // ── Sidebar data ──────────────────────────────────────────────────

  const upcoming = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return events
      .filter((e) => {
        const endParts = toLocalDateParts(e.endDate);
        const evEnd = new Date(endParts.year, endParts.month, endParts.day);
        return evEnd >= now && activeFilters.has(e.type);
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);
  }, [events, activeFilters]);

  const summaryCounts = useMemo(() => {
    const counts: Record<EventType, number> = {
      holiday: 0,
      deadline: 0,
      content: 0,
      milestone: 0,
      pto: 0,
    };
    for (const ev of monthEvents) counts[ev.type] += 1;
    return counts;
  }, [monthEvents]);

  const publicHolidayCount = useMemo(() => {
    return holidays.filter((h) => {
      const { year, month } = toLocalDateParts(h.holidayDate);
      return year === currentYear && month === currentMonth;
    }).length;
  }, [holidays, currentYear, currentMonth]);

  // Upcoming PTO grouped by team member
  const upcomingPto = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const ptoEvents = events
      .filter((e) => {
        if (e.type !== "pto") return false;
        const endParts = toLocalDateParts(e.endDate);
        return new Date(endParts.year, endParts.month, endParts.day) >= now;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const byMember: Record<string, typeof ptoEvents> = {};
    for (const ev of ptoEvents) {
      const key = ev.memberName ?? "Unknown";
      if (!byMember[key]) byMember[key] = [];
      byMember[key].push(ev);
    }
    return byMember;
  }, [events]);

  return (
    <div>
      {/* Page header */}
      <div className="sticky -top-6 lg:-top-8 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter">
              <span className="text-foreground font-bold">Content</span>
              <span className="text-brand font-medium">Calendar</span>
            </h1>
            {monthEventCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-bold tabular-nums mt-2">
                {monthEventCount} this month
              </span>
            )}
          </div>
          {canSubmit && (
            <RequestTimeOffDialog
              countryCode={countryCode}
              todayKey={todayKey}
              onSubmitted={() => {
                queryClient.invalidateQueries({ queryKey: ["time-off"] });
                router.refresh();
              }}
            />
          )}
          <Popover open={headerCreateOpen} onOpenChange={setHeaderCreateOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                className="bg-[#F7BF1D] text-white hover:bg-[#E5681C] shadow-[0_0_16px_-4px_var(--brand-glow)]"
              >
                <Plus className="size-4 mr-1" />
                Add Event
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="p-4 w-auto"
              onInteractOutside={(e) => {
                const target = (e as CustomEvent).detail?.originalEvent?.target as Element | null;
                if (target?.closest?.('[data-slot="popover-content"]')) e.preventDefault();
              }}
            >
              <EventPopoverForm
                initial={{ startDate: todayKey, endDate: todayKey }}
                onSave={handleCreate}
                onCancel={() => setHeaderCreateOpen(false)}
                saving={busyId === "creating"}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          {/* Month nav + filters */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevMonth}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h2 className="text-2xl font-[family-name:var(--font-outfit)] tracking-tight min-w-[220px] text-center">
                {MONTH_NAMES[currentMonth]}{" "}
                <span className="text-muted-foreground font-normal">{currentYear}</span>
              </h2>
              <button
                onClick={handleNextMonth}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="size-5" />
              </button>
              <Button variant="outline" size="sm" onClick={handleToday} className="text-xs ml-1">
                <CalendarDays className="size-3.5 mr-1" />
                Today
              </Button>
            </div>
            {isAdmin && <HolidayCalendarToggles />}

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map(({ key, style: s }) => {
                const Icon = s.icon;
                const active = activeFilters.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleToggleFilter(key)}
                    className={`
                      inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition-all cursor-pointer
                      ${active
                        ? `${s.bg} ${s.text} ${s.border}`
                        : "bg-transparent text-muted-foreground/50 border-border/30 hover:border-border/50"}
                    `}
                  >
                    <Icon className="size-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <MonthGrid
            year={currentYear}
            month={currentMonth}
            events={events}
            activeFilters={activeFilters}
            activePopover={activePopover}
            onPopoverChange={setActivePopover}
            onSaveEdit={handleSaveEdit}
            onCreate={handleCreate}
            onDelete={handleDelete}
            busyId={busyId}
            approvedTimeOff={approvedTimeOff}
            holidays={holidays}
          />

          {/* Legend */}
          <div className="flex items-center gap-4 px-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
              Legend
            </span>
            <div className="flex gap-3 flex-wrap">
              {FILTER_CHIPS.map(({ key, style: s }) => {
                const Icon = s.icon;
                return (
                  <span key={key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon className={`size-3 ${s.text}`} />
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div
              className="rounded-xl glass-card border border-neutral-300 dark:border-white/10 p-4 animate-card-enter"
              style={{ animationDelay: "80ms" }}
            >
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">
                Upcoming
              </h3>
              <div className="space-y-1.5">
                {upcoming.map((ev) => {
                  const startParts = toLocalDateParts(ev.startDate);
                  const evStart = new Date(startParts.year, startParts.month, startParts.day);
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const diff = Math.ceil((evStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  const s = EVENT_STYLES[ev.type];
                  const Icon = s.icon;
                  const isMultiDay = ev.endDate > ev.startDate;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setCurrentYear(startParts.year);
                        setCurrentMonth(startParts.month);
                        setActivePopover({ kind: "edit", eventId: ev.id, cellKey: ev.startDate });
                      }}
                      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted/60 group cursor-pointer"
                    >
                      <div className={`shrink-0 rounded-md p-1.5 ${s.bg}`}>
                        <Icon className={`size-3.5 ${s.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate group-hover:text-brand transition-colors">
                          {ev.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {evStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {isMultiDay && (
                            <>
                              {" – "}
                              {(() => {
                                const e = toLocalDateParts(ev.endDate);
                                return new Date(e.year, e.month, e.day).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                });
                              })()}
                            </>
                          )}
                          {diff === 0 && <span className="ml-1 font-bold text-brand">Today</span>}
                          {diff === 1 && <span className="ml-1 text-amber-400">Tomorrow</span>}
                          {diff > 1 && diff <= 7 && (
                            <span className="ml-1 text-muted-foreground/70">{diff}d</span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team OOO */}
          {Object.keys(upcomingPto).length > 0 && (
            <div
              className="rounded-xl glass-card border border-neutral-300 dark:border-white/10 p-4 animate-card-enter"
              style={{ animationDelay: "120ms" }}
            >
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">
                Team OOO
              </h3>
              <div className="space-y-3">
                {Object.entries(upcomingPto).map(([member, ptoList]) => (
                  <div key={member}>
                    <p className="text-xs font-semibold text-foreground mb-1">{member}</p>
                    <div className="space-y-1">
                      {ptoList.map((ev) => {
                        const startParts = toLocalDateParts(ev.startDate);
                        const endParts = toLocalDateParts(ev.endDate);
                        const startStr = new Date(startParts.year, startParts.month, startParts.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        const endStr = ev.endDate > ev.startDate
                          ? new Date(endParts.year, endParts.month, endParts.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : null;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => {
                              setCurrentYear(startParts.year);
                              setCurrentMonth(startParts.month);
                              setActivePopover({ kind: "edit", eventId: ev.id, cellKey: ev.startDate });
                            }}
                            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60 transition-colors group cursor-pointer"
                          >
                            <Plane className="size-3 shrink-0 text-violet-400" />
                            <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate">
                              {startStr}{endStr ? ` – ${endStr}` : ""}
                              {ev.title !== member && (
                                <span className="ml-1 text-muted-foreground/50">· {ev.title}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly summary */}
          <div
            className="rounded-xl glass-card border border-neutral-300 dark:border-white/10 p-4 animate-card-enter"
            style={{ animationDelay: "160ms" }}
          >
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">
              {MONTH_NAMES[currentMonth]} Summary
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {FILTER_CHIPS.map(({ key, style: s }) => {
                const Icon = s.icon;
                const count =
                  key === "publicHoliday" ? publicHolidayCount : summaryCounts[key];
                return (
                  <div key={key} className={`rounded-lg px-3 py-2 ${s.bg} ${s.border} border`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`size-3 ${s.text}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
                        {s.label}
                      </span>
                    </div>
                    <span
                      className={`text-xl font-bold tabular-nums ${s.text} font-[family-name:var(--font-outfit)]`}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hint */}
          <div className="px-2">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              <Flag className="size-3 inline-block mr-1 relative -top-px" />
              Click any event to edit. Click an empty day to create. Multi-day events stretch with a continuation bar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
