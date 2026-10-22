/* eslint-disable react-doctor/no-prevent-default */
/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { subscribePageMeta, getPageMeta } from "./page-meta-store";
import { useSession, signOut } from "next-auth/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { hasAdminPowers } from "@/lib/roles";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { LogOut, LayoutDashboard, DollarSign, BarChart3, Search, ArrowLeft, Sparkles, Wallet, Package, Calculator, Clock, Palette, ChevronRight, BookOpen, ImageIcon, Store, Boxes, TrendingUp, ClipboardList, Menu, MessageSquareText, ImagePlus, Star, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "./theme-toggle";
import { OpalItemInner, OpalMenu, OpalNavFrame } from "./opal-nav-frame";
import { CLIENT_NAMES } from "@/lib/constants";
import {
  filterPortalNav,
  filterPortalReportTabs,
  PORTAL_REPORT_TABS,
  type PortalNavItem,
} from "./portal-nav";
import { usePortalVisibleClients, usePortalClientParam, portalClientQuery } from "@/components/portal/portal-visible-clients";
import { formatPortalClientBadge } from "@/lib/client-codes";

const SECTION_OPTIONS = [
  "Dashboard", "Timeline", "Sales", "Products", "Attributes",
  "Reports", "SEO", "Design", "Finance", "Other",
];

function guessPortalSection(pathname: string): string {
  if (pathname.startsWith("/portal/timeline")) return "Timeline";
  if (pathname.startsWith("/portal/sales")) return "Sales";
  if (pathname.startsWith("/portal/products")) return "Products";
  if (pathname.startsWith("/portal/attributes")) return "Attributes";
  if (pathname.startsWith("/portal/seo")) return "SEO";
  if (pathname.startsWith("/portal/design") || pathname.startsWith("/portal/aplus")) return "Design";
  if (pathname.startsWith("/portal/reports")) return "Reports";
  if (pathname.startsWith("/portal/finance") || pathname.startsWith("/portal/tools")) return "Finance";
  if (pathname === "/portal") return "Dashboard";
  return "Other";
}

