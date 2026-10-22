import { projectAlbers } from "@/lib/albers";
import { US_MAP_CODES, US_STATE_LABEL_POINTS } from "@/lib/us-map-paths";

export type FcMetro = { name: string; state: string; lat: number; lon: number };

/**
 * Amazon FC metros. lat/lon = metro, not a building.
 *
 * Two kinds of key:
 * - 3-letter keys are code PREFIXES (usually the nearest airport's IATA code): any code starting
 *   with that prefix resolves here unless an override says otherwise.
 * - Longer UPPER_SNAKE keys are override-only metros. They can never match a 3-char prefix, so
 *   they cannot capture codes by accident — they are reached only through FC_OVERRIDES.
 *
 * Sourced 2026-09-28 from Amazon's own "IPEX Scheduled Fulfillment Center Address List"
 * (updated 2025-06-20) plus public directories for codes it omits; see the Task 3 report.
 * The prefix is NOT a reliable location: e.g. PHL7 is in Delaware, SDF8 in Indiana, DEN4 in
 * Colorado Springs, KRB1-4 span CA/VA/AZ. Those are pinned by exact-code overrides below.
 */
export const FC_METROS: Record<string, FcMetro> = {
  // ── Seed (verified metros) ──────────────────────────────────────────────
  PHX: { name: "Phoenix, AZ", state: "AZ", lat: 33.4484, lon: -112.074 },
  SDF: { name: "Louisville, KY", state: "KY", lat: 38.2527, lon: -85.7585 },
  BDL: { name: "Hartford, CT", state: "CT", lat: 41.7658, lon: -72.6734 },
  ONT: { name: "Ontario, CA", state: "CA", lat: 34.0633, lon: -117.6509 },
  LGB: { name: "Long Beach, CA", state: "CA", lat: 33.7701, lon: -118.1937 },
  DFW: { name: "Dallas–Fort Worth, TX", state: "TX", lat: 32.8998, lon: -97.0403 },
  IND: { name: "Indianapolis, IN", state: "IN", lat: 39.7684, lon: -86.1581 },
  MDW: { name: "Chicago, IL", state: "IL", lat: 41.8781, lon: -87.6298 },
  ORD: { name: "Chicago, IL", state: "IL", lat: 41.8781, lon: -87.6298 },
  ABE: { name: "Allentown, PA", state: "PA", lat: 40.6084, lon: -75.4902 },
  EWR: { name: "Newark, NJ", state: "NJ", lat: 40.7357, lon: -74.1724 },
  ATL: { name: "Atlanta, GA", state: "GA", lat: 33.749, lon: -84.388 },
  CLT: { name: "Charlotte, NC", state: "NC", lat: 35.2271, lon: -80.8431 },
  MCO: { name: "Orlando, FL", state: "FL", lat: 28.5383, lon: -81.3792 },
  TPA: { name: "Tampa, FL", state: "FL", lat: 27.9506, lon: -82.4572 },
  SAT: { name: "San Antonio, TX", state: "TX", lat: 29.4241, lon: -98.4936 },
  SLC: { name: "Salt Lake City, UT", state: "UT", lat: 40.7608, lon: -111.891 },
  SMF: { name: "Sacramento, CA", state: "CA", lat: 38.5816, lon: -121.4944 },
  SAN: { name: "San Diego, CA", state: "CA", lat: 32.7157, lon: -117.1611 },
  SAV: { name: "Savannah, GA", state: "GA", lat: 32.0809, lon: -81.0912 },
  SNA: { name: "Santa Ana, CA", state: "CA", lat: 33.7455, lon: -117.8677 },
  SWF: { name: "Newburgh, NY", state: "NY", lat: 41.5034, lon: -74.0104 },
  SCK: { name: "Stockton, CA", state: "CA", lat: 37.9577, lon: -121.2908 },
  SBD: { name: "San Bernardino, CA", state: "CA", lat: 34.1083, lon: -117.2898 },
  SBN: { name: "South Bend, IN", state: "IN", lat: 41.6764, lon: -86.252 },
  SYR: { name: "Syracuse, NY", state: "NY", lat: 43.0481, lon: -76.1474 },
  SJA: { name: "San Jose, CA", state: "CA", lat: 37.3382, lon: -121.8863 },

  // ── Prefix metros added from the Aug 2026 top-150 fixture ────────────────
  ABQ: { name: "Albuquerque, NM", state: "NM", lat: 35.0844, lon: -106.6504 },
  ACY: { name: "West Deptford, NJ", state: "NJ", lat: 39.829, lon: -75.165 },
  AGS: { name: "Augusta, GA", state: "GA", lat: 33.4735, lon: -82.0105 },
  AKC: { name: "Akron, OH", state: "OH", lat: 41.0814, lon: -81.519 },
  AUS: { name: "Austin, TX", state: "TX", lat: 30.2672, lon: -97.7431 },
  AVP: { name: "Scranton–Wilkes-Barre, PA", state: "PA", lat: 41.3259, lon: -75.7893 },
  BFI: { name: "Seattle, WA", state: "WA", lat: 47.6062, lon: -122.3321 },
  BFL: { name: "Bakersfield, CA", state: "CA", lat: 35.3733, lon: -119.0187 },
  BHM: { name: "Birmingham, AL", state: "AL", lat: 33.5186, lon: -86.8104 },
  BNA: { name: "Nashville, TN", state: "TN", lat: 36.1627, lon: -86.7816 },
  BOI: { name: "Boise, ID", state: "ID", lat: 43.615, lon: -116.2023 },
  BOS: { name: "Boston, MA", state: "MA", lat: 42.3601, lon: -71.0589 },
  BTR: { name: "Baton Rouge, LA", state: "LA", lat: 30.4515, lon: -91.1871 },
  BWI: { name: "Baltimore, MD", state: "MD", lat: 39.2904, lon: -76.6122 },
  CLE: { name: "Cleveland, OH", state: "OH", lat: 41.4993, lon: -81.6944 },
  CMH: { name: "Columbus, OH", state: "OH", lat: 39.9612, lon: -82.9988 },
  DAB: { name: "Daytona Beach, FL", state: "FL", lat: 29.2108, lon: -81.0228 },
  DEN: { name: "Denver, CO", state: "CO", lat: 39.7392, lon: -104.9903 },
  DET: { name: "Detroit, MI", state: "MI", lat: 42.3314, lon: -83.0458 },
  DSM: { name: "Des Moines, IA", state: "IA", lat: 41.5868, lon: -93.625 },
  ELP: { name: "El Paso, TX", state: "TX", lat: 31.7619, lon: -106.485 },
  FAT: { name: "Fresno, CA", state: "CA", lat: 36.7378, lon: -119.7871 },
  FSD: { name: "Sioux Falls, SD", state: "SD", lat: 43.5446, lon: -96.7311 },
  FWA: { name: "Fort Wayne, IN", state: "IN", lat: 41.0793, lon: -85.1394 },
  GEG: { name: "Spokane, WA", state: "WA", lat: 47.6588, lon: -117.426 },
  GRR: { name: "Grand Rapids, MI", state: "MI", lat: 42.9634, lon: -85.6681 },
  HGR: { name: "Hagerstown, MD", state: "MD", lat: 39.6418, lon: -77.72 },
  IAH: { name: "Houston, TX", state: "TX", lat: 29.7604, lon: -95.3698 },
  JAN: { name: "Jackson, MS", state: "MS", lat: 32.2988, lon: -90.1848 },
  JAX: { name: "Jacksonville, FL", state: "FL", lat: 30.3322, lon: -81.6557 },
  // JFK8 is on Staten Island, which the simplified NY outline omits (2.75px outside); NYC centre is inside.
  JFK: { name: "New York City, NY", state: "NY", lat: 40.7128, lon: -74.006 },
  LAS: { name: "Las Vegas, NV", state: "NV", lat: 36.1699, lon: -115.1398 },
  MEM: { name: "Memphis, TN", state: "TN", lat: 35.1495, lon: -90.049 },
  MIA: { name: "Miami, FL", state: "FL", lat: 25.7617, lon: -80.1918 },
  MKC: { name: "Kansas City, KS", state: "KS", lat: 39.1141, lon: -94.6275 },
  MKE: { name: "Milwaukee, WI", state: "WI", lat: 43.0389, lon: -87.9065 },
  MSP: { name: "Minneapolis, MN", state: "MN", lat: 44.9778, lon: -93.265 },
  OKC: { name: "Oklahoma City, OK", state: "OK", lat: 35.4676, lon: -97.5164 },
  OMA: { name: "Omaha, NE", state: "NE", lat: 41.2565, lon: -95.9345 },
  ORF: { name: "Norfolk, VA", state: "VA", lat: 36.8508, lon: -76.2859 },
  ORH: { name: "Worcester, MA", state: "MA", lat: 42.2626, lon: -71.8023 },
  OXR: { name: "Oxnard, CA", state: "CA", lat: 34.1975, lon: -119.1771 },
  PAE: { name: "Everett, WA", state: "WA", lat: 47.979, lon: -122.2021 },
  PCW: { name: "Toledo, OH", state: "OH", lat: 41.6528, lon: -83.5379 },
  PDX: { name: "Portland, OR", state: "OR", lat: 45.5152, lon: -122.6784 },
  POC: { name: "Fontana, CA", state: "CA", lat: 34.0922, lon: -117.435 },
  PSP: { name: "Beaumont, CA", state: "CA", lat: 33.9295, lon: -116.9773 },
  PVD: { name: "Providence, RI", state: "RI", lat: 41.824, lon: -71.4128 },
  RDG: { name: "Reading, PA", state: "PA", lat: 40.3356, lon: -75.9269 },
  RDU: { name: "Raleigh, NC", state: "NC", lat: 35.7796, lon: -78.6382 },
  RFD: { name: "Huntley, IL", state: "IL", lat: 42.1681, lon: -88.4281 },
  RIC: { name: "Richmond, VA", state: "VA", lat: 37.5407, lon: -77.436 },
  RMN: { name: "Fredericksburg, VA", state: "VA", lat: 38.3032, lon: -77.4605 },
  ROC: { name: "Rochester, NY", state: "NY", lat: 43.1566, lon: -77.6088 },
  SHV: { name: "Shreveport, LA", state: "LA", lat: 32.5252, lon: -93.7502 },
  STL: { name: "St. Louis, MO", state: "MO", lat: 38.627, lon: -90.1994 },
  TLH: { name: "Tallahassee, FL", state: "FL", lat: 30.4383, lon: -84.2807 },
  TUL: { name: "Tulsa, OK", state: "OK", lat: 36.154, lon: -95.9928 },
  TUS: { name: "Tucson, AZ", state: "AZ", lat: 32.2226, lon: -110.9747 },
  TYS: { name: "Knoxville, TN", state: "TN", lat: 35.9606, lon: -83.9207 },

  // ── Override-only metros (reached via FC_OVERRIDES, never by prefix) ─────
  AMARILLO_TX: { name: "Amarillo, TX", state: "TX", lat: 35.222, lon: -101.8313 },
  CAMPBELLSVILLE_KY: { name: "Campbellsville, KY", state: "KY", lat: 37.3434, lon: -85.3419 },
  CHAMBERSBURG_PA: { name: "Chambersburg, PA", state: "PA", lat: 39.9376, lon: -77.6611 },
  COLORADO_SPRINGS_CO: { name: "Colorado Springs, CO", state: "CO", lat: 38.8339, lon: -104.8214 },
  DAVENPORT_IA: { name: "Davenport, IA", state: "IA", lat: 41.5236, lon: -90.5776 },
  DAYTON_OH: { name: "Dayton, OH", state: "OH", lat: 39.7589, lon: -84.1916 },
  JEFFERSONVILLE_IN: { name: "Jeffersonville, IN", state: "IN", lat: 38.2776, lon: -85.7372 },
  LOVELAND_CO: { name: "Loveland, CO", state: "CO", lat: 40.3978, lon: -105.075 },
  OCALA_FL: { name: "Ocala, FL", state: "FL", lat: 29.1872, lon: -82.1401 },
  ROBBINSVILLE_NJ: { name: "Robbinsville, NJ", state: "NJ", lat: 40.214, lon: -74.6199 },
  WILMINGTON_DE: { name: "Wilmington, DE", state: "DE", lat: 39.7391, lon: -75.5398 },
};

