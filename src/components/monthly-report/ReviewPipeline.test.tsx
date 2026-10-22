import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewPipeline } from "./ReviewPipeline";

describe("ReviewPipeline", () => {
  it("is a 2 by 5 table with completed steps crossed and ticked", () => {
    render(<ReviewPipeline status="am_review" />);
    expect(screen.getByRole("table", { name: "Review pipeline" })).toBeTruthy();
    expect(screen.getByText("Generated").tagName).toBe("TH");
    expect(screen.getByText("PM").tagName).toBe("TH");
    expect(screen.getByText("AM").tagName).toBe("TH");
    expect(screen.getByText("CEO").tagName).toBe("TH");
    expect(screen.getByText("Sent").tagName).toBe("TH");
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);

    expect(screen.getByText("Generated").className).toMatch(/line-through/);
    expect(screen.getByText("PM").className).toMatch(/line-through/);
    expect(screen.getByText("AM").className).toMatch(/text-brand/);
    expect(screen.getByText("CEO").className).toMatch(/text-sidebar-border/);

    expect(screen.getByRole("checkbox", { name: "Generated complete" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "PM complete" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "AM current" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "CEO pending" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "Sent pending" })).toHaveAttribute("aria-checked", "false");
  });

  it("ticks every box after send", () => {
    render(<ReviewPipeline status="sent" />);
    for (const label of ["Generated", "PM", "AM", "CEO", "Sent"]) {
      expect(screen.getByRole("checkbox", { name: `${label} complete` })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByText(label).className).toMatch(/line-through/);
    }
  });

  it("marks a failed send on SENT", () => {
    render(<ReviewPipeline status="failed" />);
    expect(screen.getByText("Sent").className).toMatch(/text-brand-red/);
    expect(screen.getByRole("checkbox", { name: "Sent failed" })).toHaveAttribute("aria-checked", "false");
  });
});
