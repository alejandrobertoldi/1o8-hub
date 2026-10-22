/* eslint-disable react-doctor/rendering-hydration-no-flicker */
/* eslint-disable react-doctor/no-derived-state-effect */
/* eslint-disable react-doctor/no-derived-useState */
/* eslint-disable react-doctor/prefer-useReducer */
"use client";

import { useEffect, useState } from "react";

interface Props {
  clientIdCode: string;
  canEdit: boolean;
  initialMd: string | null;
  activeVersionNumber: number | null;
  lastUpdatedAt: string | null;
}

export default function BrandMdPreview({
  clientIdCode,
  canEdit,
  initialMd,
  activeVersionNumber,
  lastUpdatedAt,
}: Props) {
  const [md, setMd] = useState<string>(initialMd ?? "");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(lastUpdatedAt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Sync if the parent reloads state (e.g. after a mutation triggers refresh()).
  useEffect(() => {
    setMd(initialMd ?? "");
    setRefreshedAt(lastUpdatedAt);
  }, [initialMd, lastUpdatedAt]);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/refresh-preview`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`refresh failed: ${r.status}`);
      const text = await r.text();
      setMd(text);
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col">
          <h2 className="font-medium">AI preview (what AI agents see)</h2>
          <div className="text-xs text-muted-foreground" suppressHydrationWarning>
            {activeVersionNumber !== null ? `v${activeVersionNumber}` : "no active version"}
            {refreshedAt
              ? mounted
                ? ` · last refreshed ${new Date(refreshedAt).toLocaleString()}`
                : ` · last refreshed …`
              : " · not yet generated"}
          </div>
        </div>
        {canEdit && (
          <button
            className="border px-3 py-1 rounded text-sm disabled:opacity-50"
            disabled={busy}
            onClick={refresh}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      <pre className="text-xs whitespace-pre-wrap break-words max-h-[28rem] overflow-auto border rounded p-2 bg-muted/30">
        {md && md.length > 0 ? md : "(no preview stored yet — click Refresh to generate)"}
      </pre>
    </section>
  );
}
