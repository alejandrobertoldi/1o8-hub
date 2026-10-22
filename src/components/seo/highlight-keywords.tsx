import { Fragment, type ReactElement } from "react";

// Keyword highlighting shared by S6 (batch tables) and the revision review preview.

/** S2 keyword rows → lowercase keyword text → tier (first occurrence wins). */
export function keywordTierMap(keywords: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keywords as Array<Record<string, unknown>>) {
    const text = String(k.KeywordText || "").toLowerCase();
    if (text.length <= 1 || m.has(text)) continue;
    m.set(text, Number(String(k.KeywordPriorityTier ?? "").replace("T", "")) || Number(k.KeywordTier) || 4);
  }
  return m;
}

/** Keywords in red (whole-word, longest match first); restricted/compliance words in blue. `light` = darker shades for white backgrounds. */
export function highlightKeywords(text: string, kwMap: Map<string, number>, restrictedSet?: Set<string>, light = false): ReactElement {
  if (!text) return <>{text}</>;
  // Build combined token list: restricted words + keywords, longest first
  const allTokens: { word: string; type: "kw" | "restricted" }[] = [];
  if (kwMap.size > 0) {
    [...kwMap.keys()].forEach((k) => allTokens.push({ word: k, type: "kw" }));
  }
  if (restrictedSet && restrictedSet.size > 0) {
    [...restrictedSet].forEach((r) => {
      if (!allTokens.find((t) => t.word === r)) allTokens.push({ word: r, type: "restricted" });
    });
  }
  if (allTokens.length === 0) return <>{text}</>;
  allTokens.sort((a, b) => b.word.length - a.word.length);
  const escaped = allTokens.map((t) => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![a-zA-Z])(${escaped.join("|")})(?![a-zA-Z])`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase();
        if (restrictedSet && restrictedSet.has(lower)) {
          return <mark key={i} className={`${light ? "text-blue-700" : "text-blue-400"} font-semibold`} style={{ background: "none" }} title="Restricted/compliance word">{part}</mark>;
        }
        const tier = kwMap.get(lower);
        if (tier !== undefined) {
          return <mark key={i} className={`${light ? "text-red-600" : "text-red-400"} font-medium bg-transparent`} style={{ backgroundColor: "transparent" }} title={`Tier ${tier}`}>{part}</mark>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
