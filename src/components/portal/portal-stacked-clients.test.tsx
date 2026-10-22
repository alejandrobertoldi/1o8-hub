import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PortalStackedClients, usePortalStackedClients } from "./portal-stacked-clients";

const state = {
  role: "client" as string,
  clientParam: null as string | null,
  visible: ["TRT_SC_US", "TRS_SC_US"] as string[],
  ready: true,
  status: "authenticated" as string,
};

vi.mock("next-auth/react", () => ({
  useSession: () =>
    state.status === "loading"
      ? { data: undefined, status: "loading" }
      : { data: { user: { role: state.role } }, status: state.status },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.clientParam ? `client=${state.clientParam}` : ""),
}));

vi.mock("@/components/portal/portal-visible-clients", () => ({
  usePortalVisibleClients: () => ({
    assigned: state.visible,
    visible: state.visible,
    setClientEnabled: () => {},
    showPicker: state.visible.length > 1,
    ready: state.ready,
  }),
}));

function Probe() {
  const s = usePortalStackedClients();
  return <pre data-testid="probe">{JSON.stringify(s)}</pre>;
}

describe("usePortalStackedClients", () => {
  beforeEach(() => {
    state.role = "client";
    state.clientParam = null;
    state.visible = ["TRT_SC_US", "TRS_SC_US"];
    state.ready = true;
    state.status = "authenticated";
  });

  it("is not ready (and not empty) while the session is still loading", () => {
    // The visible-clients store hydrates before useSession resolves, with an
    // empty assignment — without this gate every real user would see a
    // "No client assigned" flash on every page.
    state.status = "loading";
    state.visible = [];
    render(<Probe />);
    const s = JSON.parse(screen.getByTestId("probe").textContent!);
    expect(s.ready).toBe(false);
    expect(s.isEmpty).toBe(false);
  });

  it("stacks every visible client in order and labels them all", () => {
    render(<Probe />);
    const s = JSON.parse(screen.getByTestId("probe").textContent!);
    expect(s.codes).toEqual(["TRT_SC_US", "TRS_SC_US"]);
    expect(s.showHeaders).toBe(true);
    expect(s.isEmpty).toBe(false);
    expect(s.isAdminPreview).toBe(false);
    expect(s.label).toBe("Trejo's Tacos · Trejo's Spirits");
  });

  it("is single-client for an admin previewing ?client=", () => {
    state.role = "admin";
    state.clientParam = "HAL_SC_US";
    render(<Probe />);
    const s = JSON.parse(screen.getByTestId("probe").textContent!);
    expect(s.codes).toEqual(["HAL_SC_US"]);
    expect(s.showHeaders).toBe(false);
    expect(s.isAdminPreview).toBe(true);
  });

  it("ignores ?client= for a client-role user", () => {
    state.clientParam = "HAL_SC_US";
    render(<Probe />);
    const s = JSON.parse(screen.getByTestId("probe").textContent!);
    expect(s.codes).toEqual(["TRT_SC_US", "TRS_SC_US"]);
  });

  it("is not empty before the store is ready", () => {
    state.ready = false;
    state.visible = [];
    render(<Probe />);
    const s = JSON.parse(screen.getByTestId("probe").textContent!);
    expect(s.ready).toBe(false);
    expect(s.isEmpty).toBe(false);
  });
});

describe("PortalStackedClients", () => {
  beforeEach(() => {
    state.role = "client";
    state.clientParam = null;
    state.visible = ["TRT_SC_US", "TRS_SC_US"];
    state.ready = true;
    state.status = "authenticated";
  });

  it("renders nothing (not the empty state) while the session is loading", () => {
    state.status = "loading";
    state.visible = [];
    const { container } = render(
      <PortalStackedClients>{(code) => <p>body {code}</p>}</PortalStackedClients>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one headed section per client, Tacos then Spirits", () => {
    render(
      <PortalStackedClients>
        {(code, { showHeader, index }) => (
          <p>
            body {code} {String(showHeader)} {index}
          </p>
        )}
      </PortalStackedClients>,
    );
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveAttribute("aria-label", "Trejo's Tacos");
    expect(sections[1]).toHaveAttribute("aria-label", "Trejo's Spirits");
    expect(within(sections[0]!).getByRole("heading", { level: 2 })).toHaveTextContent("Trejo's Tacos");
    expect(within(sections[0]!).getByText("TRT_SC_US")).toBeInTheDocument();
    expect(within(sections[0]!).getByText("body TRT_SC_US true 0")).toBeInTheDocument();
    expect(within(sections[1]!).getByText("body TRS_SC_US true 1")).toBeInTheDocument();
  });

  it("shows no client header for a single-client user", () => {
    state.visible = ["HAL_SC_US"];
    render(<PortalStackedClients>{(code) => <p>body {code}</p>}</PortalStackedClients>);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.getByText("body HAL_SC_US")).toBeInTheDocument();
  });

  it("renders the empty state when nothing is assigned", () => {
    state.visible = [];
    render(<PortalStackedClients>{(code) => <p>body {code}</p>}</PortalStackedClients>);
    expect(screen.getByText(/no client assigned/i)).toBeInTheDocument();
  });

  it("renders nothing until the store is ready", () => {
    state.ready = false;
    const { container } = render(
      <PortalStackedClients>{(code) => <p>body {code}</p>}</PortalStackedClients>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
