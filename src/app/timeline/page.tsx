/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

type ClientGanttSummary = {
  clientIdCode: string;
  clientName: string | null;
  clientType: "AIA" | "NTA" | null;
  total: number;
  completed: number;
  inProgress: number;
  avgPct: number;
};

export default function TimelineLandingPage() {
  const { data, isLoading } = useQuery<ClientGanttSummary[]>({
    queryKey: ["gantt-summary"],
    queryFn: () => fetch("/api/gantt").then((r) => r.json()),
  });

  return (
    <div>
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
          <span className="font-bold text-sidebar-foreground">Client</span><span className="font-normal text-brand">Timelines</span>
        </h1>
      </PageMetaSlot>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <div className="rounded-xl border border-border/60 bg-card p-16 text-center">
          <div className="inline-flex items-center justify-center rounded-xl bg-amber-500/10 p-4 mb-4">
            <CalendarDays className="size-8 text-brand" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No timelines yet</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Initialize a timeline from any client&apos;s detail page to start tracking onboarding progress.
          </p>
        </div>
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="space-y-3">
          {data
            .sort((a, b) => (a.clientName ?? a.clientIdCode).localeCompare(b.clientName ?? b.clientIdCode))
            .map((client) => {
              const pct = client.total > 0 ? Math.round((client.completed / client.total) * 100) : 0;
              const allDone = client.completed === client.total;

              return (
                <Link
                  key={client.clientIdCode}
                  href={`/clients/${client.clientIdCode}/timeline`}
                  className="block rounded-xl border bg-card hover:border-stone-300 hover:shadow-md transition-all dark:hover:border-zinc-700"
                >
                  <div className="flex items-center gap-4 p-5">
                    {/* Left: client info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold truncate">
                          {client.clientName ?? client.clientIdCode}
                        </h3>
                        {client.clientType && (
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold ${
                            client.clientType === "AIA"
                              ? "bg-brand/15 text-brand border border-brand/30"
                              : "bg-[var(--brand-nta)]/15 text-[var(--brand-nta)] border border-[var(--brand-nta)]/30"
                          }`}>
                            {client.clientType}
                          </span>
                        )}
                        {allDone && (
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">
                            Complete
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {client.clientIdCode} · {client.completed}/{client.total} tasks · {client.inProgress} in progress
                      </p>
                    </div>

                    {/* Right: progress */}
                    <div className="w-32 shrink-0">
                      <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-right text-xs font-bold tabular-nums text-brand mt-1">
                        {pct}%
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
