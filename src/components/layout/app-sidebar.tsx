/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { helium10Enabled } from "@/lib/helium10/enabled";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Handshake, Users, UserCog, Activity, BarChart3, Key, KeyRound, ListChecks, ScrollText, DollarSign, Eye, ChevronRight, GitCompare, GitBranch, LayoutTemplate, CalendarDays, Palette, Shield, RefreshCw, Headset, Sparkles, Search, ArrowRightLeft, TrendingUp, Package, PackageOpen, Layers, ShoppingBag, ClipboardList, Calculator, Boxes, BookOpen, ImageIcon, Store, Target, Clock, Tags, Percent, type LucideIcon } from "lucide-react";
import { canAccess, CROSS_DEPARTMENT_LINKS } from "@/lib/permissions";

export function AppSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user?.role;

  const allowedSections = session?.user?.allowedSections ?? [];
  const isAdmin = hasAdminPowers(role);
  const checkAccess = (section: string) => canAccess(section, allowedSections, isAdmin);

  type NavItem = {
    title: string;
    href: string;
    icon: LucideIcon;
    visible: boolean;
    iconClassName?: string;
    /** Cross-department connection labels */
    crossDept?: string[];
    /** L2 sub-items */
    children?: NavItem[];
    /** Badge text (e.g. "soon") */
    badge?: string;
  };
  type NavSection = { label: string; icon: LucideIcon; items: NavItem[]; defaultOpen?: boolean };

  const topLevelItems: NavItem[] = [
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
    { title: "Hours", href: "/hours-log", icon: Clock, visible: isHubStaff(role) },
  ];

  /** Resolve cross-department labels for a subsection ID */
  function getCrossDeptLabels(subsectionId: string, currentDept: string): string[] {
    const links = CROSS_DEPARTMENT_LINKS[subsectionId];
    if (!links) return [];
    return links
      .filter((l) => l.dept !== currentDept)
      .map((l) => l.label);
  }

  const sections: NavSection[] = [
    {
      label: "Clients",
      icon: Users,
      items: [
        { title: "Client Onboarding", href: "/onboarding", icon: ClipboardList, visible: isAdmin },
        { title: "Client Summary", href: "/clients", icon: Users, visible: true },
        { title: "Brand Guidelines", href: "/clients/brand-guidelines", icon: BookOpen, visible: true },
        { title: "Client Timelines", href: "/timeline", icon: CalendarDays, visible: isAdmin },
        { title: "Client Reports", href: "/reports", icon: BarChart3, visible: checkAccess("reports"), crossDept: getCrossDeptLabels("reports", "clients") },
        { title: "Client Portal", href: "/portal", icon: Eye, visible: isAdmin },
      ],
    },
    {
      label: "Catalog",
      icon: Package,
      items: [
        { title: "Products", href: "/products", icon: ShoppingBag, visible: checkAccess("catalog") || isAdmin },
        { title: "Variations", href: "/variations", icon: Layers, visible: checkAccess("catalog") || isAdmin },
        { title: "Variety Packs", href: "/variety-packs", icon: PackageOpen, iconClassName: "text-brand-vp", visible: checkAccess("catalog") || isAdmin },
        { title: "Amazon Sync", href: "/amazon-sync", icon: GitCompare, visible: checkAccess("sync") },
        { title: "Attributes", href: "/admin/attributes", icon: ListChecks, visible: isAdmin },
        { title: "AttributesMaster Table", href: "/attributesMaster", icon: ScrollText, visible: checkAccess("catalog") || isAdmin },
        { title: "Attribute Audit", href: "/attribute-audit", icon: ClipboardList, visible: checkAccess("catalog") || isAdmin },
      ],
    },
    {
      label: "Design",
      icon: Palette,
      items: [
        { title: "Overview", href: "/design", icon: Palette, visible: checkAccess("aplus") },
        { title: "Brand Story", href: "/design/brand-story", icon: BookOpen, visible: checkAccess("aplus") },
        { title: "A+ Content", href: "/design/aplus2", icon: LayoutTemplate, visible: checkAccess("aplus"), crossDept: getCrossDeptLabels("aplus", "design") },
        { title: "Listing Images", href: "/design/listing-images", icon: ImageIcon, visible: checkAccess("aplus") },
        { title: "Storefront", href: "/design/storefront", icon: Store, visible: checkAccess("aplus") },
      ],
    },
    {
      label: "PPC",
      icon: TrendingUp,
      items: [
        { title: "PPC Performance", href: "/ppc", icon: Target, visible: checkAccess("sales") },
        { title: "Holiday Deals", href: "/holiday-deals", icon: Percent, visible: checkAccess("sales") },
        { title: "Sales", href: "/sales-summary", icon: DollarSign, visible: checkAccess("sales"), crossDept: getCrossDeptLabels("sales", "ppc"), children: [
          { title: "Sales Monitor", href: "/sales-monitor", icon: BarChart3, visible: checkAccess("sales") },
          { title: "Sales Summary", href: "/sales-summary", icon: DollarSign, visible: checkAccess("sales") },
        ]},
        { title: "Forecast", href: "/sales-summary/forecast", icon: TrendingUp, visible: checkAccess("sales"), children: [
          { title: "Forecast Tool", href: "/sales-summary/forecast-tool", icon: Sparkles, visible: checkAccess("sales") },
          { title: "Inventory", href: "/inventory", icon: Boxes, visible: checkAccess("sales") },
          { title: "Sales Forecast", href: "/sales-summary/forecast", icon: TrendingUp, visible: checkAccess("sales") },
        ]},
      ],
    },
    {
      label: "SEO",
      icon: Search,
      items: [
        { title: "SEO Dashboard", href: "/seo", icon: BarChart3, visible: checkAccess("seo") },
        { title: "SEO Manager", href: "/seo/manager", icon: Search, visible: checkAccess("seo") },
        { title: "Guidelines", href: "/guidelines", icon: ScrollText, visible: checkAccess("seo") || checkAccess("catalog") || isAdmin },
        { title: "SEO Config", href: "/seo/config", icon: Sparkles, visible: isAdmin },
      ],
    },
    {
      label: "Finances",
      icon: DollarSign,
      items: [
        { title: "Finance Reports", href: "/finances", icon: BarChart3, visible: checkAccess("finances") },
        { title: "Rev Calculator", href: "/tools/rev-calculator", icon: Calculator, visible: checkAccess("finances") },
      ],
    },
    {
      label: "Admin",
      icon: Shield,
      items: [
        { title: "Activity", href: "/activity", icon: Activity, visible: checkAccess("activity") },
        { title: "Import", href: "/import", icon: Download, visible: checkAccess("import") },
        { title: "Sync & Export", href: "/publish", icon: RefreshCw, visible: checkAccess("publish") },
        { title: "Users", href: "/admin/users", icon: UserCog, visible: isAdmin },
        { title: "Service Providers", href: "/admin/service-providers", icon: Handshake, visible: isAdmin },
        { title: "SP-API Credentials", href: "/admin/sp-api", icon: Key, visible: isAdmin },
        { title: "Shared Logins", href: "/admin/logins", icon: KeyRound, visible: true },
        { title: "Helium 10", href: "/admin/helium10", icon: Key, visible: isAdmin && helium10Enabled() },
        { title: "Observability", href: "/admin/observability", icon: Activity, visible: isAdmin },
        { title: "Event Logs", href: "/admin/logs", icon: ScrollText, visible: isAdmin },
        { title: "Support", href: "/admin/support", icon: Headset, visible: true },
        { title: "App Repo", href: "/admin/repo", icon: GitBranch, visible: isAdmin },
        { title: "AI Config", href: "/admin/ai", icon: Sparkles, visible: isAdmin },
        { title: "Asana Config", href: "/admin/asana", icon: ClipboardList, visible: isAdmin },
        { title: "Data Sync", href: "/admin/sync", icon: ArrowRightLeft, visible: isAdmin },
        { title: "Hour Categories", href: "/admin/hour-categories", icon: Tags, visible: isAdmin },
      ],
    },
  ];

  // Filter out sections where no items are visible
  const visibleSections = sections
    .map((s) => ({
      ...s,
      items: s.items
        .filter((i) => i.visible)
        .map((i) => i.children ? { ...i, children: i.children.filter((c) => c.visible) } : i),
    }))
    .filter((s) => s.items.length > 0);

  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => {
      const selfActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      const childActive = item.children?.some((c) => pathname.startsWith(c.href)) ?? false;
      return selfActive || childActive;
    }
    );

  const activeIndicator = "relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-brand";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3.5 group">
          <BrandLogo className="h-7 transition-transform group-hover:scale-105" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {/* Top-level standalone items */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topLevelItems
                .filter((item) => item.visible)
                .map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={isActive ? activeIndicator : ""}
                      >
                        <Link href={item.href}>
                          <item.icon className={`size-4 ${item.iconClassName ?? ""}`} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="gold-line mx-4 my-1" />

        {/* Collapsible section groups */}
        <TooltipProvider delayDuration={300}>
          {visibleSections.map((section) => {
            const sectionActive = isSectionActive(section);
            return (
              <SidebarGroup key={section.label} className="py-0.5">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <Collapsible asChild defaultOpen={sectionActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="text-muted-foreground hover:text-foreground">
                            <section.icon className="size-4 text-black/70 dark:text-zinc-400" />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/70 dark:text-zinc-400">{section.label}</span>
                            <ChevronRight className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {section.items.map((item) => {
                              const isActive = item.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(item.href);
                              const childActive = item.children?.some((c) => pathname.startsWith(c.href)) ?? false;

                              // L1 item with L2 children
                              if (item.children && item.children.length > 0) {
                                return (
                                  <Collapsible key={item.href} defaultOpen={isActive || childActive} className="group/l2">
                                    <SidebarMenuSubItem>
                                      <CollapsibleTrigger asChild>
                                        <SidebarMenuSubButton
                                          className={`cursor-pointer ${isActive || childActive ? activeIndicator : ""}`}
                                        >
                                          <item.icon className={`size-3.5 ${item.iconClassName ?? ""}`} />
                                          <span>{item.title}</span>
                                          <ChevronRight className="ml-auto size-3 transition-transform group-data-[state=open]/l2:rotate-90" />
                                        </SidebarMenuSubButton>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <SidebarMenuSub>
                                          {item.children.map((child) => {
                                            const cActive = pathname.startsWith(child.href);
                                            return (
                                              <SidebarMenuSubItem key={child.href}>
                                                <SidebarMenuSubButton
                                                  asChild={!child.badge}
                                                  isActive={cActive}
                                                  size="sm"
                                                  className={`[&>span]:whitespace-normal ${cActive ? activeIndicator : ""} ${child.badge ? "opacity-50 cursor-default" : ""}`}
                                                >
                                                  {child.badge ? (
                                                    <span className="flex items-center gap-1">
                                                      <child.icon className="size-3" />
                                                      <span>{child.title}</span>
                                                      <Badge variant="outline" className="ml-auto text-[8px] px-1 py-0 h-3.5 font-normal">{child.badge}</Badge>
                                                    </span>
                                                  ) : (
                                                    <Link href={child.href} className="flex items-center gap-1">
                                                      <child.icon className="size-3" />
                                                      <span>{child.title}</span>
                                                    </Link>
                                                  )}
                                                </SidebarMenuSubButton>
                                              </SidebarMenuSubItem>
                                            );
                                          })}
                                        </SidebarMenuSub>
                                      </CollapsibleContent>
                                    </SidebarMenuSubItem>
                                  </Collapsible>
                                );
                              }

                              // Regular L1 item (no children)
                              return (
                                <SidebarMenuSubItem key={item.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isActive}
                                    className={isActive ? activeIndicator : ""}
                                  >
                                    <Link href={item.href} className="flex items-center gap-1">
                                      <item.icon className={`size-3.5 ${item.iconClassName ?? ""}`} />
                                      <span>{item.title}</span>
                                      {item.crossDept && item.crossDept.length > 0 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/20">
                                              +{item.crossDept.length}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent side="right">
                                            <p className="text-xs">Also in: {item.crossDept.join(", ")}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </TooltipProvider>

      </SidebarContent>
    </Sidebar>
  );
}
