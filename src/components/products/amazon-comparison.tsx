"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Loader2,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertCircle,
} from "lucide-react";
import type { Product } from "@/lib/db/schema";
import type {
  ComparisonResult,
  FieldDiff,
  DiffStatus,
} from "@/lib/sp-api/comparator";
import { getMatchColor } from "@/lib/sp-api/comparator";

// ─── Types ──────────────────────────────────────────────────────────

interface AmazonComparisonProps {
  productId: string;
  product: Product;
}

type FilterStatus = "all" | "mismatch" | "bible_only" | "amazon_only";

interface HistoryEntry {
  id: number;
  overallMatch: number;
  fetchedAt: string;
  mismatchedFields: number;
  totalFields: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusIcon({ status }: { status: DiffStatus }) {
  switch (status) {
    case "match":
      return <Check className="h-4 w-4 text-emerald-500" />;
    case "mismatch":
      return <X className="h-4 w-4 text-red-500" />;
    case "bible_only":
      return <ArrowRight className="h-4 w-4 text-brand" />;
    case "amazon_only":
      return <ArrowLeft className="h-4 w-4 text-orange-500" />;
    default:
      return null;
  }
}

const BORDER_COLORS: Record<DiffStatus, string> = {
  match: "border-l-emerald-500",
  mismatch: "border-l-red-500",
  bible_only: "border-l-brand",
  amazon_only: "border-l-orange-500",
  both_empty: "border-l-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  title: "Title",
  brand: "Brand",
  bullets: "Bullets",
  description: "Description",
  images: "Images",
  price: "Price",
  keywords: "Keywords",
  features: "Features",
};

// ─── Truncatable text ───────────────────────────────────────────────

function TruncatedText({ text, limit = 200 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {expanded ? text : text.slice(0, limit) + "..."}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-brand hover:underline text-xs"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </span>
  );
}

// ─── Diff card for text fields ──────────────────────────────────────

function TextDiffCard({ diff }: { diff: FieldDiff }) {
  return (
    <div
      className={`rounded-md border-l-2 bg-card p-3 ${BORDER_COLORS[diff.status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground/80">
          {diff.fieldLabel}
        </span>
        <StatusIcon status={diff.status} />
      </div>
      <div className="space-y-2">
        {diff.bibleValue && (
          <div className="rounded bg-gray-750 border-l-2 border-brand px-2.5 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Hub
            </span>
            <span className="text-xs text-foreground/80">
              <TruncatedText text={diff.bibleValue} />
            </span>
          </div>
        )}
        {diff.amazonValue && (
          <div className="rounded bg-gray-750 border-l-2 border-orange-500 px-2.5 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Amazon
            </span>
            <span className="text-xs text-foreground/80">
              <TruncatedText text={diff.amazonValue} />
            </span>
          </div>
        )}
      </div>
      {diff.status === "mismatch" && (
        <div className="mt-2 text-[11px] text-muted-foreground/70">
          Similarity: {Math.round(diff.similarity * 100)}%
        </div>
      )}
    </div>
  );
}

// ─── Diff card for image fields ─────────────────────────────────────

function ImageDiffCard({ diff }: { diff: FieldDiff }) {
  const placeholder = (
    <div className="w-20 h-20 rounded bg-gray-700 flex items-center justify-center text-muted-foreground text-[10px]">
      No image
    </div>
  );

  return (
    <div
      className={`rounded-md border-l-2 bg-card p-3 ${BORDER_COLORS[diff.status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground/80">
          {diff.fieldLabel}
        </span>
        <StatusIcon status={diff.status} />
      </div>
      <div className="flex items-start gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Hub
          </span>
          {diff.bibleValue ? (
            <a
              href={diff.bibleValue}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={diff.bibleValue}
                alt="Hub"
                className="w-20 h-20 object-contain bg-card rounded"
              />
            </a>
          ) : (
            placeholder
          )}
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Amazon
          </span>
          {diff.amazonValue ? (
            <a
              href={diff.amazonValue}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={diff.amazonValue}
                alt="Amazon"
                className="w-20 h-20 object-contain bg-card rounded"
              />
            </a>
          ) : (
            placeholder
          )}
        </div>
      </div>
      {diff.status === "mismatch" && (
        <div className="mt-2 text-[11px] text-muted-foreground/70">URLs differ</div>
      )}
    </div>
  );
}

// ─── Diff card for price fields ─────────────────────────────────────

function PriceDiffCard({ diff }: { diff: FieldDiff }) {
  return (
    <div
      className={`rounded-md border-l-2 bg-card p-3 ${BORDER_COLORS[diff.status]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground/80">
          {diff.fieldLabel}
        </span>
        <StatusIcon status={diff.status} />
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div>
          <span className="text-muted-foreground">Hub: </span>
          <span className="text-foreground/80 font-medium">
            {diff.bibleValue ? `$${diff.bibleValue}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Amazon: </span>
          <span className="text-foreground/80 font-medium">
            {diff.amazonValue ? `$${diff.amazonValue}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function AmazonComparison({
  productId,
  product,
}: AmazonComparisonProps) {
  const { data: session } = useSession();
  const isViewer = session?.user?.role === "viewer";
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Auto-trigger comparison (use cache)
  const compareMutation = useMutation({
    mutationFn: async (forceRefresh: boolean = false) => {
      const res = await fetch(`/api/products/${productId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Comparison failed");
      }
      return res.json() as Promise<{
        comparison: ComparisonResult;
        cached: boolean;
      }>;
    },
  });

  const comparison = compareMutation.data?.comparison ?? null;
  const cached = compareMutation.data?.cached ?? false;

  // History query
  const { data: historyData } = useQuery({
    queryKey: ["comparison-history", productId],
    queryFn: async () => {
      const res = await fetch(
        `/api/products/${productId}/compare/history?limit=10`
      );
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json() as Promise<{ history: HistoryEntry[] }>;
    },
    enabled: historyOpen,
  });

  // Filter diffs
  const filteredDiffs = useMemo(() => {
    if (!comparison) return [];
    return comparison.diffs.filter((d) => {
      if (d.status === "both_empty") return false;
      if (filter === "all") return true;
      return d.status === filter;
    });
  }, [comparison, filter]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, FieldDiff[]> = {};
    for (const diff of filteredDiffs) {
      const cat = diff.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(diff);
    }
    return groups;
  }, [filteredDiffs]);

  // Counts for filter chips
  const counts = useMemo(() => {
    if (!comparison) return { all: 0, mismatch: 0, bible_only: 0, amazon_only: 0 };
    const nonEmpty = comparison.diffs.filter((d) => d.status !== "both_empty");
    return {
      all: nonEmpty.length,
      mismatch: nonEmpty.filter((d) => d.status === "mismatch").length,
      bible_only: nonEmpty.filter((d) => d.status === "bible_only").length,
      amazon_only: nonEmpty.filter((d) => d.status === "amazon_only").length,
    };
  }, [comparison]);

  // No ASIN → show message
  if (!product.asin) {
    return (
      <div className="rounded-lg bg-card p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground/70">
          This product has no ASIN. Assign an ASIN to compare with Amazon.
        </p>
      </div>
    );
  }

  // Initial state — not yet compared
  if (!compareMutation.data && !compareMutation.isPending && !compareMutation.isError) {
    return (
      <div className="rounded-lg bg-card p-6 text-center">
        <Scale className="h-8 w-8 text-brand mx-auto mb-3" />
        <p className="text-sm text-muted-foreground/80 mb-4">
          Compare your Hub data against what&apos;s live on Amazon for{" "}
          <span className="font-mono text-brand">{product.asin}</span>
        </p>
        <Button
          onClick={() => compareMutation.mutate(false)}
          disabled={isViewer}
          className="bg-brand-solid hover:bg-brand-solid-hover text-white"
        >
          Compare with Amazon
        </Button>
        {isViewer && (
          <p className="text-xs text-muted-foreground mt-2">
            Editors and admins can run comparisons.
          </p>
        )}
      </div>
    );
  }

  // Loading
  if (compareMutation.isPending) {
    return (
      <div className="rounded-lg bg-card p-6 text-center">
        <Loader2 className="h-8 w-8 text-brand mx-auto mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground/80">
          Fetching data from Amazon SP-API...
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          This may take a few seconds.
        </p>
      </div>
    );
  }

  // Error
  if (compareMutation.isError) {
    const errMsg = compareMutation.error.message;
    const isCredsMissing = errMsg.includes("No SP-API credentials");
    const isNotFound = errMsg.includes("not found on Amazon");
    const isAccessDenied = errMsg.includes("access denied");
    return (
      <div className="rounded-lg bg-card p-6 text-center">
        <AlertCircle className={`h-8 w-8 mx-auto mb-3 ${isCredsMissing ? "text-brand" : "text-red-500"}`} />
        <p className="text-sm text-red-400 mb-1">
          {errMsg}
        </p>
        {isCredsMissing && (
          <p className="text-xs text-muted-foreground mb-3">
            Ask an admin to configure SP-API credentials for this client.
          </p>
        )}
        {isNotFound && (
          <p className="text-xs text-muted-foreground mb-3">
            The ASIN may be incorrect or the product may not be listed in this marketplace.
          </p>
        )}
        {isAccessDenied && (
          <p className="text-xs text-muted-foreground mb-3">
            The SP-API credentials may be expired or lack permissions. Check the admin settings.
          </p>
        )}
        {!isCredsMissing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => compareMutation.mutate(false)}
            className="border-border text-muted-foreground/80 hover:text-white"
          >
            Try Again
          </Button>
        )}
      </div>
    );
  }

  // Results
  if (!comparison) return null;
  const matchColor = getMatchColor(comparison.overallMatch);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-lg bg-card px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-muted-foreground">
              Hub vs Amazon &mdash;{" "}
              <span className="font-mono">{comparison.asin}</span>
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: matchColor }}
            >
              {comparison.overallMatch}% match
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
          {comparison.fetchedAt && (
            <span>
              {cached ? "Cached" : "Fetched"}{" "}
              {relativeTime(comparison.fetchedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => compareMutation.mutate(true)}
            disabled={compareMutation.isPending || isViewer}
            className="border-border text-muted-foreground/80 hover:text-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1 ${compareMutation.isPending ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all" as FilterStatus, label: "All" },
            { key: "mismatch" as FilterStatus, label: "Mismatches" },
            { key: "bible_only" as FilterStatus, label: "Hub Only" },
            { key: "amazon_only" as FilterStatus, label: "Amazon Only" },
          ] as const
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`text-xs px-3 py-1 rounded-full transition-colors ${
              filter === chip.key
                ? "bg-brand-solid text-white font-medium"
                : "bg-card text-muted-foreground/70 hover:text-foreground/80"
            }`}
          >
            {chip.label} ({counts[chip.key]})
          </button>
        ))}
      </div>

      {/* Diff cards grouped by category */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, diffs]) => (
          <div key={category}>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {CATEGORY_LABELS[category] ?? category}
            </h4>
            <div className="space-y-2">
              {diffs.map((diff) => {
                if (diff.category === "images") {
                  return <ImageDiffCard key={diff.bqName} diff={diff} />;
                }
                if (diff.category === "price") {
                  return <PriceDiffCard key={diff.bqName} diff={diff} />;
                }
                return <TextDiffCard key={diff.bqName} diff={diff} />;
              })}
            </div>
          </div>
        ))}
        {filteredDiffs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {filter === "all"
              ? "All fields are empty on both sides."
              : "No fields match this filter."}
          </p>
        )}
      </div>

      {/* History section */}
      <div className="rounded-lg bg-card">
        <button
          type="button"
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-muted transition-colors rounded-lg"
        >
          {historyOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground/80">
            Comparison History
          </span>
        </button>
        {historyOpen && (
          <div className="px-4 pb-3 space-y-1.5">
            {!historyData?.history?.length ? (
              <p className="text-xs text-muted-foreground py-2">No history yet.</p>
            ) : (
              historyData.history.map((entry, i) => {
                const prev = historyData.history[i + 1];
                const trend =
                  prev != null
                    ? entry.overallMatch > prev.overallMatch
                      ? "up"
                      : entry.overallMatch < prev.overallMatch
                        ? "down"
                        : null
                    : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-xs text-muted-foreground/70 py-1"
                  >
                    <span>
                      {new Date(entry.fetchedAt).toLocaleDateString("en-US")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-medium"
                        style={{
                          color: getMatchColor(entry.overallMatch),
                        }}
                      >
                        {entry.overallMatch}% match
                      </span>
                      {trend === "up" && (
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      )}
                      {trend === "down" && (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-muted-foreground">
                        {entry.mismatchedFields} mismatches
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
