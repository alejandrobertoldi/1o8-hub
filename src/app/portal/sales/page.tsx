"use client";
/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */

import { hasAdminPowers } from "@/lib/roles";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, ArrowRight, DollarSign, Boxes, TrendingUp, BarChart3, Eye, EyeOff } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { CLIENT_NAMES } from "@/lib/constants";
import { canAccess } from "@/lib/permissions";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";

const SALES_CARDS = [
  {
    id: "sales-overview",
    title: "Sales Summary",
    description: "View your sales performance, ad spend, revenue, and key metrics.",
    icon: DollarSign,
    href: "/portal/sales/overview",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    borderColor: "hover:border-emerald-500/30",
  },
  {
    id: "sales-inventory",
    title: "Inventory",
    description: "Track inventory levels, restock timelines, and stock health.",
    icon: Boxes,
    href: "/portal/sales/inventory",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    borderColor: "hover:border-orange-500/30",
  },
  {
    id: "sales-forecast",
    title: "Forecast",
    description: "Sales forecasts and projected performance trends.",
    icon: TrendingUp,
    href: "/portal/sales/forecast",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    borderColor: "hover:border-violet-500/30",
  },
  {
    id: "sales-monitor",
    title: "Sales Monitor",
    description: "30-day daily breakdown with ACOS, TACOS, ROAS goals and charts.",
    icon: BarChart3,
    href: "/portal/sales-monitor",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    borderColor: "hover:border-blue-500/30",
  },
];

type ClientLite = { clientIdCode: string; allowedSections: string[] };

export default function PortalSalesLanding() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const isAdminPreview = !!(isAdmin && previewClient);
  const clientParam = usePortalClientParam();
  const clientName = previewClient
    ? CLIENT_NAMES[previewClient] || previewClient
    : "";

  const { data: previewedClient } = useQuery<ClientLite[], Error, ClientLite | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === previewClient),
  });

  const effectiveAllowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? [])
    : (session?.user?.allowedSections ?? []);

  const cardsWithState = SALES_CARDS.map((card) => ({
    card,
    enabled: canAccess(card.id, effectiveAllowedSections, false),
  }));
  const visibleCards = isAdminPreview
    ? cardsWithState
    : cardsWithState.filter((c) => c.enabled);

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
    <div className="space-y-8 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Sales Hub"
          >
            <span className="font-bold text-sidebar-foreground">Sales</span>
            <span className="font-normal text-portal-accent">Hub</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sales performance, inventory, forecasts, and daily monitoring.
          </p>
        </div>
      </PageMetaSlot>

      <Link
        href={`/portal${clientParam}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to portal
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
          return (
            <div key={card.id} className="relative group">
              {enabled ? (
                <Link href={`${card.href}${clientParam}`} className={cardClasses}>
                  {cardInner}
                </Link>
              ) : (
                <div className={cardClasses} aria-disabled="true">
                  {cardInner}
                </div>
              )}

              {isAdminPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSection.mutate(card.id);
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
    </div>
  );
}
