import { describe, expect, it } from "vitest";
import { buildReportPdfFilename } from "./export-report-pdf";

describe("buildReportPdfFilename", () => {
  it("builds a filesystem-safe name from client, section, and range", () => {
    expect(
      buildReportPdfFilename({
        clientName: "Dr. Cuddles",
        sectionLabel: "Performance Overview",
        start: "2026-07-27",
        end: "2026-08-02",
      }),
    ).toBe("Dr.-Cuddles_Performance-Overview_2026-07-27_2026-08-02");
  });

  it("falls back when fields are missing", () => {
    expect(buildReportPdfFilename({})).toBe("report");
  });
});
