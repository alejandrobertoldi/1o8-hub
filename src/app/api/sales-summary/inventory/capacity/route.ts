// FBA capacity usage per storage type for the inventory table's Capacity panel.
// Restock Inventory report (latest day per account) × storage type from the
// storage-fees report. Limits live in Seller Central only — not returned here.
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData } from "@/lib/sales-cache";
import { isHubStaff } from "@/lib/roles";
import { todayIso } from "@/lib/inventory/rec-settings";
import { storageTypeOf, summarizeCapacity, type CapacityResponse, type CapacityRow, type StorageType } from "@/lib/inventory/capacity";

export const maxDuration = 120;

const SCHEMA = "amazon_source_data";
const RESTOCK = `"${SCHEMA}"."sellercentral_restockinventory_report"`;
const FEES = `"${SCHEMA}"."sellercentral_fbastoragefees_report"`;
const CACHE_TYPE = "inventory-capacity";

interface RestockRow {
  merchant_sku: string; asin: string; unit_storage_size: string | null; report_day: string;
  available: number; fc_transfer: number; fc_processing: number; customer_order: number; unfulfillable: number;
  working: number; shipped: number; receiving: number;
}
interface TierRow { asin: string; product_size_tier: string | null; dangerous_goods_storage_type: string | null }

export function parseAccountIds(raw: string | null): string[] | null {
  const ids = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 && ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ids = parseAccountIds(req.nextUrl.searchParams.get("accountIds"));
  if (!ids) return NextResponse.json({ error: "Invalid accountIds" }, { status: 400 });
  const idList = ids.join(",");
  const cacheKey = `v1|${[...ids].sort().join(",")}|${todayIso()}`;
  try {
    const cached = await getCachedData<CapacityResponse>(CACHE_TYPE, cacheKey);
    if (cached) return NextResponse.json(cached);
  } catch (e) {
    console.error("[inventory/capacity] cache read failed", e);
  }

  let body: CapacityResponse;
  try {
    const [restock, tiers] = await Promise.all([
      queryRedshift<RestockRow>(`
        SELECT r.merchant_sku, r.asin, r.unit_storage_size, TO_CHAR(r.report_date, 'YYYY-MM-DD') AS report_day,
          COALESCE(r.available, 0) AS available, COALESCE(r.fc_transfer, 0) AS fc_transfer,
          COALESCE(r.fc_processing, 0) AS fc_processing, COALESCE(r.customer_order, 0) AS customer_order,
          COALESCE(r.unfulfillable, 0) AS unfulfillable, COALESCE(r.working, 0) AS working,
          COALESCE(r.shipped, 0) AS shipped, COALESCE(r.receiving, 0) AS receiving
        FROM ${RESTOCK} r
        INNER JOIN (
          SELECT account_id, MAX(report_date) AS d FROM ${RESTOCK} WHERE account_id IN (${idList}) GROUP BY account_id
        ) l ON l.account_id = r.account_id AND l.d = r.report_date
        WHERE r.account_id IN (${idList})
      `),
      queryRedshift<TierRow>(`
        SELECT f.asin, f.product_size_tier, f.dangerous_goods_storage_type
        FROM ${FEES} f
        INNER JOIN (
          SELECT asin, MAX(month_of_charge) AS m FROM ${FEES} WHERE account_id IN (${idList}) GROUP BY asin
        ) l ON l.asin = f.asin AND l.m = f.month_of_charge
        WHERE f.account_id IN (${idList})
      `),
    ]);
    const typeByAsin = new Map<string, StorageType>();
    for (const t of tiers) if (!typeByAsin.has(t.asin)) typeByAsin.set(t.asin, storageTypeOf(t.product_size_tier, t.dangerous_goods_storage_type));
    const rows: CapacityRow[] = restock.map((r) => ({
      sku: r.merchant_sku, asin: r.asin, unitStorageSize: r.unit_storage_size,
      available: Number(r.available), fcTransfer: Number(r.fc_transfer), fcProcessing: Number(r.fc_processing),
      customerOrder: Number(r.customer_order), unfulfillable: Number(r.unfulfillable),
      working: Number(r.working), shipped: Number(r.shipped), receiving: Number(r.receiving),
    }));
    // YYYY-MM-DD from SQL: a DATE parsed in a UTC+2 process would read as the previous day.
    const asOf = restock.reduce<string | null>((d, r) => (!d || r.report_day > d ? r.report_day : d), null);
    body = { asOf, ...summarizeCapacity(rows, (asin) => typeByAsin.get(asin) ?? "Standard-size") };
  } catch (e) {
    console.error("[inventory/capacity] Redshift failed", e);
    return NextResponse.json({ error: "Failed to load capacity" }, { status: 502 });
  }

  try {
    await setCachedData(CACHE_TYPE, cacheKey, body);
  } catch (e) {
    console.error("[inventory/capacity] cache write failed", e);
  }
  return NextResponse.json(body);
}
