import { describe, it, expect } from "vitest";
import { isPrintCrashScreen } from "./pdf-render";

describe("isPrintCrashScreen", () => {
  it("detects the Next.js uncaught-exception page", () => {
    expect(isPrintCrashScreen(
      "Application error: a client-side exception has occurred while loading localhost",
    )).toBe(true);
  });

  it("does not treat a healthy report (or the always-on dev portal) as a crash", () => {
    expect(isPrintCrashScreen("Poochie Butter · Performance\nMonthly Performance Report\nJuly 2026")).toBe(false);
  });
});
