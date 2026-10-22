/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, Save } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

type ClientRow = { clientIdCode: string; clientName: string };
type Layout = { ordered: string[]; hidden: string[] };

export default function SalesSummaryConfigPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clientsRes, layoutRes] = await Promise.all([
          fetch("/api/clients/list?status=Active"),
          fetch("/api/sales-summary/config"),
        ]);
        if (!clientsRes.ok) throw new Error("Failed to load clients");
        if (!layoutRes.ok) throw new Error("Failed to load layout");
        const clientRows: ClientRow[] = await clientsRes.json();
        const layout: Layout = await layoutRes.json();
        if (cancelled) return;
        setClients(clientRows);
        const known = new Set(clientRows.map((c) => c.clientIdCode));
        const persistedOrdered = layout.ordered.filter((id) => known.has(id));
        const remaining = clientRows
          .map((c) => c.clientIdCode)
          .filter((id) => !persistedOrdered.includes(id));
        setOrdered([...persistedOrdered, ...remaining]);
        setHidden(new Set(layout.hidden));
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

  const nameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) map[c.clientIdCode] = c.clientName;
    return map;
  }, [clients]);

  const move = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= ordered.length) return;
    const next = ordered.slice();
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setOrdered(next);
  };

  const toggleHidden = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-summary/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ordered, hidden: Array.from(hidden) }),
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

  const onShowAll = () => setHidden(new Set());
  const onHideAll = () => setHidden(new Set(ordered));
  const onAlphabetical = () => {
    const sorted = ordered
      .slice()
      .sort((a, b) => (nameByCode[a] || a).localeCompare(nameByCode[b] || b));
    setOrdered(sorted);
  };

  return (
    <div className="-mt-6 lg:-mt-8">
      <PageMetaSlot>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/sales-summary"
              className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              title="Back to Sales Summary"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
              <span className="font-bold text-sidebar-foreground">SalesSummary</span>
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
            <button
              type="button"
              onClick={onAlphabetical}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-foreground/5"
            >
              Sort A→Z
            </button>
          </div>
        </div>
      </PageMetaSlot>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {loading ? (
          <LoadingPlaceholder />
        ) : (
          <ul className="rounded-lg border border-border divide-y divide-border bg-background">
            {ordered.map((id, idx) => {
              const isHidden = hidden.has(id);
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 px-3 py-2 ${isHidden ? "opacity-50" : ""}`}
                >
                  <span className="text-xs font-mono w-8 text-foreground/40 text-right">
                    {idx + 1}
                  </span>
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => toggleHidden(id)}
                    aria-label={`Show ${nameByCode[id] || id}`}
                    className="size-4 accent-brand"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{nameByCode[id] || id}</div>
                    <div className="text-[10px] font-mono text-foreground/40 truncate">{id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === ordered.length - 1}
                    className="p-1 rounded-md text-foreground/60 hover:text-foreground hover:bg-foreground/5 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
