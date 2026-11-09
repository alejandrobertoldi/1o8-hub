import { describe, expect, it } from "vitest";
import { withinScope } from "./team-scope";

describe("withinScope", () => {
  it("keeps the request when everyone is visible", () => {
    expect(withinScope(null, [])).toBeUndefined();
    expect(withinScope(null, ["a"])).toEqual(["a"]);
  });
  it("defaults to the team and drops people outside it", () => {
    expect(withinScope(["a", "b"], [])).toEqual(["a", "b"]);
    expect(withinScope(["a", "b"], ["b", "z"])).toEqual(["b"]);
  });
  it("never widens to everyone when only outsiders are asked for", () => {
    expect(withinScope(["a"], ["z"])).toHaveLength(1);
    expect(withinScope(["a"], ["z"])).not.toContain("z");
  });
});
