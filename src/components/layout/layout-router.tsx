"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { PortalShell } from "@/components/layout/portal-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { PortalVisibleClientsProvider } from "@/components/portal/portal-visible-clients";

export function LayoutRouter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /* Print/PDF pages get NO chrome — and this must be tested BEFORE the /portal
     branch below. A portal print route matches both, and if the portal branch
     won it would render the paper document inside PortalShell, which is the very
     bug the print routes exist to fix. */
  const isReportPrintRoute =
    /^\/(portal\/)?reports\/[^/]+\/print(\/|$)/.test(pathname ?? "") ||
    /^\/case-studies\/[^/]+\/print(\/|$)/.test(pathname ?? "");

  if (
    isReportPrintRoute ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/calculator") ||
    pathname.startsWith("/status")
  ) {
    return <>{children}</>;
  }

  // Portal routes get a clean client-facing layout
  if (pathname.startsWith("/portal")) {
    return (
      <Suspense>
        <PortalVisibleClientsProvider>
          <PortalShell>{children}</PortalShell>
        </PortalVisibleClientsProvider>
      </Suspense>
    );
  }

  // SEO project sub-pages manage their own top spacing via PipelineNav sticky header
  const seoProjectPage = /^\/seo\/[^/]+\/.+/.test(pathname ?? "");
  // Onboarding project pages manage their own top spacing via sticky progress bar
  const onboardingProjectPage = /^\/clients\/[^/]+\/onboarding/.test(pathname ?? "");
  // Timeline pages pin the Gantt controls directly under the top nav
  const clientTimelinePage = /^\/clients\/[^/]+\/timeline/.test(pathname ?? "");
  const dataMapPage = pathname === "/admin/data-map";
  // Admin users page: full-bleed table starts flush with nav
  const adminUsersPage = pathname === "/admin/users" || pathname === "/hours-admin";
  // Product detail sticky toolbar pins directly under the top nav
  const productDetailPage = /^\/products\/[^/]+/.test(pathname ?? "");
  // Catalog status chips + table header pin flush under nav row 3
  const productCatalogPage = pathname === "/products";
  // Listing Images client page pins the shared slot header under nav
  const listingImagesClientPage = /^\/design\/listing-images\/[^/]+/.test(pathname ?? "");
  // Monthly report TOC lives in TopNav row 4 — drop main padding so the cover sits flush
  const monthlyReportPage = pathname === "/reports/monthly";
  const flushTop =
    seoProjectPage ||
    onboardingProjectPage ||
    clientTimelinePage ||
    dataMapPage ||
    adminUsersPage ||
    productDetailPage ||
    productCatalogPage ||
    listingImagesClientPage ||
    monthlyReportPage;

  // Internal routes get top nav + full-width content
  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-brand-solid focus:px-4 focus:py-2 focus:text-white focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Suspense>
        <TopNav />
      </Suspense>
      <div className="fixed inset-0 z-[-1] ambient-bg" />
      <main
        id="main-content"
        className={`flex-1 min-h-0 px-6 lg:px-10 relative z-10 glass-panel ${clientTimelinePage ? "overflow-hidden pb-0 lg:pb-0" : dataMapPage ? "overflow-auto lg:overflow-hidden pb-0 lg:pb-0" : "overflow-auto pb-6 lg:pb-10"} ${flushTop ? "pt-0" : "pt-6 lg:pt-8"}`}
      >
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
