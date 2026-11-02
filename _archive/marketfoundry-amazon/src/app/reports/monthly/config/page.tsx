/* eslint-disable react-doctor/nextjs-no-a-element */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useEffect, useState } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import type { SectionKey } from "@/lib/monthly-report/types";

// Display metadata for the config UI. Mirrors the section list in
// src/lib/monthly-report/config.ts's ALL_SECTION_KEYS.
const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; deck: string }> = [
  { key: "kpis",       label: "Key metrics",         deck: "Top-line KPIs with month-over-month deltas." },
  { key: "mom",        label: "Trends",              deck: "Revenue vs. target and CAC charts with the comparison table." },
  { key: "highlights", label: "Findings",            deck: "Numbered highlights and decisions made this period." },
  { key: "products",   label: "Product performance", deck: "Per-ASIN breakdown sorted by sales and gated by CVR / buy-box thresholds." },
  { key: "goals",      label: "Directions",          deck: "Forward-looking experiments and bets for the coming month." },
  { key: "risks",      label: "Scorecard",           deck: "Risk register and grades against monthly targets." },
];

type ClientFlags = Partial<Record<SectionKey, boolean>>;
type CellState = "on" | "off" | "inherit";

interface ConfigShape {
  global: Record<SectionKey, boolean>;
  clients: Record<string, ClientFlags>;
}

function cellState(flags: ClientFlags | undefined, key: SectionKey): CellState {
  if (!flags || flags[key] === undefined) return "inherit";
  return flags[key] ? "on" : "off";
}

function cycle(state: CellState): CellState {
  if (state === "inherit") return "on";
  if (state === "on") return "off";
  return "inherit";
}

export default function MonthlyConfigPage() {
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [clients, setClients] = useState<Array<{ code: string; name: string; accountId: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/reports/monthly/config").then((r) => r.json()),
      fetch("/api/reports/monthly").then((r) => r.json()),
    ])
      .then(([configJson, listJson]) => {
        setCfg(configJson);
        setClients(listJson.clients ?? []);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(next: ConfigShape) {
    setSaving(true);
    setError(null);
    const prev = cfg;
    setCfg(next); // optimistic
    try {
      const res = await fetch("/api/reports/monthly/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Save failed");
        setCfg(prev); // rollback
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setCfg(prev);
    } finally {
      setSaving(false);
    }
  }

  function toggleGlobal(key: SectionKey) {
    if (!cfg) return;
    save({ ...cfg, global: { ...cfg.global, [key]: !cfg.global[key] } });
  }

  function cycleClient(code: string, key: SectionKey) {
    if (!cfg) return;
    const state = cellState(cfg.clients[code], key);
    const next = cycle(state);
    const flags: ClientFlags = { ...(cfg.clients[code] ?? {}) };
    if (next === "inherit") delete flags[key];
    else flags[key] = next === "on";
    const clients = { ...cfg.clients };
    if (Object.keys(flags).length === 0) delete clients[code];
    else clients[code] = flags;
    save({ ...cfg, clients });
  }

  if (!cfg) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Report Config"
        >
          <span className="font-bold text-sidebar-foreground">Report</span>
          <span className="font-normal text-brand">Config</span>
        </h1>
      </PageMetaSlot>
      <div className="mb-6">
        <a href="/reports/monthly" className="text-sm text-muted-foreground hover:text-foreground">← Back to Monthly Reports</a>
        {saving && <p className="text-sm text-[#F7BF1D] mt-1">Saving…</p>}
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 text-red-500 rounded-md p-3 text-sm mb-6">{error}</div>
      )}

      <section className="border border-border rounded-xl p-6 mb-8 bg-card">
        <h2 className="text-lg font-semibold mb-3">Global defaults</h2>
        <div className="space-y-2">
          {SECTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-3 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.global[s.key]}
                onChange={() => toggleGlobal(s.key)}
              />
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.deck}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="border border-border rounded-xl p-6 bg-card">
        <h2 className="text-lg font-semibold mb-3">Per-client overrides</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Click a cell to cycle: <span className="font-semibold">— default</span> → <span className="text-[#35C759] font-semibold">ON</span> → <span className="text-[#FF5C60] font-semibold">OFF</span>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4">Client</th>
                {SECTIONS.map((s) => (
                  <th key={s.key} className="text-center py-2 px-3 font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.filter((c) => c.accountId).map((client) => (
                <tr key={client.accountId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{client.name}</td>
                  {SECTIONS.map((s) => {
                    const code = client.accountId as string;
                    const state = cellState(cfg.clients[code], s.key);
                    const labelText = state === "on" ? "ON" : state === "off" ? "OFF" : "— default";
                    const cls = state === "on" ? "text-[#35C759]" : state === "off" ? "text-[#FF5C60]" : "text-muted-foreground";
                    return (
                      <td key={s.key} className="text-center py-2 px-3">
                        <button onClick={() => cycleClient(code, s.key)} className={`text-xs font-semibold ${cls}`}>
                          {labelText}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
