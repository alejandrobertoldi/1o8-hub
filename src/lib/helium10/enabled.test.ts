import { afterEach, expect, it, vi } from "vitest";
import { helium10Enabled } from "./enabled";
afterEach(() => vi.unstubAllEnvs());
it("is off unless NEXT_PUBLIC_HELIUM10_ENABLED is exactly \"true\"", () => {
  vi.stubEnv("NEXT_PUBLIC_HELIUM10_ENABLED", "");
  expect(helium10Enabled()).toBe(false);
  vi.stubEnv("NEXT_PUBLIC_HELIUM10_ENABLED", "1");
  expect(helium10Enabled()).toBe(false);
  vi.stubEnv("NEXT_PUBLIC_HELIUM10_ENABLED", "true");
  expect(helium10Enabled()).toBe(true);
});
