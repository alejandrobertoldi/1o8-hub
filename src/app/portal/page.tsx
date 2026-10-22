/* eslint-disable react-doctor/design-no-space-on-flex-children */
/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { hasAdminPowers } from "@/lib/roles";
import {
  DollarSign,
  BarChart3,
  Search,
  ArrowRight,
  Users,
  Eye,
  EyeOff,
  Settings2,
  ChevronDown,
  ChevronRight,
  Wallet,
  Activity,
  Package,
  Clock,
  Palette,
  X,
  Trash2, Star } from "lucide-react";
import { ActivityFeed } from "@/components/portal/activity-feed";
import { ClientSectionsSheet } from "@/components/portal/client-sections-sheet";
import { PortalClientPicker } from "@/components/portal/portal-client-picker";
import { PortalClientSection } from "@/components/portal/portal-stacked-clients";
import { usePortalVisibleClients, usePortalClientParam } from "@/components/portal/portal-visible-clients";
import { formatPortalClientBadge } from "@/lib/client-codes";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { CLIENT_NAMES } from "@/lib/constants";
import { canAccess } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";

// ── Portal section cards (what clients see) ─────────────────────

const SECTION_CARDS = [
  {
    id: "timeline",
    title: "Timeline",
    description: "Track project milestones, deliverables, and progress updates.",
    icon: Clock,
    href: "/portal/timeline",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    borderColor: "hover:border-indigo-500/30",
    permission: "timeline",
  },
  {
    id: "sales",
    title: "Sales",
    description: "Sales performance, inventory, forecasts, and monitoring.",
    icon: DollarSign,
    href: "/portal/sales",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    borderColor: "hover:border-emerald-500/30",
    permission: "sales",
  },
  {
    id: "products",
    title: "Product Catalog",
    description: "Browse your product catalog — ASINs, SKUs, status, and details.",
    icon: Package,
    href: "/portal/products",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    borderColor: "hover:border-orange-500/30",
    permission: "products",
  },
  {
    id: "reviews",
    title: "Customer Reviews",
    description: "What Amazon shoppers say — ratings, themes, and recent reviews per product.",
    icon: Star,
    href: "/portal/reviews",
    color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    borderColor: "hover:border-yellow-500/30",
    permission: "reviews",
  },
  {
    id: "seo",
    title: "SEO Projects",
    description: "Track SEO content pipeline progress for your products.",
    icon: Search,
    href: "/portal/seo",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    borderColor: "hover:border-blue-500/30",
    permission: "seo",
  },
  {
    id: "design",
    title: "Design",
    description: "Brand story, A+ content, listing images, and storefront design.",
    icon: Palette,
    href: "/portal/design",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    borderColor: "hover:border-amber-500/30",
    permission: "design",
  },
  {
    id: "reports",
    title: "Reports",
    description: "Access your performance reports and analytics.",
    icon: BarChart3,
    href: "/portal/reports",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    borderColor: "hover:border-violet-500/30",
    permission: "reports",
  },
  {
    id: "finances",
    title: "Finance",
    description: "Track revenue, fees, ad spend pacing, and net proceeds.",
    icon: Wallet,
    href: "/portal/finance",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    borderColor: "hover:border-cyan-500/30",
    permission: "finances",
  },
] as const;

// For prospects, each card links straight to its showcase screen (skipping
// allowed_sections-gated sub-landings). Keys match SECTION_CARDS ids.
const PROSPECT_SHOWCASE_HREF: Record<string, string> = {
  timeline: "/portal/timeline",
  sales: "/portal/sales/overview",
  products: "/portal/products",
  reviews: "/portal/reviews",
  seo: "/portal/seo",
  design: "/portal/design",
  reports: "/portal/reports",
  finances: "/portal/finance/reports",
};

// ── Types ───────────────────────────────────────────────────────

type ClientSummary = {
  clientIdCode: string;
  clientName: string;
  count: number;
  activeCount: number;
  userCount: number;
  allowedSections: string[];
  clientStatus?: string | null;
};

type ClientUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  allowedSections: string[];
  clientIdCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

// ── Client Dashboard (what client users see) ────────────────────

