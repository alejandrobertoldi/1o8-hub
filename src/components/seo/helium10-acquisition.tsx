"use client";
import { useEffect, useState } from "react";
import { marketplaces, type KeywordSnapshot } from "@/lib/helium10/keywords";

export default function Helium10Acquisition({ projectId, onResult }: {
  projectId: string;
  onResult: (snapshot: KeywordSnapshot, restored: boolean) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [marketplace, setMarketplace] = useState("US");
  const [competitors, setCompetitors] = useState("");
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [statusResponse, savedResponse] = await Promise.all([
          fetch("/api/seo/helium10", { signal: controller.signal }),
          fetch(`/api/seo/projects/${projectId}/helium10`, { signal: controller.signal }),
        ]);
        const status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error || "Unable to check Helium 10 connection.");
        setConnected(status.connected);
        const saved = await savedResponse.json();
        if (!savedResponse.ok) throw new Error(saved.error || "Unable to restore keyword research.");
        if (saved.snapshot) {
          setMarketplace(saved.snapshot.marketplace);
          setCompetitors(saved.snapshot.competitorAsins.join(", "));
          setFetchedAt(saved.snapshot.fetchedAt);
          onResult(saved.snapshot, true);
        } else if (saved.defaults) {
          setMarketplace(saved.defaults.marketplace);
          setCompetitors(saved.defaults.competitorAsins.join(", "));
        }
        if (new URLSearchParams(window.location.search).get("helium10") === "error") setError("Helium 10 authorization did not finish. Please connect again.");
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Connection check failed.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [projectId, onResult]);

  async function reconnect() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/seo/helium10", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }), signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reconnection failed. Please retry.");
      window.location.assign(data.authorizationUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Reconnection failed."); }
    finally { setBusy(false); }
  }
  async function fetchKeywords() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/seo/projects/${projectId}/helium10`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(290_000),
        body: JSON.stringify({ marketplace, competitorAsins: competitors.split(/[\s,;]+/).filter(Boolean) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Keyword fetch failed.");
      setFetchedAt(data.fetchedAt);
      onResult(data, false);
    } catch (e) { setError(e instanceof Error ? e.message : "Keyword fetch failed."); }
    finally { setBusy(false); }
  }
  return <section className="mb-5 space-y-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-5" aria-label="Helium 10 keyword research">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          Get keywords from
          {/* Helium 10 logo: navy on light, white on dark (the files carry their own margins) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/H10LogoLight.png" alt="Helium 10" width={2652} height={811} className="-my-2 h-9 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/H10LogoDark.png" alt="Helium 10" width={2652} height={811} className="-my-2 hidden h-9 w-auto dark:block" />
        </h3>
        <p className="text-xs text-muted-foreground">Uses your saved S1 ASINs. Review and filter the results before approving keywords.</p></div>
      <div className="ml-auto flex items-center gap-3">
        <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${loading ? "bg-surface-3 text-muted-foreground" : connected ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-current" : connected ? "bg-green-500" : "bg-red-500"}`} />
          {loading ? "Checking connection…" : connected ? "Helium 10 connected" : "Helium 10 disconnected"}
        </span>
        <button type="button" disabled={loading || connected || busy} onClick={reconnect} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-3 text-[13px] font-medium enabled:hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Reconnect Helium 10">Reconnect</button>
      </div>
    </div>
    {!loading && !connected && <p role="status" className="text-sm">The shared keyword service is unavailable. Click Reconnect and authorize amazon@marketfoundry.agency to restore the shared connection.</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs">Marketplace<select aria-label="Marketplace" value={marketplace} onChange={e => setMarketplace(e.target.value)} disabled={busy} className="h-9 mt-1 block rounded-full border border-surface-4 bg-surface-1 px-3">{marketplaces.map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="grow text-xs">Competitor ASINs (optional, up to 10)<input value={competitors} onChange={e => setCompetitors(e.target.value)} disabled={busy} placeholder="B012345678, B087654321" className="h-9 mt-1 block w-full rounded-full border border-surface-4 bg-surface-1 px-3" /></label>
      {connected && <button onClick={fetchKeywords} disabled={busy || loading} className="inline-flex h-9 items-center justify-center rounded-full bg-brand-500 px-4 text-[13px] text-white disabled:opacity-50">{busy ? "Working…" : "Fetch keywords"}</button>}
    </div>
    {fetchedAt && <p className="text-xs text-muted-foreground">Last fetched: {new Date(fetchedAt).toLocaleString()}. Each fetch uses your Helium 10 account allowance.</p>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}
