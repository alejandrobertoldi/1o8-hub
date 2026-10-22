/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Search, X, LayoutTemplate } from "lucide-react";
import { StatusCountChips } from "@/lib/design-status";
import { aplusCoverUrls } from "@/lib/aplus2/premium-preview";

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
  aplusThumbnailUrl: string | null;
  aplusModuleThumbs?: string[];
  categories: CategoryStatus[];
};

function formatRelative(iso: string | null): string {
  if (!iso) return "Never updated";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ── Constants ──────────────────────────────────────────────────────────

const CATEGORY = "aplus";

// Status palette + sizing live in @/lib/design-status (canonical source).

// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchDesignStatus(): Promise<ClientDesign[]> {
  const res = await fetch("/api/design-status");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

// ── Components ─────────────────────────────────────────────────────────

function AplusTile({
  client,
  catStatus,
}: {
  client: ClientDesign;
  catStatus: CategoryStatus;
}) {
  const router = useRouter();
  const total = catStatus.aplusTotal ?? 0;
  const coverUrls = aplusCoverUrls(client.aplusModuleThumbs, client.aplusThumbnailUrl);
  const updatedByShort = catStatus.updatedBy?.split("@")[0] ?? null;

  return (
    <div
      onClick={() => router.push(`/design/aplus2/${client.clientIdCode}`)}
      className="group relative flex flex-col h-full rounded-xl border border-stone-200 dark:border-zinc-800 bg-card hover:border-stone-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
    >
      <div
        className={
          coverUrls.length > 0
            ? "relative shrink-0 bg-stone-50/60 dark:bg-zinc-900/40 border-b border-stone-200 dark:border-zinc-800 overflow-hidden"
            : "relative flex-1 min-h-28 bg-stone-50/60 dark:bg-zinc-900/40 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-center"
        }
      >
        {coverUrls.length > 0 ? (
          coverUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className="w-full h-auto object-contain select-none"
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          ))
        ) : (
          <span
            className="font-mono font-bold tracking-tighter text-3xl select-none text-muted-foreground/30"
            aria-hidden
          >
            {client.clientIdCode}
          </span>
        )}
      </div>

      <div className="px-4 pt-3 pb-2 min-w-0 shrink-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {client.clientName}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-3 text-[10px] font-mono min-w-0 shrink-0">
        <span className="font-bold text-foreground/80 shrink-0">
          {total} {total === 1 ? "set" : "sets"}
        </span>
        <span className="text-muted-foreground/80 truncate min-w-0 flex-1 text-center">
          {formatRelative(catStatus.updatedAt)}
          {updatedByShort ? ` · ${updatedByShort}` : ""}
        </span>
        <span className="font-bold text-muted-foreground shrink-0 truncate max-w-[40%] text-right">
          {client.clientIdCode}
        </span>
      </div>

      <div className="border-t border-stone-200 dark:border-zinc-800 p-2 flex justify-center shrink-0">
        <StatusCountChips counts={catStatus.statusCounts} fallbackStatus={catStatus.status} />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function Aplus2ClientListPage() {
  const [searchQuery, setSearchQuery] = useState("");

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

  const visibleClients = useMemo(() => {
    if (!clients) return [];
    const hidden = new Set(visibility?.hidden?.[CATEGORY] ?? []);
    return clients.filter((c) => !hidden.has(c.clientIdCode));
  }, [clients, visibility]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return visibleClients;
    const q = searchQuery.toLowerCase();
    return visibleClients.filter(
      (c) => c.clientIdCode.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q)
    );
  }, [visibleClients, searchQuery]);

  const summary = useMemo(() => {
    const getCatStatus = (c: ClientDesign) => c.categories.find((cat) => cat.category === CATEGORY)?.status ?? "not_started";
    return {
      total: visibleClients.length,
      notStarted: visibleClients.filter((c) => getCatStatus(c) === "not_started").length,
      inProgress: visibleClients.filter((c) => ["in_progress", "in_review"].includes(getCatStatus(c))).length,
      done: visibleClients.filter((c) => ["approved", "live"].includes(getCatStatus(c))).length,
    };
  }, [visibleClients]);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-2 min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="A+ Content"
          >
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Content</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {!isLoading && clients && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{summary.total} clients</span>
              <span className="text-stone-400">{summary.notStarted} not started</span>
              <span className="text-amber-500">{summary.inProgress} in progress</span>
              <span className="text-emerald-500">{summary.done} done</span>
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground">Failed to load. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="rounded-full bg-muted/40 p-6">
            <LayoutTemplate className="size-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No clients found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((client) => {
            const catStatus = client.categories.find((c) => c.category === CATEGORY) ?? {
              category: CATEGORY,
              status: "not_started",
              notes: null,
              updatedAt: null,
              updatedBy: null,
            };
            return (
              <AplusTile
                key={client.clientIdCode}
                client={client}
                catStatus={catStatus}
              />
            );
          })}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4 text-right">
          {filtered.length} client{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
