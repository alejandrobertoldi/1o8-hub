// src/lib/onboarding/progress.test.ts
import { describe, it, expect } from "vitest";
import {
  computeOnboardingProgress,
  groupIntoSections,
  type ProgressStep,
} from "./progress";

const step = (over: Partial<ProgressStep> & { key: string }): ProgressStep => ({
  parent: null,
  status: "pending",
  ...over,
});

describe("computeOnboardingProgress", () => {
  it("returns 0/0/0 for no steps (never renders a divide-by-zero)", () => {
    expect(computeOnboardingProgress([])).toEqual({ completed: 0, total: 0, percentage: 0 });
  });

  it("counts sections, not individual steps: two full sections = 2/2/100", () => {
    const steps = [
      step({ key: "a1", parent: "A", status: "completed" }),
      step({ key: "a2", parent: "A", status: "completed" }),
      step({ key: "b1", parent: "B", status: "completed" }),
    ];
    expect(computeOnboardingProgress(steps)).toEqual({ completed: 2, total: 2, percentage: 100 });
  });

  it("a section is complete only when ALL its steps are satisfied", () => {
    const steps = [
      step({ key: "a1", parent: "A", status: "completed" }),
      step({ key: "a2", parent: "A", status: "pending" }), // A not done
      step({ key: "b1", parent: "B", status: "completed" }),
    ];
    expect(computeOnboardingProgress(steps)).toEqual({ completed: 1, total: 2, percentage: 50 });
  });

  it("optional steps do not block their section (generate_listing_sheet is optional)", () => {
    const steps = [
      step({ key: "amazon_access_request", parent: "amazon_access", status: "completed" }),
      step({ key: "generate_listing_sheet", parent: "amazon_access", status: "pending" }),
    ];
    expect(computeOnboardingProgress(steps)).toEqual({ completed: 1, total: 1, percentage: 100 });
  });

  it("a failed step keeps its section from completing", () => {
    const steps = [
      step({ key: "a1", parent: "A", status: "completed" }),
      step({ key: "a2", parent: "A", status: "failed" }),
    ];
    expect(computeOnboardingProgress(steps)).toEqual({ completed: 0, total: 1, percentage: 0 });
  });

  it("groups a parentless step under its own key", () => {
    const sections = groupIntoSections([step({ key: "solo", parent: null, status: "completed" })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("solo");
    expect(sections[0].status).toBe("completed");
  });

  it("rounds the percentage (1 of 3 sections = 33%)", () => {
    const steps = [
      step({ key: "a", parent: "A", status: "completed" }),
      step({ key: "b", parent: "B", status: "pending" }),
      step({ key: "c", parent: "C", status: "pending" }),
    ];
    expect(computeOnboardingProgress(steps).percentage).toBe(33);
  });
});

describe("groupIntoSections status", () => {
  it("marks a section in_progress when some (not all) steps are completed", () => {
    const sections = groupIntoSections([
      step({ key: "a1", parent: "A", status: "completed" }),
      step({ key: "a2", parent: "A", status: "pending" }),
    ]);
    expect(sections[0].status).toBe("in_progress");
  });

  it("sorts sections by lowest step order", () => {
    const sections = groupIntoSections([
      step({ key: "z", parent: "Z", status: "pending", order: 9 }),
      step({ key: "a", parent: "A", status: "pending", order: 1 }),
    ]);
    expect(sections.map((s) => s.key)).toEqual(["A", "Z"]);
  });
});
