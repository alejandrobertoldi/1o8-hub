"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  APLUS2_MODULE_SPECS,
  moduleTypesForTier,
  maxModulesForTier,
  isCarouselModule,
  carouselPanelOptions,
  defaultCarouselPanelCount,
  isQaModule,
  qaQuestionOptions,
  defaultQaQuestionCount,
  type Aplus2ModuleType,
} from "@/lib/aplus2/module-specs";

const NONE = "__none__";

type BulkRow = { type: Aplus2ModuleType | null; itemCount: number };

function emptyRows(n: number): BulkRow[] {
  return Array.from({ length: n }, () => ({ type: null, itemCount: 2 }));
}

function defaultItemCount(type: Aplus2ModuleType | null): number {
  if (!type) return 2;
  if (isCarouselModule(type)) return defaultCarouselPanelCount(type);
  if (isQaModule(type)) return defaultQaQuestionCount();
  return 2;
}

export function Aplus2BulkAddModules({
  versionId,
  contentType,
  currentModuleCount,
}: {
  versionId: string;
  contentType: "PA+" | "BA+";
  currentModuleCount: number;
}) {
  const maxModules = maxModulesForTier(contentType);
  const slotCount = maxModules;
  const [rows, setRows] = useState<BulkRow[]>(() => emptyRows(slotCount));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qc = useQueryClient();

  const tierTypes = moduleTypesForTier(contentType);
  const slotsLeft = maxModules - currentModuleCount;
  const selected = rows.filter((r): r is BulkRow & { type: Aplus2ModuleType } => r.type !== null);
  const overLimit = selected.length > slotsLeft;

  if (slotsLeft <= 0) return null;

  function setType(i: number, v: string) {
    setRows((prev) => {
      const next = [...prev];
      const type = v === NONE ? null : (v as Aplus2ModuleType);
      next[i] = { type, itemCount: defaultItemCount(type) };
      return next;
    });
  }

  function setItemCount(i: number, v: string) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], itemCount: Number(v) };
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.length === 0 || overLimit || isSubmitting) return;
    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    for (const row of selected) {
      try {
        const payload: { moduleType: Aplus2ModuleType; itemCount?: number } = {
          moduleType: row.type,
        };
        if (isCarouselModule(row.type) || isQaModule(row.type)) payload.itemCount = row.itemCount;
        const r = await fetch(`/api/aplus2/versions/${versionId}/modules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        successCount++;
      } catch (err) {
        failCount++;
        toast.error(`Failed to add ${APLUS2_MODULE_SPECS[row.type]?.label ?? row.type}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
    setIsSubmitting(false);
    await qc.invalidateQueries({ queryKey: ["aplus2-set"] });
    if (successCount > 0) {
      toast.success(`Added ${successCount} module${successCount !== 1 ? "s" : ""}`);
      setRows(emptyRows(slotCount));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Bulk add
        </p>
        <p className="text-[10px] text-muted-foreground">
          {currentModuleCount}/{maxModules} used — pick a type per slot, leave blank to skip
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rounded-md border-2 border-dashed border-stone-200 dark:border-zinc-700 bg-stone-50/50 dark:bg-zinc-800/30 p-2 flex flex-col gap-1.5"
          >
            <span className="text-[10px] font-mono font-bold text-brand">
              M{String(i + 1).padStart(2, "0")}
            </span>
            <Select
              value={row.type ?? NONE}
              onValueChange={(v) => setType(i, v)}
              disabled={isSubmitting}
            >
              <SelectTrigger size="sm" className="h-8 w-full text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-xs text-muted-foreground">Skip</SelectItem>
                {tierTypes.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {APLUS2_MODULE_SPECS[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.type && isCarouselModule(row.type) && (
              <Select
                value={String(row.itemCount)}
                onValueChange={(v) => setItemCount(i, v)}
                disabled={isSubmitting}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue placeholder="Panels" />
                </SelectTrigger>
                <SelectContent>
                  {carouselPanelOptions(row.type).map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n} panels
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {row.type && isQaModule(row.type) && (
              <Select
                value={String(row.itemCount)}
                onValueChange={(v) => setItemCount(i, v)}
                disabled={isSubmitting}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue placeholder="Questions" />
                </SelectTrigger>
                <SelectContent>
                  {qaQuestionOptions().map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n} questions
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>

      {overLimit && (
        <p className="text-xs text-red-500">
          {selected.length} selected but only {slotsLeft} slot{slotsLeft !== 1 ? "s" : ""} left — deselect {selected.length - slotsLeft}.
        </p>
      )}

      <Button
        size="sm"
        className="h-8 text-xs"
        onClick={handleConfirm}
        disabled={isSubmitting || selected.length === 0 || overLimit}
      >
        {isSubmitting
          ? <><Loader2 className="size-3 mr-1.5 animate-spin" />Adding…</>
          : `Add ${selected.length > 0 ? selected.length : ""} module${selected.length !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}