/** Full codes or prefixes the prefix rules get wrong → FC_METROS key. */
export const FC_OVERRIDES: Record<string, string> = {
  // Prefixes whose airport is in the same metro as an existing metro dot.
  AFW: "DFW", // Fort Worth Alliance
  DAL: "DFW",
  FTW: "DFW",
  DTW: "DET", // Romulus
  HOU: "IAH",
  GYR: "PHX", // Goodyear
  IGQ: "MDW", // Markham (Chicago south suburbs)
  MCC: "SMF", // Rancho Cordova
  MQJ: "IND", // Greenfield
  MQY: "BNA", // Mount Juliet
  VGT: "LAS", // North Las Vegas

  // Exact codes whose site is far from, or in a different state than, their prefix metro.
  DCA1: "BWI", // 1700 Sparrows Point Blvd, Sparrows Point MD (Amazon IPEX list 2025-06-20)
  DEN4: "COLORADO_SPRINGS_CO",
  DEN9: "LOVELAND_CO",
  EWR4: "ROBBINSVILLE_NJ",
  HGA6: "ATL", // Union City, GA
  HGR5: "CHAMBERSBURG_PA", // Shippensburg, PA — not Maryland
  CSG1: "ATL", // Moreland, GA
  ITX3: "AMARILLO_TX",
  KRB1: "SBD", // San Bernardino, CA
  KRB2: "RIC", // Prince George, VA
  KRB3: "PHX", // Phoenix, AZ
  KRB4: "SBD", // Inland Empire, CA (sources disagree: Perris vs San Bernardino)
  LAX9: "POC", // Fontana, CA
  LGA9: "EWR", // Edison, NJ
  LGB3: "ONT", // Eastvale, CA
  LGB7: "SBD", // Rialto, CA
  LUK2: "DAYTON_OH", // Union, OH
  MLI1: "DAVENPORT_IA",
  MTN1: "WILMINGTON_DE", // 801/1025 Boxwood Rd, Wilmington DE 19804 (YAG 2026-04, warehouse.ninja, ShipmentBot agree). Not in IPEX; NOT Sparrows Point — that is DCA1.
  OAK4: "SCK", // Tracy, CA
  PHL7: "WILMINGTON_DE", // Middletown, DE
  QXX6: "MDW", // Joliet, IL
  SAT2: "AUS", // San Marcos, TX
  SDF1: "CAMPBELLSVILLE_KY",
  SDF8: "JEFFERSONVILLE_IN",
  SMF3: "SCK", // Stockton, CA
  TEB9: "EWR", // Somerset, NJ
  XAB4: "CHAMBERSBURG_PA",
  XDA4: "OCALA_FL",
  XMD5: "CHAMBERSBURG_PA", // Greencastle, PA
  XMD6: "BWI", // Port Deposit, MD
  XSL2: "SLC", // West Jordan, UT
};

