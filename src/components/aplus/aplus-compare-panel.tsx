/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  CircleDot,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────

type DiffStatus = "match" | "mismatch" | "hub_only" | "amazon_only";

type DiffEntry = {
  slot: string;
  hubAltText: string | null;
  amazonAltText: string | null;
  status: DiffStatus;
};

type CompareApiResponse = {
  product: { id: string; asin: string | null; name: string | null };
  snapshotFetchedAt: string | null;
  hubImageCount: number;
  amazonImageCount: number | null;
  hasSnapshot: boolean;
  hasAmazonAplus: boolean;
  imageDiff: DiffEntry[];
  matchRate: number;
};

interface AplusComparePanelProps {
  productId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatSlot(slot: string): string {
  // "module_1/image_2" -> "Module 1 / Image 2"
  // "amazon_only/3" -> "Amazon Only #3"
  if (slot.startsWith("amazon_only/")) {
    const n = slot.split("/")[1];
    return `Amazon Only #${n}`;
  }
  return slot
    .replace("module_", "Module ")
    .replace("/image_", " / Image ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Status badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DiffStatus }) {
  switch (status) {
    case "match":
      return (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 gap-1"
        >
          <CheckCircle2 className="size-3" />
          Match
        </Badge>
      );
    case "mismatch":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-500 gap-1"
        >
          <AlertTriangle className="size-3" />
          Mismatch
        </Badge>
      );
    case "hub_only":
      return (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-500/10 text-blue-500 gap-1"
        >
          <Info className="size-3" />
          Hub Only
        </Badge>
      );
    case "amazon_only":
      return (
        <Badge
          variant="outline"
          className="border-purple-500/40 bg-purple-500/10 text-purple-500 gap-1"
        >
          <CircleDot className="size-3" />
          Amazon Only
        </Badge>
      );
  }
}

// ── Match rate indicator ───────────────────────────────────────────────

function MatchRateIndicator({ rate }: { rate: number }) {
  const color =
    rate >= 90
      ? "text-emerald-500"
      : rate >= 50
      ? "text-amber-500"
      : "text-red-400";

  return (
    <div className="flex flex-col items-center">
      <span className={cn("text-4xl font-bold tabular-nums", color)}>
        {rate}%
      </span>
      <span className="text-xs text-muted-foreground mt-0.5">Match Rate</span>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────

function CompareSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full rounded-lg"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function AplusComparePanel({ productId }: AplusComparePanelProps) {
  const { data, isLoading, isError } = useQuery<CompareApiResponse>({
    queryKey: ["aplus-compare", productId],
    queryFn: async () => {
      const res = await fetch(`/api/aplus/${productId}/compare`);
      if (!res.ok) throw new Error("Failed to load comparison data");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <CompareSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <AlertCircle className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Failed to load comparison data. Please try again.
        </p>
      </div>
    );
  }

  // No snapshot at all
  if (!data.hasSnapshot) {
    return (
      <div className="space-y-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-500">
                No Rainforest snapshot available
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Run Amazon Sync to fetch live data before comparing.
              </p>
            </div>
          </CardContent>
        </Card>

        {data.imageDiff.length > 0 && (
          <ImageDiffTable imageDiff={data.imageDiff} />
        )}
      </div>
    );
  }

  // Has snapshot but no A+ content on Amazon
  if (!data.hasAmazonAplus) {
    return (
      <div className="space-y-4">
        {/* Summary header */}
        <SummaryHeader data={data} />

        <Card className="border-muted/30 bg-muted/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <Info className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Amazon has no A+ content for this product.
            </p>
          </CardContent>
        </Card>

        {data.imageDiff.length > 0 && (
          <ImageDiffTable imageDiff={data.imageDiff} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryHeader data={data} />
      <ImageDiffTable imageDiff={data.imageDiff} />
    </div>
  );
}

// ── Summary header sub-component ──────────────────────────────────────

function SummaryHeader({ data }: { data: CompareApiResponse }) {
  const countDelta =
    data.amazonImageCount !== null
      ? data.amazonImageCount - data.hubImageCount
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="font-semibold">
              {data.product.name ?? data.product.asin ?? "Product"}
            </span>
            {data.product.asin && (
              <span className="ml-2 text-xs font-mono text-muted-foreground">
                {data.product.asin}
              </span>
            )}
          </div>
          {data.snapshotFetchedAt && (
            <span className="text-xs font-normal text-muted-foreground">
              Snapshot from: {formatDate(data.snapshotFetchedAt)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8 flex-wrap">
          {/* Match rate */}
          <MatchRateIndicator rate={data.matchRate} />

          {/* Image count comparison */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-24">Hub images:</span>
              <span className="font-semibold tabular-nums">
                {data.hubImageCount}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-24">
                Amazon images:
              </span>
              <span className="font-semibold tabular-nums">
                {data.amazonImageCount ?? "—"}
              </span>
              {countDelta !== null && countDelta !== 0 && (
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    countDelta > 0 ? "text-emerald-500" : "text-red-400"
                  )}
                >
                  {countDelta > 0 ? `+${countDelta}` : countDelta}
                </span>
              )}
            </div>
          </div>

          {/* Quick stats */}
          {data.imageDiff.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {(["match", "mismatch", "hub_only", "amazon_only"] as DiffStatus[]).map(
                (status) => {
                  const count = data.imageDiff.filter(
                    (e) => e.status === status
                  ).length;
                  if (count === 0) return null;
                  return (
                    <div key={status} className="flex items-center gap-1">
                      <StatusBadge status={status} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Image diff table sub-component ────────────────────────────────────

function ImageDiffTable({ imageDiff }: { imageDiff: DiffEntry[] }) {
  if (imageDiff.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No image data to compare.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-300 dark:border-white/10 overflow-hidden glass-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-neutral-200 dark:border-white/10 hover:bg-transparent">
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-40">
              Slot
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hub Alt Text
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Amazon Alt Text
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-36 text-center">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {imageDiff.map((entry, i) => (
            <TableRow
              key={i}
              className="border-b border-neutral-100 dark:border-white/5"
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {formatSlot(entry.slot)}
              </TableCell>
              <TableCell className="text-sm max-w-xs">
                {entry.hubAltText ? (
                  <span className="text-foreground">{entry.hubAltText}</span>
                ) : (
                  <span className="text-muted-foreground/50 italic">
                    (empty)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm max-w-xs">
                {entry.amazonAltText ? (
                  <span className="text-foreground">
                    {entry.amazonAltText}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 italic">
                    (empty)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <StatusBadge status={entry.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
