import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutoPrint } from "./auto-print";

describe("AutoPrint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("print", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("prints once the sentinel is already present", () => {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("data-report-ready", "true");
    document.body.appendChild(sentinel);

    render(<AutoPrint />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("waits for the sentinel to appear, then prints exactly once", async () => {
    render(<AutoPrint />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).not.toHaveBeenCalled();

    await act(async () => {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("data-report-ready", "true");
      document.body.appendChild(sentinel);
    });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("prints when the sentinel ATTRIBUTE is added to an element already in the DOM (the case-study deck)", async () => {
    // DeckView renders its root <div> first and only flips data-case-study-ready onto it once the
    // images settle — no node is added, so a childList-only observer never sees it (measured
    // 2026-09-29: 0 print calls in headless Chrome until the 25 s fallback).
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<AutoPrint readySelector="[data-case-study-ready]" fallbackMs={60_000} />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).not.toHaveBeenCalled();

    await act(async () => { root.setAttribute("data-case-study-ready", ""); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("prints anyway after the fallback when the sentinel never appears", () => {
    render(<AutoPrint fallbackMs={5_000} />);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("honours a custom readySelector and ignores the report sentinel", () => {
    const report = document.createElement("div");
    report.setAttribute("data-report-ready", "true");
    document.body.appendChild(report);
    render(<AutoPrint readySelector="[data-case-study-ready]" fallbackMs={60_000} />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).not.toHaveBeenCalled();
  });

  it("waitForFonts defers print until document.fonts.ready resolves", async () => {
    let resolveFonts!: () => void;
    const ready = new Promise<void>((r) => { resolveFonts = r; });
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready } });
    try {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("data-case-study-ready", "");
      document.body.appendChild(sentinel);
      render(<AutoPrint readySelector="[data-case-study-ready]" waitForFonts />);
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(window.print).not.toHaveBeenCalled();
      await act(async () => { resolveFonts(); await ready; });
      expect(window.print).toHaveBeenCalledTimes(1);
    } finally {
      delete (document as unknown as { fonts?: unknown }).fonts;
    }
  });
});
