"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ChevronRight, ChevronDown, ArrowRight } from "lucide-react";

type ChangeEdit = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

type ChangeEntry = {
  asin: string | null;
  sku: string | null;
  edits: ChangeEdit[];
};

type HistoryEntry = {
  id: number;
  publishedBy: string;
  publishedAt: string;
  rowsPublished: number;
  jobId: string | null;
  dirtyCount: number;
  changes: ChangeEntry[] | null;
};

function truncate(value: string | null, max: number): string {
  if (!value) return "";
  return value.length > max ? value.slice(0, max) + "…" : value;
}

export function PublishHistory() {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: entries, isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["publish-history"],
    queryFn: async () => {
      const res = await fetch("/api/publish/history");
      if (!res.ok) throw new Error("Failed to fetch publish history");
      return res.json();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5" />
          Publish History
        </CardTitle>
        <CardDescription>
          Log of all publishes to BigQuery. Click a row to see what changed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : !entries || entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No publishes yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Published By</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Changes</TableHead>
                <TableHead>Job ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isExpanded = expandedRows.has(entry.id);
                const hasChanges = entry.changes && entry.changes.length > 0;
                return (
                  <Fragment key={entry.id}>
                    <TableRow
                      className={hasChanges ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => hasChanges && toggleRow(entry.id)}
                    >
                      <TableCell className="w-8 px-2">
                        {hasChanges &&
                          (isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          ))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(entry.publishedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{entry.publishedBy}</TableCell>
                      <TableCell className="text-right font-mono">
                        {entry.rowsPublished.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {entry.dirtyCount}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                        {entry.jobId || "—"}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasChanges && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <div className="bg-muted/30 border-t px-6 py-3 space-y-3">
                            {entry.changes!.map((product, pi) => (
                              <div key={pi}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium">
                                    {product.asin || "—"}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {product.sku || "—"}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px]">
                                    {product.edits.length} edit{product.edits.length !== 1 ? "s" : ""}
                                  </Badge>
                                </div>
                                <div className="space-y-0.5 ml-2">
                                  {product.edits.map((edit, ei) => (
                                    <div key={ei} className="text-[11px] flex items-center gap-1.5">
                                      <span className="font-medium min-w-0">{edit.field}</span>
                                      <span className="text-muted-foreground">:</span>
                                      <span className="text-red-600/80 font-mono">
                                        {truncate(edit.oldValue, 40) || <span className="italic text-muted-foreground">empty</span>}
                                      </span>
                                      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                                      <span className="text-green-600/80 font-mono">
                                        {truncate(edit.newValue, 40) || <span className="italic text-muted-foreground">empty</span>}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
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
  );
}
