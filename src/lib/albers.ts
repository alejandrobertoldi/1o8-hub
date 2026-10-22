/**
 * Albers conic equal-area, lower 48 only, matching the projection baked into
 * us-map-paths.ts (parallels 29.5°N / 45.5°N, origin 96°W / 38.7°N).
 * Hand-written on purpose: no projection library in app code.
 * SCALE/TX/TY were recovered by scripts/fit-albers.ts (least squares on
 * state tripoints); re-run it if us-map-paths.ts is ever regenerated.
 */
const RAD = Math.PI / 180;
const PHI1 = 29.5 * RAD;
const PHI2 = 45.5 * RAD;
const PHI0 = 38.7 * RAD;
const LAM0 = -96 * RAD;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

export const SCALE = 961.9344;
export const TX = 362.8343;
export const TY = 345.4805;

// measured 2026-09-28: max holdout 0.09px (co-ks-ne)
/** Pass mark for held-out tripoints: max(2px, measured + 0.5px). See fit-albers output. */
export const ALIGNMENT_TOLERANCE_PX = 2;

export function projectUnit(lat: number, lon: number): [number, number] {
  const theta = N * (lon * RAD - LAM0);
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N;
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

export function projectAlbers(lat: number, lon: number): [number, number] {
  const [u, v] = projectUnit(lat, lon);
  return [SCALE * u + TX, -SCALE * v + TY];
}
