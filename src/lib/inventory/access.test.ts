import { describe, it, expect } from "vitest";
import { canEditRecs, recReadScope } from "./access";

describe("canEditRecs", () => {
  it.each([["owner", true], ["super_admin", true], ["admin", true], ["editor", true],
    ["viewer", false], ["client", false], ["pending", false], [undefined, false]])(
    "%s -> %s", (role, ok) => expect(canEditRecs(role ? { role } : undefined)).toBe(ok));
});

describe("recReadScope", () => {
  it("hub staff read any client", () => {
    expect(recReadScope({ role: "viewer" }, "POO_SC_US")).toBe("hub");
  });
  it("clients read only their own codes (multi-code aware)", () => {
    const u = { role: "client", clientIdCode: "TRT_SC_US, TRS_SC_US" };
    expect(recReadScope(u, "TRS_SC_US")).toBe("portal");
    expect(recReadScope(u, "POO_SC_US")).toBeNull();
  });
  it("prospects behave like clients; pending gets nothing", () => {
    expect(recReadScope({ role: "prospect", clientIdCode: "A_1" }, "A_1")).toBe("portal");
    expect(recReadScope({ role: "pending", clientIdCode: "A_1" }, "A_1")).toBeNull();
    expect(recReadScope(undefined, "A_1")).toBeNull();
  });
});
