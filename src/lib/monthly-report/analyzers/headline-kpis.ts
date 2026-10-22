import type { AccountSummaryRow } from "../queries/account";
import type { HeadlineDeltas, HeadlineKpis, HeadlineResult } from "../types";

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function rollupToKpis(row: AccountSummaryRow): HeadlineKpis {
  const sessions = row.browser_sessions + row.mobile_sessions;
  const cvr = sessions > 0 ? (row.total_order_items / sessions) * 100 : null;
  const aov = safeDiv(row.product_sales, row.total_order_items);
  return {
    sales: row.product_sales,
    units: row.product_quantity,
    sessions,
    pageviews: 0,
    orderItems: row.total_order_items,
    cvr,
    buyBox: null, // not available in account_summary
    aov,
  };
}

function computeDeltas(curr: HeadlineKpis, prev: HeadlineKpis): HeadlineDeltas {
  const abs = (c: number | null, p: number | null): number | null => {
    if (c === null || p === null || !Number.isFinite(c) || !Number.isFinite(p)) return null;
    return c - p;
  };
  return {
    sales:    abs(curr.sales,    prev.sales),
    units:    abs(curr.units,    prev.units),
    sessions: abs(curr.sessions, prev.sessions),
    cvr:      abs(curr.cvr,      prev.cvr),
    buyBox:   abs(curr.buyBox,   prev.buyBox),
    aov:      abs(curr.aov,      prev.aov),
  };
}

export function buildHeadlineResult(
  current: AccountSummaryRow | null,
  previous: AccountSummaryRow | null,
): HeadlineResult | null {
  if (!current) return null;
  const curr = rollupToKpis(current);
  const prev = previous ? rollupToKpis(previous) : null;
  return {
    current: curr,
    previous: prev,
    deltas: prev
      ? computeDeltas(curr, prev)
      : { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null },
  };
}
