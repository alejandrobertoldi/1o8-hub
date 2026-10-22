import { describe, it, expect } from "vitest";
import type { Report } from "@/components/monthly-report/types";
import { reportHasAppendix, stripAppendixFromReport } from "./strip-appendix";

const withAppendix: Report = {
  meta: {
    client: "Gaffer",
    month: "August 2026",
    period: "01 Aug – 31 Aug",
    lead: "Alex Moreno",
    issued: "Sep 04",
    reportId: "x",
  },
  sections: ["cover", "toc", "kpis", "mom", "appendix"],
  appendix: {
    methodology: "Figures from Intentwise.",
    sources: [],
    glossary: [],
    changelog: [],
    contactLine: "alex@marketfoundry.agency",
  },
  sectionComments: {
    kpis: { text: "Keep", authorName: "Sara", role: "pm", updatedAt: "2026-09-01T00:00:00.000Z" },
    appendix: { text: "Drop", authorName: "Sara", role: "pm", updatedAt: "2026-09-01T00:00:00.000Z" },
  },
};

describe("stripAppendixFromReport", () => {
  it("removes appendix from sections, payload, and notes", () => {
    expect(reportHasAppendix(withAppendix)).toBe(true);
    const next = stripAppendixFromReport(withAppendix);
    expect(next.sections).toEqual(["cover", "toc", "kpis", "mom"]);
    expect(next.appendix).toBeUndefined();
    expect(next.sectionComments?.appendix).toBeUndefined();
    expect(next.sectionComments?.kpis?.text).toBe("Keep");
    expect(reportHasAppendix(next)).toBe(false);
  });

  it("is a no-op when the report has no appendix", () => {
    const clean = stripAppendixFromReport({
      meta: withAppendix.meta,
      sections: ["cover", "kpis"],
    } satisfies Report);
    expect(clean.sections).toEqual(["cover", "kpis"]);
    expect(reportHasAppendix(clean)).toBe(false);
  });
});
