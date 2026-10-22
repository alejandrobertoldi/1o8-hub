import { describe, expect, it } from "vitest";
import { siblingShouldBecomeDiscontinued } from "./design-live-versions";

describe("siblingShouldBecomeDiscontinued", () => {
  const live = { liveVersionNumber: 2 };

  it("discontinues a previous version regardless of its current status", () => {
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 1,
        siblingStatus: "live",
      })
    ).toBe(true);
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 1,
        siblingStatus: "approved",
      })
    ).toBe(true);
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 1,
        siblingStatus: "in_progress",
      })
    ).toBe(true);
  });

  it("leaves a later in-progress version alone", () => {
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 3,
        siblingStatus: "in_progress",
      })
    ).toBe(false);
  });

  it("discontinues another currently live version even if it is later", () => {
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 3,
        siblingStatus: "live",
      })
    ).toBe(true);
  });

  it("does not rewrite an already discontinued version", () => {
    expect(
      siblingShouldBecomeDiscontinued({
        ...live,
        siblingVersionNumber: 1,
        siblingStatus: "discontinued",
      })
    ).toBe(false);
  });
});
