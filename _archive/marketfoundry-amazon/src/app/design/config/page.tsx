/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";
/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/js-combine-iterations */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

type ClientRow = { clientIdCode: string; clientName: string };

const SECTIONS = [
  { key: "brand_story", label: "Brand Story" },
  { key: "aplus", label: "A+ Content" },
  { key: "listing_images", label: "Listing Images" },
  { key: "storefront", label: "Storefront" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

type Visibility = { hidden: Record<string, string[]> };

function emptyHidden(): Record<Section, Set<string>> {
  return {
    brand_story: new Set<string>(),
    aplus: new Set<string>(),
    listing_images: new Set<string>(),
    storefront: new Set<string>(),
  };
}

export default function DesignConfigPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [hidden, setHidden] = useState<Record<Section, Set<string>>>(emptyHidden);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clientsRes, visRes] = await Promise.all([
          fetch("/api/clients/list?status=Active"),
          fetch("/api/design/visibility"),
        ]);
        if (!clientsRes.ok) throw new Error("Failed to load clients");
        if (!visRes.ok) throw new Error("Failed to load visibility");
        const clientRows: ClientRow[] = await clientsRes.json();
        const vis: Visibility = await visRes.json();
        if (cancelled) return;
        setClients(clientRows);
        const next = emptyHidden();
        for (const { key } of SECTIONS) {
          next[key] = new Set(vis.hidden?.[key] ?? []);
        }
        setHidden(next);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isShown = (section: Section, id: string) => !hidden[section].has(id);

  const setCell = (section: Section, id: string, shown: boolean) => {
    setHidden((prev) => {
      const next = { ...prev, [section]: new Set(prev[section]) };
      if (shown) next[section].delete(id);
      else next[section].add(id);
      return next;
    });
  };

  const allShownForClient = (id: string) => SECTIONS.every((s) => !hidden[s.key].has(id));

  const toggleClient = (id: string) => {
    const showAll = !allShownForClient(id); // if not all shown → show all, else hide all
    setHidden((prev) => {
      const next = emptyHidden();
      for (const { key } of SECTIONS) {
        next[key] = new Set(prev[key]);
        if (showAll) next[key].delete(id);
        else next[key].add(id);
      }
      return next;
    });
  };

  const onShowAll = () => setHidden(emptyHidden());
  const onHideAll = () => {
    const allIds = clients.map((c) => c.clientIdCode);
    setHidden({
      brand_story: new Set(allIds),
      aplus: new Set(allIds),
      listing_images: new Set(allIds),
      storefront: new Set(allIds),
    });
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/design/visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hidden: {
            brand_story: Array.from(hidden.brand_story),
            aplus: Array.from(hidden.aplus),
            listing_images: Array.from(hidden.listing_images),
            storefront: Array.from(hidden.storefront),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setSavedAt(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="-mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/design"
              className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              title="Back to Design Hub"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
              <span className="font-bold text-sidebar-foreground">Design</span>
              <span className="font-normal text-brand">Config</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-end">
            {savedAt && (
              <span className="text-xs text-foreground/50">
                Saved {savedAt.toLocaleTimeString()}
              </span>
            )}
            {error && <span className="text-xs text-red-500">{error}</span>}
            <button
              type="button"
              onClick={onSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-solid text-white text-sm font-medium hover:bg-brand-solid/90 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onShowAll}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-foreground/5"
            >
              Show all
            </button>
            <button
              type="button"
              onClick={onHideAll}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-foreground/5"
            >
              Hide all
            </button>
          </div>
        </div>
      </PageMetaSlot>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {loading ? (
          <LoadingPlaceholder />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="sticky top-0 z-20 border-b border-border bg-background shadow-[inset_0_-1px_0_0_var(--border)]">
                  <th className="sticky left-0 top-0 z-30 bg-background border-b border-border text-left font-medium text-foreground/70 px-3 py-2 min-w-[200px]">
                    Client
                  </th>
                  {SECTIONS.map((s) => (
                    <th
                      key={s.key}
                      className="sticky top-0 z-20 bg-background border-b border-border text-center font-medium text-foreground/70 px-3 py-2 min-w-[120px] whitespace-nowrap"
                    >
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => {
                  const allShown = allShownForClient(c.clientIdCode);
                  return (
                    <tr key={c.clientIdCode} className="hover:bg-foreground/[0.02]">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 min-w-[200px]">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={allShown}
                            onChange={() => toggleClient(c.clientIdCode)}
                            aria-label={`Toggle all sections for ${c.clientName}`}
                            className="size-4 accent-brand shrink-0 rounded-sm ring-1 ring-border"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.clientName}</div>
                            <div className="text-[10px] font-mono text-foreground/40 tabular-nums truncate">
                              {c.clientIdCode}
                            </div>
                          </div>
                        </div>
                      </td>
                      {SECTIONS.map((s) => {
                        const shown = isShown(s.key, c.clientIdCode);
                        return (
                          <td
                            key={s.key}
                            className={`text-center px-3 py-2 min-w-[120px] ${shown ? "" : "opacity-40"}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              onChange={(e) => setCell(s.key, c.clientIdCode, e.target.checked)}
                              aria-label={`Show ${s.label} for ${c.clientName}`}
                              className="size-4 accent-brand"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
