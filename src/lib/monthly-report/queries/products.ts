import { queryRedshift } from "@/lib/redshift";

export interface RawProductRow {
  asin: string;
  parent_asin: string | null;
  title: string | null;
  sku: string | null;
  sessions: number;
  units: number;
  sales: number;
  order_items: number;
  buy_box: number | null;
}

export async function fetchProductRows(
  accountId: string,
  start: string,
  end: string,
): Promise<RawProductRow[]> {
  const rows = await queryRedshift<Record<string, unknown>>(
    `
    SELECT
      product                                        AS asin,
      MAX(product_title)                             AS title,
      MAX(sku)                                       AS sku,
      SUM(browser_session + mobile_app_session)      AS sessions,
      -- ordered_units is unused in Intentwise (always NULL). Units live in
      -- product_quantity, the same column account_summary + inventory use.
      COALESCE(SUM(product_quantity), 0)             AS units,
      SUM(product_sales)                             AS sales,
      SUM(total_order_items)                         AS order_items,
      AVG(buy_box_prcntg)                            AS buy_box
    FROM intentwise_ecommerce_graph.product_summary
    WHERE account_id = $1
      AND report_date BETWEEN $2 AND $3
    GROUP BY product
    `,
    [accountId, start, end],
  );
  return rows.map((r) => ({
    asin: String(r.asin ?? ""),
    parent_asin: null,
    title: r.title ? String(r.title) : null,
    sku: r.sku ? String(r.sku) : null,
    sessions: Number(r.sessions ?? 0),
    units: Number(r.units ?? 0),
    sales: Number(r.sales ?? 0),
    order_items: Number(r.order_items ?? 0),
    buy_box: r.buy_box == null ? null : Number(r.buy_box),
  }));
}
