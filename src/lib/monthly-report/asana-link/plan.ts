import type { AsanaLinkSubtask } from "@/lib/db/schema";
import { stageDone, type PeriodReport, type Reviewer } from "./reviewers";

type Directory = { name: string | null; email: string }[];

export function planNewSubtasks(stored: AsanaLinkSubtask[], reviewers: Reviewer[]): Reviewer[] {
  const have = new Set(stored.map((s) => `${s.stage}|${s.email.toLowerCase()}`));
  return reviewers.filter((r) => !have.has(`${r.stage}|${r.email.toLowerCase()}`));
}

export function planSubtaskSync(stored: AsanaLinkSubtask[], reports: PeriodReport[], directory: Directory, parentCompleted: boolean) {
  const complete: string[] = [];
  const reopen: string[] = [];
  for (const s of stored) {
    const done = stageDone(s.stage, s.email, reports, directory);
    if (done && !s.completed) complete.push(s.gid);
    if (!done && s.completed) reopen.push(s.gid);
  }
  const live = reports.filter((r) => r.status !== "blocked");
  const allSent = live.length > 0 && live.every((r) => r.status === "sent");
  const parent: "complete" | "reopen" | null = allSent && !parentCompleted ? "complete" : !allSent && parentCompleted ? "reopen" : null;
  return { complete, reopen, parent };
}
