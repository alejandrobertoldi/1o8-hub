import { describe, it, expect } from "vitest";
import {
  COUNTRY_DISPLAY_CODES,
  COUNTRY_FULL_NAMES,
  VALID_COUNTRY_CODES,
  countryCodeToDisplayCode,
  countryCodeToFlagEmoji,
  countryCodeToFullName,
} from "./constants";

describe("countryCodeToFlagEmoji", () => {
  it("maps ISO alpha-2 codes to regional-indicator pairs", () => {
    expect(countryCodeToFlagEmoji("US")).toBe("🇺🇸");
    expect(countryCodeToFlagEmoji("pk")).toBe("🇵🇰");
  });

  it("returns empty string for non-codes", () => {
    expect(countryCodeToFlagEmoji("")).toBe("");
    expect(countryCodeToFlagEmoji("USA")).toBe("");
    expect(countryCodeToFlagEmoji("1A")).toBe("");
  });
});

describe("countryCodeToDisplayCode", () => {
  it("maps every calendar key to its 3-letter display label", () => {
    expect(COUNTRY_DISPLAY_CODES).toEqual({
      US: "USA",
      MX: "MEX",
      BO: "BOL",
      BR: "BRA",
      PE: "PER",
      PH: "PHL",
      TN: "TUN",
    });
    for (const code of VALID_COUNTRY_CODES) {
      expect(countryCodeToDisplayCode(code)).toHaveLength(3);
    }
  });

  it("falls back to a 3-letter uppercase slice for unknown codes", () => {
    expect(countryCodeToDisplayCode("de")).toBe("DE");
  });
});

describe("countryCodeToFullName", () => {
  it("maps every calendar key to a full English name", () => {
    expect(COUNTRY_FULL_NAMES.MX).toBe("Mexico");
    expect(countryCodeToFullName("US")).toBe("United States");
    for (const code of VALID_COUNTRY_CODES) {
      expect(countryCodeToFullName(code).length).toBeGreaterThan(3);
    }
  });
});
