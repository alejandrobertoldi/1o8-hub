import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeographyViewSwitch } from "./geography-view-switch";

describe("GeographyViewSwitch", () => {
  it("renders the three views, marks the active one, reports clicks", () => {
    const onChange = vi.fn();
    render(<GeographyViewSwitch value="both" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(onChange).toHaveBeenCalledWith("inventory");
  });
});
