"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AplusModuleCard } from "./aplus-module-card";
import type { AplusModuleWithImages } from "./module-card-types";

interface AplusViewerProps {
  productId: string;
}

interface AplusApiResponse {
  product: {
    id: string;
    name: string;
    asin: string;
    clientIdCode: string;
  };
  modules: AplusModuleWithImages[];
}

const MAX_SLOTS = 7;

// ─── Read-only empty slot ─────────────────────────────────────────────────────
function EmptySlotReadOnly({ slotNumber }: { slotNumber: number }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border/50 bg-muted/10 p-6 flex flex-col items-center justify-center gap-2 min-h-[100px]">
      <span className="text-sm text-muted-foreground/60 font-medium">
        Module {slotNumber}
      </span>
      <span className="text-xs text-muted-foreground/40 italic">Empty slot</span>
    </div>
  );
}

// ─── Main viewer ──────────────────────────────────────────────────────────────
export function AplusViewer({ productId }: AplusViewerProps) {
  const { data, isLoading, isError } = useQuery<AplusApiResponse>({
    queryKey: ["aplus-modules", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}`);
      if (!res.ok) throw new Error("Failed to load A+ modules");
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  const modules = data?.modules ?? [];
  const product = data?.product;

  // ── Rollup counts ──────────────────────────────────────────────────────────
  const approvedCount = modules.filter((m) => m.status === "approved").length;
  const filledCount = modules.length;

  // ── 7-slot layout ─────────────────────────────────────────────────────────
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
  const moduleByNumber = new Map<number, AplusModuleWithImages>();
  for (const m of modules) {
    moduleByNumber.set(m.moduleNumber, m);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-red-500">Failed to load A+ modules. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-[family-name:var(--font-outfit)] tracking-tight">
            {product?.name ?? "A+ Content"}
          </h1>
          {product?.asin && (
            <p className="text-sm text-muted-foreground font-mono">{product.asin}</p>
          )}
          {product?.clientIdCode && (
            <p className="text-xs text-muted-foreground/70">{product.clientIdCode}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rollup badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-sm px-3 py-1",
              approvedCount === filledCount && filledCount > 0
                ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                : "border-amber-500/30 text-amber-600 bg-amber-500/10"
            )}
          >
            {filledCount}/7 modules, {approvedCount} approved
          </Badge>
        </div>
      </div>

      {/* No modules at all */}
      {filledCount === 0 ? (
        <div className="flex items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No A+ modules yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {slots.map((slotNumber) => {
            const module = moduleByNumber.get(slotNumber);
            if (module) {
              return (
                <AplusModuleCard
                  key={module.id}
                  module={module}
                  productId={productId}
                  readOnly={true}
                  onDelete={() => {}}
                  sortableProps={undefined}
                />
              );
            }
            return (
              <EmptySlotReadOnly
                key={`empty-${slotNumber}`}
                slotNumber={slotNumber}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
