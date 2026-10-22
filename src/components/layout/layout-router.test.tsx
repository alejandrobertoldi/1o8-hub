import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/** Mocked because the real shells pull in NextAuth, react-query and Radix; this
 *  test is about ONE thing — which branch a pathname takes. */
const pathname = { current: "/" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/components/layout/top-nav", () => ({ TopNav: () => <div data-testid="top-nav" /> }));
vi.mock("@/components/layout/portal-shell", () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-shell">{children}</div>
  ),
}));
vi.mock("@/components/layout/command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/portal/portal-visible-clients", () => ({
  PortalVisibleClientsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { LayoutRouter } = await import("./layout-router");

function renderAt(path: string) {
  pathname.current = path;
  return render(<LayoutRouter><div data-testid="page" /></LayoutRouter>);
}

describe("LayoutRouter", () => {
  it("gives hub print routes no chrome", () => {
    const { queryByTestId } = renderAt("/reports/overview/print");
    expect(queryByTestId("page")).not.toBeNull();
    expect(queryByTestId("top-nav")).toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
  });

  /* The load-bearing case: the /portal branch used to win. */
  it("gives PORTAL print routes no chrome either", () => {
    const { queryByTestId } = renderAt("/portal/reports/overview/print");
    expect(queryByTestId("page")).not.toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
    expect(queryByTestId("top-nav")).toBeNull();
  });

  it("keeps the existing monthly print exclusion", () => {
    const { queryByTestId } = renderAt("/reports/monthly/print");
    expect(queryByTestId("top-nav")).toBeNull();
  });

  it("gives the case-study PDF print route no chrome", () => {
    const { queryByTestId, container } = renderAt("/case-studies/abc-123/print");
    expect(queryByTestId("page")).not.toBeNull();
    expect(queryByTestId("top-nav")).toBeNull();
    expect(container.querySelector("main")).toBeNull();
  });

  it("still wraps the case-studies tracker in the top nav", () => {
    const { queryByTestId } = renderAt("/case-studies");
    expect(queryByTestId("top-nav")).not.toBeNull();
  });

  it("still wraps ordinary portal pages in the portal shell", () => {
    const { queryByTestId } = renderAt("/portal/reports/overview");
    expect(queryByTestId("portal-shell")).not.toBeNull();
  });

  it("still wraps ordinary hub pages in the top nav", () => {
    const { queryByTestId } = renderAt("/reports/overview");
    expect(queryByTestId("top-nav")).not.toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
  });

  it("flushes top padding on /reports/monthly so the TOC can sit in the hub nav", () => {
    const { container } = renderAt("/reports/monthly");
    const main = container.querySelector("main");
    expect(main?.className).toContain("pt-0");
    expect(main?.className).not.toMatch(/(?:^|\s)pt-6(?:\s|$)/);
  });

  it("keeps default top padding on v2 report pages", () => {
    const { container } = renderAt("/reports/overview");
    const main = container.querySelector("main");
    expect(main?.className).toContain("pt-6");
  });
});
