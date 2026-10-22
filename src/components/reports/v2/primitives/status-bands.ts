export type Band = "good" | "warn" | "bad" | "none";

/** ROAS bands per spec §9: good ≥4.0, warn 2.0–3.99, bad <2.0, none for 0/null. */
export function classifyRoas(roas: number | null): Band {
  if (roas === null || roas === 0) return "none";
  if (roas >= 4.0) return "good";
  if (roas >= 2.0) return "warn";
  return "bad";
}

/** ACoS bands per spec §9, input in percent points: good ≤25, warn 25–60, bad >60, none for null. */
export function classifyAcos(acosPct: number | null): Band {
  if (acosPct === null) return "none";
  if (acosPct <= 25) return "good";
  if (acosPct <= 60) return "warn";
  return "bad";
}
