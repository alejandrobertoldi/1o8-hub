import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/* `share-of-voice` is deliberately ABSENT from this mock. The real registry is
   Partial until Task 11, so "an id with no renderer" is a reachable state and the
   page must fail closed on it — see the last test. Mocking all six would hide
   that, and would also let this suite pass even if the real registry were empty. */
vi.mock("./section-renderers", () => ({
  SECTION_RENDERERS: {
    overview: () => <div data-testid="section" />,
    "advertising-audit": () => null,
    inventory: () => <div data-testid="section" />,
    "period-comparative": () => null,
    "subscribe-save": () => <div data-testid="section" />,
  },
}));

const { HubPrintPage } = await import("./hub-print-page");

const base = { clientName: "Acme Co", generatedAt: "2026-08-11", autoprint: false, year: null };

describe("HubPrintPage", () => {
  it("renders the paper document when the params are complete", () => {
    render(<HubPrintPage sectionId="overview" accountId="154290" start="2026-07-27" end="2026-08-02" {...base} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Performance overview" })).toBeInTheDocument();
    expect(screen.getByText("2026-07-27 – 2026-08-02")).toBeInTheDocument();
  });

  it("refuses to render a document without an accountId", () => {
    render(<HubPrintPage sectionId="overview" accountId="" start="2026-07-27" end="2026-08-02" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
    expect(screen.queryByTestId("section")).toBeNull();
  });

  it("refuses to render a range section without dates", () => {
    render(<HubPrintPage sectionId="overview" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
  });

  it("needs no dates for a snapshot section", () => {
    render(<HubPrintPage sectionId="inventory" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("Current snapshot")).toBeInTheDocument();
  });

  it("derives the year range for subscribe-save", () => {
    render(<HubPrintPage sectionId="subscribe-save" accountId="154290" start="" end="" {...base} year={2026} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("refuses a year section with no year", () => {
    render(<HubPrintPage sectionId="subscribe-save" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
  });

  /* Fails CLOSED on a section with no renderer. Without this the page would emit
     a cover block with no body, PrintReady would see no skeletons and emit the
     ready sentinel at once, and AutoPrint would print the blank report. */
  it("refuses a section that has no renderer registered", () => {
    render(
      <HubPrintPage sectionId="share-of-voice" accountId="154290" start="2026-07-27" end="2026-08-02" {...base} />,
    );
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
    expect(screen.queryByTestId("section")).toBeNull();
  });
});
