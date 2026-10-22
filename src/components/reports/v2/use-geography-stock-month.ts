import { useLayoutEffect, useRef, useState } from "react";
import type { StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";

/**
 * The Geography page's stock-month state.
 * - A month from the URL is unowned (`accountId: null`) until the first real account
 *   arrives (report controls start at "" while clients load), then binds to it.
 * - A pick is keyed to its account, so an account switch drops it in the same render.
 * - Once the account's months are known, a month it doesn't have falls back to newest (null).
 * - Reported months are tagged with the current account via a ref updated in a LAYOUT
 *   effect: a section can report from its passive effect in the same commit as an account
 *   switch (cached hook state), and child passive effects run before the parent's.
 */
export function useGeographyStockMonth(accountId: string, initialMonth: string | null) {
  const [pick, setPick] = useState<{ accountId: string | null; month: string | null }>({ accountId: null, month: initialMonth });
  if (pick.accountId === null && accountId) setPick({ accountId, month: pick.month });
  const picked = pick.accountId === null || pick.accountId === accountId ? pick.month : null;

  const [reported, setReported] = useState<{ accountId: string; value: StockMonths } | null>(null);
  const stockMonths = reported && reported.accountId === accountId ? reported.value : null;
  const month = picked && stockMonths && !stockMonths.months.includes(picked) ? null : picked;

  const accountRef = useRef(accountId);
  useLayoutEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);
  const [onStockMonths] = useState(() => (value: StockMonths) => setReported({ accountId: accountRef.current, value }));
  const pickMonth = (m: string) => setPick({ accountId, month: m });
  return { month, stockMonths, onStockMonths, pickMonth };
}
