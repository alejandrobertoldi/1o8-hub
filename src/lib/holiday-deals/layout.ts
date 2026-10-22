export type HolidayDealsLayout = {
  ordered: string[];
  hidden: string[];
};

export const EMPTY_HOLIDAY_DEALS_LAYOUT: HolidayDealsLayout = { ordered: [], hidden: [] };

/** Apply the saved sheet layout to a client list: drop hidden clients and put the
 *  explicitly ordered ones first (in that order), then the rest by name. */
export function applyHolidayDealsLayout<T extends { clientIdCode: string; clientName?: string | null }>(
  clients: T[],
  layout: HolidayDealsLayout,
): T[] {
  const hidden = new Set(layout.hidden);
  const rank = new Map(layout.ordered.map((id, i) => [id, i]));
  return clients
    .filter((c) => !hidden.has(c.clientIdCode))
    .sort((a, b) => {
      const ra = rank.get(a.clientIdCode);
      const rb = rank.get(b.clientIdCode);
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return (a.clientName || a.clientIdCode).localeCompare(b.clientName || b.clientIdCode, undefined, {
        sensitivity: "base",
      });
    });
}
