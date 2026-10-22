"use client";
/* eslint-disable react-doctor/nextjs-missing-metadata */

import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  X,
  BookOpen,
  Sparkles,
  ImageIcon,
  Store,
  Palette,
  ChevronRight,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusCountChips } from "@/lib/design-status";
import Link from "next/link";
import { useSession } from "next-auth/react";

// ── Types ──────────────────────────────────────────────────────────────

type CategoryStatus = {
  category: string;
  status: string;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  aplusTotal?: number;
  aplusApproved?: number;
  aplusLive?: number;
  statusCounts?: Partial<Record<string, number>>;
};

type ClientDesign = {
  clientIdCode: string;
  clientName: string;
  categories: CategoryStatus[];
};

// ── Constants ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof BookOpen; color: string; href: string; clientHref?: (code: string) => string }
> = {
  brand_story: {
    label: "Brand Story",
    icon: BookOpen,
    color: "text-rose-500",
    href: "/design/brand-story",
  },
  aplus: {
    label: "A+ Content",
    icon: Sparkles,
    color: "text-amber-500",
    href: "/design/aplus2",
  },
  listing_images: {
    label: "Listing Images",
    icon: ImageIcon,
    color: "text-purple-500",
    href: "/design/listing-images",
  },
  storefront: {
    label: "Storefront",
    icon: Store,
    color: "text-teal-500",
    href: "/design/storefront",
  },
};

// Status palette + sizing live in @/lib/design-status (canonical source).

// Design sections used by the visibility config; a client hidden in all four
// is removed from the hub entirely.
const SECTIONS = ["brand_story", "aplus", "listing_images", "storefront"];

// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchDesignStatus(): Promise<ClientDesign[]> {
  const res = await fetch("/api/design-status");
  if (!res.ok) throw new Error("Failed to fetch design status");
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────

function getOverallProgress(categories: CategoryStatus[]) {
  const weights: Record<string, number> = {
    not_started: 0,
    in_progress: 1,
    in_review: 2,
    approved: 3,
    live: 4,
  };
  const total = categories.reduce(
    (sum, c) => sum + (weights[c.status] ?? 0),
    0
  );
  const max = categories.length * 4;
  return Math.round((total / max) * 100);
}

// ── Components ─────────────────────────────────────────────────────────

function CategoryRow({ cat }: { cat: CategoryStatus }) {
  const meta = CATEGORY_META[cat.category];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0 pt-0.5">
        <Icon className={cn("size-3.5 shrink-0", meta.color)} />
        <span className="text-xs text-foreground truncate">{meta.label}</span>
      </div>
      <StatusCountChips counts={cat.statusCounts} fallbackStatus={cat.status} />
    </div>
  );
}

