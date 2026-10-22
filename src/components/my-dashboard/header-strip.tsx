"use client";
import type { ReactNode } from "react";
import type { MyDashboardPayload } from "@/lib/my-dashboard/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FlapClock } from "./flap-clock";

// Same initials rule as the top-nav user menu.
const initials = (s: string) => s.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

export type Focus = "overdue" | "today" | "week" | "alerts" | null;

function syncTone(lastSuccessAt: string | null): { label: string; cls: string } {
  if (!lastSuccessAt) return { label: "Asana never synced", cls: "text-brand-red" };
  const mins = Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 60_000);
  const label = mins < 60 ? `Asana synced ${mins} min ago` : `Asana synced ${Math.round(mins / 60)} h ago`;
  return { label, cls: mins > 360 ? "text-brand-red" : mins > 60 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground" };
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}


export function HeaderStrip({ data, onFocus, picker }: { data: MyDashboardPayload; onFocus: (f: Focus) => void; picker?: ReactNode }) {
  const g = data.tasks.data;
  const counters: { key: Exclude<Focus, null>; label: string; value: number | null }[] = [
    { key: "overdue", label: "Overdue", value: g ? g.overdue.length : null },
    { key: "today", label: "Due today", value: g ? g.today.length : null },
    { key: "week", label: "This week", value: g ? g.week.length : null },
    { key: "alerts", label: "Alerts", value: data.alerts.data ? data.alerts.data.length + (data.reviews.data?.length ?? 0) : null },
  ];
  const sync = data.sync.connected ? syncTone(data.sync.lastSuccessAt) : { label: "Asana not connected", cls: "text-brand-red" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage src={data.person.image ?? undefined} alt="" />
            <AvatarFallback className="text-sm">{initials(data.person.name ?? data.person.email)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm text-muted-foreground" suppressHydrationWarning>{greeting()}, {(data.person.name ?? data.person.email).split(/[ @]/)[0]}</div>
            <h2 className="text-2xl font-semibold">{data.person.name ?? data.person.email}</h2>
            <span className={`text-xs ${sync.cls}`} title={data.sync.lastError ?? undefined}>{sync.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {picker}
          <FlapClock />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <button key={c.key} type="button" onClick={() => onFocus(c.key)}
            className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-brand">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${c.key === "overdue" && c.value ? "text-brand-red" : ""}`}>{c.value ?? "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
