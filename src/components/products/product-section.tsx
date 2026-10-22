"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type RequirementSummary = {
  required: number;
  conditional: number;
  preferred: number;
  optional?: number;
};

type Props = {
  title: string;
  count: number;
  populatedCount: number;
  defaultExpanded: boolean;
  children: React.ReactNode;
  /** Controlled expanded state — overrides internal state when provided */
  expanded?: boolean;
  /** Called when the user toggles the section */
  onExpandedChange?: (expanded: boolean) => void;
  /** Amazon requirement counts for collapsed summary */
  requirementSummary?: RequirementSummary;
};

export function ProductSection({
  title,
  count,
  populatedCount,
  defaultExpanded,
  children,
  expanded: controlledExpanded,
  onExpandedChange,
  requirementSummary,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  const isExpanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const toggle = () => {
    const next = !isExpanded;
    setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <div className="border border-border rounded-lg bg-card text-card-foreground overflow-hidden">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium truncate text-section-title">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {requirementSummary && (requirementSummary.required > 0 || requirementSummary.conditional > 0 || requirementSummary.preferred > 0 || (requirementSummary.optional ?? 0) > 0) && (
            <div className="flex items-center gap-1">
              {requirementSummary.required > 0 && (
                <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border bg-red-500/15 text-red-400 border-red-500/30 tabular-nums">
                  {requirementSummary.required}R
                </span>
              )}
              {requirementSummary.conditional > 0 && (
                <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border bg-orange-500/15 text-orange-400 border-orange-500/30 tabular-nums">
                  {requirementSummary.conditional}C
                </span>
              )}
              {requirementSummary.preferred > 0 && (
                <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border bg-blue-500/15 text-blue-400 border-blue-500/30 tabular-nums">
                  {requirementSummary.preferred}P
                </span>
              )}
              {(requirementSummary.optional ?? 0) > 0 && (
                <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] leading-none font-medium border bg-zinc-500/15 text-zinc-400 border-zinc-500/30 tabular-nums">
                  {requirementSummary.optional}O
                </span>
              )}
            </div>
          )}
          <Badge variant="secondary" className="text-xs shrink-0 tabular-nums">
            {populatedCount}/{count}
          </Badge>
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-border px-4 py-4 overflow-hidden">
          <div className="space-y-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
