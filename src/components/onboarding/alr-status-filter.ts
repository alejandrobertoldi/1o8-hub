export type AlrStatusBucket = "Active" | "Inactive" | "Incomplete" | "Other";

export const SELECTABLE_ALR_STATUSES: ReadonlyArray<Exclude<AlrStatusBucket, "Other">> = [
  "Active",
  "Inactive",
  "Incomplete",
];

export function normalizeAlrStatus(status: string | null | undefined): AlrStatusBucket {
  if (!status) return "Other";
  const trimmed = status.trim().toLowerCase();
  if (trimmed === "active") return "Active";
  if (trimmed === "inactive") return "Inactive";
  if (trimmed === "incomplete") return "Incomplete";
  return "Other";
}

export function filterRowsByStatus<T extends { status: string | null }>(
  rows: T[],
  selected: Set<AlrStatusBucket>
): T[] {
  return rows.filter((row) => {
    const bucket = normalizeAlrStatus(row.status);
    return bucket !== "Other" && selected.has(bucket);
  });
}
