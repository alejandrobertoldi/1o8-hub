"use client";

import { useEffect, useState } from "react";

/** Edit a revision field on the spot (shown above that field's comments in the review). */
export function FieldEditor({ value, max, bytes = false, hard = false, mode = "edit", onSave }: {
  value: string;
  /** Character (or byte) limit shown next to the count; over it turns red. */
  max?: number;
  bytes?: boolean;
  /** Character limit is a hard limit (bullets): over = can't save. Byte limits are always hard. */
  hard?: boolean;
  /** "suggest": the client proposes a change; the team accepts or declines it. */
  mode?: "edit" | "suggest";
  onSave: (next: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(value); }, [value]);
  const n = bytes ? new TextEncoder().encode(text).length : text.length;
  const over = max !== undefined && n > max;
  const dirty = text.trim() !== value.trim() && text.trim().length > 0;
  // Byte limits (backend search terms) are hard Amazon limits: over = can't save. Character limits only warn.
  const blocked = (bytes || hard) && over;

  return (
    <div className="mb-3 space-y-1.5 border-b border-border pb-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{mode === "suggest" ? "Suggest an edit" : "Edit text"}</p>
      <textarea aria-label="Edit text" value={text} onChange={(e) => setText(e.target.value)} rows={Math.max(2, Math.ceil(text.length / 110))}
        className="w-full rounded-lg border border-border bg-background p-2 text-xs leading-relaxed" />
      <div className="flex items-center gap-2">
        <span className={`text-[10px] tabular-nums ${over ? "font-bold text-red-500" : "text-muted-foreground"}`}>
          {max !== undefined ? `${n} / ${max}` : `${n}`}{bytes ? " bytes" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground">{mode === "suggest" ? "Our team reviews your suggestion before it changes the text." : "Saving updates this revision and S6, and logs the change below."}</span>
        <button type="button" onClick={() => setText(value)} disabled={!dirty || saving}
          className="ml-auto rounded-lg border border-border px-2 py-1 text-[10px] disabled:opacity-40">Reset</button>
        {blocked && <span className="text-[10px] font-bold text-red-500">Over the {max}-{bytes ? "byte" : "character"} limit — shorten to save</span>}
        <button type="button" aria-label={mode === "suggest" ? "Send suggestion" : "Save edit"} disabled={!dirty || saving || blocked}
          onClick={async () => { setSaving(true); try { await onSave(text.trim()); } finally { setSaving(false); } }}
          className="rounded-lg bg-[#ff9900] px-2.5 py-1 text-[10px] font-bold text-black disabled:opacity-40">{saving ? "Saving…" : mode === "suggest" ? "Send suggestion" : "Save edit"}</button>
      </div>
    </div>
  );
}
