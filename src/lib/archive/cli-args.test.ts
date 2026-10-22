import { describe, it, expect } from "vitest";
import { parseLimitArg } from "@/lib/archive/cli-args";

describe("parseLimitArg", () => {
  it("returns undefined when --limit is absent", () => {
    expect(parseLimitArg(["--foo=bar"])).toBeUndefined();
  });

  it("parses a valid positive integer", () => {
    expect(parseLimitArg(["--limit=1"])).toBe(1);
    expect(parseLimitArg(["--limit=42"])).toBe(42);
  });

  it("throws on a non-numeric value instead of silently disabling the limit", () => {
    expect(() => parseLimitArg(["--limit=one"])).toThrow(/positive integer/);
  });

  it("throws on an empty value", () => {
    expect(() => parseLimitArg(["--limit="])).toThrow(/positive integer/);
  });

  it("throws on zero or negative", () => {
    expect(() => parseLimitArg(["--limit=0"])).toThrow(/positive integer/);
    expect(() => parseLimitArg(["--limit=-1"])).toThrow(/positive integer/);
  });

  it("throws on a non-integer", () => {
    expect(() => parseLimitArg(["--limit=1.5"])).toThrow(/positive integer/);
  });
});
