import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTrailingRange } from "./trailing-range-picker";

describe("useTrailingRange", () => {
  it("defaults to the 365-day preset", () => {
    expect(renderHook(() => useTrailingRange()).result.current.preset).toBe("365");
  });
  it("opens in custom mode on an initial range", () => {
    const { result } = renderHook(() => useTrailingRange({ start: "2026-08-01", end: "2026-08-31" }));
    expect(result.current).toMatchObject({ preset: "custom", start: "2026-08-01", end: "2026-08-31" });
  });
});
