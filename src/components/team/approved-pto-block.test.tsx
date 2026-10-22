import { describe, it, expect } from "vitest";
import {
  partitionApprovedPto,
  type ApprovedPtoItem,
} from "./approved-pto-block";

const R = (
  id: string,
  startDate: string,
  endDate: string,
  workingDays = 1
): ApprovedPtoItem => ({
  id,
  startDate,
  endDate,
  workingDays,
  decidedAt: null,
});

describe("partitionApprovedPto", () => {
  it("puts past and in-progress ranges in enjoyed, future starts in upcoming", () => {
    const rows = [
      R("past", "2026-01-05", "2026-01-09", 5),
      R("active", "2026-08-05", "2026-08-10", 4),
      R("future", "2026-12-20", "2026-12-24", 3),
    ];
    const { enjoyed, upcoming } = partitionApprovedPto(rows, "2026-08-07");
    expect(enjoyed.map((r) => r.id)).toEqual(["past", "active"]);
    expect(upcoming.map((r) => r.id)).toEqual(["future"]);
  });

  it("treats a single-day request on today as taken", () => {
    const { enjoyed, upcoming } = partitionApprovedPto(
      [R("today", "2026-08-07", "2026-08-07")],
      "2026-08-07"
    );
    expect(enjoyed.map((r) => r.id)).toEqual(["today"]);
    expect(upcoming).toEqual([]);
  });
});
