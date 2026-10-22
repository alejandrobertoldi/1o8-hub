import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { Report } from "@/components/monthly-report/types";

vi.mock("@/components/monthly-report/Report", () => ({
  Report: () => <div data-testid="report" />,
}));

import { PrintEmbed } from "./PrintEmbed";

const stub: Report = {
  meta: {
    client: "Poochie Butter",
    month: "July 2026",
    period: "01 Jul – 31 Jul",
    lead: "Manu Lancharro",
    issued: "Aug 24, 2026",
    reportId: "July|26|POO_SC_US",
  },
  sections: ["cover"],
};

describe("PrintEmbed", () => {
  beforeEach(() => {
    delete window.__MONTHLY_REPORT__;
  });

  it("does not emit the ready sentinel without an injected report", () => {
    render(<PrintEmbed />);
    expect(document.querySelector("[data-report-ready]")).toBeNull();
  });

  it("renders the report and sentinel once Puppeteer injects the payload", async () => {
    window.__MONTHLY_REPORT__ = stub;
    render(<PrintEmbed />);
    await waitFor(() => {
      expect(document.querySelector("[data-report-ready]")).not.toBeNull();
    });
  });
});
