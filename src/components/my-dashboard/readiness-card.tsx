"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ReadinessRow } from "@/lib/readiness/server";
import { DUE_TODAY_TEXT, OVERDUE_TEXT, readinessBar, readinessText } from "@/lib/readiness/tone";
import { cn } from "@/lib/utils";

type Payload = {
  date: string;
  compareDate: string | null;
  person: ReadinessRow | null;
  team: ReadinessRow | null;
  prevPerson: ReadinessRow | null;
  prevTeam: ReadinessRow | null;
};

/** My readiness + my department's (Team → Readiness), with the change vs the last snapshot. */
export function ReadinessCard({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["readiness-person", userId],
    queryFn: async () => {
      const res = await fetch(`/api/readiness/person?user=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  return (
    <section id="readiness" className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Readiness</h2>
        <Link href="/team/readiness" className="text-xs text-brand hover:underline">
          Team board →
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error || !data ? (
        <p className="text-sm text-brand-red">Couldn&apos;t load readiness.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Block title="Mine" row={data.person} prev={data.prevPerson} empty="No open Asana tasks assigned." />
          <Block
            title={data.team?.department ? `${data.team.department} team` : "My team"}
            row={data.team}
            prev={data.prevTeam}
            empty="No department set on the readiness board."
          />
          {data.compareDate && (
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              Δ vs the {new Date(`${data.compareDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} snapshot · readiness = 1 − overdue / open
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Block({ title, row, prev, empty }: { title: string; row: ReadinessRow | null; prev: ReadinessRow | null; empty: string }) {
  if (!row) {
    return (
      <div className="rounded-md border p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      </div>
    );
  }
  const delta = prev ? Math.round((row.readiness - prev.readiness) * 10) / 10 : null;
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", readinessText(row.readiness))}>{row.readiness.toFixed(1)}%</span>
        {delta !== null && delta !== 0 && (
          <span className={cn("text-xs font-semibold tabular-nums", delta > 0 ? "text-emerald-500" : "text-red-500")}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", readinessBar(row.readiness))} style={{ width: `${Math.max(0, Math.min(100, row.readiness))}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-[11px] tabular-nums text-muted-foreground">
        <span>
          <b className="text-foreground">{row.open}</b> open
        </span>
        <span>
          <b className={row.dueToday ? DUE_TODAY_TEXT : "text-foreground"}>{row.dueToday}</b> today
        </span>
        <span>
          <b className={row.overdue ? OVERDUE_TEXT : "text-foreground"}>{row.overdue}</b> late
        </span>
      </div>
    </div>
  );
}
