import { describe, expect, it } from "vitest";
import { buildGeographyQuery, parseGeographyView } from "./geography-view";

describe("parseGeographyView", () => {
  it("accepts the three views", () => {
    expect(parseGeographyView("orders")).toBe("orders");
    expect(parseGeographyView("inventory")).toBe("inventory");
    expect(parseGeographyView("both")).toBe("both");
  });
  it("missing or invalid → orders", () => {
    expect(parseGeographyView(null)).toBe("orders");
    expect(parseGeographyView("foo")).toBe("orders");
    expect(parseGeographyView("")).toBe("orders");
  });
});

describe("buildGeographyQuery", () => {
  it("orders view with a preset range writes nothing", () => {
    expect(buildGeographyQuery("", { view: "orders", start: null, end: null, month: null })).toBe("");
  });
  it("writes view, custom range and month", () => {
    expect(buildGeographyQuery("", { view: "both", start: "2026-07-01", end: "2026-09-30", month: "2026-08" }))
      .toBe("view=both&start=2026-07-01&end=2026-09-30&month=2026-08");
  });
  it("preserves params it does not own and deletes its own when cleared", () => {
    expect(buildGeographyQuery("accountId=42&view=both&month=2026-08", { view: "orders", start: null, end: null, month: null }))
      .toBe("accountId=42");
  });
  it("orders view never writes month", () => {
    expect(buildGeographyQuery("", { view: "orders", start: null, end: null, month: "2026-08" })).toBe("");
  });
});
