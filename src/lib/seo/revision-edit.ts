// Editing a revision's text in place during staff review (PM / AM). The edit
// changes the revision (what gets approved and pushed) and S6's own copy
// (seo_asins.generatedContent) together, and is logged as an internal note in
// that field's comment thread.

const EDITABLE: readonly string[] = ["pm_review", "am_review"];

export function canEditRevision(status: string): boolean {
  return EDITABLE.includes(status);
}

/** S6's stored row with one field replaced and its _CharLength / _ByteLength recomputed when present. */
export function withEditedField(gc: unknown, key: string, value: string): Record<string, unknown> {
  const out: Record<string, unknown> = gc && typeof gc === "object" ? { ...(gc as Record<string, unknown>) } : {};
  out[key] = value;
  if (`${key}_CharLength` in out) out[`${key}_CharLength`] = value.length;
  if (`${key}_ByteLength` in out) out[`${key}_ByteLength`] = new TextEncoder().encode(value).length;
  return out;
}

export function editNote(label: string, before: string, after: string, by: string): string {
  return `✎ Edited by ${by}\nBefore: "${before}"\nAfter: "${after}"`;
}

/** Reads an edit note (see editNote) back into its parts; null for ordinary comments. */
export function parseEditNote(body: string): { by: string; before: string; after: string } | null {
  const m = /^✎ Edited by (.+)\nBefore: "([\s\S]*)"\nAfter: "([\s\S]*)"$/.exec(body);
  return m ? { by: m[1], before: m[2], after: m[3] } : null;
}

/** Word-level diff (LCS over words + the spaces after them). */
export function wordDiff(before: string, after: string): { op: "same" | "del" | "add"; text: string }[] {
  const a = before.match(/\S+\s*|\s+/g) ?? [];
  const b = after.match(/\S+\s*|\s+/g) ?? [];
  const key = (t: string) => t.trimEnd();
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: { op: "same" | "del" | "add"; text: string }[] = [];
  const push = (op: "same" | "del" | "add", text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text; else out.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) { push("same", b[j]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

/** A client's suggested edit, stored as a client-visible comment until the team accepts or declines it. */
export function suggestionNote(before: string, after: string): string {
  return `✎ Suggested edit\nBefore: "${before}"\nAfter: "${after}"`;
}

export function parseSuggestion(body: string): { before: string; after: string } | null {
  const m = /^✎ Suggested edit\nBefore: "([\s\S]*)"\nAfter: "([\s\S]*)"$/.exec(body);
  return m ? { before: m[1], after: m[2] } : null;
}

/** Open until resolved; a resolved suggestion was accepted if the field now holds its text, otherwise declined. */
export function suggestionStatus(resolved: boolean, suggested: string, current: string | undefined): "open" | "accepted" | "declined" {
  if (!resolved) return "open";
  return (current ?? "").trim() === suggested.trim() ? "accepted" : "declined";
}

/** Two revision contents ({ asin: { field: text } }) hold the same text — key order and outer spaces ignored. */
export function sameContent(a: Record<string, Record<string, string>>, b: Record<string, Record<string, string>>): boolean {
  const norm = (c: Record<string, Record<string, string>>) =>
    JSON.stringify(Object.keys(c).sort().map((asin) => [asin, Object.keys(c[asin]).sort().map((k) => [k, String(c[asin][k] ?? "").trim()])]));
  return norm(a) === norm(b);
}

/**
 * The revision S6.9 shows: the newest, unless it is a closed duplicate (changes requested with exactly
 * the approved text) — then the approved current revision. Revisions are newest first.
 */
export function displayRevisionId(revisions: Array<{ id: string; status: string; isCurrent: boolean; content: unknown }>): string | null {
  const newest = revisions[0];
  if (!newest) return null;
  const current = revisions.find((r) => r.isCurrent);
  if (newest.status === "changes_requested" && current && current.id !== newest.id && newest.content && current.content
    && sameContent(newest.content as Record<string, Record<string, string>>, current.content as Record<string, Record<string, string>>)) return current.id;
  return newest.id;
}
