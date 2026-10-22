"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, ArrowDown, Plus, X } from "lucide-react";
import type {
  CategoryGroupData,
} from "@/hooks/use-category-definition";

interface HealthGap {
  attributeName: string;
  localLabel: string;
  effectiveLevel: "Required" | "Conditionally Required" | "Key";
}

interface AttributeHealthCardProps {
  productId: string;
  categoryGroups: CategoryGroupData[];
  categoryName?: string;
}

export function AttributeHealthCard({
  productId,
  categoryGroups,
  categoryName,
}: AttributeHealthCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit =
    hasAdminPowers(session?.user?.role) || session?.user?.role === "editor";
  const [showKeyPopover, setShowKeyPopover] = useState(false);

  // Fetch product-level key overrides
  const { data: overridesData } = useQuery({
    queryKey: ["product-key-overrides", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/key-overrides`);
      if (!res.ok) return { overrides: [] };
      return res.json() as Promise<{
        overrides: { attributeName: string; isKey: boolean }[];
      }>;
    },
  });

  const overrides = overridesData?.overrides ?? [];
  const overrideMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const ov of overrides) map.set(ov.attributeName, ov.isKey);
    return map;
  }, [overrides]);

  // Compute gaps
  const gaps = useMemo(() => {
    const result: HealthGap[] = [];
    for (const group of categoryGroups) {
      for (const attr of group.attributes) {
        if (!attr.bibleFieldMatch) continue;

        let effectiveIsKey = attr.isKey;
        if (overrideMap.has(attr.bibleFieldMatch)) {
          effectiveIsKey = overrideMap.get(attr.bibleFieldMatch)!;
        }

        const isRequired = attr.requirement === "Required";
        const isConditional = attr.requirement === "Conditionally Required";
        if (!isRequired && !isConditional && !effectiveIsKey) continue;

        if (attr.currentValue && attr.currentValue.trim() !== "") continue;

        let effectiveLevel: "Required" | "Conditionally Required" | "Key";
        if (isRequired) effectiveLevel = "Required";
        else if (isConditional) effectiveLevel = "Conditionally Required";
        else effectiveLevel = "Key";

        result.push({
          attributeName: attr.bibleFieldMatch,
          localLabel: attr.localLabel,
          effectiveLevel,
        });
      }
    }
    return result;
  }, [categoryGroups, overrideMap]);

  // Key override mutations
  const addKeyMutation = useMutation({
    mutationFn: async (attributeName: string) => {
      const res = await fetch(`/api/products/${productId}/key-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeName, isKey: true }),
      });
      if (!res.ok) throw new Error("Failed to add key override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-key-overrides", productId],
      });
      toast.success("Marked as Key for this product");
    },
    onError: () => toast.error("Failed to mark as Key"),
  });

  const removeKeyMutation = useMutation({
    mutationFn: async (attributeName: string) => {
      const res = await fetch(`/api/products/${productId}/key-overrides`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeName }),
      });
      if (!res.ok) throw new Error("Failed to remove key override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-key-overrides", productId],
      });
      toast.success("Key override removed");
    },
    onError: () => toast.error("Failed to remove key override"),
  });

  // All available attributes for the "add key" popover
  const allAttributes = useMemo(() => {
    const result: { name: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const group of categoryGroups) {
      for (const attr of group.attributes) {
        if (!attr.bibleFieldMatch || seen.has(attr.bibleFieldMatch)) continue;
        seen.add(attr.bibleFieldMatch);
        result.push({ name: attr.bibleFieldMatch, label: attr.localLabel });
      }
    }
    return result;
  }, [categoryGroups]);

  if (gaps.length === 0) return null;

  const required = gaps.filter((g) => g.effectiveLevel === "Required").length;
  const conditional = gaps.filter(
    (g) => g.effectiveLevel === "Conditionally Required"
  ).length;
  const key = gaps.filter((g) => g.effectiveLevel === "Key").length;

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-red-400">
            {gaps.length} Missing Attribute{gaps.length !== 1 ? "s" : ""}
          </span>
          {categoryName && (
            <span className="text-xs text-muted-foreground">
              in {categoryName}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 text-xs tabular-nums">
          {required > 0 && <span className="text-red-400">{required}R</span>}
          {conditional > 0 && (
            <span className="text-orange-400">{conditional}C</span>
          )}
          {key > 0 && <span className="text-purple-400">{key}K</span>}
        </div>
      </div>

      <div className="space-y-1">
        {gaps.map((gap, idx) => (
          <div
            key={`${gap.attributeName}-${idx}`}
            className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-red-500/5"
          >
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  gap.effectiveLevel === "Required"
                    ? "border-red-500/50 text-red-400"
                    : gap.effectiveLevel === "Conditionally Required"
                      ? "border-orange-500/50 text-orange-400"
                      : "border-purple-500/50 text-purple-400"
                }`}
              >
                {gap.effectiveLevel === "Required"
                  ? "R"
                  : gap.effectiveLevel === "Conditionally Required"
                    ? "C"
                    : "K"}
              </Badge>
              <span className="text-foreground/80">{gap.localLabel}</span>
            </div>
            <button
              onClick={() => {
                const el = document.querySelector(
                  `[data-field="${gap.attributeName}"]`
                );
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("ring-2", "ring-brand", "ring-offset-2");
                  setTimeout(() => {
                    el.classList.remove(
                      "ring-2",
                      "ring-brand",
                      "ring-offset-2"
                    );
                  }, 2000);
                }
              }}
              className="text-brand hover:underline shrink-0"
            >
              Jump to field <ArrowDown className="h-3 w-3 inline-block" />
            </button>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="pt-1 border-t border-red-500/10">
          <Popover open={showKeyPopover} onOpenChange={setShowKeyPopover}>
            <PopoverTrigger asChild>
              <button className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                <Plus className="h-3 w-3" />
                Mark another field as Key for this product
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2 max-h-60 overflow-y-auto">
              <div className="space-y-0.5">
                {allAttributes.map((attr) => {
                  const isOverridden = overrideMap.has(attr.name);
                  return (
                    <button
                      key={`${attr.name}-${attr.label}`}
                      onClick={() => {
                        if (isOverridden) {
                          removeKeyMutation.mutate(attr.name);
                        } else {
                          addKeyMutation.mutate(attr.name);
                        }
                        setShowKeyPopover(false);
                      }}
                      className="flex items-center justify-between w-full px-2 py-1.5 rounded text-xs hover:bg-muted/30"
                    >
                      <span className="truncate">{attr.label}</span>
                      {isOverridden && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-purple-500/30 text-purple-400"
                        >
                          Key <X className="h-2.5 w-2.5 ml-0.5" />
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
