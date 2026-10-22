import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpDocHeader } from "./help-doc-header";

describe("HelpDocHeader", () => {
  it("renders title, subtitle, version and meta note", () => {
    render(
      <HelpDocHeader
        title="Client Onboarding Process"
        subtitle="1o8 — Internal Reference"
        version="v1.0 · June 2026"
        metaNote="11 steps · 29 sub-tasks"
      />
    );
    expect(screen.getByText("Client Onboarding Process")).toBeTruthy();
    expect(screen.getByText("1o8 — Internal Reference")).toBeTruthy();
    expect(screen.getByText("11 steps · 29 sub-tasks")).toBeTruthy();
  });

  it("omits the meta block when no version or metaNote", () => {
    const { container } = render(<HelpDocHeader title="Help & SOPs" subtitle="Internal Reference" />);
    expect(container.querySelector(".header-meta")).toBeNull();
  });

  it("renders a Watch video link when videoUrl is set", () => {
    render(
      <HelpDocHeader
        title="Brand Story Process"
        subtitle="1o8 — Internal Reference"
        videoUrl="https://drive.google.com/file/d/1NEF_VRaY2_1aYRYLfuCP3BFTHxAIJpB8/view?usp=drive_link"
      />
    );
    const link = screen.getByRole("link", { name: "Watch video" });
    expect(link.getAttribute("href")).toBe(
      "https://drive.google.com/file/d/1NEF_VRaY2_1aYRYLfuCP3BFTHxAIJpB8/view?usp=drive_link"
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("omits the video link when videoUrl is missing", () => {
    render(<HelpDocHeader title="Help & SOPs" subtitle="Internal Reference" />);
    expect(screen.queryByRole("link", { name: "Watch video" })).toBeNull();
  });
});
