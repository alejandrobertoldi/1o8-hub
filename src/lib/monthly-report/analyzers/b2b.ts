import type { B2bResult } from "../types";
import type { RawB2bRow } from "../queries/b2b";

export function analyzeB2b(row: RawB2bRow | null): B2bResult | null {
  if (!row) return null;
  if (row.total_sales <= 0 && row.total_units <= 0) return null;
  return {
    totalSales: row.total_sales,
    b2bSales: row.b2b_sales,
    b2bShareSales: row.total_sales > 0 ? (row.b2b_sales / row.total_sales) * 100 : 0,
    totalUnits: row.total_units,
    b2bUnits: row.b2b_units,
    b2bShareUnits: row.total_units > 0 ? (row.b2b_units / row.total_units) * 100 : 0,
  };
}
