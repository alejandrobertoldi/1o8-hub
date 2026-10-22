// ═══════════════════════════════════════════════════════════════
// Shared onboarding-progress computation.
//
// Both the onboarding SUMMARY page (/onboarding) and the per-client
// DETAIL page (/clients/[code]/onboarding) must report the SAME
// progress numbers for a client. Historically each page had its own
// inline copy of this logic, which is how the two views could drift.
// This module is the single source of truth for section grouping and
// progress math — import it from both pages.
// ═══════════════════════════════════════════════════════════════

import { isStepSatisfied } from "./steps";

/** Minimal shape needed to compute progress. Both pages' step types satisfy this. */
export interface ProgressStep {
  key: string;
  parent: string | null;
  status: "pending" | "in_progress" | "completed" | "failed" | string;
  order?: number;
}

export type SectionStatus = "pending" | "in_progress" | "completed" | "failed";

export interface OnboardingSection<S extends ProgressStep> {
  /** Parent-group key (or the step's own key when it has no parent). */
  key: string;
  steps: S[];
  status: SectionStatus;
  /** Lowest step order in the section — used to sort sections for display. */
  order: number;
}

/**
 * Group steps into their parent sections and derive each section's status.
 *
 * A section is:
 *  - "completed"   when every step is satisfied (completed, or an optional step)
 *  - "failed"      when any step failed
 *  - "in_progress" when any step is completed or in progress (but not all done)
 *  - "pending"     otherwise
 *
 * Sections are returned sorted by their lowest step order.
 */
export function groupIntoSections<S extends ProgressStep>(steps: S[]): OnboardingSection<S>[] {
  const groups = new Map<string, S[]>();
  for (const s of steps) {
    const key = s.parent ?? s.key;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }

  return Array.from(groups.entries())
    .map(([key, groupSteps]) => {
      const status: SectionStatus = groupSteps.every(isStepSatisfied)
        ? "completed"
        : groupSteps.some((s) => s.status === "failed")
          ? "failed"
          : groupSteps.some((s) => s.status === "in_progress" || s.status === "completed")
            ? "in_progress"
            : "pending";
      const order = groupSteps.reduce(
        (min, s) => (s.order != null && s.order < min ? s.order : min),
        groupSteps[0]?.order ?? 0
      );
      return { key, steps: groupSteps, status, order };
    })
    .sort((a, b) => a.order - b.order);
}

export interface OnboardingProgress {
  completed: number;
  total: number;
  percentage: number;
}

/** Section-level progress: how many parent sections are fully complete out of the total. */
export function computeOnboardingProgress(steps: ProgressStep[]): OnboardingProgress {
  const sections = groupIntoSections(steps);
  const completed = sections.filter((s) => s.status === "completed").length;
  const total = sections.length;
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
