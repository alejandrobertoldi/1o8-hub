import { describe, it, expect } from "vitest";
import {
  filterPortalNav,
  filterPortalReportTabs,
  PORTAL_REPORT_TABS,
  type PortalNavItem,
} from "./portal-nav";
import { LayoutDashboard, Wallet, Clock } from "lucide-react";

const NAV: PortalNavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/portal",
    icon: LayoutDashboard,
    permission: null,
  },
  {
    id: "timeline",
    title: "Timeline",
    href: "/portal/timeline",
    icon: Clock,
    permission: "timeline",
  },
  {
    id: "finance",
    title: "Finance",
    href: "/portal/finance",
    icon: Wallet,
    permission: "finances",
    children: [
      {
        id: "finance-reports",
        title: "Finance Reports",
        href: "/portal/finance/reports",
        icon: Wallet,
        permission: "finances",
      },
    ],
  },
];

describe("filterPortalNav", () => {
  it("keeps permission-null items and drops sections the client cannot access", () => {
    const visible = filterPortalNav(NAV, ["timeline"], false);
    expect(visible.map((i) => i.id)).toEqual(["dashboard", "timeline"]);
  });

  it("hides Finance when finances is not in allowedSections (admin preview)", () => {
    const visible = filterPortalNav(NAV, ["sales", "reports"], false);
    expect(visible.map((i) => i.id)).not.toContain("finance");
  });

  it("shows everything when adminBypass is true", () => {
    const visible = filterPortalNav(NAV, [], true);
    expect(visible.map((i) => i.id)).toEqual(["dashboard", "timeline", "finance"]);
  });

  it("drops a parent whose own permission is denied", () => {
    const visible = filterPortalNav(NAV, ["timeline"], false);
    expect(visible.find((i) => i.id === "finance")).toBeUndefined();
  });

  it("keeps a granted parent as a plain link when all children are denied", () => {
    const designNav: PortalNavItem[] = [
      {
        id: "design",
        title: "Design",
        href: "/portal/design",
        icon: Wallet,
        permission: "design",
        children: [
          {
            id: "brandstory",
            title: "Brand Story",
            href: "/portal/design/brandstory",
            icon: Wallet,
            permission: "brandstory",
          },
          {
            id: "aplus",
            title: "A+ Content",
            href: "/portal/design/aplus2",
            icon: Wallet,
            permission: "aplus",
          },
        ],
      },
    ];
    const visible = filterPortalNav(designNav, ["design"], false);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("design");
    expect(visible[0].children).toBeUndefined();
  });

  it("keeps only allowed Sales children (matches SalesHub card toggles)", () => {
    const salesNav: PortalNavItem[] = [
      {
        id: "sales",
        title: "Sales",
        href: "/portal/sales",
        icon: Wallet,
        permission: "sales",
        children: [
          {
            id: "sales-overview",
            title: "Sales Summary",
            href: "/portal/sales/overview",
            icon: Wallet,
            permission: "sales-overview",
          },
          {
            id: "sales-inventory",
            title: "Inventory",
            href: "/portal/sales/inventory",
            icon: Wallet,
            permission: "sales-inventory",
          },
          {
            id: "sales-forecast",
            title: "Forecast",
            href: "/portal/sales/forecast",
            icon: Wallet,
            permission: "sales-forecast",
          },
          {
            id: "sales-monitor",
            title: "Sales Monitor",
            href: "/portal/sales-monitor",
            icon: Wallet,
            permission: "sales-monitor",
          },
        ],
      },
    ];
    const visible = filterPortalNav(
      salesNav,
      ["sales", "sales-overview", "sales-monitor"],
      false,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].children?.map((c) => c.id)).toEqual([
      "sales-overview",
      "sales-monitor",
    ]);
  });
});

describe("filterPortalReportTabs", () => {
  it("keeps hub order and drops sections the client cannot access", () => {
    const visible = filterPortalReportTabs(
      PORTAL_REPORT_TABS,
      ["reports-overview", "reports-inventory", "reports-share-of-voice"],
      false,
    );
    expect(visible.map((t) => t.label)).toEqual([
      "Overview",
      "Inventory",
      "Share of Voice",
    ]);
  });

  it("shows every tab when adminBypass is true", () => {
    const visible = filterPortalReportTabs(PORTAL_REPORT_TABS, [], true);
    expect(visible).toHaveLength(PORTAL_REPORT_TABS.length);
  });
});
