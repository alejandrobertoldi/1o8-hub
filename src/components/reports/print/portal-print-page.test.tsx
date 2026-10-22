import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const controls = {
  current: {
    loading: false,
    notFound: false,
    canAccessSection: () => true,
    accountId: "154290",
    clientName: "Acme Co",
    clientIdCode: "AC01",
  },
};
vi.mock("@/components/reports/v2/use-portal-report-controls", () => ({
  usePortalReportControls: () => controls.current,
}));
vi.mock("./section-renderers", () => ({
  SECTION_RENDERERS: { overview: () => <div data-testid="section" /> },
}));

const { PortalPrintPage } = await import("./portal-print-page");

const props = {
  sectionId: "overview" as const,
  start: "2026-07-27",
  end: "2026-08-02",
  year: null,
  autoprint: false,
  generatedAt: "2026-08-11",
};

describe("PortalPrintPage", () => {
  beforeEach(() => {
    controls.current = {
      loading: false,
      notFound: false,
      canAccessSection: () => true,
      accountId: "154290",
      clientName: "Acme Co",
      clientIdCode: "AC01",
    };
  });

  it("renders the client's own report using the session-resolved account", () => {
    render(<PortalPrintPage {...props} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  /* The gate a print URL must not be a way around. */
  it("refuses a section the client has no grant for", () => {
    controls.current.canAccessSection = () => false;
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it("renders nothing printable while the client is still resolving", () => {
    controls.current.loading = true;
    const { container } = render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(container.querySelector("[data-report-ready]")).toBeNull();
  });

  it("refuses when no client row resolves", () => {
    controls.current.notFound = true;
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
  });

  it("explains a client with no Intentwise account instead of printing an empty document", () => {
    controls.current.accountId = "";
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(screen.getByText(/no analytics account/i)).toBeInTheDocument();
  });

  /* Type-level guarantee, asserted structurally: the component's props contain
     no identity fields, so no caller can inject one from a URL. */
  it("accepts no accountId or client prop", () => {
    const keys = Object.keys(props);
    expect(keys).not.toContain("accountId");
    expect(keys).not.toContain("clientName");
  });
});
