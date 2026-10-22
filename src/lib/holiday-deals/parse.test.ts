import { describe, expect, it } from "vitest";
import { parseHolidayDealCreate, parseHolidayDealPatch } from "./parse";

describe("parseHolidayDealCreate", () => {
  it("requires a client, an event, and a product identifier", () => {
    expect(parseHolidayDealCreate({}).ok).toBe(false);
    expect(parseHolidayDealCreate({ clientIdCode: "AAC", event: "pbdd" }).ok).toBe(false);
    expect(
      parseHolidayDealCreate({
        clientIdCode: "AAC",
        event: "pbdd",
        asin: "B00TEST001",
      }).ok,
    ).toBe(true);
  });

  it("rejects unknown events and deal types", () => {
    const event = parseHolidayDealCreate({
      clientIdCode: "AAC",
      event: "prime_day",
      asin: "B00",
    });
    expect(event.ok).toBe(false);

    const deal = parseHolidayDealCreate({
      clientIdCode: "AAC",
      event: "pbdd",
      asin: "B00",
      dealType: "bogus",
    });
    expect(deal.ok).toBe(false);
  });

  it("expands events[] into one create payload per event", () => {
    const parsed = parseHolidayDealCreate({
      clientIdCode: "AAC",
      events: ["pbdd", "bf_week"],
      asin: "B00TEST001",
      sku: "SKU-1",
      adBudget: "1500",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.map((row) => row.event)).toEqual(["pbdd", "bf_week"]);
    expect(parsed.data[0]?.adBudget).toBe(1500);
    expect(parsed.data[0]?.startDate).toBe("2026-10-06");
    expect(parsed.data[1]?.startDate).toBe("2026-11-23");
    expect(parsed.data[0]?.clientTalked).toBe(false);
    expect(parsed.data[0]?.clientAgreement).toBe("unset");
  });

  it("marks talked when the client already agreed", () => {
    const parsed = parseHolidayDealCreate({
      clientIdCode: "AAC",
      event: "pbdd",
      asin: "B00TEST001",
      clientAgreement: "agreed",
      clientTalkedAt: "2026-09-10",
      adBudget: 2000,
      discountPercent: 15,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data[0]?.clientTalked).toBe(true);
    expect(parsed.data[0]?.clientAgreement).toBe("agreed");
    expect(parsed.data[0]?.clientTalkedAt).toBe("2026-09-10");
    expect(parsed.data[0]?.adBudget).toBe(2000);
    expect(parsed.data[0]?.discountPercent).toBe(15);
  });

  it("rejects a promo window that ends before it starts", () => {
    const parsed = parseHolidayDealCreate({
      clientIdCode: "AAC",
      event: "pbdd",
      asin: "B00",
      startDate: "2026-10-08",
      endDate: "2026-10-07",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("parseHolidayDealPatch", () => {
  it("accepts a partial update and ignores unknown keys", () => {
    const parsed = parseHolidayDealPatch({
      adBudget: 900,
      junk: true,
      submissionStatus: "submitted",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({
      adBudget: 900,
      submissionStatus: "submitted",
    });
  });

  it("clears nullable numeric fields with empty string", () => {
    const parsed = parseHolidayDealPatch({ discountPercent: "" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.discountPercent).toBeNull();
  });

  it("accepts talked / when / agreed patches", () => {
    const parsed = parseHolidayDealPatch({
      clientTalked: true,
      clientTalkedAt: "2026-09-10",
      clientAgreement: "agreed",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({
      clientTalked: true,
      clientTalkedAt: "2026-09-10",
      clientAgreement: "agreed",
    });
  });
});
