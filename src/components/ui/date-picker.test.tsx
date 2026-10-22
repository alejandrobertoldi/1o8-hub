import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePicker } from "./date-picker";

function open() {
  fireEvent.click(screen.getByRole("button", { name: /sep 23, 2025/i }));
}

describe("DatePicker month navigation", () => {
  it("next and previous arrows move the visible month", () => {
    render(<DatePicker value="2025-09-23" onChange={() => {}} />);
    open();
    expect(screen.getByText("September 2025")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByText("October 2025")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByText("August 2025")).toBeTruthy();
  });

  it("the arrow nav is layered above the month caption", () => {
    render(<DatePicker value="2025-09-23" onChange={() => {}} />);
    open();
    const nav = screen.getByRole("button", { name: /next month/i }).parentElement!;
    expect(nav.className).toContain("z-10");
    expect(nav.className).toContain("absolute");
  });

  it("reopening re-anchors on the selected month", () => {
    render(<DatePicker value="2025-09-23" onChange={() => {}} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByText("November 2025")).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    open();
    expect(screen.getByText("September 2025")).toBeTruthy();
  });

  it("Today commits the current local date", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2025-09-23" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(onChange).toHaveBeenCalledWith(iso);
  });
});
