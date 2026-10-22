"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/no-array-index-as-key */

import { hasAdminPowers } from "@/lib/roles";
import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Zap,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Undo2,
  Database,
  HardDrive,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BqTablePanel } from "./bq-table-panel";

type BqTableInfo = {
  id: string;
  type: string;
  numRows: number;
  numBytes: number;
  columnCount: number;
  lastModified: string | null;
  createdAt: string | null;
  affectedBySync: boolean;
};

type BqTablesResponse = {
  dataset: string;
  tables: BqTableInfo[];
};

type SyncStatus = {
  pendingChanges: number;
  totalProducts: number;
  lastSync: {
    publishedBy: string;
    publishedAt: string;
    rowsPublished: number;
    jobId: string | null;
    dirtyCount: number;
  } | null;
  pendingEditors: string[];
};

type ChangeLogEntry = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
};

type DirtyProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  brandName: string | null;
  summarizedTitle: string | null;
  isDirty: boolean;
  changeLog: ChangeLogEntry[];
  updatedAt: string;
};

function TruncatedValue({
  value,
  max = 60,
}: {
  value: string | null;
  max?: number;
}) {
  const display = value ?? "";
  if (display.length <= max) {
    return (
      <span className="font-mono text-xs">
        {display || (
          <span className="text-muted-foreground italic">empty</span>
        )}
      </span>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs cursor-help">
            {display.slice(0, max)}...
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <p className="text-xs whitespace-pre-wrap break-all">{display}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SyncDashboard() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertingField, setRevertingField] = useState<string | null>(null);

  const canEdit =
    session?.user?.role === "editor" || hasAdminPowers(session?.user?.role);
  const isAdmin = hasAdminPowers(session?.user?.role);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTable = (id: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: status, isLoading: statusLoading } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/sync/status");
      if (!res.ok) throw new Error("Failed to fetch sync status");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const { data: bqTables, isLoading: tablesLoading } =
    useQuery<BqTablesResponse>({
      queryKey: ["sync-bq-tables"],
      queryFn: async () => {
        const res = await fetch("/api/sync/tables");
        if (!res.ok) throw new Error("Failed to fetch BQ tables");
        return res.json();
      },
      refetchInterval: 60_000,
    });

  const { data: dirtyProducts, isLoading: productsLoading } = useQuery<
    DirtyProduct[]
  >({
    queryKey: ["products", "dirty"],
    queryFn: async () => {
      const res = await fetch("/api/products?isDirty=true&pageSize=100");
      if (!res.ok) throw new Error("Failed to fetch dirty products");
      const data = await res.json();
      return data.data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (mode: "incremental" | "full") => {
      const res = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.synced === 0) {
        toast.info("No pending changes to sync");
      } else {
        toast.success(
          `Synced ${data.synced} product${data.synced !== 1 ? "s" : ""} to BigQuery`
        );
      }
      setExpandedRows(new Set());
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["publish-history"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleRevert = async (productId: string) => {
    if (
      !confirm(
        "Discard all changes for this product and restore original values?"
      )
    )
      return;
    setRevertingId(productId);
    try {
      const res = await fetch(`/api/products/${productId}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revert");
      }
      const data = await res.json();
      toast.success(`Reverted ${data.reverted} field(s)`);
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setRevertingId(null);
    }
  };

  const handleRevertField = async (productId: string, bqName: string) => {
    const key = `${productId}:${bqName}`;
    setRevertingField(key);
    try {
      const res = await fetch(`/api/products/${productId}/revert-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bqName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revert field");
      }
      toast.success(`Reverted ${bqName}`);
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setRevertingField(null);
    }
  };

  const handleRevertAll = async () => {
    if (!dirtyProducts?.length) return;
    if (
      !confirm(`Discard changes for all ${dirtyProducts.length} product(s)?`)
    )
      return;
    setRevertingId("__all__");
    let reverted = 0;
    for (const p of dirtyProducts) {
      try {
        const res = await fetch(`/api/products/${p.id}/revert`, {
          method: "POST",
        });
        if (res.ok) reverted++;
      } catch {
        /* continue */
      }
    }
    toast.success(`Reverted ${reverted} product(s)`);
    queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    setRevertingId(null);
  };

  if (statusLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  const pending = status?.pendingChanges ?? 0;
  const lastSync = status?.lastSync;

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sync Status</CardDescription>
            <CardTitle className="flex items-center gap-2 text-xl">
              {pending > 0 ? (
                <>
                  <AlertCircle className="size-5 text-brand" />
                  <span className="text-brand">{pending} pending</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-5 text-emerald-500" />
                  <span className="text-emerald-500">All synced</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Sync</CardDescription>
            <CardTitle className="text-xl">
              {lastSync ? timeAgo(lastSync.publishedAt) : "Never"}
            </CardTitle>
            {lastSync && (
              <p className="text-xs text-muted-foreground mt-1">
                {lastSync.rowsPublished} rows &middot;{" "}
                {lastSync.publishedBy === "system/cron"
                  ? "auto"
                  : lastSync.publishedBy.split("@")[0]}
              </p>
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Products</CardDescription>
            <CardTitle className="text-3xl">
              {status?.totalProducts ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Schedule</CardDescription>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              Every hour
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-syncs dirty products via MERGE
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Sync Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-5" />
            Manual Sync
          </CardTitle>
          <CardDescription>
            Trigger a sync immediately instead of waiting for the next scheduled
            run.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            className="gap-1.5"
            disabled={pending === 0 || syncMutation.isPending}
            onClick={() => syncMutation.mutate("incremental")}
          >
            {syncMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Zap className="size-4" />
            )}
            {pending === 0
              ? "No changes to sync"
              : `Sync ${pending} change${pending !== 1 ? "s" : ""} now`}
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate("full")}
            >
              <RefreshCw className="size-4" />
              Full Sync (all rows)
            </Button>
          )}
        </CardContent>
      </Card>

      {/* BQ Dataset Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5" />
            BigQuery Tables
          </CardTitle>
          <CardDescription>
            {bqTables?.dataset ?? "Loading…"} &mdash; click any table to
            preview, filter, and export data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tablesLoading ? (
            <Skeleton className="h-[160px] w-full" />
          ) : !bqTables?.tables?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tables found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Columns</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bqTables.tables.map((t) => {
                  const isTableExpanded = expandedTables.has(t.id);
                  return (
                    <Fragment key={t.id}>
                      <TableRow
                        className={`cursor-pointer hover:bg-muted/50 ${
                          t.affectedBySync && pending > 0
                            ? "bg-brand/5"
                            : ""
                        }`}
                        onClick={() => toggleTable(t.id)}
                      >
                        <TableCell className="w-8 px-2">
                          {isTableExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <HardDrive className="size-3.5 text-muted-foreground" />
                            <span className="font-mono text-sm font-medium">
                              {t.id}
                            </span>
                            {t.type === "VIEW" && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0"
                              >
                                VIEW
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.numRows.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatBytes(t.numBytes)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {t.columnCount}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.lastModified ? timeAgo(t.lastModified) : "—"}
                        </TableCell>
                        <TableCell>
                          {t.affectedBySync && pending > 0 ? (
                            <Badge className="bg-brand/15 text-brand border-brand/30 text-[10px] gap-1">
                              <AlertCircle className="size-3" />
                              {pending} pending
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-500 border-emerald-500/30 gap-1"
                            >
                              <CheckCircle className="size-3" />
                              Synced
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {isTableExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <BqTablePanel
                              tableId={t.id}
                              numRows={t.numRows}
                              columnCount={t.columnCount}
                              showClientExport={t.id === "Master"}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Changes List */}
      {pending > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pending Changes</CardTitle>
                <CardDescription>
                  These changes will be synced to BigQuery on the next scheduled
                  run. Click a row to see field-level changes.
                </CardDescription>
              </div>
              {canEdit && (dirtyProducts?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  disabled={revertingId !== null}
                  onClick={handleRevertAll}
                >
                  <Undo2 className="size-3.5" />
                  {revertingId === "__all__" ? "Reverting…" : "Discard All"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>ASIN</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>Last Modified</TableHead>
                    {canEdit && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dirtyProducts ?? []).map((p) => {
                    const isExpanded = expandedRows.has(p.id);
                    const changes = p.changeLog ?? [];
                    return (
                      <Fragment key={p.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            changes.length > 0 && toggleRow(p.id)
                          }
                        >
                          <TableCell className="w-8 px-2">
                            {changes.length > 0 &&
                              (isExpanded ? (
                                <ChevronDown className="size-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-4 text-muted-foreground" />
                              ))}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/products/${p.id}`}
                              className="font-mono text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {p.asin || "—"}
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono">
                            {p.sku || "—"}
                          </TableCell>
                          <TableCell>{p.brandName || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {p.summarizedTitle || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {changes.length} edit
                              {changes.length !== 1 ? "s" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(p.updatedAt).toLocaleString()}
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                                disabled={revertingId !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevert(p.id);
                                }}
                              >
                                {revertingId === p.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Undo2 className="size-3" />
                                )}
                                Discard
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                        {isExpanded && changes.length > 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={canEdit ? 8 : 7}
                              className="p-0"
                            >
                              <div className="bg-muted/30 border-t px-6 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 pr-4 font-medium">
                                        Field
                                      </th>
                                      <th className="text-left py-1 pr-4 font-medium">
                                        Old Value
                                      </th>
                                      <th className="text-left py-1 pr-4 font-medium" />
                                      <th className="text-left py-1 pr-4 font-medium">
                                        New Value
                                      </th>
                                      <th className="text-left py-1 pr-4 font-medium">
                                        Changed By
                                      </th>
                                      <th className="text-left py-1 pr-4 font-medium">
                                        Time
                                      </th>
                                      {canEdit && (
                                        <th className="text-left py-1 font-medium w-16" />
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {changes.map((c, i) => {
                                      const fieldKey = `${p.id}:${c.field}`;
                                      const isFirstForField =
                                        changes.findIndex(
                                          (x) => x.field === c.field
                                        ) === i;
                                      return (
                                        <tr
                                          key={i}
                                          className="border-t border-border/50"
                                        >
                                          <td className="py-1.5 pr-4 font-medium">
                                            {c.field}
                                          </td>
                                          <td className="py-1.5 pr-4 text-red-600/80">
                                            <TruncatedValue
                                              value={c.oldValue}
                                            />
                                          </td>
                                          <td className="py-1.5 pr-4">
                                            <ArrowRight className="size-3 text-muted-foreground" />
                                          </td>
                                          <td className="py-1.5 pr-4 text-green-600/80">
                                            <TruncatedValue
                                              value={c.newValue}
                                            />
                                          </td>
                                          <td className="py-1.5 pr-4 text-muted-foreground">
                                            {c.changedBy}
                                          </td>
                                          <td className="py-1.5 pr-4 text-muted-foreground">
                                            {new Date(
                                              c.changedAt
                                            ).toLocaleString()}
                                          </td>
                                          {canEdit && (
                                            <td className="py-1.5">
                                              {isFirstForField && (
                                                <button
                                                  className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 disabled:opacity-50"
                                                  disabled={
                                                    revertingField !== null
                                                  }
                                                  onClick={() =>
                                                    handleRevertField(
                                                      p.id,
                                                      c.field
                                                    )
                                                  }
                                                >
                                                  {revertingField ===
                                                  fieldKey ? (
                                                    <Loader2 className="size-3 animate-spin" />
                                                  ) : (
                                                    <Undo2 className="size-3" />
                                                  )}
                                                </button>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
