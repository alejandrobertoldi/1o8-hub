import { describe, expect, it, vi } from "vitest";

// We'll extract the resolution logic into a pure helper for testability.
import { resolveClientAllowedSections } from "./auth-helpers";

describe("resolveClientAllowedSections", () => {
  it("returns empty when user has no clientIdCode", async () => {
    const fetchRows = vi.fn().mockResolvedValue([]);
    const result = await resolveClientAllowedSections(null, fetchRows);
    expect(result).toEqual([]);
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it("unions allowed_sections across multiple assigned clients", async () => {
    const fetchRows = vi.fn().mockResolvedValue([
      { allowedSections: ["timeline", "sales"] },
      { allowedSections: ["sales", "aplus"] },
    ]);
    const result = await resolveClientAllowedSections("C1,C2", fetchRows);
    expect(new Set(result)).toEqual(new Set(["timeline", "sales", "aplus"]));
    expect(fetchRows).toHaveBeenCalledWith(["C1", "C2"]);
  });

  it("trims and deduplicates client codes", async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ allowedSections: ["timeline"] }]);
    await resolveClientAllowedSections("  C1 , C1 ", fetchRows);
    expect(fetchRows).toHaveBeenCalledWith(["C1"]);
  });

  it("returns empty when all codes are blank", async () => {
    const fetchRows = vi.fn().mockResolvedValue([]);
    const result = await resolveClientAllowedSections(" , , ", fetchRows);
    expect(result).toEqual([]);
    expect(fetchRows).not.toHaveBeenCalled();
  });
});
