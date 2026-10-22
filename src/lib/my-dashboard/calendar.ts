import { addDays } from "./group-tasks";
import type { DashTask } from "./types";

/** "YYYY-MM" ± n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Whole Sun–Sat weeks covering the month, as YYYY-MM-DD strings (Asana's calendar layout). */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const lastDay = addDays(`${shiftMonth(month, 1)}-01`, -1);
  let day = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  const weeks: string[][] = [];
  while (day <= lastDay) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i));
    weeks.push(week);
    day = addDays(day, 7);
  }
  return weeks;
}

export function tasksByDate(tasks: DashTask[]): { byDate: Map<string, DashTask[]>; undated: number } {
  const byDate = new Map<string, DashTask[]>();
  let undated = 0;
  for (const t of tasks) {
    if (!t.dueOn) { undated++; continue; }
    byDate.set(t.dueOn, [...(byDate.get(t.dueOn) ?? []), t]);
  }
  return { byDate, undated };
}
