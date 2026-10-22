"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

export function aplusSetDisplayLabel(set: {
  scopeType: string;
  variationId?: string | null;
  variationName?: string | null;
  asin?: string | null;
  scopeIdentifier: string;
  coveredAsins?: string[] | null;
}): string {
  if (set.scopeType === "GROUP") {
    return `${set.scopeIdentifier.replaceAll("_", " ")} · ${set.coveredAsins?.length ?? 0} ASINs`;
  }
  if (set.scopeType === "PARENT") {
    return [set.variationId, set.variationName].filter(Boolean).join(" ") || set.scopeIdentifier;
  }
  return set.asin || set.scopeIdentifier;
}

export function AplusSetDeleteButton({
  setId,
  label,
  clientIdCode,
  onDeleted,
}: {
  setId: string;
  label: string;
  clientIdCode: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/sets/${setId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to delete set");
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["aplus2-sets", clientIdCode] });
      qc.removeQueries({ queryKey: ["aplus2-set", setId] });
      toast.success("A+ set removed");
      onDeleted?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete set"),
  });

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-9 w-9 p-0 shrink-0 rounded-full border-0 bg-brand-red text-white hover:bg-brand-red/90"
        onClick={() => setOpen(true)}
        disabled={mut.isPending}
        aria-label="Delete A+ set"
        title="Delete A+ set"
      >
        {mut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" strokeWidth={1.75} />}
      </Button>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => mut.mutate()}
        title="Delete A+ set?"
        description={
          <>
            This permanently removes <strong className="text-foreground">{label}</strong>, its versions,
            modules, and Drive folders. This cannot be undone.
          </>
        }
        pending={mut.isPending}
        confirmLabel="Delete set"
      />
    </>
  );
}
