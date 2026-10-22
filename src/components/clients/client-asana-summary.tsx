"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Summary = {
  connected: boolean;
  lastSyncAt: string | null;
  today: string;
  open: number;
  dueToday: number;
  overdue: number;
  noDueDate: number;
  next: { gid: string; name: string; dueOn: string | null; assigneeName: string | null; permalinkUrl: string }[];
  projectUrl: string | null;
};

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmtDue = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Replaces MF's Amazon "Products" card on the client overview with the client's Asana workload. */
export function ClientAsanaSummary({ clientIdCode }: { clientIdCode: string }) {
  const today = localToday();
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ["client-asana-summary", clientIdCode, today],
    queryFn: () =>
      fetch(`/api/clients/${encodeURIComponent(clientIdCode)}/asana-summary?today=${today}`).then((r) => {
        if (!r.ok) throw new Error(`Asana summary failed (${r.status})`);
        return r.json();
      }),
    staleTime: 60_000,
  });

  const stats = [
    { label: "Open", value: data?.open, tone: "" },
    { label: "Due today", value: data?.dueToday, tone: data?.dueToday ? "text-brand" : "" },
    { label: "Overdue", value: data?.overdue, tone: data?.overdue ? "text-red-500" : "" },
  ];

  return (
    <div className="w-full space-y-2 sm:w-80">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Asana tasks</p>
        {data?.projectUrl && (
          <a
            href={data.projectUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
          >
            Open project <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className={cn("text-2xl font-bold tabular-nums", s.tone)}>{isLoading ? "–" : (s.value ?? 0)}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {data && !data.connected && (
        <p className="text-xs text-muted-foreground">Asana isn&apos;t connected yet. Counts appear after the first sync.</p>
      )}

      {data && data.next.length > 0 && (
        <ul className="divide-y divide-border/50 text-xs">
          {data.next.map((t) => {
            const overdue = !!t.dueOn && t.dueOn < data.today;
            const dueToday = t.dueOn === data.today;
            return (
              <li key={t.gid} className="flex items-center gap-2 py-1.5">
                <a href={t.permalinkUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={t.name}>
                  {t.name}
                </a>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    overdue ? "font-semibold text-red-500" : dueToday ? "font-semibold text-brand" : "text-muted-foreground",
                  )}
                >
                  {t.dueOn ? (dueToday ? "Today" : fmtDue(t.dueOn)) : "No date"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data?.connected && data.lastSyncAt && (
        <p className="text-[10px] text-muted-foreground">Synced {new Date(data.lastSyncAt).toLocaleString("en-US")}</p>
      )}
    </div>
  );
}