function ClientCard({ client }: { client: ClientDesign }) {
  const progress = getOverallProgress(client.categories);
  const allDone = client.categories.every(
    (c) => c.status === "approved" || c.status === "live"
  );

  return (
    <Link
      href={`/design/${client.clientIdCode}`}
      className={cn(
        "block rounded-xl border bg-card p-5 transition-all",
        "hover:shadow-md hover:border-stone-300 dark:hover:border-zinc-700 cursor-pointer",
        allDone
          ? "border-emerald-300 dark:border-emerald-500/30"
          : "border-stone-200 dark:border-zinc-800"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {client.clientName}
          </p>
          <p className="text-[10px] font-bold text-muted-foreground font-mono">
            {client.clientIdCode}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative size-9">
                  <svg className="size-9 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-stone-200 dark:text-zinc-800"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${(progress / 100) * 88} 88`}
                      strokeLinecap="round"
                      className={cn(
                        progress === 100
                          ? "text-emerald-500"
                          : progress > 0
                          ? "text-brand"
                          : "text-transparent"
                      )}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-muted-foreground">
                    {progress}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Overall design progress</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ChevronRight className="size-4 text-muted-foreground/40" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-stone-200 dark:bg-zinc-800 mb-3">
        <div
          className={cn(
            "h-1 rounded-full transition-all duration-500",
            progress === 100 ? "bg-emerald-500" : "bg-brand"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Category rows */}
      <div className="divide-y divide-stone-100 dark:divide-zinc-800/50">
        {client.categories.map((cat) => (
          <CategoryRow key={cat.category} cat={cat} />
        ))}
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="size-9 rounded-full" />
      </div>
      <Skeleton className="h-1 w-full rounded-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-6 w-[110px] rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ── Filter helpers ─────────────────────────────────────────────────────

type FilterStatus = "all" | "not_started" | "in_progress" | "done";

function matchesFilter(client: ClientDesign, filter: FilterStatus): boolean {
  if (filter === "all") return true;
  if (filter === "not_started")
    return client.categories.every((c) => c.status === "not_started");
  if (filter === "done")
    return client.categories.every(
      (c) => c.status === "approved" || c.status === "live"
    );
  // in_progress = at least one started, not all done
  return (
    client.categories.some((c) => c.status !== "not_started") &&
    !client.categories.every(
      (c) => c.status === "approved" || c.status === "live"
    )
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function DesignOverviewPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const { data: session } = useSession();
  const isAdmin = hasAdminPowers((session?.user as { role?: string } | undefined)?.role);

  const { data: clients, isLoading, isError } = useQuery<ClientDesign[]>({
    queryKey: ["design-status"],
    queryFn: fetchDesignStatus,
    staleTime: 60_000,
  });

  const { data: visibility } = useQuery<{ hidden: Record<string, string[]> }>({
    queryKey: ["design-visibility"],
    queryFn: async () => {
      const res = await fetch("/api/design/visibility");
      if (!res.ok) return { hidden: {} };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Exclude clients whose every section is hidden — they vanish from the hub.
  const visibleClients = useMemo(() => {
    if (!clients) return [];
    const h = visibility?.hidden ?? {};
    return clients.filter(
      (c) => !SECTIONS.every((s) => (h[s] ?? []).includes(c.clientIdCode))
    );
  }, [clients, visibility]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = visibleClients;

    if (statusFilter !== "all") {
      result = result.filter((c) => matchesFilter(c, statusFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.clientIdCode.toLowerCase().includes(q) ||
          c.clientName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [visibleClients, searchQuery, statusFilter]);

  // Summary counts
  const summary = useMemo(() => {
    return {
      total: visibleClients.length,
      notStarted: visibleClients.filter((c) => matchesFilter(c, "not_started"))
        .length,
      inProgress: visibleClients.filter((c) => matchesFilter(c, "in_progress"))
        .length,
      done: visibleClients.filter((c) => matchesFilter(c, "done")).length,
    };
  }, [visibleClients]);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-2 min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Design Hub"
          >
            <span className="font-bold text-sidebar-foreground">Design</span>
            <span className="font-normal text-brand">Hub</span>
          </h1>
          {isAdmin && (
            <Link
              href="/design/config"
              title="Configure design section visibility"
              className="p-1 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Settings size={16} />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!isLoading && clients && (
            <div className="flex items-center gap-2">
              {(
                [
                  { key: "all", label: "All", count: summary.total },
                  {
                    key: "not_started",
                    label: "Not Started",
                    count: summary.notStarted,
                  },
                  {
                    key: "in_progress",
                    label: "In Progress",
                    count: summary.inProgress,
                  },
                  { key: "done", label: "Done", count: summary.done },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setStatusFilter(pill.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    statusFilter === pill.key
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {pill.label}
                  <span className="tabular-nums">{pill.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              placeholder="Search client…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-56 h-8 text-xs"
              disabled={isLoading}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </PageMetaSlot>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load design status. Please try again.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="rounded-full bg-muted/40 p-6">
            <Palette className="size-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              No clients found
            </p>
            {searchQuery && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                No matches for &quot;{searchQuery}&quot;
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((client) => (
            <ClientCard key={client.clientIdCode} client={client} />
          ))}
        </div>
      )}

      {/* Footer */}
      {!isLoading && !isError && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4 text-right">
          {filtered.length} client{filtered.length !== 1 ? "s" : ""}
          {searchQuery ? ` matching "${searchQuery}"` : ""}
        </p>
      )}
    </div>
  );
}
