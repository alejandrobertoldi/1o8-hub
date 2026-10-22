"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Minus,
  RefreshCw,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { useAmazonLive } from "@/hooks/use-amazon-live";
import { getProductFieldValue } from "@/lib/product-mapper";
import {
  RAINFOREST_FIELD_MAP,
  FIELD_GROUPS,
  getByPath,
  type RainforestFieldMapping,
} from "@/lib/rainforest-field-map";
import type { Product } from "@/lib/db/schema";
import type { RainforestProduct } from "@/types/rainforest";

// ─── Types ──────────────────────────────────────────────────────────

interface AmazonLiveComparisonProps {
  asin: string;
  catalogProduct: Product;
}

type RowStatus = "match" | "mismatch" | "amazon_only" | "both_empty";

interface ComparisonRow {
  label: string;
  hubValue: string | null;
  liveValue: string | null;
  status: RowStatus;
  isImage?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function normalize(val: string | null | undefined): string | null {
  if (val == null) return null;
  const s = val
    .replace(/<[^>]*>/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length === 0 ? null : s;
}

function compareValues(hub: string | null, live: string | null): RowStatus {
  const hubNorm = normalize(hub);
  const liveNorm = normalize(live);
  if (!hubNorm && !liveNorm) return "both_empty";
  if (!hubNorm && liveNorm) return "amazon_only";
  if (hubNorm && !liveNorm) return "both_empty";
  if (hubNorm!.toLowerCase() === liveNorm!.toLowerCase()) return "match";
  return "mismatch";
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function str(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val || null;
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return null;
}

function extractLiveValue(
  live: RainforestProduct,
  mapping: RainforestFieldMapping
): string | null {
  const { rainforestPath, label } = mapping;

  // Special cases that need custom formatting
  if (label === "Fulfillment") {
    const fba = live.buybox_winner?.fulfillment?.is_fulfilled_by_amazon;
    if (fba == null) return null;
    return fba ? "FBA" : "MF (3P)";
  }
  if (label === "Is Prime") {
    if (live.buybox_winner?.is_prime == null) return null;
    return live.buybox_winner.is_prime ? "Yes" : "No";
  }
  if (label === "Rating") {
    return live.rating != null ? `${live.rating} \u2B50` : null;
  }
  if (label === "Review Count") {
    return live.ratings_total != null
      ? live.ratings_total.toLocaleString()
      : null;
  }
  if (label === "BSR #1" || label === "BSR #2") {
    const idx = label === "BSR #1" ? 0 : 1;
    const rank = live.bestsellers_rank?.[idx];
    if (!rank) return null;
    return `#${rank.rank.toLocaleString()} in ${rank.category}`;
  }
  if (label === "A+ Content") {
    if (!live.a_plus_content) return null;
    return live.a_plus_content.has_a_plus_content ? "Yes" : "No";
  }
  if (label === "Brand Story") {
    if (!live.a_plus_content) return null;
    return live.a_plus_content.has_brand_story ? "Yes" : "No";
  }
  if (label === "Variants") {
    const v = live.variants;
    if (!v || v.length === 0) return null;
    return `${v.length} variant${v.length !== 1 ? "s" : ""}`;
  }
  if (label === "Image Count") {
    return live.images_count != null ? String(live.images_count) : null;
  }
  if (label === "Video Count") {
    return live.videos_count != null ? String(live.videos_count) : null;
  }
  if (label === "Amazon's Choice") {
    return live.amazons_choice?.badge_text ?? null;
  }
  if (label === "Price") {
    return live.buybox_winner?.price?.raw ?? null;
  }
  if (label === "Availability") {
    const avail = live.buybox_winner?.availability;
    if (!avail) return null;
    return typeof avail === "string" ? avail : avail.raw ?? null;
  }

  // Generic dot-path resolution
  const val = getByPath(live as unknown as Record<string, unknown>, rainforestPath);
  return str(val);
}

function extractHubValue(
  product: Product,
  mapping: RainforestFieldMapping
): string | null {
  if (!mapping.catalogKey) return null;

  const val = getProductFieldValue(product, mapping.catalogKey);
  if (val == null || val === "") return null;

  // Format price with $ prefix if it's the price field
  if (mapping.label === "Price") return `$${val}`;
  return val;
}

function buildRows(
  product: Product,
  live: RainforestProduct
): ComparisonRow[] {
  return RAINFOREST_FIELD_MAP.map((mapping) => {
    const hubValue = extractHubValue(product, mapping);
    const liveValue = extractLiveValue(live, mapping);

    // For images, compare presence not URLs
    if (mapping.isImage) {
      const hubHas = !!hubValue;
      const liveHas = !!liveValue;
      return {
        label: mapping.label,
        hubValue,
        liveValue,
        status: hubHas && liveHas ? "match" : !hubHas && liveHas ? "amazon_only" : !hubHas && !liveHas ? "both_empty" : "match",
        isImage: true,
      };
    }

    // For price comparison, compare numeric values
    if (mapping.label === "Price") {
      const hubNum = hubValue ? hubValue.replace(/[$,]/g, "") : null;
      const liveNum = live.buybox_winner?.price?.value?.toString() ?? null;
      return {
        label: mapping.label,
        hubValue,
        liveValue,
        status: compareValues(hubNum, liveNum),
      };
    }

    return {
      label: mapping.label,
      hubValue,
      liveValue,
      status: compareValues(hubValue, liveValue),
    };
  });
}

// ─── Status Icon ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: RowStatus }) {
  switch (status) {
    case "match":
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    case "mismatch":
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
    case "amazon_only":
      return <Info className="h-4 w-4 text-blue-400 shrink-0" />;
    case "both_empty":
      return <Minus className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
  }
}

const ROW_BG: Record<RowStatus, string> = {
  match: "",
  mismatch: "bg-yellow-50/5",
  amazon_only: "",
  both_empty: "",
};

// ─── Image cell ─────────────────────────────────────────────────────

function ImageCell({ src }: { src: string | null }) {
  if (!src) return <span className="text-muted-foreground text-xs">&mdash;</span>;
  return (
    <img
      src={src}
      alt=""
      className="h-20 w-20 object-contain rounded border border-border"
    />
  );
}

// ─── Comparison Row ─────────────────────────────────────────────────

function ComparisonRowComponent({ row }: { row: ComparisonRow }) {
  return (
    <div
      className={`grid grid-cols-[140px_1fr_1fr] gap-3 items-start px-3 py-2 rounded ${ROW_BG[row.status]}`}
    >
      <div className="flex items-center gap-1.5 pt-0.5">
        <StatusIcon status={row.status} />
        <span className="text-xs font-medium text-muted-foreground">
          {row.label}
        </span>
      </div>
      <div className="text-xs text-white break-words whitespace-pre-wrap min-w-0">
        {row.isImage ? (
          <ImageCell src={row.hubValue} />
        ) : (
          row.hubValue || <span className="text-muted-foreground/50">&mdash;</span>
        )}
      </div>
      <div className="text-xs text-white break-words whitespace-pre-wrap min-w-0">
        {row.isImage ? (
          <ImageCell src={row.liveValue} />
        ) : (
          row.liveValue || <span className="text-muted-foreground/50">&mdash;</span>
        )}
      </div>
    </div>
  );
}

// ─── Section group ──────────────────────────────────────────────────

function SectionGroup({
  title,
  rows,
}: {
  title: string;
  rows: ComparisonRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 hover:bg-muted/30 rounded transition-colors">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 mt-1">
          {rows.map((row) => (
            <ComparisonRowComponent key={row.label} row={row} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Summary badge ──────────────────────────────────────────────────

function SummaryBadge({ rows }: { rows: ComparisonRow[] }) {
  const matches = rows.filter((r) => r.status === "match").length;
  const mismatches = rows.filter((r) => r.status === "mismatch").length;
  const amazonOnly = rows.filter((r) => r.status === "amazon_only").length;

  return (
    <div className="flex items-center gap-3 text-xs">
      {matches > 0 && (
        <span className="flex items-center gap-1 text-green-500">
          <CheckCircle2 className="h-3 w-3" />
          {matches} matching
        </span>
      )}
      {mismatches > 0 && (
        <span className="flex items-center gap-1 text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          {mismatches} difference{mismatches !== 1 ? "s" : ""}
        </span>
      )}
      {amazonOnly > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <Info className="h-3 w-3" />
          {amazonOnly} missing
        </span>
      )}
    </div>
  );
}

// ─── Variant Switcher ───────────────────────────────────────────────

function VariantSwitcher({
  variants,
  currentAsin,
  onSelect,
}: {
  variants: RainforestProduct["variants"];
  currentAsin: string;
  onSelect: (asin: string) => void;
}) {
  if (!variants || variants.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border">
      <span className="text-xs text-muted-foreground mr-1">Variants:</span>
      {variants.map((v) => (
        <button
          key={v.asin}
          onClick={() => onSelect(v.asin)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            v.asin === currentAsin
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-muted-foreground hover:text-white hover:border-muted-foreground"
          }`}
        >
          {v.title || v.asin}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function AmazonLiveComparison({
  asin,
  catalogProduct,
}: AmazonLiveComparisonProps) {
  const [enabled, setEnabled] = useState(false);
  const [activeAsin, setActiveAsin] = useState(asin);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useAmazonLive(activeAsin, enabled);

  const rows = data ? buildRows(catalogProduct, data) : [];

  // Group rows by section
  const groupedRows = FIELD_GROUPS.reduce(
    (acc, group) => {
      acc[group] = rows.filter(
        (row) =>
          RAINFOREST_FIELD_MAP.find((m) => m.label === row.label)?.group ===
          group
      );
      return acc;
    },
    {} as Record<string, ComparisonRow[]>
  );

  function handleFetch() {
    setEnabled(true);
    if (dataUpdatedAt > 0) {
      refetch();
    }
  }

  function handleVariantSelect(variantAsin: string) {
    setActiveAsin(variantAsin);
    setEnabled(true);
  }

  if (isError && !isLoading) {
    toast.error(
      error instanceof Error ? error.message : "Failed to fetch live data"
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[140px_1fr_1fr] gap-3 px-3 py-2.5 border-b border-border bg-muted/30">
        <div />
        <div className="text-xs font-semibold text-brand uppercase tracking-wider">
          1o8 Hub
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "#FF9900" }}
          >
            Amazon Live
          </span>
          {data && (
            <a
              href={`https://www.amazon.com/dp/${activeAsin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Variant switcher */}
      {data?.variants && data.variants.length > 1 && (
        <VariantSwitcher
          variants={data.variants}
          currentAsin={activeAsin}
          onSelect={handleVariantSelect}
        />
      )}

      {/* Content */}
      <div className="p-3">
        {/* Not yet fetched */}
        {!enabled && !data && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">
              Compare Hub data against the live Amazon listing
            </p>
            <Button onClick={handleFetch} variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Fetch Live Data
            </Button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[140px_1fr_1fr] gap-3 px-3 py-2"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-red-400">
              {error instanceof Error
                ? error.message
                : "Failed to fetch live data"}
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="space-y-3">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <SummaryBadge rows={rows} />
              <div className="flex items-center gap-3">
                {dataUpdatedAt > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Last fetched: {relativeTime(dataUpdatedAt)}
                  </span>
                )}
                <Button
                  onClick={() => refetch()}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                >
                  <RefreshCw
                    className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Grouped rows */}
            {FIELD_GROUPS.map((group) => (
              <SectionGroup
                key={group}
                title={group}
                rows={groupedRows[group]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
