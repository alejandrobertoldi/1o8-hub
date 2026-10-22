import { describe, it, expect } from "vitest";
import { isMonthSettled } from "./settlement";

describe("isMonthSettled", () => {
  it("is settled when Intentwise data reaches the last calendar day of the period", () => {
    expect(isMonthSettled("2026-07-31", "2026-07-31")).toBe(true);
    expect(isMonthSettled("2026-07-31", "2026-08-01")).toBe(true);
  });

  it("is not settled when data is missing or still inside the month", () => {
    expect(isMonthSettled("2026-07-31", null)).toBe(false);
    expect(isMonthSettled("2026-07-31", "2026-07-29")).toBe(false);
  });
});
