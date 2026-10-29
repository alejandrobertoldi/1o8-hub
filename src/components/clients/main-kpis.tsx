"use client";

import { useState } from "react";
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
  rawData,
  readOnly,
  onSave,
}: {
  rawData: Record<string, string>;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
}) {
  const kpis = parseClientKpis(rawData[MAIN_KPIS_FIELD]);
  const legacy = String(rawData[MAIN_KPI_SHEET_FIELD] ?? "").trim();
  const suggested = kpis.length ? [] : suggestKpisFromText(legacy);
  const [busy, setBusy] = useState(false);

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
