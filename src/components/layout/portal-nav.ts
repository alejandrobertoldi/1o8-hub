import type { LucideIcon } from "lucide-react";
import { canAccess } from "@/lib/permissions";

export type PortalNavItem = {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  permission: string | null;
  children?: PortalNavItem[];
};

/** Same order/labels as hub TopNav REPORT_TABS — portal paths + reports-* grants. */
export const PORTAL_REPORT_TABS = [
  { id: "overview", label: "Overview", href: "/portal/reports/overview" },
  { id: "advertising-audit", label: "Advertising Audit", href: "/portal/reports/advertising-audit" },
  { id: "inventory", label: "Inventory", href: "/portal/reports/inventory" },
  { id: "order-geography", label: "Order Geography", href: "/portal/reports/order-geography" },
  { id: "period-comparative", label: "Period Comparative", href: "/portal/reports/period-comparative" },
  { id: "share-of-voice", label: "Share of Voice", href: "/portal/reports/share-of-voice" },
  { id: "subscribe-save", label: "Subscribe & Save", href: "/portal/reports/subscribe-save" },
] as const;

export type PortalReportTab = (typeof PORTAL_REPORT_TABS)[number];

/** Filter report sub-nav by reports-{id} grants. Admin bypass shows all. */
export function filterPortalReportTabs(
  tabs: readonly PortalReportTab[],
  allowedSections: string[],
  adminBypass: boolean,
): PortalReportTab[] {
  if (adminBypass) return [...tabs];
  return tabs.filter((t) =>
    canAccess(`reports-${t.id}`, allowedSections, false),
  );
}

/**
 * Filter portal top-nav (and mobile sheet) by allowedSections.
 * Pass `adminBypass=false` in admin-preview-as-client so hidden sections
 * disappear from the nav the same way muted cards do on the dashboard.
 */
export function filterPortalNav(
  items: PortalNavItem[],
  allowedSections: string[],
  adminBypass: boolean,
): PortalNavItem[] {
  return items
    .filter(
      (item) =>
        item.permission === null ||
        canAccess(item.permission, allowedSections, adminBypass),
    )
    .map((item) => {
      if (!item.children) return item;
      const visibleChildren = item.children.filter(
        (c) =>
          c.permission === null ||
          canAccess(c.permission, allowedSections, adminBypass),
      );
      // Parent grant still lets the landing page through; an empty dropdown
      // is worse than a plain link to that landing.
      if (visibleChildren.length === 0) {
        return { ...item, children: undefined };
      }
      return { ...item, children: visibleChildren };
    });
}
