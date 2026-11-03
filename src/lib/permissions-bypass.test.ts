import { describe, expect, it } from "vitest";
import { canAccessAs, sectionBypass } from "./permissions";

describe("sectionBypass / canAccessAs", () => {
  it("gives owners every section", () => {
    expect(canAccessAs("owner", [], "activity")).toBe(true);
    expect(canAccessAs("owner", [], "new-business")).toBe(true);
  });
  it("makes super admins and admins follow their hub-section checkboxes", () => {
    expect(canAccessAs("admin", [], "activity")).toBe(false);
    expect(canAccessAs("admin", ["activity"], "activity")).toBe(true);
    expect(canAccessAs("super_admin", ["calendar"], "new-business")).toBe(false);
  });
  it("keeps the admin bypass for the admin tools outside the hub columns", () => {
    expect(sectionBypass("admin", "publish")).toBe(true);
    expect(sectionBypass("super_admin", "import")).toBe(true);
    expect(sectionBypass("editor", "publish")).toBe(false);
  });
  it("never bypasses for editors and below", () => {
    expect(canAccessAs("editor", [], "calendar")).toBe(false);
    expect(canAccessAs("editor", ["calendar"], "calendar")).toBe(true);
  });
});
