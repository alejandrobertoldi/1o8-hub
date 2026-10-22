/* eslint-disable react-doctor/no-prevent-default */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { helium10Enabled } from "@/lib/helium10/enabled";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useState, useRef, useCallback, useSyncExternalStore } from "react";
import { subscribePageMeta, getPageMeta } from "./page-meta-store";
import { subscribePageSubnav, getPageSubnav } from "./page-subnav-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { OpalItemInner, OpalMenu, OpalNavFrame } from "./opal-nav-frame";
import { canAccess, CROSS_DEPARTMENT_LINKS } from "@/lib/permissions";
import {
  Download, Users, UserCog, Activity, BarChart3, Key, ListChecks, FolderTree,
  ScrollText, DollarSign, Eye, GitCompare, GitBranch, LayoutTemplate,
  CalendarDays, Palette, Shield, RefreshCw, Headset, Sparkles,
  Search, ArrowRightLeft, TrendingUp, Package, PackageOpen, Layers,
  ShoppingBag, ClipboardList, Calculator, Boxes, BookOpen, ImageIcon,
  Store, Target, Menu, MessageSquareText, UserPlus, ImagePlus, Star,
  HelpCircle, X as XIcon, ChevronRight, Table, Clock, Tags, Contact, Gift, Plane, FileText, KeyRound, Percent, Presentation, LayoutDashboard, Mail, Megaphone, Globe, type LucideIcon,
  Handshake, LayoutGrid, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { isApprover, canSubmitTimeOff } from "@/lib/time-off/guards";
import { BetaPill } from "@/components/ui/beta-pill";

/* ---------- types ---------- */
type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  visible: boolean;
  iconClassName?: string;
  crossDept?: string[];
  children?: NavItem[];
  badge?: string;
  /** Shows a BETA pill: the section works but is not final. */
  beta?: boolean;
};
type NavSection = { label: string; icon: LucideIcon; items: NavItem[]; defaultOpen?: boolean; linkWhenSingle?: boolean };

/* ---------- feedback section options ---------- */
const SECTION_OPTIONS = [
  "Products", "A+ Content", "SEO Manager", "Amazon Sync",
  "Publishing", "Portal", "Reports / Export", "Holiday Deals", "Admin", "Other",
];

function guessSection(pathname: string): string {
  if (pathname.startsWith("/products")) return "Products";
  if (pathname.startsWith("/aplus") || pathname.startsWith("/design/aplus2")) return "A+ Content";
  if (pathname.startsWith("/seo")) return "SEO Manager";
  if (pathname.startsWith("/amazon-sync")) return "Amazon Sync";
  if (pathname.startsWith("/publish")) return "Publishing";
  if (pathname.startsWith("/portal")) return "Portal";
  if (pathname.startsWith("/reports") || pathname.startsWith("/export")) return "Reports / Export";
  if (pathname.startsWith("/case-studies")) return "Case Studies";
  if (pathname.startsWith("/holiday-deals")) return "Holiday Deals";
  if (pathname.startsWith("/admin")) return "Admin";
  return "Other";
}

/* ---- v2 report suite tabs — shown in the nav row only on /reports/* ---- */
const REPORT_TABS = [
  { label: "Overview", href: "/reports/overview" },
  { label: "Advertising Audit", href: "/reports/advertising-audit" },
  { label: "Inventory", href: "/reports/inventory" },
  { label: "Geography", href: "/reports/order-geography" },
  { label: "Period Comparative", href: "/reports/period-comparative" },
  { label: "Share of Voice", href: "/reports/share-of-voice" },
  { label: "Subscribe & Save", href: "/reports/subscribe-save" },
];

