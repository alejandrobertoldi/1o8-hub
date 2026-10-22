"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";
import { slideDef, resolveSlotImages, type CopyField, type ImageSlotDef } from "@/lib/case-study/kit/slides";
import { SCALAR_KEYS, effective, deriveMetrics, isMissing, type ScalarKey, type AnyMetricKey } from "@/lib/case-study/kit/metrics";
import { count, usdExact, pct, mult } from "@/lib/case-study/kit/display";

export function TextField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TextareaField({ id, label, value, onChange, rows = 4 }: { id: string; label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function formatMetricValue(key: AnyMetricKey, value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  if (key === "fulfilment") return String(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (key === "buyBoxPct" || key === "cvrPct" || key === "organicPct" || key === "adPct" || key === "acos" || key === "h2VsH1Pct" || key === "top3RevenueSharePct" || key === "spAcos" || key === "sbSdAcos") return pct(n);
  if (key === "roas" || key === "growthMultiple") return mult(n);
  if (key === "salesTotal" || key === "adSales" || key === "adSpend" || key === "organicSales" || key === "asp" || key === "startSales" || key === "peakSales" || key === "h1AvgSales" || key === "h2AvgSales") return usdExact(n);
  return count(n);
}

function labelForKey(key: AnyMetricKey): string {
  const LABELS: Partial<Record<AnyMetricKey, string>> = {
    salesTotal: "Ordered sales", unitsTotal: "Units", adSales: "Ad-attributed sales", adSpend: "Ad spend",
    adImpressions: "Ad impressions", adClicks: "Ad clicks", adOrders: "Ad orders", sessions: "Sessions",
    pageViews: "Page views", buyBoxPct: "Buy Box %", skuCount: "SKU count", fulfilment: "Fulfilment",
    organicSales: "Organic sales", organicPct: "Organic %", adPct: "Ad %", roas: "ROAS", acos: "ACOS",
    cvrPct: "Conversion rate", asp: "ASP", growthMultiple: "Growth multiple", startSales: "Starting sales",
    peakMonth: "Peak month", peakSales: "Peak sales", h1AvgSales: "H1 avg sales", h2AvgSales: "H2 avg sales",
    h2VsH1Pct: "H2 vs H1 %", top3RevenueSharePct: "Top-3 revenue share", spAcos: "SP ACOS", sbSdAcos: "SB/SD ACOS",
    salesMonthly: "Monthly sales (series)", topByRevenue: "Top products by revenue", topByUnits: "Top products by units",
    paidSp: "Paid — Sponsored Products", paidSbSd: "Paid — SB/SD", cumulative: "Cumulative sales (series)",
  };
  return LABELS[key] ?? String(key);
}

const SERIES_TABLE_KEYS: ReadonlySet<AnyMetricKey> = new Set<AnyMetricKey>([
  "salesMonthly", "topByRevenue", "topByUnits", "paidSp", "paidSbSd", "cumulative",
]);

function seriesCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && "monthly" in (value as Record<string, unknown>)) {
    const monthly = (value as { monthly?: unknown[] }).monthly;
    return Array.isArray(monthly) ? monthly.length : 0;
  }
  return 0;
}

function ImageSlotRow({
  cs, sectionId, content, slot, readOnly, onSaved,
}: {
  cs: KitCaseStudy; sectionId: string; content: KitCaseStudy["sections"][number]["content"]; slot: ImageSlotDef; readOnly: boolean; onSaved: () => void;
}) {
  const resolved = resolveSlotImages(content, slot.id);
  const [manualUrl, setManualUrl] = useState((content.manualImages?.[slot.id] ?? [])[0] ?? "");
  const [saving, setSaving] = useState(false);

  const patchManual = async (urls: string[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/case-studies/${cs.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualImages: { [slot.id]: urls } }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = resolved.source === "design" ? "From Design" : resolved.source === "manual" ? "Manual — not from Design" : "Missing";
  const hasManual = (content.manualImages?.[slot.id] ?? []).length > 0;
  const hasDesign = (content.designImages?.[slot.id] ?? []).length > 0;

  return (
    <div className="border rounded-md p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{slot.label}</span>
        <Badge variant={resolved.source === "empty" ? "destructive" : resolved.source === "manual" ? "secondary" : "outline"}>{sourceLabel}</Badge>
      </div>
      {resolved.urls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolved.urls[0]} alt={slot.label} className="h-20 w-full object-contain bg-muted rounded" />
      ) : (
        <div className="h-20 w-full bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">Missing</div>
      )}
      {!readOnly && (
        <>
          {hasManual && hasDesign && (
            <Button size="sm" variant="outline" disabled={saving} onClick={() => patchManual([])}>Use Design image</Button>
          )}
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">Image missing from Design? (emergency only)</summary>
            <div className="mt-2 space-y-2">
              <Label htmlFor={`manual-${slot.id}`} className="text-xs text-muted-foreground">Manual image URL</Label>
              <Input id={`manual-${slot.id}`} value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://…" />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => patchManual(manualUrl.trim() ? [manualUrl.trim()] : [])}>Save</Button>
                {hasManual && (
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => { setManualUrl(""); patchManual([]); }}>Remove manual image</Button>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function MetricRow({
  cs, metricKey, effectiveMetrics, derived, autoValue, overrideValue, readOnly, onSaved,
}: {
  cs: KitCaseStudy; metricKey: AnyMetricKey;
  effectiveMetrics: ReturnType<typeof effective>; derived: ReturnType<typeof deriveMetrics>;
  autoValue: unknown; overrideValue: unknown; readOnly: boolean; onSaved: () => void;
}) {
  const isScalar = (SCALAR_KEYS as readonly string[]).includes(metricKey as string);
  const [override, setOverride] = useState(overrideValue !== undefined && overrideValue !== null ? String(overrideValue) : "");
  const [saving, setSaving] = useState(false);

  if (!isScalar) {
    if (SERIES_TABLE_KEYS.has(metricKey)) {
      const n = seriesCount((effectiveMetrics as Record<string, unknown>)[metricKey as string]);
      return (
        <div className="flex items-center justify-between text-sm border-b py-1.5">
          <span>{labelForKey(metricKey)}</span>
          <span className="text-xs text-muted-foreground">From Redshift — not editable ({n})</span>
        </div>
      );
    }
    // derived metric
    const dVal = (derived as unknown as Record<string, unknown>)[metricKey as string];
    return (
      <div className="flex items-center justify-between text-sm border-b py-1.5">
        <span>{labelForKey(metricKey)}</span>
        <span className="text-xs text-muted-foreground">{formatMetricValue(metricKey, dVal as number | string | null)} — calculated from Redshift data</span>
      </div>
    );
  }

  const key = metricKey as ScalarKey;
  const missing = isMissing(effectiveMetrics, derived, key);
  const origin = overrideValue !== undefined && overrideValue !== null && overrideValue !== "" ? "Manual override" : missing ? "Missing" : "Redshift";

  const save = async () => {
    setSaving(true);
    try {
      const value = key === "fulfilment" ? override : (override.trim() === "" ? null : Number(override));
      const res = await fetch(`/api/case-studies/${cs.id}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/case-studies/${cs.id}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: null }),
      });
      if (res.ok) { setOverride(""); onSaved(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1 border-b py-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{labelForKey(key)}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs">{formatMetricValue(key, autoValue as number | string | null)}</span>
          <Badge variant={origin === "Missing" ? "destructive" : origin === "Manual override" ? "secondary" : "outline"}>{origin}</Badge>
        </span>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`override-${key}`} className="sr-only">Override {key}</Label>
          <Input
            id={`override-${key}`}
            aria-label={`Override ${key}`}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="h-8"
          />
          <Button size="sm" aria-label={`Save ${key}`} disabled={saving} onClick={save}>Save</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={clear}>Clear</Button>
        </div>
      )}
    </div>
  );
}

export function SlideEditor(props: {
  cs: KitCaseStudy; sectionId: string; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; readOnly: boolean;
}) {
  const { cs, sectionId, open, onOpenChange, onSaved, readOnly } = props;
  const section = cs.sections.find((s) => s.id === sectionId);
  const def = section ? slideDef(section.sectionType) : null;

  const [copy, setCopy] = useState<Record<string, string>>(section?.content.copy ?? {});
  const [savingCopy, setSavingCopy] = useState(false);

  const effectiveMetrics = useMemo(() => effective(cs.metrics), [cs.metrics]);
  const derived = useMemo(() => deriveMetrics(effectiveMetrics), [effectiveMetrics]);

  if (!section || !def) return null;

  const isDetailed = cs.format === "detailed";
  const tokenHelp = `Tokens: {client}, {period}${isDetailed ? ", {total}" : ""}`;

  const saveCopy = async () => {
    setSavingCopy(true);
    try {
      const res = await fetch(`/api/case-studies/${cs.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copy }),
      });
      if (res.ok) onSaved();
    } finally {
      setSavingCopy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{def.label}</SheetTitle>
          <SheetDescription>{tokenHelp}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4 space-y-6">
          {def.copy.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Copy</h3>
              {def.copy.map((field: CopyField) => (
                field.kind === "textarea" ? (
                  <TextareaField
                    key={field.key}
                    id={`copy-${field.key}`}
                    label={field.label}
                    value={copy[field.key] ?? ""}
                    onChange={(v) => setCopy((c) => ({ ...c, [field.key]: v }))}
                  />
                ) : (
                  <TextField
                    key={field.key}
                    id={`copy-${field.key}`}
                    label={field.label}
                    value={copy[field.key] ?? ""}
                    onChange={(v) => setCopy((c) => ({ ...c, [field.key]: v }))}
                  />
                )
              ))}
              {!readOnly && (
                <Button size="sm" onClick={saveCopy} disabled={savingCopy}>Save copy</Button>
              )}
            </section>
          )}

          {def.metrics.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Numbers on this slide</h3>
              {def.metrics.map((key) => (
                <MetricRow
                  key={key}
                  cs={cs}
                  metricKey={key}
                  effectiveMetrics={effectiveMetrics}
                  derived={derived}
                  autoValue={(cs.metrics.auto as Record<string, unknown>)[key]}
                  overrideValue={(cs.metrics.overrides as Record<string, unknown>)[key]}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              ))}
            </section>
          )}

          {def.images.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Images</h3>
              {def.images.map((slot) => (
                <ImageSlotRow
                  key={slot.id}
                  cs={cs}
                  sectionId={sectionId}
                  content={section.content}
                  slot={slot}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              ))}
            </section>
          )}
        </div>
        <SheetFooter />
      </SheetContent>
    </Sheet>
  );
}
