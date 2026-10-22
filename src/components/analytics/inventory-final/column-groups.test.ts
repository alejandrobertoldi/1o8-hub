import { describe, it, expect } from "vitest";
import { parseOpenGroups } from "./column-groups";

describe("parseOpenGroups", () => {
  it("defaults to all collapsed", () => expect(parseOpenGroups(null)).toEqual([]));
  it("keeps only known ids", () => expect(parseOpenGroups('["sales","bogus","health"]')).toEqual(["sales", "health"]));
  it("survives garbage", () => expect(parseOpenGroups("{not json")).toEqual([]));
});
