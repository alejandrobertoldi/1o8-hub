"use client";

// TEMPORARY (2026-11): bulk table to connect what's missing across clients.
// Owner-only, for Alejandro (see src/lib/onboarding/connections-tool.ts).
// Delete this page, its API route and connections-tool.ts once connections are caught up.

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditableCell } from "@/components/clients/editable-cell";
import { Ga4PropertyPicker, GoogleAdsAccount, KlaviyoKey, MetaAdAccountPicker, ShopifyStore } from "@/components/clients/main-kpis";
import { AAC_SERVICES } from "@/lib/clients/sow";
import { checkField } from "@/lib/onboarding/checklist";
import { canUseConnectionsTool } from "@/lib/onboarding/connections-tool";
import { cn } from "@/lib/utils";

type Row = {
  code: string;
  name: string;
  services: string[];
  fields: Record<"GA4Property" | "MetaAdAccount" | "GoogleAdsCustomerId" | "ShopifyStore" | "SOWURL", string>;
  klaviyo: boolean;
  items: Record<string, "done" | "missing" | "na">;
  done: number;
  total: number;
};

const ACCESSES = [
  { key: "access_ga4", label: "GA4" },
  { key: "access_shopify", label: "Shopify" },
  { key: "access_klaviyo", label: "Klaviyo" },
  { key: "access_meta", label: "Meta BM" },
  { key: "access_google_ads", label: "Google Ads" },
] as const;

const QUERY_KEY = ["connections-tool"] as const;

export default function ConnectionsToolPage() {
  const { data: session, status } = useSession();
  const allowed = canUseConnectionsTool(session?.user);
  const qc = useQueryClient();
  const [onlyGaps, setOnlyGaps] = useState(true);

  const { data: rows, isLoading, isError, refetch } = useQuery<Row[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/onboarding/connections");
      if (!res.ok) throw new Error("Could not load");
      return res.json();
    },
    enabled: allowed,
  });

  /** Writes one AAC field for a client, then reloads the table (and the checklists). */
  async function save(code: string, field: string, value: string) {
    const res = await fetch(`/api/clients/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => ({}))).error ?? `Could not save ${field} for ${code}`);
      return;
    }
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["onboarding-checklists"] });
    qc.invalidateQueries({ queryKey: ["client-checklist", code] });
  }

  if (status === "loading") return null;
  if (!allowed) {
    return <p className="p-6 text-sm text-muted-foreground">This page isn&apos;t available.</p>;
  }

  const shown = (rows ?? []).filter((r) => !onlyGaps || r.done < r.total);

  return (
    <div className="space-y-4">
      <PageMetaSlot>
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/onboarding" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Client Onboarding
          </Link>
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] leading-none tracking-tighter">
            <span className="font-bold text-sidebar-foreground">Connections</span>
            <span className="font-normal text-brand">Catch-up</span>
          </h1>
          <span className="rounded-full border border-orange-500/40 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-400">Temporary · only you</span>
        </div>
      </PageMetaSlot>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>
          Only what each client&apos;s services need; <span className="italic">n/a</span> = not part of their services. Saves as you go.
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
          Only clients with something missing
        </label>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-500">
          Couldn&apos;t load the clients.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      )}

      {rows && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[1400px] text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Services</th>
                <th className="px-3 py-2.5">GA4 property</th>
                <th className="px-3 py-2.5">Meta ad account</th>
                <th className="px-3 py-2.5">Klaviyo key</th>
                <th className="px-3 py-2.5">Google Ads ID</th>
                <th className="px-3 py-2.5">Shopify store</th>
                <th className="px-3 py-2.5">SOW / quote</th>
                <th className="px-3 py-2.5">Access granted to 1o8</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const applies = (key: string) => key in r.items;
                const na = <span className="italic text-muted-foreground/50">n/a</span>;
                return (
                  <tr key={r.code} className="border-b border-border/40 align-top last:border-0">
                    <td className="px-3 py-2.5">
                      <Link href={`/clients/${encodeURIComponent(r.code)}/onboarding`} className="font-semibold hover:text-brand">
                        {r.code}
                      </Link>
                      <div className="max-w-36 truncate text-muted-foreground" title={r.name}>
                        {r.name}
                      </div>
                      <div className={cn("mt-1 tabular-nums", r.done === r.total ? "text-emerald-500" : "text-muted-foreground")}>
                        {r.done}/{r.total}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <ServicesCell services={r.services} onToggle={(s, on) => save(r.code, `Service: ${s}`, on ? s : "")} />
                    </td>
                    <td className="px-3 py-2.5">
                      {applies("conn_ga4") ? (
                        <Ga4PropertyPicker value={r.fields.GA4Property} readOnly={false} onSave={(v) => save(r.code, "GA4Property", v)} />
                      ) : (
                        na
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {applies("conn_meta") ? (
                        <MetaAdAccountPicker value={r.fields.MetaAdAccount} readOnly={false} onSave={(v) => save(r.code, "MetaAdAccount", v)} />
                      ) : (
                        na
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {applies("conn_klaviyo") ? <KlaviyoKey clientIdCode={r.code} readOnly={false} showLabel={false} connected={r.klaviyo} /> : na}
                    </td>
                    <td className="px-3 py-2.5">
                      {applies("conn_google_ads") ? (
                        <GoogleAdsAccount value={r.fields.GoogleAdsCustomerId} readOnly={false} showLabel={false} onSave={(f, v) => save(r.code, f, v)} />
                      ) : (
                        na
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {applies("conn_shopify") ? (
                        <span className="block w-64">
                          <ShopifyStore clientIdCode={r.code} value={r.fields.ShopifyStore} readOnly={false} showLabel={false} onSave={(f, v) => save(r.code, f, v)} />
                        </span>
                      ) : (
                        na
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className="block w-36">
                          <EditableCell field="SOWURL" value={r.fields.SOWURL} readOnly={false} type="url" onSave={(f, v) => save(r.code, f, v)} />
                        </span>
                        {r.fields.SOWURL && (
                          <a href={r.fields.SOWURL} target="_blank" rel="noreferrer" aria-label={`Open ${r.code} SOW`} className="text-muted-foreground hover:text-brand">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ACCESSES.filter((a) => applies(a.key)).map((a) => {
                          const state = r.items[a.key];
                          if (state === "na") return <span key={a.key} className="italic text-muted-foreground/50">{a.label} n/a</span>;
                          return (
                            <label key={a.key} className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={state === "done"}
                                onChange={(e) => save(r.code, checkField(a.key), e.target.checked ? "done" : "")}
                              />
                              {a.label}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    Every active client is connected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Service chips; the popup toggles the AAC services (same as Contract & services). */
function ServicesCell({ services, onToggle }: { services: string[]; onToggle: (service: string, on: boolean) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex max-w-56 flex-wrap gap-1 text-left">
          {services.length ? (
            services.map((s) => (
              <span key={s} className="rounded-full border border-brand/30 bg-brand/10 px-1.5 text-[10px] text-brand">
                {s}
              </span>
            ))
          ) : (
            <span className="font-medium text-orange-400">Set services</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 text-xs font-semibold">Services</p>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(AAC_SERVICES)].map((s) => {
            const on = services.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggle(s, !on)}
                className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-brand bg-brand/15 text-brand" : "text-muted-foreground hover:border-brand")}
              >
                {s}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
