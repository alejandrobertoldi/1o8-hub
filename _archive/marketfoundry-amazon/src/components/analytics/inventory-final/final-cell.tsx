"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { fmtInt } from "@/lib/formatters";
import type { FinalRec } from "@/lib/inventory/final-rec";
import type { OverrideRow } from "@/lib/inventory/overrides";

const BADGE = "rounded-md px-2 py-0.5 text-[9px] font-bold border";
const RED = "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30";
const STONE = "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800";

interface Props {
  rec: FinalRec;
  override: OverrideRow | undefined;
  editable: boolean;
  onSave: (qty: number, note: string) => Promise<string | null>;
  onClear: () => Promise<string | null>;
}

export function FinalCell({ rec, override, editable, onSave, onClear }: Props) {
  // Positive (units to send) green; negative is the red Overstock pair; 0 plain.
  const signText = rec.final > 0 ? "text-brand-green" : "";
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(rec.final));
  const [note, setNote] = useState(override?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provenance = override
    ? `Set by ${override.setBy} on ${override.setAt.slice(0, 10)} · live calc ${rec.liveCalc}${override.note ? ` · ${override.note}` : ""}`
    : undefined;

  async function save() {
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n)) { setError("Whole number required"); return; }
    if (!note.trim()) { setError("Add a reason for the override"); return; }
    setBusy(true);
    try {
      const err = await onSave(n, note);
      if (err) setError(err); else { setError(null); setEditing(false); }
    } catch {
      setError("Could not save — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const err = await onClear();
      if (err) setError(err); else setEditing(false);
    } catch {
      setError("Could not clear override — try again");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-[180px] flex-col gap-1">
        <div className="flex justify-between text-[10px] font-normal text-muted-foreground">
          <span>Calculated result</span><span className="tabular-nums">{fmtInt(rec.liveCalc)}</span>
        </div>
        <input aria-label="Final quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
          className="h-7 rounded-full border border-stone-300 bg-white px-3 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
        <input aria-label="Note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required)"
          className="h-7 rounded-full border border-stone-300 bg-white px-3 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
        {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
        <div className="flex gap-1">
          <button type="button" disabled={busy} onClick={save} className="h-7 rounded-full bg-brand px-3 text-[11px] font-medium text-white hover:bg-brand-hover">Save</button>
          {override && <button type="button" disabled={busy} onClick={clear} className="h-7 rounded-full border border-stone-300 px-3 text-[11px] text-muted-foreground dark:border-zinc-700">Clear override</button>}
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="h-7 px-2 text-[11px] text-muted-foreground">Cancel</button>
        </div>
      </div>
    );
  }

  const pencil = editable && (
    <button type="button" aria-label="Edit final" onClick={() => { setQty(String(rec.final)); setNote(override?.note ?? ""); setEditing(true); }}
      className="text-muted-foreground hover:text-brand">
      <Pencil className="size-3" />
    </button>
  );

  // Overridden: the calculated result struck through (red if negative), then the
  // tags and the definitive number, then why.
  if (rec.overridden) {
    return (
      <div className="flex flex-col items-end gap-0.5" title={provenance}>
        <span
          className={`font-bold tabular-nums line-through ${rec.liveCalc < 0 ? "text-red-600 dark:text-red-400" : ""}`}
          title="Calculated result, replaced by the override"
        >
          {fmtInt(rec.liveCalc)}
        </span>
        <span className="flex items-center gap-1">
          {pencil}
          <span className={`${BADGE} ${STONE}`}>override</span>
          {rec.isOverstock ? (
            <><span className={`${BADGE} ${RED}`}>Overstock</span><span className="font-bold tabular-nums text-red-600 dark:text-red-400">−{fmtInt(Math.abs(rec.final))}</span></>
          ) : (
            <span className={`font-bold tabular-nums ${signText}`}>{fmtInt(rec.final)}</span>
          )}
        </span>
        {override?.note && (
          <span className="max-w-[150px] break-words text-right text-[10px] font-normal italic text-muted-foreground">“{override.note}”</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1" title={provenance}>
      {pencil}
      {rec.isOverstock ? (
        <><span className={`${BADGE} ${RED}`}>Overstock</span><span className="font-bold tabular-nums text-red-600 dark:text-red-400">−{fmtInt(Math.abs(rec.final))}</span></>
      ) : (
        <span className={`font-bold tabular-nums ${signText}`}>{fmtInt(rec.final)}</span>
      )}
    </div>
  );
}
