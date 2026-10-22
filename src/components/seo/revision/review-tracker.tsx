"use client";

import { useState } from "react";
import type { RevisionAction } from "@/lib/seo/revision-rules";

export interface TrackerEvent { id: string; step: string; action: string; actorName: string | null; actedAs: string; note: string | null; createdAt: string }
type Person = { name: string; email: string | null } | null;
type Mode = null | "confirm" | "choose" | "final" | "changes";

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");
// Custom box: orange fill + black tick when checked — same look whether or not it is locked
const BOX = "peer size-4 shrink-0 appearance-none rounded border-2 border-neutral-400 bg-white checked:border-[#ff9900] checked:bg-[#ff9900] enabled:cursor-pointer enabled:hover:border-[#ff9900] disabled:cursor-not-allowed";
const Tick = () => (
  <svg className="pointer-events-none absolute inset-0 m-auto hidden size-3 text-black peer-checked:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const DONE_LABEL: Record<string, string> = { submit: "Submitted", approve: "Approved", send_to_client: "Sent to client", approve_final: "Approved as final" };

/**
 * Review tracker: one row per sign-off (SEO Manager → Project Manager → Account Manager → Client when sent).
 * Ticking your row's checkbox approves; approvals are one-way (request changes to start a new revision).
 */
export function ReviewTracker({ status, events, approvers, me, onDecide }: {
  status: string;
  events: TrackerEvent[];
  approvers: { pm: Person; am: Person };
  me: { step: string | null; actedAs: string | null; actions: RevisionAction[]; overrideAs?: string | null };
  onDecide: (action: RevisionAction, note: string | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const last = (step: string) => [...events].reverse().find((e) => e.step === step) ?? null;
  const submit = last("submit");
  const activeStep = status === "pm_review" ? "pm" : status === "am_review" ? "am" : status === "client_review" ? "client" : null;
  const showClient = status === "client_review" || events.some((e) => e.step === "am" && e.action === "send_to_client");
  const rows = [
    { key: "seo", title: "SEO Manager", who: submit?.actorName ?? "—", ev: submit },
    { key: "pm", title: "Project Manager", who: approvers.pm?.name ?? "No PM set", ev: last("pm") },
    { key: "am", title: "Account Manager", who: approvers.am?.name ?? "No AM set", ev: last("am") },
    ...(showClient ? [{ key: "client", title: "Client", who: "Client", ev: last("client") }] : []),
  ];
  const mine = (key: string) => me.step === key && me.actions.length > 0;
  const needsNoteToApprove = me.step === "client";

  async function decide(action: RevisionAction, n: string | null) {
    setBusy(true); setError(null);
    try { await onDecide(action, n); setMode(null); setNote(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const noteBox = (
    <textarea aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (required)"
      className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs text-neutral-900" />
  );
  const btn = "rounded-lg px-2.5 py-1 text-[11px] font-bold disabled:opacity-40";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-900">
      <p className="mb-3 font-bold">Review tracker</p>
      <ul className="divide-y divide-neutral-100">
        {rows.map((r) => {
          const done = !!r.ev && r.ev.action !== "request_changes";
          const changes = r.ev?.action === "request_changes";
          const active = r.key === activeStep;
          const canAct = active && mine(r.key);
          // Not the assigned person but higher up (client team ladder / Owner): act through a separate Override box
          const viaOverride = canAct && me.actedAs === "override";
          const status = done
            ? `${DONE_LABEL[r.ev!.action] ?? "Done"} by ${r.ev!.actorName ?? "—"}${r.ev!.actedAs === "override" ? " (override)" : ""} · ${when(r.ev!.createdAt)}`
            : changes ? `Changes requested by ${r.ev!.actorName ?? "—"}${r.ev!.note ? `: ${r.ev!.note}` : ""}`
            : active ? (canAct && !viaOverride ? "Your approval" : r.key !== "client" && !(r.key === "pm" ? approvers.pm?.email : approvers.am?.email)
              ? `No matching user for ${r.who} — an Owner must decide` : `Waiting for ${r.who}`)
            : "Not yet";
          return (
            <li key={r.key} className="py-2.5">
              <div className="flex items-center gap-3">
                <span className="relative inline-flex">
                  <input type="checkbox" aria-label={`${r.title} · ${r.who}`} checked={done} disabled={!canAct || viaOverride || done}
                    onChange={() => { setError(null); setMode(r.key === "am" ? "choose" : "confirm"); }}
                    className={BOX} />
                  <Tick />
                </span>
                <span className="w-36 font-bold">{r.title}</span>
                <span className="w-44 truncate">{r.who}</span>
                <span className={`flex-1 ${done ? "text-emerald-700" : changes ? "text-red-600" : active ? "text-amber-700" : "text-neutral-400"}`}>{status}</span>
                {viaOverride && !done && (
                  <label className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                    <span className="relative inline-flex">
                      <input type="checkbox" aria-label={`Override as ${me.overrideAs ?? "Owner"}`} checked={false}
                        onChange={() => { setError(null); setMode(r.key === "am" ? "choose" : "confirm"); }} className={BOX} />
                      <Tick />
                    </span>
                    Override as {me.overrideAs ?? "Owner"}
                  </label>
                )}
                {canAct && me.actions.includes("request_changes") && mode === null && (
                  <button type="button" onClick={() => setMode("changes")} className="text-[11px] text-red-600 underline">Request changes</button>
                )}
              </div>

              {canAct && mode !== null && (
                <div className="ml-7 mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  {mode === "confirm" && (
                    <>
                      <p>{viaOverride ? `Override the ${r.title} step as ${me.overrideAs ?? "Owner"} and approve?` : `Approve as ${r.title}?`} This can&apos;t be undone — request changes to start a new revision instead.</p>
                      {needsNoteToApprove && noteBox}
                      <div className="flex gap-2">
                        <button type="button" disabled={busy || (needsNoteToApprove && !note.trim())} onClick={() => decide("approve", note.trim() || null)} className={`${btn} bg-emerald-600 text-white`}>Confirm approval</button>
                        <button type="button" onClick={() => setMode(null)} className={`${btn} border border-neutral-300`}>Cancel</button>
                      </div>
                    </>
                  )}
                  {mode === "choose" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Approve and…</span>
                      <button type="button" disabled={busy} onClick={() => decide("send_to_client", null)} className={`${btn} bg-emerald-600 text-white`}>Send to client</button>
                      <button type="button" onClick={() => setMode("final")} className={`${btn} border border-emerald-600 text-emerald-700`}>Approve as final</button>
                      <button type="button" onClick={() => setMode(null)} className={`${btn} border border-neutral-300`}>Cancel</button>
                    </div>
                  )}
                  {mode === "final" && (
                    <>
                      <p>Approve as final without the client — why?</p>
                      {noteBox}
                      <div className="flex gap-2">
                        <button type="button" disabled={busy || !note.trim()} onClick={() => decide("approve_final", note.trim())} className={`${btn} bg-emerald-600 text-white`}>Confirm final approval</button>
                        <button type="button" onClick={() => setMode(null)} className={`${btn} border border-neutral-300`}>Cancel</button>
                      </div>
                    </>
                  )}
                  {mode === "changes" && (
                    <>
                      <p>What needs to change?</p>
                      {noteBox}
                      <div className="flex gap-2">
                        <button type="button" disabled={busy || !note.trim()} onClick={() => decide("request_changes", note.trim())} className={`${btn} bg-red-600 text-white`}>Send request</button>
                        <button type="button" onClick={() => setMode(null)} className={`${btn} border border-neutral-300`}>Cancel</button>
                      </div>
                    </>
                  )}
                  {error && <p className="text-red-600">{error}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
