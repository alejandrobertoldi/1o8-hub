import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalStackedReport } from "./portal-stacked-report";

const stacked = {
  codes: ["TRT_SC_US", "TRS_SC_US"] as string[],
  isAdminPreview: false,
};

const controls = {
  loading: false,
  notFound: false,
  isProspect: false,
  isAdminPreview: false,
  clientIdCode: "TRT_SC_US",
  clientName: "Trejo's Tacos",
  start: "2026-09-01",
  end: "2026-09-07",
  backHref: "/portal/reports",
  canAccessSection: () => true,
};

vi.mock("@/components/portal/portal-stacked-clients", async () => {
  const actual = await vi.importActual<typeof import("@/components/portal/portal-stacked-clients")>(
    "@/components/portal/portal-stacked-clients",
  );
  return {
    ...actual,
    usePortalStackedClients: () => ({
      codes: stacked.codes,
      showHeaders: stacked.codes.length > 1,
      ready: true,
      isEmpty: stacked.codes.length === 0,
      isAdminPreview: stacked.isAdminPreview,
      label: "Trejo's Tacos · Trejo's Spirits",
    }),
  };
});

vi.mock("@/components/reports/v2/use-portal-report-controls", () => ({
  usePortalReportControls: () => controls,
}));

// The controls bar drags in the date picker, the PDF exporter and the palette;
// none of that is under test here. It renders into the nav slot anyway.
vi.mock("@/components/reports/v2/reports-controls-bar", () => ({
  ReportsControlsBar: ({ clientLabel }: { clientLabel?: string }) => (
    <div data-testid="controls-bar">{clientLabel}</div>
  ),
}));
vi.mock("@/components/layout/page-header-slot", () => ({
  PageMetaSlot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ROWS: Record<string, { clientName: string; rawData: Record<string, string> }> = {
  TRT_SC_US: { clientName: "Trejo's Tacos", rawData: { IntentwiseID: "910420" } },
  TRS_SC_US: { clientName: "Trejo's Spirits", rawData: {} },
};

const GRANTS = [
  { clientIdCode: "TRT_SC_US", clientName: "Trejo's Tacos", allowedSections: ["reports-overview", "reports-order-geography"] },
  { clientIdCode: "TRS_SC_US", clientName: "Trejo's Spirits", allowedSections: ["reports-overview"] },
];

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.startsWith("/api/portal/me/clients")) {
        return { ok: true, json: async () => ({ clients: GRANTS }) };
      }
      const code = new URL(url, "http://x").searchParams.get("client") ?? "";
      const row = ROWS[code];
      if (!row) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ clientIdCode: code, ...row }) };
    }),
  );
}

function renderReport(sectionId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortalStackedReport sectionId={sectionId} sectionLabel="Overview" title="Overview" description="desc">
        {(ctx) => (
          <p>
            body {ctx.clientIdCode} acct={ctx.accountId || "none"} {ctx.start}
          </p>
        )}
      </PortalStackedReport>
    </QueryClientProvider>,
  );
}

describe("PortalStackedReport", () => {
  beforeEach(() => {
    stacked.codes = ["TRT_SC_US", "TRS_SC_US"];
    stacked.isAdminPreview = false;
    mockFetch();
  });

  it("renders the title once and one body per client with its own IntentwiseID", async () => {
    renderReport("overview");
    expect(await screen.findByText("body TRT_SC_US acct=910420 2026-09-01")).toBeInTheDocument();
    expect(await screen.findByText("body TRS_SC_US acct=none 2026-09-01")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Trejo's Tacos", "Trejo's Spirits"]);
    // Only the account without an IntentwiseID gets the banner, inside its own block.
    expect(within(sections[0]!).queryByText(/missing intentwiseid/i)).toBeNull();
    expect(within(sections[1]!).getByText(/missing intentwiseid/i)).toBeInTheDocument();
    expect(screen.getByTestId("controls-bar")).toHaveTextContent("Trejo's Tacos · Trejo's Spirits");
  });

  it("gates each block on that client's own grant, not the union", async () => {
    renderReport("order-geography");
    expect(await screen.findByText(/body TRT_SC_US acct=910420/)).toBeInTheDocument();
    const sections = screen.getAllByRole("region");
    expect(within(sections[1]!).getByText(/isn't available for your account/i)).toBeInTheDocument();
    expect(within(sections[1]!).queryByText(/body TRS_SC_US/)).toBeNull();
  });

  it("keeps the single-client layout: no block header, controls label names the client", async () => {
    stacked.codes = ["TRT_SC_US"];
    renderReport("overview");
    expect(await screen.findByText(/body TRT_SC_US acct=910420/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.getByTestId("controls-bar")).toHaveTextContent("Trejo's Tacos · TRT_SC_US");
    // No per-client grants fetch is needed for one client.
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.startsWith("/api/portal/me/clients"))).toBe(false);
  });
});
