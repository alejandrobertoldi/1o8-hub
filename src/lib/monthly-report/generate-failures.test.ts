import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { GENERATE_FAILURE_CAP, isCapped } from "./generate-failures";

describe("generation failure cap", () => {
  it("caps at 3", () => {
    expect(GENERATE_FAILURE_CAP).toBe(3);
    expect([0, 1, 2, 3, 4].map(isCapped)).toEqual([false, false, false, true, true]);
  });
});
