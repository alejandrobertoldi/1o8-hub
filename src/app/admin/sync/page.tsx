"use client";
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Database,
  Cloud,
  Clock,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

interface SyncTableResult {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

interface SyncResult {
  success: boolean;
  tables: SyncTableResult[];
  totalDurationMs: number;
  triggeredBy: string;
}

interface SyncLogEntry {
  action: string;
  status: string;
  message: string;
  detail: { results: SyncTableResult[] } | null;
  durationMs: number | null;
  createdAt: string;
  userName: string | null;
}

const TABLE_CONFIG = [
  {
    id: "aac_clients",
    label: "AAC Clients",
    description: "Client metadata, Power BI URLs, team assignments",
    bqSource: "BibleApp · AAC",
    direction: "BQ → Supabase",
  },
  {
    id: "attributes",
    label: "Attributes",
    description: "Column registry with 972 product attributes",
    bqSource: "BibleApp · Attributes",
    direction: "BQ → Supabase",
  },
];

export default function SyncPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  // Fetch recent sync logs
  const { data: logs, isLoading: logsLoading } = useQuery<SyncLogEntry[]>({
    queryKey: ["sync-logs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/logs?section=sync&pageSize=10");
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    refetchOnWindowFocus: false,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (tables?: string[]) => {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: tables?.length ? tables : undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json() as Promise<SyncResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
    },
  });

  if (!hasAdminPowers(session?.user?.role)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  const toggleTable = (id: string) => {
    setSelectedTables((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Data Sync"
        >
          <span className="font-bold text-sidebar-foreground">Data</span>
          <span className="font-normal text-brand">Sync</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background flex flex-col sm:flex-row sm:items-start sm:justify-end gap-4 animate-card-enter">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate(selectedTables.length ? selectedTables : undefined)}
          disabled={syncMutation.isPending}
          className="border-border/60 hover:border-brand/30 hover:shadow-[0_0_12px_-4px_var(--brand-glow)] mt-2 sm:mt-0"
        >
          {syncMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-1.5">
            {syncMutation.isPending
              ? "Syncing…"
              : selectedTables.length
                ? `Sync ${selectedTables.length} table${selectedTables.length > 1 ? "s" : ""}`
                : "Sync All"}
          </span>
        </Button>
      </div>

      {/* Sync result banner */}
      {syncMutation.data && (
        <div
          className={`rounded-xl border px-5 py-4 flex items-start gap-4 animate-card-enter ${
            syncMutation.data.tables.every((t) => t.errors.length === 0)
              ? "border-emerald-500/25 bg-emerald-500/5"
              : "border-amber-500/25 bg-amber-500/5"
          }`}
        >
          <CheckCircle className="size-5 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="font-semibold text-foreground text-sm">
              Sync complete in {(syncMutation.data.totalDurationMs / 1000).toFixed(1)}s
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {syncMutation.data.tables.map((t) => (
                <div
                  key={t.table}
                  className="rounded-lg border border-border/40 px-3 py-2 bg-card/50"
                >
                  <p className="font-mono text-xs text-foreground font-semibold">
                    {t.table}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t.inserted} inserted, {t.updated} updated, {t.skipped} skipped
                    {t.errors.length > 0 && (
                      <span className="text-red-500 ml-1">
                        ({t.errors.length} errors)
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {(t.durationMs / 1000).toFixed(1)}s
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {syncMutation.isError && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-500 flex items-center gap-3">
          <XCircle className="size-5 shrink-0" />
          {syncMutation.error?.message || "Sync failed"}
        </div>
      )}

      {/* Table cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TABLE_CONFIG.map((table, i) => {
          const isSelected = selectedTables.includes(table.id);
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => toggleTable(table.id)}
              className={`rounded-xl border px-5 py-4 text-left transition-all cursor-pointer animate-card-enter ${
                isSelected
                  ? "border-brand/40 bg-brand/5 shadow-[0_0_12px_-4px_var(--brand-glow)]"
                  : "border-border/60 bg-card hover:border-border"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1.5">
                  <Cloud className="size-4 text-blue-500" />
                  <ArrowRightLeft className="size-3 text-muted-foreground" />
                  <Database className="size-4 text-violet-500" />
                </div>
                <span className="font-semibold text-sm text-foreground">
                  {table.label}
                </span>
                {isSelected && (
                  <CheckCircle className="size-4 text-brand ml-auto" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {table.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
                <span className="font-mono">{table.bqSource}</span>
                <span>{table.direction}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Cron info */}
      <div className="rounded-xl border border-border/60 bg-card/50 px-5 py-4 flex items-center gap-4 animate-card-enter" style={{ animationDelay: "120ms" }}>
        <Clock className="size-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Automatic sync every 6 hours
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cron runs at 0:00, 6:00, 12:00, 18:00 UTC via Vercel. Products sync separately via dirty-flag publish (hourly).
          </p>
        </div>
      </div>

      {/* Recent sync history */}
      <div className="rounded-xl border border-border/60 overflow-hidden animate-card-enter" style={{ animationDelay: "180ms" }}>
        <div className="px-5 py-3.5 bg-card flex items-center gap-3 border-b border-border/40">
          <RefreshCw className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm text-foreground">
            Recent Sync History
          </span>
        </div>
        {logsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            No sync history yet. Run a sync to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">
                  When
                </th>
                <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">
                  Triggered By
                </th>
                <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">
                  Status
                </th>
                <th className="text-left font-medium text-muted-foreground px-5 py-2 text-xs">
                  Result
                </th>
                <th className="text-right font-medium text-muted-foreground px-5 py-2 text-xs">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logs.map((log, i) => (
                <tr key={i} className="hover:bg-accent/20 transition-colors">
                  <td className="px-5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-2.5 text-xs font-mono text-foreground">
                    {log.userName || "system"}
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        log.status === "success"
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      {log.status === "success" ? (
                        <CheckCircle className="size-3" />
                      ) : (
                        <XCircle className="size-3" />
                      )}
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">
                    {log.message}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs font-mono text-muted-foreground tabular-nums">
                    {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
