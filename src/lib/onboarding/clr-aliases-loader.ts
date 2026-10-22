import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import type { Alias } from "./clr-attribute-aliases";

interface AttrRow {
  generalLabel: string;
  scLabel: string | null;
  scLabelMulti: string | null;
}

/**
 * Convert a row's sc_label literal (with {MP}/{LANG} placeholders) into a
 * regex. Mirrors the working `scLabelToRegex` in
 * `scripts/backfill-0047-category-meta.ts` (Task 5): the standard regex
 * specials AND `{`, `}`, `\` are escaped first, which leaves the placeholder
 * tokens as `\{MP\}` / `\{LANG\}` for the second-pass substitution to match.
 *
 * (The original Task 8 spec omitted `{`, `}`, `\` from the escape set, which
 * meant the placeholder substitution silently no-op'd and the resulting regex
 * only matched the literal `{MP}` / `{LANG}` placeholders — verified
 * empirically before writing this code. Aligning with Task 5's already-
 * shipped, prod-validated version.)
 *
 * Pure function — easy to unit-test without a DB.
 */
function compilePattern(scLabel: string): RegExp {
  const escaped = scLabel
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    .replace(/\\\{MP\\\}/g, "[^\\]]+")
    .replace(/\\\{LANG\\\}/g, "[^\\]]+");
  return new RegExp(`^${escaped}$`);
}

export function aliasesFromRows(rows: AttrRow[]): Alias[] {
  const out: Alias[] = [];
  for (const r of rows) {
    if (!r.scLabel) continue;
    out.push({
      bqName: r.generalLabel,
      patterns: [compilePattern(r.scLabel)],
      multi: r.scLabelMulti === "concat" ? "concat" : "first",
    });
  }
  return out;
}

export async function loadClrAliases(): Promise<Alias[]> {
  const rows = await db
    .select({
      generalLabel: attributes.generalLabel,
      scLabel: attributes.scLabel,
      scLabelMulti: attributes.scLabelMulti,
    })
    .from(attributes)
    .where(isNotNull(attributes.scLabel));
  return aliasesFromRows(rows);
}
