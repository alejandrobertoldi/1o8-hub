import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useOutsideClick } from "./use-outside-click";

describe("useOutsideClick", () => {
  it("calls handler when clicking outside the ref element", () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useOutsideClick(handler));

    // Simulate attaching the ref to a DOM element
    const inside = document.createElement("div");
    document.body.appendChild(inside);
    Object.defineProperty(result.current, "current", {
      value: inside,
      writable: true,
    });

    // Click outside
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Click inside — should NOT trigger
    act(() => {
      inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(handler).toHaveBeenCalledTimes(1);

    document.body.removeChild(inside);
  });

  it("does not call handler when disabled", () => {
    const handler = vi.fn();
    renderHook(() => useOutsideClick(handler, false));

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
