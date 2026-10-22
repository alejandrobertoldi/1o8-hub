import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AIGeneratingButton from "./ai-generating-button";

// DESIGN.md: default buttons are h-9 rounded-full pills with 13px medium text.
describe("AIGeneratingButton pill styling", () => {
  it("idle button is an h-9 rounded-full pill", () => {
    const { getByRole } = render(<AIGeneratingButton isGenerating={false} onClick={() => {}} label="Run AI Tiering" />);
    const btn = getByRole("button");
    expect(btn.className).toContain("rounded-full");
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("text-[13px]");
    expect(btn.className).not.toContain("rounded-xl");
  });
  it("generating state keeps the pill shape", () => {
    const { container } = render(<AIGeneratingButton isGenerating onClick={() => {}} label="Run AI Tiering" />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain("rounded-full");
    expect(shell.className).toContain("h-9");
  });
});
