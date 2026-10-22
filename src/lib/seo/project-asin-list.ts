// Per-project list of targeted ASINs for project cards (CoverageRow view):
// parentage, ASIN, the matching catalog product (ASIN+SKU wins) and its title.
import { pickProductByAsin } from "./pick-product-by-asin";

export interface ProjectAsin { asin: string; sku: string; parentage_level: string | null; product_id: string | null; title: string | null }

const rank = (p: string | null) => ((p ?? "").toLowerCase() === "parent" ? 0 : 1);

export function projectAsinList(
  rows: Array<{ projectId: string; asin: string; sku: string; parentageLevel: string | null }>,
  products: Array<{ id: string; asin: string | null; sku: string | null; summarizedTitle: string | null; itemName: string | null }>,
): Map<string, ProjectAsin[]> {
  const byProject = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byProject.get(r.projectId) ?? [];
    if (!list.some((x) => x.asin === r.asin && x.sku === r.sku)) list.push(r);
    byProject.set(r.projectId, list);
  }
  const out = new Map<string, ProjectAsin[]>();
  for (const [projectId, list] of byProject) {
    const picked = pickProductByAsin(products, list);
    out.set(projectId, list
      .map((r) => {
        const p = picked.get(r.asin);
        return { asin: r.asin, sku: r.sku, parentage_level: r.parentageLevel, product_id: p?.id ?? null, title: p ? (p.summarizedTitle || p.itemName) : null };
      })
      .sort((a, b) => rank(a.parentage_level) - rank(b.parentage_level) || a.asin.localeCompare(b.asin)));
  }
  return out;
}

/**
 * projectAsinList for projects of several clients: catalog products are matched within each
 * project's own client (the same ASIN can exist under two clients).
 */
export function projectAsinListByClient(
  projects: Array<{ id: string; clientIdCode: string | null }>,
  rows: Array<{ projectId: string; asin: string; sku: string; parentageLevel: string | null }>,
  products: Array<{ id: string; clientIdCode: string | null; asin: string | null; sku: string | null; summarizedTitle: string | null; itemName: string | null }>,
): Map<string, ProjectAsin[]> {
  const clientOf = new Map(projects.map((p) => [p.id, p.clientIdCode ?? ""]));
  const out = new Map<string, ProjectAsin[]>();
  for (const code of new Set(clientOf.values())) {
    const mine = projectAsinList(rows.filter((r) => clientOf.get(r.projectId) === code), products.filter((p) => (p.clientIdCode ?? "") === code));
    for (const [k, v] of mine) out.set(k, v);
  }
  return out;
}
