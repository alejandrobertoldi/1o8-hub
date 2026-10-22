// Splits a summarized title ("ReadyRESCUE | 30 g (Pack of 12)") into the product
// name and the variation, at the FIRST "|". Used by <SummarizedTitle>.
export function splitSummarizedTitle(title: string | null | undefined): { name: string; variant: string } | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  const cut = t.indexOf("|");
  if (cut < 0) return { name: t, variant: "" };
  const name = t.slice(0, cut).trim();
  const variant = t.slice(cut + 1).trim();
  return name ? { name, variant } : { name: variant, variant: "" };
}
