"use client";
import { useMemo, type ReactNode } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { KeywordsResponse } from "./primitives/keywords";
import type { CampaignsResponse } from "./primitives/campaigns";
import { Surface } from "./primitives/surface";
import { HeatCell } from "./primitives/heat-cell";
import {
  keywordToMetricRow, campaignToMetricRow, roasBandOf, acosBandOf,
  type MetricRow,
} from "./primitives/table-derivations";
import {
  rankPerformers, rankRisks, recommendedActions, TOP_N,
  type RiskRow, type Action,
} from "./primitives/decision-support";
import { fmtPct, fmtRoas, fmtCurrencyCompact } from "./primitives/kpi-derivations";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-mf-line bg-white p-[18px] shadow-[0_10px_30px_rgba(16,34,39,0.12)]">
      <h3 className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-mf-muted">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="py-4 text-sm text-mf-muted">{label}</div>;
}

function PerformersCard({ available, rows }: { available: boolean; rows: MetricRow[] }) {
  if (!available) return <Card title="Top performers"><Empty label="Keyword data unavailable for this period." /></Card>;
  const top = rankPerformers(rows).slice(0, TOP_N);
  return (
    <Card title="Top performers">
      {top.length === 0 ? (
        <Empty label="No scale candidates — no keywords at ROAS ≥ 4." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {top.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <span className="truncate font-semibold text-mf-ink" title={r.name}>{r.name}</span>
              <span className="flex items-center gap-2 text-xs text-mf-muted">
                <HeatCell band={roasBandOf(r.roas)}>{fmtRoas(r.roas)}</HeatCell>
                <span>CVR {fmtPct(r.cvr)}</span>
                <span className="text-mf-positive">candidate for scale</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RisksCard({ available, rows }: { available: boolean; rows: RiskRow[] }) {
  if (!available) return <Card title="Efficiency risks"><Empty label="Keyword data unavailable for this period." /></Card>;
  const top = rows.slice(0, TOP_N);
  return (
    <Card title="Efficiency risks">
      {top.length === 0 ? (
        <Empty label="No efficiency risks this period." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {top.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <span className="truncate font-semibold text-mf-ink" title={r.name}>{r.name}</span>
              <span className="flex items-center gap-2 text-xs text-mf-muted">
                {r.reasons.highAcos ? (
                  <HeatCell band={acosBandOf(r.acos)}>{fmtPct(r.acos)} ACoS</HeatCell>
                ) : (
                  <span className="text-mf-negative">{fmtCurrencyCompact(r.adSpend)} spend · 0 orders</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActionsCard({ actions }: { actions: Action[] }) {
  return (
    <Card title="Recommended actions">
      {actions.length === 0 ? (
        <Empty label="Spend is efficient and within targets — no actions this period." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {actions.map((a) => (
            <li key={a.kind} className="flex gap-2 text-sm text-mf-ink">
              <span aria-hidden className="text-mf-muted">•</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DecisionSupportSection({ surface, keywords, campaigns, loading, requestKey }: {
  surface: SurfaceKind;
  keywords: KeywordsResponse | null;
  campaigns: CampaignsResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  getSurfacePalette(surface); // surface reserved for future accenting; keeps prop contract aligned with siblings
  const kwAvailable = !!(keywords && Array.isArray(keywords.keywords));
  const campAvailable = !!(campaigns && Array.isArray(campaigns.rowsByName));

  const kwRows = useMemo<MetricRow[]>(
    () => (kwAvailable ? keywords!.keywords.map(keywordToMetricRow) : []),
    [kwAvailable, keywords],
  );
  const campRows = useMemo<MetricRow[]>(
    () => (campAvailable ? campaigns!.rowsByName.map(campaignToMetricRow) : []),
    [campAvailable, campaigns],
  );
  const risks = useMemo(() => rankRisks(kwRows), [kwRows]);
  const actions = useMemo(() => recommendedActions(kwRows, campRows), [kwRows, campRows]);

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load decision support.</div></Surface>;
  }
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />)}
      </div>
    );
  }
  if (!kwAvailable && !campAvailable) {
    return <Surface title="Decision support"><div className="p-[18px] text-mf-muted">Data unavailable for this period.</div></Surface>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <PerformersCard available={kwAvailable} rows={kwRows} />
      <RisksCard available={kwAvailable} rows={risks} />
      <ActionsCard actions={actions} />
    </div>
  );
}
