import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

let search = "";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "cs 1" }),
  useSearchParams: () => new URLSearchParams(search),
}));
const deckProps = vi.fn();
let deckReady = true;
vi.mock("@/components/case-study/kit/deck-view", () => ({
  DeckView: (p: Record<string, unknown>) => {
    deckProps(p);
    return <div data-testid="deck" data-case-study-ready={deckReady ? "" : undefined} />;
  },
}));

import CaseStudyPrintPage from "./page";
import { printDocumentTitle } from "@/lib/case-study/kit/print-title";

const fetchMock = vi.fn();
const printMock = vi.fn();
const deck = { id: "cs 1", clientName: "Acme Co", format: "high_level", sections: [] };
beforeEach(() => {
  vi.clearAllMocks();
  search = "";
  deckReady = true;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("print", printMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => deck });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("case-study print page", () => {
  it("fetches the deck by id and renders only DeckView in print mode", async () => {
    const { findByTestId } = render(<CaseStudyPrintPage />);
    await findByTestId("deck");
    expect(fetchMock).toHaveBeenCalledWith("/api/case-studies/cs%201");
    expect(deckProps).toHaveBeenLastCalledWith(expect.objectContaining({ print: true, editing: false, cs: deck }));
  });

  it("renders nothing when the deck cannot be loaded", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { queryByTestId } = render(<CaseStudyPrintPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(queryByTestId("deck")).toBeNull();
  });

  it("hides the global body::before noise overlay (Save as PDF rasterises it onto every page)", async () => {
    const { findByTestId, container } = render(<CaseStudyPrintPage />);
    await findByTestId("deck");
    const css = Array.from(container.querySelectorAll("style")).map((s) => s.textContent).join("");
    expect(css).toContain("body::before{display:none;}");
  });

  it("sets the document title to the PDF filename", async () => {
    const { findByTestId } = render(<CaseStudyPrintPage />);
    await findByTestId("deck");
    await waitFor(() => expect(document.title).toBe("Acme Co - High-Level Case Study"));
    expect(printDocumentTitle({ clientName: "Acme Co", format: "detailed" })).toBe("Acme Co - Detailed Case Study");
  });

  it("autoprint=1: calls window.print exactly once after the deck is ready", async () => {
    search = "autoprint=1";
    const { findByTestId } = render(<CaseStudyPrintPage />);
    await findByTestId("deck");
    await waitFor(() => expect(printMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it("autoprint=1 does not print before the ready sentinel appears", async () => {
    search = "autoprint=1";
    deckReady = false;
    const { findByTestId } = render(<CaseStudyPrintPage />);
    await findByTestId("deck");
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(printMock).not.toHaveBeenCalled();
  });

  it("never prints without autoprint=1", async () => {
    for (const q of ["", "autoprint=0", "autoprint=true"]) {
      search = q;
      const { findByTestId, unmount } = render(<CaseStudyPrintPage />);
      await findByTestId("deck");
      await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
      unmount();
    }
    expect(printMock).not.toHaveBeenCalled();
  });

  it("never prints when the deck fails to load, even with autoprint=1", async () => {
    search = "autoprint=1";
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<CaseStudyPrintPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(printMock).not.toHaveBeenCalled();
  });
});
