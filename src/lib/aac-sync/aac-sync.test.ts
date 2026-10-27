import { describe, expect, it } from "vitest";
import { columnForKey, columnLetter, duplicateCodes, hubValue, parseSheet } from "./columns";
import { mergeCell } from "./merge";

const svc = Array.from({ length: 30 }, (_, i) => (i === 0 ? "SEO" : i === 6 || i === 12 ? "Strategy" : `S${i}`));
const header = ["ClientStatus", "MasterAACRow", "ClientName", "ClientIDCode - ASANA", "AccountManager1_1o8", "Estimated Hours\nTOTAL", ...svc, "BrandURL", "Dashboard", "Billingemail1", "Main KPI"];
const grid = [
  [],
  ["", "", "", "", "", "", "SERVICES"],
  header,
  ["Active", "1", "K9 Sport Sack", "KSS", "Barbara McDonald", "100", "SEO", ...Array(29).fill(""), "https://k9.com/", "https://dash", "aaron@k9.com", "Net Sales"],
  ["Active", "35", "AAF - Reflexology"],
  ["", "", ""],
];

describe("parseSheet", () => {
  const p = parseSheet(grid);
  it("finds the header row and maps columns by name", () => {
    expect(p.headerRow).toBe(3);
    const keys = p.columns.map((c) => c.key);
    expect(keys).toContain("Main KPI");
    expect(keys).toContain("Estimated Hours TOTAL");
    expect(keys).toContain("AccountManager_MF"); // alias is what the hub edits
    expect(keys).toContain("Billingemail1"); // header is what the hub edits here
    expect(keys).toContain("DashboardURL");
  });
  it("namespaces the services block and numbers repeats", () => {
    const keys = p.columns.map((c) => c.key);
    expect(keys).toContain("Service: SEO");
    expect(keys).toContain("Service: Strategy");
    expect(keys).toContain("Service: Strategy (2)");
  });
  it("reads rows with their sheet row number; blank names are skipped", () => {
    expect(p.rows.map((r) => [r.rowNumber, r.code, r.name])).toEqual([
      [4, "KSS", "K9 Sport Sack"],
      [5, "", "AAF - Reflexology"],
    ]);
    expect(p.rows[0].values["AccountManager_MF"]).toBe("Barbara McDonald");
    expect(p.rows[0].values["Main KPI"]).toBe("Net Sales");
  });
  it("reads the hub value through mirrors and maps edited keys back to columns", () => {
    const am = p.columns.find((c) => c.key === "AccountManager_MF")!;
    expect(hubValue({ AccountManager1_1o8: "Old" }, am)).toBe("Old");
    expect(hubValue({ AccountManager_MF: "New", AccountManager1_1o8: "Old" }, am)).toBe("New");
    expect(columnForKey(p.columns, "AccountManager1_1o8")?.header).toBe("AccountManager1_1o8");
    expect(columnForKey(p.columns, "BillingEmail1")?.key).toBe("Billingemail1");
    expect(columnForKey(p.columns, "FigmaInternalURL")).toBeUndefined();
  });
  it("letters columns like the sheet", () => {
    expect([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(76)]).toEqual(["A", "Z", "AA", "BY"]);
  });
});

describe("duplicateCodes", () => {
  it("lists every row of a code used twice (case-insensitive), and nothing else", () => {
    const g = [...grid.slice(0, 4), ["Active", "37", "Koios", "KOI"], ["Inactive", "79", "KOIOS", "koi "]];
    const d = duplicateCodes(parseSheet(g).rows);
    expect([...d.keys()]).toEqual(["KOI"]);
    expect(d.get("KOI")!.map((r) => r.rowNumber)).toEqual([5, 6]);
  });
});

describe("mergeCell", () => {
  it("does nothing when both sides agree", () => {
    expect(mergeCell({ sheet: "a", hub: "a ", base: "x" })).toEqual({ action: "none" });
  });
  it("takes the side that moved away from the last sync", () => {
    expect(mergeCell({ sheet: "new", hub: "old", base: "old" })).toEqual({ action: "toHub", value: "new" });
    expect(mergeCell({ sheet: "old", hub: "new", base: "old" })).toEqual({ action: "toSheet", value: "new" });
  });
  it("resolves conflicts to the hub, or to the sheet when its own edit triggered the sync", () => {
    expect(mergeCell({ sheet: "s", hub: "h", base: "b" })).toEqual({ action: "toSheet", value: "h", conflict: true });
    expect(mergeCell({ sheet: "s", hub: "h", base: "b", prefer: "sheet" })).toEqual({ action: "toHub", value: "s", conflict: true });
  });
  it("first sync: the sheet wins unless the hub has a logged edit", () => {
    expect(mergeCell({ sheet: "s", hub: "h", base: undefined })).toEqual({ action: "toHub", value: "s" });
    expect(mergeCell({ sheet: "s", hub: "h", base: undefined, hubEdited: true })).toEqual({ action: "toSheet", value: "h" });
  });
});
