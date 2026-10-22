/**
 * Geographic state tripoints used to recover the Albers scale/translate of
 * us-map-paths.ts (which records no fit parameters). "fit" points solve the
 * constants; "holdout" points only test them.
 */
export const TRIPOINTS: {
  id: string;
  lat: number;
  lon: number;
  states: string[];
  role: "fit" | "holdout";
}[] = [
  { id: "four-corners", lat: 36.99902, lon: -109.04517, states: ["CO", "UT", "AZ", "NM"], role: "fit" },
  { id: "co-ne-wy", lat: 41.00232, lon: -104.05325, states: ["CO", "NE", "WY"], role: "fit" },
  { id: "wy-ne-sd", lat: 43.00062, lon: -104.05304, states: ["WY", "NE", "SD"], role: "fit" },
  { id: "mt-nd-sd", lat: 45.94554, lon: -104.04503, states: ["MT", "ND", "SD"], role: "fit" },
  { id: "co-ks-ok", lat: 36.99308, lon: -102.04198, states: ["CO", "KS", "OK"], role: "fit" },
  { id: "nm-ok-tx", lat: 36.5, lon: -103.00224, states: ["NM", "OK", "TX"], role: "fit" },
  { id: "ks-mo-ne", lat: 40.0, lon: -95.30829, states: ["KS", "MO", "NE"], role: "fit" },
  { id: "id-nv-ut", lat: 41.99932, lon: -114.04207, states: ["ID", "NV", "UT"], role: "fit" },
  { id: "tn-ga-al", lat: 34.98837, lon: -85.60526, states: ["TN", "GA", "AL"], role: "fit" },
  { id: "de-md-pa", lat: 39.72063, lon: -75.78826, states: ["DE", "MD", "PA"], role: "fit" },
  { id: "ut-wy-id", lat: 42.00171, lon: -111.0467, states: ["UT", "WY", "ID"], role: "holdout" },
  { id: "co-ks-ne", lat: 40.0034, lon: -102.0517, states: ["CO", "KS", "NE"], role: "holdout" },
  { id: "ia-mn-sd", lat: 43.50036, lon: -96.45326, states: ["IA", "MN", "SD"], role: "holdout" },
  { id: "wv-pa-md", lat: 39.72155, lon: -79.47686, states: ["WV", "PA", "MD"], role: "holdout" },
  { id: "tn-nc-ga", lat: 34.98696, lon: -84.32187, states: ["TN", "NC", "GA"], role: "holdout" },
];
