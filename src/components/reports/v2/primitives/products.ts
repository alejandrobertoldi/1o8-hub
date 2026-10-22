/** One aggregated advertised-ASIN row from GET /api/reports/product-performance. */
export interface ProductRow {
  asin: string;
  productTitle: string;
  adSpend: number;
  /** Attributed ad sales. */
  adRevenue: number;
  acos: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cvr: number;
  /** Attributed ad orders. Absent on cached payloads that predate this field. */
  orders?: number;
  /** Attributed units ordered from ads. Absent on cached payloads. */
  units?: number;
}

export interface ProductsResponse {
  products: ProductRow[];
}
