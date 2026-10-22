"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Package,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  Circle,
} from "lucide-react";
import {
  useCategoryDefinition,
  type CategoryAttributeData,
  type CategoryGroupData,
} from "@/hooks/use-category-definition";
import { CategoryUpload, CategoryUploadButton } from "./category-upload";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product } from "@/lib/db/schema";

type FilterType = "all" | "required" | "conditional" | "matched" | "unmatched" | "filled" | "empty";

interface AmazonCategoryAttributesProps {
  productType: string;
  product: Product;
  clientIdCode?: string;
  marketplaceId?: string;
  excludeFields?: Set<string>;
  excludeGroups?: Set<string>;
}

interface GroupStats {
  total: number;
  required: number;
  conditional: number;
  optional: number;
  key: number;
  matched: number;
  filled: number;
}

function computeGroupStats(attrs: CategoryAttributeData[]): GroupStats {
  let required = 0, conditional = 0, optional = 0, key = 0, matched = 0, filled = 0;
  for (const a of attrs) {
    if (a.requirement === "Required") required++;
    else if (a.requirement === "Conditionally Required") conditional++;
    else optional++;
    if (a.isKey) key++;
    if (a.bibleFieldMatch) matched++;
    if (a.currentValue) filled++;
  }
  return { total: attrs.length, required, conditional, optional, key, matched, filled };
}

