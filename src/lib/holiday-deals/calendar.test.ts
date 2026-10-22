import { describe, expect, it } from "vitest";
import {
  DEFAULT_TODAY,
  HOLIDAY_EVENTS,
  calendarWindow,
  csvHeaders,
  dealProductTitle,
  daysUntil,
  defaultDealDates,
  enrichPlan,
  estimateDealFee,
  estimatePeakFulfillmentFee,
  getEvent,
  inboundDeadline,
  marksOnDate,
  monthGrid,
  shiftMonth,
  summarizePlans,
  toCsvRow,
} from "./calendar";
import type { HolidayDealPlan } from "./types";

const TODAY = "2026-09-15";

function plan(overrides: Partial<HolidayDealPlan> = {}): HolidayDealPlan {
  return {
    id: "p1",
    clientIdCode: "AAC",
    clientName: "AAC",
    productId: null,
    asin: "B00TEST001",
    sku: "SKU-1",
    itemName: "Test widget",
    summarizedTitle: null,
    event: "pbdd",
    dealType: "lightning",
    discountPercent: 20,
    promoPrice: 19.99,
    startDate: "2026-10-06",
    endDate: "2026-10-07",
    adBudget: 1500,
    estimatedUnits: 400,
    inboundMethod: "fba_optimized",
    submissionStatus: "not_started",
    inboundStatus: "not_planned",
    submittedAt: null,
    clientTalked: false,
    clientTalkedAt: null,
    clientAgreement: "unset",
    notes: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("holiday deals calendar", () => {
  it("pins the three Q4 2026 events Jake asked for", () => {
    expect(HOLIDAY_EVENTS.map((e) => e.id)).toEqual([
      "pbdd",
      "bf_week",
      "cyber_monday",
    ]);
    expect(getEvent("pbdd").label).toBe("Prime Day");
    expect(getEvent("bf_week").label).toBe("Black Friday Week");
    expect(getEvent("cyber_monday").label).toBe("Cyber Monday");
  });

  it("uses Amazon's confirmed Prime Day window of Oct 6-7 2026", () => {
    expect(defaultDealDates("pbdd")).toEqual({
      startDate: "2026-10-06",
      endDate: "2026-10-07",
    });
    expect(getEvent("pbdd").datesConfirmedOn).toBe("2026-09-15");
  });

  it("returns inbound deadlines from the Jul 7 Amazon Services email", () => {
    expect(inboundDeadline("pbdd", "awd")).toBe("2026-09-02");
    expect(inboundDeadline("pbdd", "fba_minimal")).toBe("2026-09-09");
    expect(inboundDeadline("pbdd", "fba_optimized")).toBe("2026-09-16");
    expect(inboundDeadline("bf_week", "awd")).toBe("2026-10-14");
    expect(inboundDeadline("bf_week", "fba_minimal")).toBe("2026-10-21");
    expect(inboundDeadline("bf_week", "fba_optimized")).toBe("2026-10-28");
    expect(inboundDeadline("cyber_monday", "fba_optimized")).toBe("2026-10-28");
  });

  it("counts calendar days remaining without timezone drift", () => {
    expect(daysUntil("2026-09-16", TODAY)).toBe(1);
    expect(daysUntil("2026-09-15", TODAY)).toBe(0);
    expect(daysUntil("2026-09-08", TODAY)).toBe(-7);
  });

  it("flags Prime Day FBA optimized inbound as due tomorrow on Sep 15", () => {
    const row = enrichPlan(plan(), TODAY);
    expect(row.inboundDeadline).toBe("2026-09-16");
    expect(row.inboundDaysRemaining).toBe(1);
    expect(row.inboundRisk).toBe("due_soon");
  });

  it("marks missed inbound when the deadline has passed and stock is not received", () => {
    const row = enrichPlan(
      plan({ inboundMethod: "awd", inboundStatus: "in_transit" }),
      TODAY,
    );
    expect(row.inboundDeadline).toBe("2026-09-02");
    expect(row.inboundRisk).toBe("overdue");
  });

  it("does not flag inbound risk once units are received", () => {
    const row = enrichPlan(
      plan({ inboundMethod: "awd", inboundStatus: "received" }),
      TODAY,
    );
    expect(row.inboundRisk).toBe("received");
  });

  it("treats Prime Day deal submissions as closed after Sep 8 unless already in", () => {
    const open = enrichPlan(plan({ submissionStatus: "not_started" }), TODAY);
    expect(open.submissionRisk).toBe("closed");
    const inAlready = enrichPlan(plan({ submissionStatus: "submitted" }), TODAY);
    expect(inAlready.submissionRisk).toBe("ok");
  });

  it("keeps BFCM submissions open through Oct 20", () => {
    const row = enrichPlan(plan({ event: "bf_week" }), TODAY);
    expect(row.submissionDaysRemaining).toBe(35);
    expect(row.submissionRisk).toBe("ok");
  });

  it("charges $100 + 1.5% of promo sales with the 1.5% capped at $5,000", () => {
    expect(estimateDealFee({ promoSales: 10_000, earlyBird: false })).toEqual({
      upfront: 100,
      variable: 150,
      total: 250,
      incomplete: false,
    });
    expect(estimateDealFee({ promoSales: 1_000_000, earlyBird: false })).toEqual({
      upfront: 100,
      variable: 5_000,
      total: 5_100,
      incomplete: false,
    });
    expect(estimateDealFee({ promoSales: 10_000, earlyBird: true }).upfront).toBe(50);
  });

  it("applies early-bird $50 off only when submitted by the Amazon cutoff", () => {
    const late = enrichPlan(
      plan({
        event: "bf_week",
        submissionStatus: "submitted",
        submittedAt: "2026-09-06",
        promoPrice: 25,
        estimatedUnits: 100,
      }),
      TODAY,
    );
    expect(late.fee.upfront).toBe(100);

    const early = enrichPlan(
      plan({
        event: "bf_week",
        submissionStatus: "submitted",
        submittedAt: "2026-09-05",
        promoPrice: 25,
        estimatedUnits: 100,
      }),
      TODAY,
    );
    expect(early.fee.upfront).toBe(50);
  });

  it("estimates peak fulfillment fees when the deal overlaps Oct 15 2026-Jan 14 2027", () => {
    expect(
      estimatePeakFulfillmentFee({
        units: 100,
        startDate: "2026-10-06",
        endDate: "2026-10-07",
      }),
    ).toBe(0);
    expect(
      estimatePeakFulfillmentFee({
        units: 100,
        startDate: "2026-11-27",
        endDate: "2026-11-27",
      }),
    ).toBeCloseTo(33.12, 2);
  });

  it("rolls inventory, budget, and enrollment into a cross-account summary", () => {
    const summary = summarizePlans(
      [
        plan({ submissionStatus: "submitted", inboundStatus: "received" }),
        plan({
          id: "p2",
          event: "bf_week",
          submissionStatus: "not_started",
          inboundStatus: "not_planned",
          adBudget: 800,
        }),
        plan({
          id: "p3",
          inboundMethod: "awd",
          inboundStatus: "in_transit",
          submissionStatus: "drafting",
        }),
      ],
      TODAY,
    );
    expect(summary.total).toBe(3);
    expect(summary.enrolled).toBe(1);
    expect(summary.notSubmitted).toBe(2);
    expect(summary.inventoryAtRisk).toBe(1);
    expect(summary.adBudget).toBe(3800);
    expect(summary.notTalked).toBe(3);
    expect(summary.waitingOnClient).toBe(0);
    expect(summary.agreed).toBe(0);
  });

  it("tracks client conversation: talked, when, agreed, spend, and percent", () => {
    const summary = summarizePlans(
      [
        plan({ id: "a" }),
        plan({
          id: "b",
          clientTalked: true,
          clientTalkedAt: "2026-09-10",
          clientAgreement: "unset",
          adBudget: null,
          discountPercent: null,
        }),
        plan({
          id: "c",
          clientTalked: true,
          clientTalkedAt: "2026-09-12",
          clientAgreement: "agreed",
          adBudget: 2000,
          discountPercent: 15,
        }),
      ],
      TODAY,
    );
    expect(summary.notTalked).toBe(1);
    expect(summary.waitingOnClient).toBe(1);
    expect(summary.agreed).toBe(1);
    expect(summary.missingSpend).toBe(1);
    expect(summary.missingPercent).toBe(1);
    expect(summary.adBudget).toBe(3500);
  });

  it("exports client tracker columns ahead of Amazon ops fields", () => {
    expect(csvHeaders()).toEqual([
      "Client",
      "ASIN",
      "SKU",
      "Product",
      "Event",
      "Talked",
      "Talked on",
      "Agreed",
      "Spend",
      "Discount %",
      "Deal type",
      "Promo price",
      "Start",
      "End",
      "Est. units",
      "Inbound method",
      "Inbound deadline",
      "Submission status",
      "Inbound status",
      "Est. deal fee",
      "Notes",
    ]);
    const row = toCsvRow(
      enrichPlan(
        plan({
          clientTalked: true,
          clientTalkedAt: "2026-09-10",
          clientAgreement: "agreed",
        }),
        TODAY,
      ),
    );
    expect(row[4]).toBe("Prime Day");
    expect(row[5]).toBe("Yes");
    expect(row[6]).toBe("2026-09-10");
    expect(row[7]).toBe("Yes");
    expect(row[8]).toBe("1500");
    expect(row[9]).toBe("20");
    expect(row[3]).toBe("Test widget");
    expect(row[16]).toBe("2026-09-16");
  });

  it("uses summarized title for the Product column over Amazon itemName", () => {
    expect(
      dealProductTitle(
        plan({
          itemName: "ReadyRESCUE Dog First Aid Kit - Activated Charcoal - 30g Vial",
          summarizedTitle: "ReadyRESCUE | 30 g (Pack of 1)",
        }),
      ),
    ).toBe("ReadyRESCUE | 30 g (Pack of 1)");
    expect(
      toCsvRow(
        enrichPlan(
          plan({
            itemName: "ReadyRESCUE Dog First Aid Kit - Activated Charcoal - 30g Vial",
            summarizedTitle: "ReadyRESCUE | 30 g (Pack of 1)",
          }),
          TODAY,
        ),
      )[3],
    ).toBe("ReadyRESCUE | 30 g (Pack of 1)");
  });

  it("exposes DEFAULT_TODAY as a documented as-of date for tests", () => {
    expect(DEFAULT_TODAY).toBe("2026-09-15");
  });

  it("plots Prime Days as a confirmed Oct 6-7 window on the Q4 calendar", () => {
    const sixth = marksOnDate("2026-10-06");
    expect(sixth.some((m) => m.id === "pbdd" && m.confirmed)).toBe(true);
    expect(marksOnDate("2026-10-07").some((m) => m.id === "pbdd")).toBe(true);
    expect(marksOnDate("2026-10-08").some((m) => m.id === "pbdd")).toBe(false);
  });

  it("always shows three distinct consecutive months, wrapping into 2027", () => {
    expect(calendarWindow({ year: 2026, month: 12 })).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
    expect(calendarWindow({ year: 2026, month: 11 })).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 9, 5)).toEqual({ year: 2027, month: 2 });
  });

  it("builds a Monday-start September 2026 grid with inbound on the 16th", () => {
    const cells = monthGrid(2026, 9);
    expect(cells[0]).toEqual({ iso: null, day: null });
    expect(cells[1]).toEqual({ iso: "2026-09-01", day: 1 });
    const sixteenth = cells.find((c) => c.iso === "2026-09-16");
    expect(sixteenth?.day).toBe(16);
    expect(marksOnDate("2026-09-16").map((m) => m.id)).toContain("pbdd_fba_opt");
  });
});
