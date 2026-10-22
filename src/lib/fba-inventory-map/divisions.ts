/** US Census Bureau divisions. Compared at this level because Amazon serves states from neighbouring FCs. */
const GROUPS: Record<string, string[]> = {
  "New England": ["CT", "ME", "MA", "NH", "RI", "VT"],
  "Middle Atlantic": ["NJ", "NY", "PA"],
  "East North Central": ["IL", "IN", "MI", "OH", "WI"],
  "West North Central": ["IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  "South Atlantic": ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV"],
  "East South Central": ["AL", "KY", "MS", "TN"],
  "West South Central": ["AR", "LA", "OK", "TX"],
  Mountain: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"],
  Pacific: ["AK", "CA", "HI", "OR", "WA"],
};

export const DIVISIONS: readonly string[] = Object.keys(GROUPS);

export const STATE_TO_DIVISION: Record<string, string> = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([division, states]) => states.map((s) => [s, division])),
);
