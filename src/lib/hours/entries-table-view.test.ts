import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  filterHoursEntries,
  groupHoursEntries,
  hoursSubtotalGrouping,
  nextHoursSort,
  shouldShowHoursSubtotals,
  sortHoursEntries,
  sumHours,
  uniqueCategories,
  uniqueMembers,
  type HoursViewRow,
} from "./entries-table-view";

function row(partial: Partial<HoursViewRow> & Pick<HoursViewRow, "id">): HoursViewRow {
  return {
    entryDate: "2026-08-01",
    startTime: "06:00:00",
    hours: 1,
    category: "PPC",
    userId: "u1",
    userName: "Aqib Abbasi",
    userEmail: "aqib@mf.io",
    ...partial,
  };
}

const rows: HoursViewRow[] = [
  row({ id: "a", userId: "u1", userName: "Aqib Abbasi", category: "PPC", hours: 1, startTime: "06:00:00" }),
  row({ id: "b", userId: "u2", userName: "Sohail Asghar", category: "Meetings", hours: 0.5, startTime: "07:00:00" }),
  row({ id: "c", userId: "u1", userName: "Aqib Abbasi", category: "Meetings", hours: 1.75, startTime: "08:00:00" }),
  row({ id: "d", userId: "u3", userName: "Hamid Zeb", category: null, hours: 2, startTime: "09:00:00" }),
];

describe("uniqueMembers / uniqueCategories", () => {
  it("lists members alphabetically by display name", () => {
    expect(uniqueMembers(rows).map((m) => m.id)).toEqual(["u1", "u3", "u2"]);
  });

  it("lists categories with Uncategorized last", () => {
    expect(uniqueCategories(rows)).toEqual([
      { id: "Meetings", label: "Meetings" },
      { id: "PPC", label: "PPC" },
      { id: "", label: "Uncategorized" },
    ]);
  });
});

describe("filterHoursEntries", () => {
  it("filters by team member userId", () => {
    expect(filterHoursEntries(rows, ["u1"], []).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("filters by category including uncategorized", () => {
    expect(filterHoursEntries(rows, [], [""]).map((r) => r.id)).toEqual(["d"]);
    expect(filterHoursEntries(rows, [], ["Meetings"]).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("ANDs member and category filters", () => {
    expect(filterHoursEntries(rows, ["u1"], ["Meetings"]).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("sortHoursEntries", () => {
  it("returns the same array when no sort column is set", () => {
    expect(sortHoursEntries(rows, null, "asc")).toBe(rows);
  });

  it("sorts by member and keeps date/start order within a group", () => {
    const sorted = sortHoursEntries(rows, "member", "asc");
    expect(sorted.map((r) => r.id)).toEqual(["a", "c", "d", "b"]);
  });

  it("reverses only the group key on desc, not within-group time order", () => {
    const sorted = sortHoursEntries(rows, "member", "desc");
    expect(sorted.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts uncategorized last alphabetically by label Uncategorized", () => {
    const sorted = sortHoursEntries(rows, "category", "asc");
    expect(sorted.map((r) => categoryLabel(r))).toEqual([
      "Meetings",
      "Meetings",
      "PPC",
      "Uncategorized",
    ]);
  });
});

describe("groupHoursEntries / sumHours", () => {
  it("groups consecutive appearance order after a member sort", () => {
    const sorted = sortHoursEntries(rows, "member", "asc");
    const groups = groupHoursEntries(sorted, "member");
    expect(groups.map((g) => [g.label, g.hours, g.rows.length])).toEqual([
      ["Aqib Abbasi", 2.75, 2],
      ["Hamid Zeb", 2, 1],
      ["Sohail Asghar", 0.5, 1],
    ]);
  });

  it("sums hours across all rows", () => {
    expect(sumHours(rows)).toBe(5.25);
  });
});

describe("subtotal visibility", () => {
  it("shows subtotals when a member/category sort or filter is active", () => {
    expect(shouldShowHoursSubtotals(null, [], [])).toBe(false);
    expect(shouldShowHoursSubtotals("member", [], [])).toBe(true);
    expect(shouldShowHoursSubtotals(null, ["u1"], [])).toBe(true);
    expect(shouldShowHoursSubtotals(null, [], ["PPC"])).toBe(true);
  });

  it("prefers the active sort column for grouping", () => {
    expect(hoursSubtotalGrouping("category", ["u1"], [], true)).toBe("category");
  });

  it("groups by the single active filter dimension when unsorted", () => {
    expect(hoursSubtotalGrouping(null, ["u1"], [], true)).toBe("member");
    expect(hoursSubtotalGrouping(null, [], ["PPC"], true)).toBe("category");
  });
});

describe("nextHoursSort", () => {
  it("cycles none → asc → desc → none", () => {
    expect(nextHoursSort(null, "asc", "member")).toEqual({ col: "member", dir: "asc" });
    expect(nextHoursSort("member", "asc", "member")).toEqual({ col: "member", dir: "desc" });
    expect(nextHoursSort("member", "desc", "member")).toEqual({ col: null, dir: "asc" });
    expect(nextHoursSort("member", "asc", "category")).toEqual({ col: "category", dir: "asc" });
  });
});
