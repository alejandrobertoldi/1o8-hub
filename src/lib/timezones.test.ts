import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  SUPPORTED_TIME_ZONES,
  timeZoneSelectOptions,
  utcOffsetLabel,
} from "./timezones";

describe("isValidTimeZone", () => {
  it("accepts a canonical zone", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
  });

  // The three zones below are the whole reason validation is a try/catch and
  // not a membership test against SUPPORTED_TIME_ZONES — that list excludes
  // all of them while DateTimeFormat accepts all of them.
  it("accepts UTC, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("accepts Europe/Kyiv, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("Europe/Kyiv")).toBe(true);
  });

  it("accepts Asia/Kolkata, which is NOT in the canonical list", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
  });

  it("rejects the typo that makes DateTimeFormat throw", () => {
    // Proven on Node v24.13.1: constructing with this string throws
    // RangeError. Reaching DateTimeFormat with an unvalidated DB value is
    // what would 500 the cancel route.
    expect(isValidTimeZone("America/Los_Angles")).toBe(false);
  });

  it("rejects a bare country code, an empty string and non-strings", () => {
    expect(isValidTimeZone("UK")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("SUPPORTED_TIME_ZONES", () => {
  it("is a large list that omits UTC — an ICU-behaviour canary, not a bug", () => {
    // If this ever fails, ICU changed what supportedValuesOf returns. That
    // does not break anything (validation never consults this list) but the
    // comments justifying try/catch validation would need rewording.
    expect(SUPPORTED_TIME_ZONES.length).toBeGreaterThan(300);
    expect(SUPPORTED_TIME_ZONES).not.toContain("UTC");
    expect(SUPPORTED_TIME_ZONES).toContain("America/Los_Angeles");
  });
});

describe("utcOffsetLabel", () => {
  it("formats Manila as UTC+08:00 year-round", () => {
    // Fixed instant so DST elsewhere cannot flake this.
    const now = new Date("2026-01-15T12:00:00.000Z");
    expect(utcOffsetLabel("Asia/Manila", now)).toBe("UTC+08:00");
  });

  it("formats UTC as UTC+00:00", () => {
    expect(utcOffsetLabel("UTC", new Date("2026-01-15T12:00:00.000Z"))).toBe(
      "UTC+00:00"
    );
  });
});

describe("timeZoneSelectOptions", () => {
  it("includes UTC and labels with the offset prefix", () => {
    const opts = timeZoneSelectOptions(null, new Date("2026-01-15T12:00:00.000Z"));
    const utc = opts.find((o) => o.value === "UTC");
    expect(utc?.label).toBe("(UTC+00:00) UTC");
    const manila = opts.find((o) => o.value === "Asia/Manila");
    expect(manila?.label).toBe("(UTC+08:00) Asia/Manila");
  });

  it("keeps a current zone that is valid but not in the canonical list", () => {
    const opts = timeZoneSelectOptions(
      "Europe/Kyiv",
      new Date("2026-01-15T12:00:00.000Z")
    );
    expect(opts.some((o) => o.value === "Europe/Kyiv")).toBe(true);
  });
});