const PORTAL_NAV: PortalNavItem[] = [
  { id: "dashboard", title: "Dashboard", href: "/portal", icon: LayoutDashboard, permission: null },
  // Same permission id as ClientDashboard SECTION_CARDS — must stay in sync.
  { id: "timeline", title: "Timeline", href: "/portal/timeline", icon: Clock, permission: "timeline" },
  {
    id: "sales", title: "Sales", href: "/portal/sales", icon: DollarSign, permission: "sales",
    // Child permissions match PortalSalesLanding SALES_CARDS ids 1:1.
    children: [
      { id: "sales-overview", title: "Sales Summary", href: "/portal/sales/overview", icon: DollarSign, permission: "sales-overview" },
      { id: "sales-inventory", title: "Inventory", href: "/portal/sales/inventory", icon: Boxes, permission: "sales-inventory" },
      { id: "sales-forecast", title: "Forecast", href: "/portal/sales/forecast", icon: TrendingUp, permission: "sales-forecast" },
      { id: "sales-monitor", title: "Sales Monitor", href: "/portal/sales-monitor", icon: BarChart3, permission: "sales-monitor" },
    ],
  },
  { id: "products", title: "Products", href: "/portal/products", icon: Package, permission: "products" },
  { id: "reviews", title: "Reviews", href: "/portal/reviews", icon: Star, permission: "reviews" },
  // Not on ClientDashboard SECTION_CARDS and not in DEFAULT_CLIENT_SECTIONS —
  // keep ungated so existing clients don't lose the link.
  { id: "attributes", title: "Attributes", href: "/portal/attributes", icon: ClipboardList, permission: null },
  { id: "reports", title: "Reports", href: "/portal/reports", icon: BarChart3, permission: "reports" },
  { id: "seo", title: "SEO", href: "/portal/seo", icon: Search, permission: "seo" },
  {
    id: "finance", title: "Finance", href: "/portal/finance", icon: Wallet, permission: "finances",
    children: [
      { id: "finance-reports", title: "Finance Reports", href: "/portal/finance/reports", icon: Wallet, permission: "finances" },
      { id: "rev-calculator", title: "Rev Calculator", href: "/portal/tools/rev-calculator", icon: Calculator, permission: "finances" },
    ],
  },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageMeta = useSyncExternalStore(subscribePageMeta, getPageMeta, () => null);

  const user = session?.user;
  const isAdmin = hasAdminPowers(user?.role);
  const role = user?.role;

  /* ---- feedback dialog state (mirrors hub TopNav) ---- */
  const [reportOpen, setReportOpen] = useState(false);
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Screenshot too large (max 5MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const reportMutation = useMutation({
    mutationFn: async (data: { section: string; description: string; screenshotUrl?: string }) => {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to submit report");
      return res.json();
    },
    onSuccess: () => { toast.success("Feedback submitted — thank you!"); setDescription(""); setSection(""); setScreenshot(null); setReportOpen(false); },
    onError: () => toast.error("Failed to submit feedback"),
  });
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const isAdminPreview = !!(isAdmin && previewClient);
  const clientParam = usePortalClientParam();
  const { visible } = usePortalVisibleClients();
  const { data: assignedClients } = useQuery<{ clients: { clientIdCode: string; clientName: string }[] }>({
    queryKey: ["portal-me-clients", previewClient ?? "self"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/me/clients${isAdminPreview && previewClient ? portalClientQuery(previewClient) : ""}`);
      if (!res.ok) throw new Error("Failed to load assigned clients");
      return res.json();
    },
    staleTime: 120_000,
  });
  const clientNames = Object.fromEntries(
    (assignedClients?.clients ?? []).map((c) => [c.clientIdCode, c.clientName]),
  );
  const clientName = isAdmin
    ? previewClient
      ? CLIENT_NAMES[previewClient] || previewClient
      : "Admin Preview"
    : formatPortalClientBadge(visible, { ...CLIENT_NAMES, ...clientNames });
  const userAllowedSections = user?.allowedSections ?? [];

  // Same cache key as ClientDashboard / report controls — eye-toggle invalidates it.
  const { data: previewClients, isSuccess: previewClientsLoaded } = useQuery<
    { clientIdCode: string; allowedSections: string[] }[]
  >({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
  });
  const previewedClient = previewClients?.find((c) => c.clientIdCode === previewClient);
  // Once preview sections load, drop the admin bypass so nav matches dashboard cards.
  const useClientSections = isAdminPreview && previewClientsLoaded;
  const effectiveAllowedSections = useClientSections
    ? (previewedClient?.allowedSections ?? [])
    : userAllowedSections;
  const adminBypass = isAdmin && !useClientSections;

  const initials = (user?.name ?? user?.email ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const visibleNav = filterPortalNav(
    PORTAL_NAV,
    effectiveAllowedSections,
    adminBypass,
  );
  const showReportTabs = pathname.startsWith("/portal/reports");
  const visibleReportTabs = filterPortalReportTabs(
    PORTAL_REPORT_TABS,
    effectiveAllowedSections,
    adminBypass,
  );

  function isItemActive(item: PortalNavItem): boolean {
    if (item.children) {
      return item.children.some((child) => pathname.startsWith(child.href));
    }
    return item.href === "/portal"
      ? pathname === "/portal"
      : pathname.startsWith(item.href);
  }

  const opalActiveKey = visibleNav.find((item) => isItemActive(item))?.id ?? "";

  useEffect(() => {
    document.title = "1o8 Portal";
    return () => { document.title = "1o8 Hub"; };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="fixed inset-0 z-[-1] ambient-bg" />

      <header className="sticky top-0 z-50 w-full overflow-visible bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex">
          {/* ---- Wordmark container: spans all 3 rows, top-aligned ---- */}
          <Link
            href={`/portal${clientParam}`}
            className="hidden lg:flex items-center justify-center shrink-0 px-6 group"
          >
            <BrandLogo className="h-9 transition-transform group-hover:scale-105" />
          </Link>

          {/* ---- Right side: two stacked rows ---- */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Client badge + Utilities */}
            <div className="flex h-14 items-center px-4 lg:px-6">
              {/* Client badge */}
              <span className="inline-flex items-center rounded-lg bg-portal-accent/15 text-portal-accent px-2.5 py-1 text-xs font-semibold tracking-wide">
                {clientName}
              </span>

              {isAdmin && (
                <Link
                  href="/"
                  className="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-sidebar-foreground transition-colors"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to Hub</span>
                </Link>
              )}

              <div className="flex-1" />

              {/* ---- Right-side utilities (mirrors hub TopNav) ---- */}
              <div className="flex items-center gap-1.5">
                {/* Feedback button */}
                <Dialog
                  open={reportOpen}
                  onOpenChange={(open) => { setReportOpen(open); if (open) setSection(guessPortalSection(pathname)); }}
                >
                  <DialogTrigger asChild>
                    <button
                      className="rounded-md p-2 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                      title="Send feedback"
                      aria-label="Send feedback"
                    >
                      <MessageSquareText className="size-4" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <MessageSquareText className="size-4 text-portal-accent" />
                        Send Feedback
                      </DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!section || !description.trim()) return;
                        reportMutation.mutate({ section, description: description.trim(), ...(screenshot ? { screenshotUrl: screenshot } : {}) });
                      }}
                      className="space-y-4 pt-2"
                    >
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Section</label>
                        <select
                          value={section}
                          onChange={(e) => setSection(e.target.value)}
                          className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-portal-accent/50"
                        >
                          <option value="">Select section…</option>
                          {SECTION_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Description</label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Share your feedback, report a bug, or suggest an improvement…"
                          rows={4}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-portal-accent/50 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          Screenshot <span className="text-muted-foreground/60 font-normal">(optional — paste or upload)</span>
                        </label>
                        {screenshot ? (
                          <div className="relative rounded-md border border-border overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={screenshot} alt="Screenshot preview" className="w-full max-h-40 object-contain bg-muted/30" />
                            <button type="button" onClick={() => setScreenshot(null)} className="absolute top-1.5 right-1.5 rounded-full bg-background/80 p-1 hover:bg-background transition-colors">
                              <XIcon className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            onPaste={(e) => { const file = Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) handleFile(file); }}
                            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
                            onDragOver={(e) => e.preventDefault()}
                            tabIndex={0}
                            className="flex items-center justify-center gap-2 h-20 rounded-md border border-dashed border-border text-muted-foreground hover:border-portal-accent/50 hover:text-foreground cursor-pointer transition-colors text-xs"
                          >
                            <ImagePlus className="size-4" />
                            <span>Click, drag, or paste (Ctrl+V)</span>
                          </div>
                        )}
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }} />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setReportOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={!section || !description.trim() || reportMutation.isPending} className="bg-portal-accent text-white hover:bg-portal-accent/90">
                          {reportMutation.isPending ? "Submitting…" : "Submit Report"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="lg:hidden">
                  <ThemeToggle />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-sidebar-accent outline-none transition-colors">
                    <Avatar className="size-7">
                      <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ""} />
                      <AvatarFallback className="text-xs bg-portal-accent/15 text-portal-accent">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium hidden sm:inline text-sidebar-foreground">
                      {user?.name ?? user?.email}
                    </span>
                    {role && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-portal-accent/15 text-portal-accent border border-portal-accent/25">
                        {role}
                      </span>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>{user?.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
                      <LogOut className="mr-2 size-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger */}
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <button className="lg:hidden rounded-md p-2 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar" aria-label="Open menu">
                      <Menu className="size-5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 bg-sidebar border-sidebar-border text-sidebar-foreground p-0">
                    <SheetHeader className="p-4 border-b border-sidebar-border">
                      <SheetTitle className="text-left">
                        <Link href={`/portal${clientParam}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                          <span className="text-2xl font-[family-name:var(--font-outfit)] tracking-tighter">
                            <span className="font-bold text-sidebar-foreground">MF</span>
                            <span className="text-portal-accent">Portal</span>
                          </span>
                        </Link>
                      </SheetTitle>
                    </SheetHeader>
                    <nav className="overflow-y-auto max-h-[calc(100dvh-80px)] py-2">
                      {visibleNav.map((item) => {
                        const isActive = isItemActive(item);
                        if (item.children) {
                          return (
                            <Collapsible key={item.id} defaultOpen={isActive}>
                              <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-sidebar-foreground transition-colors group">
                                <item.icon className="size-4" />
                                {item.title}
                                <ChevronRight className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                {item.children.map((child) => {
                                  const childActive = pathname.startsWith(child.href);
                                  return (
                                    <Link
                                      key={child.id}
                                      href={`${child.href}${clientParam}`}
                                      onClick={() => setMobileOpen(false)}
                                      className={`flex items-center gap-2.5 pl-10 pr-4 py-2 text-sm font-medium transition-colors ${childActive ? "bg-portal-accent/10 text-portal-accent" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                                    >
                                      {child.title}
                                    </Link>
                                  );
                                })}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        }
                        return (
                          <Link
                            key={item.id}
                            href={`${item.href}${clientParam}`}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-portal-accent/10 text-portal-accent" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                          >
                            <item.icon className="size-4" />
                            {item.title}
                          </Link>
                        );
                      })}
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Row 2: page-header-slot + liquid-glass navigation (desktop) */}
            <nav className="hidden lg:flex items-center overflow-visible text-sm font-medium px-4 lg:px-6 py-1.5">
              <div id="page-header-slot" suppressHydrationWarning className="flex-1 flex items-center min-w-0" />
              <OpalNavFrame activeKey={opalActiveKey} tone="portal" themeToggle={<ThemeToggle />}>
              <NavigationMenu viewport={false} className="flex-none">
                <NavigationMenuList className="gap-0">
                  {visibleNav.map((item) => {
                    const isActive = isItemActive(item);
                    if (item.children) {
                      return (
                        <NavigationMenuItem key={item.id}>
                          <NavigationMenuTrigger data-opal-item="" data-opal-active={isActive ? "true" : "false"}>
                            <OpalItemInner icon={item.icon} label={item.title} />
                          </NavigationMenuTrigger>
                          <NavigationMenuContent>
                            <OpalMenu activeKey={pathname} tone="portal">
                              {item.children.map((child) => {
                                const childActive = pathname.startsWith(child.href);
                                return (
                                  <Link
                                    key={child.id}
                                    href={`${child.href}${clientParam}`}
                                    data-opal-option=""
                                    data-opal-active={childActive ? "true" : "false"}
                                  >
                                    <OpalItemInner icon={child.icon} label={child.title} align="start" />
                                  </Link>
                                );
                              })}
                            </OpalMenu>
                          </NavigationMenuContent>
                        </NavigationMenuItem>
                      );
                    }

                    return (
                      <NavigationMenuItem key={item.id}>
                        <NavigationMenuLink asChild active={isActive} data-opal-item="" data-opal-active={isActive ? "true" : "false"}>
                          <Link href={`${item.href}${clientParam}`}>
                            <OpalItemInner icon={item.icon} label={item.title} />
                          </Link>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    );
                  })}
                </NavigationMenuList>
              </NavigationMenu>
              </OpalNavFrame>
              <div className="flex-1" />
            </nav>

            {/* Row 3: Page meta slot (only renders when a page portals content into it) */}
            {pageMeta && (
              <div className="flex items-center gap-3 px-2 lg:px-3 py-0.5 border-t border-sidebar-border/40">
                {pageMeta}
              </div>
            )}

            {/* Row 4: report sub-nav — mirrors hub TopNav REPORT_TABS on /portal/reports/* */}
            {showReportTabs && visibleReportTabs.length > 0 && (
              <nav className="hidden lg:flex items-center justify-center pl-2 pr-4 lg:pl-3 lg:pr-6 border-t border-sidebar-border/40 overflow-x-auto">
                {visibleReportTabs.map((t) => {
                  const isActive = pathname === t.href;
                  return (
                    <Link
                      key={t.href}
                      href={`${t.href}${clientParam}`}
                      className={`inline-flex h-9 items-center px-4 text-sm font-medium whitespace-nowrap transition-colors
                        ${isActive
                          ? "text-portal-accent border-b-2 border-portal-accent"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1 overflow-auto px-6 pt-6 pb-6 lg:px-10 lg:pt-8 lg:pb-10 glass-panel">
        {children}
      </main>
    </div>
  );
}
