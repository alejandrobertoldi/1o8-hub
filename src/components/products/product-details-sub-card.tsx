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
  totalCount: number;
  filledCount: number;
  requirementSummary: RequirementSummary;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function ProductDetailsSubCard({
  title,
  totalCount,
  filledCount,
  requirementSummary,
  defaultExpanded = false,
  children,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggle = () => setIsExpanded((prev) => !prev);
  const progress = totalCount > 0 ? `${filledCount}/${totalCount}` : "0/0";
  const progressPercent = totalCount > 0 ? (filledCount / totalCount) * 100 : 0;
  const hasBadges =
    requirementSummary.required > 0 ||
    requirementSummary.conditional > 0 ||
    requirementSummary.preferred > 0;

  return (
    <div className="border border-border rounded-xl bg-card text-card-foreground overflow-hidden mb-4">
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
        <div className="flex items-center gap-2 shrink-0">
          {hasBadges && (
            <div className="flex items-center gap-1">
              {requirementSummary.required > 0 && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium border bg-red-500/15 text-red-400 border-red-500/30 tabular-nums">
                  {requirementSummary.required}R
                </span>
              )}
              {requirementSummary.conditional > 0 && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium border bg-orange-500/15 text-orange-400 border-orange-500/30 tabular-nums">
                  {requirementSummary.conditional}C
                </span>
              )}
              {requirementSummary.preferred > 0 && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium border bg-blue-500/15 text-blue-400 border-blue-500/30 tabular-nums">
                  {requirementSummary.preferred}P
                </span>
              )}
            </div>
          )}
          <Badge variant="secondary" className="text-xs tabular-nums">
            {progress}
          </Badge>
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-border">
          {progressPercent > 0 && progressPercent < 100 && (
            <div className="h-1 bg-muted">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              {Array.isArray(children) ? children.map((child, i) => (
                <div key={i} className="min-h-[80px]">{child}</div>
              )) : <div className="min-h-[80px] col-span-full md:col-span-3">{children}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}