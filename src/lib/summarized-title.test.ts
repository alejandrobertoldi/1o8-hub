import { describe, it, expect } from "vitest";
import { splitSummarizedTitle } from "./summarized-title";

describe("splitSummarizedTitle", () => {
  it("splits name and variation at the first pipe", () => {
    expect(splitSummarizedTitle("ReadyRESCUE | 30 g (Pack of 12)")).toEqual({ name: "ReadyRESCUE", variant: "30 g (Pack of 12)" });
  });
  it("keeps later pipes inside the variation", () => {
    expect(splitSummarizedTitle("Tacos | Salsa | Hot")).toEqual({ name: "Tacos", variant: "Salsa | Hot" });
  });
  it("a title without a pipe is all name", () => {
    expect(splitSummarizedTitle("Dog First Aid Kit")).toEqual({ name: "Dog First Aid Kit", variant: "" });
  });
  it("empty or missing titles render nothing", () => {
    expect(splitSummarizedTitle("")).toBeNull();
    expect(splitSummarizedTitle("   ")).toBeNull();
    expect(splitSummarizedTitle(null)).toBeNull();
  });
  it("a leading pipe does not produce an empty name", () => {
    expect(splitSummarizedTitle("| 30 g")).toEqual({ name: "30 g", variant: "" });
  });
});
