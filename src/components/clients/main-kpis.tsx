"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Sparkles, X } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  KPI_CATALOG,
  KPI_SOURCE_LABELS,
  MAIN_KPI_SHEET_FIELD,
  MAIN_KPIS_FIELD,
  kpiDef,
  kpiLabel,
  kpisSheetText,
  parseClientKpis,
  serializeClientKpis,
  suggestKpisFromText,
  type ClientKpi,
  type KpiSource,
} from "@/lib/clients/kpis";
import { cn } from "@/lib/utils";
import { EditableCell } from "./editable-cell";
import { formatKpi } from "@/lib/kpi/values";
import type { ClientKpiReadings, KpiReading } from "@/lib/kpi/sync";

const GA4_PROPERTY_FIELD = "GA4Property";

/** Where this client's KPI numbers come from: Shopify store and GA4 property (Meta, Klaviyo next). */
export function KpiDataSources({
  rawData,
  readOnly,
  onSave,
}: {
  rawData: Record<string, string>;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
}) {
  const ga4 = String(rawData[GA4_PROPERTY_FIELD] ?? "").trim();
  const { data: properties, isLoading, error } = useQuery<{ id: string; name: string; account: string }[]>({
    queryKey: ["kpi", "ga4-properties"],
    queryFn: async () => {
      const res = await fetch("/api/kpi/properties");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not list GA4 properties");
      return json;
    },
    enabled: !readOnly,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const current = properties?.find((p) => p.id === ga4);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">GA4</span>
        {readOnly || error || isLoading ? (
          <span title={error ? (error as Error).message : undefined} className={cn(!ga4 && "text-muted-foreground")}>
            {ga4 ? current?.name ?? `Property ${ga4}` : error ? "Connect GA4 in Sync & Export → KPIs" : "—"}
          </span>
        ) : (
          <Select value={ga4 || "__none__"} onValueChange={(v) => onSave(GA4_PROPERTY_FIELD, v === "__none__" ? "" : v)}>
            <SelectTrigger size="sm" className="h-7 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not connected</SelectItem>
              {properties?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  <span className="ml-1 text-muted-foreground">· {p.account}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Shopify</span>
        <span className="w-44">
          <EditableCell field="ShopifyStore" value={String(rawData.ShopifyStore ?? "")} readOnly={readOnly} onSave={onSave} type="text" />
        </span>
      </span>
    </div>
  );
}

const STATUS_TONE = { on_track: "text-emerald-500", behind: "text-red-500" } as const;

/** This month (through yesterday) and last month for one KPI. */
function KpiNumbers({ reading }: { reading: KpiReading | undefined }) {
  if (!reading) return null;
  if (!reading.mtd && !reading.lastMonth) return <span className="text-[11px] text-muted-foreground">No data yet</span>;
  const basis = reading.mtd?.basis ?? reading.lastMonth?.basis;
  return (
    <span className="flex items-baseline gap-2 text-xs tabular-nums" title={basis ? `From ${basis}` : undefined}>
      <span className={cn("font-semibold", reading.status ? STATUS_TONE[reading.status] : "text-foreground")}>
        {reading.mtd ? formatKpi(reading.mtd) : "—"}
        <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">MTD</span>
      </span>
      {reading.lastMonth && <span className="text-muted-foreground">last mo. {formatKpi(reading.lastMonth)}</span>}
      {basis && !basis.startsWith("Shopify") && basis.includes("until") && <span className="text-[10px] text-orange-400">GA4</span>}
    </span>
  );
}

const SOURCES = Object.keys(KPI_SOURCE_LABELS) as KpiSource[];
const SOURCE_TONE: Record<KpiSource, string> = {
  shopify: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  shopify_ads: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  ads: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  ga4: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  retail: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  email: "border-pink-500/30 bg-pink-500/10 text-pink-400",
  social: "border-pink-500/30 bg-pink-500/10 text-pink-400",
  other: "border-border text-muted-foreground",
};

/** The KPI menu, grouped by where the number comes from (Shopify first). */
export function KpiSelect({ exclude, onPick, placeholder = "Add a KPI…" }: { exclude: string[]; onPick: (key: string) => void; placeholder?: string }) {
  return (
    <Select value="" onValueChange={(v) => v && onPick(v)}>
      <SelectTrigger size="sm" className="h-8 w-56">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {SOURCES.map((s) => {
          const items = KPI_CATALOG.filter((k) => k.source === s && (k.key === "custom" || !exclude.includes(k.key)));
          if (!items.length) return null;
          return (
            <SelectGroup key={s}>
              <SelectLabel>{KPI_SOURCE_LABELS[s]}</SelectLabel>
              {items.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** Text that saves on blur (target, note, custom label). */
function InlineInput({ value, placeholder, readOnly, onSave, className }: { value: string; placeholder: string; readOnly: boolean; onSave: (v: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  if (readOnly) return value ? <span className={cn("text-xs", className)}>{value}</span> : null;
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn("h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-brand", className)}
    />
  );
}

/**
 * Main KPIs (client profile → Contract & services): an ordered list picked
 * from the catalog, each with an optional target and note. Saving writes the
 * hub's list and the readable text the AAC sheet shows.
 */
export function MainKpis({
  clientIdCode,
  rawData,
  readOnly,
  onSave,
}: {
  clientIdCode: string;
  rawData: Record<string, string>;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
}) {
  const kpis = parseClientKpis(rawData[MAIN_KPIS_FIELD]);
  const legacy = String(rawData[MAIN_KPI_SHEET_FIELD] ?? "").trim();
  const suggested = kpis.length ? [] : suggestKpisFromText(legacy);
  const [busy, setBusy] = useState(false);
  const { data: readings } = useQuery<ClientKpiReadings[]>({
    queryKey: ["kpi-readings", clientIdCode],
    queryFn: async () => {
      const res = await fetch(`/api/kpi/readings?client=${encodeURIComponent(clientIdCode)}`);
      return res.ok ? res.json() : [];
    },
    enabled: kpis.length > 0,
  });
  const readingFor = (i: number) => readings?.[0]?.kpis[i];

  const save = async (next: ClientKpi[]) => {
    setBusy(true);
    try {
      await onSave(MAIN_KPIS_FIELD, serializeClientKpis(next));
      await onSave(MAIN_KPI_SHEET_FIELD, kpisSheetText(next));
    } finally {
      setBusy(false);
    }
  };
  const update = (i: number, patch: Partial<ClientKpi>) => save(kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...kpis];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };

  return (
    <div className="space-y-2">
      {!kpis.length && legacy && legacy !== "-" && legacy !== "." && (
        <div className="rounded-md border border-dashed border-border/60 p-2 text-xs">
          <p className="whitespace-pre-line text-muted-foreground">{legacy}</p>
          {!readOnly && suggested.length > 0 && (
            <Button size="xs" variant="outline" className="mt-2" disabled={busy} onClick={() => save(suggested)}>
              <Sparkles className="size-3" /> Use {suggested.map((k) => kpiLabel(k)).join(", ")}
            </Button>
          )}
        </div>
      )}

      {kpis.length > 0 && (
        <ol className="space-y-1.5">
          {kpis.map((k, i) => {
            const def = kpiDef(k.key);
            const source = def?.source ?? "other";
            return (
              <li key={`${k.key}-${i}`} className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                {k.key === "custom" ? (
                  <InlineInput value={k.label ?? ""} placeholder="KPI name" readOnly={readOnly} onSave={(v) => update(i, { label: v })} className="w-40 font-medium" />
                ) : (
                  <span className="font-medium" title={def?.hint}>
                    {kpiLabel(k)}
                  </span>
                )}
                <span className={cn("rounded-full border px-1.5 py-px text-[10px]", SOURCE_TONE[source])}>{KPI_SOURCE_LABELS[source]}</span>
                <KpiNumbers reading={readingFor(i)} />
                <InlineInput value={k.target ?? ""} placeholder="Target" readOnly={readOnly} onSave={(v) => update(i, { target: v || undefined })} className="w-28" />
                <InlineInput value={k.note ?? ""} placeholder="Note" readOnly={readOnly} onSave={(v) => update(i, { note: v || undefined })} className="w-32 text-muted-foreground" />
                {!readOnly && (
                  <span className="ml-auto flex items-center">
                    <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === kpis.length - 1}
                      onClick={() => move(i, 1)}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                    <button type="button" disabled={busy} onClick={() => save(kpis.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-red-500" aria-label="Remove">
                      <X className="size-3" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly && <KpiSelect exclude={kpis.map((k) => k.key)} onPick={(key) => save([...kpis, { key }])} />}
      {readOnly && !kpis.length && !legacy && <span className="text-sm text-muted-foreground">—</span>}
    </div>
  );
}
