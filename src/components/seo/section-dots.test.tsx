import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionDots } from "./section-dots";

const p = { current_phase: "S6", s1_approved_at: "x", s2_approved_at: "x", s3_approved_at: "x", s4_approved_at: "x", s5_approved_at: "x", s6_approved_at: "x", review_approved: true, pushed: false, review_stage: null };

describe("SectionDots", () => {
  it("vertical: one labelled row per phase, S1–S8, ticks for done", () => {
    render(<SectionDots project={p} vertical />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "✓S1Intake", "✓S2Keywords", "✓S3Reviews", "✓S4Alexa for Shopping", "✓S5COSMO", "✓S6SEO Content", "✓S7Review & Share", "8S8Push Content",
    ]);
  });
  it("horizontal stays the default and omits S7/S8 when the API doesn't send them", () => {
    const { review_approved: _r, pushed: _p, ...old } = p;
    render(<SectionDots project={old} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("S7")).toBeNull();
    expect(screen.getByText("S6")).toBeTruthy();
  });
});
