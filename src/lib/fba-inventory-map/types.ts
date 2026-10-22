export type FcRow = { code: string; units: number; fee: number };
export type StockRow = { fc: string; units: number; fee: number };
/** One US row of the `fulfillment_centers` table, keyed by FC code (see fetchFcDirectory). */
export type FcPlace = { state: string; city: string | null; lat: number; lon: number };
export type FcDirectory = Map<string, FcPlace>;

export type Dot = {
  key: string; label: string; state: string; x: number; y: number;
  units: number; share: number; approximate: boolean; fcs: FcRow[];
};
export type DemandUnavailableReason = "account_not_mirrored" | "month_outside_window" | "no_orders";
export type DemandInput =
  | { status: "ok"; byState: Record<string, number>; totalUnits: number }
  | { status: "unavailable"; reason: DemandUnavailableReason };
export type Demand =
  | { status: "ok"; byState: Record<string, number>; totalUnits: number; note: "includes_fbm" }
  | { status: "unavailable"; reason: DemandUnavailableReason };
export type DivisionRow = { division: string; demandShare: number; stockShare: number; gapPts: number };
export type FbaMapBody = {
  dots: Dot[];
  unplaced: { units: number; share: number; fcs: FcRow[] };
  totals: { units: number; placedUnits: number; fee: number };
  demand: Demand;
  divisions: DivisionRow[] | null;
};
export type AsinOption = { asin: string; units: number; title: string };
export type FbaMapResponse = FbaMapBody & {
  accountId: string; month: string | null; availableMonths: string[];
  /** Filled by Task 7; Task 5 returns null / []. */
  asin: string | null; asins: AsinOption[];
};
