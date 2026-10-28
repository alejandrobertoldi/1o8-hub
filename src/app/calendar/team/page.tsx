"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plane } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasAdminPowers } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { OutEntry, TeamMemberTimeOff } from "@/lib/time-off/team";

type Payload = { today: string; to: string; out: OutEntry[]; members: TeamMemberTimeOff[] };

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const range = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} → ${fmt(b)}`);
const SOURCE_LABEL: Record<OutEntry["source"], string> = { hub: "Hub", gusto: "Gusto", calendar: "Calendar" };

/** Admins: who's out in the next two weeks, and everyone's balances and days taken. */
export default function TeamTimeOffPage() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["time-off", "team"],
    queryFn: async () => {
      const res = await fetch("/api/time-off/team");
      if (!res.ok) throw new Error(`Could not load team time off (HTTP ${res.status})`);
      return res.json();
    },
    enabled: isAdmin,
  });
  const setVia = useMutation({
    mutationFn: async (v: { userId: string; timeOffVia: string }) => {
      const res = await fetch("/api/time-off/team", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-off", "team"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const members = useMemo(
    () => (data?.members ?? []).filter((m) => !filter || `${m.name} ${m.email}`.toLowerCase().includes(filter.toLowerCase())),
    [data, filter],
  );

  if (session && !isAdmin) return <p className="p-8 text-sm text-muted-foreground">Only admins can see team time off.</p>;
  if (error) return <p className="p-8 text-sm text-red-500">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="p-8 text-xs text-muted-foreground">Loading…</p>;

  const outToday = data.out.filter((o) => o.startDate <= data.today && o.endDate >= data.today);
  const later = data.out.filter((o) => o.startDate > data.today);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Time Off</span>
        </h1>
      </PageMetaSlot>

      <section className="grid gap-4 md:grid-cols-2">
        <OutList title={`Out today · ${fmt(data.today)}`} rows={outToday} empty="Everyone's in today." />
        <OutList title="Coming up · next 2 weeks" rows={later} empty="Nothing booked in the next two weeks." />
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-bold">Balances & days taken · {data.today.slice(0, 4)}</h2>
            <p className="text-xs text-muted-foreground">
              Balances come from Gusto. <b>Requests in</b> sets where each person books time off: Gusto (the hub only mirrors it) or the hub.
            </p>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter people…"
            className="h-8 w-48 rounded-md border bg-background px-2 text-sm"
          />
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Person</th>
                <th className="px-3 py-2">Requests in</th>
                <th className="px-3 py-2">Gusto balances</th>
                <th className="px-3 py-2 text-right">Days taken</th>
                <th className="px-3 py-2 text-right">Booked ahead</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-border/40 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={m.timeOffVia} onValueChange={(v) => setVia.mutate({ userId: m.id, timeOffVia: v })}>
                      <SelectTrigger size="sm" className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hub">Hub</SelectItem>
                        <SelectItem value="gusto">Gusto</SelectItem>
                      </SelectContent>
                    </Select>
                    {m.timeOffVia === "gusto" && !m.gustoLinked && <div className="mt-1 text-[10px] text-orange-500">Not matched in Gusto yet</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.balances.length ? (
                      m.balances.map((b) => (
                        <div key={b.policyName}>
                          {b.policyName}: <b>{b.hours == null ? "—" : `${b.hours} h`}</b>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.daysTaken}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.upcomingDays || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OutList({ title, rows, empty }: { title: string; rows: OutEntry[]; empty: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((o) => (
            <li key={o.key} className="flex items-start gap-2 text-sm">
              {o.source === "calendar" ? (
                <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              ) : (
                <Plane className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {o.source === "calendar" ? o.label : `${o.name} · ${o.label}`}
                  <span className={cn("ml-1.5 text-[10px] font-normal text-muted-foreground")}>{SOURCE_LABEL[o.source]}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {range(o.startDate, o.endDate)}
                  {o.time ? ` · ${o.time}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
