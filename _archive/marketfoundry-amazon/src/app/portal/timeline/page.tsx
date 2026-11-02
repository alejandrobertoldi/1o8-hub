/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { portalClientQuery } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients } from "@/components/portal/portal-stacked-clients";

// ── Types ───────────────────────────────────────────────────────────

type PortalTask = {
  section: string;
  taskName: string;
  startDay: number;
  durationDays: number;
  completionPct: number;
  status: "pending" | "in_progress" | "completed";
  assignedTo: string | null;
};

type PhaseSummary = {
  section: string;
  minDay: number;
  maxDay: number;
  avgPct: number;
  completedCount: number;
  totalCount: number;
};

type TimelineResponse = {
  enabled: boolean;
  initialized: boolean;
  onboardingDate: string | null;
  tasks: PortalTask[];
  sections: PhaseSummary[];
};

// ── Constants ───────────────────────────────────────────────────────

const TOTAL_WEEKS = 13;
const SECTION_ORDER = ["Onboarding", "SEO", "PPC", "Design", "Recurring Tasks", "Others"];

const PHASE_COLOR: Record<string, { bg: string; text: string; header: string; hex: string }> = {
  Onboarding: { bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", header: "bg-blue-500/5", hex: "#3b82f6" },
  SEO: { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", header: "bg-emerald-500/5", hex: "#10b981" },
  PPC: { bg: "bg-red-500", text: "text-red-600 dark:text-red-400", header: "bg-red-500/5", hex: "#ef4444" },
  Design: { bg: "bg-purple-500", text: "text-purple-600 dark:text-purple-400", header: "bg-purple-500/5", hex: "#a855f7" },
  "Recurring Tasks": { bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", header: "bg-amber-500/5", hex: "#f59e0b" },
  Others: { bg: "bg-zinc-500", text: "text-zinc-500 dark:text-zinc-400", header: "bg-zinc-500/5", hex: "#71717a" },
};


// ── Helpers ─────────────────────────────────────────────────────────

function getWeekDate(onboardingDate: Date, week: number): Date {
  const d = new Date(onboardingDate);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}

function getWeekEnd(onboardingDate: Date, week: number): Date {
  const d = getWeekDate(onboardingDate, week);
  d.setDate(d.getDate() + 6);
  return d;
}

function getDayDate(onboardingDate: Date, day: number): Date {
  const d = new Date(onboardingDate);
  d.setDate(d.getDate() + day - 1);
  return d;
}

function formatShortDate(d: Date): string {
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  return `${mon}${day}`;
}

function computeWeekStart(startDay: number): number {
  return Math.ceil(startDay / 7);
}

function computeWeekEnd(startDay: number, durationDays: number): number {
  return Math.ceil((startDay + Math.max(durationDays - 1, 0)) / 7);
}

// ── Frozen column widths ────────────────────────────────────────────

const COL = {
  task: 180,
  startDate: 75,
  endDate: 75,
  days: 55,
  pct: 50,
} as const;
const FROZEN_W = Object.values(COL).reduce((a, b) => a + b, 0);
const WEEK_W = 104;

// ── Main component ──────────────────────────────────────────────────

export default function PortalTimeline() {
  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Project Timeline"
          >
            <span className="font-bold text-sidebar-foreground">Project</span>
            <span className="font-normal text-portal-accent">Timeline</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track milestones and deliverables across your account.
          </p>
        </div>
      </PageMetaSlot>

      {/* One timeline per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <TimelineForClient clientIdCode={code} />}</PortalStackedClients>
    </div>
  );
}

function TimelineForClient({ clientIdCode }: { clientIdCode: string }) {
  const { data, isLoading } = useQuery<TimelineResponse>({
    queryKey: ["portal-timeline", clientIdCode],
    queryFn: () => fetch(`/api/portal/timeline${portalClientQuery(clientIdCode)}`).then((r) => r.json()),
  });

  return (
    <div className="space-y-6">
      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Not enabled */}
      {!isLoading && !data?.enabled && (
        <div className="rounded-xl border border-border/60 bg-card p-16 text-center">
          <div className="inline-flex items-center justify-center rounded-xl bg-portal-accent/10 p-4 mb-4">
            <Clock className="size-8 text-portal-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your onboarding timeline will appear when your project begins.
          </p>
        </div>
      )}

      {/* Not initialized */}
      {!isLoading && data?.enabled && !data.initialized && (
        <div className="rounded-xl border border-border/60 bg-card p-16 text-center">
          <div className="inline-flex items-center justify-center rounded-xl bg-portal-accent/10 p-4 mb-4">
            <Clock className="size-8 text-portal-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Setting Up</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your timeline is being configured. Check back soon.
          </p>
        </div>
      )}

      {/* Gantt view */}
      {!isLoading && data?.enabled && data.initialized && (
        <GanttView
          tasks={data.tasks}
          sections={data.sections}
          onboardingDate={data.onboardingDate ? new Date(data.onboardingDate) : null}
        />
      )}
    </div>
  );
}

// ── Gantt view ──────────────────────────────────────────────────────

function GanttView({
  tasks,
  sections,
  onboardingDate,
}: {
  tasks: PortalTask[];
  sections: PhaseSummary[];
  onboardingDate: Date | null;
}) {
  const currentWeek = onboardingDate
    ? Math.max(1, Math.min(TOTAL_WEEKS, Math.ceil((Date.now() - onboardingDate.getTime()) / (7 * 86400000)) + 1))
    : null;

  const totalGridW = FROZEN_W + TOTAL_WEEKS * WEEK_W;

  const grouped = useMemo(() => {
    const map = new Map<string, PortalTask[]>();
    for (const t of tasks) {
      const list = map.get(t.section) ?? [];
      list.push(t);
      map.set(t.section, list);
    }
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
      {/* Phase summary bars */}
      <div className="flex gap-3">
        {sections.map((p) => {
          const color = PHASE_COLOR[p.section] ?? PHASE_COLOR.Onboarding;
          return (
            <div key={p.section} className="flex-1 rounded-lg border border-border/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${color.text}`}>{p.section}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {p.completedCount}/{p.totalCount} tasks
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color.bg} transition-all duration-500`}
                  style={{ width: `${p.avgPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">
                  {onboardingDate
                    ? `${formatShortDate(getDayDate(onboardingDate, p.minDay))} — ${formatShortDate(getDayDate(onboardingDate, p.maxDay))}`
                    : `D${p.minDay}–D${p.maxDay}`}
                </span>
                <span className="text-[10px] font-bold tabular-nums">{p.avgPct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gantt grid */}
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <div style={{ minWidth: `${totalGridW}px` }}>
          {/* Header */}
          <div className="flex border-b-2 border-border/60 bg-zinc-900 dark:bg-zinc-900">
            <div className="sticky left-0 z-20 flex shrink-0 bg-zinc-900 border-r border-border/50" style={{ width: `${FROZEN_W}px` }}>
              <HCell w={COL.task}>Group</HCell>
              <HCell w={COL.startDate} center>Start</HCell>
              <HCell w={COL.endDate} center>End</HCell>
              <HCell w={COL.days} center>Days</HCell>
              <HCell w={COL.pct} center>%</HCell>
            </div>
            <div className="flex">
              {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
                <div
                  key={w}
                  className={`relative text-center text-[9px] font-bold text-zinc-400 py-2 border-l border-zinc-700 ${
                    w === currentWeek ? "bg-amber-500/15 text-amber-300" : ""
                  }`}
                  style={{ width: `${WEEK_W}px` }}
                >
                  <span className="text-zinc-500 mr-1">W{String(w).padStart(2, "0")}</span>
                  {onboardingDate && `${formatShortDate(getWeekDate(onboardingDate, w))} - ${formatShortDate(getWeekEnd(onboardingDate, w))}`}
                </div>
              ))}
            </div>
          </div>

          {/* Sections + rows */}
          {SECTION_ORDER.map((section) => {
            const sectionTasks = grouped.get(section) ?? [];
            if (sectionTasks.length === 0) return null;
            const color = PHASE_COLOR[section] ?? PHASE_COLOR.Onboarding;
            return (
              <div key={section}>
                {/* Section header */}
                <div className={`flex items-center border-b border-border/30 ${color.header} px-2 py-1.5`}>
                  <div className={`size-2 rounded-full ${color.bg} mr-2`} />
                  <span className={`text-xs font-bold tracking-wide ${color.text}`}>
                    {section}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-2">({sectionTasks.length})</span>
                </div>
                {/* Rows */}
                {sectionTasks.map((task, idx) => (
                  <TaskRow
                    key={`${section}-${idx}`}
                    task={task}
                    section={section}
                    currentWeek={currentWeek}
                    onboardingDate={onboardingDate}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Header cell ─────────────────────────────────────────────────────

function HCell({ w, children, center }: { w: number; children: React.ReactNode; center?: boolean }) {
  return (
    <div
      className={`text-[10px] font-medium px-1.5 py-2 truncate flex items-center ${center ? "text-center justify-center" : ""}`}
      style={{ width: `${w}px` }}
    >
      {children}
    </div>
  );
}

// ── Task row ────────────────────────────────────────────────────────

function TaskRow({
  task,
  section,
  currentWeek,
  onboardingDate,
}: {
  task: PortalTask;
  section: string;
  currentWeek: number | null;
  onboardingDate: Date | null;
}) {
  const endDay = task.startDay + task.durationDays;
  const wkStart = computeWeekStart(task.startDay);
  const wkEnd = computeWeekEnd(task.startDay, task.durationDays);
  const startDateStr = onboardingDate ? formatShortDate(getDayDate(onboardingDate, task.startDay)) : `D${task.startDay}`;
  const endDateStr = onboardingDate ? formatShortDate(getDayDate(onboardingDate, endDay)) : `D${endDay}`;

  return (
    <div className="flex border-b border-border/20 min-h-[30px] group hover:bg-muted/20">
      {/* Frozen columns */}
      <div className="sticky left-0 z-10 flex shrink-0 bg-background group-hover:bg-muted/20 border-r border-border/30" style={{ width: `${FROZEN_W}px` }}>
        <div
          className="text-[10px] px-2 flex items-center font-medium truncate"
          style={{ width: `${COL.task}px`, minWidth: `${COL.task}px` }}
        >
          {task.taskName}
        </div>
        <div
          className="text-[10px] px-1.5 flex items-center justify-center tabular-nums text-muted-foreground"
          style={{ width: `${COL.startDate}px`, minWidth: `${COL.startDate}px` }}
        >
          {startDateStr}
        </div>
        <div
          className="text-[10px] px-1.5 flex items-center justify-center tabular-nums text-muted-foreground"
          style={{ width: `${COL.endDate}px`, minWidth: `${COL.endDate}px` }}
        >
          {endDateStr}
        </div>
        <div
          className="text-[10px] px-1.5 flex items-center justify-center tabular-nums"
          style={{ width: `${COL.days}px`, minWidth: `${COL.days}px` }}
        >
          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
            task.durationDays <= 1 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
            task.durationDays <= 7 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
            "bg-red-500/10 text-red-500"
          }`}>
            {task.durationDays}
          </span>
        </div>
        <div
          className="text-[10px] px-1.5 flex items-center justify-center tabular-nums font-medium"
          style={{ width: `${COL.pct}px`, minWidth: `${COL.pct}px` }}
        >
          <span className={task.completionPct > 0 ? (PHASE_COLOR[section] ?? PHASE_COLOR.Onboarding).text : ""}>
            {task.completionPct}%
          </span>
        </div>
      </div>

      {/* Gantt bars */}
      <div className="flex relative">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
          const isInRange = w >= wkStart && w <= wkEnd;
          const isStart = w === wkStart;
          const isEnd = w === wkEnd;
          const isTodayCol = w === currentWeek;

          return (
            <div
              key={w}
              className={`relative border-l border-zinc-700 ${isTodayCol ? "bg-amber-500/5" : ""}`}
              style={{ width: `${WEEK_W}px` }}
            >
              {/* Day dividers */}
              {[1, 2, 3, 4, 5, 6].map((d) => (
                <div key={d} className="absolute top-0 bottom-0 border-l border-zinc-800/30" style={{ left: `${(d / 7) * 100}%` }} />
              ))}
              {isInRange && (() => {
                const phaseColor = PHASE_COLOR[section] ?? PHASE_COLOR.Onboarding;
                return (
                  <div
                    className={`absolute inset-x-0.5 top-1/2 -translate-y-1/2 h-5 overflow-hidden
                      ${isStart ? "rounded-l-[1px]" : ""}
                      ${isEnd ? "rounded-r-[1px]" : ""}
                    `}
                    style={{ backgroundColor: `${phaseColor.hex}20`, outline: `1px solid ${phaseColor.hex}`, outlineOffset: "-1px" }}
                  >
                    <div
                      className={`h-full ${isStart ? "rounded-l-[1px]" : ""} ${isEnd && task.completionPct >= 95 ? "rounded-r-[1px]" : ""} ${phaseColor.bg}`}
                      style={{ width: `${Math.max(task.completionPct, task.completionPct > 0 ? 5 : 0)}%` }}
                    />
                    {isStart && wkEnd - wkStart >= 1 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">
                        {task.completionPct}%
                      </span>
                    )}
                  </div>
                );
              })()}
              {isTodayCol && onboardingDate && (() => {
                const daysSinceWeekStart = ((Date.now() - onboardingDate.getTime()) / 86400000) - (w - 1) * 7;
                const pct = Math.min(Math.max(daysSinceWeekStart / 7, 0), 1) * 100;
                return <div className="absolute top-0 bottom-0 w-px border-r border-dashed border-amber-500 z-[5]" style={{ left: `${pct}%` }} />;
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
