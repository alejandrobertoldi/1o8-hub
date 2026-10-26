/**
 * Two-way merge for one cell of the AAC sheet against the hub (pure).
 *
 * `base` is the value both sides agreed on at the last sync. Whichever side
 * moved away from it wins; if both moved, the conflict goes to `prefer`
 * (the hub by default — it is the source of truth while the sheet is being
 * retired — or the sheet when the call comes from the sheet's own edit hook,
 * because that edit is the newest). With no base yet (first sync), a field the
 * hub has an edit log for keeps the hub's value; otherwise the sheet's.
 */
export type CellDecision =
  | { action: "none" }
  | { action: "toHub"; value: string; conflict?: boolean }
  | { action: "toSheet"; value: string; conflict?: boolean };

export type MergeInput = {
  sheet: string;
  hub: string;
  /** Last agreed value; undefined = never synced. */
  base: string | undefined;
  prefer?: "hub" | "sheet";
  /** First sync only: the hub has a logged edit for this field. */
  hubEdited?: boolean;
};

const norm = (v: string) => v.replace(/\r\n/g, "\n").trim();

export function mergeCell({ sheet, hub, base, prefer = "hub", hubEdited = false }: MergeInput): CellDecision {
  const s = norm(sheet);
  const h = norm(hub);
  if (s === h) return { action: "none" };

  if (base === undefined) {
    return hubEdited ? { action: "toSheet", value: h } : { action: "toHub", value: s };
  }
  const b = norm(base);
  if (h === b) return { action: "toHub", value: s };
  if (s === b) return { action: "toSheet", value: h };
  return prefer === "sheet" ? { action: "toHub", value: s, conflict: true } : { action: "toSheet", value: h, conflict: true };
}
