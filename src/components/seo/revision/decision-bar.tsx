"use client";

import { useState } from "react";
import type { RevisionAction } from "@/lib/seo/revision-rules";
import { actionNeedsNote } from "@/lib/seo/revision-rules";

const LABEL: Record<RevisionAction, string> = {
  approve: "Approve", request_changes: "Request changes", send_to_client: "Send to client", approve_final: "Approve as final",
};

export function DecisionBar({ actions, actedAs, waitingFor, requireNoteFor, onDecide }: {
  actions: RevisionAction[];
  actedAs: "assigned" | "override" | "client" | null;
  waitingFor: string | null;
  /** Extra actions that need a note, on top of the default (request_changes / approve_final). */
  requireNoteFor?: RevisionAction[];
  onDecide: (action: RevisionAction, note: string | null) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (actions.length === 0) return <p className="text-sm text-muted-foreground">{waitingFor ? `Waiting for ${waitingFor}` : "No action needed."}</p>;
  const suffix = actedAs === "override" ? " (override)" : "";
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="What should change, or why is this final? (required for Request changes and Approve as final)"
        className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a} type="button" disabled={busy}
            onClick={async () => {
              if ((actionNeedsNote(a) || requireNoteFor?.includes(a)) && !note.trim()) { setError("Add a note first."); return; }
              setError(null); setBusy(true);
              try { await onDecide(a, note.trim() || null); setNote(""); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${a === "request_changes" ? "border border-border" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
            {LABEL[a]}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}
