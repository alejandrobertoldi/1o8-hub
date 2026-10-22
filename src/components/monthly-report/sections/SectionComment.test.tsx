import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionCommentBlock } from "./SectionComment";
import type { SectionComment } from "../types";

const saved: SectionComment = {
  text: "Sessions dipped on Prime Day.\nConversion held.",
  authorName: "Sara Khan",
  role: "pm",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("SectionCommentBlock", () => {
  it("hides when there is no note and the viewer cannot edit", () => {
    const { container } = render(
      <SectionCommentBlock sectionId="kpis" comment={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the saved note for clients", () => {
    render(<SectionCommentBlock sectionId="kpis" comment={saved} />);
    expect(screen.getByText("Note for the client")).toBeInTheDocument();
    expect(screen.getByText("Sessions dipped on Prime Day.")).toBeInTheDocument();
    expect(screen.getByText("Conversion held.")).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("lets a reviewer add a note", () => {
    const onSave = vi.fn();
    render(
      <SectionCommentBlock sectionId="kpis" editable onSave={onSave} />,
    );
    const input = screen.getByRole("textbox", { name: "Client note for kpis" });
    fireEvent.change(input, { target: { value: "Prime Day pulled sessions down." } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(onSave).toHaveBeenCalledWith("kpis", "Prime Day pulled sessions down.");
  });
});
