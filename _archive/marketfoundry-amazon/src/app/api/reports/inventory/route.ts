import { NextRequest, NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";
import { getEffectiveAccountId } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = (await getEffectiveAccountId(req)) ?? "";

  if (!accountId)
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  // Fecha máxima
  const maxDateRows = await queryRedshift(
    `SELECT TO_CHAR(MAX(report_date)::date, 'YYYY-MM-DD') AS max_date
     FROM amazon_source_data.sellercentral_restockinventory_report
     WHERE account_id = $1`,
    [accountId]
  );

  const maxDate = maxDateRows[0]?.max_date
    ? String(maxDateRows[0].max_date)
    : null;

  if (!maxDate) return NextResponse.json({ items: [], maxDate: null });

  const sql = `
    SELECT
      r.asin,
      r.product_name,
      r.available,
      r.inbound,
      r.fc_transfer,
      r.fc_processing,
      r.customer_order,
      r.unfulfillable,
      r.total_units,
      r.units_sold_last_30_days,
      r.sales_last_30_days,
      r.days_of_supply,
      r.total_days_of_supply,
      r.days_of_supply_at_amazon,
      r.recommended_replenishment_qty,
      r.recommended_ship_date,
      r.utilization,
      r.maximum_shipment_quantity,
      r.alert,
      r.working,
      r.shipped,
      r.receiving,
      r.unit_storage_size,
      i.link,
      l.status
    FROM amazon_source_data.sellercentral_restockinventory_report r
    LEFT JOIN (
      SELECT asin, account_id, MIN(link) AS link
      FROM amazon_source_data.catalog_item_images
      WHERE variant = 'MAIN'
      GROUP BY asin, account_id
    ) i
      ON r.asin = i.asin
      AND i.account_id = r.account_id
    LEFT JOIN (
      SELECT asin1, account_id, MIN(status) AS status
      FROM amazon_source_data.sellercentral_alllistings_report
      GROUP BY asin1, account_id
    ) l
      ON r.asin = l.asin1
      AND l.account_id = r.account_id
    WHERE r.account_id = $1
      AND r.report_date::date = '${maxDate}'::date
    ORDER BY r.product_name ASC
  `;

  const rows = await queryRedshift(sql, [accountId]);

  const items = rows.map((r: Record<string, unknown>) => ({
    asin:                    String(r.asin ?? ""),
    product_name:            String(r.product_name ?? ""),
    // NOT Redshift columns — sellercentral_restockinventory_report has no
    // variation_name/flavor/size. Projecting them made the whole query fail with
    // 42703, which queryRedshift swallowed into [] behind a 200 (see
    // route.sql-columns.test.ts). Kept as "" so the response shape and
    // InventoryItem stay unchanged; buildAxisLabel falls back to product_name.
    variation_name:          String(r.variation_name ?? ""),
    flavor:                  String(r.flavor ?? ""),
    size:                    String(r.size ?? ""),
    link:                    r.link ? String(r.link) : null,
    status:                  r.status ? String(r.status) : "",
    alert:                   r.alert ? String(r.alert) : "",
    available:               Number(r.available ?? 0),
    inbound:                 Number(r.inbound ?? 0),
    fc_transfer:             Number(r.fc_transfer ?? 0),
    fc_processing:           Number(r.fc_processing ?? 0),
    customer_order:          Number(r.customer_order ?? 0),
    unfulfillable:           Number(r.unfulfillable ?? 0),
    total_units:             Number(r.total_units ?? 0),
    units_sold_30:           Number(r.units_sold_last_30_days ?? 0),
    sales_30:                Number(r.sales_last_30_days ?? 0),
    days_of_supply:          Number(r.days_of_supply ?? 0),
    total_days_of_supply:    Number(r.total_days_of_supply ?? 0),
    days_of_supply_at_amazon: Number(r.days_of_supply_at_amazon ?? 0),
    recommended_replenishment_qty: Number(r.recommended_replenishment_qty ?? 0),
    recommended_ship_date:   r.recommended_ship_date ? String(r.recommended_ship_date).slice(0, 10) : null,
    utilization:             Number(r.utilization ?? 0),
    maximum_shipment_qty:    Number(r.maximum_shipment_quantity ?? 0),
    working:                 Number(r.working ?? 0),
    shipped:                 Number(r.shipped ?? 0),
    receiving:               Number(r.receiving ?? 0),
    unit_storage_size:       Number(r.unit_storage_size ?? 0),
  }));

  return NextResponse.json({ items, maxDate });
}