export function AmazonCategoryAttributes({
  productType,
  product,
  clientIdCode,
  marketplaceId,
  excludeFields,
  excludeGroups,
}: AmazonCategoryAttributesProps) {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const [filter, setFilter] = useState<FilterType>("all");

  const { definition, groups, isLoading } = useCategoryDefinition(
    productType,
    clientIdCode,
    product.id,
    marketplaceId
  );

  // Pre-filter excluded fields and groups
  const baseGroups = useMemo(() => {
    let filtered = groups;
    if (excludeGroups && excludeGroups.size > 0) {
      const exLower = new Set([...excludeGroups].map((g) => g.toLowerCase()));
      filtered = filtered.filter((g) => !exLower.has(g.name.toLowerCase()));
    }
    if (!excludeFields || excludeFields.size === 0) return filtered;
    // Build a lowercase lookup for case-insensitive matching
    const excludeLower = new Set<string>();
    for (const f of excludeFields) excludeLower.add(f.toLowerCase());
    return filtered
      .map((g) => ({
        ...g,
        attributes: g.attributes.filter((a) => {
          // Check Hub field match
          if (a.bibleFieldMatch && excludeFields.has(a.bibleFieldMatch)) return false;
          // Also check the Amazon attribute name (strip marketplace/index suffixes, normalize)
          const amzBase = a.amazonFieldName.replace(/\[.*$/, "").replace(/#.*$/, "").toLowerCase();
          if (excludeLower.has(amzBase)) return false;
          if (excludeLower.has(amzBase.replace(/[\s_-]/g, ""))) return false;
          if (a.localLabel) {
            const labelNorm = a.localLabel.replace(/[\s_-]/g, "").toLowerCase();
            if (excludeLower.has(labelNorm)) return false;
          }
          return true;
        }),
      }))
      .filter((g) => g.attributes.length > 0);
  }, [groups, excludeFields, excludeGroups]);

  // Overall stats
  const overall = useMemo(() => {
    const all = baseGroups.flatMap((g) => g.attributes);
    return computeGroupStats(all);
  }, [baseGroups]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (filter === "all") return baseGroups;

    return baseGroups
      .map((group) => ({
        ...group,
        attributes: group.attributes.filter((attr) => {
          switch (filter) {
            case "required":
              return attr.requirement === "Required";
            case "conditional":
              return attr.requirement === "Conditionally Required";
            case "matched":
              return !!attr.bibleFieldMatch;
            case "unmatched":
              return !attr.bibleFieldMatch;
            case "filled":
              return !!attr.currentValue;
            case "empty":
              return attr.bibleFieldMatch && !attr.currentValue;
            default:
              return true;
          }
        }),
      }))
      .filter((g) => g.attributes.length > 0);
  }, [groups, filter]);

  if (!clientIdCode) return null;

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 bg-card rounded-lg hover:bg-muted transition-colors">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-brand" />
          <span className="text-sm font-medium text-white">
            Amazon Category: {productType}
          </span>
          {definition && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {overall.filled}/{overall.matched} filled
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {definition && (
            <span className="text-xs text-muted-foreground">
              {definition.totalAttributes} attrs
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !definition ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No category report uploaded for {productType}.
              </p>
              {isAdmin && <CategoryUpload clientIdCode={clientIdCode} />}
            </div>
          ) : (
            <>
              {/* ── Overall summary ── */}
              <div className="space-y-3">
                {/* Stats row */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {definition.totalAttributes} attributes
                    </span>
                    <span className="text-red-400 font-medium">
                      {overall.required} Required
                    </span>
                    <span className="text-amber-400 font-medium">
                      {overall.conditional} Conditional
                    </span>
                    <span className="text-muted-foreground">
                      {overall.optional} Optional
                    </span>
                    <span className="text-border">|</span>
                    <span className="text-emerald-400">
                      {overall.matched} mapped
                    </span>
                    <span className="text-brand">
                      {overall.filled} filled
                    </span>
                  </div>
                  {isAdmin && (
                    <CategoryUploadButton clientIdCode={clientIdCode} />
                  )}
                </div>

                {/* Coverage bars */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <CoverageBar
                    label="Hub field mapping"
                    filled={overall.matched}
                    total={overall.total}
                    color="bg-emerald-500"
                  />
                  <CoverageBar
                    label="Required fields filled"
                    filled={overall.filled}
                    total={overall.matched}
                    color="bg-brand"
                  />
                </div>
              </div>

              {/* ── Filter chips ── */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["all", "All", null],
                    ["required", "Required", overall.required],
                    ["conditional", "Conditional", overall.conditional],
                    ["matched", "Mapped", overall.matched],
                    ["unmatched", "Unmapped", overall.total - overall.matched],
                    ["filled", "Filled", overall.filled],
                    ["empty", "Empty", overall.matched - overall.filled],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      filter === key
                        ? "bg-brand-solid text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    {count !== null && (
                      <span className="ml-1 opacity-70">{count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Groups (Template tab order) ── */}
              <div className="space-y-1.5">
                {filteredGroups.map((group) => (
                  <GroupSection key={group.name} group={group} />
                ))}
                {filteredGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No attributes match the current filter.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Group section ──────────────────────────────────────────────────

function GroupSection({ group }: { group: CategoryGroupData }) {
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => computeGroupStats(group.attributes), [group.attributes]);

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 min-w-0 truncate">
          {group.name}
        </span>

        {/* Inline stats */}
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          {stats.required > 0 && (
            <span className="text-red-400">{stats.required}R</span>
          )}
          {stats.conditional > 0 && (
            <span className="text-amber-400">{stats.conditional}C</span>
          )}
          <span className="text-emerald-400">{stats.matched}/{stats.total}</span>
          {/* Mini coverage bar */}
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: stats.total > 0 ? `${(stats.matched / stats.total) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/50">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider border-b border-border/30">
            <span>Label / Amazon Field</span>
            <span className="w-16 text-center">Level</span>
            <span className="w-24 text-center">Hub Match</span>
            <span className="w-20 text-center">Value</span>
          </div>
          {group.attributes.map((attr) => (
            <AttributeRow key={attr.amazonFieldName} attr={attr} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Attribute row ──────────────────────────────────────────────────

function AttributeRow({ attr }: { attr: CategoryAttributeData }) {
  const [expanded, setExpanded] = useState(false);
  const hasValue = !!attr.currentValue;
  const hasMatch = !!attr.bibleFieldMatch;

  return (
    <div className="border-b border-border/20 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center w-full px-3 py-1.5 text-left hover:bg-muted/20 transition-colors"
      >
        {/* Label + Amazon field */}
        <div className="min-w-0">
          <div className="text-xs truncate">{attr.localLabel}</div>
          <div className="text-[10px] text-orange-400/50 font-mono truncate">
            {attr.amazonFieldName}
          </div>
        </div>

        {/* Requirement */}
        <div className="w-16 flex justify-center">
          <RequirementBadge requirement={attr.requirement} />
        </div>

        {/* Hub match */}
        <div className="w-24 flex justify-center">
          {hasMatch ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 truncate max-w-full">
              <Check className="h-3 w-3 shrink-0" />
              <span className="truncate">{attr.bibleFieldMatch}</span>
            </span>
          ) : (
            <Minus className="h-3 w-3 text-muted-foreground/30" />
          )}
        </div>

        {/* Current value indicator */}
        <div className="w-20 flex justify-center">
          {hasMatch ? (
            hasValue ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Circle className="h-2 w-2 fill-emerald-400" />
                      Filled
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs break-words">{attr.currentValue}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <Circle className="h-2 w-2" />
                Empty
              </span>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground/30">—</span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 ml-3 border-l-2 border-border/30 space-y-1.5 text-xs">
          {attr.description && (
            <p className="text-foreground/70">
              <span className="text-muted-foreground font-medium">Description: </span>
              {attr.description}
            </p>
          )}
          {attr.example && (
            <p>
              <span className="text-muted-foreground font-medium">Example: </span>
              <span className="font-mono text-foreground/60">{attr.example}</span>
            </p>
          )}
          {attr.validValues && attr.validValues.length > 0 && (
            <div>
              <span className="text-muted-foreground font-medium">
                Valid values ({attr.validValues.length}):
              </span>
              <div className="mt-1 max-h-24 overflow-y-auto flex flex-wrap gap-1">
                {attr.validValues.map((v) => (
                  <span
                    key={v}
                    className="inline-block px-1.5 py-0.5 bg-muted rounded text-[10px] text-foreground/60"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasMatch && hasValue && (
            <p className="text-foreground/70">
              <span className="text-muted-foreground font-medium">Current value: </span>
              <span className="break-words">{attr.currentValue}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function CoverageBar({
  label,
  filled,
  total,
  color,
}: {
  label: string;
  filled: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {filled}/{total}{" "}
          <span className="text-muted-foreground/60">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RequirementBadge({ requirement }: { requirement: string }) {
  switch (requirement) {
    case "Required":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-1 py-0 border-red-500/50 text-red-400"
        >
          Req
        </Badge>
      );
    case "Conditionally Required":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-1 py-0 border-amber-500/50 text-amber-400"
        >
          Cond
        </Badge>
      );
    case "Recommended":
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-1 py-0 border-blue-500/50 text-blue-400"
        >
          Rec
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="text-[11px] px-1 py-0 border-border text-muted-foreground/50"
        >
          Opt
        </Badge>
      );
  }
}
