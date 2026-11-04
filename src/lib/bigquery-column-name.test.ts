import { describe, expect, it } from "vitest";
import { isValidAacColumnName } from "./bigquery";

describe("isValidAacColumnName", () => {
  it("accepts the AAC sheet's headers, including Photo/Video", () => {
    for (const f of ["Service: Photo/Video", "Service: SEO (2)", "ClientIDCode - ASANA", "Onboarding: access_ga4", "Last Day of Term"]) {
      expect(isValidAacColumnName(f)).toBe(true);
    }
  });
  it("rejects anything that could break out of a quoted identifier", () => {
    for (const f of ["a`b", "a'b", 'a"b', "a;b", "a\\b", "a\nb", "", "1abc"]) {
      expect(isValidAacColumnName(f)).toBe(false);
    }
  });
});
