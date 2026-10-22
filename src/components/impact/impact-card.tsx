/* eslint-disable react-doctor/js-hoist-intl */
/* eslint-disable react-doctor/no-layout-transition-inline */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, Clock, ChevronRight } from "lucide-react";

interface ImpactSnapshot {
  id: number;
  clientIdCode: string;
  productId: string | null;
  asin: string | null;
  changeType: string;
  changeSummary: string;
  changeCount: number;
  changedBy: string;
  changedAt: string;
  status: "pending_before" | "pending_after" | "complete";
  impactWindowDays: number;
  deltas: Record<string, { before: number; after: number; change: number; changePct: number | null }> | null;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number | null): string {
  if (n == null) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function TrendIcon({ value }: { value: number | null }) {
  if (value == null || Math.abs(value) < 0.5) return <Minus className="size-4 text-muted-foreground" />;
  if (value > 0) return <TrendingUp className="size-4 text-green-600" />;
  return <TrendingDown className="size-4 text-red-600" />;
}

function DeltaRow({ label, delta }: { label: string; delta: { before: number; after: number; change: number; changePct: number | null } }) {
  const isCurrency = ["product_sales", "ad_spend", "ad_revenue", "ordered_revenue"].includes(label);
  const fmt = isCurrency ? formatCurrency : (n: number) => n.toLocaleString();

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground capitalize">{label.replace(/_/g, " ")}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums">{fmt(delta.before)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-sm font-medium tabular-nums">{fmt(delta.after)}</span>
        <span className={`text-sm font-medium tabular-nums ${
          delta.changePct != null && delta.changePct > 0 ? "text-green-600" :
          delta.changePct != null && delta.changePct < 0 ? "text-red-600" : ""
        }`}>
          {formatPct(delta.changePct)}
        </span>
        <TrendIcon value={delta.changePct} />
      </div>
    </div>
  );
}

function SnapshotCard({ snapshot }: { snapshot: ImpactSnapshot }) {
  const isPending = snapshot.status !== "complete";
  const daysAgo = Math.floor((Date.now() - new Date(snapshot.changedAt).getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = isPending ? Math.max(0, snapshot.impactWindowDays - daysAgo) : 0;

  // Key metrics to display
  const keyMetrics = ["product_sales", "ordered_revenue", "ad_spend", "ad_revenue", "glance_view_byasin", "ordered_units"];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <span className="text-sm font-medium">{snapshot.changeSummary}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{snapshot.changedBy}</span>
            <span>·</span>
            <span>{new Date(snapshot.changedAt).toLocaleDateString("en-US")}</span>
            {snapshot.changeCount > 1 && (
              <>
                <span>·</span>
                <span>{snapshot.changeCount} changes</span>
              </>
            )}
          </div>
        </div>
        {isPending ? (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="size-3" />
            {daysRemaining > 0 ? `${daysRemaining}d remaining` : "Measuring…"}
          </div>
        ) : (
          <div className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Complete
          </div>
        )}
      </div>

      {snapshot.deltas ? (
        <div className="divide-y">
          {keyMetrics.map((key) =>
            snapshot.deltas![key] ? (
              <DeltaRow key={key} label={key} delta={snapshot.deltas![key]} />
            ) : null
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Impact data will be available after the {snapshot.impactWindowDays}-day measurement window.
        </p>
      )}
    </div>
  );
}

export function ImpactCard({ clientIdCode, productId, limit = 5 }: {
  clientIdCode?: string;
  productId?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (clientIdCode) params.set("client", clientIdCode);
  if (productId) params.set("productId", productId);
  params.set("limit", String(limit));

  const { data, isLoading } = useQuery<{ snapshots: ImpactSnapshot[] }>({
    queryKey: ["impact", clientIdCode, productId, limit],
    queryFn: () => fetch(`/api/impact?${params}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4" /> Content Impact
        </h3>
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!data?.snapshots?.length) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm font-semibold flex items-center gap-2 w-full text-left hover:text-foreground/80 transition-colors"
      >
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <Activity className="size-4" /> Content Impact Attribution
        <span className="text-[10px] font-normal text-muted-foreground ml-1">({data.snapshots.length})</span>
      </button>
      {open && data.snapshots.map((s) => (
        <SnapshotCard key={s.id} snapshot={s} />
      ))}
    </div>
  );
}
