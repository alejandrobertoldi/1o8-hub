import { describe, it, expect } from "vitest";
import { groupByStatus } from "./page";
import type { HubFeature } from "@/lib/db/schema";

const makeFeature = (overrides: Partial<HubFeature>): HubFeature => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Feature",
  description: "desc",
  status: "done",
  progress: 100,
  domain: "Platform",
  displayOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("groupByStatus", () => {
  it("separates features into done, in_progress, and planned buckets", () => {
    const features = [
      makeFeature({ status: "done" }),
      makeFeature({ status: "in_progress", progress: 50 }),
      makeFeature({ status: "planned", progress: 0 }),
      makeFeature({ status: "done" }),
    ];

    const result = groupByStatus(features);

    expect(result.done).toHaveLength(2);
    expect(result.in_progress).toHaveLength(1);
    expect(result.planned).toHaveLength(1);
  });

  it("returns empty arrays when no features exist", () => {
    const result = groupByStatus([]);
    expect(result.done).toHaveLength(0);
    expect(result.in_progress).toHaveLength(0);
    expect(result.planned).toHaveLength(0);
  });

  it("preserves the original feature data in each bucket", () => {
    const feature = makeFeature({ status: "in_progress", progress: 75, name: "My Feature" });
    const result = groupByStatus([feature]);
    expect(result.in_progress[0].name).toBe("My Feature");
    expect(result.in_progress[0].progress).toBe(75);
  });
});
