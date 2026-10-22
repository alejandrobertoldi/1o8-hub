"use client";
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */

// Client portal: what Amazon shoppers say about this client's products.
// Read-only, charcoal-blue surface. Data comes from the Hub review store.

import { Suspense, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalClientParam } from "@/components/portal/portal-visible-clients";
import { PortalStackedClients, usePortalStackedClients } from "@/components/portal/portal-stacked-clients";
import type { AsinOverview, ClientReviewOverview } from "@/lib/reviews/insights";
import type { ReviewTopic, ReviewTopicTrend } from "@/lib/db/schema";
import {
  Pagination, ProductTable, RatingHistoryChart, ReviewCard, ReviewKpis, StarBars, TopicList, TopicTrendChart,
  type HistoryPoint, type ReviewRow,
} from "@/components/reviews/reviews-dashboard";

type Payload = {
  demo?: boolean;
  clientIdCode: string;
  totals: ClientReviewOverview["totals"] | null;
  /** Same rows as the hub overview minus `lastError`, which the portal API strips. */
  asins: AsinOverview[];
  rangeStart: string | null;
  rangeEnd: string | null;
  positive: ReviewTopic[];
  negative: ReviewTopic[];
  trends: { positive: ReviewTopicTrend[]; negative: ReviewTopicTrend[] };
  reviews: ReviewRow[];
  page: number;
  totalPages: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  history: HistoryPoint[];
};

function PortalReviewsInner() {
  const { label } = usePortalStackedClients();
  const clientParam = usePortalClientParam();

  return (
    <div className="space-y-6 -mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Customer Reviews">
            <span className="font-bold text-foreground">Customer</span>
            <span className="font-normal text-portal-accent">Reviews</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{label} &mdash; What Amazon shoppers say about your products</p>
        </div>
      </PageMetaSlot>

      <Link href={`/portal${clientParam}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-portal-accent">
        <ArrowLeft className="size-3" /> Back to dashboard
      </Link>

      {/* One block per visible client, stacked in assignment order. */}
      <PortalStackedClients>{(code) => <ReviewsForClient clientIdCode={code} />}</PortalStackedClients>
    </div>
  );
}

function ReviewsForClient({ clientIdCode }: { clientIdCode: string }) {
  const [selectedAsin, setSelectedAsin] = useState<string | null>(null);
  const [star, setStar] = useState<number | null>(null);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  // The page number is only valid for the filter set it was chosen under; any filter change falls back to page 1 without an effect.
  const filterKey = [clientIdCode, selectedAsin, star].join("|");
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback((p: number) => setPageState({ key: filterKey, page: p }), [filterKey]);

  const q = useQuery({
    queryKey: ["portal", "reviews", clientIdCode, selectedAsin, star, page],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("client", clientIdCode);
      if (selectedAsin) p.set("asins", selectedAsin);
      if (star) p.set("ratings", String(star));
      p.set("page", String(page));
      const res = await fetch(`/api/portal/reviews?${p}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load reviews");
      return (await res.json()) as Payload;
    },
  });

  const data = q.data;
  const allAsins = data?.asins ?? [];
  // Clients see their live catalog by default; retired listings are one click away.
  const asins = showAllStatuses ? allAsins : allAsins.filter((a) => !a.status || a.status === "Active" || a.asin === selectedAsin);
  const hiddenCount = allAsins.length - asins.length;
  const totals = (() => {
    if (!data?.totals) return null;
    if (!selectedAsin) return data.totals;
    const a = asins.find((x) => x.asin === selectedAsin);
    return a ? { ...data.totals, weightedRating: a.rating, ratingsTotal: a.ratingsTotal ?? 0, storedReviews: a.storedReviews, negativeShare: a.negativeShare, products: 1, synced: 1 } : data.totals;
  })();

  if (q.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (q.isError) {
    return <div className="rounded-xl border border-border bg-card p-4 text-sm text-brand-red">{(q.error as Error).message}</div>;
  }
  if (data?.demo) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Star className="mx-auto mb-2 size-6 text-portal-accent" />
        Review intelligence becomes available once your catalog is onboarded.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReviewKpis totals={totals} surface="portal" />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Products</h2>
          <div className="flex items-center gap-3 text-xs">
            {(hiddenCount > 0 || showAllStatuses) && (
              <button type="button" onClick={() => setShowAllStatuses((v) => !v)} className="text-portal-accent hover:underline">
                {showAllStatuses ? "Show active only" : `Show ${hiddenCount} inactive`}
              </button>
            )}
            {selectedAsin && <button type="button" onClick={() => setSelectedAsin(null)} className="text-portal-accent hover:underline">Show all products</button>}
          </div>
        </div>
        <ProductTable asins={asins} surface="portal" selected={selectedAsin} onSelect={setSelectedAsin} emptyMessage="No active products yet." />
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-bold">Themes</h2>
          <p className="text-[11px] text-muted-foreground">
            {data?.rangeStart && data?.rangeEnd ? `From Amazon Customer Feedback, ${data.rangeStart} to ${data.rangeEnd}.` : "Theme analysis will appear after the next refresh."}
          </p>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <TopicList title="What customers praise" topics={data?.positive ?? []} tone="positive" surface="portal" emptyHint="Theme analysis will appear after the next refresh." />
          <TopicList title="What customers complain about" topics={data?.negative ?? []} tone="negative" surface="portal" emptyHint="Theme analysis will appear after the next refresh." />
          <TopicTrendChart trends={data?.trends ?? null} surface="portal" />
          <RatingHistoryChart history={data?.history ?? []} surface="portal" />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">Recent reviews {data ? <span className="font-normal text-muted-foreground">({data.total.toLocaleString("en-US")})</span> : null}</h2>
        <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
          <StarBars distribution={data?.distribution ?? null} surface="portal" selected={star} onSelect={setStar} />
          <div className="space-y-2">
            {(data?.reviews.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">No reviews to show yet.</div>
            ) : (
              <>
                {data!.reviews.map((r) => <ReviewCard key={r.id} review={r} surface="portal" />)}
                <Pagination page={data!.page} totalPages={data!.totalPages} onPage={setPage} surface="portal" />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PortalReviewsPage() {
  return (
    <Suspense fallback={<div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>}>
      <PortalReviewsInner />
    </Suspense>
  );
}
