"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KpiSyncReport } from "@/lib/kpi/sync";

type Run = { id: string; trigger: string; startedAt: string; finishedAt: string | null; report: KpiSyncReport | null; error: string | null };
type Status = { ga4: { oauthConfigured: boolean; connected: boolean; email: string | null; serviceAccount: string | null }; runs: Run[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const SOURCES = [
  { name: "Shopify", note: "Waiting for the 1o8 Hub Shopify app (App developer + Distribution roles)." },
  { name: "Meta", note: "Next: a system user in 1o8's Business Manager with read access to the clients' ad accounts." },
  { name: "Klaviyo", note: "Next: a read-only private API key per client account." },
];

/** Sync & Export → KPIs tab: where each client's Main KPI numbers come from. */
export function KpiSyncAdmin() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<Status>({
    queryKey: ["kpi-sync"],
    queryFn: async () => {
      const res = await fetch("/api/admin/kpi-sync");
      if (!res.ok) throw new Error(`Could not load the KPI sync status (HTTP ${res.status})`);
      return res.json();
    },
  });

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("ga");
    if (result === "connected") toast.success("Google Analytics connected");
    if (result === "failed") toast.error("Google Analytics didn't connect. Check the redirect URL in the Google Cloud OAuth client.");
  }, []);

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/kpi-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json as KpiSyncReport;
    },
    onSuccess: (r) => {
      const failed = r.clients.filter((c) => c.error).length;
      if (failed) toast.error(`${failed} client(s) failed — see History`);
      else toast.success(`KPI data pulled for ${r.clients.length} client(s)`);
      qc.invalidateQueries({ queryKey: ["kpi-sync"] });
      qc.invalidateQueries({ queryKey: ["kpi-readings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/google-analytics/connect", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpi-sync"] }),
  });

  if (error) return <p className="text-sm text-red-500">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { ga4 } = data;

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each client&apos;s Main KPIs are computed from its data sources, pulled every morning into the hub. Pick each client&apos;s sources on its profile (Contract
        &amp; services → Main KPIs).
      </p>

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold">Google Analytics (GA4)</h2>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", ga4.connected ? "bg-emerald-500/15 text-emerald-500" : "bg-orange-500/15 text-orange-500")}>
            {ga4.connected ? `Connected · ${ga4.email ?? "account"}` : "Not connected"}
          </span>
          <div className="ml-auto flex gap-2">
            {ga4.oauthConfigured && (
              <Button variant={ga4.connected ? "outline" : "brand"} size="sm" asChild>
                <a href="/api/integrations/google-analytics/connect">
                  <ExternalLink className="size-3.5" /> {ga4.connected ? "Reconnect" : "Connect Google Analytics"}
                </a>
              </Button>
            )}
            {ga4.connected && (
              <Button variant="outline" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                <Unplug className="size-3.5" /> Disconnect
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign in as <b className="text-foreground">analytics@1o8.agency</b> (read-only access). Every GA4 property that account sees can then be picked on a client&apos;s
          profile.
          {!ga4.connected && ga4.serviceAccount && (
            <>
              {" "}
              Until then, properties shared with <b className="text-foreground">{ga4.serviceAccount}</b> as Viewer also work.
            </>
          )}
        </p>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-bold">Coming next</h2>
        <ul className="space-y-1 text-xs">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <b>{s.name}</b> <span className="text-muted-foreground">— {s.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold">History</h2>
          <Button variant="brand" size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">When</th>
              <th className="px-3 py-2">Clients</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id} className="border-t border-border/40 text-xs">
                <td className="whitespace-nowrap px-4 py-1.5 text-sm">
                  {when(r.startedAt)} <span className="text-muted-foreground">· {r.trigger}</span>
                </td>
                <td className="px-3 py-1.5">
                  {r.report?.clients.length ? r.report.clients.map((c) => `${c.code} (${c.days}d)`).join(", ") : "—"}
                </td>
                <td className="px-3 py-1.5">
                  {r.error ? <span className="text-red-500">{r.error}</span> : r.finishedAt ? <span className="text-emerald-500">OK</span> : "Running…"}
                </td>
              </tr>
            ))}
            {!data.runs.length && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-muted-foreground">
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
