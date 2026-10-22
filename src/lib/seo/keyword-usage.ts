// Keyword tables (S6.2–S6.5) all show the same usage columns in the same order:
// Title · Item Highlight · Bullets · Description · Backend — minus the step's own column(s), which
// sit at the right of the table. Usage is worked out live from the current S6 text, so when a later
// step is generated (e.g. Bullets), every other table's matching column updates on its own.
// "Bullets" = any of BP1–BP5.
export type PriorCol = "Title" | "ItemHighlight" | "Bullets" | "ProductDescription" | "BackendSearchTerms";

export const USAGE_COLS: PriorCol[] = ["Title", "ItemHighlight", "Bullets", "ProductDescription", "BackendSearchTerms"];
const OWN: Record<string, PriorCol[]> = {
  titles: ["Title", "ItemHighlight"],
  bullets: ["Bullets"],
  description: ["ProductDescription"],
  backend: ["BackendSearchTerms"],
};
const BULLETS = [1, 2, 3, 4, 5].map((n) => `DetailedBulletPoint_${n}`);

export function priorUsageCols(batch: string): PriorCol[] {
  const own = OWN[batch] ?? [];
  return USAGE_COLS.filter((c) => !own.includes(c));
}

export function usedInPrior(rows: Array<Record<string, unknown>>, col: PriorCol, keyword: string): boolean {
  const cols = col === "Bullets" ? BULLETS : [col];
  const key = keyword.toLowerCase();
  return rows.some((r) => cols.some((c) => String(r[c] ?? "").toLowerCase().includes(key)));
}

/** First-column tick = "in this step's text after your pending changes": used rows start ticked,
 *  unticking one marks it for removal; unused rows start unticked, ticking one marks it to add. */
export function willBeUsed(used: boolean, pendingChange: boolean): boolean {
  return used !== pendingChange;
}

/** Header tick-all / untick-all: the pending changes that make every shown row ticked (or none). */
export function pendingForAll(rows: { key: string; used: boolean }[], tickAll: boolean): { add: string[]; remove: string[]; clearAdd: string[]; clearRemove: string[] } {
  const used = rows.filter((r) => r.used).map((r) => r.key);
  const unused = rows.filter((r) => !r.used).map((r) => r.key);
  return tickAll
    ? { add: unused, remove: [], clearAdd: [], clearRemove: used }
    : { add: [], remove: used, clearAdd: unused, clearRemove: [] };
}
