"use client";
import { useEffect, useState } from "react";

export default function Helium10Settings() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/seo/helium10", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setConnected(data.connected);
        if (new URLSearchParams(window.location.search).get("helium10") === "error") setError("Authorization failed. Retry using amazon@marketfoundry.agency.");
      }).catch(() => { if (!controller.signal.aborted) setError("Unable to check the shared connection. Verify the server configuration and retry."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function manage(method: "POST" | "DELETE") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/seo/helium10", { method, signal: AbortSignal.timeout(60_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connection setup failed.");
      if (method === "POST") window.location.assign(data.authorizationUrl);
      else setConnected(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection setup failed."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Helium 10 integration</h1>
    <p>SEO Manager uses one shared account: <strong>amazon@marketfoundry.agency</strong>. Use only this account on the Helium 10 authorization screen.</p>
    <p>All authorized SEO operators use this connection. Tokens refresh automatically. If Helium 10 revokes access or requires sign-in again, any user with SEO access can restore it from the Reconnect button in SEO Manager.</p>
    <p role="status">{busy ? "Working…" : connected ? "Shared connection configured" : "Shared connection unavailable"}</p>
    <div className="flex gap-4">
      <button disabled={busy} onClick={() => manage("POST")} className="rounded bg-brand-500 px-4 py-2 text-white disabled:opacity-50">{connected ? "Reauthorize shared account" : "Authorize shared account"}</button>
      {connected && <button disabled={busy} onClick={() => manage("DELETE")} className="rounded border px-4 py-2 disabled:opacity-50">Disconnect shared account</button>}
    </div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
  </main>;
}
