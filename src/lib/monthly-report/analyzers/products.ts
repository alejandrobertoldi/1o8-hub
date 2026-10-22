import type { ProductRow, ProductsResult } from "../types";
import type { RawProductRow } from "../queries/products";

export function analyzeProducts(rows: RawProductRow[]): ProductsResult | null {
  if (rows.length === 0) return null;

  const shaped: ProductRow[] = rows.map((r) => ({
    asin: r.asin,
    parent: r.parent_asin ?? "",
    title: r.title ?? "",
    sku: r.sku ?? "",
    sessions: r.sessions,
    units: r.units,
    sales: r.sales,
    orderItems: r.order_items,
    cvr: r.sessions > 0 ? (r.units / r.sessions) * 100 : null,
    buyBox: r.buy_box,
    aov: r.order_items > 0 ? r.sales / r.order_items : null,
  }));

  shaped.sort((a, b) => b.sales - a.sales);
  return { rows: shaped, nTotal: shaped.length };
}
