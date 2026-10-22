import { describe, it, expect } from "vitest";
import { coerceMappedAnswers, extractJsonArray } from "./alexa-answer-map";

describe("extractJsonArray", () => {
  it("reads a bare JSON array", () => {
    expect(extractJsonArray('["a","b"]')).toEqual(["a", "b"]);
  });
  it("strips code fences and surrounding prose", () => {
    expect(extractJsonArray('Here you go:\n```json\n["x", "y"]\n```\nDone.')).toEqual(["x", "y"]);
  });
  it("accepts an {answers: [...]} object", () => {
    expect(extractJsonArray('{"answers": ["one", "two"]}')).toEqual(["one", "two"]);
  });
  it("returns null when there is no array", () => {
    expect(extractJsonArray("no json here")).toBeNull();
  });
});

describe("coerceMappedAnswers", () => {
  it("pads missing answers with empty strings and trims extras", () => {
    expect(coerceMappedAnswers(["a"], 3)).toEqual(["a", "", ""]);
    expect(coerceMappedAnswers(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
  });
  it("turns non-strings into strings or empty", () => {
    expect(coerceMappedAnswers([null, 42, { answer: "obj" }, "  ok  "], 4)).toEqual(["", "42", "obj", "ok"]);
  });
  it("returns all-empty for a non-array", () => {
    expect(coerceMappedAnswers("nope", 2)).toEqual(["", ""]);
  });
});
