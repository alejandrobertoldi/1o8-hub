"use client";

import { useState } from "react";
import { parseEditNote, parseSuggestion, suggestionStatus, wordDiff } from "@/lib/seo/revision-edit";

/** An edit note shown as a word diff: removed words struck through in red, added words in green. */
function EditDiff({ by, before, after, heading }: { by?: string; before: string; after: string; heading?: string }) {
  return (
    <div className="mt-1 space-y-1">
      <p className="font-semibold">{heading ?? `✎ Edited by ${by}`}</p>
      <p className="leading-relaxed">
        {wordDiff(before, after).map((p, i) =>
          p.op === "del" ? <del key={i} className="rounded bg-red-500/15 text-red-400 line-through decoration-red-400">{p.text}</del>
          : p.op === "add" ? <ins key={i} className="rounded bg-emerald-500/15 text-emerald-400 no-underline">{p.text}</ins>
          : <span key={i}>{p.text}</span>)}
      </p>
      <p className="text-[10px] text-muted-foreground">{before.length} → {after.length} chars</p>
    </div>
  );
}

export interface ThreadComment { id: string; authorName: string | null; body: string; createdAt: string; resolved: boolean; audience?: string }

const SUGGESTION_LABEL = { open: "Pending review", accepted: "✓ Accepted", declined: "Declined" } as const;

export function CommentThread({ comments, onAdd, onResolve, allowAudience, readOnly, currentText, onAcceptSuggestion, onDeclineSuggestion }: {
  comments: ThreadComment[];
  /** The field's current text — tells an accepted suggestion from a declined one. */
  currentText?: string;
  /** Hub only: act on a client's suggested edit. */
  onAcceptSuggestion?: (id: string) => Promise<void>;
  onDeclineSuggestion?: (id: string) => Promise<void>;
  onAdd: (body: string, audience?: "internal" | "client") => Promise<void>;
  onResolve?: (id: string, resolved: boolean) => Promise<void>;
  allowAudience: boolean;
  readOnly: boolean;
}) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"internal" | "client">("internal");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments on this field yet.</p>}
      {comments.map((c) => (
        <div key={c.id} className={`rounded-lg border border-border p-2 text-xs ${c.resolved && !parseEditNote(c.body) && !parseSuggestion(c.body) ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{c.authorName ?? "—"}{c.audience === "client" && allowAudience ? " · visible to client" : ""}</span>
            {onResolve && !parseSuggestion(c.body) && (
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={c.resolved} onChange={(e) => void onResolve(c.id, e.target.checked)} /> Resolved
              </label>
            )}
          </div>
          {(() => {
            const edit = parseEditNote(c.body);
            if (edit) return <EditDiff {...edit} />;
            const sg = parseSuggestion(c.body);
            if (!sg) return <p className="mt-1 whitespace-pre-wrap">{c.body}</p>;
            const st = suggestionStatus(c.resolved, sg.after, currentText);
            return (
              <>
                <EditDiff heading="✎ Suggested edit" before={sg.before} after={sg.after} />
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${st === "accepted" ? "text-emerald-500" : st === "declined" ? "text-muted-foreground" : "text-amber-500"}`}>{SUGGESTION_LABEL[st]}</span>
                  {st === "open" && onAcceptSuggestion && (
                    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onAcceptSuggestion(c.id); } finally { setBusy(false); } }}
                      className="ml-auto rounded-lg bg-[#ff9900] px-2 py-0.5 text-[10px] font-bold text-black disabled:opacity-40">Accept</button>
                  )}
                  {st === "open" && onDeclineSuggestion && (
                    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onDeclineSuggestion(c.id); } finally { setBusy(false); } }}
                      className="rounded-lg border border-border px-2 py-0.5 text-[10px] font-bold disabled:opacity-40">Decline</button>
                  )}
                </div>
              </>
            );
          })()}
          <p className="mt-1 text-[10px] text-muted-foreground">{c.createdAt.slice(0, 10)}</p>
        </div>
      ))}
      {!readOnly && (
        <form className="space-y-1" onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          try { await onAdd(text.trim(), allowAudience ? audience : undefined); setText(""); } finally { setBusy(false); }
        }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Add a comment…" className="w-full rounded-lg border border-border bg-background p-2 text-xs" />
          <div className="flex items-center justify-between">
            {allowAudience ? (
              <select value={audience} onChange={(e) => setAudience(e.target.value as "internal" | "client")} className="rounded border border-border bg-background px-1 text-[10px]">
                <option value="internal">Internal only</option>
                <option value="client">Visible to client</option>
              </select>
            ) : <span />}
            <button type="submit" disabled={busy || !text.trim()} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold disabled:opacity-50">Comment</button>
          </div>
        </form>
      )}
    </div>
  );
}
