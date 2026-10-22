"use client";
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { DashTask, Section, TaskGroupKey } from "@/lib/my-dashboard/types";
import { isHighPriority } from "@/lib/my-dashboard/group-tasks";

const LABELS: Record<TaskGroupKey, string> = { overdue: "Overdue", today: "Today", week: "This week", later: "Later", nodate: "No due date" };
const ORDER: TaskGroupKey[] = ["overdue", "today", "week", "later", "nodate"];
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Row({ t, overdue = false }: { t: DashTask; overdue?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      {isHighPriority(t.priority) && <span className="size-2 shrink-0 rounded-full bg-brand-red" title={t.priority ?? ""} />}
      <a href={t.url} target={t.source === "asana" ? "_blank" : undefined} rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{t.title}</a>
      {t.clientIdCode && <span className="rounded border px-1.5 font-mono text-[11px]">{t.clientIdCode}</span>}
      {t.status && <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline">{t.status}</span>}
      {t.dueOn && <span className={`w-14 text-right text-xs tabular-nums ${overdue ? "text-brand-red line-through" : "text-muted-foreground"}`}>{fmt(t.dueOn)}</span>}
      {t.source === "asana" && <ExternalLink className="size-3 text-muted-foreground" aria-hidden />}
    </li>
  );
}

export function TaskList({ tasks, syncFresh, openNonce, filterDate, onClearFilter }: {
  tasks: Section<Record<TaskGroupKey, DashTask[]>>; syncFresh: boolean; openNonce: number; filterDate: string | null; onClearFilter: () => void;
}) {
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [seenNonce, setSeenNonce] = useState(openNonce);
  // A counter click bumps openNonce: open Overdue once, but leave the header toggle free to collapse it.
  if (seenNonce !== openNonce) {
    setSeenNonce(openNonce);
    setOverdueOpen(true);
  }
  if (tasks.error) return <p className="text-sm text-brand-red">Couldn&apos;t load tasks: {tasks.error}</p>;
  const g = tasks.data!;
  const total = ORDER.reduce((n, k) => n + g[k].length, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">{syncFresh ? "No tasks assigned to you in Asana." : "Asana sync is stale — tasks may be missing."}</p>;
  if (filterDate) {
    const list = ORDER.flatMap((k) => g[k]).filter((t) => t.dueOn === filterDate);
    return (
      <div>
        <button type="button" onClick={onClearFilter} className="mb-2 text-xs text-brand hover:underline">Showing {fmt(filterDate)} — clear</button>
        <ul className="divide-y">{list.map((t) => <Row key={t.id} t={t} />)}</ul>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {ORDER.map((k) => {
        if (!g[k].length) return null;
        if (k === "overdue") {
          const open = overdueOpen;
          return (
            <section key={k} id="tasks-overdue">
              <button type="button" onClick={() => setOverdueOpen(!open)} className="flex items-center gap-1 text-sm font-medium text-brand-red" aria-expanded={open}>
                <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
                {g.overdue.length} overdue — oldest {fmt(g.overdue[0].dueOn!)}
              </button>
              {open && <ul className="divide-y pl-5">{g.overdue.map((t) => <Row key={t.id} t={t} overdue />)}</ul>}
            </section>
          );
        }
        return (
          <section key={k} id={`tasks-${k}`}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{LABELS[k]} · {g[k].length}</h3>
            <ul className="divide-y">{g[k].map((t) => <Row key={t.id} t={t} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
