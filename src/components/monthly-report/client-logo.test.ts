import { describe, it, expect } from "vitest";
import { clientLogoSrc } from "./client-logo";

describe("clientLogoSrc", () => {
  it("resolves the Drive-backed client-logos path from the AAC code", () => {
    expect(clientLogoSrc("POO_SC_US")).toBe("/client-logos/POO_SC_US.png");
  });

  it("returns null when there is no code", () => {
    expect(clientLogoSrc()).toBeNull();
    expect(clientLogoSrc(null)).toBeNull();
  });
});
