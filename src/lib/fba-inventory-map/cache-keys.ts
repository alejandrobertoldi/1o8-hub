/**
 * Cache types + TTLs for /api/reports/fba-inventory-map. They live here, not in route.ts,
 * because a Next.js route file may only export handlers and route config.
 */
// v2: dots are placed from the fulfillment_centers table; v1 payloads hold prefix-guessed placements.
export const CACHE_TYPE = "report-fba-inventory-map-v2";
export const MONTHS_CACHE_TYPE = "report-fba-inventory-map-months";
export const ASINS_CACHE_TYPE = "report-fba-inventory-map-asins";
export const MONTHS_TTL_MS = 12 * 60 * 60 * 1000;
export const PAYLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
