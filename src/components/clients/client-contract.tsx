"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Figma, LayoutGrid, NotebookPen, Presentation } from "lucide-react";
import { AAC_SERVICES, SOW_TONE_CLASSES, clientServices, sowStatus, type SowStatus } from "@/lib/clients/sow";
import { cn } from "@/lib/utils";
import { EditableCell } from "./editable-cell";
import { MainKpis } from "./main-kpis";

type Props = {
  rawData: Record<string, string>;
  readOnly: boolean;
  onSave: (field: string, value: string) => Promise<void>;
};

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Small pill with the computed SOW state (header, cards). */
export function SowBadge({ status, className }: { status: SowStatus; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold", SOW_TONE_CLASSES[status.tone], className)}
      title={status.sheetMismatch ? `The AAC sheet says "${status.sheetMismatch}"` : undefined}
    >
      {(status.state === "expired" || status.state === "expiring" || status.sheetMismatch) && <AlertTriangle className="size-3" />}
      SOW · {status.label}
    </span>
  );
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const CONTRACT_FIELDS = [
  { key: "Tier", label: "Tier" },
  { key: "RetainerType", label: "Retainer type" },
  { key: "SOW", label: "SOW" },
  { key: "Term", label: "Term", long: true },
  { key: "Last Day of Term", label: "Last day of term" },
  { key: "SOW Status", label: "SOW status (sheet)" },
  { key: "Estimated Hours TOTAL", label: "Estimated hours / month" },
  { key: "Estimated $ BY HOUR", label: "Estimated $ / hour" },
] as const;

/** Wrapped text that edits in a textarea (saves on blur) — for long sheet cells like Term or Services. */
function LongTextField({ field, value, readOnly, onSave }: { field: string; value: string; readOnly: boolean; onSave: Props["onSave"] }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly || draft === null) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setDraft(value)}
        className={cn("w-full whitespace-pre-line text-left font-medium", !readOnly && "rounded hover:bg-muted/50", !value && "text-muted-foreground")}
      >
        {value || (readOnly ? "—" : "Add…")}
      </button>
    );
  }
  return (
    <textarea
      autoFocus
      rows={3}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        if (draft.trim() !== value) await onSave(field, draft.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
      className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
    />
  );
}

/**
 * Contract & services (AAC sheet): retainer, SOW, term with an expiry warning,
 * and the services the client pays for.
 */
export function ContractSection({ rawData, readOnly, onSave }: Props) {
  const status = sowStatus(rawData, localToday());
  const services = clientServices(rawData);
  const [editServices, setEditServices] = useState(false);
  const v = (k: string) => String(rawData[k] ?? "").trim();

  return (
    <div className="rounded-xl border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-5 py-3">
        <h3 className="text-sm font-semibold">Contract &amp; services</h3>
        <SowBadge status={status} />
      </div>

      {(status.state === "expired" || status.state === "expiring" || status.sheetMismatch) && (
        <div className={cn("mx-5 mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", SOW_TONE_CLASSES[status.state === "expiring" ? "orange" : "red"])}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {status.state === "expired" && <p>The SOW ended{status.endDate ? ` on ${fmtDate(status.endDate)}` : ""}. Renew it or update the term.</p>}
            {status.state === "expiring" && <p>The SOW ends on {fmtDate(status.endDate)} ({status.label.toLowerCase()}). Time to talk renewal.</p>}
            {status.sheetMismatch && (
              <p className="text-xs opacity-90">
                The AAC sheet still says &ldquo;{status.sheetMismatch}&rdquo; — update the SOW status below.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="border-b border-border/30 px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Main KPIs</span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Shopify store</span>
            <div className="w-56">
              <EditableCell field="ShopifyStore" value={v("ShopifyStore")} readOnly={readOnly} onSave={onSave} type="text" />
            </div>
          </div>
        </div>
        <MainKpis rawData={rawData} readOnly={readOnly} onSave={onSave} />
      </div>

      <div className="grid gap-x-8 px-5 py-4 lg:grid-cols-2">
        <div>
          {CONTRACT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[170px_1fr] gap-2 border-b border-border/30 py-1.5 text-sm last:border-0">
              <span className="truncate text-muted-foreground">{f.label}</span>
              {"long" in f ? (
                <LongTextField field={f.key} value={v(f.key)} readOnly={readOnly} onSave={onSave} />
              ) : (
                <EditableCell field={f.key} value={v(f.key)} readOnly={readOnly} onSave={onSave} type="text" />
              )}
            </div>
          ))}
        </div>
        <div className="space-y-3 pt-3 lg:pt-0">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Services</span>
              {!readOnly && (
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => setEditServices((e) => !e)}>
                  {editServices ? "Done" : "Edit"}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(editServices ? [...AAC_SERVICES] : services).map((s) => {
                const on = services.includes(s);
                return editServices ? (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSave(`Service: ${s}`, on ? "" : s)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-brand bg-brand/15 text-brand" : "text-muted-foreground hover:border-brand")}
                  >
                    {s}
                  </button>
                ) : (
                  <span key={s} className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs text-brand">
                    {s}
                  </span>
                );
              })}
              {!editServices && !services.length && <span className="text-xs text-muted-foreground">No services checked.</span>}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Scope (from the SOW)</span>
            <div className="mt-1 text-sm">
              <LongTextField field="Services" value={v("Services")} readOnly={readOnly} onSave={onSave} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LINKS = [
  { key: "FigmaInternalURL", label: "Figma (internal)", icon: Figma, hint: "1o8 working file" },
  { key: "FigmaExternalURL", label: "Figma (external)", icon: Figma, hint: "shared with the client" },
  { key: "AirBoardURL", label: "Air board", icon: LayoutGrid, hint: "assets / approvals" },
  { key: "RunningAgendaURL", label: "Running agenda", icon: NotebookPen, hint: "" },
  { key: "DashboardURL", label: "Client dashboard", icon: Presentation, hint: "Databox (or other) KPI dashboard" },
] as const;

/** Design files and working links for the account. */
export function LinksSection({ rawData, readOnly, onSave }: Props) {
  const visible = readOnly ? LINKS.filter((l) => String(rawData[l.key] ?? "").trim()) : LINKS;
  if (!visible.length) return null;
  return (
    <div className="rounded-xl border bg-card text-card-foreground">
      <div className="border-b border-border/50 px-5 py-3">
        <h3 className="text-sm font-semibold">Design files &amp; links</h3>
      </div>
      <div className="px-5 py-4">
        {visible.map((l) => {
          const url = String(rawData[l.key] ?? "").trim();
          return (
            <div key={l.key} className="grid grid-cols-[190px_1fr_auto] items-center gap-2 border-b border-border/30 py-1.5 text-sm last:border-0">
              <span className="flex items-center gap-1.5 truncate text-muted-foreground" title={l.hint || undefined}>
                <l.icon className="size-3.5 shrink-0" />
                {l.label}
              </span>
              <EditableCell field={l.key} value={url} readOnly={readOnly} onSave={onSave} type="url" />
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${l.label}`} className="text-muted-foreground hover:text-brand">
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