function ClientDashboard() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const user = session?.user;
  const isAdmin = hasAdminPowers(user?.role);
  const isProspect = user?.clientStatus === "Prospect";
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const isAdminPreview = !!(isAdmin && previewClient);
  const { visible } = usePortalVisibleClients();
  const { data: assignedPayload } = useQuery<{
    clients: Array<{ clientIdCode: string; clientName: string; allowedSections: string[] }>;
  }>({
    queryKey: ["portal-me-clients", "self"],
    queryFn: async () => {
      const res = await fetch("/api/portal/me/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
    enabled: !isAdminPreview,
    staleTime: 120_000,
  });
  const assignedNames = Object.fromEntries(
    (assignedPayload?.clients ?? []).map((c) => [c.clientIdCode, c.clientName]),
  );
  const clientName = isAdmin
    ? previewClient
      ? CLIENT_NAMES[previewClient] || previewClient
      : "Admin Preview"
    : formatPortalClientBadge(visible, { ...CLIENT_NAMES, ...assignedNames });
  const userAllowedSections = user?.allowedSections ?? [];
  const clientParam = usePortalClientParam();

  // In admin preview, resolve sections from the previewed client's aac.allowed_sections.
  // Shares the same cache key as AdminPortalLanding for a free cache hit.
  const qc = useQueryClient();
  const { data: previewedClient } = useQuery<ClientSummary[], Error, ClientSummary | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === previewClient),
  });

  const visibleAllowedSections = (() => {
    const set = new Set<string>();
    for (const c of assignedPayload?.clients ?? []) {
      if (!visible.includes(c.clientIdCode)) continue;
      for (const s of c.allowedSections ?? []) set.add(s);
    }
    return Array.from(set);
  })();

  const effectiveAllowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? userAllowedSections)
    : assignedPayload
      ? visibleAllowedSections
      : userAllowedSections;

  // In admin preview we render ALL cards (muted when disabled). Otherwise filter.
  const cardsWithState = SECTION_CARDS.map((card) => ({
    card,
    enabled:
      isProspect ||
      card.permission === null ||
      canAccess(card.permission, effectiveAllowedSections, false /* never bypass for preview */),
  }));
  const visibleCards =
    isAdminPreview || isProspect
      ? cardsWithState
      : cardsWithState.filter((c) => c.enabled);

  // Activity feed is its own toggle, identical pattern to the cards above
  const activityEnabled = canAccess("portal-activity", effectiveAllowedSections, false);
  const showActivity = isAdminPreview || activityEnabled;

  // Eye-icon toggle (admin preview only): toggle this section in aac.allowed_sections
  const toggleSection = useMutation({
    mutationFn: async (sectionId: string) => {
      if (!previewClient) throw new Error("No preview client");
      // Send a DELTA, not the whole array. The cached client list can be up to a
      // minute stale, so rebuilding the array here silently reverted the previous
      // toggle; the server now applies the change to the stored row.
      const enabled = !(previewedClient?.allowedSections ?? []).includes(sectionId);
      const res = await fetch(`/api/clients/${previewClient}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update visibility");
      }
      return res.json();
    },
    onSuccess: (updated: { clientIdCode: string; allowedSections: string[] }) => {
      // Trust the row the write returned. invalidate + refetch re-read the 60s
      // process cache in /api/clients, which could still hold the pre-write array
      // and snapped the eye icon straight back to its old state.
      qc.setQueryData(["portal-clients"], (prev: unknown) =>
        Array.isArray(prev)
          ? (prev as Array<{ clientIdCode: string; allowedSections: string[] }>).map((c) =>
              c.clientIdCode === updated.clientIdCode
                ? { ...c, allowedSections: updated.allowedSections }
                : c,
            )
          : prev,
      );
      toast.success("Section visibility updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-10 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Client Dashboard"
          >
            <span className="font-bold text-sidebar-foreground">Client</span>
            <span className="font-normal text-portal-accent">Dashboard</span>
          </h1>
          <div className="mt-0.5 min-w-0 text-xs text-muted-foreground">
            <p className="truncate">
              {isProspect
                ? <>Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</>
                : <>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</>}
            </p>
            <p className="truncate">
              {isProspect
                ? <>{clientName} &mdash; you have preview access to the portal.</>
                : <>{clientName} &mdash; here&apos;s what&apos;s available for you.</>}
            </p>
          </div>
        </div>
      </PageMetaSlot>

      {/* Admin previewing a client — persistent banner */}
      {isAdmin && previewClient && (
        <div className="rounded-lg border border-portal-accent/30 bg-portal-accent/10 px-4 py-3 text-sm text-portal-accent flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="size-4 shrink-0" />
            <span>
              <strong>Admin preview</strong> &mdash; viewing portal as <strong>{clientName}</strong>
            </span>
          </div>
          <Link
            href="/portal"
            className="text-xs hover:underline shrink-0"
          >
            Exit preview &rarr;
          </Link>
        </div>
      )}

      {/* Preview Banner for prospects */}
      {isProspect && (
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-600 dark:text-teal-400 flex items-center gap-2">
          <Eye className="size-4 shrink-0" />
          <span>
            <strong>Preview Mode</strong> &mdash; You have read-only access to the portal. Contact your account manager to upgrade.
          </span>
        </div>
      )}

      <PortalClientPicker />

      {visibleCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleCards.map(({ card, enabled }) => {
            const cardClasses = `block rounded-xl border border-border bg-card p-6 transition-all ${
              enabled
                ? `hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 ${card.borderColor}`
                : "opacity-40 cursor-not-allowed"
            }`;
            const cardInner = (
              <>
                <div className={`inline-flex items-center justify-center rounded-lg p-2.5 ${card.color}`}>
                  <card.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
                  {enabled ? "View" : "Hidden from client"}
                  {enabled && <ArrowRight className="size-4" />}
                </div>
              </>
            );
            const targetHref = isProspect
              ? (PROSPECT_SHOWCASE_HREF[card.id] ?? card.href)
              : `${card.href}${clientParam}`;
            return (
              <div key={card.id} className="relative group">
                {enabled ? (
                  <Link href={targetHref} className={cardClasses}>
                    {cardInner}
                  </Link>
                ) : (
                  <div className={cardClasses} aria-disabled="true">
                    {cardInner}
                  </div>
                )}

                {isAdminPreview && card.permission !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSection.mutate(card.permission as string);
                    }}
                    disabled={toggleSection.isPending}
                    aria-label={`${enabled ? "Hide" : "Show"} ${card.title} for ${clientName}`}
                    title={`${enabled ? "Hide" : "Show"} for client`}
                    className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all disabled:opacity-50"
                  >
                    {enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            Your portal is being set up. Please reach out to your account manager for access.
          </p>
          <a
            href="mailto:hello@marketfoundry.agency?subject=Portal%20access%20request"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-portal-accent hover:underline"
          >
            Contact account manager
            <ArrowRight className="size-4" />
          </a>
        </div>
      )}

      {/* Activity Feed — gated like a section card */}
      {showActivity && (
        <div
          className={`relative group rounded-xl border border-border bg-card p-6 transition-all ${
            activityEnabled ? "" : "opacity-40 cursor-not-allowed"
          }`}
          aria-disabled={activityEnabled ? undefined : true}
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            {!activityEnabled && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <EyeOff className="size-3.5" />
                Hidden from client
              </span>
            )}
          </div>
          {activityEnabled &&
            (visible.length > 1 && !isAdminPreview ? (
              // Multi-client users: one feed per visible account, stacked.
              <div className="space-y-6">
                {visible.map((code) => (
                  <PortalClientSection
                    key={code}
                    clientIdCode={code}
                    clientName={assignedNames[code]}
                    showHeader
                  >
                    <ActivityFeed clientIdCode={code} />
                  </PortalClientSection>
                ))}
              </div>
            ) : (
              <ActivityFeed />
            ))}
          {isAdminPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSection.mutate("portal-activity");
              }}
              disabled={toggleSection.isPending}
              aria-label={`${activityEnabled ? "Hide" : "Show"} Recent Activity for ${clientName}`}
              title={`${activityEnabled ? "Hide" : "Show"} for client`}
              className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all disabled:opacity-50"
            >
              {activityEnabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin Portal Landing ────────────────────────────────────────

function AdminPortalLanding() {
  const queryClient = useQueryClient();
  const [expandedUsers, setExpandedUsers] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<ClientUser | null>(null);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);

  // Fetch active clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientSummary[]>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch prospect clients (the default /api/clients is active-only).
  const { data: prospectClients = [] } = useQuery<ClientSummary[]>({
    queryKey: ["portal-clients-prospect"],
    queryFn: async () => {
      const res = await fetch("/api/clients?status=all");
      if (!res.ok) return [];
      const all: ClientSummary[] = await res.json();
      return all.filter((c) => (c.clientStatus ?? "").toLowerCase() === "prospect");
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all users, filter to client role
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<ClientUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const clientUsers = allUsers.filter((u) => u.role === "client" || u.role === "prospect");

  // Fetch all clients for the dropdown
  const { data: allClients = [] } = useQuery<{ clientIdCode: string; clientName: string }[]>({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients?lite=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const clientCodeMutation = useMutation({
    mutationFn: async ({ userId, clientIdCode }: { userId: string; clientIdCode: string | null }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, clientIdCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update client");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Client assignment updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Client user removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Group client users by client (split comma-separated codes so multi-client users appear under each)
  const usersByClient = new Map<string, ClientUser[]>();
  for (const u of clientUsers) {
    const codes = u.clientIdCode
      ? u.clientIdCode.split(",").map((s) => s.trim()).filter(Boolean)
      : ["unassigned"];
    for (const key of codes) {
      if (!usersByClient.has(key)) usersByClient.set(key, []);
      usersByClient.get(key)!.push(u);
    }
  }

  function parseClientCodes(val: string | null): string[] {
    if (!val) return [];
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function toggleClientCode(userId: string, currentVal: string | null, code: string) {
    const codes = parseClientCodes(currentVal);
    const next = codes.includes(code)
      ? codes.filter((c) => c !== code)
      : [...codes, code];
    clientCodeMutation.mutate({
      userId,
      clientIdCode: next.length > 0 ? next.join(",") : null,
    });
  }

  const [clientDropdownUserId, setClientDropdownUserId] = useState<string | null>(null);

  // Close client-assignment dropdown on Escape
  useEffect(() => {
    if (!clientDropdownUserId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClientDropdownUserId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clientDropdownUserId]);

  // The default /api/clients query is already active-only.
  const activeClients = clients;

  const renderClientCard = (client: ClientSummary) => {
    const assignedUsers = usersByClient.get(client.clientIdCode) ?? [];
    return (
      <div
        key={client.clientIdCode}
        className="relative group rounded-xl border border-border/60 bg-card p-5 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-brand/30"
      >
        <Link
          href={`/portal?client=${client.clientIdCode}`}
          className="block"
        >
          <div className="flex items-start justify-between pr-8">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground font-[family-name:var(--font-outfit)] tracking-tight truncate">
                {client.clientName || client.clientIdCode}
              </h3>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {client.clientIdCode}
              </p>
            </div>
            <Eye className="size-4 text-muted-foreground/40 group-hover:text-portal-accent transition-colors shrink-0 ml-2" />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{client.activeCount} active</span>
              <span className="text-border">|</span>
              <span>{client.count} total</span>
            </div>
            {assignedUsers.length > 0 && (
              <div className="flex -space-x-1.5">
                {assignedUsers.slice(0, 3).map((u) => (
                  <Avatar key={u.id} className="size-5 border border-background">
                    <AvatarImage src={u.image ?? undefined} />
                    <AvatarFallback className="text-[8px]">
                      {(u.name ?? u.email).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {assignedUsers.length > 3 && (
                  <div className="size-5 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                    +{assignedUsers.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
            Preview portal
            <ArrowRight className="size-3" />
          </div>
        </Link>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditingClient(client);
          }}
          aria-label={`Configure section visibility for ${client.clientName || client.clientIdCode}`}
          title={`Configure section visibility for ${client.clientName || client.clientIdCode}`}
          className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all"
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background">
        <h1
          className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter mb-2"
          aria-label="Client Portal"
        >
          <span className="text-foreground font-bold">Client</span><span className="text-portal-accent font-medium">Portal</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Preview the client experience, manage client users, and configure portal sections.
        </p>
      </div>

      {/* Active Clients Grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-4 text-portal-accent" />
          <h2 className="text-lg font-semibold font-[family-name:var(--font-outfit)] tracking-tight">
            Active Clients
          </h2>
          <span className="text-xs text-muted-foreground">
            ({activeClients.length})
          </span>
        </div>

        {clientsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[140px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeClients.map(renderClientCard)}
          </div>
        )}
      </div>

      {/* Prospect Clients Grid */}
      {prospectClients.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-4 text-teal-500" />
            <h2 className="text-lg font-semibold font-[family-name:var(--font-outfit)] tracking-tight">
              Prospect Clients
            </h2>
            <span className="text-xs text-muted-foreground">
              ({prospectClients.length})
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {prospectClients.map(renderClientCard)}
          </div>
        </div>
      )}

      {/* Client User Assignments */}
      <div>
        <button
          onClick={() => setExpandedUsers(!expandedUsers)}
          className="flex items-center gap-2 mb-4 group cursor-pointer"
        >
          {expandedUsers ? (
            <ChevronDown className="size-4 text-portal-accent" />
          ) : (
            <ChevronRight className="size-4 text-portal-accent" />
          )}
          <Settings2 className="size-4 text-portal-accent" />
          <h2 className="text-lg font-semibold font-[family-name:var(--font-outfit)] tracking-tight">
            Client User Assignments
          </h2>
          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
            {clientUsers.length} client {clientUsers.length === 1 ? "user" : "users"}
          </Badge>
        </button>

        {expandedUsers && (
          <>
            {usersLoading ? (
              <Skeleton className="h-[200px] w-full rounded-xl" />
            ) : clientUsers.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No client users yet. Assign the &quot;client&quot; role to a user in{" "}
                  <Link href="/admin/users" className="text-portal-accent hover:underline">
                    Team Management
                  </Link>{" "}
                  to add them here.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-40">Assigned Client</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientUsers.map((user) => {
                      const initials = (user.name ?? user.email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2);

                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="size-7">
                                <AvatarImage src={user.image ?? undefined} />
                                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{user.name ?? "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {user.email}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const codes = parseClientCodes(user.clientIdCode);
                              const isOpen = clientDropdownUserId === user.id;
                              return (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => isOpen ? setClientDropdownUserId(null) : setClientDropdownUserId(user.id)}
                                    className="flex w-full max-w-[160px] items-center justify-between gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted/50 transition-colors"
                                  >
                                    <span className={codes.length === 0 ? "text-muted-foreground" : "truncate"}>
                                      {codes.length === 0
                                        ? "Assign client(s)…"
                                        : codes.length === 1
                                          ? (allClients.find((c) => c.clientIdCode === codes[0])?.clientName || codes[0])
                                          : `${codes.length} clients`}
                                    </span>
                                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                                  </button>
                                  {isOpen && (
                                    <>
                                      <div className="fixed inset-0 z-[998]" onClick={() => setClientDropdownUserId(null)} />
                                      <div className="absolute top-full left-0 z-[999] mt-1 w-56 rounded-md border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
                                        {allClients.map((c) => {
                                          const selected = codes.includes(c.clientIdCode);
                                          return (
                                            <button
                                              key={c.clientIdCode}
                                              type="button"
                                              onClick={() => toggleClientCode(user.id, user.clientIdCode, c.clientIdCode)}
                                              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors ${selected ? "bg-muted/30" : ""}`}
                                            >
                                              <Checkbox checked={selected} className="size-3.5" tabIndex={-1} />
                                              <span className="truncate">{c.clientName || c.clientIdCode}</span>
                                              <span className="ml-auto text-[10px] text-muted-foreground">{c.clientIdCode}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </>
                                  )}
                                  {codes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1 max-w-[180px]">
                                      {codes.map((code) => (
                                        <Badge key={code} variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 bg-purple-500/10 text-purple-400 border-purple-500/25">
                                          {allClients.find((c) => c.clientIdCode === code)?.clientName || code}
                                          <button type="button" onClick={() => toggleClientCode(user.id, user.clientIdCode, code)} className="hover:text-destructive">
                                            <X className="size-2.5" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleDateString("en-US")
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 text-xs gap-1.5"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteTargetUser(user)}
                            >
                              <Trash2 className="size-3.5" />
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!deleteTargetUser}
        onOpenChange={(o) => { if (!o) setDeleteTargetUser(null); }}
        onConfirm={() => {
          if (deleteTargetUser) {
            deleteMutation.mutate(deleteTargetUser.id, {
              onSuccess: () => setDeleteTargetUser(null),
            });
          }
        }}
        title="Remove client user?"
        description={deleteTargetUser ? (
          <>
            This will remove <strong className="text-foreground">{deleteTargetUser.name ?? deleteTargetUser.email}</strong>{" "}
            from the portal. Their access is revoked immediately. This action cannot be undone.
          </>
        ) : null}
        pending={deleteMutation.isPending}
        confirmLabel="Remove user"
      />

      <ClientSectionsSheet
        client={editingClient}
        open={!!editingClient}
        onOpenChange={(o) => { if (!o) setEditingClient(null); }}
      />
    </div>
  );
}

// ── Main portal page ────────────────────────────────────────────

function PortalDashboardContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams.get("client") : null;

  // Admin without a specific client → show admin landing
  if (isAdmin && !previewClient) {
    return <AdminPortalLanding />;
  }

  // Admin with client param → show client dashboard preview
  // Client user → show their dashboard
  return <ClientDashboard />;
}

export default function PortalDashboard() {
  return (
    <Suspense>
      <PortalDashboardContent />
    </Suspense>
  );
}
