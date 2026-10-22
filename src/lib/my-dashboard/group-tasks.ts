import type { DashTask, TaskGroupKey } from "./types";

const toDay = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string { return fromDay(toDay(ymd) + n * 86_400_000); }

/** "This week" runs through the coming Sunday (today itself if today is Sunday). Note Hub sales weeks start on Sunday; this is a task-horizon, not a sales week. */
export function endOfWeek(today: string): string {
  const dow = new Date(toDay(today)).getUTCDay(); // 0 = Sunday
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

export function isHighPriority(p: string | null): boolean { return !!p && /^P[01]\b/.test(p); }

function compare(a: DashTask, b: DashTask): number {
  const hp = Number(isHighPriority(b.priority)) - Number(isHighPriority(a.priority));
  if (hp) return hp;
  if (a.dueOn !== b.dueOn) return (a.dueOn ?? "9999") < (b.dueOn ?? "9999") ? -1 : 1;
  return (a.clientIdCode ?? "~").localeCompare(b.clientIdCode ?? "~");
}

export function groupTasks(tasks: DashTask[], today: string): Record<TaskGroupKey, DashTask[]> {
  const weekEnd = endOfWeek(today);
  const g: Record<TaskGroupKey, DashTask[]> = { overdue: [], today: [], week: [], later: [], nodate: [] };
  for (const t of tasks) {
    if (!t.dueOn) g.nodate.push(t);
    else if (t.dueOn < today) g.overdue.push(t);
    else if (t.dueOn === today) g.today.push(t);
    else if (t.dueOn <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  g.overdue.sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : compare(a, b)));
  for (const k of ["today", "week", "later", "nodate"] as const) g[k].sort(compare);
  return g;
}

export function dueStrip(tasks: DashTask[], today: string, days = 14): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) if (t.dueOn) counts.set(t.dueOn, (counts.get(t.dueOn) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => { const date = addDays(today, i); return { date, count: counts.get(date) ?? 0 }; });
}

/** The Asana box keeps the due-date groups; Hub items (onboarding steps) get their own box, in group order. */
export function splitBySource(groups: Record<TaskGroupKey, DashTask[]>): { asana: Record<TaskGroupKey, DashTask[]>; hub: DashTask[] } {
  const keys: TaskGroupKey[] = ["overdue", "today", "week", "later", "nodate"];
  const asana = Object.fromEntries(keys.map((k) => [k, groups[k].filter((t) => t.source === "asana")])) as Record<TaskGroupKey, DashTask[]>;
  return { asana, hub: keys.flatMap((k) => groups[k].filter((t) => t.source === "hub")) };
}
