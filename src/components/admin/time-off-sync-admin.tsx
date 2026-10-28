"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimeOffSyncReport } from "@/lib/time-off/sync";

type Run = { id: string; trigger: string; startedAt: string; finishedAt: string | null; report: TimeOffSyncReport | null; error: string | null };
type Status = {
  calendar: { configured: boolean; calendarId: string; serviceAccount: string | null };
  gusto: { configured: boolean; connected: boolean; companyName: string | null; companyKnown: boolean; updatedAt: string | null };
  runs: Run[];
};

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const skipped = (v: unknown): v is { skipped: string } => !!v && typeof v === "object" && "skipped" in v;

function Pill({ ok, warn, children }: { ok?: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        ok ? "bg-emerald-500/15 text-emerald-500" : warn ? "bg-orange-500/15 text-orange-500" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Sync & Export → Time Off tab: the shared Google Calendar and Gusto connections. */
export function TimeOffSyncAdmin() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<Status>({
    queryKey: ["time-off-sync"],
    queryFn: async () => {
      const res = await fetch("/api/admin/time-off-sync");
      if (!res.ok) throw new Error(`Could not load the time off sync status (HTTP ${res.status})`);
      return res.json();
    },
  });

  // Back from Gusto's OAuth screen.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("gusto");
    if (result === "connected") toast.success("Gusto connected");
    if (result === "failed") toast.error("Gusto didn't connect. Try again, or check the app's redirect URL in Gusto.");
  }, []);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/time-off-sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json as TimeOffSyncReport;
    },
    onSuccess: () => {
      toast.success("Time off synced");
      qc.invalidateQueries({ queryKey: ["time-off-sync"] });
      qc.invalidateQueries({ queryKey: ["time-off"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/gusto/connect", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect Gusto");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time-off-sync"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="text-sm text-red-500">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { calendar, gusto } = data;

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Time off is read from <b>Gusto</b> for the people who request it there, and booked in the hub for everyone else. Every approved day off is published
        to the shared <b>1o8 Time off (PTO/OOO/Sick)</b> Google Calendar, and whatever people put straight on that calendar shows up in the hub. Runs every
        morning; use Sync now after changes.
      </p>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold">Shared Google Calendar</h2>
          {calendar.configured ? <Pill ok>Connected</Pill> : <Pill warn>Not configured</Pill>}
        </div>
        {calendar.configured ? (
          <p className="text-xs text-muted-foreground">Calendar id: {calendar.calendarId}</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              In Google Calendar → the calendar&apos;s <i>Settings and sharing</i> → <i>Share with specific people</i>, add{" "}
              <b className="text-foreground">{calendar.serviceAccount ?? "the hub's service account"}</b> with <i>Make changes to events</i>.
            </li>
            <li>
              Set <code>TIME_OFF_CALENDAR_ID</code> to the calendar&apos;s id (<i>Integrate calendar</i> → Calendar ID) and redeploy.
            </li>
          </ol>
        )}
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold">Gusto</h2>
          {gusto.connected ? (
            <Pill ok>Connected{gusto.companyName ? ` · ${gusto.companyName}` : ""}</Pill>
          ) : gusto.configured ? (
            <Pill warn>Not connected</Pill>
          ) : (
            <Pill>Waiting for API access</Pill>
          )}
          <div className="ml-auto flex gap-2">
            {gusto.configured && !gusto.connected && (
              <Button variant="brand" size="sm" asChild>
                <a href="/api/integrations/gusto/connect">
                  <ExternalLink className="size-3.5" /> Connect Gusto
                </a>
              </Button>
            )}
            {gusto.connected && (
              <Button variant="outline" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                <Unplug className="size-3.5" /> Disconnect
              </Button>
            )}
          </div>
        </div>
        {gusto.connected && !gusto.companyKnown && (
          <p className="text-xs text-orange-500">Connected, but the company wasn&apos;t identified. Set GUSTO_COMPANY_UUID.</p>
        )}
        {!gusto.configured && (
          <p className="text-xs text-muted-foreground">
            Needs a Gusto developer app with time off read access. Once Gusto approves it, set <code>GUSTO_CLIENT_ID</code> and{" "}
            <code>GUSTO_CLIENT_SECRET</code> (redirect URL <code>/api/integrations/gusto/callback</code>), redeploy, and connect here as a Gusto admin.
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold">History</h2>
          <Button variant="brand" size="sm" disabled={run.isPending || (!calendar.configured && !gusto.connected)} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">When</th>
              <th className="px-3 py-2">Gusto</th>
              <th className="px-3 py-2">To calendar</th>
              <th className="px-3 py-2">From calendar</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((r) => {
              const g = r.report?.gusto;
              const push = r.report?.calendarPush;
              const pull = r.report?.calendarPull;
              return (
                <tr key={r.id} className="border-t border-border/40 text-xs">
                  <td className="whitespace-nowrap px-4 py-1.5 text-sm">
                    {when(r.startedAt)} <span className="text-muted-foreground">· {r.trigger}</span>
                  </td>
                  <td className="px-3 py-1.5">{!g ? "—" : skipped(g) ? <span className="text-muted-foreground">skipped</span> : `${g.created} new, ${g.updated} updated, ${g.balances} balances`}</td>
                  <td className="px-3 py-1.5">{!push ? "—" : skipped(push) ? <span className="text-muted-foreground">skipped</span> : `${push.published} added, ${push.removed} removed`}</td>
                  <td className="px-3 py-1.5">{!pull ? "—" : skipped(pull) ? <span className="text-muted-foreground">skipped</span> : `${pull.events} events (${pull.matched} matched)`}</td>
                  <td className="px-3 py-1.5">
                    {r.error ? <span className="text-red-500">{r.error}</span> : r.finishedAt ? <span className="text-emerald-500">OK</span> : "Running…"}
                  </td>
                </tr>
              );
            })}
            {!data.runs.length && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground">
                  No syncs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
