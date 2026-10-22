/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusDot,
  getStatusMeta,
  DESIGN_STATUS_ORDER,
  STATUS_TRIGGER_CLASS,
  STATUS_MENU_ITEM_CLASS,
} from "@/lib/design-status";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

type CategoryStatus = {
  category: string;
  status: string;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type ClientDesign = {
  clientIdCode: string;
  clientName: string;
  brandStoryVersionCount: number;
  brandStoryThumbnailUrl: string | null;
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

const CATEGORY = "brand_story";

// Status palette + sizing live in @/lib/design-status (canonical source).

// ── Fetcher ────────────────────────────────────────────────────────────

async function fetchDesignStatus(): Promise<ClientDesign[]> {
  const res = await fetch("/api/design-status");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

// ── Components ─────────────────────────────────────────────────────────

function StoryTile({
  client,
  catStatus,
  onStatusChange,
  isPending,
}: {
  client: ClientDesign;
  catStatus: CategoryStatus;
  onStatusChange: (status: string) => void;
  isPending: boolean;
}) {
  const router = useRouter();
  const config = getStatusMeta(catStatus.status);
  const versionCount = client.brandStoryVersionCount;
  const versionLabel = `V${String(versionCount).padStart(2, "0")}`;
  const updatedByShort = catStatus.updatedBy?.split("@")[0] ?? null;
  const thumbnailUrl = client.brandStoryThumbnailUrl;

  return (
    <div
      onClick={() => router.push(`/design/brand-story/${client.clientIdCode}`)}
      className="group relative flex flex-col rounded-xl border border-stone-200 dark:border-zinc-800 bg-card hover:border-stone-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
    >
      {/* Cover area — latest-version screenview thumbnail, status dot top-right */}
      <div className="relative h-28 bg-stone-50/60 dark:bg-zinc-900/40 border-b border-stone-200 dark:border-zinc-800 overflow-hidden">
        <StatusDot status={catStatus.status} className="absolute top-3 right-3 size-2.5 z-10" />
        {thumbnailUrl ? (
          // Height-locked filmstrip: the screenview renders at a fixed height so every
          // module appears at the same scale across cards regardless of module count.
          // Strips wider than the card overflow into a horizontal scrollbar (6px, themed
          // in globals.css). Narrower strips fill the card width via min-w-full + object-cover
          // (no right-edge gap; minor vertical crop). Scrolls on the inner div so the dot stays pinned.
          <div className="h-full w-full overflow-x-auto overflow-y-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-auto min-w-full max-w-none object-cover select-none"
              loading="lazy"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span
              className="font-mono font-bold tracking-tighter text-3xl select-none text-muted-foreground/30"
              aria-hidden
            >
              {client.clientIdCode}
            </span>
          </div>
        )}
      </div>

      {/* Meta: name */}
      <div className="px-4 pt-3 pb-2 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {client.clientName}
        </p>
      </div>

      {/* Metrics row: V## · time·by · clientIdCode */}
      <div className="flex items-center justify-between gap-2 px-4 pt-1 pb-3 text-[10px] font-mono min-w-0">
        <span className="font-bold text-foreground/80 shrink-0">{versionLabel}</span>
        <span className="text-muted-foreground/80 truncate min-w-0 flex-1 text-center">
          {formatRelative(catStatus.updatedAt)}
          {updatedByShort ? ` · ${updatedByShort}` : ""}
        </span>
        <span className="font-bold text-muted-foreground shrink-0 truncate max-w-[40%] text-right">
          {client.clientIdCode}
        </span>
      </div>

      {/* Status select — full width footer */}
      <div
        className="border-t border-stone-200 dark:border-zinc-800 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Select value={catStatus.status} onValueChange={onStatusChange} disabled={isPending}>
          <SelectTrigger
            className={cn(
              STATUS_TRIGGER_CLASS,
              "w-full border justify-center",
              config.chipClass
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESIGN_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className={STATUS_MENU_ITEM_CLASS}>
                <div className="flex items-center gap-2">
                  <StatusDot status={s} />
                  {getStatusMeta(s).label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function BrandStoryPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

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

  const updateMutation = useMutation({
    mutationFn: async ({ clientIdCode, status }: { clientIdCode: string; status: string }) => {
      const res = await fetch("/api/design-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, category: CATEGORY, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onMutate: async ({ clientIdCode, status }) => {
      setPendingKey(clientIdCode);
      await queryClient.cancelQueries({ queryKey: ["design-status"] });
      const prev = queryClient.getQueryData<ClientDesign[]>(["design-status"]);
      if (prev) {
        queryClient.setQueryData<ClientDesign[]>(
          ["design-status"],
          prev.map((c) =>
            c.clientIdCode === clientIdCode
              ? { ...c, categories: c.categories.map((cat) => cat.category === CATEGORY ? { ...cat, status } : cat) }
              : c
          )
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["design-status"], ctx.prev);
      toast.error("Failed to update status");
    },
    onSettled: () => {
      setPendingKey(null);
      queryClient.invalidateQueries({ queryKey: ["design-status"] });
    },
  });

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
            aria-label="Brand Story"
          >
            <span className="font-bold text-sidebar-foreground">Brand</span>
            <span className="font-normal text-brand">Story</span>
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
            <Skeleton key={i} className="h-[252px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm text-muted-foreground">Failed to load. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="rounded-full bg-muted/40 p-6">
            <BookOpen className="size-8 text-muted-foreground/50" />
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
              <StoryTile
                key={client.clientIdCode}
                client={client}
                catStatus={catStatus}
                onStatusChange={(status) => updateMutation.mutate({ clientIdCode: client.clientIdCode, status })}
                isPending={pendingKey === client.clientIdCode}
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
