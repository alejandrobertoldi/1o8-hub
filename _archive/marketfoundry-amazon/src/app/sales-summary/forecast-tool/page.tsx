/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-flatmap-filter */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import React, { Suspense, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, TrendingUp, User, BarChart3, Lock } from "lucide-react";
import { VersionManager } from "@/components/ppc/forecast-tool/version-manager";
import { ForecastGrid } from "@/components/ppc/forecast-tool/forecast-grid";
import { generateMonthRange } from "@/components/ppc/forecast-tool/forecast-calculations";
import { SeasonalityStep } from "@/components/ppc/forecast-tool/seasonality-step";
import { BetaPill } from "@/components/ui/beta-pill";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

interface ClientInfo {
  clientIdCode: string;
  brandName: string | null;
  clientName: string;
  tier: string | null;
  marketplace: string | null;
  ppcManager: string | null;
  accountManager: string | null;
}

export default function ForecastToolPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>}>
      <ForecastToolContent />
    </Suspense>
  );
}

function ForecastToolContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [clientIdCode, setClientIdCode] = useState(searchParams.get("client") || "");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showSeasonality, setShowSeasonality] = useState(false);

  const [forecastStart, setForecastStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [forecastEnd, setForecastEnd] = useState("2026-12");
  const [historicStart, setHistoricStart] = useState("2025-01");
  const allMonths = useMemo(() => generateMonthRange(2025, 1, 2026), []);

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ["sales-summary-clients"],
    queryFn: async () => {
      const now = new Date();
      const end = now.toISOString().slice(0, 10);
      const start = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const res = await fetch(`/api/sales-summary?period=7D&start=${start}&end=${end}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["forecast-tool", clientIdCode, activeVersionId],
    queryFn: async () => {
      const url = new URL("/api/ppc/forecast-tool", window.location.origin);
      url.searchParams.set("clientIdCode", clientIdCode);
      if (activeVersionId) url.searchParams.set("versionId", activeVersionId);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch forecast tool data");
      return res.json();
    },
    enabled: !!clientIdCode,
  });

  React.useEffect(() => {
    if (data?.activeVersion && !activeVersionId) {
      setActiveVersionId(data.activeVersion.id);
      // Load saved periods from the version
      if (data.activeVersion.historicStart) setHistoricStart(data.activeVersion.historicStart);
      if (data.activeVersion.forecastStart) setForecastStart(data.activeVersion.forecastStart);
      if (data.activeVersion.forecastEnd) setForecastEnd(data.activeVersion.forecastEnd);
    }
  }, [data, activeVersionId]);

  // Fetch latest version per client for the landing page cards
  const { data: latestVersions } = useQuery<Record<string, { name: string; isLocked: boolean; createdAt: string }>>({
    queryKey: ["forecast-tool-latest-versions"],
    queryFn: async () => {
      const res = await fetch("/api/ppc/forecast-tool/versions");
      if (!res.ok) return {};
      const { versions } = await res.json();
      const map: Record<string, { name: string; isLocked: boolean; createdAt: string }> = {};
      for (const v of versions) map[v.clientIdCode] = v;
      return map;
    },
    enabled: !clientIdCode,
  });

  const clients: ClientInfo[] = clientsData?.clients || [];

  // Landing page — no client selected
  if (!clientIdCode) {
    return (
      <div className="space-y-6">
        <PageMetaSlot>
          <div className="flex items-center gap-4 min-w-0 w-full">
            <h1
              className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
              aria-label="Forecast Tool"
            >
              <span className="font-bold text-sidebar-foreground">Forecast</span>
              <span className="font-normal text-brand">Tool</span>
            </h1>
            <BetaPill />
          </div>
        </PageMetaSlot>
        <div>
          <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter">
            <span className="font-bold">Forecast</span>
            <span className="text-brand">Tool</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Amazon FBA Inventory Forecast</p>
        </div>

        {clientsLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clients.map((c) => (
              <button
                key={c.clientIdCode}
                onClick={() => { setClientIdCode(c.clientIdCode); setActiveVersionId(null); }}
                className="group text-left rounded-xl border border-border bg-card p-5 transition-all hover:border-brand/50 hover:shadow-[0_0_12px_var(--brand-glow)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold truncate">{c.brandName || c.clientName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.clientIdCode}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.tier && (
                      <span className="text-[10px] font-bold bg-foreground text-background px-1.5 py-0.5 rounded">
                        T{c.tier}
                      </span>
                    )}
                    {c.marketplace && (
                      <span className="text-[10px] font-medium text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                        {c.marketplace}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {c.accountManager && (
                    <span className="flex items-center gap-1 truncate">
                      <User className="size-3 shrink-0" />
                      {c.accountManager}
                    </span>
                  )}
                  {c.ppcManager && (
                    <span className="flex items-center gap-1 truncate">
                      <BarChart3 className="size-3 shrink-0" />
                      {c.ppcManager}
                    </span>
                  )}
                </div>

                {(() => {
                  const lv = latestVersions?.[c.clientIdCode];
                  if (!lv) return null;
                  return (
                    <div className="mt-3 flex items-center gap-2 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium">
                        v{lv.name}
                      </span>
                      {lv.isLocked && <Lock className="size-3 text-amber-500" />}
                      <span className="text-muted-foreground/60">
                        {new Date(lv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  );
                })()}

                <div className={`mt-2 flex items-center gap-1.5 text-xs text-brand opacity-0 group-hover:opacity-100 transition-opacity`}>
                  <TrendingUp className="size-3.5" />
                  Open Forecast
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Client selected — forecast view
  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-4 min-w-0 w-full">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Forecast Tool"
          >
            <span className="font-bold text-sidebar-foreground">Forecast</span>
            <span className="font-normal text-brand">Tool</span>
          </h1>
          <BetaPill />
        </div>
      </PageMetaSlot>
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-4 pb-2 bg-background space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setClientIdCode(""); setActiveVersionId(null); }}
              className="rounded-lg p-1.5 hover:bg-muted transition-colors"
              title="Back to clients"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div>
              <h1 className="text-4xl lg:text-5xl font-[family-name:var(--font-outfit)] tracking-tighter">
                <span className="font-bold">Forecast</span>
                <span className="text-brand">Tool</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {clients.find(c => c.clientIdCode === clientIdCode)?.brandName || clientIdCode}
                <span className="mx-1.5 text-zinc-500">·</span>
                <span className="font-mono text-xs text-muted-foreground/70">{clientIdCode}</span>
              </p>
            </div>
          </div>
          <select
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={clientIdCode}
            onChange={(e) => { setClientIdCode(e.target.value); setActiveVersionId(null); }}
          >
            {clients.map((c) => (
              <option key={c.clientIdCode} value={c.clientIdCode}>{c.brandName || c.clientIdCode}</option>
            ))}
          </select>
        </div>

        {data && (
          <VersionManager
            clientIdCode={clientIdCode}
            versions={data.versions || []}
            activeVersionId={activeVersionId}
            onVersionChange={(versionId, periods) => {
              const isNewVersion = !activeVersionId || activeVersionId !== versionId;
              setActiveVersionId(versionId);
              if (periods?.historicStart) setHistoricStart(periods.historicStart);
              if (periods?.forecastStart) setForecastStart(periods.forecastStart);
              if (periods?.forecastEnd) setForecastEnd(periods.forecastEnd);
              if (isNewVersion && !data.versions?.find((v: { id: string }) => v.id === versionId)) {
                setShowSeasonality(true);
              }
            }}
          />
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data?.activeVersion && showSeasonality && (
        <SeasonalityStep
          versionId={data.activeVersion.id}
          asins={(data.asins || []).map((a: { asin: string | null }) => a.asin).filter(Boolean)}
          brandName={clients.find(c => c.clientIdCode === clientIdCode)?.brandName || ""}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          existingData={data.activeVersion.seasonalityData || null}
          onComplete={() => {
            setShowSeasonality(false);
            queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
          }}
          onSkip={() => setShowSeasonality(false)}
        />
      )}

      {data?.activeVersion && !showSeasonality && (
        <ForecastGrid
          key={data.activeVersion.id}
          versionId={data.activeVersion.id}
          cells={data.cells}
          asins={data.asins}
          asinCells={data.asinCells || []}
          asinHistorical={data.asinHistorical || {}}
          historical={data.historical}
          allMonths={allMonths}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          historicStart={historicStart}
          isLocked={data.activeVersion.isLocked}
          onEditSeasonality={() => setShowSeasonality(true)}
          onForecastStartChange={setForecastStart}
          onForecastEndChange={setForecastEnd}
          onHistoricStartChange={setHistoricStart}
        />
      )}

      {!isLoading && !data?.activeVersion && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg font-medium">No forecast versions yet</p>
          <p className="text-sm mt-1">Create a new version to get started.</p>
        </div>
      )}
    </div>
  );
}
