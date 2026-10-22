# FBA Inventory Distribution Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only hub page `/reports/fba-inventory-map` that shows, for one account and one month, FBA stock per fulfilment-center metro as dots over US states shaded by customer demand, plus a census-division placement-vs-demand callout and an FC table.

**Architecture:** Pure, unit-tested core (`albers.ts` projection with 3 fitted constants → `fc-locations.ts` lookup → `divisions.ts` → `aggregate.ts`) feeds a thin route (`/api/reports/fba-inventory-map`) that reads Redshift storage-fee rows and Postgres `order_geography_lines`, caches via `reports_cache`, and a client page that reuses `UsChoropleth` with a new `overlay` slot for the dots.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Drizzle (Postgres), `pg` Redshift pool (`queryRedshiftOrThrow`), Vitest + Testing Library (jsdom).

**Spec:** `/Users/manu/MFHub/.worktrees/thread-z-fba-map/docs/superpowers/specs/2026-09-28-fba-inventory-map-design.md` (includes review fixes 1–4 and §9: product filter + Order Geography link).

## Global Constraints

- Work ONLY in `/Users/manu/MFHub/.worktrees/thread-z-fba-map`, branch `thread-z/fba-inventory-map`. Run `git rev-parse --abbrev-ref HEAD` before every commit; it must print `thread-z/fba-inventory-map`.
- NEVER `git add .` / `git add -A`. Explicit pathspec on add AND commit, `-m` before `--`. One task per commit. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No push, deploy, merge, prod write, or schema change without Manu's per-action OK. This plan needs no migration.
- Redshift is SELECT-only. Never read `sellercentral_fbaamazonfulfilledshipments_report_deduplicated`.
- FC codes, `country_code` (and `month_of_charge` if Task 1 finds quotes) are cleaned with `btrim(col, '''" ')`.
- Dates cross module boundaries as `'YYYY-MM'` / `'YYYY-MM-DD'` strings, never `Date`. Month math is string math.
- No runtime projection library, no d3-geo, no new npm dependency. `albers.ts` is hand-written math.
- `scripts/_tmp-fc-*` probes are NEVER committed. Bash commands containing the env-file name are hook-blocked: probes load it with `[".env", "local"].join(".")`.
- ESM hoisting trap: in scripts, call `config()` at module top, then `await import(...)` `db`/`redshift` INSIDE `main()`. A static import would read `DATABASE_URL` before dotenv runs.
- `rm -r` / `rm -f` are hook-blocked; `git checkout -- <path>` is blocked (use Edit to revert).
- Gates: `npx vitest run <paths>` then `node_modules/.bin/tsc --noEmit` (background, ~2 min, UNFILTERED output, judged BY FILENAME: zero errors in files this plan touches). vitest does not typecheck. NEVER `next build`.
- UI per DESIGN.md: hub surface (`--brand` allowed); cards `rounded-[18px] border border-stone-200 bg-card p-5`; selects `h-9 rounded-full px-3 text-[13px] font-medium`; split jammed heading "Inventory" `text-foreground font-bold` + "Map" `text-brand font-medium`; micro-labels `text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground`; numbers `tabular-nums`; badges use the DESIGN.md badge table (Green `bg-emerald-50 text-emerald-700 border-emerald-300`, Amber `bg-amber-100 text-amber-800 border-amber-300`, Stone `bg-stone-200 text-stone-500 border-stone-300`, Red `bg-red-50 text-red-600 border-red-300`, each with its dark variant). Dots: `var(--foreground)` fill @0.85 + `var(--card)` 1.5px stroke; the orange ramp is demand only.
- Do not put the hub-orange hex literal in any file under `src/components/reports/v2/` (the `no-hub-orange.test.ts` scanner).

## Review Focus

1. **A month with a report but every FC unplaced** (e.g. an account with only `X***` codes) — expect zero dots, the unplaced stat at 100%, the table fully populated, no divide-by-zero `NaN` in placed-share or division stock share. → Test in Task 4 (`all-unplaced` case) and Task 6 (`renders 100% unplaced without NaN`).
2. **`month` param that is valid-format but not in `availableMonths`** (e.g. `2019-01`) — expect 200 with an empty payload and `availableMonths` intact so the UI can offer real months, never a 500. → Test in Task 5 (`month not in availableMonths`).
3. **Demand exists only in unmapped states** (all `ship_state` blank/military) — `totalUnits > 0` but every division demand is 0; expect `status: "ok"`, shares 0, no `NaN`. → Test in Task 4 (`demand all unmapped`).
4. **Duplicate FC rows after btrim** (`'PHX7'` and `PHX7` both present before cleaning) — the SQL groups on the cleaned value, but `aggregate` must also merge same-code rows defensively so one FC never appears twice in a dot's `fcs`. → Test in Task 4 (`merges duplicate codes`).
5. **Account switch while a request is in flight** — the stale response must not overwrite the new account's view. → Test in Task 6 (`ignores a stale response after account change`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/albers.ts` (create) | Albers forward projection + 3 fitted constants; `projectAlbers(lat, lon) → [x, y]` in the `us-map-paths.ts` viewBox. |
| `src/lib/us-map-geometry.ts` (create) | `pathVertices(d)`, `sharedVertices(codes)`, `pointInPath(d, x, y)` over `US_STATE_PATHS`. Used by the fit script and tests. |
| `src/lib/albers.test.ts` (create) | Held-out tripoint alignment. |
| `src/lib/us-map-tripoints.ts` (create) | Tripoint table `{ id, lat, lon, states, role: "fit" \| "holdout" }`. |
| `scripts/fit-albers.ts` (create, committed, dev-only) | Least-squares fit; prints `SCALE/TX/TY` + residuals. |
| `src/lib/fc-locations.ts` (create) | `FC_METROS`, `FC_OVERRIDES`, `resolveFc`, `metroPoint`. |
| `src/lib/fc-locations.test.ts` (create) | Lookup rules, bounds, in-own-state, coverage. |
| `src/lib/__fixtures__/fc-top150-2026-08.json` (create) | `[{ code, units }]`, units summed across all accounts. |
| `src/lib/fba-inventory-map/divisions.ts` (+ `.test.ts`) (create) | `STATE_TO_DIVISION`, `DIVISIONS`. |
| `src/lib/fba-inventory-map/types.ts` (create) | Payload types shared by route and UI. |
| `src/lib/fba-inventory-map/month.ts` (+ `.test.ts`) (create) | `isMonth`, `monthRange`. |
| `src/lib/fba-inventory-map/aggregate.ts` (+ `.test.ts`) (create) | Pure rows → payload body. |
| `src/lib/fba-inventory-map/queries.server.ts` (create) | Redshift stock + months, Postgres demand. |
| `src/lib/reports-cache.ts` (modify) | Optional `maxAgeMs` param on `getCachedReport`. |
| `src/app/api/reports/fba-inventory-map/route.ts` (+ `__tests__/route.test.ts`) (create) | Auth, validation, caching, 502. |
| `src/components/reports/v2/us-choropleth.tsx` (modify) | Optional `overlay?: ReactNode` rendered inside the SVG. |
| `src/components/reports/fba-inventory-map/fc-dot-overlay.tsx` (create) | `<g>` of dots; `dotRadius`. |
| `src/components/reports/fba-inventory-map/division-callout.tsx` (create) | Division gap card. |
| `src/components/reports/fba-inventory-map/fc-table.tsx` (create) | Sortable FC table. |
| `src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx` (+ `.test.tsx`) (create) | Fetch, month select, stats, map card, callout, table. |
| `src/app/reports/fba-inventory-map/page.tsx` (create) | Page shell. |
| `src/components/layout/top-nav.tsx` (modify ~line 102) | Report tab entry. |
| `src/lib/reports/range-params.ts` (+ `.test.ts`) (create) | `?start&end` deep-link parsing for Order Geography (Task 8). |
| `src/components/reports/v2/trailing-range-picker.tsx` (modify) | `useTrailingRange(initial?)` (Task 8). |
| `src/app/reports/order-geography/page.tsx` (modify) | Reads `?start&end`, Suspense wrapper (Task 8). |

---

### Task 1: Read-only probe + coverage fixture

Verifies the spec's two unmeasured assumptions and produces the fixture Task 3 needs. The probe is NOT committed; the fixture IS.

**Files:**
- Create (untracked, never commit): `/Users/manu/MFHub/scripts/_tmp-fc-plan-probe.ts` (in the MAIN checkout, which has the env file; the worktree does not)
- Create: `src/lib/__fixtures__/fc-top150-2026-08.json` (in the worktree)

**Interfaces:**
- Produces: the measured fee column name, the measured download-date column name, whether duplicates exist, `account_id` type, whether `month_of_charge` carries quotes, **whether an ASIN column exists (gates Task 7)** → recorded in the commit message AND used verbatim in Task 5's `STOCK_SQL`. The fixture shape `{ code: string; units: number }[]`.

- [ ] **Step 1: Write the probe**

```ts
// READ-ONLY probe for Thread Z plan Task 1. NEVER COMMIT.
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(process.cwd(), [".env", "local"].join(".")) });

const T = "amazon_source_data.sellercentral_fbastoragefees_report";

async function main() {
  const { queryRedshiftOrThrow: q } = await import("../src/lib/redshift");

  const cols = await q<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'amazon_source_data' and table_name = 'sellercentral_fbastoragefees_report'
     order by ordinal_position`,
  );
  console.log("COLUMNS:", cols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));

  console.log("HAS ASIN COLUMN:", cols.some((c) => c.column_name === "asin"), "| candidates:", cols.filter((c) => /asin|sku/i.test(c.column_name)).map((c) => c.column_name).join(","));

  const monthSample = await q<{ m: string }>(`select distinct month_of_charge as m from ${T} order by 1 desc limit 5`);
  console.log("MONTH SAMPLE (raw, check for quotes):", monthSample.map((r) => JSON.stringify(r.m)).join(" "));

  // Replace download_date below with the measured column name if COLUMNS shows a different one.
  const dup = await q<{ account_id: string; month_of_charge: string; downloads: number }>(
    `select account_id, month_of_charge, count(distinct download_date)::int as downloads
     from ${T} group by 1, 2 having count(distinct download_date) > 1
     order by 3 desc limit 10`,
  );
  console.log("ACCOUNT-MONTHS WITH >1 DOWNLOAD:", dup.length, JSON.stringify(dup));

  const top = await q<{ code: string; units: number }>(
    `select btrim(fulfillment_center, '''" ') as code, sum(average_quantity_on_hand::float) as units
     from ${T}
     where btrim(month_of_charge, '''" ') = '2026-08' and btrim(country_code, '''" ') = 'US'
     group by 1 order by 2 desc limit 150`,
  );
  const fixture = top.map((r) => ({ code: r.code, units: Math.round(Number(r.units)) }));
  const out = resolve("/Users/manu/MFHub/.worktrees/thread-z-fba-map/src/lib/__fixtures__/fc-top150-2026-08.json");
  writeFileSync(out, JSON.stringify(fixture, null, 1) + "\n");
  console.log("FIXTURE:", fixture.length, "codes →", out);
  console.log("TOP150 PREFIXES:", [...new Set(fixture.map((f) => f.code.slice(0, 3)))].sort().join(" "));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it from the main checkout**

Run: `cd /Users/manu/MFHub && mkdir -p .worktrees/thread-z-fba-map/src/lib/__fixtures__ && npx tsx scripts/_tmp-fc-plan-probe.ts`
Expected: COLUMNS line lists a fee column (spec assumes `estimated_monthly_storage_fee`) and a download column (assumed `download_date`); FIXTURE: 150 codes. If the dup query errors because `download_date` doesn't exist, edit the name to the measured one and re-run.

- [ ] **Step 3: Record the findings.** Write down: fee column name, download column name, dup count, `account_id` data type, whether months are quoted, ASIN column name (or "none" ⇒ Task 7 is skipped). These go in the Step 5 commit message and into Task 5's SQL.

- [ ] **Step 4: Check the fixture holds no account data**

