"use client";

import type { RequirementLevel } from "@/lib/constants";
import { REQUIREMENT_COLORS } from "@/lib/constants";

type Props = {
  breakdown: Record<string, number>;
  activeFilters: Set<RequirementLevel>;
  onToggle: (level: RequirementLevel) => void;
};

const DISPLAY_ORDER: RequirementLevel[] = [
  "Required",
  "Conditionally Required",
  "Key",
  "Recommended",
  "Optional",
];

const CHIP_LABELS: Partial<Record<RequirementLevel, string>> = {
  "Conditionally Required": "Cond.Req",
};

export function RequirementSummary({ breakdown, activeFilters, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DISPLAY_ORDER.map((level) => {
        const count = breakdown[level] || 0;
        if (count === 0) return null;
        const isActive = activeFilters.has(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => onToggle(level)}
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border transition-all cursor-pointer ${
              isActive
                ? `${REQUIREMENT_COLORS[level]} ring-2 ring-offset-1 ring-current`
                : `${REQUIREMENT_COLORS[level]} opacity-60 hover:opacity-100`
            }`}
          >
            {count} {CHIP_LABELS[level] || level}
          </button>
        );
      })}
    </div>
  );
}
