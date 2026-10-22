import { describe, expect, it } from "vitest";
import {
  BILLING_TYPES,
  billingTypeFor,
  generalProjectNumber,
  internalIdSuffix,
  isValidHours,
  taskProjectNumber,
  workTypeTag,
  workdaysBetween,
} from "./catalog";

describe("time-tracking catalog", () => {
  it("builds project numbers like the sheet", () => {
    expect(taskProjectNumber("MSN", "INT-8132")).toBe("MSN08132");
    expect(taskProjectNumber("kss", "INT-12345")).toBe("KSS12345");
    expect(taskProjectNumber("MSN", null)).toBeNull();
    expect(generalProjectNumber("msn")).toBe("MSN00000");
    expect(internalIdSuffix("INT-7")).toBe("00007");
  });

  it("derives the billing type", () => {
    expect(billingTypeFor("MSN", "MSN08132")).toBe(BILLING_TYPES.client);
    expect(billingTypeFor("1O8", "1O890001")).toBe(BILLING_TYPES.pto);
    expect(billingTypeFor("1O8", "1O890002")).toBe(BILLING_TYPES.pto);
    expect(billingTypeFor("1O8", "1O890004")).toBe(BILLING_TYPES.internal);
    expect(billingTypeFor("1O8", "1O808044")).toBe(BILLING_TYPES.internal);
  });

  it("only accepts 0.25-hour steps up to 24h", () => {
    expect(isValidHours(0.25)).toBe(true);
    expect(isValidHours(1.5)).toBe(true);
    expect(isValidHours(8)).toBe(true);
    expect(isValidHours(0.3)).toBe(false);
    expect(isValidHours(0)).toBe(false);
    expect(isValidHours(24.25)).toBe(false);
  });

  it("maps departments to Asana team tags and counts workdays", () => {
    expect(workTypeTag("Email & SMS")).toBe("Email");
    expect(workTypeTag("Client Meetings")).toBeNull();
    expect(workdaysBetween("2026-10-01", "2026-10-31")).toBe(22);
    expect(workdaysBetween("2026-10-24", "2026-10-25")).toBe(0);
  });
});