/* ========================================================== */
export function TopNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const pageMeta = useSyncExternalStore(subscribePageMeta, getPageMeta, () => null);
  const pageSubnav = useSyncExternalStore(subscribePageSubnav, getPageSubnav, () => null);
  const role = session?.user?.role;
  const isAdmin = hasAdminPowers(role);
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const allowedSections = session?.user?.allowedSections ?? [];
  const checkAccess = (section: string) => canAccess(section, allowedSections, isAdmin);

  /* ---- feedback dialog state ---- */
  const [reportOpen, setReportOpen] = useState(false);
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Screenshot too large (max 5MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const { data: pendingData } = useQuery({
    queryKey: ["pending-users-count"],
    queryFn: async () => { const r = await fetch("/api/admin/pending-users"); return r.json() as Promise<{ count: number }>; },
    enabled: isAdmin, refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.count ?? 0;

  const { data: issuesData } = useQuery({
    queryKey: ["open-issues-count"],
    queryFn: async () => { const r = await fetch("/api/support?count=open"); return r.json() as Promise<{ count: number }>; },
    enabled: isAdmin, refetchInterval: 30_000,
  });
  const openIssues = issuesData?.count ?? 0;

  const isApproverUser = isApprover(session?.user?.email);
  const { data: timeOffPendingData } = useQuery({
    queryKey: ["time-off-pending-count"],
    queryFn: async () => {
      const r = await fetch("/api/time-off/pending-count");
      return r.json() as Promise<{ count: number }>;
    },
    enabled: isApproverUser,
    refetchInterval: 30_000,
  });
  const timeOffPendingCount = timeOffPendingData?.count ?? 0;

  const reportMutation = useMutation({
    mutationFn: async (data: { section: string; description: string; screenshotUrl?: string }) => {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to submit report");
      return res.json();
    },
    onSuccess: () => { toast.success("Feedback submitted — thank you!"); setDescription(""); setSection(""); setScreenshot(null); setReportOpen(false); },
    onError: () => toast.error("Failed to submit feedback"),
  });

  /* ---- cross-dept helper ---- */
  function getCrossDeptLabels(subsectionId: string, currentDept: string): string[] {
    const links = CROSS_DEPARTMENT_LINKS[subsectionId];
    if (!links) return [];
    return links.filter((l) => l.dept !== currentDept).map((l) => l.label);
  }

  /* ---- top-level items ---- */
  const topLevelItems: NavItem[] = [
    { title: "My Dashboard", href: "/me", icon: LayoutDashboard, visible: isHubStaff(role) },
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
  ];
  // Rendered standalone at the right end of the nav (after the section dropdowns).
  const helpItem: NavItem = { title: "Help", href: "/help", icon: HelpCircle, visible: true };

  /* ---- sections ---- */
  const sections: NavSection[] = [
    {
      label: "Team", icon: Contact,
      items: [
        { title: "Directory", href: "/team", icon: Contact, visible: isHubStaff(role) },
        { title: "Assignments", href: "/team/assignments", icon: LayoutGrid, visible: isHubStaff(role) },
        { title: "Readiness", href: "/team/readiness", icon: Gauge, visible: isHubStaff(role) },
      ],
    },
    {
      label: "Hours", icon: Clock, linkWhenSingle: true,
      items: [
        { title: "My timesheet", href: "/hours", icon: Clock, visible: isHubStaff(role) },
        { title: "Hours insights", href: "/hours/insights", icon: BarChart3, visible: isAdmin },
        { title: "Time off requests", href: "/calendar/requests", icon: Plane, visible: !!role && canSubmitTimeOff(role) },
      ],
    },
    {
      label: "Clients", icon: Users,
      items: [
        { title: "Client Onboarding", href: "/onboarding", icon: ClipboardList, visible: isAdmin },
        { title: "Client Summary", href: "/", icon: Users, visible: true },
        { title: "Brand Guidelines", href: "/clients/brand-guidelines", icon: BookOpen, visible: true },
        { title: "Client Timelines", href: "/timeline", icon: CalendarDays, visible: isAdmin },
        { title: "Client Reports", href: "/reports", icon: BarChart3, visible: checkAccess("reports"), crossDept: getCrossDeptLabels("reports", "clients") },
        { title: "Monthly Report", href: "/reports/monthly", icon: FileText, visible: isHubStaff(role) },
        { title: "Case Studies", href: "/case-studies", icon: Presentation, visible: isHubStaff(role) },
        { title: "Client Portal", href: "/portal", icon: Eye, visible: isAdmin },
      ],
    },
    {
      label: "Email", icon: Mail,
      items: [
        { title: "Send dates", href: "/email/send-dates", icon: CalendarDays, visible: isHubStaff(role) },
      ],
    },
    {
      label: "Paid Media", icon: Megaphone,
      items: [
        { title: "Campaign calendar", href: "/paid-media/campaigns", icon: CalendarDays, visible: isHubStaff(role) },
      ],
    },
    {
      label: "Web", icon: Globe,
      items: [
        { title: "Launch calendar", href: "/web/launches", icon: CalendarDays, visible: isHubStaff(role) },
      ],
    },
    {
      label: "SEO", icon: Search,
      items: [
        { title: "SEO Dashboard", href: "/seo", icon: BarChart3, visible: checkAccess("seo") },
        { title: "SEO Manager", href: "/seo/manager", icon: Search, visible: checkAccess("seo") },
        { title: "Guidelines", href: "/guidelines", icon: ScrollText, visible: checkAccess("seo") || isAdmin },
        { title: "SEO Config", href: "/seo/config", icon: Sparkles, visible: isAdmin },
      ],
    },
    {
      label: "Finances", icon: DollarSign,
      items: [
        { title: "Finance Reports", href: "/finances", icon: BarChart3, visible: checkAccess("finances") },
        { title: "Rev Calculator", href: "/tools/rev-calculator", icon: Calculator, visible: checkAccess("finances") },
      ],
    },
    {
      label: "Tables", icon: Table,
      items: [
        { title: "AAC Table", href: "/clients/aac", icon: Table, visible: true },
      ],
    },
    {
      label: "Admin", icon: Shield,
      items: [
        { title: "Activity", href: "/activity", icon: Activity, visible: checkAccess("activity") },
        { title: "Import", href: "/import", icon: Download, visible: checkAccess("import") },
        { title: "Sync & Export", href: "/publish", icon: RefreshCw, visible: checkAccess("publish") },
        { title: "Users", href: "/admin/users", icon: UserCog, visible: isAdmin },
        { title: "Service Providers", href: "/admin/service-providers", icon: Handshake, visible: isAdmin },
        { title: "Shared Logins", href: "/admin/logins", icon: KeyRound, visible: true },
        { title: "Helium 10", href: "/admin/helium10", icon: Key, visible: isAdmin && helium10Enabled() },
        { title: "Observability", href: "/admin/observability", icon: Activity, visible: isAdmin },
        { title: "Event Logs", href: "/admin/logs", icon: ScrollText, visible: isAdmin },
        { title: "Holidays", href: "/admin/holidays", icon: Gift, visible: isAdmin },
        { title: "Support", href: "/admin/support", icon: Headset, visible: true },
        { title: "App Repo", href: "/admin/repo", icon: GitBranch, visible: isAdmin },
        { title: "Data Map", href: "/admin/data-map", icon: GitBranch, visible: isAdmin },
        { title: "AI Config", href: "/admin/ai", icon: Sparkles, visible: isAdmin },
        { title: "Asana Config", href: "/admin/asana", icon: ClipboardList, visible: isAdmin },
        { title: "Drive Folder Tree", href: "/admin/drive-folder-config", icon: FolderTree, visible: isAdmin },
        { title: "Data Sync", href: "/admin/sync", icon: ArrowRightLeft, visible: isAdmin },
      ],
    },
  ];

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.visible) }))
    .filter((s) => s.items.length > 0);

  const isSectionActive = (sec: NavSection) =>
    sec.items.some((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  const opalActiveKey =
    topLevelItems.find((i) => i.visible && pathname.startsWith(i.href))?.href ??
    visibleSections.find((s) => isSectionActive(s))?.label ??
    (pathname.startsWith(helpItem.href) ? helpItem.href : "");

  /* ========== RENDER ========== */
  return (
    <header className="sticky top-0 z-50 w-full overflow-visible bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
      <div className="flex">
        {/* ---- Wordmark container: spans both rows ---- */}
        <Link
          href="/"
          className="hidden lg:flex items-center justify-center shrink-0 px-6 group"
        >
          <BrandLogo className="h-9 transition-transform group-hover:scale-105" />
        </Link>

        {/* ---- Right side: two stacked rows ---- */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Utilities */}
          <div className="flex h-14 items-center px-4 lg:px-6">
            {/* Spacer */}
            <div className="flex-1" />

        {/* ---- Right-side utilities ---- */}
        <div className="flex items-center gap-1.5">
          {/* Search trigger */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden md:flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          >
            <Search className="size-3.5" />
            <span>Search…</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border border-sidebar-border bg-sidebar-accent px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          {/* Open issues alert */}
          {isAdmin && openIssues > 0 && (
            <Link
              href="/admin/issues"
              className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors text-xs font-medium"
              title={`${openIssues} open feedback item${openIssues > 1 ? "s" : ""}`}
            >
              <MessageSquareText className="size-3.5" />
              <span>{openIssues}</span>
            </Link>
          )}

          {/* Pending users alert */}
          {isAdmin && pendingCount > 0 && (
            <Link
              href="/admin/users"
              className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-amber-800 bg-amber-100 hover:bg-amber-200 dark:text-amber-400 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 transition-colors text-xs font-medium"
              title={`${pendingCount} pending access request${pendingCount > 1 ? "s" : ""}`}
            >
              <UserPlus className="size-3.5" />
              <span>{pendingCount}</span>
            </Link>
          )}

          {/* Pending time-off requests alert (approver only) */}
          {isApproverUser && timeOffPendingCount > 0 && (
            <Link
              href="/calendar/requests"
              className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-violet-700 bg-violet-50 hover:bg-violet-100 dark:text-violet-400 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 transition-colors text-xs font-medium"
              title={`${timeOffPendingCount} pending time-off request${timeOffPendingCount > 1 ? "s" : ""}`}
            >
              <Plane className="size-3.5" />
              <span>{timeOffPendingCount}</span>
            </Link>
          )}

          {/* Feedback button */}
          <Dialog
            open={reportOpen}
            onOpenChange={(open) => { setReportOpen(open); if (open) setSection(guessSection(pathname)); }}
          >
            <DialogTrigger asChild>
              <button
                className="rounded-md p-2 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                title="Send feedback"
                aria-label="Send feedback"
              >
                <MessageSquareText className="size-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-brand" />
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
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
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
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
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
                      className="flex items-center justify-center gap-2 h-20 rounded-md border border-dashed border-border text-muted-foreground hover:border-brand/50 hover:text-foreground cursor-pointer transition-colors text-xs"
                    >
                      <ImagePlus className="size-4" />
                      <span>Click, drag, or paste (Ctrl+V)</span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReportOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={!section || !description.trim() || reportMutation.isPending} className="bg-brand-solid text-white hover:bg-brand-solid-hover">
                    {reportMutation.isPending ? "Submitting…" : "Submit Report"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className="lg:hidden">
            <ThemeToggle />
          </div>
          <UserMenu />

          {/* ---- Mobile hamburger ---- */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="lg:hidden rounded-md p-2 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar" aria-label="Open menu">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar border-sidebar-border text-sidebar-foreground p-0">
              <SheetHeader className="p-4 border-b border-sidebar-border">
                <SheetTitle className="text-left">
                  <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                    <span className="text-2xl font-[family-name:var(--font-outfit)] tracking-tighter">
                      <span className="font-bold text-sidebar-foreground">MF</span>
                      <span className="text-brand">Hub</span>
                    </span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <nav className="overflow-y-auto max-h-[calc(100dvh-80px)] py-2">
                {/* Top-level standalone items */}
                {topLevelItems.filter((i) => i.visible).map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${isActive ? "bg-brand/15 text-brand" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                    >
                      <item.icon className="size-4" />
                      {item.title}
                    </Link>
                  );
                })}

                <div className="h-px bg-sidebar-border mx-4 my-2" />

                {/* Collapsible sections */}
                {visibleSections.map((sec) => {
                  const sectionActive = isSectionActive(sec);
                  if (sec.linkWhenSingle && sec.items.length === 1) {
                    const only = sec.items[0];
                    const isActive = pathname.startsWith(only.href);
                    return (
                      <Link
                        key={sec.label}
                        href={only.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${isActive ? "bg-brand/15 text-brand" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                      >
                        <only.icon className="size-4" />
                        {only.title}
                        {only.beta && <BetaPill />}
                      </Link>
                    );
                  }
                  return (
                    <Collapsible key={sec.label} defaultOpen={sectionActive}>
                      <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-sidebar-foreground transition-colors group">
                        <sec.icon className="size-3.5" />
                        {sec.label}
                        <ChevronRight className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {sec.items.map((item) => {
                          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileOpen(false)}
                              className={`flex items-center gap-2.5 pl-10 pr-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${isActive ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                            >
                              <item.icon className={`size-3.5 shrink-0 ${item.iconClassName ?? ""}`} />
                              {item.title}
                              {item.beta && <BetaPill />}
                            </Link>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}

                {/* Help — standalone, after sections */}
                <div className="h-px bg-sidebar-border mx-4 my-2" />
                {(() => {
                  const isActive = pathname.startsWith(helpItem.href);
                  return (
                    <Link
                      href={helpItem.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${isActive ? "bg-brand/15 text-brand" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                    >
                      <helpItem.icon className="size-4" />
                      {helpItem.title}
                    </Link>
                  );
                })()}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

          {/* Row 2: Centered liquid-glass navigation (desktop) */}
          <nav className="hidden lg:flex items-center overflow-visible text-sm font-medium px-4 lg:px-6 relative z-50 py-1.5">
            <div id="page-header-slot" suppressHydrationWarning className="flex-1 flex items-center min-w-0" />
        <OpalNavFrame activeKey={opalActiveKey} themeToggle={<ThemeToggle />}>
        <NavigationMenu viewport={false} className="flex-none">
          <NavigationMenuList className="gap-0">
            {/* Top-level standalone items */}
            {topLevelItems.filter((i) => i.visible).map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink asChild active={isActive} data-opal-item="" data-opal-active={isActive ? "true" : "false"}>
                    <Link href={item.href}>
                      <OpalItemInner icon={item.icon} label={item.title} />
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}

            {/* Section dropdown menus */}
            {visibleSections.map((sec, idx) => {
              if (sec.linkWhenSingle && sec.items.length === 1) {
                const only = sec.items[0];
                const isActive = pathname.startsWith(only.href);
                return (
                  <NavigationMenuItem key={sec.label}>
                    <NavigationMenuLink asChild active={isActive} data-opal-item="" data-opal-active={isActive ? "true" : "false"}>
                      <Link href={only.href}>
                        <OpalItemInner icon={only.icon} label={only.title} beta={only.beta} />
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              }
              const alignEnd = idx >= visibleSections.length - 2;
              const sectionActive = isSectionActive(sec);
              return (
                <NavigationMenuItem key={sec.label}>
                  <NavigationMenuTrigger data-opal-item="" data-opal-active={sectionActive ? "true" : "false"}>
                    <OpalItemInner icon={sec.icon} label={sec.label} />
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className={alignEnd ? "left-auto right-0 origin-top-right" : undefined}>
                    <OpalMenu activeKey={pathname}>
                      {sec.items.map((item) => {
                        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            data-opal-option=""
                            data-opal-active={isActive ? "true" : "false"}
                          >
                            <OpalItemInner icon={item.icon} label={item.title} align="start" beta={item.beta} />
                          </Link>
                        );
                      })}
                    </OpalMenu>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              );
            })}

            {/* Help — pinned to the right of the nav */}
            <NavigationMenuItem>
              <NavigationMenuLink asChild active={pathname.startsWith(helpItem.href)} data-opal-item="" data-opal-active={pathname.startsWith(helpItem.href) ? "true" : "false"}>
                <Link href={helpItem.href}>
                  <OpalItemInner icon={helpItem.icon} label={helpItem.title} />
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        </OpalNavFrame>
            <div className="flex-1" />
          </nav>

          {/* Row 3: Page meta — rendered from store, no portal, no hydration mismatch */}
          {pageMeta && (
            <div className="flex items-center justify-between gap-4 pl-2 pr-4 lg:pl-3 lg:pr-6 py-0.5 border-t border-sidebar-border/40">
              {pageMeta}
            </div>
          )}

          {/* Row 4: page-owned subnav (monthly TOC) wins over the v2 report tabs.
              /reports/monthly is not a v2 report, so those tabs stay hidden there. */}
          {pageSubnav ? (
            <div className="border-t border-sidebar-border/40">
              {pageSubnav}
            </div>
          ) : pathname.startsWith("/reports") && !pathname.startsWith("/reports/monthly") ? (
            <nav className="hidden lg:flex items-center justify-center pl-2 pr-4 lg:pl-3 lg:pr-6 border-t border-sidebar-border/40 overflow-x-auto">
              {REPORT_TABS.map((t) => {
                const isActive = pathname === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`inline-flex h-9 items-center px-4 text-sm font-medium whitespace-nowrap transition-colors
                      ${isActive
                        ? "text-brand border-b-2 border-brand"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  );
}
