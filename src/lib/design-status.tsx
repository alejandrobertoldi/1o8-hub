import { cn } from "@/lib/utils";

// ─── Canonical Design Status palette ────────────────────────────────────
//
// Single source of truth for status chip colors + sizing across every
// Design page (hub, section indexes, client detail, section detail).
//
// The reference is the Listing Images detail page (per-slot chips):
//   src/app/design/listing-images/[clientIdCode]/page.client.tsx
//
// IMPORTANT: `approved` is VIOLET (not emerald) so it is distinguishable
// from `live`. `discontinued` is ROSE (not red). Do NOT re-introduce a
// local STATUS_CONFIG in a page — import from here so the palette can
// never drift again.

export type DesignStatusValue =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "approved"
  | "live"
  | "discontinued";

export type DesignStatusMeta = {
  label: string;
  /** dot indicator background, e.g. `bg-violet-500` */
  dotClass: string;
  /** chip border + bg + text (the pill / select-trigger surface) */
  chipClass: string;
  /** surrounding frame border (used by detail-page slot frames) */
  frameClass: string;
};

export const DESIGN_STATUS_META: Record<DesignStatusValue, DesignStatusMeta> = {
  not_started: {
    label: "Not Started",
    dotClass: "bg-stone-400",
    chipClass:
      "border-stone-300 bg-stone-100 text-stone-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400",
    frameClass: "border-stone-300 dark:border-zinc-700",
  },
  in_progress: {
    label: "In Progress",
    dotClass: "bg-amber-500",
    chipClass:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400",
    frameClass: "border-amber-400 dark:border-amber-500/70",
  },
  in_review: {
    label: "In Review",
    dotClass: "bg-blue-500",
    chipClass:
      "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",
    frameClass: "border-blue-400 dark:border-blue-500/70",
  },
  approved: {
    label: "Approved",
    dotClass: "bg-violet-500",
    chipClass:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400",
    frameClass: "border-violet-400 dark:border-violet-500/70",
  },
  live: {
    label: "Live",
    dotClass: "bg-emerald-500",
    chipClass:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
    frameClass: "border-emerald-500 dark:border-emerald-500/80",
  },
  discontinued: {
    label: "Discontinued",
    dotClass: "bg-rose-500",
    chipClass:
      "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
    frameClass: "border-rose-400 dark:border-rose-500/70",
  },
};

/** The 5 values stored in the `design_status` DB enum (no `discontinued`). */
export const DESIGN_STATUS_ORDER: DesignStatusValue[] = [
  "not_started",
  "in_progress",
  "in_review",
  "approved",
  "live",
];

/** All 6 values incl. `discontinued` — used by per-slot/version detail UIs. */
export const DESIGN_STATUS_ORDER_FULL: DesignStatusValue[] = [
  ...DESIGN_STATUS_ORDER,
  "discontinued",
];

/**
 * Shared trigger/chip sizing — matches the Listing Images detail chips
 * exactly (h-5, text-[10px], px-1.5). Pages add layout classes (w-full,
 * justify-*) on top of this; never override the height/text/padding.
 */
export const STATUS_TRIGGER_CLASS =
  "data-[size=default]:h-5 text-[10px] font-bold px-1.5 py-0";

/**
 * Version-toolbar status trigger — matches the h-9 pill buttons
 * (V02 / Generate Alt Text / Remove version) on Brand Story and A+ headers.
 * Keep status color via `getStatusMeta(...).chipClass`.
 */
export const STATUS_VERSION_TRIGGER_CLASS =
  "h-9 data-[size=default]:h-9 rounded-full px-3 py-0 text-[13px] font-medium leading-none";

/** SelectItem text size used in the status dropdown menus. */
export const STATUS_MENU_ITEM_CLASS = "text-[11px]";

/** Safe lookup with `not_started` fallback for unknown/legacy values. */
export function getStatusMeta(status: string | null | undefined): DesignStatusMeta {
  return DESIGN_STATUS_META[(status ?? "") as DesignStatusValue] ?? DESIGN_STATUS_META.not_started;
}

/** Shared dot indicator. `size` defaults to the standard `size-2`. */
export function StatusDot({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full shrink-0",
        getStatusMeta(status).dotClass,
        className
      )}
    />
  );
}

/** Count chips for per-item statuses (A+ sets, listing-image slots). */
export function StatusCountChips({
  counts,
  fallbackStatus,
}: {
  counts?: Partial<Record<string, number>>;
  fallbackStatus: string;
}) {
  const entries = DESIGN_STATUS_ORDER_FULL
    .map((status) => [status, Number(counts?.[status] ?? 0)] as const)
    .filter(([, n]) => n > 0);

  if (entries.length === 0) {
    const config = getStatusMeta(fallbackStatus);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 h-5 text-[10px] font-bold",
          config.chipClass
        )}
      >
        <StatusDot status={fallbackStatus} />
        {config.label}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1 min-w-0">
      {entries.map(([status, n]) => {
        const config = getStatusMeta(status);
        return (
          <span
            key={status}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 h-5 text-[10px] font-bold tabular-nums",
              config.chipClass
            )}
          >
            <StatusDot status={status} />
            {n} {config.label}
          </span>
        );
      })}
    </div>
  );
}
