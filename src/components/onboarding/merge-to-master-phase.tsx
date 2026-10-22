/* eslint-disable react-doctor/query-no-usequery-for-mutation */
/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SELECTABLE_ALR_STATUSES,
  type AlrStatusBucket,
} from "./alr-status-filter";

type Props = { clientIdCode: string; onMerged: () => void };

interface PreflightResponse {
  matchedTotal: number;
  matchedSelected: number;
  byStatus: { active: number; inactive: number; incomplete: number };
  dirtyCount: number;
}

type SelectableStatus = Exclude<AlrStatusBucket, "Other">;

export function MergeToMasterPhase({ clientIdCode, onMerged }: Props) {
  const [selected, setSelected] = useState<Set<SelectableStatus>>(
    () => new Set<SelectableStatus>(["Active"])
  );
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const selectedArray = [...selected] as SelectableStatus[];

  const preflight = useQuery<PreflightResponse>({
    queryKey: ["merge-master-preflight", clientIdCode, selectedArray],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/merge-master?phase=preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          selectedStatuses: selectedArray.length > 0 ? selectedArray : ["Active"],
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Preflight failed (${res.status})`);
      }
      return (await res.json()) as PreflightResponse;
    },
    enabled: selectedArray.length > 0,
  });

  const executeMutation = useMutation<{ merged: number }, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding/merge-master?phase=execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientIdCode,
          selectedStatuses: selectedArray,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Merge failed (${res.status})`);
      }
      return (await res.json()) as { merged: number };
    },
    onSuccess: (data) => {
      toast.success(`Wrote ${data.merged} products to master.`);
      setConfirmDialogOpen(false);
      onMerged();
    },
    onError: (err) => toast.error(`Merge failed: ${err.message}`),
  });

  function toggle(status: SelectableStatus) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function onMergeClick() {
    if (preflight.data && preflight.data.dirtyCount > 0) {
      setConfirmDialogOpen(true);
    } else {
      executeMutation.mutate();
    }
  }

  return (
    <div className="space-y-3 border border-neutral-200 rounded-md p-4">
      <h3 className="text-sm font-medium">Merge to master</h3>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-neutral-600">Status:</span>
        {SELECTABLE_ALR_STATUSES.map((s) => {
          const count =
            s === "Active"
              ? preflight.data?.byStatus.active
              : s === "Inactive"
                ? preflight.data?.byStatus.inactive
                : preflight.data?.byStatus.incomplete;
          return (
            <label key={s} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(s)}
                onChange={() => toggle(s)}
              />
              <span>
                {s} ({count ?? "…"})
              </span>
            </label>
          );
        })}
      </div>

      <div className="text-sm text-neutral-700">
        {preflight.isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Computing…
          </span>
        ) : preflight.data ? (
          <span>
            Will write{" "}
            <strong>{preflight.data.matchedSelected}</strong> products to master
            (out of {preflight.data.matchedTotal} matched).
          </span>
        ) : null}
      </div>

      {preflight.data && preflight.data.dirtyCount > 0 && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
          <AlertTriangle className="size-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{preflight.data.dirtyCount}</strong> existing master rows for
            this client have edits or pending changes. They will be wiped on
            merge.
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          onClick={onMergeClick}
          disabled={
            executeMutation.isPending ||
            selected.size === 0 ||
            !preflight.data ||
            preflight.data.matchedSelected === 0
          }
        >
          {executeMutation.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Merge to master
        </Button>
      </div>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite edited products?</AlertDialogTitle>
            <AlertDialogDescription>
              {preflight.data?.dirtyCount} existing master rows for{" "}
              <code>{clientIdCode}</code> have edits or pending changes. The
              merge will delete these rows and rebuild from CLR + ALR. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeMutation.mutate();
              }}
              disabled={executeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {executeMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Yes, overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
