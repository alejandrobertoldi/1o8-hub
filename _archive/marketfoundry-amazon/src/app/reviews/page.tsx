"use client";
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/prefer-useReducer */

// Hub Reviews Intelligence: every client's Amazon reviews and Customer Feedback
// themes in one place, fed by Rainforest (review text) and the shared Helium 10
// MCP connection (topics, star impact, rating history). Burnt-orange surface.

import { helium10Enabled } from "@/lib/helium10/enabled";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AlertTriangle, Download, RefreshCw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { CLIENT_NAMES } from "@/lib/constants";
import { ProductTableStatusChips } from "@/components/products/product-table-toolbar";
import { cn } from "@/lib/utils";
import type { ClientReviewOverview, ClientTopicInsights, ReviewClientSummary } from "@/lib/reviews/insights";
import type { ReviewSyncRun } from "@/lib/db/schema";
import {
  Pagination, ProductTable, RatingHistoryChart, ReviewCard, ReviewKpis, StarBars, TopicList, TopicTrendChart,
  relativeTime, type HistoryPoint, type ReviewRow,
} from "@/components/reviews/reviews-dashboard";

type RunRow = Omit<ReviewSyncRun, "startedAt" | "completedAt"> & { startedAt: string; completedAt: string | null };
type OverviewPayload = ClientReviewOverview & { runs: RunRow[] };
type InsightsPayload = ClientTopicInsights & { history: HistoryPoint[] };
type ListPayload = { reviews: ReviewRow[]; page: number; totalPages: number; total: number; distribution: Record<1 | 2 | 3 | 4 | 5, number>; averageRating: number | null };
type Provider = "rainforest" | "helium10";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `Request failed (${res.status})`);
  return res.json();
}

const DEFAULT_STATUSES = new Set(["Active"]);