Run: `cd /Users/manu/MFHub/.worktrees/thread-z-fba-map && node -e "const f=require('./src/lib/__fixtures__/fc-top150-2026-08.json');console.log(f.length, Object.keys(f[0]))"`
Expected: `150 [ 'code', 'units' ]`

- [ ] **Step 5: Commit the fixture only**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/__fixtures__/fc-top150-2026-08.json
git commit -m "test(fba-map): top-150 Aug 2026 FC fixture (units summed across accounts)

Probe findings: fee column=<measured>; download column=<measured>;
account-months with >1 download=<n>; account_id type=<measured>;
month_of_charge quoted=<yes/no>; asin column=<name|none>.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/__fixtures__/fc-top150-2026-08.json
```
(Replace each `<measured>` with the Step 3 value before committing.)

---

### Task 2: Albers projection, fit, and alignment test

**Files:**
- Create: `src/lib/us-map-geometry.ts`, `src/lib/us-map-tripoints.ts`, `src/lib/albers.ts`, `scripts/fit-albers.ts`
- Test: `src/lib/albers.test.ts`, `src/lib/us-map-geometry.test.ts`

**Interfaces:**
- Consumes: `US_STATE_PATHS`, `US_MAP_VIEW_BOX` from `@/lib/us-map-paths`.
- Produces:
  - `projectUnit(lat: number, lon: number): [u: number, v: number]` (unit-scale Albers, before scale/translate)
  - `projectAlbers(lat: number, lon: number): [x: number, y: number]`
  - `ALIGNMENT_TOLERANCE_PX: number`
  - `pathVertices(d: string): [number, number][]`
  - `sharedVertices(codes: string[]): [number, number][]`
  - `pointInPath(d: string, x: number, y: number): boolean`
  - `distanceToPath(d: string, x: number, y: number): number` (min distance to any vertex)
  - `TRIPOINTS: { id: string; lat: number; lon: number; states: string[]; role: "fit" | "holdout" }[]`

- [ ] **Step 1: Write the geometry test**

`src/lib/us-map-geometry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import { pathVertices, pointInPath, sharedVertices } from "./us-map-geometry";

