// Pure functions for deriving forecast metrics from editable inputs.
// These run client-side — only raw inputs are stored in the DB.

export interface ForecastInputs {
  sessions: number;
  unitsOrdered: number;
  totalOrderItems: number;
  categoryCoef: number;      // decimal, e.g. 0.0855 for 8.55%
  cvAmzEstimated: number;    // decimal, e.g. 0.1386
  spend: number;
  cpcAd: number;
  ctrAd: number;             // decimal, e.g. 0.0010
  cvAd: number;              // decimal, e.g. 0.0585
  adsOrderPct: number;       // decimal, e.g. 0.5291
  replenishOrders: number;
  prevInvMonthEnd: number;
}

export interface ForecastDerived {
  orderedProductSales: number;
  clicks: number;
  ordersAd: number;
  adRevenue: number;
  impressions: number;
  acos: number;              // decimal, e.g. 0.5905 for 59.05%
  invMonthEnd: number;
}

export function calcDerived(
  inputs: ForecastInputs,
  weightedAvgPrice: number
): ForecastDerived {
  const orderedProductSales = inputs.unitsOrdered * weightedAvgPrice;
  const clicks = inputs.cpcAd > 0 ? inputs.spend / inputs.cpcAd : 0;
  const ordersAd = Math.round(clicks * inputs.cvAd);
  const adRevenue = ordersAd * weightedAvgPrice;
  const impressions = inputs.ctrAd > 0 ? Math.round(clicks / inputs.ctrAd) : 0;
  const acos = adRevenue > 0 ? inputs.spend / adRevenue : 0;
  const invMonthEnd = inputs.prevInvMonthEnd + inputs.replenishOrders - inputs.unitsOrdered;

  return { orderedProductSales, clicks, ordersAd, adRevenue, impressions, acos, invMonthEnd };
}

/** Weighted average price from ASIN list */
export function calcWeightedAvgPrice(
  asins: Array<{ productPrice: number; sharePct: number }>
): number {
  return asins.reduce((sum, a) => sum + a.productPrice * a.sharePct, 0);
}

/** Generate month keys from startYear-startMonth to endYear-12 */
export function generateMonthRange(startYear: number, startMonth: number, endYear: number): string[] {
  const months: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    for (let m = mStart; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return months;
}
