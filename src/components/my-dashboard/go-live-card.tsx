"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { GoLiveTask } from "@/lib/readiness/go-live";
import { DUE_TODAY_TEXT, OVERDUE_TEXT } from "@/lib/readiness/tone";
import { cn } from "@/lib/utils";

type Payload = { today: string; days: number; departments: string[]; leads: string[]; tasks: GoLiveTask[] };

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const whenLabel = (n: number) => (n < 0 ? `${-n}d late` : n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`);
const whenTone = (n: number) => (n < 0 ? OVERDUE_TEXT : n === 0 ? DUE_TODAY_TEXT : "text-brand");

/**
 * Department leads' Go Live watch: their departments' open tasks whose Go Live
 * Date (the fixed deadline, not the moving due date) is within the next few
 * days or recently passed.
 */
export function GoLiveCard({ userId }: { userId: string }) {
  const [dept, setDept] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["readiness-go-live", userId],
    queryFn: async () => {
      const res = await fetch(`/api/readiness/go-live?user=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });
  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => !dept || t.department === dept), [data, dept]);

  if (!isLoading && !error && data && !data.departments.length) return null;
  const many = (data?.departments.length ?? 0) > 1;

  return (
    <section id="go-live" className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Go Live in the next {data?.days ?? 3} days
          {data && !many && <span className="font-normal text-muted-foreground"> · {data.departments[0]} team</span>}
        </h2>
        {data && many && (
          <div className="flex flex-wrap gap-1">
            {[null, ...data.departments].map((d) => (
              <button
                key={d ?? "all"}
                onClick={() => setDept(d)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px]",
                  dept === d ? "border-brand bg-brand/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d ?? "All"} · {(data.tasks ?? []).filter((t) => !d || t.department === d).length}
              </button>
            ))}
          </div>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error || !data ? (
        <p className="text-sm text-brand-red">Couldn&apos;t load Go Lives.</p>
      ) : !tasks.length ? (
        <p className="text-sm text-muted-foreground">Nothing goes live in the next {data.days} days.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-3">Go Live</th>
                <th className="py-1.5 pr-3">Task</th>
                <th className="py-1.5 pr-3">Assignee</th>
                <th className="py-1.5 pr-3">Due date</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.gid} className="border-t border-border/40 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    <div className={cn("font-semibold", whenTone(t.daysLeft))}>{whenLabel(t.daysLeft)}</div>
                    <div className="text-xs text-muted-foreground">{fmtDay(t.goLiveDate)}</div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <a href={t.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 hover:underline">
                      {t.name}
                      <ExternalLink className="mt-1 size-3 shrink-0 opacity-0 group-hover:opacity-60" />
                    </a>
                    {many && !dept && <span className="ml-1.5 text-[10px] text-muted-foreground">{t.department}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-xs">{t.assignee}</td>
                  <td
                    className={cn("whitespace-nowrap py-1.5 pr-3 text-xs", t.dueAfterGoLive ? `${OVERDUE_TEXT} font-semibold` : "text-muted-foreground")}
                    title={t.dueAfterGoLive ? "The due date is after the Go Live date (or missing)" : undefined}
                  >
                    {t.dueOn ? fmtDay(t.dueOn) : "No due date"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
