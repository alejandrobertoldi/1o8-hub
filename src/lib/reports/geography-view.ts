export const GEOGRAPHY_VIEWS = ["orders", "inventory", "both"] as const;
export type GeographyView = (typeof GEOGRAPHY_VIEWS)[number];

export function parseGeographyView(v: string | null): GeographyView {
  return (GEOGRAPHY_VIEWS as readonly string[]).includes(v ?? "") ? (v as GeographyView) : "orders";
}

/**
 * Next query string for the Geography page. Only view/start/end/month are
 * owned here; every other param in `current` is preserved untouched.
 * start/end are passed only for a custom range (presets stay out of the URL).
 */
export function buildGeographyQuery(
  current: string,
  s: { view: GeographyView; start: string | null; end: string | null; month: string | null },
): string {
  const qs = new URLSearchParams(current);
  const put = (k: string, v: string | null) => (v ? qs.set(k, v) : qs.delete(k));
  put("view", s.view === "orders" ? null : s.view);
  put("start", s.start);
  put("end", s.end);
  put("month", s.view === "orders" ? null : s.month);
  return qs.toString();
}
