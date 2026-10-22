/** View-model helpers for HoursEntriesTable filter / sort / subtotals. */

export type HoursViewRow = {
  id: string;
  entryDate?: string;
  startTime: string;
  hours: number;
  category: string | null;
  userId: string;
  userName: string | null;
  userEmail: string;
};

export type HoursSortCol = "member" | "category";
export type HoursSortDir = "asc" | "desc";

export type HoursGroup<T extends HoursViewRow = HoursViewRow> = {
  key: string;
  label: string;
  hours: number;
  rows: T[];
};

export const UNCATEGORIZED_KEY = "";
export const UNCATEGORIZED_LABEL = "Uncategorized";

export function memberLabel(row: HoursViewRow): string {
  const name = row.userName?.trim();
  return name ? name : row.userEmail;
}

export function categoryKey(row: HoursViewRow): string {
  return row.category?.trim() ?? UNCATEGORIZED_KEY;
}

export function categoryLabel(row: HoursViewRow): string {
  const key = categoryKey(row);
  return key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : key;
}

export function uniqueMembers<T extends HoursViewRow>(rows: T[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, memberLabel(row));
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function uniqueCategories<T extends HoursViewRow>(rows: T[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = categoryKey(row);
    if (!map.has(id)) map.set(id, categoryLabel(row));
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => {
      if (a.id === UNCATEGORIZED_KEY) return 1;
      if (b.id === UNCATEGORIZED_KEY) return -1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
}

export function filterHoursEntries<T extends HoursViewRow>(
  rows: T[],
  memberIds: string[],
  categories: string[],
): T[] {
  return rows.filter((row) => {
    if (memberIds.length > 0 && !memberIds.includes(row.userId)) return false;
    if (categories.length > 0 && !categories.includes(categoryKey(row))) return false;
    return true;
  });
}

function secondaryCompare<T extends HoursViewRow>(a: T, b: T): number {
  const byDate = (a.entryDate ?? "").localeCompare(b.entryDate ?? "");
  if (byDate !== 0) return byDate;
  const byStart = a.startTime.localeCompare(b.startTime);
  if (byStart !== 0) return byStart;
  return memberLabel(a).localeCompare(memberLabel(b), undefined, { sensitivity: "base" });
}

export function sortHoursEntries<T extends HoursViewRow>(
  rows: T[],
  col: HoursSortCol | null,
  dir: HoursSortDir,
): T[] {
  if (!col) return rows;
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = col === "member" ? memberLabel(a) : categoryLabel(a);
    const bv = col === "member" ? memberLabel(b) : categoryLabel(b);
    const primary = av.localeCompare(bv, undefined, { sensitivity: "base" });
    if (primary !== 0) return primary * mul;
    return secondaryCompare(a, b);
  });
}

export function sumHours<T extends HoursViewRow>(rows: T[]): number {
  return rows.reduce((acc, row) => acc + row.hours, 0);
}

export function groupHoursEntries<T extends HoursViewRow>(
  rows: T[],
  by: HoursSortCol,
): HoursGroup<T>[] {
  const map = new Map<string, HoursGroup<T>>();
  const order: string[] = [];
  for (const row of rows) {
    const key = by === "member" ? row.userId : categoryKey(row);
    const label = by === "member" ? memberLabel(row) : categoryLabel(row);
    let group = map.get(key);
    if (!group) {
      group = { key, label, hours: 0, rows: [] };
      map.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
    group.hours += row.hours;
  }
  return order.map((key) => map.get(key)!);
}

export function shouldShowHoursSubtotals(
  sortCol: HoursSortCol | null,
  memberFilter: string[],
  categoryFilter: string[],
): boolean {
  return sortCol !== null || memberFilter.length > 0 || categoryFilter.length > 0;
}

export function hoursSubtotalGrouping(
  sortCol: HoursSortCol | null,
  memberFilter: string[],
  categoryFilter: string[],
  showMember: boolean,
): HoursSortCol | null {
  if (!shouldShowHoursSubtotals(sortCol, memberFilter, categoryFilter)) return null;
  if (sortCol) return sortCol;
  if (memberFilter.length > 0 && categoryFilter.length === 0 && showMember) return "member";
  if (categoryFilter.length > 0 && memberFilter.length === 0) return "category";
  if (showMember) return "member";
  return "category";
}

export function nextHoursSort(
  currentCol: HoursSortCol | null,
  currentDir: HoursSortDir,
  clicked: HoursSortCol,
): { col: HoursSortCol | null; dir: HoursSortDir } {
  if (currentCol !== clicked) return { col: clicked, dir: "asc" };
  if (currentDir === "asc") return { col: clicked, dir: "desc" };
  return { col: null, dir: "asc" };
}
