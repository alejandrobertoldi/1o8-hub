import type { ProjectStatus } from "@/lib/seo-pipeline-types";

export const PROJECT_STATUSES = [
  "draft",
  "in_progress",
  "completed",
  "live",
  "deprecated",
  "archived",
] as const satisfies readonly ProjectStatus[];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "draft",
  in_progress: "in progress",
  completed: "completed",
  live: "live",
  deprecated: "deprecated",
  archived: "archived",
};

export const PROJECT_STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-500",
  in_progress: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400/70",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  live: "bg-[var(--brand-green)]/10 text-[var(--brand-green)] dark:bg-emerald-500/15 dark:text-emerald-400",
  deprecated: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

/** Statuses a person picks by hand; live/deprecated are derived from per-ASIN go-live (spec §5). */
export const MANUAL_PROJECT_STATUSES = PROJECT_STATUSES.filter(
  (s) => s !== "live" && s !== "deprecated",
) as ProjectStatus[];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function projectStatusClass(status: string): string {
  return isProjectStatus(status)
    ? PROJECT_STATUS_CLASSES[status]
    : PROJECT_STATUS_CLASSES.draft;
}

export function projectStatusLabel(status: string): string {
  return isProjectStatus(status) ? PROJECT_STATUS_LABELS[status] : status;
}

/** Hidden from “active” queues (same idea as archived). */
export function isInactiveProjectStatus(status: string): boolean {
  return status === "archived" || status === "deprecated";
}

/** Pipeline finished / shipped — not actively being worked. */
export function isDoneProjectStatus(status: string): boolean {
  return status === "completed" || status === "live";
}

/** Portal “Active” metric / list: draft + live (+ in_progress if used). */
export function isPortalActiveStatus(status: string): boolean {
  return status === "draft" || status === "live" || status === "in_progress";
}

/** Portal “Completed” metric / list: completed + deprecated (+ archived). */
export function isPortalCompletedStatus(status: string): boolean {
  return status === "completed" || status === "deprecated" || status === "archived";
}

/**
 * Portal avg progress: open pipeline work only (draft / in_progress).
 * Excludes live — already shipped at ~100% and would inflate the average.
 */
export function isPortalProgressStatus(status: string): boolean {
  return status === "draft" || status === "in_progress";
}
