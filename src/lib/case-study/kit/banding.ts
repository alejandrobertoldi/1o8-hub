/**
 * High-Level decks never show private absolute $ figures (Template Instructions §1).
 * N = digit count of floor(usd); L = usd / 10^(N-1). Low < 4 ≤ Mid < 7 ≤ High (COPYWRITING.md §8).
 */
export function bandFigure(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "n/a";
  if (usd < 1000) return "<4-Fig";
  const n = Math.floor(usd).toString().length;
  const lead = usd / 10 ** (n - 1);
  const tier = lead < 4 ? "Low" : lead < 7 ? "Mid" : "High";
  return `${tier} ${n}-Fig`;
}
