import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrintDocument } from "./print-document";

describe("PrintDocument", () => {
  it("renders the cover block fields", () => {
    render(
      <PrintDocument
        surface="hub"
        sectionId="overview"
        clientName="Acme Co"
        rangeLabel="2026-07-27 – 2026-08-02"
        generatedAt="2026-08-11"
      >
        <div>body</div>
      </PrintDocument>,
    );
    expect(screen.getByText("MARKETFOUNDRY")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Performance overview" })).toBeInTheDocument();
    expect(screen.getByText("2026-07-27 – 2026-08-02")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-11/)).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the section standfirst from the registry", () => {
    render(
      <PrintDocument surface="hub" sectionId="inventory" clientName="Acme Co" rangeLabel="Current snapshot" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    expect(screen.getByText(/Stock levels, availability and inventory health/)).toBeInTheDocument();
  });

  it("puts the paper canvas at the printable width in both media", () => {
    const { container } = render(
      <PrintDocument surface="hub" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    // The class is the contract; print.css owns the 261mm value and must never
    // make it media-dependent (see the plan's paper-geometry invariant).
    expect(container.querySelector(".mf-paper")).not.toBeNull();
  });

  it("accents hub with mf-orange and portal with the portal token", () => {
    const hub = render(
      <PrintDocument surface="hub" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    const hubRule = hub.container.querySelector("[data-print-accent]") as HTMLElement;
    expect(hubRule.style.background).toContain("--mf-orange");
    hub.unmount();

    const portal = render(
      <PrintDocument surface="portal" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    const portalRule = portal.container.querySelector("[data-print-accent]") as HTMLElement;
    expect(portalRule.style.background).toContain("--portal-accent");
    expect(portalRule.style.background).not.toContain("--mf-orange");
  });

  it("sets document.title to the saved-file name", () => {
    render(
      <PrintDocument surface="hub" sectionId="overview" clientName="Acme Co" rangeLabel="r" generatedAt="2026-08-11" start="2026-07-27" end="2026-08-02">
        <div />
      </PrintDocument>,
    );
    expect(document.title).toBe("Acme-Co_Performance-Overview_2026-07-27_2026-08-02");
  });
});
