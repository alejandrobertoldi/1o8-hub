import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionDots } from "./section-dots";

const p = { current_phase: "S6", s1_approved_at: "x", s2_approved_at: null, s3_approved_at: null, s4_approved_at: null, s5_approved_at: null, s6_approved_at: "x", review_approved: false, pushed: false, review_stage: "pm_review" };

describe("SectionDots with trail (combined phase + team list)", () => {
  it("each phase row adds who · when; S7 lists its review stages", () => {
    render(<SectionDots project={p} vertical trail={[
      { code: "S1", who: "Manu", at: "2026-09-24" },
      { code: "S7", who: null, at: null, stages: [
        { title: "SEO Manager", who: "Manu", state: "done", at: "2026-10-01" },
        { title: "Project Manager", who: "Sohail Asghar", state: "waiting", at: null },
      ] },
    ]} />);
    const phases = screen.getByRole("list", { name: "Phases" });
    expect(phases.children[0].textContent).toBe("✓S1IntakeManu · 2026-09-24");
    expect(phases.children[1].textContent).toContain("Keywords—");
    const stages = screen.getByRole("list", { name: "Review stages" });
    expect(stages.textContent).toContain("Sohail Asghar· waiting");
  });
});
