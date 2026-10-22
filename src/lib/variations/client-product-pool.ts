// Pure helpers for the Variation Builder product pool.
// Kept out of the page component so they are unit-testable and shared.

export type PoolProduct = {
  id: string;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  mainImageUrl: string | null;
  variationId: string | null;
  variationGroup: string | null;
  parentageLevel: string | null;
  status: string | null;
  variations: Record<string, string | undefined> | null;
  rawColumnValues: Record<string, string> | null;
  varietyPackItemCount?: number;
  vpFlavors?: string[] | null;
  isVp?: boolean;
};

export const POOL_CAP = 2000;
export const POOL_PAGE_SIZE = 100; // matches the /api/products hard cap

/**
 * Fetch every product for a client by paging through /api/products until
 * `total` is reached (or `cap`). Returns the full in-memory pool so the
 * builder can filter and "select all matching" across the entire catalog.
 */
export async function fetchAllClientProducts(
  clientId: string,
  opts?: { search?: string; cap?: number; signal?: AbortSignal },
): Promise<{ products: PoolProduct[]; total: number; capped: boolean }> {
  const cap = opts?.cap ?? POOL_CAP;
  const products: PoolProduct[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const params = new URLSearchParams({
      client: clientId,
      pageSize: String(POOL_PAGE_SIZE),
      page: String(page),
      includeInactive: "true",
    });
    if (opts?.search) params.set("search", opts.search);

    const res = await fetch(`/api/products?${params}`, { signal: opts?.signal });
    if (!res.ok) throw new Error("Failed to load products");
    const json = await res.json();
    total = json.pagination.total as number;
    const batch = json.data as PoolProduct[];
    products.push(...batch);

    if (batch.length === 0 || products.length >= total || products.length >= cap) break;
    page += 1;
  }

  const capped = total > cap;
  return { products: capped ? products.slice(0, cap) : products, total, capped };
}

/** Extract a sortable/filterable string value from a product by column key. */
export function getColValue(p: PoolProduct, col: string): string {
  switch (col) {
    case "asin": return p.asin ?? "";
    case "sku": return p.sku ?? "";
    case "status": return p.status ?? "";
    case "title": return p.itemName ?? "";
    case "varId": return p.variationId ?? "";
    case "group": return p.variationGroup ?? "";
    case "theme": return p.variations?.VariationThemeName ?? "";
    case "parentage": return p.parentageLevel ?? "";
    default: return p.variations?.[col] ?? ""; // theme attr keys
  }
}
