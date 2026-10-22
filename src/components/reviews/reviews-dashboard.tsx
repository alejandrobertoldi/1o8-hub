"use client";
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-doctor/no-array-index-as-key */

// Shared building blocks for the Reviews section. Rendered on both surfaces:
// the hub (burnt orange accent) and the client portal (charcoal blue). The
// `surface` prop is the only thing that decides the accent — never mix them.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Star, ThumbsUp, BadgeCheck } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn, hiResAmazonImg } from "@/lib/utils";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { STATUS_CHIP_STYLES } from "@/lib/constants";
import { accentFor } from "@/components/reports/v2/primitives/chart-colors";
import type { Surface } from "@/components/reports/v2/primitives/palette";
import type { ReviewTopic, ReviewTopicTrend } from "@/lib/db/schema";
import type { AsinOverview, ClientReviewOverview } from "@/lib/reviews/insights";
import type { StarDistribution } from "@/lib/reviews/normalize";

// ── Types shared with the API payloads ────────────────────────────────

export type ReviewRow = {
  id: string;
  asin: string;
  source: string;
  title: string | null;
  body: string | null;
  rating: number | null;
  reviewerName: string | null;
  reviewDate: string | null;
  verifiedPurchase: boolean;
  isVine: boolean;
  helpfulVotes: number;
  variation: string | null;
  images: string[] | null;
  link: string | null;
  reviewCountry: string | null;
  productTitle?: string | null;
};

export type HistoryPoint = { asin: string; day: string; reviewCount: number | null; rating: number | null };

export function accentText(surface: Surface) {
  return surface === "portal" ? "text-portal-accent" : "text-brand";
}
export function accentBg(surface: Surface) {
  return surface === "portal" ? "bg-portal-accent" : "bg-brand";
}
export function accentBorder(surface: Surface) {
  return surface === "portal" ? "border-portal-accent" : "border-brand";
}

export function relativeTime(ts: string | null | undefined): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
const fmtRating = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));

// ── Stars ─────────────────────────────────────────────────────────────

