"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Eye, Loader2, RefreshCw } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AacChange, AacSyncReport } from "@/lib/aac-sync/sync";

type Run = { id: string; trigger: string; dryRun: boolean; startedAt: string; finishedAt: string | null; report: AacSyncReport | null; error: string | null };
type Status = { configured: boolean; spreadsheetId: string; isTestCopy: boolean; tab: string; runs: Run[] };

const META = (
  <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="AAC Sheet Sync">
    <span className="font-bold text-sidebar-foreground">AAC</span>
    <span className="font-normal text-brand">Sheet Sync</span>
  </h1>
);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TRIGGERS: Record<string, string> = { manual: "Manual", script: "Script", "sheet-edit": "Sheet edit", "hub-edit": "Hub edit", daily: "Daily" };

/** Sync & Export → AAC Sheet tab: two-way sync status between the hub's clients and the AAC Google Sheet. */
export function AacSyncAdmin({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<AacSyncReport | null>(null);
  const { data, isLoading, error } = useQuery<Status>({
    queryKey: ["aac-sync"],
    queryFn: async () => {
      const res = await fetch("/api/admin/aac-sync");
      if (!res.ok) throw new Error(`Could not load the sync status (HTTP ${res.status})`);
      return res.json();
    },
  });

  const run = useMutation({
    mutationFn: async (dry: boolean) => {
      const res = await fetch("/api/admin/aac-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: dry }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json as AacSyncReport;
    },
    onSuccess: (r) => {
      if (r.dryRun) setPreview(r);
      else {
        setPreview(null);
        toast.success(`Synced: ${r.toHub.length} from the sheet, ${r.toSheet.length} to the sheet${r.createdInHub.length ? `, ${r.createdInHub.length} new client(s)` : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["aac-sync"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="p-6 text-sm text-red-500">{error.message}</p>;
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  const latestFull = data.runs.find((r) => r.report && (r.trigger === "manual" || r.trigger === "daily" || r.trigger === "script") && !r.error);
  const latest = preview ?? latestFull?.report ?? null;

  return (
    <div className={cn("space-y-5", !embedded && "mx-auto max-w-5xl px-4 py-6")}>
      {!embedded && <PageMetaSlot>{META}</PageMetaSlot>}
      <p className="max-w-2xl text-sm text-muted-foreground">
        Clients stay in step with the <b>AAC 1o8</b> tab of the &ldquo;All 1o8 Clients (Final)&rdquo; sheet in both directions. Hub edits go to the sheet right
        after saving; sheet edits come in through the sheet&apos;s edit hook, and a full sync runs every morning. If the same cell changed on both sides, the hub
        wins (or the sheet, when its own edit triggered the sync). Fields that only exist in the hub (Figma, socials…) stay in the hub.
      </p>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        {data.configured ? (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", data.isTestCopy ? "bg-orange-500/15 text-orange-500" : "bg-emerald-500/15 text-emerald-500")}>
            {data.isTestCopy ? "Connected to the TEST copy" : "Connected to the AAC sheet"}
          </span>
        ) : (
          <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500">Not configured (no service account)</span>
        )}
        {data.spreadsheetId && (
          <a
            href={`https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            Open sheet · {data.tab} <ExternalLink className="size-3" />
          </a>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!data.configured || run.isPending} onClick={() => run.mutate(true)}>
            <Eye className="size-3.5" /> Preview changes
          </Button>
          <Button variant="brand" size="sm" disabled={!data.configured || run.isPending} onClick={() => run.mutate(false)}>
            {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
          </Button>
        </div>
      </section>

      {preview && (
        <section className="rounded-xl border border-brand/40 bg-card">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-bold">Preview — nothing was written</h2>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setPreview(null)}>
              Close
            </button>
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <ChangeList title="From the sheet → hub" items={preview.toHub} />
            <ChangeList title="From the hub → sheet" items={preview.toSheet} />
          </div>
          {(preview.createdInHub.length > 0 || preview.appendedToSheet.length > 0) && (
            <p className="border-t px-4 py-3 text-xs">
              {preview.createdInHub.length > 0 && <>New clients for the hub: {preview.createdInHub.map((c) => `${c.code} ${c.name}`).join(", ")}. </>}
              {preview.appendedToSheet.length > 0 && <>New rows for the sheet: {preview.appendedToSheet.map((c) => `${c.code} ${c.name}`).join(", ")}.</>}
            </p>
          )}
        </section>
      )}

      {latest && latest.duplicates.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-500">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Repeated client codes in the sheet. Those rows don&apos;t sync until each one has its own code: {latest.duplicates.join("; ")}
        </p>
      )}

      {latest && latest.needsCode.length > 0 && <NeedsCode rows={latest.needsCode} />}

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-bold">History</h2>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">When</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2 text-right">Sheet → hub</th>
              <th className="px-3 py-2 text-right">Hub → sheet</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-4 py-1.5 whitespace-nowrap">{when(r.startedAt)}</td>
                <td className="px-3 py-1.5">
                  {TRIGGERS[r.trigger] ?? r.trigger}
                  {r.dryRun && <span className="ml-1 text-xs text-muted-foreground">(preview)</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.report?.toHub.length ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.report?.toSheet.length ?? "—"}</td>
                <td className="px-3 py-1.5 text-xs">
                  {r.error ? <span className="text-red-500">{r.error}</span> : r.finishedAt ? <span className="text-emerald-500">OK</span> : "Running…"}
                  {r.report?.createdInHub.length ? ` · ${r.report.createdInHub.length} new` : ""}
                </td>
              </tr>
            ))}
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

function ChangeList({ title, items }: { title: string; items: AacChange[] }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title} · {items.length}
      </h3>
      <ul className="max-h-72 space-y-1 overflow-auto text-xs">
        {items.map((c, i) => (
          <li key={i}>
            <span className="font-mono">{c.code}</span> <b>{c.key}</b>: <span className="text-muted-foreground line-through">{c.from.slice(0, 40) || "∅"}</span> →{" "}
            {c.to.slice(0, 60) || "∅"}
            {c.conflict && <span className="ml-1 text-orange-500">(conflict)</span>}
          </li>
        ))}
        {!items.length && <li className="text-muted-foreground">Nothing.</li>}
      </ul>
    </div>
  );
}

function NeedsCode({ rows }: { rows: AacSyncReport["needsCode"] }) {
  const qc = useQueryClient();
  const [codes, setCodes] = useState<Record<number, string>>({});
  const assign = useMutation({
    mutationFn: async (r: AacSyncReport["needsCode"][number]) => {
      const res = await fetch("/api/admin/aac-sync/assign-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: r.rowNumber, name: r.name, code: codes[r.rowNumber] ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not assign the code");
      return json as { code: string };
    },
    onSuccess: (j) => {
      toast.success(`${j.code} created in the hub and written to the sheet`);
      qc.invalidateQueries({ queryKey: ["aac-sync"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const active = rows.filter((r) => /active/i.test(r.status) && !/inactive/i.test(r.status));
  const inactive = rows.filter((r) => !active.includes(r));
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-bold">Clients in the sheet without a code</h2>
        <p className="text-xs text-muted-foreground">The hub needs a client code (like KSS) to create them. Giving one here writes it to the sheet too.</p>
      </header>
      <ul className="divide-y divide-border/40">
        {[...active, ...inactive].map((r) => (
          <li key={r.rowNumber} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", /inactive/i.test(r.status) ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-500")}>
              {r.status || "No status"}
            </span>
            <span className="text-xs text-muted-foreground">row {r.rowNumber}</span>
            <div className="ml-auto flex items-center gap-2">
              <Input
                aria-label={`Code for ${r.name}`}
                placeholder="Code"
                value={codes[r.rowNumber] ?? ""}
                onChange={(e) => setCodes((c) => ({ ...c, [r.rowNumber]: e.target.value.toUpperCase() }))}
                className="h-8 w-24 font-mono uppercase"
                maxLength={12}
              />
              <Button size="sm" variant="outline" disabled={!codes[r.rowNumber] || assign.isPending} onClick={() => assign.mutate(r)}>
                Create client
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
