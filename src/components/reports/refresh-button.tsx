/* eslint-disable react-doctor/no-generic-handler-names */
"use client";

import { useState } from "react";

const SECTION_ENDPOINTS: Record<string, string[]> = {
  "overview": ["overview", "keywords", "campaigns", "product-performance"],
  "period-comparative": ["period-comparative"],
  "inventory": ["inventory"],
  "share-of-voice": ["share-of-voice"],
  "subscribe-save": ["subscribe-save"],
  "advertising-audit": ["advertising-audit", "keywords-gaps"],
};

type Props = {
  section: string;
  accountId: string;
  start: string;
  end: string;
  onRefreshed: () => void;
};

export function RefreshButton({ section, accountId, start, end, onRefreshed }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const endpoints = SECTION_ENDPOINTS[section] ?? [];

  async function handleClick() {
    if (busy || endpoints.length === 0) return;
    setBusy(true);
    setMessage(null);
    const t0 = Date.now();
    try {
      const isInventory = section === "inventory";
      const params = isInventory
        ? `accountId=${encodeURIComponent(accountId)}&refresh=true`
        : `accountId=${encodeURIComponent(accountId)}&start=${start}&end=${end}&refresh=true`;
      const results = await Promise.all(
        endpoints.map((ep) => fetch(`/api/reports/${ep}?${params}`).then((r) => r.ok)),
      );
      const okCount = results.filter(Boolean).length;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setMessage(
        okCount === endpoints.length
          ? `Refreshed ${okCount} endpoint${okCount === 1 ? "" : "s"} in ${elapsed}s`
          : `${okCount}/${endpoints.length} endpoints refreshed in ${elapsed}s`,
      );
      onRefreshed();
    } catch (err) {
      setMessage(`Refresh failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="bg-background border border-brand/60 rounded-md px-2 py-0.5 text-xs font-bold text-brand hover:bg-brand/10 disabled:opacity-50 transition-colors"
        title="Re-query Redshift and update cache"
      >
        {busy ? "Refreshing…" : "Refresh ↻"}
      </button>
      {message && (
        <span className="text-[11px] text-muted-foreground">{message}</span>
      )}
    </div>
  );
}
