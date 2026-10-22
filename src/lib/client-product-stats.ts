/** Per-client product counts for the `/api/clients` cards. */

export type ProductStatRow = {
  clientIdCode: string | null;
  status: string | null;
  count: number;
};

export type ClientProductStats = {
  count: number;
  activeCount: number;
  inactiveCount: number;
  outOfStockCount: number;
  closedCount: number;
  incompleteCount: number;
  discontinuedCount: number;
  replacementCount: number;
};

export function emptyClientProductStats(): ClientProductStats {
  return {
    count: 0,
    activeCount: 0,
    inactiveCount: 0,
    outOfStockCount: 0,
    closedCount: 0,
    incompleteCount: 0,
    discontinuedCount: 0,
    replacementCount: 0,
  };
}

/**
 * Pivot `GROUP BY client_id_code, status` rows into the same counters the old
 * `count(*) FILTER (WHERE status ILIKE …)` query produced — without scanning
 * every master row eight extra times.
 */
export function accumulateClientProductStats(
  rows: ProductStatRow[],
): Map<string, ClientProductStats> {
  const map = new Map<string, ClientProductStats>();
  for (const row of rows) {
    const code = row.clientIdCode;
    if (!code) continue;
    let stats = map.get(code);
    if (!stats) {
      stats = emptyClientProductStats();
      map.set(code, stats);
    }
    const n = Number(row.count) || 0;
    stats.count += n;
    const status = (row.status ?? "").trim().toLowerCase();
    if (status === "active") stats.activeCount += n;
    else if (status === "inactive") stats.inactiveCount += n;
    else if (status === "out of stock") stats.outOfStockCount += n;
    else if (status === "closed") stats.closedCount += n;
    else if (status === "incomplete") stats.incompleteCount += n;
    else if (status === "discontinued") stats.discontinuedCount += n;
    else if (status.startsWith("replacement")) stats.replacementCount += n;
  }
  return map;
}
