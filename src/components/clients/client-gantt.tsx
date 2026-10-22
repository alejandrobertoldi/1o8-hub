"use client";
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CalendarDays, Plus, Trash2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { SECTION_ORDER, TOTAL_WEEKS } from "@/lib/gantt-templates";
import { fmtDate } from "@/lib/formatters";

// ── Types ───────────────────────────────────────────────────────────

type GanttTask = {
  id: number;
  clientIdCode: string;
  wbs: string;
  section: string;
  taskName: string;
  subtaskTitle: string | null;
  weekStart: number;
  weekEnd: number;
  startDay: number;
  durationDays: number;
  status: "pending" | "in_progress" | "completed";
  completionPct: number;
  assignedTo: string | null;
  notes: string | null;
  portalHidden: boolean;
};

type GanttResponse = {
  tasks: GanttTask[];
  clientType: "AIA" | "NTA" | null;
  onboardingDate: string | null;
  portalTimelineEnabled: boolean;
  initialized: boolean;
};

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  asanaEmail: string | null;
  image: string | null;
  role: string;
};

// ── Constants ───────────────────────────────────────────────────────

const TOTAL_DAYS = TOTAL_WEEKS * 7; // 91
const DAY_W = 20; // px per day column

const PHASE_COLOR: Record<string, { bg: string; text: string; header: string; hex: string }> = {
  Onboarding:        { bg: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", header: "bg-[#0f1923] dark:bg-[#0f1923]", hex: "#3b82f6" },
  SEO:               { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", header: "bg-[#0f1a17] dark:bg-[#0f1a17]", hex: "#10b981" },
  PPC:               { bg: "bg-red-500", text: "text-red-600 dark:text-red-400", header: "bg-[#1a0f0f] dark:bg-[#1a0f0f]", hex: "#ef4444" },
  Design:            { bg: "bg-purple-500", text: "text-purple-600 dark:text-purple-400", header: "bg-[#170f1a] dark:bg-[#170f1a]", hex: "#a855f7" },
  "Recurring Tasks": { bg: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", header: "bg-[#1a170f] dark:bg-[#1a170f]", hex: "#f59e0b" },
  Others:            { bg: "bg-zinc-500", text: "text-zinc-500 dark:text-zinc-400", header: "bg-[#141414] dark:bg-[#141414]", hex: "#71717a" },
};

const STATUS_BAR: Record<string, string> = {
  completed: "bg-[var(--brand-green)]",
  in_progress: "bg-[var(--brand-yellow)]",
  pending: "bg-muted-foreground/30",
};

// ── Frozen column widths (px) ───────────────────────────────────────

const COL = {
  task: 280, owner: 110,
  startWk: 42, dueWk: 42, startDate: 52, dueDate: 52, durDays: 42, pct: 38,
} as const;
const FROZEN_W = Object.values(COL).reduce((a, b) => a + b, 0);

// ── Date helpers ────────────────────────────────────────────────────

function getDayDate(onboardingDate: Date, day: number): Date {
  const d = new Date(onboardingDate);
  d.setDate(d.getDate() + day - 1);
  return d;
}

function formatShort(d: Date): string {
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

// ── Main component ──────────────────────────────────────────────────

export function ClientGantt({ clientIdCode }: { clientIdCode: string }) {
  const qc = useQueryClient();
  const [addingSection, setAddingSection] = useState<string | null>(null);
  const ganttHeaderRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<GanttResponse>({
    queryKey: ["gantt", clientIdCode],
    queryFn: () => fetch(`/api/clients/${clientIdCode}/gantt`).then((r) => r.json()),
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["team"],
    queryFn: () => fetch("/api/team").then((r) => r.json()),
    select: (all) => all.filter((u) => hasAdminPowers(u.role) || u.role === "editor"),
  });

  const initMutation = useMutation({
    mutationFn: (payload: { templateType: "AIA" | "NTA"; onboardingDate: string }) =>
      fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateType: payload.templateType }),
      })
        .then((r) => r.json())
        .then(async (res) => {
          await fetch(`/api/clients/${clientIdCode}/gantt`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onboardingDate: payload.onboardingDate }),
          });
          return res;
        }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ taskId, ...patch }: { taskId: number } & Record<string, unknown>) =>
      fetch(`/api/clients/${clientIdCode}/gantt/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) =>
      fetch(`/api/clients/${clientIdCode}/gantt/${taskId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  const addMutation = useMutation({
    mutationFn: (task: { section: string; taskName: string; subtaskTitle?: string; startDay: number; durationDays: number; wbs: string }) =>
      fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, weekStart: computeWeekStart(task.startDay), weekEnd: computeWeekEnd(task.startDay, task.durationDays) }),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }); setAddingSection(null); },
  });

  const togglePortalTimeline = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalTimelineEnabled: enabled }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  const setOnboardingDate = useMutation({
    mutationFn: (date: string) =>
      fetch(`/api/clients/${clientIdCode}/gantt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingDate: date }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  const syncAsana = useMutation({
    mutationFn: () =>
      fetch(`/api/clients/${clientIdCode}/gantt/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gantt", clientIdCode] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}
      </div>
    );
  }

  if (!data?.initialized) {
    return <EmptyState onInit={(t, d) => initMutation.mutate({ templateType: t, onboardingDate: d })} loading={initMutation.isPending} />;
  }

  const onboardingDate = data.onboardingDate ? new Date(data.onboardingDate) : null;

  const grouped = new Map<string, GanttTask[]>();
  for (const t of data.tasks) {
    const list = grouped.get(t.section) ?? [];
    list.push(t);
    grouped.set(t.section, list);
  }

  // Current day offset from onboarding date
  // Current day offset — use UTC noon to avoid timezone edge issues
  const currentDay = onboardingDate
    ? Math.floor((new Date().setHours(12, 0, 0, 0) - new Date(onboardingDate).setHours(12, 0, 0, 0)) / 86400000) + 1
    : null;
  const currentWeek = currentDay ? Math.ceil(currentDay / 7) : null;

  const totalGridW = FROZEN_W + TOTAL_DAYS * DAY_W;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Sticky controls bar */}
      <div className="shrink-0 bg-background pb-3 space-y-3">
      {/* Onboarding date picker + portal toggle */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-bold text-muted-foreground">Onboarding Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="rounded-md border border-stone-200 bg-white px-3 py-1 text-xs font-sans tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
            >
              <CalendarDays className="mr-2 size-3" />
              {onboardingDate ? fmtDate(onboardingDate) : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={onboardingDate ?? undefined}
              onSelect={(date) => {
                if (date) {
                  setOnboardingDate.mutate(date.toISOString().slice(0, 10));
                }
              }}
              defaultMonth={onboardingDate ?? undefined}
            />
          </PopoverContent>
        </Popover>
        {currentWeek && currentWeek >= 1 && currentWeek <= TOTAL_WEEKS && (
          <span className="text-[10px] text-amber-500 font-medium">
            Today: {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · Week {currentWeek} of {TOTAL_WEEKS}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => syncAsana.mutate()}
            disabled={syncAsana.isPending}
            className="flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            title="Sync with Asana"
          >
            <RefreshCw className={`size-3 ${syncAsana.isPending ? "animate-spin" : ""}`} />
            {syncAsana.isPending ? "Syncing…" : "Sync Asana"}
          </button>
          <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-muted-foreground">Portal</label>
          <button
            type="button"
            role="switch"
            aria-checked={data.portalTimelineEnabled}
            onClick={() => togglePortalTimeline.mutate(!data.portalTimelineEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
              data.portalTimelineEnabled ? "bg-[#2563eb]" : "bg-muted-foreground/30"
            }`}
          >
            <span className={`pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
              data.portalTimelineEnabled ? "translate-x-4" : "translate-x-0.5"
            }`} />
          </button>
          <span className="text-[10px] text-muted-foreground">{data.portalTimelineEnabled ? "Enabled" : "Disabled"}</span>
          </div>
        </div>
      </div>

      {/* Phase summary bars */}
      <PhaseSummaryBars tasks={data.tasks} onboardingDate={onboardingDate} />
      </div>

      {/* Gantt grid */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50">
        <div ref={ganttHeaderRef} className="shrink-0 overflow-hidden bg-zinc-900">
          <div style={{ minWidth: `${totalGridW}px` }}>
            {/* Header — two rows: week labels + day numbers */}
            <div className="border-b-2 border-border/60 bg-zinc-900">
            {/* Row 1: Week labels spanning 7 days each */}
            <div className="flex">
              <div className="sticky left-0 z-20 shrink-0 bg-zinc-900 border-r border-border/50" style={{ width: `${FROZEN_W}px` }} />
              <div className="flex">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
                  <div
                    key={w}
                    className={`text-center text-[9px] font-bold text-zinc-400 py-1 border-l border-zinc-700 ${
                      w === currentWeek ? "bg-amber-500/10 text-amber-300" : ""
                    }`}
                    style={{ width: `${7 * DAY_W}px` }}
                  >
                    <span className="text-zinc-500 mr-1">W{String(w).padStart(2, "0")}</span>
                    {onboardingDate ? `${formatShort(getDayDate(onboardingDate, (w - 1) * 7 + 1))} - ${formatShort(getDayDate(onboardingDate, w * 7))}` : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2: Frozen column headers + day numbers */}
            <div className="flex border-t border-zinc-800">
              <div className="sticky left-0 z-20 flex shrink-0 bg-zinc-900 border-r border-border/50" style={{ width: `${FROZEN_W}px` }}>
                <div className="flex flex-col justify-center px-1.5" style={{ width: `${COL.task}px`, minWidth: `${COL.task}px` }}>
                  <span className="text-[10px] font-medium">Group</span>
                  <span className="text-[9px] text-muted-foreground">Task</span>
                </div>
                <HCell w={COL.owner}>Assignee</HCell>
                <HCell w={COL.startWk} center>Start Week</HCell>
                <HCell w={COL.dueWk} center>Due Week</HCell>
                <HCell w={COL.startDate} center>Start Date</HCell>
                <HCell w={COL.dueDate} center>Due Date</HCell>
                <HCell w={COL.durDays} center>Days</HCell>
                <HCell w={COL.pct} center>%</HCell>
              </div>
              <div className="flex">
                {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
                  const isWeekStart = (d - 1) % 7 === 0;
                  const isToday = d === currentDay;
                  return (
                    <div
                      key={d}
                      className={`text-center text-[8px] tabular-nums py-1 ${
                        isWeekStart ? "border-l border-zinc-700" : "border-l border-zinc-800/50"
                      } ${isToday ? "bg-amber-500/20 text-amber-300 font-bold" : "text-zinc-500"}`}
                      style={{ width: `${DAY_W}px` }}
                    >
                      {onboardingDate ? getDayDate(onboardingDate, d).getDate() : d}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto"
          onScroll={(event) => {
            if (ganttHeaderRef.current) {
              ganttHeaderRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        >
          <div style={{ minWidth: `${totalGridW}px` }}>
          {/* Sections + rows */}
          {SECTION_ORDER.map((section) => {
            const tasks = grouped.get(section) ?? [];
            return (
              <GanttSection
                key={section}
                section={section}
                tasks={tasks}
                currentDay={currentDay}
                onboardingDate={onboardingDate}
                teamMembers={teamMembers}
                onUpdate={(taskId, patch) => updateMutation.mutate({ taskId, ...patch })}
                onDelete={(taskId) => deleteMutation.mutate(taskId)}
                onAddClick={() => setAddingSection(section)}
                isAdding={addingSection === section}
                onAddSubmit={(task) => addMutation.mutate({ ...task, section })}
                onAddCancel={() => setAddingSection(null)}
                addPending={addMutation.isPending}
              />
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Header cell ─────────────────────────────────────────────────────

function HCell({ w, children, center }: { w: number; children: React.ReactNode; center?: boolean }) {
  return (
    <div
      className={`text-[10px] font-medium p-1.5 leading-tight break-words flex items-center ${center ? "text-center justify-center" : ""}`}
      style={{ width: `${w}px` }}
    >
      {children}
    </div>
  );
}

// ── Phase summary bars ──────────────────────────────────────────────

function PhaseSummaryBars({ tasks, onboardingDate }: { tasks: GanttTask[]; onboardingDate: Date | null }) {
  const phases = useMemo(() => {
    return SECTION_ORDER.map((section) => {
      const st = tasks.filter((t) => t.section === section);
      if (st.length === 0) return null;
      const minDay = Math.min(...st.map((t) => t.startDay));
      const maxDay = Math.max(...st.map((t) => t.startDay + t.durationDays));
      const avgPct = Math.round(st.reduce((s, t) => s + t.completionPct, 0) / st.length);
      const done = st.filter((t) => t.status === "completed").length;
      return { section, minDay, maxDay, avgPct, done, total: st.length, color: PHASE_COLOR[section] ?? PHASE_COLOR.Onboarding };
    }).filter(Boolean) as Array<{ section: string; minDay: number; maxDay: number; avgPct: number; done: number; total: number; color: typeof PHASE_COLOR.Onboarding }>;
  }, [tasks]);

  if (phases.length === 0) return null;

  return (
    <div className="flex gap-3">
      {phases.map((p) => (
        <div key={p.section} className="flex-1 rounded-lg border border-border/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold ${p.color.text}`}>{p.section}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{p.done}/{p.total} tasks</span>
          </div>
          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
            <div className={`h-full rounded-full ${p.color.bg} transition-all duration-500`} style={{ width: `${p.avgPct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">
              {onboardingDate ? `${formatShort(getDayDate(onboardingDate, p.minDay))} — ${formatShort(getDayDate(onboardingDate, p.maxDay))}` : `D${p.minDay}–D${p.maxDay}`}
            </span>
            <span className="text-[10px] font-bold tabular-nums">{p.avgPct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────

function GanttSection({
  section, tasks, currentDay, onboardingDate, teamMembers, onUpdate, onDelete, onAddClick, isAdding, onAddSubmit, onAddCancel, addPending,
}: {
  section: string; tasks: GanttTask[]; currentDay: number | null; onboardingDate: Date | null;
  teamMembers: TeamMember[];
  onUpdate: (taskId: number, patch: Record<string, unknown>) => void;
  onDelete: (taskId: number) => void;
  onAddClick: () => void; isAdding: boolean;
  onAddSubmit: (task: { taskName: string; subtaskTitle?: string; startDay: number; durationDays: number; wbs: string }) => void;
  onAddCancel: () => void; addPending: boolean;
}) {
  const color = PHASE_COLOR[section] ?? PHASE_COLOR.Onboarding;
  return (
    <>
      <div className={`sticky left-0 z-[14] flex items-center justify-between border-b border-border/30 ${color.header} px-2 py-1.5`} style={{ width: `${FROZEN_W}px`, minWidth: `${FROZEN_W}px` }}>
        <div className="flex items-center gap-2">
          <div className={`size-2 rounded-full ${color.bg}`} />
          <span className={`text-xs font-bold tracking-wide ${color.text}`}>{section}</span>
          <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
        </div>
        <Popover open={isAdding} onOpenChange={(open) => open ? onAddClick() : onAddCancel()}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="size-3" /> Add
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 space-y-2.5" align="end">
            <AddTaskForm onSubmit={(t) => { onAddSubmit(t); }} pending={addPending} nextWbs={getNextWbs(tasks, section)} onboardingDate={onboardingDate} section={section} teamMembers={teamMembers} />
          </PopoverContent>
        </Popover>
      </div>
      {tasks.sort((a, b) => a.wbs.localeCompare(b.wbs)).map((task) => (
        <GanttRow key={task.id} task={task} currentDay={currentDay} onboardingDate={onboardingDate} teamMembers={teamMembers} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </>
  );
}

function getNextWbs(tasks: GanttTask[], section: string): string {
  const sn = section === "Onboarding" ? "1" : section === "Content" ? "2" : "3";
  const nums = tasks.filter((t) => t.wbs.startsWith(sn + ".")).map((t) => parseInt(t.wbs.split(".")[1], 10)).filter((n) => !isNaN(n));
  return `${sn}.${String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(2, "0")}`;
}

// ── Add task row ────────────────────────────────────────────────────

function AddTaskForm({ onSubmit, pending, nextWbs, onboardingDate, section, teamMembers }: {
  onSubmit: (task: { taskName: string; subtaskTitle?: string; startDay: number; durationDays: number; wbs: string }) => void;
  pending: boolean; nextWbs: string; onboardingDate: Date | null; section: string; teamMembers: TeamMember[];
}) {
  const [group, setGroup] = useState("");
  const [task, setTask] = useState("");
  const [startDay, setStartDay] = useState(1);
  const [dur, setDur] = useState(7);
  const startStr = onboardingDate ? formatShort(getDayDate(onboardingDate, startDay)) : `D${startDay}`;
  const dueStr = onboardingDate ? formatShort(getDayDate(onboardingDate, startDay + dur)) : `D${startDay + dur}`;

  const canSubmit = group.trim().length > 0;
  function submit() {
    if (canSubmit) onSubmit({ taskName: group.trim(), subtaskTitle: task.trim() || undefined, startDay, durationDays: dur, wbs: nextWbs });
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] text-muted-foreground">{section}</p>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Group Name</label>
        <input autoFocus type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Intentwise"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm font-semibold text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Task Name</label>
        <input type="text" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Setup account"
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Schedule</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground">Start Date</label>
            {onboardingDate ? (
              <DatePicker
                value={getDayDate(onboardingDate, startDay).toISOString().slice(0, 10)}
                onChange={(v) => {
                  if (!v) return;
                  const picked = new Date(v + "T00:00:00");
                  const diff = Math.round((picked.getTime() - onboardingDate.getTime()) / 86400000) + 1;
                  if (diff >= 1) setStartDay(diff);
                }}
                className="w-full h-7 text-xs"
              />
            ) : (
              <input type="number" min={1} max={91} value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}
                className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
            )}
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground">Duration (days)</label>
            <input type="number" min={1} max={91} value={dur} onChange={(e) => setDur(Number(e.target.value))}
              className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground tabular-nums">
          {startStr} → {dueStr} · W{String(computeWeekStart(startDay)).padStart(2, "0")}–W{String(computeWeekEnd(startDay, dur)).padStart(2, "0")}
        </p>
      </div>
      <Button onClick={submit} disabled={!canSubmit || pending} className="w-full h-8 text-xs bg-brand-solid text-white hover:bg-brand-solid-hover">
        {pending ? <Loader2 className="size-3 animate-spin" /> : "Add Task"}
      </Button>
    </div>
  );
}

// ── Task row ────────────────────────────────────────────────────────

function GanttRow({ task, currentDay, onboardingDate, teamMembers, onUpdate, onDelete }: {
  task: GanttTask; currentDay: number | null; onboardingDate: Date | null;
  teamMembers: TeamMember[];
  onUpdate: (taskId: number, patch: Record<string, unknown>) => void;
  onDelete: (taskId: number) => void;
}) {
  const dueDay = task.startDay + task.durationDays - 1;
  const wkStart = computeWeekStart(task.startDay);
  const wkEnd = computeWeekEnd(task.startDay, task.durationDays);
  const startStr = onboardingDate ? formatShort(getDayDate(onboardingDate, task.startDay)) : `D${task.startDay}`;
  const dueStr = onboardingDate ? formatShort(getDayDate(onboardingDate, task.startDay + task.durationDays)) : `D${task.startDay + task.durationDays}`;

  const assignee = task.assignedTo ? teamMembers.find((m) => m.email === task.assignedTo || m.asanaEmail === task.assignedTo) : null;
  const assigneeLabel = assignee?.name
    ? assignee.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : task.assignedTo ? task.assignedTo.split("@")[0].slice(0, 6) : null;

  return (
    <div className={`flex border-b border-border/20 min-h-[28px] group ${task.portalHidden ? "opacity-40" : ""}`}>
      {/* Frozen columns */}
      <div className="sticky left-0 z-10 flex shrink-0 bg-background group-hover:bg-muted/30 dark:group-hover:bg-[#0d0f14] border-r border-border/30" style={{ width: `${FROZEN_W}px` }}>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex flex-col justify-center px-1.5 truncate text-left cursor-pointer hover:bg-muted/30 transition-colors" style={{ width: `${COL.task}px`, minWidth: `${COL.task}px` }}>
              <span className="text-[10px] font-medium truncate">{task.taskName}</span>
              {task.subtaskTitle && <span className="text-[9px] text-muted-foreground truncate">{task.subtaskTitle}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 space-y-3" align="start">
            <TaskPopover task={task} onUpdate={onUpdate} onDelete={onDelete} onboardingDate={onboardingDate} teamMembers={teamMembers} />
          </PopoverContent>
        </Popover>
        <div className="flex items-center text-[10px] px-0.5" style={{ width: `${COL.owner}px`, minWidth: `${COL.owner}px` }}>
          <Select value={task.assignedTo ?? "__none__"} onValueChange={(v) => onUpdate(task.id, { assignedTo: v === "__none__" ? null : v })}>
            <SelectTrigger className="h-6 text-[9px] border-0 bg-transparent shadow-none w-full p-0 px-1 focus:ring-0 [&>svg]:shrink-0">
              {assignee?.name ? (
                <span className="flex items-center gap-1.5 text-[9px] font-medium text-foreground truncate" title={assignee.name}>
                  {assignee.image ? (
                    <img src={assignee.image} alt="" className="size-4 rounded-full shrink-0 object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="size-4 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[7px] font-bold shrink-0">
                      {assigneeLabel}
                    </span>
                  )}
                  <span className="truncate">{assignee.name}</span>
                </span>
              ) : task.assignedTo ? (
                <span className="flex items-center gap-1.5 text-[9px] text-foreground truncate">
                  <span className="size-4 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[7px] font-bold shrink-0">
                    {task.assignedTo.split("@")[0].slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{task.assignedTo.split("@")[0]}</span>
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground">—</span>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {teamMembers.map((m) => <SelectItem key={m.email} value={m.email}>{m.name || m.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <FCell w={COL.startWk} mono muted center>W{String(wkStart).padStart(2, "0")}</FCell>
        <FCell w={COL.dueWk} mono muted center>W{String(wkEnd).padStart(2, "0")}</FCell>
        <FCell w={COL.startDate} mono muted center>{startStr}</FCell>
        <FCell w={COL.dueDate} mono muted center>{dueStr}</FCell>
        <FCell w={COL.durDays} mono center>
          <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-bold ${
            task.durationDays <= 1 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
            task.durationDays <= 7 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
            "bg-red-500/10 text-red-500"
          }`}>{task.durationDays}</span>
        </FCell>
        <FCell w={COL.pct} mono center bold>
          <span className={task.completionPct > 0 ? (PHASE_COLOR[task.section] ?? PHASE_COLOR.Onboarding).text : ""}>{task.completionPct}%</span>
        </FCell>
      </div>

      {/* Daily Gantt bar — single container with positioned bar */}
      <div className="relative overflow-hidden" style={{ width: `${TOTAL_DAYS * DAY_W}px` }}>
        {/* Day grid lines */}
        {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
          const isWeekStart = (d - 1) % 7 === 0;
          const isToday = d === currentDay;
          return (
            <div
              key={d}
              className={`absolute top-0 bottom-0 ${isWeekStart ? "border-l border-zinc-700" : "border-l border-zinc-700/30"} ${isToday ? "bg-amber-500/5" : ""}`}
              style={{ left: `${(d - 1) * DAY_W}px`, width: `${DAY_W}px` }}
            />
          );
        })}

        {/* Today marker */}
        {currentDay !== null && currentDay >= 0 && currentDay <= TOTAL_DAYS && (
          <div className="absolute top-0 bottom-0 z-[5] border-l border-dashed border-amber-500/70" style={{ left: `${Math.max(currentDay, 0.5) * DAY_W}px` }} />
        )}

        {/* Task bar */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="absolute top-1/2 -translate-y-1/2 h-5 rounded-[1px] cursor-pointer transition-colors hover:opacity-80 z-[3] overflow-hidden"
              style={{
                left: `${(task.startDay - 1) * DAY_W + 1}px`,
                width: `${Math.max(task.durationDays, 1) * DAY_W - 2}px`,
                backgroundColor: `${(PHASE_COLOR[task.section] ?? PHASE_COLOR.Onboarding).hex}20`,
                outline: `1px solid ${(PHASE_COLOR[task.section] ?? PHASE_COLOR.Onboarding).hex}`,
                outlineOffset: "-1px",
              }}
              aria-label={`${task.taskName}: ${task.completionPct}%`}
            >
              <div
                className={`h-full rounded-[1px] transition-all ${(PHASE_COLOR[task.section] ?? PHASE_COLOR.Onboarding).bg}`}
                style={{ width: `${Math.max(task.completionPct, task.completionPct > 0 ? 5 : 0)}%` }}
              />
              {task.durationDays >= 3 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">
                  {task.completionPct}%
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 space-y-3" align="start">
            <TaskPopover task={task} onUpdate={onUpdate} onDelete={onDelete} onboardingDate={onboardingDate} teamMembers={teamMembers} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ── Frozen cell helper ──────────────────────────────────────────────

function FCell({ w, children, mono, muted, center, bold, truncate: trunc }: {
  w: number; children: React.ReactNode; mono?: boolean; muted?: boolean; center?: boolean; bold?: boolean; truncate?: boolean;
}) {
  return (
    <div
      className={`text-[10px] px-1.5 flex items-center ${mono ? "tabular-nums" : ""} ${muted ? "text-muted-foreground" : ""} ${center ? "justify-center" : ""} ${bold ? "font-medium" : ""} ${trunc ? "truncate" : ""}`}
      style={{ width: `${w}px`, minWidth: `${w}px` }}
    >{children}</div>
  );
}

// ── Task popover ────────────────────────────────────────────────────

function TaskPopover({ task, onUpdate, onDelete, onboardingDate, teamMembers }: {
  task: GanttTask; onUpdate: (taskId: number, patch: Record<string, unknown>) => void;
  onDelete: (taskId: number) => void; onboardingDate: Date | null; teamMembers: TeamMember[];
}) {
  const [taskName, setTaskName] = useState(task.taskName);
  const [subtaskTitle, setSubtaskTitle] = useState(task.subtaskTitle ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [startDay, setStartDay] = useState(task.startDay);
  const [durationDays, setDurationDays] = useState(task.durationDays);
  const [completionPct, setCompletionPct] = useState(task.completionPct);
  const [portalHidden, setPortalHidden] = useState(task.portalHidden);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function saveField(field: string, value: unknown, original: unknown) {
    if (value !== original) onUpdate(task.id, { [field]: value });
  }

  const startStr = onboardingDate ? formatShort(getDayDate(onboardingDate, startDay)) : `D${startDay}`;
  const dueStr = onboardingDate ? formatShort(getDayDate(onboardingDate, startDay + durationDays)) : `D${startDay + durationDays}`;

  return (
    <div className="space-y-2.5">
      {/* Top row: section badge + portal toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{task.section}</p>
        <button
          onClick={() => { const next = !portalHidden; setPortalHidden(next); onUpdate(task.id, { portalHidden: next }); }}
          className={`inline-flex items-center gap-1 text-[10px] transition-colors ${
            portalHidden ? "text-amber-500 hover:text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {portalHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {portalHidden ? "Hidden from portal" : "Visible in portal"}
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Group Name</label>
        <input type="text" value={taskName} onChange={(e) => setTaskName(e.target.value)}
          onBlur={() => saveField("taskName", taskName, task.taskName)}
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm font-semibold text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Task Name</label>
        <input type="text" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)}
          onBlur={() => saveField("subtaskTitle", subtaskTitle || null, task.subtaskTitle)}
          placeholder="Task description…"
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Schedule</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] text-muted-foreground">Start Date</label>
            {onboardingDate ? (
              <DatePicker
                value={getDayDate(onboardingDate, startDay).toISOString().slice(0, 10)}
                onChange={(v) => {
                  if (!v) return;
                  const picked = new Date(v + "T00:00:00");
                  const diff = Math.round((picked.getTime() - onboardingDate.getTime()) / 86400000) + 1;
                  if (diff >= 1) {
                    setStartDay(diff);
                    saveField("startDay", diff, task.startDay);
                  }
                }}
                className="w-full h-7 text-xs"
              />
            ) : (
              <input type="number" min={1} max={91} value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}
                onBlur={() => saveField("startDay", startDay, task.startDay)}
                className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
            )}
          </div>
          <div>
            <label className="text-[9px] text-muted-foreground">Duration (days)</label>
            <input type="number" min={1} max={91} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))}
              onBlur={() => saveField("durationDays", durationDays, task.durationDays)}
              className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground tabular-nums">
          {startStr} → {dueStr} · W{String(computeWeekStart(startDay)).padStart(2, "0")}–W{String(computeWeekEnd(startDay, durationDays)).padStart(2, "0")}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Assignee</label>
        <Select value={task.assignedTo ?? "__none__"} onValueChange={(v) => onUpdate(task.id, { assignedTo: v === "__none__" ? null : v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select assignee…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Unassigned</SelectItem>
            {teamMembers.map((m) => <SelectItem key={m.email} value={m.email}>{m.name || m.email}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Status</label>
        <Select value={task.status} onValueChange={(v) => onUpdate(task.id, { status: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Completion</label>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} step={5} value={completionPct}
            onChange={(e) => setCompletionPct(Number(e.target.value))}
            onMouseUp={() => saveField("completionPct", completionPct, task.completionPct)}
            onTouchEnd={() => saveField("completionPct", completionPct, task.completionPct)}
            className="flex-1 h-1.5 accent-brand" />
          <span className="text-xs font-bold tabular-nums w-8 text-right">{completionPct}%</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-muted-foreground">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveField("notes", notes || null, task.notes)} rows={2} placeholder="Add notes…"
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 resize-none" />
      </div>

      <div className="pt-1 border-t border-border/50">
        <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1 text-[10px] text-red-500 hover:text-red-400 transition-colors">
          <Trash2 className="size-3" /> Delete task
        </button>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => { setDeleting(true); onDelete(task.id); }}
        title="Delete task?"
        description={(
          <>
            This will permanently delete{" "}
            <strong className="text-foreground">{task.taskName}</strong>{task.subtaskTitle ? <> — {task.subtaskTitle}</> : null}.
            This action cannot be undone.
          </>
        )}
        pending={deleting}
        confirmLabel="Delete task"
      />
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState({ onInit, loading }: {
  onInit: (t: "AIA" | "NTA", onboardingDate: string) => void; loading: boolean;
}) {
  const [selected, setSelected] = useState<"AIA" | "NTA">("NTA");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
      <div className="inline-flex items-center justify-center rounded-xl bg-amber-500/10 p-4 mb-4">
        <CalendarDays className="size-8 text-brand" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No timeline yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
        Initialize the 13-week onboarding timeline from a template. Pick the onboarding start date and template type.
      </p>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="space-y-1 text-left">
            <label className="text-[10px] font-bold text-muted-foreground">Onboarding Date</label>
            <DatePicker value={date} onChange={setDate} className="h-9 w-[150px] text-sm" />
          </div>
          <div className="space-y-1 text-left">
            <label className="text-[10px] font-bold text-muted-foreground">Template</label>
            <Select value={selected} onValueChange={(v) => setSelected(v as "AIA" | "NTA")}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AIA">AIA</SelectItem>
                <SelectItem value="NTA">NTA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => onInit(selected, date)} disabled={loading || !date}
          className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Initialize Timeline"}
        </Button>
      </div>
    </div>
  );
}
