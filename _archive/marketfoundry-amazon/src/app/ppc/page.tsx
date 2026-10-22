/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  DollarSign,
  BarChart3,
  Target,
  Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

interface ClientSummary {
  clientIdCode: string;
  clientName: string;
  latestSnapshot: {
    snapshotDate: string;
    summary: {
      totalSpend: number;
      totalRevenue: number;
      acos: number;
      roas: number;
      totalImpressions: number;
      totalClicks: number;
      totalOrders: number;
      campaignCount: number;
    };
    deltas: Record<string, { absolute: number; pct: number }> | null;
  } | null;
}

async function fetchPpcOverview(): Promise<ClientSummary[]> {
  const res = await fetch("/api/ppc/overview");
  if (!res.ok) throw new Error("Failed to load PPC overview");
  const data = await res.json();
  return data.clients;
}

function DeltaBadge({ value, suffix = "%" }: { value: number | null | undefined; suffix?: string }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? "text-emerald-600" : isNegative ? "text-red-500" : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

export default function PpcDashboardPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["ppc-overview"],
    queryFn: fetchPpcOverview,
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.clientIdCode.toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <div className="px-6 lg:px-10 space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="PPC Manager"
        >
          <span className="font-bold text-sidebar-foreground">PPC</span>
          <span className="font-normal text-brand">Manager</span>
        </h1>
      </PageMetaSlot>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-6 pb-4 bg-background flex items-center justify-end">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingPlaceholder />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client) => {
            const snap = client.latestSnapshot;
            const summary = snap?.summary;
            const deltas = snap?.deltas;

            return (
              <button
                key={client.clientIdCode}
                onClick={() => router.push(`/ppc/${client.clientIdCode}`)}
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-brand/50 hover:bg-accent/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">{client.clientName}</p>
                    <p className="text-xs text-muted-foreground">{client.clientIdCode}</p>
                  </div>
                  {snap && (
                    <span className="text-xs text-muted-foreground">
                      {snap.snapshotDate}
                    </span>
                  )}
                </div>

                {summary ? (
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCell
                      icon={DollarSign}
                      label="Ad Spend"
                      value={`$${summary.totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      prevValue={deltas?.spend?.absolute != null ? `$${(summary.totalSpend - deltas.spend.absolute).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined}
                      delta={deltas?.spend?.pct}
                    />
                    <MetricCell
                      icon={BarChart3}
                      label="Ad Revenue"
                      value={`$${summary.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      prevValue={deltas?.revenue?.absolute != null ? `$${(summary.totalRevenue - deltas.revenue.absolute).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined}
                      delta={deltas?.revenue?.pct}
                    />
                    <MetricCell
                      icon={Target}
                      label="ACOS"
                      value={`${(summary.acos ?? 0).toFixed(2)}%`}
                      prevValue={deltas?.acos?.absolute != null ? `${((summary.acos ?? 0) - deltas.acos.absolute).toFixed(2)}%` : undefined}
                      delta={deltas?.acos?.pct}
                      invertColor
                    />
                    <MetricCell
                      icon={Activity}
                      label="ROAS"
                      value={(summary.roas ?? 0).toFixed(2)}
                      prevValue={deltas?.roas?.absolute != null ? `${((summary.roas ?? 0) - deltas.roas.absolute).toFixed(2)}` : undefined}
                      delta={deltas?.roas?.pct}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No snapshot data yet
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCell({
  icon: Icon,
  label,
  value,
  prevValue,
  delta,
  invertColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  prevValue?: string;
  delta?: number | null;
  invertColor?: boolean;
}) {
  const adjustedDelta = invertColor && delta != null ? -delta : delta;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-brand font-semibold">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        <DeltaBadge value={invertColor ? adjustedDelta : delta} />
      </div>
      {prevValue && (
        <p className="text-xs text-muted-foreground tabular-nums">PW: {prevValue}</p>
      )}
    </div>
  );
}
