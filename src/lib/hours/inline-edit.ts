/**
 * Pure decision logic for inline editing of logged hours rows.
 * No React, no DOM — all of this is unit-tested.
 */

import { normalizeRange } from "./validation";

export type ApiEntry = {
  id: string;
  userId: string;
  clientIdCode: string;
  entryDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string | null;
  category: string | null;
};

export type DraftStatus = "editing" | "saving" | "error";

export type Draft = {
  clientIdCode: string;
  category: string;
  startTime: string;
  endTime: string;
  note: string;
  status: DraftStatus;
  error?: string;
  /** Pre-edit row, used to roll the cache back on failure. */
  snapshot: ApiEntry;
};

export function draftFromEntry(entry: ApiEntry): Draft {
  return {
    clientIdCode: entry.clientIdCode,
    category: entry.category ?? "",
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note ?? "",
    status: "editing",
    snapshot: entry,
  };
}

export function isDraftDirty(draft: Draft): boolean {
  const s = draft.snapshot;
  return (
    draft.clientIdCode !== s.clientIdCode ||
    draft.category !== (s.category ?? "") ||
    draft.startTime !== s.startTime ||
    draft.endTime !== s.endTime ||
    draft.note.trim() !== (s.note ?? "").trim()
  );
}

export function isDraftValid(draft: Draft): { ok: true } | { ok: false; error: string } {
  if (!draft.clientIdCode) return { ok: false, error: "Pick a client" };
  const r = normalizeRange({ startTime: draft.startTime, endTime: draft.endTime });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

/**
 * Optimistic cache patch. `hours` is recomputed locally so the row and the
 * day total update before the request resolves; an invalid range freezes the
 * row entirely rather than caching times that contradict `hours`.
 */
export function applyDraftToRows(rows: ApiEntry[], id: string, draft: Draft): ApiEntry[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const r = normalizeRange({ startTime: draft.startTime, endTime: draft.endTime });
    // An invalid range cannot produce a coherent row: freeze it entirely rather
    // than caching times that contradict `hours`.
    if (!r.ok) return row;
    const note = draft.note.trim();
    const category = draft.category.trim();
    return {
      ...row,
      clientIdCode: draft.clientIdCode,
      category: category === "" ? null : category,
      startTime: r.range.startTime,
      endTime: r.range.endTime,
      hours: r.range.hours,
      note: note === "" ? null : note,
    };
  });
}

/** Authoritative patch with the row the server returned. */
export function applyServerEntry(rows: ApiEntry[], entry: ApiEntry): ApiEntry[] {
  return rows.map((row) => (row.id === entry.id ? entry : row));
}
