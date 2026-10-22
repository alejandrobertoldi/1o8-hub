"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search, Star, ChevronRight } from "lucide-react";
import { getProductFieldValue } from "@/lib/product-mapper";
import { getAttributeRequirement } from "@/lib/category-requirement";
import type { EnrichedAttribute } from "@/hooks/use-column-attributes";
import type { Product } from "@/lib/db/schema";

type QuickFilter = "all" | "empty" | "required" | "missing";

interface FieldSearchProps {
  product: Product;
  attributes: EnrichedAttribute[];
  onSelectField: (bqName: string, referenceGroup: string) => void;
}

export function FieldSearch({
  product,
  attributes,
  onSelectField,
}: FieldSearchProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<QuickFilter>("all");

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Reset filter when opening
  useEffect(() => {
    if (open) setFilter("all");
  }, [open]);

  // Pre-compute field value presence + requirement level (per product's productType)
  const enriched = useMemo(() => {
    return attributes.map((attr) => {
      const bqName = attr.bqLabel || attr.generalLabel;
      const val = getProductFieldValue(product, bqName);
      const filled =
        val !== null && val !== undefined && String(val).trim() !== "";
      const req = getAttributeRequirement(attr, product.productType);
      const isRequired =
        req === "Required" || req === "Conditionally Required";
      return { attr, bqName, filled, req, isRequired };
    });
  }, [attributes, product]);

  // Counts for filter buttons
  const counts = useMemo(() => {
    let empty = 0;
    let required = 0;
    let missing = 0;
    for (const e of enriched) {
      if (!e.filled) empty++;
      if (e.isRequired) required++;
      if (e.isRequired && !e.filled) missing++;
    }
    return { all: enriched.length, empty, required, missing };
  }, [enriched]);

  // Apply quick filter
  const filtered = useMemo(() => {
    switch (filter) {
      case "empty":
        return enriched.filter((e) => !e.filled);
      case "required":
        return enriched.filter((e) => e.isRequired);
      case "missing":
        return enriched.filter((e) => e.isRequired && !e.filled);
      default:
        return enriched;
    }
  }, [enriched, filter]);

  // Group by referenceGroup
  const grouped = useMemo(() => {
    const groups: Record<
      string,
      typeof filtered
    > = {};
    for (const entry of filtered) {
      const group = entry.attr.referenceGroup || "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    }
    return groups;
  }, [filtered]);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Find field...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          {isMac ? "\u2318" : "Ctrl+"}K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Field Search"
        description="Search across all product fields"
      >
        <CommandInput placeholder={`Search ${counts.all} fields...`} />

        {/* Quick filters */}
        <div className="flex gap-1.5 px-3 py-2 border-b">
          {(
            [
              { key: "all" as const, label: "All", count: counts.all, danger: false },
              { key: "empty" as const, label: "Empty", count: counts.empty, danger: false },
              { key: "required" as const, label: "Required", count: counts.required, danger: false },
              { key: "missing" as const, label: "Missing Req.", count: counts.missing, danger: true },
            ]
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-brand-solid text-white"
                  : f.danger
                    ? "bg-muted text-red-500 hover:bg-red-500/10"
                    : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
              <span className="tabular-nums">({f.count})</span>
            </button>
          ))}
        </div>

        <CommandList className="max-h-[400px]">
          <CommandEmpty>No fields match.</CommandEmpty>
          {Object.entries(grouped).map(([group, entries]) => (
            <CommandGroup key={group} heading={group}>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.attr.generalLabel}
                  value={`${entry.attr.generalLabel} ${entry.bqName} ${entry.attr.scLabel || ""}`}
                  onSelect={() => {
                    onSelectField(
                      entry.attr.generalLabel,
                      entry.attr.referenceGroup
                    );
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {entry.attr.isEssential && (
                        <Star className="h-3 w-3 text-brand fill-brand shrink-0" />
                      )}
                      <span className="truncate">
                        {entry.attr.generalLabel}
                      </span>
                      {entry.attr.scLabel &&
                        entry.attr.scLabel !==
                          entry.attr.generalLabel && (
                          <span className="text-xs text-muted-foreground truncate">
                            ({entry.attr.scLabel})
                          </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full ${entry.filled ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                      />
                      {entry.req &&
                        entry.req !== "Not Required" &&
                        entry.req !== "Optional" && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              entry.req === "Required"
                                ? "bg-red-500/15 text-red-600"
                                : entry.req === "Conditionally Required"
                                  ? "bg-orange-500/15 text-orange-600"
                                  : "bg-blue-500/15 text-blue-600"
                            }`}
                          >
                            {entry.req === "Conditionally Required"
                              ? "Cond."
                              : entry.req}
                          </span>
                        )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
