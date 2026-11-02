"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { fmtInt } from "@/lib/formatters";
import type { PortalSnapshotRow, SnapshotHeader, SnapshotTotals } from "@/lib/inventory/snapshot";

const PRIMARY = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";
const GHOST = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

// Why "Mark as sent" is off, in priority order. With no linked accounts the
// windows query never runs and stays "loading" forever, so that case must be
// named before the loading check. Overrides must have loaded too, or the
// snapshot would silently drop every override and note.
export function sendDisabledReason(s: {
  editable: boolean;
  hasAccounts: boolean;
  windowsStatus: "idle" | "loading" | "error" | "ready";
  settingsReady: boolean;
  overridesStatus: "idle" | "loading" | "error" | "ready";
  rowCount: number;
}): string | null {
  if (!s.editable) return "Editors only";
  if (!s.hasAccounts) return "No Amazon accounts linked";
  if (s.windowsStatus === "error") return "Sales data failed to load";
  if (s.overridesStatus === "error") return "Overrides failed to load";
  if (s.windowsStatus !== "ready" || !s.settingsReady || s.overridesStatus !== "ready") return "Loading sales data…";
  if (s.rowCount === 0) return "No SKUs to send";
  return null;
}

export type SendResult =
  | { snapshot: SnapshotHeader; rows: PortalSnapshotRow[]; downloadFailed?: true }
  | { error: string };

const DOWNLOAD_FAILED = "Sent — the download failed; re-download it from the history menu.";

interface Props {
  clientName: string;
  snapshots: SnapshotHeader[];
  canSend: boolean;
  disabledReason: string | null;
  totals: SnapshotTotals;
  /** Rows left out of the send because they have no ASIN or SKU. */
  excludedCount?: number;
  onSend: () => Promise<SendResult>;
  onDownload: (h: SnapshotHeader) => Promise<void>;
}

export function SendControls({ clientName, snapshots, canSend, disabledReason, totals, excludedCount = 0, onSend, onDownload }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const last = snapshots[0];

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await onSend();
      if ("error" in r) setError(r.error);
      else {
        setConfirming(false);
        setNotice(r.downloadFailed ? DOWNLOAD_FAILED : null);
      }
    } catch {
      setError("Could not send — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      {last && (
        <button type="button" className={GHOST} aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
          Sent {last.sentAt.slice(0, 10)} by {last.sentBy.split("@")[0]} <ChevronDown className="size-3.5" />
        </button>
      )}
      {historyOpen && last && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-[18px] border border-stone-200 bg-card p-2 shadow-md dark:border-zinc-800">
          {snapshots.map((s) => (
            <button key={s.id} type="button" onClick={() => void onDownload(s)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-muted">
              <span>{s.sentAt.slice(0, 10)} · {s.sentBy.split("@")[0]} · {fmtInt(s.unitsToSend)} units</span>
              <Download className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
      <button type="button" className={PRIMARY} disabled={!canSend} title={disabledReason ?? undefined}
        onClick={() => { setError(null); setNotice(null); setConfirming(true); }}>
        Mark as sent
      </button>
      {notice && (
        <p role="status" className="absolute right-0 top-11 z-30 w-80 rounded-lg border border-amber-500/30 bg-card px-3 py-2 text-xs text-amber-700 shadow-sm dark:text-amber-400">
          {notice}
        </p>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <p className="text-sm">
              Send {fmtInt(totals.skuCount)} SKUs, {fmtInt(totals.unitsToSend)} units to {clientName}?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This replaces what the client sees in the portal and downloads the spreadsheet. Overstock: {fmtInt(totals.overstockSkus)} SKUs.
            </p>
            {excludedCount > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {fmtInt(excludedCount)} {excludedCount === 1 ? "product" : "products"} without an ASIN/SKU will be excluded.
              </p>
            )}
            {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={GHOST} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className={PRIMARY} disabled={busy} onClick={confirm}>Confirm send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
