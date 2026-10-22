import { describe, it, expect } from "vitest";
import { parseVersionFromName, planGoLive, planNotLive, deriveProjectStatus, affectedProjectIds, type AsinLiveRow } from "./asin-live";

const row = (p: Partial<AsinLiveRow>): AsinLiveRow => ({
  projectId: "P", asin: "A", status: "live", liveDate: "2026-06-02", deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1, ...p,
});

describe("parseVersionFromName", () => {
  it("reads the trailing _vNN", () => {
    expect(parseVersionFromName("REA_SC_US_01_ReadyRESCUE_v01")).toBe(1);
    expect(parseVersionFromName("TRT_SC_US_Mug_V12")).toBe(12);
  });
  it("null when there is no trailing version", () => {
    expect(parseVersionFromName("Coffee SEO")).toBeNull();
    expect(parseVersionFromName("x_v01_draft")).toBeNull();
  });
});

describe("planGoLive", () => {
  it("fresh ASIN → one live upsert, no deprecations", () => {
    const plan = planGoLive([], "P", ["A"], "2026-06-02", 1);
    expect(plan.upserts).toEqual([row({})]);
    expect(plan.deprecations).toEqual([]);
  });
  it("deprecates the other project's live row on the same ASIN only", () => {
    const existing = [row({ projectId: "Q", asin: "A" }), row({ projectId: "Q", asin: "B" })];
    const plan = planGoLive(existing, "P", ["A"], "2026-07-01", 2);
    expect(plan.deprecations).toEqual([{ projectId: "Q", asin: "A", deprecatedDate: "2026-07-01", deprecatedByProjectId: "P" }]);
    expect(plan.upserts).toEqual([row({ projectId: "P", asin: "A", liveDate: "2026-07-01", versionNumber: 2 })]);
  });
  it("re-marking an already-live pair only updates its date", () => {
    const plan = planGoLive([row({})], "P", ["A"], "2026-06-10", 1);
    expect(plan.deprecations).toEqual([]);
    expect(plan.upserts).toEqual([row({ liveDate: "2026-06-10" })]);
  });
  it("ignores already-deprecated rows of other projects", () => {
    const plan = planGoLive([row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-05-01", deprecatedByProjectId: "Z" })], "P", ["A"], "2026-06-02", 1);
    expect(plan.deprecations).toEqual([]);
  });
});

describe("planNotLive", () => {
  it("deletes own row and restores the row it deprecated", () => {
    const existing = [row({ projectId: "P" }), row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-06-02", deprecatedByProjectId: "P" })];
    expect(planNotLive(existing, "P", ["A"])).toEqual({ deletes: [{ projectId: "P", asin: "A" }], restores: [{ projectId: "Q", asin: "A" }] });
  });
  it("does NOT restore when P itself is already deprecated by a newer project (Review Focus 1)", () => {
    const existing = [
      row({ projectId: "P", status: "deprecated", deprecatedDate: "2026-08-01", deprecatedByProjectId: "R" }),
      row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-06-02", deprecatedByProjectId: "P" }),
      row({ projectId: "R", liveDate: "2026-08-01" }),
    ];
    expect(planNotLive(existing, "P", ["A"])).toEqual({ deletes: [{ projectId: "P", asin: "A" }], restores: [] });
  });
  it("no own row → nothing to do", () => {
    expect(planNotLive([row({ projectId: "Q" })], "P", ["A"])).toEqual({ deletes: [], restores: [] });
  });
  it("restores only the most recently deprecated row when P has deprecated several projects across successive go-lives (I2)", () => {
    // Q live → P live (Q deprecated by P 2026-06-02) → R live → P live again
    // (R deprecated by P 2026-08-01, P live). Now mark P not live: only R
    // (the most recently deprecated) should come back; Q must NOT, or two
    // live rows would exist for the same (client, asin).
    const existing = [
      row({ projectId: "P", liveDate: "2026-08-01" }),
      row({ projectId: "Q", status: "deprecated", deprecatedDate: "2026-06-02", deprecatedByProjectId: "P" }),
      row({ projectId: "R", status: "deprecated", deprecatedDate: "2026-08-01", deprecatedByProjectId: "P" }),
    ];
    expect(planNotLive(existing, "P", ["A"])).toEqual({ deletes: [{ projectId: "P", asin: "A" }], restores: [{ projectId: "R", asin: "A" }] });
  });
});

describe("deriveProjectStatus", () => {
  it("any live → live", () => expect(deriveProjectStatus([{ status: "deprecated" }, { status: "live" }])).toBe("live"));
  it("only deprecated → deprecated", () => expect(deriveProjectStatus([{ status: "deprecated" }])).toBe("deprecated"));
  it("no rows → completed", () => expect(deriveProjectStatus([])).toBe("completed"));
});

describe("affectedProjectIds", () => {
  it("includes the acting project and every deprecated/restored one, deduped", () => {
    const plan = planGoLive([row({ projectId: "Q" }), row({ projectId: "Q", asin: "B" })], "P", ["A", "B"], "2026-07-01", 2);
    expect(affectedProjectIds(plan, "P").sort()).toEqual(["P", "Q"]);
  });
});
