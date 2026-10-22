/** Readiness colors, shared by the Team board and My Dashboard. */
export const readinessBar = (pct: number) => (pct >= 85 ? "bg-emerald-500" : pct >= 70 ? "bg-brand" : "bg-red-500");
export const readinessText = (pct: number) => (pct >= 85 ? "text-emerald-500" : pct >= 70 ? "text-brand" : "text-red-500");
/** Due today = orange (needs attention, not late yet); overdue = red. */
export const DUE_TODAY_TEXT = "text-orange-500";
export const OVERDUE_TEXT = "text-red-500";
