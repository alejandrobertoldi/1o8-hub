import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrintReady } from "./print-ready";

/** The whole readiness mechanism rests on one observed fact: every v2 section
 *  renders its loading state as a div carrying `animate-pulse`. These tests are
 *  the tripwire for that assumption. */
describe("PrintReady", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("withholds the sentinel while a skeleton is still pulsing", () => {
    const skeleton = document.createElement("div");
    skeleton.className = "h-64 animate-pulse rounded-[18px]";
    document.body.appendChild(skeleton);

    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();
  });

  it("emits the sentinel once the skeletons are gone", () => {
    const skeleton = document.createElement("div");
    skeleton.className = "animate-pulse";
    document.body.appendChild(skeleton);

    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();

    skeleton.remove();
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });

  it("emits immediately when nothing was ever pulsing", () => {
    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });

  it("gives up and emits after the timeout so a stuck fetch still prints", () => {
    const stuck = document.createElement("div");
    stuck.className = "animate-pulse";
    document.body.appendChild(stuck);

    const { container } = render(<PrintReady timeoutMs={3_000} />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });
});
