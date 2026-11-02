"use client";

import { useState, type ReactNode } from "react";
import { describeMethod, todayIso, validateRecSettings, type RecMethod, type RecSettings } from "@/lib/inventory/rec-settings";

const CHIP = "inline-flex h-9 items-center rounded-full border border-stone-300 px-3 text-[13px] font-medium text-muted-foreground dark:border-zinc-700";
const INPUT = "h-9 rounded-full border border-stone-300 bg-white px-4 text-sm text-foreground focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
const METHOD_LABELS: [RecMethod, string][] = [["greater", "Greater of both"], ["recent", "Recent sales"], ["seasonal", "Seasonal window"], ["average", "Average of both"]];

interface Props {
  settings: RecSettings;
  editable: boolean;
  onSave: (s: RecSettings) => Promise<string | null>;
}

export function MethodSettingsButton({ settings, editable, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = describeMethod(settings, todayIso());

  if (!editable) return <Labelled><span className={CHIP}>{label}</span></Labelled>;

  async function save() {
    const parsed = validateRecSettings(draft);
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy(true);
    try {
      const err = await onSave(parsed.value);
      if (err) setError(err); else { setError(null); setOpen(false); }
    } catch {
      setError("Could not save — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Labelled>
      <button type="button" aria-label={`Recommendation method: ${label}`} className={`${CHIP} hover:bg-stone-50 dark:hover:bg-zinc-800`} onClick={() => { setDraft(settings); setError(null); setOpen(true); }}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60" role="dialog" aria-modal="true" aria-label="Recommendation method">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Recommendation method</h2>
            <fieldset className="mt-4 flex flex-col gap-2 text-sm">
              {METHOD_LABELS.map(([m, l]) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="method" aria-label={l} checked={draft.method === m} onChange={() => setDraft({ ...draft, method: m })} />
                  {l}
                </label>
              ))}
            </fieldset>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-bold text-muted-foreground">
              <label className="flex flex-col gap-1">Recent window (days)
                <input aria-label="Recent window (days)" className={INPUT} inputMode="numeric" value={draft.recentDays}
                  onChange={(e) => setDraft({ ...draft, recentDays: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">Uplift on shortfall (%)
                <input aria-label="Uplift (%)" className={INPUT} inputMode="numeric" value={draft.upliftPct}
                  onChange={(e) => setDraft({ ...draft, upliftPct: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">Seasonal start
                <input aria-label="Seasonal start" type="date" className={INPUT} value={draft.seasonalStart ?? ""}
                  onChange={(e) => setDraft({ ...draft, seasonalStart: e.target.value || null })} />
              </label>
              <label className="flex flex-col gap-1">Seasonal end
                <input aria-label="Seasonal end" type="date" className={INPUT} value={draft.seasonalEnd ?? ""}
                  onChange={(e) => setDraft({ ...draft, seasonalEnd: e.target.value || null })} />
              </label>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Leave both seasonal dates empty to use this month and the next two, last year (e.g. Oct–Dec last year in October).</p>
            {error && <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-full border border-stone-300 px-3 text-[13px] font-medium text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
              <button type="button" disabled={busy} onClick={save} className="inline-flex h-9 items-center rounded-full bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-hover">Save</button>
            </div>
          </div>
        </div>
      )}
    </Labelled>
  );
}

// Small caps label above the method chip so the team knows what the chip controls.
function Labelled({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recommendation method</span>
      {children}
    </div>
  );
}
