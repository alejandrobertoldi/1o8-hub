"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  BarChart3,
  LineChart,
  MapPinned,
  Package,
  Megaphone,
  RefreshCw,
  Target,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
} from "lucide-react";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { PortalReportState } from "@/components/reports/v2/portal-report-state";
import { CLIENT_NAMES } from "@/lib/constants";
import { PORTAL_AUDITS } from "@/lib/portal-audits";
import { usePortalStackedClients } from "@/components/portal/portal-stacked-clients";

const REPORT_CARDS = [
  {
    id: "overview",
    label: "Overview",
    description: "Performance overview and KPIs.",
    icon: BarChart3,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    borderColor: "hover:border-blue-500/30",
  },
  {
    id: "period-comparative",
    label: "Period Comparative",
    description: "Compare performance across periods.",
    icon: LineChart,
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    borderColor: "hover:border-indigo-500/30",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock levels and inventory health.",
    icon: Package,
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    borderColor: "hover:border-orange-500/30",
  },
  {
    id: "order-geography",
    label: "Order Geography",
    description: "Where orders land across the US, by state and product.",
    icon: MapPinned,
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    borderColor: "hover:border-rose-500/30",
  },
  {
    id: "share-of-voice",
    label: "Share of Voice",
    description: "Brand visibility and market share.",
    icon: Megaphone,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    borderColor: "hover:border-emerald-500/30",
  },
  {
    id: "subscribe-save",
    label: "Subscribe & Save",
    description: "Subscription performance trends.",
    icon: RefreshCw,
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    borderColor: "hover:border-cyan-500/30",
  },
  {
    id: "advertising-audit",
    label: "Advertising Audit",
    description: "Advertising performance and efficiency.",
    icon: Target,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    borderColor: "hover:border-violet-500/30",
  },
] as const;

export default function PortalReportsPage() {
  const controls = usePortalReportControls();
  const qc = useQueryClient();
  const { clientIdCode, clientName, isAdminPreview } = controls;
  // Multi-client users: the subtitle names every visible account, and the
  // audit card appears when ANY of them has an audit (the audit page stacks).
  const { codes: stackedCodes, showHeaders: multiClient, label: stackedLabel } = usePortalStackedClients();
  const previewClientName = isAdminPreview
    ? CLIENT_NAMES[clientIdCode] || clientName
    : "";

  // Eye-icon toggle (admin preview only): toggle this section in aac.allowed_sections
  const toggleSection = useMutation({
    mutationFn: async (sectionId: string) => {
      if (!clientIdCode) throw new Error("No preview client");
      // Send a DELTA, not the whole array. The cached client list can be up to a
      // minute stale, so rebuilding the array here silently reverted the previous
      // toggle; the server now applies the change to the stored row.
      const enabled = !controls.allowedSections.includes(sectionId);
      const res = await fetch(`/api/clients/${clientIdCode}/sections`, {
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

  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;

  const { accountId, clientParam, isProspect } = controls;
  const audit = stackedCodes.map((c) => PORTAL_AUDITS[c]).find(Boolean) ?? PORTAL_AUDITS[clientIdCode];
  // The IntentwiseID warning only matters when a live (IntentwiseID-backed)
  // report card is actually visible. Prospects have no granted sections, so
  // none are — suppress the noise for them.
  //
  // clientHasSection folds in the isProspect bypass, which the old inline
  // canAccess() call did not. That changes nothing here: the banner is already
  // gated on `&& !isProspect` below, so a prospect suppresses it either way.
  const anyReportEnabled =
    isAdminPreview || REPORT_CARDS.some((card) => controls.clientHasSection(card.id));

  return (
    <div className="space-y-10 -mt-6 lg:-mt-8">
      {/* Page heading portaled into TopNav row 3 (page-meta-slot) */}
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Client Reports"
          >
            <span className="font-bold text-sidebar-foreground">Client</span>
            <span className="font-normal text-portal-accent">Reports</span>
          </h1>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {multiClient ? stackedLabel : <>{clientName} &middot; {clientIdCode}</>}
          </p>
        </div>
      </PageMetaSlot>

      {!accountId && anyReportEnabled && !isProspect && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          Missing IntentwiseID for this client.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {audit && (
          <Link
            href={`/portal/reports/business-model-audit${clientParam}`}
            className="group block rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-amber-500/30"
          >
            <div className="inline-flex items-center justify-center rounded-lg p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileText className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{audit.label}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              {audit.description}
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
              View
              <ArrowRight className="size-4" />
            </div>
          </Link>
        )}
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          const permissionId = `reports-${card.id}`;
          const enabled = controls.clientHasSection(card.id);
          if (!isAdminPreview && !enabled) return null;
          const cardClasses = `block rounded-xl border border-border bg-card p-6 transition-all ${
            enabled
              ? `hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 ${card.borderColor}`
              : "opacity-40 cursor-not-allowed"
          }`;
          const cardInner = (
            <>
              <div className={`inline-flex items-center justify-center rounded-lg p-2.5 ${card.color}`}>
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {card.label}
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
                <Link href={`/portal/reports/${card.id}${clientParam}`} className={cardClasses}>
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
                    toggleSection.mutate(permissionId);
                  }}
                  disabled={toggleSection.isPending}
                  aria-label={`${enabled ? "Hide" : "Show"} ${card.label} for ${previewClientName}`}
                  title={`${enabled ? "Hide" : "Show"} for client`}
                  className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-border transition-all disabled:opacity-50"
                >
                  {enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
              )}
            </div>
          );
        })}
        {!isProspect && (
          <Link
            href={`/portal/reports/monthly${clientParam}`}
            className="group block rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 hover:border-portal-accent/30"
          >
            <div className="inline-flex items-center justify-center rounded-lg p-2.5 bg-portal-accent/10 text-portal-accent">
              <FileText className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Monthly Report</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Generated monthly performance reports.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-portal-accent opacity-60 group-hover:opacity-100 transition-opacity">
              View
              <ArrowRight className="size-4" />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