describe("us-map-geometry", () => {
  it("parses absolute M/L pairs", () => {
    expect(pathVertices("M1.5,2 L3,4.25 L-1,0Z")).toEqual([[1.5, 2], [3, 4.25], [-1, 0]]);
  });

  it("finds the Four Corners as a vertex shared by CO, UT, AZ and NM", () => {
    const shared = sharedVertices(["CO", "UT", "AZ", "NM"]);
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it("point-in-path: the CO label point is inside CO and not inside KS", () => {
    expect(pointInPath(US_STATE_PATHS.CO, 239.6, 334.2)).toBe(true);
    expect(pointInPath(US_STATE_PATHS.KS, 239.6, 334.2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/us-map-geometry.test.ts`
Expected: FAIL, cannot resolve `./us-map-geometry`.

- [ ] **Step 3: Implement geometry**

`src/lib/us-map-geometry.ts`:
```ts
import { US_STATE_PATHS } from "@/lib/us-map-paths";

/** `us-map-paths.ts` uses only absolute M/L/Z commands with one-decimal pairs. */
export function pathVertices(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

/** Rings split on M, for point-in-polygon. */
function rings(d: string): [number, number][][] {
  return d
    .split("M")
    .filter((s) => s.trim())
    .map((s) => pathVertices(s));
}

const key = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;

/** Vertices present in EVERY listed state's path (a tripoint / quadripoint). */
export function sharedVertices(codes: string[]): [number, number][] {
  const sets = codes.map((c) => new Set(pathVertices(US_STATE_PATHS[c] ?? "").map(key)));
  const [first, ...rest] = sets;
  if (!first) return [];
  return [...first]
    .filter((k) => rest.every((s) => s.has(k)))
    .map((k) => k.split(",").map(Number) as [number, number]);
}

/** Even-odd ray cast across all rings (islands and holes both handled). */
export function pointInPath(d: string, x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings(d)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function distanceToPath(d: string, x: number, y: number): number {
  let best = Infinity;
  for (const [vx, vy] of pathVertices(d)) best = Math.min(best, Math.hypot(vx - x, vy - y));
  return best;
}
```

- [ ] **Step 4: Run geometry test**

Run: `npx vitest run src/lib/us-map-geometry.test.ts`
Expected: PASS (3). If the Four Corners test fails (no shared vertex), STOP: the paths were not built topology-preserving and the tripoint method is invalid — report to Manu before continuing.

- [ ] **Step 5: Write the tripoint table**

`src/lib/us-map-tripoints.ts` — verify each lat/lon against the Wikipedia/USGS article for that tripoint before committing (errors of a few km are ≈0.2px/km at this scale, so ~1km accuracy is sufficient):
```ts
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
  { id: "ut-wy-id", lat: 42.00171, lon: -111.04670, states: ["UT", "WY", "ID"], role: "holdout" },
  { id: "co-ks-ne", lat: 40.00340, lon: -102.05170, states: ["CO", "KS", "NE"], role: "holdout" },
  { id: "ia-mn-sd", lat: 43.50036, lon: -96.45326, states: ["IA", "MN", "SD"], role: "holdout" },
  { id: "wv-pa-md", lat: 39.72155, lon: -79.47686, states: ["WV", "PA", "MD"], role: "holdout" },
  { id: "tn-nc-ga", lat: 34.98696, lon: -84.32187, states: ["TN", "NC", "GA"], role: "holdout" },
];
```

- [ ] **Step 6: Write `albers.ts` with placeholder-free provisional constants**

`src/lib/albers.ts`:
```ts
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

export const SCALE = 1;
export const TX = 0;
export const TY = 0;

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
```

- [ ] **Step 7: Write the failing alignment test**

`src/lib/albers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ALIGNMENT_TOLERANCE_PX, projectAlbers } from "./albers";
import { sharedVertices } from "./us-map-geometry";
import { TRIPOINTS } from "./us-map-tripoints";

function nearestShared(states: string[], x: number, y: number): number {
  const candidates = sharedVertices(states);
  expect(candidates.length, `no shared vertex for ${states.join("/")}`).toBeGreaterThan(0);
  return Math.min(...candidates.map(([vx, vy]) => Math.hypot(vx - x, vy - y)));
}

describe("albers alignment with us-map-paths", () => {
  it("has at least 4 held-out tripoints", () => {
    expect(TRIPOINTS.filter((t) => t.role === "holdout").length).toBeGreaterThanOrEqual(4);
  });

  it("tolerance is never below 2px", () => {
    expect(ALIGNMENT_TOLERANCE_PX).toBeGreaterThanOrEqual(2);
  });

  for (const t of TRIPOINTS.filter((p) => p.role === "holdout")) {
    it(`projects held-out ${t.id} within tolerance`, () => {
      const [x, y] = projectAlbers(t.lat, t.lon);
      expect(nearestShared(t.states, x, y)).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    });
  }
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npx vitest run src/lib/albers.test.ts`
Expected: the 5 held-out cases FAIL (SCALE=1, TX=TY=0 projects everything near the origin).

- [ ] **Step 9: Write the fit script**

`scripts/fit-albers.ts`:
```ts
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
```

- [ ] **Step 10: Run the fit**

Run: `npx tsx scripts/fit-albers.ts`
Expected: prints SCALE (≈1000–1300 range for a 960-wide map of the lower 48 — [Guessing], a sanity check only), residuals, and a tolerance. Exit 0. If it exits 1 (>5px), STOP and report the residual table to Manu; do not tune parameters to force a pass.

- [ ] **Step 11: Paste the constants.** Edit `src/lib/albers.ts`: replace `SCALE = 1`, `TX = 0`, `TY = 0` with the printed values, and `ALIGNMENT_TOLERANCE_PX = 2` with the printed tolerance. Add a comment line above it: `// measured 2026-09-28: max holdout <value>px (<id>)`.

- [ ] **Step 12: Run both tests**

Run: `npx vitest run src/lib/albers.test.ts src/lib/us-map-geometry.test.ts`
Expected: PASS, 10 tests (albers: 2 + 5 held-out = 7; geometry: 3).

- [ ] **Step 13: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/albers.ts src/lib/albers.test.ts src/lib/us-map-geometry.ts src/lib/us-map-geometry.test.ts src/lib/us-map-tripoints.ts scripts/fit-albers.ts
git commit -m "feat(fba-map): hand-written Albers fitted to us-map-paths tripoints

max holdout error <value>px; tolerance <value>px.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/albers.ts src/lib/albers.test.ts src/lib/us-map-geometry.ts src/lib/us-map-geometry.test.ts src/lib/us-map-tripoints.ts scripts/fit-albers.ts
```

---

### Task 3: FC lookup + census divisions

**Files:**
- Create: `src/lib/fc-locations.ts`, `src/lib/fba-inventory-map/divisions.ts`
- Test: `src/lib/fc-locations.test.ts`, `src/lib/fba-inventory-map/divisions.test.ts`

**Interfaces:**
- Consumes: `projectAlbers` (Task 2); `US_STATE_LABEL_POINTS`, `US_STATE_PATHS`, `US_MAP_CODES`, `US_MAP_VIEW_BOX`; fixture (Task 1).
- Produces:
  - `type FcMetro = { name: string; state: string; lat: number; lon: number }`
  - `FC_METROS: Record<string, FcMetro>`; `FC_OVERRIDES: Record<string, string>`
  - `type FcResolution = { kind: "metro"; metro: string; approximate: false } | { kind: "state"; state: string; approximate: true } | { kind: "unplaced" }`
  - `normalizeFcCode(raw: string): string`
  - `resolveFc(code: string): FcResolution`
  - `metroPoint(metro: string): [number, number]` (x/y, computed once and memoised)
  - `statePoint(state: string): [number, number]` (from `US_STATE_LABEL_POINTS`)
  - `DIVISIONS: readonly string[]` (9 names, fixed order) ; `STATE_TO_DIVISION: Record<string, string>` (PR absent)

- [ ] **Step 1: Write the divisions test**

`src/lib/fba-inventory-map/divisions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { US_MAP_CODES } from "@/lib/us-map-paths";
import { DIVISIONS, STATE_TO_DIVISION } from "./divisions";

describe("census divisions", () => {
  it("has exactly 9 divisions", () => expect(DIVISIONS).toHaveLength(9));
  it("maps every map state except PR to a known division", () => {
    for (const code of US_MAP_CODES.filter((c) => c !== "PR")) {
      expect(DIVISIONS, code).toContain(STATE_TO_DIVISION[code]);
    }
    expect(STATE_TO_DIVISION.PR).toBeUndefined();
  });
  it("puts DC in South Atlantic and NY in Middle Atlantic", () => {
    expect(STATE_TO_DIVISION.DC).toBe("South Atlantic");
    expect(STATE_TO_DIVISION.NY).toBe("Middle Atlantic");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/fba-inventory-map/divisions.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement divisions**

`src/lib/fba-inventory-map/divisions.ts`:
```ts
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
```

- [ ] **Step 4: Run** — PASS (3).

- [ ] **Step 5: Write the FC lookup test**

`src/lib/fc-locations.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { US_MAP_VIEW_BOX, US_STATE_PATHS } from "@/lib/us-map-paths";
import { distanceToPath, pointInPath } from "./us-map-geometry";
import { FC_METROS, FC_OVERRIDES, metroPoint, normalizeFcCode, resolveFc } from "./fc-locations";
import fixture from "./__fixtures__/fc-top150-2026-08.json";

const COLLISIONS = ["SAT", "SLC", "SDF", "SAN", "SAV", "SMF", "SNA", "SWF", "SCK", "SBD", "SBN", "SYR", "SJA"];

describe("normalizeFcCode", () => {
  it("strips quotes and whitespace and upper-cases", () => {
    expect(normalizeFcCode(`'"phx7" `)).toBe("PHX7");
  });
});

describe("resolveFc", () => {
  it("resolves a metro prefix", () => {
    expect(resolveFc("PHX7")).toEqual({ kind: "metro", metro: "PHX", approximate: false });
  });
  it("normalises quoted input", () => {
    expect(resolveFc(`'"PHX7"'`)).toEqual({ kind: "metro", metro: "PHX", approximate: false });
  });
  it.each(COLLISIONS)("%s1 resolves to a metro, not an S+state anchor", (p) => {
    expect(resolveFc(`${p}1`).kind).toBe("metro");
  });
  it("SFL4 → Florida, approximate", () => {
    expect(resolveFc("SFL4")).toEqual({ kind: "state", state: "FL", approximate: true });
  });
  it("SAX1 (S + non-state) → unplaced unless overridden", () => {
    if (!FC_OVERRIDES.SAX1 && !FC_OVERRIDES.SAX && !FC_METROS.SAX) {
      expect(resolveFc("SAX1")).toEqual({ kind: "unplaced" });
    }
  });
  it("SDC1 is not read as S + DC", () => {
    if (!FC_OVERRIDES.SDC1 && !FC_OVERRIDES.SDC && !FC_METROS.SDC) {
      expect(resolveFc("SDC1")).toEqual({ kind: "unplaced" });
    }
  });
  it("unknown code → unplaced", () => {
    expect(resolveFc("ZZZ9")).toEqual({ kind: "unplaced" });
  });
  it("exact override beats prefix", () => {
    const [code, target] = Object.entries(FC_OVERRIDES).find(([k]) => k.length > 3) ?? [];
    if (code && target) expect(resolveFc(code)).toEqual({ kind: "metro", metro: target, approximate: false });
  });
});

describe("tables", () => {
  it("every override target exists in FC_METROS", () => {
    for (const [code, target] of Object.entries(FC_OVERRIDES)) expect(FC_METROS[target], code).toBeDefined();
  });
  it("every metro projects inside the viewBox and inside (or ≤3px from) its own state", () => {
    for (const [key, m] of Object.entries(FC_METROS)) {
      if (["AK", "HI", "PR"].includes(m.state)) continue;
      const [x, y] = metroPoint(key);
      expect(x, key).toBeGreaterThanOrEqual(0);
      expect(x, key).toBeLessThanOrEqual(US_MAP_VIEW_BOX.width);
      expect(y, key).toBeGreaterThanOrEqual(0);
      expect(y, key).toBeLessThanOrEqual(US_MAP_VIEW_BOX.height);
      const d = US_STATE_PATHS[m.state];
      expect(pointInPath(d, x, y) || distanceToPath(d, x, y) <= 3, `${key} outside ${m.state}`).toBe(true);
    }
  });
});

describe("coverage", () => {
  it("≥ 93% of top-150 Aug 2026 units resolve to a metro or state", () => {
    const rows = fixture as { code: string; units: number }[];
    const total = rows.reduce((s, r) => s + r.units, 0);
    const placed = rows.filter((r) => resolveFc(r.code).kind !== "unplaced").reduce((s, r) => s + r.units, 0);
    expect(placed / total).toBeGreaterThanOrEqual(0.93);
  });
});
```

- [ ] **Step 6: Run to verify it fails** — `npx vitest run src/lib/fc-locations.test.ts` → FAIL (module missing).

- [ ] **Step 7: Implement the lookup mechanics**

`src/lib/fc-locations.ts` (the tables are filled in Step 8):
```ts
import { projectAlbers } from "@/lib/albers";
import { US_MAP_CODES, US_STATE_LABEL_POINTS } from "@/lib/us-map-paths";

export type FcMetro = { name: string; state: string; lat: number; lon: number };

/** Amazon FC metros keyed by the 3-letter (IATA-style) code prefix. lat/lon = metro, not a building. */
export const FC_METROS: Record<string, FcMetro> = {
  // filled in Step 8
};

/** Full codes or prefixes the prefix rules get wrong → FC_METROS key. */
export const FC_OVERRIDES: Record<string, string> = {
  // filled in Step 8
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
```

- [ ] **Step 8: Author the tables from the fixture.**
  1. Print the prefixes to cover: `node -e "const f=require('./src/lib/__fixtures__/fc-top150-2026-08.json');const m={};for(const r of f){const p=r.code.slice(0,3);m[p]=(m[p]||0)+r.units};console.log(Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([p,u])=>p+':'+u).join(' '))"`
  2. For each prefix that is an Amazon FC metro, add an `FC_METROS` entry with the metro's city name, state, and lat/lon (4 decimals). Seed entries (verified metros, keep them):
```ts
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
```
  3. For codes whose prefix is NOT their metro (spec list: `KRB`, `MQY`, `LUK`, `IGQ`, `GYR`, `PCW`, `RMN`, `TEB`, `MMU`, `HGR`, `AVP`, resolvable `X***`), add the metro to `FC_METROS` and an `FC_OVERRIDES` entry mapping the code/prefix to it (e.g. `KRB: "SAN"` if KRB is the San Diego-area metro in Amazon's scheme — confirm each one individually; if a code's location can't be confirmed from a public source, leave it unplaced rather than guess).
  4. Stop adding once the coverage test passes with margin (target ≥ 95%).

- [ ] **Step 9: Run** — `npx vitest run src/lib/fc-locations.test.ts src/lib/fba-inventory-map/divisions.test.ts` → PASS. (The JSON fixture import needs `resolveJsonModule`; if tsc later flags it, check `tsconfig.json` before changing anything.) If "outside its own state" fails for a metro, the lat/lon is wrong — fix the data, never the tolerance.

- [ ] **Step 10: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fc-locations.ts src/lib/fc-locations.test.ts src/lib/fba-inventory-map/divisions.ts src/lib/fba-inventory-map/divisions.test.ts
git commit -m "feat(fba-map): FC metro lookup (overrides > prefix > S+state > unplaced) + census divisions

top-150 coverage <measured>%.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fc-locations.ts src/lib/fc-locations.test.ts src/lib/fba-inventory-map/divisions.ts src/lib/fba-inventory-map/divisions.test.ts
```

---

### Task 4: Payload types, month helpers, and `aggregate`

**Files:**
- Create: `src/lib/fba-inventory-map/types.ts`, `src/lib/fba-inventory-map/month.ts`, `src/lib/fba-inventory-map/aggregate.ts`
- Test: `src/lib/fba-inventory-map/month.test.ts`, `src/lib/fba-inventory-map/aggregate.test.ts`

**Interfaces:**
- Consumes: `resolveFc`, `metroPoint`, `statePoint`, `FC_METROS`, `normalizeFcCode` (Task 3); `DIVISIONS`, `STATE_TO_DIVISION` (Task 3); `stateDisplayName` from `@/lib/reports/order-geography`.
- Produces (types.ts):
```ts
export type FcRow = { code: string; units: number; fee: number };
export type StockRow = { fc: string; units: number; fee: number };
export type Dot = {
  key: string; label: string; state: string; x: number; y: number;
  units: number; share: number; approximate: boolean; fcs: FcRow[];
};
export type DemandUnavailableReason = "account_not_mirrored" | "month_outside_window" | "no_orders";
export type DemandInput =
  | { status: "ok"; byState: Record<string, number>; totalUnits: number }
  | { status: "unavailable"; reason: DemandUnavailableReason };
export type Demand =
  | { status: "ok"; byState: Record<string, number>; totalUnits: number; note: "includes_fbm" }
  | { status: "unavailable"; reason: DemandUnavailableReason };
export type DivisionRow = { division: string; demandShare: number; stockShare: number; gapPts: number };
export type FbaMapBody = {
  dots: Dot[];
  unplaced: { units: number; share: number; fcs: FcRow[] };
  totals: { units: number; placedUnits: number; fee: number };
  demand: Demand;
  divisions: DivisionRow[] | null;
};
export type AsinOption = { asin: string; units: number; title: string };
export type FbaMapResponse = FbaMapBody & {
  accountId: string; month: string | null; availableMonths: string[];
  /** Filled by Task 7; Task 5 returns null / []. */
  asin: string | null; asins: AsinOption[];
};
```
- Produces (month.ts): `isMonth(s: string): boolean`; `monthRange(m: string): { start: string; endExclusive: string }`.
- Produces (aggregate.ts): `aggregate(stock: StockRow[], demand: DemandInput): FbaMapBody`; `EMPTY_BODY(demand: DemandInput): FbaMapBody`.

- [ ] **Step 1: Write month test**

`src/lib/fba-inventory-map/month.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isMonth, monthRange } from "./month";

describe("month", () => {
  it("validates YYYY-MM", () => {
    expect(isMonth("2026-08")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-8", "26-08", "2026-08-01", "", "2026-08'; drop"]) expect(isMonth(bad), bad).toBe(false);
  });
  it("ranges are half-open and roll the year", () => {
    expect(monthRange("2026-08")).toEqual({ start: "2026-08-01", endExclusive: "2026-09-01" });
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/fba-inventory-map/month.test.ts`

- [ ] **Step 3: Implement types.ts (block above verbatim) and month.ts**

`src/lib/fba-inventory-map/month.ts`:
```ts
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

/** String math only — dates never cross module boundaries as Date. */
export function monthRange(m: string): { start: string; endExclusive: string } {
  const [y, mo] = m.split("-").map(Number);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { start: `${m}-01`, endExclusive: `${ny}-${String(nm).padStart(2, "0")}-01` };
}
```

- [ ] **Step 4: Run → PASS (2).**

- [ ] **Step 5: Write aggregate test**

`src/lib/fba-inventory-map/aggregate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { aggregate } from "./aggregate";
import type { DemandInput } from "./types";

const NO_DEMAND: DemandInput = { status: "unavailable", reason: "no_orders" };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("aggregate", () => {
  it("merges FCs of one metro into one dot, largest first", () => {
    const body = aggregate(
      [
        { fc: "PHX7", units: 30, fee: 3 },
        { fc: "PHX5", units: 10, fee: 1 },
        { fc: "SDF8", units: 60, fee: 6 },
      ],
      NO_DEMAND,
    );
    expect(body.dots.map((d) => d.key)).toEqual(["SDF", "PHX"]);
    const phx = body.dots[1];
    expect(phx.units).toBe(40);
    expect(phx.fcs.map((f) => f.code)).toEqual(["PHX7", "PHX5"]);
    expect(phx.approximate).toBe(false);
    expect(phx.label).toBe("Phoenix, AZ");
  });

  it("merges approximate S+state FCs per state into one hollow dot", () => {
    const body = aggregate([{ fc: "SFL4", units: 5, fee: 0 }, { fc: "SFL9", units: 5, fee: 0 }], NO_DEMAND);
    expect(body.dots).toHaveLength(1);
    expect(body.dots[0]).toMatchObject({ key: "state:FL", label: "Florida (approx.)", approximate: true, units: 10 });
  });

  it("puts unresolvable FCs in the unplaced bucket and shares sum to 1", () => {
    const body = aggregate([{ fc: "PHX7", units: 75, fee: 1 }, { fc: "ZZZ1", units: 25, fee: 2 }], NO_DEMAND);
    expect(body.unplaced).toMatchObject({ units: 25, share: 0.25 });
    expect(body.unplaced.fcs).toEqual([{ code: "ZZZ1", units: 25, fee: 2 }]);
    expect(sum(body.dots.map((d) => d.share)) + body.unplaced.share).toBeCloseTo(1, 10);
    expect(body.totals).toEqual({ units: 100, placedUnits: 75, fee: 3 });
  });

  it("merges duplicate codes after normalisation", () => {
    const body = aggregate([{ fc: `'PHX7'`, units: 1, fee: 1 }, { fc: "PHX7", units: 2, fee: 1 }], NO_DEMAND);
    expect(body.dots[0].fcs).toEqual([{ code: "PHX7", units: 3, fee: 2 }]);
  });

  it("all-unplaced: no dots, 100% unplaced, no NaN anywhere", () => {
    const body = aggregate([{ fc: "ZZZ1", units: 10, fee: 1 }], {
      status: "ok", byState: { CA: 5 }, totalUnits: 5,
    });
    expect(body.dots).toEqual([]);
    expect(body.unplaced.share).toBe(1);
    // JSON.stringify turns NaN into null, so no "null" anywhere ⇒ no NaN leaked.
    expect(JSON.stringify(body)).not.toMatch(/null/);
    for (const d of body.divisions ?? []) {
      expect(Number.isNaN(d.stockShare)).toBe(false);
      expect(d.stockShare).toBe(0);
    }
  });

  it("empty stock → empty body with zero totals", () => {
    const body = aggregate([], NO_DEMAND);
    expect(body).toMatchObject({ dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } });
  });

  it("divisions: placed-only stock share, demand share over mapped states, gap in points", () => {
    const body = aggregate(
      [
        { fc: "EWR4", units: 50, fee: 0 }, // NJ → Middle Atlantic
        { fc: "PHX7", units: 50, fee: 0 }, // AZ → Mountain
        { fc: "ZZZ1", units: 100, fee: 0 }, // unplaced, excluded from stock share
      ],
      { status: "ok", byState: { NY: 80, AZ: 20 }, totalUnits: 110 },
    );
    const mid = body.divisions!.find((d) => d.division === "Middle Atlantic")!;
    expect(mid).toEqual({ division: "Middle Atlantic", demandShare: 0.8, stockShare: 0.5, gapPts: -30 });
    expect(body.divisions).toHaveLength(9);
    expect(body.divisions![0].division).toBe("Middle Atlantic"); // sorted by demand share desc
  });

  it("demand all unmapped: ok status, all shares 0, no NaN", () => {
    const body = aggregate([{ fc: "PHX7", units: 1, fee: 0 }], { status: "ok", byState: {}, totalUnits: 12 });
    expect(body.demand).toEqual({ status: "ok", byState: {}, totalUnits: 12, note: "includes_fbm" });
    for (const d of body.divisions!) expect(d.demandShare).toBe(0);
  });

  it("demand unavailable passes through and divisions is null", () => {
    const body = aggregate([{ fc: "PHX7", units: 1, fee: 0 }], { status: "unavailable", reason: "account_not_mirrored" });
    expect(body.demand).toEqual({ status: "unavailable", reason: "account_not_mirrored" });
    expect(body.divisions).toBeNull();
  });
});
```

- [ ] **Step 6: Run → FAIL** (`npx vitest run src/lib/fba-inventory-map/aggregate.test.ts`).

- [ ] **Step 7: Implement aggregate**

`src/lib/fba-inventory-map/aggregate.ts`:
```ts
import { FC_METROS, metroPoint, normalizeFcCode, resolveFc, statePoint } from "@/lib/fc-locations";
import { stateDisplayName } from "@/lib/reports/order-geography";
import { DIVISIONS, STATE_TO_DIVISION } from "./divisions";
import type { Demand, DemandInput, DivisionRow, Dot, FbaMapBody, FcRow, StockRow } from "./types";

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function mergeCodes(stock: StockRow[]): FcRow[] {
  const byCode = new Map<string, FcRow>();
  for (const r of stock) {
    const code = normalizeFcCode(r.fc);
    if (!code) continue;
    const cur = byCode.get(code) ?? { code, units: 0, fee: 0 };
    cur.units += Number(r.units) || 0;
    cur.fee += Number(r.fee) || 0;
    byCode.set(code, cur);
  }
  return [...byCode.values()].sort((a, b) => b.units - a.units);
}

function toDemand(input: DemandInput): Demand {
  return input.status === "ok" ? { ...input, note: "includes_fbm" } : input;
}

export function aggregate(stock: StockRow[], demandInput: DemandInput): FbaMapBody {
  const fcs = mergeCodes(stock);
  const totalUnits = fcs.reduce((s, f) => s + f.units, 0);
  const totalFee = fcs.reduce((s, f) => s + f.fee, 0);

  const groups = new Map<string, Omit<Dot, "share">>();
  const unplaced: FcRow[] = [];
  for (const fc of fcs) {
    const r = resolveFc(fc.code);
    if (r.kind === "unplaced") {
      unplaced.push(fc);
      continue;
    }
    const key = r.kind === "metro" ? r.metro : `state:${r.state}`;
    let g = groups.get(key);
    if (!g) {
      const state = r.kind === "metro" ? FC_METROS[r.metro].state : r.state;
      const [x, y] = r.kind === "metro" ? metroPoint(r.metro) : statePoint(r.state);
      const label = r.kind === "metro" ? FC_METROS[r.metro].name : `${stateDisplayName(r.state)} (approx.)`;
      g = { key, label, state, x, y, units: 0, approximate: r.approximate, fcs: [] };
      groups.set(key, g);
    }
    g.units += fc.units;
    g.fcs.push(fc);
  }

  const dots: Dot[] = [...groups.values()]
    .map((g) => ({ ...g, share: ratio(g.units, totalUnits) }))
    .sort((a, b) => b.units - a.units);
  const placedUnits = dots.reduce((s, d) => s + d.units, 0);
  const unplacedUnits = totalUnits - placedUnits;
  const demand = toDemand(demandInput);

  let divisions: DivisionRow[] | null = null;
  if (demand.status === "ok") {
    const stockBy = new Map<string, number>();
    for (const d of dots) {
      const div = STATE_TO_DIVISION[d.state];
      if (div) stockBy.set(div, (stockBy.get(div) ?? 0) + d.units);
    }
    const demandBy = new Map<string, number>();
    for (const [st, u] of Object.entries(demand.byState)) {
      const div = STATE_TO_DIVISION[st];
      if (div) demandBy.set(div, (demandBy.get(div) ?? 0) + u);
    }
    const mappedDemand = [...demandBy.values()].reduce((a, b) => a + b, 0);
    divisions = DIVISIONS.map((division) => {
      const demandShare = round4(ratio(demandBy.get(division) ?? 0, mappedDemand));
      const stockShare = round4(ratio(stockBy.get(division) ?? 0, placedUnits));
      return { division, demandShare, stockShare, gapPts: Math.round((stockShare - demandShare) * 1000) / 10 };
    }).sort((a, b) => b.demandShare - a.demandShare);
  }

  return {
    dots,
    unplaced: { units: unplacedUnits, share: ratio(unplacedUnits, totalUnits), fcs: unplaced },
    totals: { units: totalUnits, placedUnits, fee: totalFee },
    demand,
    divisions,
  };
}
```
Note: `gapPts` = (stock − demand) × 100, rounded to 0.1. Negative = under-stocked. The test's Middle Atlantic case: 0.5 − 0.8 = −30.

- [ ] **Step 8: Run → PASS (9).** Also re-run Task 3 tests (unchanged, should pass).

- [ ] **Step 9: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fba-inventory-map/types.ts src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/fba-inventory-map/aggregate.ts src/lib/fba-inventory-map/aggregate.test.ts
git commit -m "feat(fba-map): pure aggregate — metro/state dots, unplaced bucket, division gaps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fba-inventory-map/types.ts src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/fba-inventory-map/aggregate.ts src/lib/fba-inventory-map/aggregate.test.ts
```

---

### Task 5: Queries, cache TTL param, and the route

**Files:**
- Create: `src/lib/fba-inventory-map/queries.server.ts`, `src/app/api/reports/fba-inventory-map/route.ts`
- Modify: `src/lib/reports-cache.ts` (`getCachedReport` signature, ~line 17-38)
- Test: `src/app/api/reports/fba-inventory-map/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `aggregate`, `isMonth`, `monthRange`, types (Task 4); `queryRedshiftOrThrow` (`@/lib/redshift`); `db` (`@/lib/db`); `orderGeographyLines` (`@/lib/db/schema`); `getSnapshotMeta` (`@/lib/reports/order-geography-snapshot`); `normalizeShipState` (`@/lib/reports/order-geography`); `getAuthSession` (`@/lib/auth-db`); `isHubStaff` (`@/lib/roles`).
- Produces:
  - `getCachedReport<T>(cacheType: string, cacheKey: string, maxAgeMs?: number): Promise<T | null>` (default unchanged: 24h)
  - `fetchAvailableMonths(accountId: string): Promise<string[]>`
  - `fetchStockRows(accountId: string, month: string): Promise<StockRow[]>`
  - `fetchDemand(accountId: string, month: string): Promise<DemandInput>`
  - `GET /api/reports/fba-inventory-map` → `FbaMapResponse` | `{ error }` (400/401/403/502)
  - Constants exported from route for tests: `MONTHS_CACHE_TYPE = "report-fba-inventory-map-months"`, `CACHE_TYPE = "report-fba-inventory-map"`, `MONTHS_TTL_MS = 12h`, `PAYLOAD_TTL_MS = 7d`.

Refinement vs spec §4.3: an **empty month is not cached at all** (instead of a 12h entry). `getCachedReport` applies TTL at read time with no per-row TTL, so a 12h empty entry would need a second cache type; the empty-month Redshift query is a cheap indexed miss, so skipping the cache is simpler and just as correct.

- [ ] **Step 1: Add the TTL param to `getCachedReport`**

In `src/lib/reports-cache.ts`, change the signature and the age check:
```ts
export async function getCachedReport<T>(
  cacheType: string,
  cacheKey: string,
  maxAgeMs: number = MAX_AGE_MS,
): Promise<T | null> {
```
and `if (age > MAX_AGE_MS) return null;` → `if (age > maxAgeMs) return null;`. Nothing else changes; every existing caller keeps 24h.

- [ ] **Step 2: Write queries.server.ts** (substitute Task 1's measured column names into `STOCK_SQL` / `MONTHS_SQL`; if Task 1 found `month_of_charge` unquoted, the btrim on it is harmless and stays)

```ts
import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderGeographyLines } from "@/lib/db/schema";
import { queryRedshiftOrThrow } from "@/lib/redshift";
import { getSnapshotMeta } from "@/lib/reports/order-geography-snapshot";
import { normalizeShipState } from "@/lib/reports/order-geography";
import { monthRange } from "./month";
import type { DemandInput, StockRow } from "./types";

const T = "amazon_source_data.sellercentral_fbastoragefees_report";

/** Latest download only: an account-month re-downloaded would otherwise double count. */
export const STOCK_SQL = `
with latest as (
  select max(download_date) as d from ${T}
  where account_id = $1 and btrim(month_of_charge, '''" ') = $2
)
select btrim(fulfillment_center, '''" ')          as fc,
       sum(average_quantity_on_hand::float)       as units,
       sum(estimated_monthly_storage_fee::float)  as fee
from ${T}
where account_id = $1
  and btrim(month_of_charge, '''" ') = $2
  and download_date = (select d from latest)
  and btrim(country_code, '''" ') = 'US'
group by 1`;

export const MONTHS_SQL = `
select distinct btrim(month_of_charge, '''" ') as m from ${T}
where account_id = $1 and btrim(country_code, '''" ') = 'US'
order by 1 desc limit 24`;

export async function fetchAvailableMonths(accountId: string): Promise<string[]> {
  const rows = await queryRedshiftOrThrow<{ m: string }>(MONTHS_SQL, [accountId], { timeoutMs: 60_000 });
  return rows.map((r) => r.m).filter((m) => /^\d{4}-\d{2}$/.test(m));
}

export async function fetchStockRows(accountId: string, month: string): Promise<StockRow[]> {
  const rows = await queryRedshiftOrThrow<{ fc: string; units: string | number; fee: string | number }>(
    STOCK_SQL, [accountId, month], { timeoutMs: 60_000 },
  );
  return rows.map((r) => ({ fc: r.fc, units: Number(r.units) || 0, fee: Number(r.fee) || 0 }));
}

export async function fetchDemand(accountId: string, month: string): Promise<DemandInput> {
  const meta = await getSnapshotMeta(accountId);
  if (!meta) return { status: "unavailable", reason: "account_not_mirrored" };
  const { start, endExclusive } = monthRange(month);
  if (start < meta.coveredStart) return { status: "unavailable", reason: "month_outside_window" };

  const rows = await db
    .select({ state: orderGeographyLines.shipState, units: sql<number>`sum(${orderGeographyLines.units})`.mapWith(Number) })
    .from(orderGeographyLines)
    .where(and(
      eq(orderGeographyLines.accountId, accountId),
      gte(orderGeographyLines.purchaseDay, start),
      lt(orderGeographyLines.purchaseDay, endExclusive),
    ))
    .groupBy(orderGeographyLines.shipState);

  const byState: Record<string, number> = {};
  let totalUnits = 0;
  for (const r of rows) {
    totalUnits += r.units;
    const n = normalizeShipState(r.state);
    if (n.kind === "state") byState[n.code] = (byState[n.code] ?? 0) + r.units;
  }
  if (totalUnits === 0) return { status: "unavailable", reason: "no_orders" };
  return { status: "ok", byState, totalUnits };
}
```
Check `server-only` is used elsewhere: `grep -rln '"server-only"' src/lib | head -1`. If no file uses it, delete that import line (don't add a dependency).

- [ ] **Step 3: Write the failing route test**

`src/app/api/reports/fba-inventory-map/__tests__/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAuthSession = vi.fn();
vi.mock("@/lib/auth-db", () => ({ getAuthSession: () => getAuthSession() }));

const getCachedReport = vi.fn();
const setCachedReport = vi.fn();
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: (...a: unknown[]) => getCachedReport(...a),
  setCachedReport: (...a: unknown[]) => setCachedReport(...a),
}));

const fetchAvailableMonths = vi.fn();
const fetchStockRows = vi.fn();
const fetchDemand = vi.fn();
vi.mock("@/lib/fba-inventory-map/queries.server", () => ({
  fetchAvailableMonths: (...a: unknown[]) => fetchAvailableMonths(...a),
  fetchStockRows: (...a: unknown[]) => fetchStockRows(...a),
  fetchDemand: (...a: unknown[]) => fetchDemand(...a),
}));

import { CACHE_TYPE, GET, MONTHS_CACHE_TYPE, MONTHS_TTL_MS, PAYLOAD_TTL_MS } from "../route";

const req = (qs: string) => new NextRequest(`http://localhost/api/reports/fba-inventory-map?${qs}`);

describe("GET /api/reports/fba-inventory-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthSession.mockResolvedValue({ user: { role: "admin" } });
    getCachedReport.mockResolvedValue(null);
    fetchAvailableMonths.mockResolvedValue(["2026-08", "2026-07"]);
    fetchStockRows.mockResolvedValue([{ fc: "PHX7", units: 10, fee: 1 }]);
    fetchDemand.mockResolvedValue({ status: "unavailable", reason: "no_orders" });
  });

  it("401 without a session, 403 for a client", async () => {
    getAuthSession.mockResolvedValueOnce(null);
    expect((await GET(req("accountId=1"))).status).toBe(401);
    getAuthSession.mockResolvedValueOnce({ user: { role: "client" } });
    expect((await GET(req("accountId=1"))).status).toBe(403);
  });

  it("400 on missing/invalid accountId or malformed month", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("accountId=1;drop"))).status).toBe(400);
    expect((await GET(req("accountId=1&month=2026-13"))).status).toBe(400);
    expect(fetchStockRows).not.toHaveBeenCalled();
  });

  it("defaults to the newest month and caches both keys with their TTLs", async () => {
    const json = await (await GET(req("accountId=4283010"))).json();
    expect(json.month).toBe("2026-08");
    expect(json.availableMonths).toEqual(["2026-08", "2026-07"]);
    expect(json.dots[0].key).toBe("PHX");
    expect(fetchStockRows).toHaveBeenCalledWith("4283010", "2026-08");
    expect(getCachedReport).toHaveBeenCalledWith(MONTHS_CACHE_TYPE, "4283010", MONTHS_TTL_MS);
    expect(getCachedReport).toHaveBeenCalledWith(CACHE_TYPE, "4283010:2026-08", PAYLOAD_TTL_MS);
    expect(setCachedReport).toHaveBeenCalledWith(MONTHS_CACHE_TYPE, "4283010", ["2026-08", "2026-07"]);
    const payloadWrite = setCachedReport.mock.calls.find((c) => c[0] === CACHE_TYPE)!;
    expect(payloadWrite[2]).not.toHaveProperty("availableMonths");
  });

  it("cache hit: no Redshift, fresh availableMonths merged in", async () => {
    getCachedReport.mockImplementation(async (type: string) =>
      type === MONTHS_CACHE_TYPE ? ["2026-09", "2026-08"] : { dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 5, placedUnits: 0, fee: 0 }, demand: { status: "unavailable", reason: "no_orders" }, divisions: null },
    );
    const json = await (await GET(req("accountId=1&month=2026-08"))).json();
    expect(fetchStockRows).not.toHaveBeenCalled();
    expect(fetchAvailableMonths).not.toHaveBeenCalled();
    expect(json.availableMonths).toEqual(["2026-09", "2026-08"]);
  });

  it("month not in availableMonths: 200, empty, not cached, months intact", async () => {
    fetchStockRows.mockResolvedValueOnce([]);
    const res = await GET(req("accountId=1&month=2019-01"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ month: "2019-01", dots: [], availableMonths: ["2026-08", "2026-07"] });
    expect(setCachedReport.mock.calls.some((c) => c[0] === CACHE_TYPE)).toBe(false);
  });

  it("account with no reports: month null, empty body, no stock query", async () => {
    fetchAvailableMonths.mockResolvedValueOnce([]);
    const json = await (await GET(req("accountId=1"))).json();
    expect(json).toMatchObject({ month: null, availableMonths: [], dots: [] });
    expect(fetchStockRows).not.toHaveBeenCalled();
  });

  it("passes demand-unavailable reasons through", async () => {
    fetchDemand.mockResolvedValueOnce({ status: "unavailable", reason: "account_not_mirrored" });
    const json = await (await GET(req("accountId=1&month=2026-08"))).json();
    expect(json.demand).toEqual({ status: "unavailable", reason: "account_not_mirrored" });
    expect(json.divisions).toBeNull();
  });

  it("Redshift error → 502 and nothing cached", async () => {
    fetchStockRows.mockRejectedValueOnce(new Error("statement timeout"));
    const res = await GET(req("accountId=1&month=2026-08"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("statement timeout");
    expect(setCachedReport.mock.calls.some((c) => c[0] === CACHE_TYPE)).toBe(false);
  });
});
```

- [ ] **Step 4: Run → FAIL** (`npx vitest run src/app/api/reports/fba-inventory-map`), route module missing.

- [ ] **Step 5: Implement the route**

`src/app/api/reports/fba-inventory-map/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { aggregate } from "@/lib/fba-inventory-map/aggregate";
import { isMonth } from "@/lib/fba-inventory-map/month";
import { fetchAvailableMonths, fetchDemand, fetchStockRows } from "@/lib/fba-inventory-map/queries.server";
import type { FbaMapBody, FbaMapResponse } from "@/lib/fba-inventory-map/types";

export const maxDuration = 120;

export const CACHE_TYPE = "report-fba-inventory-map";
export const MONTHS_CACHE_TYPE = "report-fba-inventory-map-months";
export const MONTHS_TTL_MS = 12 * 60 * 60 * 1000;
export const PAYLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ACCOUNT_RE = /^[A-Za-z0-9_-]{1,64}$/;

const emptyBody = (): FbaMapBody => ({
  dots: [],
  unplaced: { units: 0, share: 0, fcs: [] },
  totals: { units: 0, placedUnits: 0, fee: 0 },
  demand: { status: "unavailable", reason: "no_orders" },
  divisions: null,
});

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const accountId = params.get("accountId")?.trim() ?? "";
  const monthParam = params.get("month");
  if (!ACCOUNT_RE.test(accountId)) return NextResponse.json({ error: "valid accountId is required" }, { status: 400 });
  if (monthParam !== null && !isMonth(monthParam)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  try {
    let availableMonths = await getCachedReport<string[]>(MONTHS_CACHE_TYPE, accountId, MONTHS_TTL_MS);
    if (!availableMonths) {
      availableMonths = await fetchAvailableMonths(accountId);
      await setCachedReport(MONTHS_CACHE_TYPE, accountId, availableMonths);
    }

    const month = monthParam ?? availableMonths[0] ?? null;
    if (!month) {
      return NextResponse.json({ accountId, month: null, availableMonths, asin: null, asins: [], ...emptyBody() } satisfies FbaMapResponse);
    }

    const key = `${accountId}:${month}`;
    let body = await getCachedReport<FbaMapBody>(CACHE_TYPE, key, PAYLOAD_TTL_MS);
    if (!body) {
      const [stock, demand] = await Promise.all([fetchStockRows(accountId, month), fetchDemand(accountId, month)]);
      body = aggregate(stock, demand);
      // An empty month is not cached: its report may land later, and the miss is cheap.
      if (body.totals.units > 0) await setCachedReport(CACHE_TYPE, key, body);
    }
    return NextResponse.json({ accountId, month, availableMonths, asin: null, asins: [], ...body } satisfies FbaMapResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
```

- [ ] **Step 6: Run → PASS (8).** `npx vitest run src/app/api/reports/fba-inventory-map`

- [ ] **Step 7: Guard the reports-cache change** — `npx vitest run src/lib src/app/api/reports` (every existing caller still passes; predicted: no new failures vs. a pre-change run of the same command — run it once on `HEAD~` first if in doubt).

- [ ] **Step 8: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/reports-cache.ts src/lib/fba-inventory-map/queries.server.ts src/app/api/reports/fba-inventory-map/route.ts src/app/api/reports/fba-inventory-map/__tests__/route.test.ts
git commit -m "feat(fba-map): route + Redshift/Postgres queries; optional TTL on getCachedReport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/reports-cache.ts src/lib/fba-inventory-map/queries.server.ts src/app/api/reports/fba-inventory-map/route.ts src/app/api/reports/fba-inventory-map/__tests__/route.test.ts
```

---

### Task 6: UI — overlay slot, dots, callout, table, section, page

Read `DESIGN.md` before starting this task (tokens in Global Constraints are the summary, not a substitute).

**Files:**
- Modify: `src/components/reports/v2/us-choropleth.tsx` (props + one line inside `<svg>`)
- Create: `src/components/reports/fba-inventory-map/fc-dot-overlay.tsx`, `division-callout.tsx`, `fc-table.tsx`, `fba-inventory-map-section.tsx`, `src/app/reports/fba-inventory-map/page.tsx`
- Test: `src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`

**Interfaces:**
- Consumes: `FbaMapResponse`, `Dot`, `DivisionRow`, `FcRow` (Task 4); `resolveFc`, `FC_METROS` (Task 3); `UsChoropleth` (`@/components/reports/v2/us-choropleth`); `useReportControls`, `ReportsControlsBar`, `PageMetaSlot` (as in `src/app/reports/order-geography/page.tsx`); `stateDisplayName`.
- Produces:
  - `UsChoropleth` gains `overlay?: React.ReactNode` (rendered last inside `<svg>`, after labels).
  - `dotRadius(units: number, max: number): number` → `3 + 19 * sqrt(units/max)`, 0 when `max <= 0`.
  - `FcDotOverlay({ dots, onHover }: { dots: Dot[]; onHover: (h: { dot: Dot; x: number; y: number } | null) => void })`
  - `gapTone(gapPts: number): "red" | "amber" | "green"` (< −5 red, > 5 green, else amber), exported from `division-callout.tsx`.
  - `FbaInventoryMapSection({ accountId, refreshKey }: { accountId: string; refreshKey: number })`

- [ ] **Step 1: Write the failing section test**

`src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FbaInventoryMapSection } from "./fba-inventory-map-section";
import { dotRadius } from "./fc-dot-overlay";
import { gapTone } from "./division-callout";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";

function payload(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  return {
    accountId: "1", month: "2026-08", availableMonths: ["2026-08", "2026-07"], asin: null, asins: [],
    dots: [
      { key: "PHX", label: "Phoenix, AZ", state: "AZ", x: 150, y: 400, units: 60, share: 0.6, approximate: false, fcs: [{ code: "PHX7", units: 60, fee: 6 }] },
      { key: "state:FL", label: "Florida (approx.)", state: "FL", x: 562, y: 501, units: 20, share: 0.2, approximate: true, fcs: [{ code: "SFL4", units: 20, fee: 2 }] },
    ],
    unplaced: { units: 20, share: 0.2, fcs: [{ code: "ZZZ1", units: 20, fee: 1 }] },
    totals: { units: 100, placedUnits: 80, fee: 9 },
    demand: { status: "ok", byState: { AZ: 5, FL: 15 }, totalUnits: 20, note: "includes_fbm" },
    divisions: [
      { division: "South Atlantic", demandShare: 0.75, stockShare: 0.25, gapPts: -50 },
      { division: "Mountain", demandShare: 0.25, stockShare: 0.75, gapPts: 50 },
    ],
    ...o,
  };
}

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });
const ok = (p: FbaMapResponse) => ({ ok: true, status: 200, json: async () => p });

describe("helpers", () => {
  it("dotRadius spans 3..22 and is 0 for no max", () => {
    expect(dotRadius(0, 100)).toBe(3);
    expect(dotRadius(100, 100)).toBe(22);
    expect(dotRadius(5, 0)).toBe(0);
  });
  it("gapTone thresholds at ±5 points", () => {
    expect(gapTone(-5.1)).toBe("red");
    expect(gapTone(-5)).toBe("amber");
    expect(gapTone(5)).toBe("amber");
    expect(gapTone(5.1)).toBe("green");
  });
});

describe("FbaInventoryMapSection", () => {
  it("renders solid and hollow dots, unplaced stat, FBM note, and division callout", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Demand includes FBM orders.");
    expect(container.querySelectorAll('[data-dot="solid"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-dot="hollow"]')).toHaveLength(1);
    expect(screen.getByTestId("stat-unplaced")).toHaveTextContent("20%");
    expect(screen.getByTestId("division-callout")).toHaveTextContent("South Atlantic");
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1");
  });

  it("hides the callout and shows the reason when demand is unavailable", async () => {
    fetchMock.mockResolvedValue(ok(payload({ demand: { status: "unavailable", reason: "account_not_mirrored" }, divisions: null })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText(/aren't mirrored/i);
    expect(screen.queryByTestId("division-callout")).toBeNull();
  });

  it("renders 100% unplaced without NaN", async () => {
    fetchMock.mockResolvedValue(ok(payload({ dots: [], unplaced: { units: 10, share: 1, fcs: [{ code: "ZZZ1", units: 10, fee: 1 }] }, totals: { units: 10, placedUnits: 0, fee: 1 } })));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("stat-unplaced");
    expect(container.textContent).not.toContain("NaN");
    expect(screen.getByTestId("stat-unplaced")).toHaveTextContent("100%");
  });

  it("empty month lists available months as pills that refetch", async () => {
    fetchMock.mockResolvedValueOnce(ok(payload({ month: "2026-09", dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } })));
    fetchMock.mockResolvedValueOnce(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const pill = await screen.findByRole("button", { name: "2026-07" });
    fireEvent.click(pill);
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&month=2026-07"));
  });

  it("account with no reports at all shows the empty state", async () => {
    fetchMock.mockResolvedValue(ok(payload({ month: null, availableMonths: [], dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("No FBA storage-fee reports for this account");
  });

  it("table sorts by units desc by default and tags unplaced/approx rows", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("PHX7");
    expect(within(table).getByText("unplaced")).toBeTruthy();
    expect(within(table).getByText("approx.")).toBeTruthy();
    fireEvent.click(within(table).getByRole("button", { name: /FC/ }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("PHX7"); // asc by code: PHX7 < SFL4 < ZZZ1
  });

  it("error → retry card; retry refetches", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "statement timeout" }) });
    fetchMock.mockResolvedValueOnce(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText("Demand includes FBM orders.");
  });

  it("ignores a stale response after account change", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    fetchMock.mockResolvedValueOnce(ok(payload({ accountId: "2", dots: [] })));
    const { rerender, container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveFirst(ok(payload()));
    await waitFor(() => expect(container.querySelectorAll('[data-dot]')).toHaveLength(0));
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/components/reports/fba-inventory-map`).

- [ ] **Step 3: Add the overlay slot to `UsChoropleth`.** In the props destructure add `overlay,` and in the type `overlay?: React.ReactNode;` (import `type ReactNode` from "react" alongside `useId, useState`, and type it `overlay?: ReactNode`). Render `{overlay}` as the last child of `<svg>`, after the labels map. No other change. Run `npx vitest run src/components/reports/v2` — expect the same result as before (no-hub-orange and order-geography tests still pass).

- [ ] **Step 4: Write `fc-dot-overlay.tsx`**

```tsx
"use client";
import type { Dot } from "@/lib/fba-inventory-map/types";

const MIN_R = 3;
const MAX_R = 22;

/** √-scaled so area tracks units; scaled to the account's largest dot. */
export function dotRadius(units: number, max: number): number {
  if (max <= 0) return 0;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(Math.max(0, units) / max);
}

export function FcDotOverlay({
  dots,
  onHover,
}: {
  dots: Dot[];
  onHover: (h: { dot: Dot; x: number; y: number } | null) => void;
}) {
  const max = Math.max(0, ...dots.map((d) => d.units));
  // Largest first so small dots paint on top.
  const ordered = [...dots].sort((a, b) => b.units - a.units);
  return (
    <g>
      {ordered.map((d) => (
        <circle
          key={d.key}
          data-dot={d.approximate ? "hollow" : "solid"}
          cx={d.x}
          cy={d.y}
          r={dotRadius(d.units, max)}
          fill={d.approximate ? "none" : "var(--foreground)"}
          fillOpacity={d.approximate ? undefined : 0.85}
          stroke={d.approximate ? "var(--foreground)" : "var(--card)"}
          strokeWidth={d.approximate ? 2 : 1.5}
          className="cursor-pointer"
          onMouseMove={(e) => onHover({ dot: d, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onHover(null)}
        />
      ))}
    </g>
  );
}
```

- [ ] **Step 5: Write `division-callout.tsx`**

```tsx
"use client";
import type { DivisionRow } from "@/lib/fba-inventory-map/types";

/** ±5 points is a starting guess (spec §5); one constant to tune. */
export const GAP_THRESHOLD_PTS = 5;

export function gapTone(gapPts: number): "red" | "amber" | "green" {
  if (gapPts < -GAP_THRESHOLD_PTS) return "red";
  if (gapPts > GAP_THRESHOLD_PTS) return "green";
  return "amber";
}

const TONE: Record<ReturnType<typeof gapTone>, string> = {
  red: "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  amber: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  green: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function DivisionCallout({ rows }: { rows: DivisionRow[] }) {
  return (
    <section data-testid="division-callout" className="rounded-[18px] border border-stone-200 bg-card p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Placement vs demand</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">By US Census division. Stock share is of placed units only.</p>
      <div className="mt-3 space-y-1.5">
        <div className="grid grid-cols-[1fr_80px_80px_90px] text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <span>Division</span><span className="text-right">Demand</span><span className="text-right">Stock</span><span className="text-right">Gap</span>
        </div>
        {rows.map((r) => (
          <div key={r.division} className="grid grid-cols-[1fr_80px_80px_90px] items-center text-[13px]">
            <span>{r.division}</span>
            <span className="text-right tabular-nums">{pct(r.demandShare)}</span>
            <span className="text-right tabular-nums">{pct(r.stockShare)}</span>
            <span className="text-right">
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${TONE[gapTone(r.gapPts)]}`}>
                {r.gapPts > 0 ? "+" : ""}{r.gapPts.toFixed(1)} pts
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Write `fc-table.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import { FC_METROS, resolveFc } from "@/lib/fc-locations";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";

type Row = { code: string; metro: string; state: string; units: number; share: number; fee: number; tag: "approx." | "unplaced" | null };
type SortKey = "code" | "metro" | "state" | "units" | "share" | "fee";

const STONE = "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";

function toRows(data: FbaMapResponse): Row[] {
  const total = data.totals.units;
  const share = (u: number) => (total > 0 ? u / total : 0);
  const rows: Row[] = [];
  for (const d of data.dots) {
    for (const f of d.fcs) {
      const r = resolveFc(f.code);
      const metro = r.kind === "metro" ? FC_METROS[r.metro].name : "—";
      rows.push({ code: f.code, metro, state: d.state, units: f.units, share: share(f.units), fee: f.fee, tag: d.approximate ? "approx." : null });
    }
  }
  for (const f of data.unplaced.fcs) rows.push({ code: f.code, metro: "—", state: "—", units: f.units, share: share(f.units), fee: f.fee, tag: "unplaced" });
  return rows;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function FcTable({ data }: { data: FbaMapResponse }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "units", dir: -1 });
  const rows = useMemo(() => {
    const r = toRows(data);
    return r.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      return (typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv))) * sort.dir;
    });
  }, [data, sort]);

  const head = (key: SortKey, label: string, right = false) => (
    <th className={`py-2 ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "units" || key === "share" || key === "fee" ? -1 : 1 }))}
        className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
      >
        {label}
      </button>
    </th>
  );

  return (
    <section className="rounded-[18px] border border-stone-200 bg-card p-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr>{head("code", "FC")}{head("metro", "Metro")}{head("state", "State")}{head("units", "Units", true)}{head("share", "Share", true)}{head("fee", "Est. storage fee", true)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-stone-100">
              <td className="py-1.5 font-medium">
                {r.code}
                {r.tag && (
                  <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${r.tag === "unplaced" ? STONE : AMBER}`}>{r.tag}</span>
                )}
              </td>
              <td>{r.metro}</td>
              <td>{r.state === "—" ? "—" : stateDisplayName(r.state)}</td>
              <td className="text-right tabular-nums">{nf.format(r.units)}</td>
              <td className="text-right tabular-nums">{(r.share * 100).toFixed(1)}%</td>
              <td className="text-right tabular-nums">{usd.format(r.fee)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 7: Write `fba-inventory-map-section.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { UsChoropleth, type ChoroplethDatum } from "@/components/reports/v2/us-choropleth";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { DemandUnavailableReason, Dot, FbaMapResponse } from "@/lib/fba-inventory-map/types";
import { FcDotOverlay } from "./fc-dot-overlay";
import { DivisionCallout } from "./division-callout";
import { FcTable } from "./fc-table";

const REASON: Record<DemandUnavailableReason, string> = {
  account_not_mirrored: "Demand shading is off: this account's orders aren't mirrored into the Hub (Active accounts only).",
  month_outside_window: "Demand shading is off: this month is outside the 365-day order window.",
  no_orders: "Demand shading is off: no orders were recorded for this month.",
};

const CARD = "rounded-[18px] border border-stone-200 bg-card p-5";
const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: FbaMapResponse };

export function FbaInventoryMapSection({ accountId, refreshKey }: { accountId: string; refreshKey: number }) {
  const [month, setMonth] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [hover, setHover] = useState<{ dot: Dot; x: number; y: number } | null>(null);

  // A new account starts from its own newest month.
  useEffect(() => { setMonth(null); }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    setState({ status: "loading" });
    const qs = new URLSearchParams({ accountId });
    if (month) qs.set("month", month);
    fetch(`/api/reports/fba-inventory-map?${qs.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!live) return;
        if (!res.ok) setState({ status: "error", message: json.error ?? `HTTP ${res.status}` });
        else setState({ status: "ok", data: json as FbaMapResponse });
      })
      .catch((e) => live && setState({ status: "error", message: String(e) }));
    return () => { live = false; };
  }, [accountId, month, refreshKey, attempt]);

  if (!accountId) return <div className={CARD}>Pick an account.</div>;
  if (state.status === "loading") return <div className={`${CARD} text-muted-foreground`}>Loading…</div>;
  if (state.status === "error") {
    return (
      <div className={CARD}>
        <p className="text-[13px]">Couldn't load the storage-fee report: {state.message}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-3 h-9 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white hover:bg-brand-hover">Retry</button>
      </div>
    );
  }

  const { data } = state;
  if (data.availableMonths.length === 0) return <div className={CARD}>No FBA storage-fee reports for this account</div>;

  const monthSelect = (
    <select
      aria-label="Month"
      value={data.month ?? ""}
      onChange={(e) => setMonth(e.target.value)}
      className="h-9 rounded-full border border-stone-200 bg-card px-3 text-[13px] font-medium"
    >
      {!data.availableMonths.includes(data.month ?? "") && data.month && <option value={data.month}>{data.month}</option>}
      {data.availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );

  if (data.totals.units === 0) {
    return (
      <div className={`${CARD} space-y-3`}>
        <div className="flex items-center gap-2">{monthSelect}</div>
        <p className="text-[13px]">No storage-fee report for {data.month}. Months with a report:</p>
        <div className="flex flex-wrap gap-2">
          {data.availableMonths.map((m) => (
            <button key={m} type="button" onClick={() => setMonth(m)} className="h-9 rounded-full border border-stone-200 px-3 text-[13px] font-medium">{m}</button>
          ))}
        </div>
      </div>
    );
  }

  const choropleth: Record<string, ChoroplethDatum> =
    data.demand.status === "ok"
      ? Object.fromEntries(Object.entries(data.demand.byState).map(([code, u]) => [code, { value: u, label: `${stateDisplayName(code)}: ${nf.format(u)} units ordered` }]))
      : {};
  const placedShare = data.totals.units > 0 ? data.totals.placedUnits / data.totals.units : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">{monthSelect}</div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Avg units on hand" value={nf.format(data.totals.units)} />
        <Stat label="Placed on map" value={pct(placedShare)} />
        <Stat testId="stat-unplaced" label="Unplaced" value={`${nf.format(data.unplaced.units)} · ${pct(data.unplaced.share)}`} />
        <Stat label="Est. storage fee" value={usd.format(data.totals.fee)} />
      </div>

      <section className={CARD}>
        {data.demand.status === "unavailable" && (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400">{REASON[data.demand.reason]}</p>
        )}
        <UsChoropleth
          surface="hub"
          data={choropleth}
          selected={null}
          onSelect={() => {}}
          formatLegend={(v) => nf.format(v)}
          overlay={<FcDotOverlay dots={data.dots} onHover={setHover} />}
        />
        <div className={`mt-2 flex flex-wrap items-center gap-4 ${MICRO}`}>
          <span className="flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--foreground)" fillOpacity={0.85} /></svg>FC metro (size = units)</span>
          <span className="flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--foreground)" strokeWidth={2} /></svg>Location approximate (state only)</span>
          <span className="normal-case tracking-normal font-medium">Demand includes FBM orders.</span>
        </div>
        {hover && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="font-bold">{hover.dot.label}</div>
            <div className="tabular-nums">{nf.format(hover.dot.units)} units · {pct(hover.dot.share)} · {usd.format(hover.dot.fcs.reduce((s, f) => s + f.fee, 0))}</div>
            <div className="opacity-80">{hover.dot.fcs.map((f) => f.code).join(", ")}</div>
            {hover.dot.approximate && <div className="opacity-80">location approximate (state only)</div>}
          </div>
        )}
      </section>

      {data.divisions && <DivisionCallout rows={data.divisions} />}
      <FcTable data={data} />
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div data-testid={testId} className={CARD}>
      <div className={MICRO}>{label}</div>
      <div className="mt-1 text-[22px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
```
Note the FBM note is a plain string element so `findByText("Demand includes FBM orders.")` matches exactly.

- [ ] **Step 8: Write the page**

`src/app/reports/fba-inventory-map/page.tsx`:
```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { FbaInventoryMapSection } from "@/components/reports/fba-inventory-map/fba-inventory-map-section";

// Monthly storage-fee snapshot, so the shared week/custom date controls are hidden;
// the month picker lives in the section because its options come from the API.
export default function FbaInventoryMapPage() {
  const controls = useReportControls();
  const { accountId, refreshKey } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar surface="hub" controls={controls} sectionLabel="FBA Inventory Map" showDates={false} />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] leading-none tracking-[-0.045em]">
              <span className="font-bold text-foreground">Inventory</span>
              <span className="font-medium text-brand">Map</span>
            </h1>
            <p className="mt-2.5 max-w-[760px] text-muted-foreground">
              Where Amazon holds this account's FBA stock (average units on hand for the month, per fulfilment-center metro) against where its customers are.
            </p>
          </div>
          <FbaInventoryMapSection accountId={accountId} refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}
```
Before writing, open `src/components/reports/v2/reports-controls-bar.tsx` and confirm `refreshSection` / `refreshRange` are optional props; if `refreshSection` is required, pass `refreshSection="fba-inventory-map"` and check it does not trigger an unknown-section cron call (if it does, omit the refresh button via whatever prop the bar exposes, and note it in the commit).

- [ ] **Step 9: Run → PASS.** `npx vitest run src/components/reports/fba-inventory-map src/components/reports/v2` — predicted: 10 new tests pass; v2 suite count unchanged from Step 3's run.

- [ ] **Step 10: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/v2/us-choropleth.tsx src/components/reports/fba-inventory-map/fc-dot-overlay.tsx src/components/reports/fba-inventory-map/division-callout.tsx src/components/reports/fba-inventory-map/fc-table.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx src/app/reports/fba-inventory-map/page.tsx
git commit -m "feat(fba-map): page, dot overlay, division callout, FC table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/v2/us-choropleth.tsx src/components/reports/fba-inventory-map/fc-dot-overlay.tsx src/components/reports/fba-inventory-map/division-callout.tsx src/components/reports/fba-inventory-map/fc-table.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx src/app/reports/fba-inventory-map/page.tsx
```

---

### Task 7: Product (ASIN) filter — SKIP if Task 1 found no ASIN column

If Task 1 recorded `asin column=none`, mark this task skipped in the ledger and go to Task 8. Do not build a partial filter.

**Files:**
- Modify: `src/lib/fba-inventory-map/queries.server.ts`, `src/app/api/reports/fba-inventory-map/route.ts`, `src/app/api/reports/fba-inventory-map/__tests__/route.test.ts`, `src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx`, `src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`

**Interfaces:**
- Consumes: `resolveCatalog(asins: string[]): Promise<Map<string, { title: string; productId: string | null; sku: string | null }>>` from `@/lib/reports/order-geography.server`; `AsinOption` (Task 4).
- Produces:
  - `fetchStockRows(accountId: string, month: string, asin: string | null): Promise<StockRow[]>`
  - `fetchDemand(accountId: string, month: string, asin: string | null): Promise<DemandInput>`
  - `fetchAsinList(accountId: string, month: string): Promise<AsinOption[]>`
  - route: `ASINS_CACHE_TYPE = "report-fba-inventory-map-asins"`; payload key `${accountId}:${month}:${asin ?? "all"}`; response `asin`, `asins` filled.

Below, `asin` stands for the column name Task 1 measured; substitute it if different.

- [ ] **Step 1: Update the route test (failing first).** In `route.test.ts`:
  - add `const fetchAsinList = vi.fn();` to the queries mock (`fetchAsinList: (...a: unknown[]) => fetchAsinList(...a)`), import `ASINS_CACHE_TYPE`, and in `beforeEach` `fetchAsinList.mockResolvedValue([{ asin: "B0TEST0001", units: 10, title: "Soda" }]);`
  - in "defaults to the newest month…": change the stock assertion to `expect(fetchStockRows).toHaveBeenCalledWith("4283010", "2026-08", null);` and the payload key to `"4283010:2026-08:all"`; add `expect(json.asins).toEqual([{ asin: "B0TEST0001", units: 10, title: "Soda" }]);` and `expect(setCachedReport).toHaveBeenCalledWith(ASINS_CACHE_TYPE, "4283010:2026-08", json.asins);`
  - in "cache hit": make the mock also return `[{ asin: "B0TEST0001", units: 10, title: "Soda" }]` when `type === ASINS_CACHE_TYPE`, and assert `expect(fetchAsinList).not.toHaveBeenCalled();`
  - add:
```ts
  it("asin filter: validated, upper-cased, passed to both queries, own cache key", async () => {
    expect((await GET(req("accountId=1&month=2026-08&asin=bad"))).status).toBe(400);
    const json = await (await GET(req("accountId=1&month=2026-08&asin=b0test0001"))).json();
    expect(json.asin).toBe("B0TEST0001");
    expect(fetchStockRows).toHaveBeenCalledWith("1", "2026-08", "B0TEST0001");
    expect(fetchDemand).toHaveBeenCalledWith("1", "2026-08", "B0TEST0001");
    expect(getCachedReport).toHaveBeenCalledWith(CACHE_TYPE, "1:2026-08:B0TEST0001", PAYLOAD_TTL_MS);
  });

  it("empty ASIN list is not cached", async () => {
    fetchAsinList.mockResolvedValueOnce([]);
    await GET(req("accountId=1&month=2026-08"));
    expect(setCachedReport.mock.calls.some((c) => c[0] === ASINS_CACHE_TYPE)).toBe(false);
  });
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/app/api/reports/fba-inventory-map`).

- [ ] **Step 3: Queries.** In `queries.server.ts`:
  - In `STOCK_SQL`, add this line after the `country_code` line (outer query only):
```sql
  and ($3::varchar is null or btrim(asin, '''" ') = $3)
```
  - `fetchStockRows(accountId, month, asin: string | null)` passes `[accountId, month, asin]`.
  - Add:
```ts
export const ASINS_SQL = `
with latest as (
  select max(download_date) as d from ${T}
  where account_id = $1 and btrim(month_of_charge, '''" ') = $2
)
select btrim(asin, '''" ') as asin, sum(average_quantity_on_hand::float) as units
from ${T}
where account_id = $1
  and btrim(month_of_charge, '''" ') = $2
  and download_date = (select d from latest)
  and btrim(country_code, '''" ') = 'US'
group by 1
order by 2 desc
limit 200`;

export async function fetchAsinList(accountId: string, month: string): Promise<AsinOption[]> {
  const rows = await queryRedshiftOrThrow<{ asin: string; units: string | number }>(ASINS_SQL, [accountId, month], { timeoutMs: 60_000 });
  const clean = rows.filter((r) => r.asin).map((r) => ({ asin: r.asin.toUpperCase(), units: Math.round(Number(r.units) || 0) }));
  const catalog = await resolveCatalog(clean.map((r) => r.asin));
  return clean.map((r) => ({ ...r, title: catalog.get(r.asin)?.title ?? r.asin }));
}
```
  (import `resolveCatalog` from `@/lib/reports/order-geography.server` and `AsinOption` from `./types`.)
  - `fetchDemand(accountId, month, asin: string | null)`: build the where clause as
```ts
    .where(and(
      eq(orderGeographyLines.accountId, accountId),
      gte(orderGeographyLines.purchaseDay, start),
      lt(orderGeographyLines.purchaseDay, endExclusive),
      asin ? eq(orderGeographyLines.asin, asin) : undefined,
    ))
```

- [ ] **Step 4: Route.** In `route.ts`:
```ts
export const ASINS_CACHE_TYPE = "report-fba-inventory-map-asins";
const ASIN_RE = /^[A-Z0-9]{10}$/;
```
  After month validation:
```ts
  const asinParam = params.get("asin")?.trim().toUpperCase() ?? null;
  if (asinParam !== null && !ASIN_RE.test(asinParam)) {
    return NextResponse.json({ error: "asin must be a 10-character ASIN" }, { status: 400 });
  }
```
  After `month` is resolved (non-null branch):
```ts
    let asins = await getCachedReport<AsinOption[]>(ASINS_CACHE_TYPE, `${accountId}:${month}`, PAYLOAD_TTL_MS);
    if (!asins) {
      asins = await fetchAsinList(accountId, month);
      if (asins.length > 0) await setCachedReport(ASINS_CACHE_TYPE, `${accountId}:${month}`, asins);
    }
    const key = `${accountId}:${month}:${asinParam ?? "all"}`;
```
  Pass `asinParam` to `fetchStockRows` and `fetchDemand`, and return `asin: asinParam, asins` instead of `asin: null, asins: []`.

- [ ] **Step 5: Run route tests → PASS (10).**

- [ ] **Step 6: Section test (failing first).** In `fba-inventory-map-section.test.tsx` add:
```tsx
  it("product select refetches with asin", async () => {
    fetchMock.mockResolvedValue(ok(payload({ asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }] })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const select = await screen.findByRole("combobox", { name: "Product" });
    fireEvent.change(select, { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&month=2026-08&asin=B0TEST0001"));
  });

  it("no product select when asins is empty", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Demand includes FBM orders.");
    expect(screen.queryByRole("combobox", { name: "Product" })).toBeNull();
  });
```
  Selecting a product also pins the month shown (`data.month`) so the refetch URL carries both.

- [ ] **Step 7: Run → FAIL.**

- [ ] **Step 8: Section.** In `fba-inventory-map-section.tsx`:
  - `const [asin, setAsin] = useState<string | null>(null);` and reset it with month on account change: `useEffect(() => { setMonth(null); setAsin(null); }, [accountId]);`
  - in the fetch effect: `if (asin) qs.set("asin", asin);` and add `asin` to the dependency list.
  - next to `monthSelect` in the `ok` branch:
```tsx
  const productSelect = data.asins.length > 0 && (
    <select
      aria-label="Product"
      value={asin ?? ""}
      onChange={(e) => { setMonth(data.month); setAsin(e.target.value || null); }}
      className="h-9 max-w-[360px] truncate rounded-full border border-stone-200 bg-card px-3 text-[13px] font-medium"
    >
      <option value="">All products</option>
      {data.asins.map((a) => <option key={a.asin} value={a.asin}>{a.title === a.asin ? a.asin : `${a.title} (${a.asin})`}</option>)}
    </select>
  );
```
  and render `{productSelect}` beside `{monthSelect}` in the main header row (not in the empty-month branch).

- [ ] **Step 9: Run → PASS** (`npx vitest run src/components/reports/fba-inventory-map src/app/api/reports/fba-inventory-map`).

- [ ] **Step 10: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fba-inventory-map/queries.server.ts src/app/api/reports/fba-inventory-map/route.ts src/app/api/reports/fba-inventory-map/__tests__/route.test.ts src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx
git commit -m "feat(fba-map): per-product (ASIN) filter on stock and demand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fba-inventory-map/queries.server.ts src/app/api/reports/fba-inventory-map/route.ts src/app/api/reports/fba-inventory-map/__tests__/route.test.ts src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx
```

---

### Task 8: Link to Order Geography for the same month

**Files:**
- Create: `src/lib/reports/range-params.ts`, `src/lib/reports/range-params.test.ts`, `src/components/reports/v2/trailing-range-picker.test.tsx`
- Modify: `src/lib/fba-inventory-map/month.ts`, `src/lib/fba-inventory-map/month.test.ts`, `src/components/reports/v2/trailing-range-picker.tsx` (`useTrailingRange`), `src/app/reports/order-geography/page.tsx`, `src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx`, `src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`

**Interfaces:**
- Consumes: `ReportControlsProvider` (mounted by `src/app/reports/layout.tsx`) keeps the selected account across client-side navigation between `/reports/*` pages — so the link needs only the range.
- Produces: `monthLastDay(m: string): string` ('YYYY-MM-DD'); `parseRangeParams(start: string | null, end: string | null): { start: string; end: string } | null`; `useTrailingRange(initial?: { start: string; end: string }): TrailingRange`.

- [ ] **Step 1: Failing tests.**
  - `month.test.ts` add (import `monthLastDay`):
```ts
  it("monthLastDay handles 28/29/30/31", () => {
    expect(monthLastDay("2026-02")).toBe("2026-02-28");
    expect(monthLastDay("2028-02")).toBe("2028-02-29");
    expect(monthLastDay("2026-09")).toBe("2026-09-30");
    expect(monthLastDay("2026-12")).toBe("2026-12-31");
  });
```
  - `src/lib/reports/range-params.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseRangeParams } from "./range-params";

describe("parseRangeParams", () => {
  it("accepts a valid ordered pair", () => {
    expect(parseRangeParams("2026-08-01", "2026-08-31")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });
  it("rejects missing, malformed, or reversed", () => {
    expect(parseRangeParams(null, "2026-08-31")).toBeNull();
    expect(parseRangeParams("2026-8-1", "2026-08-31")).toBeNull();
    expect(parseRangeParams("2026-09-01", "2026-08-31")).toBeNull();
  });
});
```
  - `src/components/reports/v2/trailing-range-picker.test.tsx`:
```tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTrailingRange } from "./trailing-range-picker";

describe("useTrailingRange", () => {
  it("defaults to the 365-day preset", () => {
    expect(renderHook(() => useTrailingRange()).result.current.preset).toBe("365");
  });
  it("opens in custom mode on an initial range", () => {
    const { result } = renderHook(() => useTrailingRange({ start: "2026-08-01", end: "2026-08-31" }));
    expect(result.current).toMatchObject({ preset: "custom", start: "2026-08-01", end: "2026-08-31" });
  });
});
```
  - section test add:
```tsx
  it("links to Order Geography for the same month", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const link = await screen.findByRole("link", { name: /View these orders in Order Geography/ });
    expect(link).toHaveAttribute("href", "/reports/order-geography?start=2026-08-01&end=2026-08-31");
  });
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/fba-inventory-map/month.test.ts src/lib/reports/range-params.test.ts src/components/reports/v2/trailing-range-picker.test.tsx src/components/reports/fba-inventory-map`).

- [ ] **Step 3: Implement.**
  - `month.ts`:
```ts
/** Last calendar day of a 'YYYY-MM' month, as 'YYYY-MM-DD'. */
export function monthLastDay(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // Date stays internal; a string leaves.
  return `${m}-${String(days).padStart(2, "0")}`;
}
```
  - `src/lib/reports/range-params.ts`:
```ts
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional ?start&end deep-link params; null unless both are valid and ordered. */
export function parseRangeParams(start: string | null, end: string | null): { start: string; end: string } | null {
  if (!start || !end || !DAY_RE.test(start) || !DAY_RE.test(end) || start > end) return null;
  return { start, end };
}
```
  - `useTrailingRange` in `trailing-range-picker.tsx` — only the signature and the three `useState` initialisers change:
```ts
export function useTrailingRange(initial?: { start: string; end: string }): TrailingRange {
  const [preset, setPresetRaw] = useState<TrailingPresetId>(initial ? "custom" : DEFAULT_TRAILING_PRESET);
  const [start, setStart] = useState(() => initial?.start ?? trailingRange(365).start);
  const [end, setEnd] = useState(() => initial?.end ?? trailingRange(365).end);
```
  - `src/app/reports/order-geography/page.tsx`: rename the current default export to `function OrderGeographyReportContent()`, and inside it replace `const range = useTrailingRange();` with
```tsx
  const searchParams = useSearchParams();
  const range = useTrailingRange(parseRangeParams(searchParams.get("start"), searchParams.get("end")) ?? undefined);
```
  then add
```tsx
export default function OrderGeographyReportPage() {
  return (
    <Suspense fallback={null}>
      <OrderGeographyReportContent />
    </Suspense>
  );
}
```
  with imports `import { Suspense } from "react";`, `import { useSearchParams } from "next/navigation";`, `import { parseRangeParams } from "@/lib/reports/range-params";`.
  - Section: `import Link from "next/link";` and `import { monthLastDay } from "@/lib/fba-inventory-map/month";`; in the main header row after the selects:
```tsx
        {data.month && (
          <Link
            href={`/reports/order-geography?start=${data.month}-01&end=${monthLastDay(data.month)}`}
            className="ml-auto text-[13px] font-medium text-brand hover:text-brand-hover"
          >
            View these orders in Order Geography →
          </Link>
        )}
```

- [ ] **Step 4: Run → PASS** (same command as Step 2), then `npx vitest run src/components/reports/v2 src/app/reports` to confirm the Order Geography change broke nothing.

- [ ] **Step 5: Commit**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/reports/range-params.ts src/lib/reports/range-params.test.ts src/components/reports/v2/trailing-range-picker.tsx src/components/reports/v2/trailing-range-picker.test.tsx src/app/reports/order-geography/page.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx
git commit -m "feat(fba-map): deep-link to Order Geography for the same month

Order Geography accepts optional ?start&end (custom range).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/reports/range-params.ts src/lib/reports/range-params.test.ts src/components/reports/v2/trailing-range-picker.tsx src/components/reports/v2/trailing-range-picker.test.tsx src/app/reports/order-geography/page.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx
```

---

### Task 9: Nav, full gates, browser pass

**Files:**
- Modify: `src/components/layout/top-nav.tsx` (`REPORT_TABS`, ~line 102)

Correction vs spec §5 "gated by the same permission as `/reports/order-geography`": hub `REPORT_TABS` carry no per-tab permission (the `reports-order-geography` id in `src/lib/permissions.ts` is a PORTAL section). Hub-only access is enforced by the route's `isHubStaff` check and the proxy confining clients to `/portal/*`. No permission id is added.

- [ ] **Step 1: Add the tab** after the Order Geography line:
```ts
  { label: "FBA Inventory Map", href: "/reports/fba-inventory-map" },
```

- [ ] **Step 2: Scoped tests** — `npx vitest run src/lib/albers.test.ts src/lib/us-map-geometry.test.ts src/lib/fc-locations.test.ts src/lib/fba-inventory-map src/app/api/reports/fba-inventory-map src/components/reports/fba-inventory-map src/components/reports/v2 src/components/layout src/lib/reports/range-params.test.ts src/app/reports`
Expected: all new tests pass (Task 2: 10; Task 3: fc-locations + 3 divisions; Task 4: 11 +1 from Task 8; Task 5: 8 +2 from Task 7; Task 6: 10 +3 from Tasks 7–8; Task 8: range-params 2 + trailing-range 2); pre-existing failures, if any, are in files this plan never touched — list them by filename.

- [ ] **Step 3: tsc** — `node_modules/.bin/tsc --noEmit` (run in background, ~2 min). Judge by filename: zero errors in any file this plan created or modified. Inherited errors elsewhere are reported, not fixed.

- [ ] **Step 4: Lint the touched files** — `npx eslint src/lib/albers.ts src/lib/us-map-geometry.ts src/lib/us-map-tripoints.ts src/lib/fc-locations.ts src/lib/fba-inventory-map src/app/api/reports/fba-inventory-map src/components/reports/fba-inventory-map src/app/reports/fba-inventory-map src/components/layout/top-nav.tsx src/components/reports/v2/us-choropleth.tsx src/components/reports/v2/trailing-range-picker.tsx src/app/reports/order-geography/page.tsx src/lib/reports/range-params.ts src/lib/reports-cache.ts` → 0 errors.

- [ ] **Step 5: Commit the nav**

```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/layout/top-nav.tsx
git commit -m "feat(fba-map): add FBA Inventory Map report tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/layout/top-nav.tsx
```

- [ ] **Step 6: Browser pass — BLOCKED on Manu.** The worktree has no env file and Claude cannot copy it (hook-blocked). Ask Manu to copy it into `/Users/manu/MFHub/.worktrees/thread-z-fba-map/`. Then start `PORT=3100 npm run dev` from the worktree via `.claude/launch.json` + `preview_start` (never :3000). Checks:
  1. `/reports/fba-inventory-map`, account 4283010, default month: dots render inside their states (PHX in AZ, SDF in KY…); hollow dots at state anchors; stat row has no `NaN`.
  2. Hover a large dot: tooltip label, FC codes, units, share, fee.
  3. Division callout: 9 rows, badges coloured per ±5 pts.
  4. FC table: default units desc; unplaced/approx badges; header click re-sorts.
  5. Pick a month with no report (a month not in the list via URL `?month=` is not possible from UI — instead pick an account with gaps, per spec §2 "accounts per month swing"): empty state with month pills.
  6. A non-Active account: dots render, amber "not mirrored" banner, no callout.
  7. Dark mode: dots (foreground fill + card stroke) legible over the orange ramp.
  8. Second load of the same account-month is fast (cache hit) — confirm via network timing.
  9. (If Task 7 ran) Product select: pick the top ASIN — dots AND shading both change; "All products" restores; switching account resets it.
  10. "View these orders in Order Geography →" opens Order Geography on the same account, range picker in Custom showing that month's first–last day.
  Screenshot 1, 3 and 7 for Manu.

- [ ] **Step 7: Handoff.** Rewrite `/Users/manu/.claude/handoffs/thread-Z.md` and the Thread Z row in `primer.md`. Nothing is pushed; push/PR/merge each need Manu's explicit OK.
