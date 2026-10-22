// Dev-only. Recovers SCALE/TX/TY for src/lib/albers.ts. No I/O besides stdout.
import { projectUnit } from "../src/lib/albers";
import { sharedVertices } from "../src/lib/us-map-geometry";
import { TRIPOINTS } from "../src/lib/us-map-tripoints";

type Pair = { id: string; u: number; v: number; x: number; y: number; states: string[] };

function pairs(role: "fit" | "holdout", guess?: (u: number, v: number) => [number, number]): Pair[] {
  return TRIPOINTS.filter((t) => t.role === role).map((t) => {
    const [u, v] = projectUnit(t.lat, t.lon);
    const cands = sharedVertices(t.states);
    if (cands.length === 0) throw new Error(`no shared vertex for ${t.id}`);
    let pick = cands[0];
    if (cands.length > 1) {
      if (!guess) throw new Error(`${t.id}: ${cands.length} shared vertices; mark it holdout or fit it second pass`);
      const [gx, gy] = guess(u, v);
      pick = cands.reduce((a, b) => (Math.hypot(a[0] - gx, a[1] - gy) <= Math.hypot(b[0] - gx, b[1] - gy) ? a : b));
    }
    return { id: t.id, u, v, x: pick[0], y: pick[1], states: t.states };
  });
}

/** Joint least squares for x = S·u + TX, y = −S·v + TY. */
function solve(ps: Pair[]) {
  const n = ps.length;
  const mu = ps.reduce((s, p) => s + p.u, 0) / n;
  const mv = ps.reduce((s, p) => s + p.v, 0) / n;
  const mx = ps.reduce((s, p) => s + p.x, 0) / n;
  const my = ps.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of ps) {
    num += (p.u - mu) * (p.x - mx) - (p.v - mv) * (p.y - my);
    den += (p.u - mu) ** 2 + (p.v - mv) ** 2;
  }
  const S = num / den;
  return { S, TX: mx - S * mu, TY: my + S * mv };
}

function residuals(ps: Pair[], f: { S: number; TX: number; TY: number }) {
  return ps.map((p) => ({ id: p.id, err: Math.hypot(f.S * p.u + f.TX - p.x, -f.S * p.v + f.TY - p.y) }));
}

const fit1 = solve(pairs("fit"));
const g = (u: number, v: number): [number, number] => [fit1.S * u + fit1.TX, -fit1.S * v + fit1.TY];
const fit = solve(pairs("fit", g));
const fitRes = residuals(pairs("fit", g), fit);
const holdRes = residuals(pairs("holdout", g), fit);
const maxHold = Math.max(...holdRes.map((r) => r.err));

console.log(`SCALE = ${fit.S.toFixed(4)}; TX = ${fit.TX.toFixed(4)}; TY = ${fit.TY.toFixed(4)}`);
console.log("fit residuals px:", fitRes.map((r) => `${r.id}=${r.err.toFixed(2)}`).join(" "));
console.log("holdout residuals px:", holdRes.map((r) => `${r.id}=${r.err.toFixed(2)}`).join(" "));
console.log(`max holdout = ${maxHold.toFixed(2)}px → ALIGNMENT_TOLERANCE_PX = ${Math.max(2, Math.ceil((maxHold + 0.5) * 10) / 10)}`);
if (maxHold > 5) {
  console.error("STOP: held-out error > 5px ⇒ projection parameters are wrong, not simplification. Report to Manu.");
  process.exit(1);
}
