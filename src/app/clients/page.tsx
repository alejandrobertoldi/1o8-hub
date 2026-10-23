/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Users, Trash2, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { hasAdminPowers } from "@/lib/roles";
import { sowStatus } from "@/lib/clients/sow";
import { SowBadge } from "@/components/clients/client-contract";

// ── Types ─────────────────────────────────────────────────────────────

type ClientEntry = {
  clientIdCode: string;
  clientName: string;
  clientType: "AIA" | "NTA" | null;
  count: number;
  activeCount: number;
  statusBreakdown: Record<string, number>;
  team?: { label: string; name: string }[];
  rawData?: Record<string, string>;
};

type InactiveClientEntry = {
  clientIdCode: string;
  clientName: string;
};

// ── Fetchers ──────────────────────────────────────────────────────────

// The client list gates the whole page render, so it must never hang forever:
// without a deadline a stalled request leaves the skeleton up indefinitely and
// the page looks broken rather than failed. It also has to THROW on a non-OK
// response — swallowing one into `[]` renders "No clients found", which is a lie
// when the real answer is 401 or 500.
const CLIENTS_FETCH_TIMEOUT_MS = 25_000;

async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients", {
    signal: AbortSignal.timeout(CLIENTS_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to load clients (HTTP ${res.status})`);
  return res.json();
}

async function fetchInactiveClients(): Promise<InactiveClientEntry[]> {
  const res = await fetch("/api/clients?status=inactive");
  if (!res.ok) return [];
  return res.json();
}

type ClientReadinessRow = { clientIdCode: string; open: number; dueToday: number; overdue: number; readiness: number };

async function fetchClientReadiness(): Promise<ClientReadinessRow[]> {
  const res = await fetch("/api/readiness/clients");
  if (!res.ok) return [];
  return res.json();
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const readinessTone = (pct: number) => (pct >= 85 ? "text-emerald-500" : pct >= 70 ? "text-brand" : "text-red-500");
const readinessBar = (pct: number) => (pct >= 85 ? "bg-emerald-500" : pct >= 70 ? "bg-brand" : "bg-red-500");

// ── Main page ─────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ clientIdCode: string; clientName: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingClient, setDeletingClient] = useState<string | null>(null);

  const {
    data: clients = [],
    isLoading,
    isError: clientsFailed,
    error: clientsError,
    refetch: refetchClients,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
    staleTime: 5 * 60 * 1000,
    // One retry, not the default three: a 401 or a timed-out DB is not going to
    // resolve itself on attempt three, and each attempt costs another 25s.
    retry: 1,
  });

  const { data: inactiveClients = [] } = useQuery({
    queryKey: ["clients", "inactive"],
    queryFn: fetchInactiveClients,
    staleTime: 5 * 60 * 1000,
  });

  // Asana readiness per client (catalog / sales cards come back once client KPIs are connected).
  const { data: readinessRows = [] } = useQuery({
    queryKey: ["readiness", "clients"],
    queryFn: fetchClientReadiness,
    staleTime: 5 * 60 * 1000,
  });
  const readinessByCode = new Map(readinessRows.map((r) => [r.clientIdCode.toUpperCase(), r]));

  const deleteMutation = useMutation({
    mutationFn: async (clientIdCode: string) => {
      setDeletingClient(clientIdCode);
      const res = await fetch(`/api/clients/${clientIdCode}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onSettled: () => setDeletingClient(null),
  });

  // Agency-wide readiness across active clients.
  const activeReadiness = clients.map((c) => readinessByCode.get(c.clientIdCode.toUpperCase())).filter((r): r is ClientReadinessRow => !!r);
  const agency = activeReadiness.reduce((t, r) => ({ open: t.open + r.open, dueToday: t.dueToday + r.dueToday, overdue: t.overdue + r.overdue }), { open: 0, dueToday: 0, overdue: 0 });
  const agencyPct = agency.open ? Math.round((1 - agency.overdue / agency.open) * 1000) / 10 : 100;
  const atRisk = activeReadiness.filter((r) => r.readiness < 70).length;
  // SOW warnings across active clients.
  const today = localToday();
  const sowByCode = new Map(clients.map((c) => [c.clientIdCode, sowStatus(c.rawData ?? {}, today)]));
  const sowExpiring = [...sowByCode.values()].filter((s) => s.state === "expiring").length;
  const sowExpired = [...sowByCode.values()].filter((s) => s.state === "expired").length;

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">Clients</span><span className="font-normal text-brand">Insight</span>
          </h1>
        </div>
      </PageMetaSlot>

      {/* Summary cards - Asymmetric Hero */}
      {!isLoading && clients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">

          {/* Agency readiness across active clients (Spans 8 cols) */}
          <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-neutral-300 dark:border-white/10 glass-card p-8 lg:p-10 flex flex-col justify-between animate-card-enter">
            <div>
              <p className="text-xs font-bold text-brand uppercase tracking-[0.2em] mb-2 font-[family-name:var(--font-outfit)]">Client Readiness</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl lg:text-7xl font-bold tracking-tighter font-[family-name:var(--font-outfit)] ${readinessTone(agencyPct)}`}>
                  {agencyPct.toFixed(1)}%
                </span>
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">of open Asana tasks on time</span>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-border/40 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-md bg-muted px-2.5 py-1 tabular-nums">{agency.open.toLocaleString()} open</span>
              <span className="rounded-md bg-orange-500/15 px-2.5 py-1 tabular-nums text-orange-500">{agency.dueToday} due today</span>
              <span className="rounded-md bg-red-500/15 px-2.5 py-1 tabular-nums text-red-500">{agency.overdue} overdue</span>
              {atRisk > 0 && <span className="rounded-md bg-red-500/15 px-2.5 py-1 text-red-500">{atRisk} client{atRisk === 1 ? "" : "s"} under 70%</span>}
              {sowExpiring > 0 && <span className="rounded-md bg-orange-500/15 px-2.5 py-1 text-orange-500">{sowExpiring} SOW{sowExpiring === 1 ? "" : "s"} expiring in 30 days</span>}
              {sowExpired > 0 && <span className="rounded-md bg-red-500/15 px-2.5 py-1 text-red-500">{sowExpired} SOW{sowExpired === 1 ? "" : "s"} expired</span>}
              <Link href="/team/readiness" className="ml-auto self-center text-xs font-semibold text-brand hover:underline">
                Team readiness →
              </Link>
            </div>
          </div>

          {/* Active Clients (Spans 4 cols) */}
          <div className="lg:col-span-5 xl:col-span-4 rounded-2xl border border-neutral-300 dark:border-white/10 glass-card p-8 lg:p-10 flex flex-col justify-center animate-card-enter" style={{ animationDelay: "80ms" }}>
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1 font-[family-name:var(--font-outfit)]">Active</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold tracking-tighter text-brand font-[family-name:var(--font-outfit)]">{clients.length}</span>
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Clients</span>
                </div>
              </div>

              {inactiveClients.length > 0 && (
                <div className="pt-6 border-t border-border/40">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1 font-[family-name:var(--font-outfit)]">Inactive</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tighter text-red-500 font-[family-name:var(--font-outfit)]">{inactiveClients.length}</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Archived</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Client grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          <LoadingPlaceholder count={6} className="border-border/40" />
        </div>
      ) : clientsFailed ? (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load clients"
          description={
            clientsError instanceof DOMException && clientsError.name === "TimeoutError"
              ? "The request timed out. The database may be under load — try again in a moment."
              : clientsError instanceof Error
                ? clientsError.message
                : "Something went wrong."
          }
          action={
            <Button variant="outline" size="sm" onClick={() => refetchClients()}>
              Try again
            </Button>
          }
        />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients found"
          description="Add a client to get started with your product catalog."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {clients.map((client, index) => {
            return (
              <div
                key={client.clientIdCode}
                className="flex flex-col h-full rounded-xl glass-card text-card-foreground cursor-pointer card-glow animate-card-enter overflow-hidden group/card border border-neutral-300 dark:border-white/10"
                style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
                onClick={() =>
                  router.push(`/clients/${client.clientIdCode}`)
                }
              >
                <div className="flex-1 flex flex-col px-5 pt-5 pb-4 border-b border-neutral-200 dark:border-white/10 relative z-10">
                  <div className="flex flex-col gap-4 flex-1">
                    {/* Top: name + code | sales sparkline */}
                    <div className="flex items-start gap-3 w-full">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-foreground truncate font-[family-name:var(--font-outfit)] tracking-tight group-hover/card:text-brand transition-colors title-overflow-fix">
                            {client.clientName}
                          </h2>
                          {client.clientType && (
                            <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
                              client.clientType === "AIA"
                                ? "bg-brand/15 text-brand border border-brand/30"
                                : "bg-[var(--brand-nta)]/15 text-[var(--brand-nta)] border border-[var(--brand-nta)]/30"
                            }`}>
                              {client.clientType}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {client.clientIdCode}
                        </p>
                        {(() => {
                          const sow = sowByCode.get(client.clientIdCode);
                          return sow && ["expiring", "expired"].includes(sow.state) ? <SowBadge status={sow} className="mt-1.5 text-[10px]" /> : null;
                        })()}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {isAdmin && (
                          <button
                            className="p-1 rounded text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover/card:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:opacity-100"
                            aria-label={`Remove ${client.clientName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ clientIdCode: client.clientIdCode, clientName: client.clientName });
                              setDeleteConfirmText("");
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Asana readiness */}
                    <ClientReadinessBlock row={readinessByCode.get(client.clientIdCode.toUpperCase())} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inactive Clients */}
      {inactiveClients.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-muted-foreground font-[family-name:var(--font-outfit)]">
              Inactive Clients
            </h2>
            <span className="inline-flex items-center rounded-full bg-red-500/10 text-red-400 px-2 py-0.5 text-xs font-bold tabular-nums">
              {inactiveClients.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {inactiveClients.map((client, index) => (
              <div
                key={client.clientIdCode}
                className="rounded-xl border border-border/40 glass-panel text-card-foreground cursor-pointer transition-all hover:border-red-500/30 hover:shadow-[0_0_24px_-4px_rgba(239,68,68,0.15)] px-5 py-4 animate-card-enter"
                style={{ animationDelay: `${index * 40}ms` }}
                onClick={() =>
                  router.push(`/clients/${client.clientIdCode}`)
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {client.clientName}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {client.clientIdCode}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button
                        className="shrink-0 p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label={`Remove inactive client ${client.clientName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ clientIdCode: client.clientIdCode, clientName: client.clientName });
                          setDeleteConfirmText("");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    <span className="shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-red-600/10 text-red-400 border border-red-500/20">
                      Inactive
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-500">Remove Client</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong className="text-foreground">{deleteTarget?.clientName}</strong> ({deleteTarget?.clientIdCode}) and all associated data including products, forecasts, onboarding steps, and Gantt tasks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm text-muted-foreground">
              Type <strong className="text-foreground">delete</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              className="w-full h-9 px-3 text-sm bg-background border border-border rounded-md outline-none focus:border-red-500 transition-colors"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirmText !== "delete" || deletingClient !== null}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.clientIdCode)}
            >
              {deletingClient ? (
                <><Loader2 className="size-3 mr-1 animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="size-3 mr-1" /> Remove Client</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function ClientReadinessBlock({ row }: { row?: ClientReadinessRow }) {
  if (!row) {
    return (
      <div className="mt-auto border-t border-border/10 pt-3 text-xs text-muted-foreground">No open Asana tasks</div>
    );
  }
  return (
    <div className="mt-auto border-t border-border/10 pt-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] font-[family-name:var(--font-outfit)]">Readiness</p>
        <span className={`text-3xl font-bold tabular-nums tracking-tighter font-[family-name:var(--font-outfit)] ${readinessTone(row.readiness)}`}>
          {row.readiness.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${readinessBar(row.readiness)}`} style={{ width: `${row.readiness}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-[11px] tabular-nums text-muted-foreground">
        <span><b className="text-foreground">{row.open}</b> open</span>
        <span><b className={row.dueToday ? "text-orange-500" : "text-foreground"}>{row.dueToday}</b> today</span>
        <span><b className={row.overdue ? "text-red-500" : "text-foreground"}>{row.overdue}</b> late</span>
      </div>
    </div>
  );
}
