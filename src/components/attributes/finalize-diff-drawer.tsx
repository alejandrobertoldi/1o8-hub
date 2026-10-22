/* eslint-disable react-doctor/query-mutation-missing-invalidation */
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface DiffCounts {
  unchanged: number;
  clientEdited: number;
  catalogDrifted: number;
  conflict: number;
}

export function FinalizeDiffDrawer({
  requestId,
  open,
  onOpenChange,
  onFinalized,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFinalized?: () => void;
}) {
  const [finalizing, setFinalizing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["template-request-diff", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/attributes/template-requests/${requestId}/diff`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Diff failed");
      }
      return res.json() as Promise<{ counts: DiffCounts }>;
    },
    enabled: open && !!requestId,
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/attributes/template-requests/${requestId}/finalize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Finalize failed");
      }
      return res.json() as Promise<{ written: number }>;
    },
    onMutate: () => setFinalizing(true),
    onSettled: () => setFinalizing(false),
    onSuccess: (d) => {
      toast.success(`Finalized — ${d.written} values written`);
      onOpenChange(false);
      onFinalized?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = data?.counts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review & Finalize</DialogTitle>
          <DialogDescription>
            V1 applies all client edits automatically. Conflicts default to the client&apos;s value.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="size-5 animate-spin" /></div>}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
        {c && (
          <div className="grid grid-cols-2 gap-2 text-sm py-2">
            <Row label="Unchanged" count={c.unchanged} />
            <Row label="Client edited" count={c.clientEdited} tone="good" />
            <Row label="Catalog drifted (skipped)" count={c.catalogDrifted} tone="warn" />
            <Row label="Conflict (keep sheet)" count={c.conflict} tone="warn" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => finalizeMutation.mutate()} disabled={!c || finalizing}>
            {finalizing ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : null}
            Finalize & Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, count, tone }: { label: string; count: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-muted-foreground";
  return (
    <div className="flex justify-between rounded border px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm ${color}`}>{count}</span>
    </div>
  );
}
