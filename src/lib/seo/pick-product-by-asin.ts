// One catalog row per ASIN for an SEO project. An ASIN can have several product
// rows (e.g. an FBA and a merchant SKU); the project records which SKU it is
// for in seo_asins.sku, so that row wins. Without a SKU match the lowest id is
// used, so the choice never depends on the order the database returns rows in.

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function pickProductByAsin<P extends { id: string; asin: string | null; sku?: string | null }>(
  products: P[],
  projectSkus: { asin: string; sku: string | null }[],
): Map<string, P> {
  const wanted = new Map(projectSkus.map((r) => [r.asin, norm(r.sku)]));
  const out = new Map<string, P>();
  for (const p of [...products].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!p.asin) continue;
    const cur = out.get(p.asin);
    const want = wanted.get(p.asin);
    const matches = !!want && norm(p.sku) === want;
    if (!cur || (matches && norm(cur.sku) !== want)) out.set(p.asin, p);
  }
  return out;
}
