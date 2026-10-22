"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DESIGN_STATUS_ORDER_FULL,
  type DesignStatusValue,
  getStatusMeta,
  StatusDot,
  STATUS_MENU_ITEM_CLASS,
  STATUS_VERSION_TRIGGER_CLASS,
} from "@/lib/design-status";

function normalizeStatus(value: string): DesignStatusValue {
  if (value === "published") return "live";
  if (value === "draft") return "not_started";
  if ((DESIGN_STATUS_ORDER_FULL as readonly string[]).includes(value)) {
    return value as DesignStatusValue;
  }
  return "not_started";
}

export function Aplus2VersionStatusSelect({
  versionId,
  value,
  setId,
  clientIdCode,
  readOnly = false,
}: {
  versionId: string | undefined;
  value: string;
  setId: string;
  clientIdCode: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const status = normalizeStatus(value);
  const meta = getStatusMeta(status);

  const mut = useMutation({
    mutationFn: async (next: string) => {
      if (!versionId) throw new Error("Version not loaded yet");
      const r = await fetch(`/api/aplus2/versions/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to update status");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aplus2-set", setId] });
      qc.invalidateQueries({ queryKey: ["aplus2-sets", clientIdCode] });
      qc.invalidateQueries({ queryKey: ["design-status"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
  });

  if (readOnly) {
    return (
      <span
        className={cn(
          STATUS_VERSION_TRIGGER_CLASS,
          "w-fit inline-flex items-center gap-1 border",
          meta.chipClass,
        )}
      >
        <StatusDot status={status} />
        {meta.label}
      </span>
    );
  }

  return (
    <Select
      value={status}
      onValueChange={(next) => mut.mutate(next)}
      disabled={mut.isPending || !versionId}
    >
      <SelectTrigger
        aria-label="Version status"
        className={cn(
          STATUS_VERSION_TRIGGER_CLASS,
          "w-fit border justify-start gap-1",
          meta.chipClass,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DESIGN_STATUS_ORDER_FULL.map((s) => (
          <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
            <div className="flex items-center gap-2">
              <StatusDot status={s} />
              {getStatusMeta(s).label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