function ReviewsPageInner() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canSync = ["owner", "super_admin", "admin", "editor"].includes(role);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Client + ASIN selection lives in the URL so "Back to reviews" from a product page restores it.
  const selectedClient = searchParams.get("client")?.trim() || null;
  const selectedAsin = searchParams.get("asin")?.trim().toUpperCase() || null;
  const setSelection = useCallback(
    (client: string | null, asin: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (client) params.set("client", client); else params.delete("client");
      if (client && asin) params.set("asin", asin); else params.delete("asin");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const setSelectedClient = useCallback((client: string | null) => setSelection(client, null), [setSelection]);
  const setSelectedAsin = useCallback((asin: string | null) => setSelection(selectedClient, asin), [setSelection, selectedClient]);

  const [statuses, setStatuses] = useState<Set<string>>(DEFAULT_STATUSES);
  const toggleStatus = useCallback((status: string) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);
  const [star, setStar] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<"newest" | "helpful" | "rating_asc" | "rating_desc">("newest");
  const [providers, setProviders] = useState<Provider[]>(helium10Enabled() ? ["rainforest", "helium10"] : ["rainforest"]);
  const [tab, setTab] = useState<"themes" | "reviews">("themes");

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  // The page number is only valid for the filter set it was chosen under; any filter change falls back to page 1 without an effect.
  const filterKey = [selectedClient, selectedAsin, star, debounced, sort].join("|");
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback((p: number) => setPageState({ key: filterKey, page: p }), [filterKey]);

  const clientsQ = useQuery({ queryKey: ["reviews", "clients"], queryFn: () => getJson<{ clients: ReviewClientSummary[] }>("/api/reviews/overview") });
  const overviewQ = useQuery({
    queryKey: ["reviews", "overview", selectedClient],
    queryFn: () => getJson<OverviewPayload>(`/api/reviews/overview?client_id=${encodeURIComponent(selectedClient!)}`),
    enabled: !!selectedClient,
  });
  const insightsQ = useQuery({
    queryKey: ["reviews", "insights", selectedClient, selectedAsin],
    queryFn: () => getJson<InsightsPayload>(`/api/reviews/insights?client_id=${encodeURIComponent(selectedClient!)}${selectedAsin ? `&asins=${selectedAsin}` : ""}`),
    enabled: !!selectedClient,
  });
  const listQ = useQuery({
    queryKey: ["reviews", "list", selectedClient, selectedAsin, star, debounced, sort, page],
    queryFn: () => {
      const p = new URLSearchParams({ client_id: selectedClient!, page: String(page), page_size: "20", sort });
      if (selectedAsin) p.set("asins", selectedAsin);
      if (star) p.set("ratings", String(star));
      if (debounced) p.set("q", debounced);
      return getJson<ListPayload>(`/api/reviews?${p}`);
    },
    enabled: !!selectedClient,
  });

  const syncMutation = useMutation({
    mutationFn: async (input: { client_id: string; asins?: string[] }) => {
      const res = await fetch("/api/reviews/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, providers }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Sync failed");
      return data as { asinsDone: number; asinsTotal: number; reviewsAdded: number; topicsRefreshed: number; errors: Array<{ asin: string; provider: string; message: string }>; timedOut: boolean };
    },
    onSuccess: (r) => {
      toast.success(`Synced ${r.asinsDone}/${r.asinsTotal} ASINs`, { description: `${r.reviewsAdded} new reviews · ${r.topicsRefreshed} topic snapshots${r.timedOut ? " · stopped at the time limit, run again to continue" : ""}` });
      if (r.errors.length) toast.warning(`${r.errors.length} provider notice${r.errors.length > 1 ? "s" : ""}`, { description: r.errors[0].message });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (e: Error) => toast.error("Sync failed", { description: e.message }),
  });

  const clients = clientsQ.data?.clients ?? [];
  const overview = overviewQ.data;
  const insights = insightsQ.data;
  const list = listQ.data;
  const runs = overview?.runs ?? [];
  const lastRun = runs[0];
  const clientName = selectedClient ? (CLIENT_NAMES[selectedClient] || selectedClient) : null;

  // Products shown in the table: status chips filter (Active by default), always keeping the selected ASIN visible.
  const visibleAsins = useMemo(() => {
    const all = overview?.asins ?? [];
    if (statuses.size === 0) return all;
    return all.filter((a) => (a.status ? statuses.has(a.status) : statuses.has("Active")) || a.asin === selectedAsin);
  }, [overview, statuses, selectedAsin]);

  const totals = useMemo(() => {
    if (!overview) return null;
    if (selectedAsin) {
      const a = overview.asins.find((x) => x.asin === selectedAsin);
      if (a) return { ...overview.totals, weightedRating: a.rating, ratingsTotal: a.ratingsTotal ?? 0, storedReviews: a.storedReviews, negativeShare: a.negativeShare, products: 1, synced: a.lastReviewsFetchAt || a.lastTopicsFetchAt ? 1 : 0 };
    }
    // Recompute the simple counters for the filtered product set; distribution + critical share stay store-wide.
    let weightedSum = 0;
    let weightTotal = 0;
    for (const a of visibleAsins) if (a.rating != null && a.ratingsTotal) { weightedSum += a.rating * a.ratingsTotal; weightTotal += a.ratingsTotal; }
    return {
      ...overview.totals,
      products: visibleAsins.length,
      synced: visibleAsins.filter((a) => a.lastReviewsFetchAt || a.lastTopicsFetchAt).length,
      storedReviews: visibleAsins.reduce((n, a) => n + a.storedReviews, 0),
      weightedRating: weightTotal ? Math.round((weightedSum / weightTotal) * 100) / 100 : null,
      ratingsTotal: weightTotal,
    };
  }, [overview, selectedAsin, visibleAsins]);

  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Reviews Intelligence">
            <span className="font-bold text-sidebar-foreground">Reviews</span>
            <span className="font-normal text-brand">Intelligence</span>
          </h1>
          <BetaPill />
        </div>
      </PageMetaSlot>

      <div className="flex min-h-[calc(100vh-80px)] gap-4">
        {/* Client rail */}
        <aside className="w-[280px] shrink-0 space-y-3">
          <div className="glass-card rounded-lg p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clients</h3>
            {clientsQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="max-h-[60vh] space-y-1 overflow-y-auto">
                {clients.map((c) => {
                  const active = selectedClient === c.clientIdCode;
                  return (
                    <button
                      key={c.clientIdCode}
                      type="button"
                      onClick={() => { setSelectedClient(active ? null : c.clientIdCode); setStar(null); }}
                      className={cn(
                        "w-full rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-all",
                        active ? "border-brand/30 bg-brand/15 text-brand" : "border-transparent text-foreground/80 hover:bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{CLIENT_NAMES[c.clientIdCode] || c.clientIdCode}</span>
                        {c.weightedRating != null && <span className="shrink-0 tabular-nums">{c.weightedRating.toFixed(1)} ★</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{c.synced}/{c.products} synced</span>
                        <span>· {c.storedReviews.toLocaleString("en-US")} reviews</span>
                        <span>· {relativeTime(c.lastSyncAt)}</span>
                        {c.errors > 0 && <AlertTriangle className="size-3 text-brand-red" />}
                      </div>
                    </button>
                  );
                })}
                {clients.length === 0 && <p className="px-1 text-xs text-muted-foreground">No active clients with ASINs.</p>}
              </div>
            )}
          </div>

          {selectedClient && canSync && (
            <div className="glass-card rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sync sources</h3>
              <div className="space-y-1.5 text-xs">
                {([
                  ["rainforest", "Review text", "Rainforest scraper · newest reviews"],
                  ["helium10", "Themes & history", "Helium 10 MCP · Amazon Customer Feedback"],
                ] as const).filter(([id]) => id !== "helium10" || helium10Enabled()).map(([id, label, hint]) => (
                  <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
                    <input
                      type="checkbox"
                      checked={providers.includes(id)}
                      onChange={(e) => setProviders((p) => (e.target.checked ? [...new Set([...p, id])] : p.filter((x) => x !== id)))}
                      className="mt-0.5 accent-brand"
                    />
                    <span><span className="font-medium">{label}</span><br /><span className="text-[10px] text-muted-foreground">{hint}</span></span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={syncMutation.isPending || providers.length === 0}
                onClick={() => syncMutation.mutate({ client_id: selectedClient, ...(selectedAsin ? { asins: [selectedAsin] } : {}) })}
                className="flex w-full items-center justify-center gap-1.5 rounded-full bg-brand px-3 py-2 text-[13px] font-medium text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3.5", syncMutation.isPending && "animate-spin")} />
                {syncMutation.isPending ? "Syncing…" : selectedAsin ? `Sync ${selectedAsin}` : "Sync stalest 25 ASINs"}
              </button>
              <p className="text-[10px] text-muted-foreground">Spends Rainforest credits and Helium 10 quota. The Saturday cron refreshes every active ASIN in batches through the day.</p>
              {lastRun && (
                <div className="rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
                  <div className="flex justify-between"><span>Last run</span><span>{relativeTime(lastRun.startedAt)} · {lastRun.trigger}</span></div>
                  <div className="flex justify-between"><span>ASINs</span><span className="tabular-nums">{lastRun.asinsDone}/{lastRun.asinsTotal}{lastRun.asinsFailed ? ` · ${lastRun.asinsFailed} failed` : ""}</span></div>
                  <div className="flex justify-between"><span>Added</span><span className="tabular-nums">{lastRun.reviewsAdded} reviews · {lastRun.topicsRefreshed} topics</span></div>
                  {lastRun.errors.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-brand-red">{lastRun.errors.length} notice{lastRun.errors.length > 1 ? "s" : ""}</summary>
                      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                        {lastRun.errors.slice(0, 10).map((e, i) => <li key={i} className="break-words"><span className="font-mono">{e.asin}</span> {e.provider}: {e.message}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 space-y-4">
          {!selectedClient ? (
            <div className="glass-card flex h-64 items-center justify-center rounded-lg text-sm text-muted-foreground">Select a client to see its Amazon reviews and themes.</div>
          ) : overviewQ.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
          ) : overviewQ.isError ? (
            <div className="glass-card rounded-lg p-4 text-sm text-brand-red">{(overviewQ.error as Error).message}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">{clientName}{selectedAsin && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{selectedAsin}</span>}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {insights?.rangeStart && insights?.rangeEnd ? `Themes from Amazon Customer Feedback, ${insights.rangeStart} to ${insights.rangeEnd}` : "Sync to load Amazon Customer Feedback themes"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAsin && (
                    <button type="button" onClick={() => setSelectedAsin(null)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"><X className="size-3" /> All products</button>
                  )}
                  <a
                    href={`/api/reviews/export?client_id=${encodeURIComponent(selectedClient)}${selectedAsin ? `&asins=${selectedAsin}` : ""}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    <Download className="size-3" /> CSV for SEO S3
                  </a>
                </div>
              </div>

              <ReviewKpis totals={totals} surface="hub" />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <ProductTableStatusChips statuses={statuses} onStatusToggle={toggleStatus} />
                <span className="text-[10px] text-muted-foreground">{visibleAsins.length} of {overview?.asins.length ?? 0} products</span>
              </div>
              <ProductTable
                asins={visibleAsins}
                surface="hub"
                selected={selectedAsin}
                onSelect={setSelectedAsin}
                showErrors
                productHref={(a) => (a.productId ? `/products/${a.productId}?from=reviews` : null)}
                emptyMessage={overview?.asins.length ? "No products match the selected statuses." : "No sellable ASINs for this client."}
              />

              <div className="flex gap-1 border-b border-border text-xs">
                {(["themes", "reviews"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-2 font-medium capitalize", tab === t ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    {t === "themes" ? "Themes & trends" : `Reviews${list ? ` (${list.total.toLocaleString("en-US")})` : ""}`}
                  </button>
                ))}
              </div>

              {tab === "themes" && (
                insightsQ.isLoading ? <Skeleton className="h-64 w-full" /> : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    <TopicList title="What customers praise" topics={insights?.positive ?? []} tone="positive" surface="hub" emptyHint="Run a sync with Themes & history enabled." />
                    <TopicList title="What customers complain about" topics={insights?.negative ?? []} tone="negative" surface="hub" emptyHint="Run a sync with Themes & history enabled." />
                    <TopicTrendChart trends={insights?.trends ?? null} surface="hub" />
                    <RatingHistoryChart history={insights?.history ?? []} surface="hub" />
                    <div className="rounded-xl border border-border bg-card p-4 xl:col-span-2">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-bold">Keyword candidates from review language</h3>
                        <span className="text-[10px] text-muted-foreground">for S2 keywords, S4 Alexa for Shopping and bullet copy</span>
                      </div>
                      {insights?.keywordCandidates.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {insights.keywordCandidates.map((k) => (
                            <span key={k.phrase} className={cn("rounded-full border px-2 py-0.5 text-[11px]", k.from === "topic" ? "border-brand/40 bg-brand/10 text-brand" : "border-border bg-muted/40")} title={`${k.from} · weight ${k.weight.toFixed(1)}`}>
                              {k.phrase}
                            </span>
                          ))}
                        </div>
                      ) : <p className="text-xs text-muted-foreground">Appears once themes are synced.</p>}
                    </div>
                  </div>
                )
              )}

              {tab === "reviews" && (
                <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
                  <div className="space-y-3">
                    <StarBars distribution={list?.distribution ?? null} surface="hub" selected={star} onSelect={setStar} />
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search review text…" className="h-8 pl-7 text-xs" />
                      </div>
                      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                        <option value="newest">Newest first</option>
                        <option value="helpful">Most helpful</option>
                        <option value="rating_asc">Lowest rating</option>
                        <option value="rating_desc">Highest rating</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {listQ.isLoading ? <Skeleton className="h-64 w-full" /> : (list?.reviews.length ?? 0) === 0 ? (
                      <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                        {overview?.totals.storedReviews ? "No reviews match these filters." : "No reviews stored yet. Run a sync with Review text enabled."}
                      </div>
                    ) : (
                      <>
                        {list!.reviews.map((r) => <ReviewCard key={r.id} review={r} surface="hub" />)}
                        <Pagination page={list!.page} totalPages={list!.totalPages} onPage={setPage} surface="hub" />
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>}>
      <ReviewsPageInner />
    </Suspense>
  );
}