export type FcResolution =
  | { kind: "metro"; metro: string; approximate: false }
  | { kind: "state"; state: string; approximate: true }
  | { kind: "unplaced" };

export function normalizeFcCode(raw: string): string {
  return raw.replace(/['"\s]/g, "").toUpperCase();
}

/** S+state rule excludes DC and PR: SDC is a real non-state code (spec §2), and PR has no S-codes. */
const STATE_CODES = new Set(US_MAP_CODES.filter((c) => c !== "DC" && c !== "PR"));

export function resolveFc(raw: string): FcResolution {
  const code = normalizeFcCode(raw);
  const prefix = code.slice(0, 3);
  const override = FC_OVERRIDES[code] ?? FC_OVERRIDES[prefix];
  if (override) return { kind: "metro", metro: override, approximate: false };
  if (FC_METROS[prefix]) return { kind: "metro", metro: prefix, approximate: false };
  const st = code.slice(1, 3);
  if (code.startsWith("S") && STATE_CODES.has(st)) return { kind: "state", state: st, approximate: true };
  return { kind: "unplaced" };
}

const pointCache = new Map<string, [number, number]>();

/** Lower-48 metros are projected; AK/HI/PR metros fall back to the state label point. */
export function metroPoint(metro: string): [number, number] {
  const hit = pointCache.get(metro);
  if (hit) return hit;
  const m = FC_METROS[metro];
  const p: [number, number] = ["AK", "HI", "PR"].includes(m.state)
    ? statePoint(m.state)
    : projectAlbers(m.lat, m.lon);
  pointCache.set(metro, p);
  return p;
}

export function statePoint(state: string): [number, number] {
  const [x, y] = US_STATE_LABEL_POINTS[state];
  return [x, y];
}
