import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReportsControlsBar } from "./reports-controls-bar";
import type { ReportControls, ReportRangeControls } from "./use-report-controls";

/** Guards the client-select's surface split, which nothing else covers: the hub
 *  gets the free client dropdown and the portal must never grow one, because the
 *  portal's client is resolved from the session.
 *
 *  Deliberately asserts on the client select's own OPTION TEXT rather than on a
 *  raw `<select>` count. In "week" mode BOTH surfaces legitimately render year
 *  and week selects, so "zero selects on portal" would be false — the difference
 *  between the surfaces is exactly one select, not all of them. The final
 *  assertion pins that delta so the two facts are checked independently.
 *
 *  Mode is "week" on purpose: it keeps the range controls on native <select>
 *  elements instead of the Radix date-picker popover, so this test exercises the
 *  gate and not a third-party portal renderer. */

const CLIENT = {
  clientIdCode: "AC01",
  clientName: "Acme Co",
  clientStatus: "Active",
};

const range: ReportRangeControls = {
  mode: "week",
  setMode: () => {},
  customStart: "2026-08-01",
  setCustomStart: () => {},
  customEnd: "2026-08-04",
  setCustomEnd: () => {},
  year: 2026,
  setYear: () => {},
  week: 31,
  setWeek: () => {},
  accountId: "154290",
  start: "2026-07-27",
  end: "2026-08-02",
};

const hubControls: ReportControls = {
  ...range,
  clients: [CLIENT],
  clientsLoading: false,
  selectedClient: "Acme Co",
  setSelectedClient: () => {},
  refreshKey: 0,
  bumpRefresh: () => {},
};

describe("ReportsControlsBar client select", () => {
  it("renders the client select on hub", () => {
    render(<ReportsControlsBar surface="hub" controls={hubControls} />);
    expect(screen.getByRole("option", { name: "Acme Co" })).toBeInTheDocument();
  });

  it("never renders the client select on portal", () => {
    render(
      <ReportsControlsBar
        surface="portal"
        controls={range}
        showClientSelect={false}
        showRefreshButton={false}
        clientLabel="Acme Co · AC01"
      />,
    );
    expect(screen.queryByRole("option", { name: "Acme Co" })).not.toBeInTheDocument();
  });

  /* The structural gate: `showClientSelect` still defaults to true, so a
     controls object lacking setSelectedClient is the only thing standing
     between the portal and a client dropdown. Adding a default for
     setSelectedClient would silently defeat this. */
  it("cannot render the client select when setSelectedClient is absent, even with showClientSelect defaulted", () => {
    render(<ReportsControlsBar surface="portal" controls={range} />);
    expect(screen.queryByRole("option", { name: "Acme Co" })).not.toBeInTheDocument();
  });

  it("differs from portal by exactly one select", () => {
    const hub = render(<ReportsControlsBar surface="hub" controls={hubControls} />);
    const hubSelects = hub.container.querySelectorAll("select").length;
    hub.unmount();

    const portal = render(
      <ReportsControlsBar
        surface="portal"
        controls={range}
        showClientSelect={false}
        showRefreshButton={false}
      />,
    );
    const portalSelects = portal.container.querySelectorAll("select").length;

    expect(hubSelects - portalSelects).toBe(1);
    expect(portalSelects).toBeGreaterThan(0); // vacuity tripwire: range selects still render
  });

  it("renders the PDF export control on hub and portal", () => {
    const hub = render(<ReportsControlsBar surface="hub" controls={hubControls} />);
    expect(hub.getByRole("button", { name: /pdf/i })).toBeInTheDocument();
    hub.unmount();

    const portal = render(
      <ReportsControlsBar
        surface="portal"
        controls={range}
        showClientSelect={false}
        showRefreshButton={false}
      />,
    );
    expect(portal.getByRole("button", { name: /pdf/i })).toBeInTheDocument();
  });
});
