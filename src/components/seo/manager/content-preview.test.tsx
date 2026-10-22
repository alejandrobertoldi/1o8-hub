import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ContentPreview } from "./content-preview";

describe("ContentPreview", () => {
  it("shows 'No content yet' message when preview is null and phase < S6", () => {
    render(<ContentPreview preview={null} phase="S3" />);
    expect(screen.getByText(/No content yet/)).toBeInTheDocument();
  });

  it("shows skeleton pulse when preview is null and phase is S6+", () => {
    const { container } = render(<ContentPreview preview={null} phase="S6" />);
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBe(3);
  });

  it("renders title, bullet, and description when preview is provided", () => {
    render(
      <ContentPreview
        preview={{
          title: "Test Title",
          bullet1: "Bullet one text",
          description: "Product description here",
        }}
        phase="S6"
      />
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Bullet one text")).toBeInTheDocument();
    expect(screen.getByText("Product description here")).toBeInTheDocument();
  });

  it("skips empty fields in preview", () => {
    render(
      <ContentPreview
        preview={{ title: "Only Title", bullet1: "", description: "" }}
        phase="S6"
      />
    );
    expect(screen.getByText("Only Title")).toBeInTheDocument();
    expect(screen.queryByText("B1:")).not.toBeInTheDocument();
    expect(screen.queryByText("Desc:")).not.toBeInTheDocument();
  });
});