export function Stars({ rating, className }: { rating: number | null | undefined; className?: string }) {
  const r = rating ?? 0;
  return (
    <span className={cn("inline-flex items-center gap-px", className)} aria-label={rating == null ? "No rating" : `${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3", i <= Math.round(r) ? "fill-brand-yellow text-brand-yellow" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

// ── KPI tiles ─────────────────────────────────────────────────────────

export function ReviewKpis({ totals, surface }: { totals: ClientReviewOverview["totals"] | null; surface: Surface }) {
  const tiles: Array<{ label: string; value: string; sub: string }> = [
    { label: "Amazon rating", value: fmtRating(totals?.weightedRating), sub: `${fmtInt(totals?.ratingsTotal)} ratings, weighted` },
    { label: "Reviews stored", value: fmtInt(totals?.storedReviews), sub: `${totals?.synced ?? 0} of ${totals?.products ?? 0} products synced` },
    { label: "Critical share", value: totals?.negativeShare == null ? "—" : `${totals.negativeShare}%`, sub: "1–2 star reviews in store" },
    { label: "Last sync", value: relativeTime(totals?.lastSyncAt), sub: totals?.lastSyncAt ? new Date(totals.lastSyncAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "run a sync to populate" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</div>
          <div className={cn("mt-1.5 text-3xl font-bold leading-none tracking-tighter tabular-nums", accentText(surface))}>{t.value}</div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Star distribution ─────────────────────────────────────────────────

export function StarBars({ distribution, surface, onSelect, selected }: { distribution: StarDistribution | null; surface: Surface; onSelect?: (star: number | null) => void; selected?: number | null }) {
  const total = distribution ? distribution[1] + distribution[2] + distribution[3] + distribution[4] + distribution[5] : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Star distribution</h3>
        <span className="text-[10px] text-muted-foreground">{fmtInt(total)} stored reviews</span>
      </div>
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution?.[star as 1 | 2 | 3 | 4 | 5] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const active = selected === star;
          return (
            <button
              key={star}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(active ? null : star)}
              className={cn("flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs transition-colors", onSelect && "hover:bg-muted/60", active && "bg-muted")}
            >
              <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{star} ★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", star <= 2 ? "bg-brand-red" : star === 3 ? "bg-brand-yellow" : accentBg(surface))} style={{ width: `${pct}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{pct}% · {count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Topic lists (Amazon Customer Feedback via Helium 10) ───────────────

export function TopicList({ title, topics, tone, surface, emptyHint }: { title: string; topics: ReviewTopic[]; tone: "positive" | "negative"; surface: Surface; emptyHint?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...topics.map((t) => t.mentions));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">mentions · star impact</span>
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint ?? "No topic analysis yet."}</p>
      ) : (
        <ul className="space-y-1">
          {topics.map((t) => {
            const isOpen = open === t.topic;
            const impact = t.starImpact;
            return (
              <li key={t.topic} className="rounded-md">
                <button type="button" onClick={() => setOpen(isOpen ? null : t.topic)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted/60">
                  {isOpen ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="w-40 shrink-0 truncate font-medium" title={t.topic}>{t.topic}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className={cn("block h-full rounded-full", tone === "negative" ? "bg-brand-red" : accentBg(surface))} style={{ width: `${Math.max(4, Math.round((t.mentions / max) * 100))}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums">{t.mentions}</span>
                  <span className={cn("w-12 shrink-0 text-right tabular-nums", impact == null ? "text-muted-foreground" : impact < 0 ? "text-brand-red" : "text-brand-green")}>
                    {impact == null ? "—" : `${impact > 0 ? "+" : ""}${impact.toFixed(2)}`}
                  </span>
                </button>
                {isOpen && (
                  <div className="ml-6 mb-2 mt-1 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{t.occurrencePct.toFixed(1)}% of this ASIN&apos;s reviews</span>
                      {t.parent && <span>parent {t.parent.occurrencePct.toFixed(1)}%</span>}
                      {t.category?.occurrencePct != null && <span>category {t.category.occurrencePct.toFixed(1)}%</span>}
                    </div>
                    {t.subtopics.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.subtopics.slice(0, 8).map((s) => (
                          <span key={s.name} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px]">
                            {s.name} <span className="text-muted-foreground">· {s.mentions}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {t.snippets.length > 0 && (
                      <ul className="space-y-1">
                        {t.snippets.slice(0, 4).map((s, i) => (
                          <li key={i} className="border-l-2 border-border pl-2 italic text-foreground/80">&ldquo;{s}&rdquo;</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Topic trend (6-month occurrence %) ────────────────────────────────

export function TopicTrendChart({ trends, surface, title = "Theme trend" }: { trends: { positive: ReviewTopicTrend[]; negative: ReviewTopicTrend[] } | null; surface: Surface; title?: string }) {
  const [pick, setPick] = useState<string | null>(null);
  const all = useMemo(() => [...(trends?.negative ?? []).slice(0, 4).map((t) => ({ ...t, tone: "negative" as const })), ...(trends?.positive ?? []).slice(0, 4).map((t) => ({ ...t, tone: "positive" as const }))], [trends]);
  const current = all.find((t) => t.topic === pick) ?? all[0];
  if (!current || !current.points.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-2 text-xs text-muted-foreground">Trend data appears after a Helium 10 topic sync.</p>
      </div>
    );
  }
  const data = current.points.map((p) => ({ label: p.end.slice(0, 7), asin: p.asinPct, parent: p.parentPct ?? undefined, category: p.categoryPct ?? undefined }));
  const stroke = current.tone === "negative" ? "#C73737" : accentFor(surface);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <select value={current.topic} onChange={(e) => setPick(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs">
          {all.map((t) => <option key={t.topic} value={t.topic}>{t.tone === "negative" ? "▼ " : "▲ "}{t.topic}</option>)}
        </select>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
            <ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${v}%`]} />
            <Line type="monotone" dataKey="asin" name="This catalog" stroke={stroke} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="category" name="Category" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Share of reviews mentioning the theme per rolling 6-month window. Dashed line: category average.</p>
    </div>
  );
}

// ── Rating history (daily rating + review count) ──────────────────────

export function RatingHistoryChart({ history, surface }: { history: HistoryPoint[]; surface: Surface }) {
  const data = useMemo(() => {
    // Sum review counts across ASINs per day; average the rating.
    const byDay = new Map<string, { count: number; ratingSum: number; n: number }>();
    for (const p of history) {
      const cur = byDay.get(p.day) ?? { count: 0, ratingSum: 0, n: 0 };
      cur.count += p.reviewCount ?? 0;
      if (p.rating != null) { cur.ratingSum += p.rating; cur.n++; }
      byDay.set(p.day, cur);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day: day.slice(5), count: v.count, rating: v.n ? Math.round((v.ratingSum / v.n) * 100) / 100 : undefined }));
  }, [history]);
  if (!data.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold">Review count trend</h3>
        <p className="mt-2 text-xs text-muted-foreground">Daily history appears after a Helium 10 sync.</p>
      </div>
    );
  }
  const delta = data[data.length - 1].count - data[0].count;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Review count trend</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{delta >= 0 ? "+" : ""}{fmtInt(delta)} in window</span>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} />
            <ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Line type="monotone" dataKey="count" name="Reviews" stroke={accentFor(surface)} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Product table ─────────────────────────────────────────────────────

export function ProductTable({
  asins,
  surface,
  selected,
  onSelect,
  showErrors,
  productHref,
  emptyMessage,
}: {
  asins: AsinOverview[];
  surface: Surface;
  selected: string | null;
  onSelect: (asin: string | null) => void;
  showErrors?: boolean;
  /** Internal product page for a row; omit (portal) to render the ASIN as plain text. */
  productHref?: (row: AsinOverview) => string | null;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-bold">Product</th>
            <th className="px-3 py-2 text-right font-bold">Rating</th>
            <th className="px-3 py-2 text-right font-bold">Ratings</th>
            <th className="px-3 py-2 text-right font-bold">Stored</th>
            <th className="px-3 py-2 text-right font-bold">Critical</th>
            <th className="hidden px-3 py-2 text-left font-bold lg:table-cell">Top themes</th>
            <th className="px-3 py-2 text-right font-bold">Synced</th>
          </tr>
        </thead>
        <tbody>
          {asins.map((a) => {
            const active = selected === a.asin;
            const href = productHref ? productHref(a) : null;
            return (
              <tr
                key={a.asin}
                onClick={() => onSelect(active ? null : a.asin)}
                className={cn("cursor-pointer border-t border-border transition-colors hover:bg-muted/40", active && "bg-muted/60")}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {a.imageUrl ? (
                      <img src={hiResAmazonImg(a.imageUrl, 80)} alt="" className="size-8 shrink-0 rounded border border-border bg-white object-contain" />
                    ) : (
                      <div className="size-8 shrink-0 rounded border border-border bg-muted" />
                    )}
                    <div className="min-w-0">
                      {/* Line 1: summarized title (falls back to the full item name). */}
                      <div className="truncate font-medium" title={a.title ?? undefined}>{a.summarizedTitle ?? a.title ?? a.asin}</div>
                      {/* Line 2: ASIN -> internal product page, Amazon smile -> live PDP. Clicks here must not toggle row selection. */}
                      <div className="flex items-center gap-1.5 font-mono text-[10px]" onClick={(e) => e.stopPropagation()}>
                        {href ? (
                          <Link href={href} className={cn("font-semibold hover:underline", accentText(surface))} title="Open product in the Hub">{a.asin}</Link>
                        ) : (
                          <span className={cn("font-semibold", accentText(surface))}>{a.asin}</span>
                        )}
                        <AmazonPdpLink asin={a.asin} className="size-3.5" />
                        {a.status && a.status !== "Active" && (
                          <span className={cn("rounded-full px-1.5 py-px font-sans text-[9px] font-bold", STATUS_CHIP_STYLES[a.status] ?? "bg-muted text-muted-foreground")}>{a.status}</span>
                        )}
                        {showErrors && a.lastError && <span className="rounded bg-brand-red/10 px-1 text-brand-red" title={a.lastError}>error</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={cn("font-bold tabular-nums", accentText(surface))}>{fmtRating(a.rating)}</span>
                    <Stars rating={a.rating} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtInt(a.ratingsTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(a.storedReviews)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", (a.negativeShare ?? 0) >= 20 ? "text-brand-red" : "text-muted-foreground")}>{a.negativeShare == null ? "—" : `${a.negativeShare}%`}</td>
                <td className="hidden max-w-[260px] px-3 py-2 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {a.topPositive && <span className="truncate rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] text-brand-green">▲ {a.topPositive}</span>}
                    {a.topNegative && <span className="truncate rounded-full bg-brand-red/10 px-2 py-0.5 text-[10px] text-brand-red">▼ {a.topNegative}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">{relativeTime(a.lastReviewsFetchAt ?? a.lastTopicsFetchAt)}</td>
              </tr>
            );
          })}
          {asins.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">{emptyMessage ?? "No sellable ASINs for this client."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Review list ───────────────────────────────────────────────────────

export function ReviewCard({ review, surface }: { review: ReviewRow; surface: Surface }) {
  const [expanded, setExpanded] = useState(false);
  const body = review.body ?? "";
  const long = body.length > 320;
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} />
            <h4 className="truncate text-sm font-bold">{review.title || "(no title)"}</h4>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{review.reviewerName ?? "Anonymous"}</span>
            {review.reviewDate && <span>· {new Date(review.reviewDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>}
            {review.reviewCountry && <span>· {review.reviewCountry}</span>}
            {review.verifiedPurchase && <span className="inline-flex items-center gap-0.5 text-brand-green"><BadgeCheck className="size-3" /> Verified</span>}
            {review.isVine && <span className="rounded bg-muted px-1">Vine</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {review.helpfulVotes > 0 && <span className="inline-flex items-center gap-1"><ThumbsUp className="size-3" /> {review.helpfulVotes}</span>}
          <span className="font-mono">{review.asin}</span>
          {review.link && (
            <Link href={review.link} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-0.5 hover:underline", accentText(surface))}>
              <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      </div>
      {review.variation && <div className="mt-1.5 text-[10px] text-muted-foreground">{review.variation}</div>}
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-foreground/90">
        {long && !expanded ? body.slice(0, 320).trimEnd() + "…" : body}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className={cn("mt-1 text-[11px] font-medium hover:underline", accentText(surface))}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      {review.images && review.images.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {review.images.slice(0, 5).map((src, i) => <img key={i} src={src} alt="" className="size-12 rounded border border-border object-cover" />)}
        </div>
      )}
    </article>
  );
}

export function Pagination({ page, totalPages, onPage, surface }: { page: number; totalPages: number; onPage: (p: number) => void; surface: Surface }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">Prev</button>
      <span className="tabular-nums text-muted-foreground">Page <span className={cn("font-bold", accentText(surface))}>{page}</span> of {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40 hover:bg-muted">Next</button>
    </div>
  );
}
