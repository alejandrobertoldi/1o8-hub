"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  Trash2,
  Loader2,
} from "lucide-react";
import { FinalizeDiffDrawer } from "./finalize-diff-drawer";
import { CLIENT_NAMES } from "@/lib/constants";

interface RequestRow {
  id: string;
  clientIdCode: string;
  productType: string;
  status: "in_progress" | "finalized" | "reopened" | "legacy";
  sheetUrl: string | null;
  createdAt: string;
  createdBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export function TemplateRequestsList() {
  const qc = useQueryClient();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["template-requests"],
    queryFn: async () => {
      const res = await fetch("/api/attributes/template-requests/list");
      if (!res.ok) return { requests: [] as RequestRow[] };
      return res.json() as Promise<{ requests: RequestRow[] }>;
    },
  });

  const rows = useMemo(() => data?.requests ?? [], [data?.requests]);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/attributes/template-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      toast.success(`Removed ${data.deleted} request${data.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["template-requests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isLoading && rows.length === 0) return null;

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(rows.map((r) => r.id)));
    else setSelected(new Set());
  }

  return (
    <div className="rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none">
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${
                open ? "" : "-rotate-90"
              }`}
            />
            <h2 className="text-sm font-semibold">Template Requests</h2>
            <span className="text-xs text-muted-foreground">({rows.length})</span>
          </CollapsibleTrigger>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="size-3 mr-1" />
              )}
              Delete ({selected.size})
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="overflow-x-auto border-t px-4 pb-4 pt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 w-8">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="py-1">Client</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Finalized</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, v === true)}
                        aria-label={`Select request ${r.id}`}
                      />
                    </td>
                    <td className="py-1.5">{CLIENT_NAMES[r.clientIdCode] || r.clientIdCode}</td>
                    <td>{r.productType}</td>
                    <td>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${statusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{new Date(r.createdAt).toLocaleDateString("en-US")}</td>
                    <td>{r.finalizedAt ? new Date(r.finalizedAt).toLocaleDateString("en-US") : "—"}</td>
                    <td className="text-right space-x-1">
                      {r.sheetUrl && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.sheetUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      )}
                      {(r.status === "in_progress" || r.status === "reopened") && (
                        <Button size="sm" variant="outline" onClick={() => setReviewId(r.id)}>
                          <CheckCircle2 className="size-3 mr-1" /> Review
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <FinalizeDiffDrawer
        requestId={reviewId}
        open={!!reviewId}
        onOpenChange={(v) => !v && setReviewId(null)}
        onFinalized={() => qc.invalidateQueries({ queryKey: ["template-requests"] })}
      />

      <DeleteConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => deleteMutation.mutate([...selected])}
        title={`Remove ${selected.size} request${selected.size === 1 ? "" : "s"}?`}
        description="This removes the selected rows from the list. The underlying Google Sheets in Drive are left in place — only the DB records are deleted. This action cannot be undone."
        pending={deleteMutation.isPending}
        confirmLabel="Remove"
      />
    </div>
  );
}

function statusClass(s: string): string {
  switch (s) {
    case "in_progress": return "bg-blue-50 text-blue-700";
    case "reopened":    return "bg-amber-50 text-amber-700";
    case "finalized":   return "bg-emerald-50 text-emerald-700";
    default:            return "bg-muted text-muted-foreground";
  }
}
