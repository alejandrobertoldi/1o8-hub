/* eslint-disable react-doctor/js-tosorted-immutable */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/async-await-in-loop */
"use client";

import { useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { hasAdminPowers } from "@/lib/roles";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  XCircle,
  Clock,
  Plus,
  ArrowRight,
  ChevronDown,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { EmptyState } from "@/components/ui/empty-state";
import { isStepSatisfied, PARENT_GROUP_LABELS } from "@/lib/onboarding/steps";
import { computeOnboardingProgress } from "@/lib/onboarding/progress";
import { ClientMark } from "@/components/onboarding/client-mark";

// ── Types ──────────────────────────────────────────────────────────

interface ClientListItem {
  clientIdCode: string;
  clientName: string;
  clientType: "AIA" | "NTA" | null;
  clientStatus: string | null;
  count: number;
  activeCount: number;
}

interface OnboardingStep {
  key: string;
  label: string;
  parent: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  order: number;
}

interface ClientOnboarding {
  clientIdCode: string;
  steps: OnboardingStep[];
}

// ── Status groups ──────────────────────────────────────────────────
// Clients are grouped into status sections. Order matches the prior
// flat-grid sort (active → prospect → other → inactive). Accent classes
// reuse the per-card status palette for visual continuity.

type StatusKey = "active" | "prospect" | "other" | "inactive";

const STATUS_GROUPS: {
  key: StatusKey;
  label: string;
  matches: (s: string) => boolean;
  dot: string;
  countText: string;
  countBg: string;
  dimmed?: boolean;
}[] = [
  {
    key: "active",
    label: "Active",
    matches: (s) => s === "active",
    dot: "bg-emerald-500",
    countText: "text-emerald-600 dark:text-emerald-400",
    countBg: "bg-emerald-500/10 border-emerald-500/30",
  },
  {
    key: "prospect",
    label: "Prospect",
    matches: (s) => s === "prospect",
    dot: "bg-brand",
    countText: "text-brand",
    countBg: "bg-brand/10 border-brand/30",
  },
  {
    key: "inactive",
    label: "Inactive",
    matches: (s) => s === "inactive",
    dot: "bg-red-500",
    countText: "text-red-600 dark:text-red-400",
    countBg: "bg-red-500/10 border-red-500/30",
    dimmed: true,
  },
  {
    key: "other",
    label: "Unassigned",
    matches: () => true, // catch-all for null / unknown statuses
    dot: "bg-stone-400 dark:bg-zinc-600",
    countText: "text-muted-foreground",
    countBg: "bg-muted border-stone-300 dark:border-zinc-700",
  },
];

// Render order (other before inactive, mirroring the old rank function)
const GROUP_RENDER_ORDER: StatusKey[] = ["active", "prospect", "other", "inactive"];

// ── Page ───────────────────────────────────────────────────────────

export default function OnboardingListPage() {
  const { data: session } = useSession();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const [showNewClient, setShowNewClient] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<StatusKey>>(new Set());

  function toggleGroup(key: StatusKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Fetch all clients (active, prospect, inactive). A 25s deadline plus a
  // single retry (not the default 3) keeps a stalled request from leaving
  // this page loading forever with no way out but a reload — same fix as
  // the home page's client list (src/app/page.tsx).
  const {
    data: clients,
    isLoading: loadingClients,
    isError: clientsFailed,
    error: clientsError,
    refetch: refetchClients,
  } = useQuery<ClientListItem[]>({
    queryKey: ["clients", "all", "lite"],
    queryFn: async () => {
      const res = await fetch("/api/clients?status=all&lite=1", {
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Failed to load clients (HTTP ${res.status})`);
      return res.json();
    },
    retry: 1,
  });

  // Fetch onboarding status for each client under the SAME query key the
  // per-client detail page uses (["onboarding", code]). Sharing the key means
  // a step change on the detail page invalidates this cache too, so the summary
  // never shows stale progress — and it dedupes the fetch across both pages.
  const onboardingResults = useQueries({
    queries: (clients ?? []).map((c) => ({
      queryKey: ["onboarding", c.clientIdCode],
      queryFn: async () => {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(c.clientIdCode)}/onboarding`
        );
        if (!res.ok) throw new Error("Failed to load onboarding status");
        return (await res.json()) as ClientOnboarding;
      },
    })),
  });

  // Build a code→steps map from the successful queries, and track which clients
  // failed to load so we can show that explicitly instead of a misleading "0/0".
  const onboardingMap: Record<string, OnboardingStep[]> = {};
  const onboardingErrors = new Set<string>();
  (clients ?? []).forEach((c, i) => {
    const q = onboardingResults[i];
    if (q?.data?.steps) onboardingMap[c.clientIdCode] = q.data.steps;
    else if (q?.isError) onboardingErrors.add(c.clientIdCode);
  });
  const loadingOnboarding = onboardingResults.some((q) => q.isPending);

  const isLoading = loadingClients || loadingOnboarding;

  function getProgress(clientIdCode: string) {
    // Shared with the per-client detail page so both views always agree.
    return computeOnboardingProgress(onboardingMap[clientIdCode] ?? []);
  }

  function getStatusIcon(clientIdCode: string) {
    const { completed, total } = getProgress(clientIdCode);
    if (total === 0) return <Circle className="size-4 text-muted-foreground" />;
    if (completed === total)
      return <CheckCircle2 className="size-4 text-[var(--brand-green)]" />;
    const steps = onboardingMap?.[clientIdCode];
    if (steps?.some((s) => s.status === "failed"))
      return <AlertCircle className="size-4 text-[var(--brand-red)]" />;
    if (steps?.some((s) => s.status === "in_progress"))
      return <Loader2 className="size-4 animate-spin text-[var(--brand-yellow)]" />;
    return <Circle className="size-4 text-muted-foreground" />;
  }

  function renderClientCard(client: ClientListItem) {
    const { completed, total, percentage } = getProgress(client.clientIdCode);
    const steps = onboardingMap?.[client.clientIdCode] ?? [];
    // A failed fetch must not look identical to a genuine "not started" (0/0).
    const failedToLoad = onboardingErrors.has(client.clientIdCode);

    // Build section-level status map
    const sectionStatuses = Object.entries(PARENT_GROUP_LABELS)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([parentKey, { label }]) => {
        const sectionSteps = steps.filter((s) => s.parent === parentKey || s.key === parentKey);
        if (!sectionSteps.length) return { parentKey, label, state: "pending" as const };
        if (sectionSteps.every(isStepSatisfied)) return { parentKey, label, state: "completed" as const };
        if (sectionSteps.some((s) => s.status === "failed")) return { parentKey, label, state: "failed" as const };
        if (sectionSteps.some((s) => s.status === "in_progress")) return { parentKey, label, state: "in_progress" as const };
        if (sectionSteps.some((s) => s.status === "completed")) return { parentKey, label, state: "in_progress" as const };
        return { parentKey, label, state: "pending" as const };
      });

    return (
      <div
        key={client.clientIdCode}
        className="flex flex-col rounded-xl border border-stone-200 dark:border-zinc-800 bg-card overflow-hidden"
      >
        {/* Card header */}
        <div className="px-4 pt-4 pb-3 border-b border-stone-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
            <ClientMark compact client={{ clientIdCode: client.clientIdCode, clientName: client.clientName || client.clientIdCode }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {client.clientName || client.clientIdCode}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground">
                {client.clientIdCode}
              </p>
            </div>
            </div>
            {client.clientType && (
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide shrink-0 ${
                client.clientType === "AIA"
                  ? "bg-brand/15 text-orange-800 border border-brand/30 dark:text-brand"
                  : "bg-purple-50 text-purple-700 border border-purple-300 dark:bg-[var(--brand-nta)]/15 dark:text-[var(--brand-nta)] dark:border-[var(--brand-nta)]/30"
              }`}>
                {client.clientType}
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${percentage === 100 ? "bg-emerald-500" : "bg-brand"}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className={`text-[11px] font-bold tabular-nums shrink-0 ${failedToLoad ? "text-destructive" : percentage === 100 ? "text-emerald-500" : "text-muted-foreground"}`}>
              {failedToLoad ? "—" : `${percentage}%`}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {failedToLoad ? "—" : `${completed}/${total}`}
            </span>
          </div>
        </div>

        {/* Section checklist */}
        <div className="flex-1 px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {sectionStatuses.map(({ parentKey, label, state }) => (
            <div key={parentKey} className="flex items-center gap-1.5 min-w-0">
              {state === "completed" ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              ) : state === "in_progress" ? (
                <Clock className="size-3.5 text-amber-500 shrink-0" />
              ) : state === "failed" ? (
                <XCircle className="size-3.5 text-red-500 shrink-0" />
              ) : (
                <Circle className="size-3.5 text-stone-300 dark:text-zinc-600 shrink-0" />
              )}
              <span className={`text-[11px] truncate ${
                state === "completed"
                  ? "text-foreground/70 line-through decoration-muted-foreground/40"
                  : state === "in_progress"
                    ? "text-foreground font-medium"
                    : state === "failed"
                      ? "text-red-500"
                      : "text-muted-foreground"
              }`}>
                {label.replace(/^\d+\.\s*/, "")}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-stone-100 dark:border-zinc-800 flex items-center justify-between">
          <span className={`text-[10px] ${failedToLoad ? "text-destructive" : "text-muted-foreground"}`}>
            {failedToLoad
              ? "Couldn't load — open to retry"
              : total === 0
                ? "Not started"
                : completed === total
                  ? "All sections complete"
                  : `${total - completed} section${total - completed !== 1 ? "s" : ""} remaining`}
          </span>
          <Link href={`/clients/${client.clientIdCode}/onboarding`}>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1">
              Manage
              <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Partition clients into status groups, preserving id-code sort within each.
  function groupClients(list: ClientListItem[]) {
    const byKey = new Map<StatusKey, ClientListItem[]>();
    const sorted = [...list].sort((a, b) =>
      (a.clientIdCode ?? "").localeCompare(b.clientIdCode ?? "")
    );
    for (const client of sorted) {
      const statusLower = (client.clientStatus ?? "").toLowerCase();
      const group = STATUS_GROUPS.find((g) => g.matches(statusLower)) ?? STATUS_GROUPS[3];
      const bucket = byKey.get(group.key);
      if (bucket) bucket.push(client);
      else byKey.set(group.key, [client]);
    }
    return byKey;
  }

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">Client</span><span className="font-normal text-brand">Onboarding</span>
          </h1>
          <p className="text-xs text-muted-foreground/70 truncate">
            Track onboarding progress across all clients.
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            className="bg-brand-solid text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)] shrink-0"
            onClick={() => setShowNewClient(true)}
          >
            <Plus className="size-4 mr-1" />
            New Client
          </Button>
        )}
      </PageMetaSlot>
      <div>
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Client list failed to load — distinct from the loading state above,
            and from a per-client onboarding-fetch failure (handled inline per
            card via failedToLoad/onboardingErrors). */}
        {!isLoading && clientsFailed && (
          <EmptyState
            icon={TriangleAlert}
            title="Couldn't load clients"
            description={
              clientsError instanceof DOMException && clientsError.name === "TimeoutError"
                ? "The request timed out. The database may be under load — try again in a moment."
                : clientsError instanceof Error
                  ? clientsError.message
                  : "Something went wrong."
            }
            action={
              <Button variant="outline" size="sm" onClick={() => refetchClients()}>
                Try again
              </Button>
            }
          />
        )}

        {/* Status groups */}
        {!isLoading && !clientsFailed && clients && (() => {
          const grouped = groupClients(clients);
          return (
            <div className="flex flex-col gap-6">
              {GROUP_RENDER_ORDER.map((key) => {
                const group = STATUS_GROUPS.find((g) => g.key === key)!;
                const members = grouped.get(key) ?? [];
                if (!members.length) return null;
                const isCollapsed = collapsed.has(key);

                return (
                  <section key={key}>
                    {/* Status header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      aria-expanded={!isCollapsed}
                      className="group/header w-full flex items-center gap-2.5 mb-3 text-left cursor-pointer"
                    >
                      <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                      <span className={`size-2 rounded-full shrink-0 ${group.dot}`} />
                      <h2 className="text-sm font-semibold text-foreground tracking-tight">
                        {group.label}
                      </h2>
                      <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full border text-[11px] font-bold tabular-nums ${group.countText} ${group.countBg}`}>
                        {members.length}
                      </span>
                      <span className="flex-1 h-px bg-stone-200 dark:bg-zinc-800 ml-1" />
                    </button>

                    {/* Sub-cards */}
                    {!isCollapsed && (
                      <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${group.dimmed ? "opacity-60" : ""}`}>
                        {members.map((client) => renderClientCard(client))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })()}
      </div>

      <NewClientDialog open={showNewClient} onOpenChange={setShowNewClient} />
    </div>
  );
}
