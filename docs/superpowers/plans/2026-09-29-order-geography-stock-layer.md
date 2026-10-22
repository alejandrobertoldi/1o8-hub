# Order Geography — FBA Stock Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hub-only, off-by-default "FBA stock" layer to Order Geography: per-state stock circles over the order shading, and — for the selected state — an "FBA stock" block with a zoomed state mini-map showing each FC metro at its real position, plus the FC list.

**Architecture:** `OrderGeographySection` gains an optional `stockLayer` flag (hub page passes it; portal doesn't). When on, a client hook `useStockLayer` calls the EXISTING `/api/reports/fba-inventory-map` for the latest storage-fee month overlapping the page's date range and reuses `groupByState` + `StateBubbleOverlay`. The state card gets `StateStockBlock` (mini-map + figures + shared `StateFcList`). No server, route, query or cache change.

**Tech Stack:** Next.js 16 client components, React 19, Tailwind 4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-order-geography-stock-layer-design.md` (incl. §3.7 mini-map). Builds on `2026-09-28-fba-inventory-map-design.md` and `2026-09-29-fba-map-state-view-design.md`.

## Global Constraints

- Work ONLY in `/Users/manu/MFHub/.worktrees/thread-z-fba-map`, branch `thread-z/fba-inventory-map`; `git rev-parse --abbrev-ref HEAD` before every commit.
- NEVER `git add .` / `-A`; explicit pathspec on add AND commit, `-m` before `--`; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `src/generated/data-map.json`, `scripts/_tmp-fc-*`, `.superpowers/*`.
- No push / PR / merge / prod write without Manu's per-action OK.
- Not modified: any `route.ts`, `queries.server.ts`, `aggregate.ts`, `types.ts`, `us-choropleth.tsx`, `src/app/portal/**`, `src/app/reports/fba-inventory-map/page.tsx`.
- Under `src/components/reports/v2/` add **no** hub-orange hex literal and **no** `text-brand`/`bg-brand` class (the `no-hub-orange.test.ts` scanner). Brand-coloured bits live in `src/components/reports/fba-inventory-map/`.
- Dates are strings: months `YYYY-MM`, days `YYYY-MM-DD`; month math is string math (no `Date`).
- No new npm dependency. UI per DESIGN.md; badge classes copied from the existing ones (`division-callout.tsx` `GAP_TONE_CLASS`, the AMBER string in `state-panel.tsx`).
- Tooling from the worktree (node_modules is a symlink): `node_modules/.bin/vitest run <paths>`; `node_modules/.bin/tsc --noEmit` (background, judge BY FILENAME — 0 errors in touched files; total was 103 incl. 2 dev-server `.next/dev/types` lines); `node_modules/.bin/eslint <paths>`. vitest does not typecheck. NEVER `next build`.

## Rulings baked into this plan

- The mini-map labels only **metro** dots among the top 6; the approximate dot (placed at the state anchor) gets no name label, only its `<title>` — its "name" would be the state itself. Cost if wrong: one filter.
- Order Geography's State detail today renders only for states that have orders (`states[selectedState]`). A stocked state with no orders must still show its stock, so the no-detail branch gains `No orders shipped here in this window.` when a state IS selected (the "Select a state…" hint stays for no selection).
- The picked stock month is keyed by `accountId:start:end` (derived, no effect) so an account or range change drops it without an extra render.

## Review Focus

1. **A stocked state with no orders** (e.g. stock in TX, orders only in CA) — clicking its circle must show "Texas", the no-orders line and the stock block, not the "Select a state" hint. Pinned in Task 4.
2. **Layer off and portal make zero stock requests** — the staff-only API must never be hit unless the hub toggle is on. Pinned in Task 4.
3. **Range change after picking a stock month** — the pick must drop and the layer re-derive the latest overlapping month. Pinned in Task 4.
4. **Product filter with no stock** — block says `No FBA stock for this product in {State} in {Mon YYYY}.` Pinned in Task 3.
5. **Metro outside the zoom frame** (AK/HI insets, PR, clipped coast) — skipped on the mini-map, still in the FC list. Pinned in Task 2.

---

### Task 1: Month helpers + `metros` on `StateBubble`

**Files:**
- Modify: `src/lib/fba-inventory-map/month.ts` (append two functions)
- Modify: `src/lib/fba-inventory-map/month.test.ts` (append a describe)
- Modify: `src/lib/fba-inventory-map/state-grouping.ts`
- Modify: `src/lib/fba-inventory-map/state-grouping.test.ts` (append one test)

**Interfaces:**
- Consumes: existing `monthLastDay(m: string): string` in `month.ts`.
- Produces:
  ```ts
  export function monthsOverlapping(months: string[], start: string, end: string): string[]; // newest first
  export function monthLabel(m: string): string; // "2026-08" → "Aug 2026"
  // StateBubble gains:  metros: Dot[]   (source dots of that state, units desc, then key asc)
  ```

- [ ] **Step 1: Failing tests.** Append to `src/lib/fba-inventory-map/month.test.ts` (add `monthsOverlapping, monthLabel` to its existing import from `./month`; if the file imports differently, add a separate `import { monthsOverlapping, monthLabel } from "./month";` line):

```ts
describe("monthsOverlapping / monthLabel", () => {
  it("keeps months that overlap start..end (partial ends included), newest first", () => {
    const months = ["2026-05", "2026-08", "2026-06", "2026-07", "2026-09"];
    expect(monthsOverlapping(months, "2026-06-15", "2026-08-01")).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(monthsOverlapping(months, "2026-07-10", "2026-07-20")).toEqual(["2026-07"]);
    expect(monthsOverlapping(months, "2025-01-01", "2025-12-31")).toEqual([]);
    expect(monthsOverlapping([], "2026-01-01", "2026-12-31")).toEqual([]);
  });
  it("labels a month as Mon YYYY", () => {
    expect(monthLabel("2026-08")).toBe("Aug 2026");
    expect(monthLabel("2025-01")).toBe("Jan 2025");
    expect(monthLabel("2025-12")).toBe("Dec 2025");
  });
});
```
Append inside the `describe("groupByState", …)` block of `state-grouping.test.ts`:
```ts
  it("keeps each state's source metro dots, units desc", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.metros.map((m) => m.key)).toEqual(["LGB", "state:CA"]);
    expect(out.find((b) => b.state === "AZ")!.metros.map((m) => m.key)).toEqual(["PHX"]);
  });
```

- [ ] **Step 2: Run to verify RED**
Run: `node_modules/.bin/vitest run src/lib/fba-inventory-map/month.test.ts src/lib/fba-inventory-map/state-grouping.test.ts`
Expected: FAIL — `monthsOverlapping`/`monthLabel` not exported; `ca.metros` undefined.

- [ ] **Step 3: Implement.** Append to `month.ts`:
```ts
/** Months (any order) overlapping start..end (YYYY-MM-DD, inclusive), newest first. */
export function monthsOverlapping(months: string[], start: string, end: string): string[] {
  return months.filter((m) => `${m}-01` <= end && monthLastDay(m) >= start).sort().reverse();
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-08" → "Aug 2026". */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MON[Number(mm) - 1]} ${y}`;
}
```
In `state-grouping.ts`: add `metros: Dot[];` to `StateBubble` (after `fcs`, with doc comment `/** Source metro-group dots of this state, units desc then key asc. */`); in the groups map value add `dots: Dot[]` (init `[]`, push `d` once per dot, before the FC loop); in the returned object add
```ts
        metros: [...g.dots].sort((a, b) => b.units - a.units || a.key.localeCompare(b.key)),
```

- [ ] **Step 4: Run to verify GREEN** — same command. Expected: PASS (state-grouping 7, month file +2).

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/fba-inventory-map/state-grouping.ts src/lib/fba-inventory-map/state-grouping.test.ts
git commit -m "feat(fba-map): monthsOverlapping + monthLabel; StateBubble keeps its metro dots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fba-inventory-map/month.ts src/lib/fba-inventory-map/month.test.ts src/lib/fba-inventory-map/state-grouping.ts src/lib/fba-inventory-map/state-grouping.test.ts
```

---

### Task 2: `StateFcList` extraction + `StateMiniMap` (and the mini-map in the FBA page's `StatePanel`)

**Files:**
- Create: `src/components/reports/fba-inventory-map/state-fc-list.tsx`
- Create: `src/components/reports/fba-inventory-map/state-mini-map.tsx`
- Modify: `src/components/reports/fba-inventory-map/state-panel.tsx`
- Test: `src/components/reports/fba-inventory-map/state-mini-map.test.tsx`
- Modify (fixture only): `src/components/reports/fba-inventory-map/state-view.test.tsx` — add `metros: []` to the `CA` and `NJ` literals (type now requires it). No assertion changes.

**Interfaces:**
- Consumes: `StateBubble` (with `metros`), `StateFc`, `Dot`; `US_STATE_PATHS` from `@/lib/us-map-paths`; `pathVertices(d: string): [number, number][]` from `@/lib/us-map-geometry`; `stateDisplayName` from `@/lib/reports/order-geography`.
- Produces:
  ```ts
  export function StateFcList(p: { fcs: StateFc[] }): JSX.Element;              // rows keep data-testid="state-fc-row"
  export function miniMapBox(stateCode: string): { x: number; y: number; w: number; h: number } | null;
  export function StateMiniMap(p: { stateCode: string; metros: Dot[] }): JSX.Element | null;
  // DOM: svg data-testid="state-mini-map"; circles data-metro="<dot key>"; labels data-metro-label="<dot key>"
  ```

- [ ] **Step 1: Failing test** — `src/components/reports/fba-inventory-map/state-mini-map.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateMiniMap, miniMapBox } from "./state-mini-map";
import { StatePanel } from "./state-panel";
import { metroPoint, statePoint } from "@/lib/fc-locations";
import { pathVertices } from "@/lib/us-map-geometry";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import type { Dot } from "@/lib/fba-inventory-map/types";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const at = ([x, y]: [number, number], o: Partial<Dot> & Pick<Dot, "key" | "units">): Dot => ({
  label: o.key, state: "CA", x, y, share: 0, approximate: false, fcs: [{ code: `${o.key}1`, units: o.units, fee: 1 }], ...o,
});
const [cx, cy] = statePoint("CA");
const LGB = at(metroPoint("LGB"), { key: "LGB", label: "Long Beach, CA", units: 500 });
const APPROX = at([cx, cy], { key: "state:CA", label: "California (approx.)", units: 50, approximate: true });

describe("miniMapBox", () => {
  it("encloses every vertex of the state's outline, with padding", () => {
    const b = miniMapBox("CA")!;
    for (const [x, y] of pathVertices(US_STATE_PATHS.CA)) {
      expect(x).toBeGreaterThan(b.x);
      expect(x).toBeLessThan(b.x + b.w);
      expect(y).toBeGreaterThan(b.y);
      expect(y).toBeLessThan(b.y + b.h);
    }
    expect(miniMapBox("ZZ")).toBeNull();
  });
});

describe("StateMiniMap", () => {
  it("draws the state and one dot per metro at its x/y; approximate dot is hollow + dashed", () => {
    const { container } = render(<StateMiniMap stateCode="CA" metros={[LGB, APPROX]} />);
    expect(screen.getByTestId("state-mini-map").querySelector("path")!.getAttribute("d")).toBe(US_STATE_PATHS.CA);
    const lgb = container.querySelector('[data-metro="LGB"]')!;
    expect(lgb.getAttribute("cx")).toBe(String(LGB.x));
    expect(lgb.getAttribute("cy")).toBe(String(LGB.y));
    const approx = container.querySelector('[data-metro="state:CA"]')!;
    expect(approx.getAttribute("fill")).toBe("none");
    expect(approx.getAttribute("stroke-dasharray")).toBe("3 2");
    expect(approx.querySelector("title")!.textContent).toContain("Location approximate");
  });

  it("labels only the top 6 metro dots, with the short name, never the approximate one", () => {
    const many = Array.from({ length: 8 }, (_, i) => at([cx + i, cy + i], { key: `M${i}`, label: `Town${i}, CA`, units: 100 - i }));
    const { container } = render(<StateMiniMap stateCode="CA" metros={[...many, APPROX]} />);
    const labels = [...container.querySelectorAll("[data-metro-label]")].map((t) => t.textContent);
    expect(labels).toEqual(["Town0", "Town1", "Town2", "Town3", "Town4", "Town5"]);
  });

  it("skips a dot that falls outside the zoom frame", () => {
    const far = at([-5000, -5000], { key: "FAR", units: 900 });
    const { container } = render(<StateMiniMap stateCode="CA" metros={[LGB, far]} />);
    expect(container.querySelector('[data-metro="FAR"]')).toBeNull();
    expect(container.querySelector('[data-metro="LGB"]')).not.toBeNull();
  });

  it("appears at the top of the FBA page's StatePanel", () => {
    const bubble: StateBubble = {
      state: "CA", name: "California", x: cx, y: cy, units: 550, fee: 2, share: 1, metros: [LGB, APPROX],
      fcs: [{ code: "LGB1", units: 500, fee: 1, place: "Long Beach, CA", approximate: false, shareOfState: 500 / 550 }],
    };
    render(<StatePanel stateCode="CA" bubble={bubble} demand={{ status: "unavailable", reason: "no_orders" }} placedUnits={550} />);
    expect(screen.getByTestId("state-mini-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("state-fc-row")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify RED**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map/state-mini-map.test.tsx`
Expected: FAIL — cannot resolve `./state-mini-map`.

- [ ] **Step 3a: Implement** — `src/components/reports/fba-inventory-map/state-fc-list.tsx` (moved verbatim from `state-panel.tsx`'s FC list block):

```tsx
"use client";
import type { StateFc } from "@/lib/fba-inventory-map/state-grouping";

const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
const COLS = "grid-cols-[60px_minmax(0,1fr)_52px_40px_44px]";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** FC rows for one state — shared by the FBA page's StatePanel and Order Geography's stock block. */
export function StateFcList({ fcs }: { fcs: StateFc[] }) {
  if (fcs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className={`grid ${COLS} gap-2 ${MICRO}`}>
        <span>FC</span><span>Place</span><span className="text-right">Units</span><span className="text-right">Share</span><span className="text-right">Fee</span>
      </div>
      {fcs.map((f) => (
        <div key={f.code} data-testid="state-fc-row" className={`grid ${COLS} items-center gap-2 border-t border-stone-100 pt-1.5 text-[13px]`}>
          <span className="font-medium">{f.code}</span>
          {/* Badge sits outside the truncating text so a narrow panel clips the name, never the flag. */}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate" title={f.place}>{f.place}</span>
            {f.approximate && <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${AMBER}`}>approx.</span>}
          </span>
          <span className="text-right tabular-nums">{nf.format(f.units)}</span>
          <span className="text-right tabular-nums">{pct(f.shareOfState)}</span>
          <span className="text-right tabular-nums">{usd.format(f.fee)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3b: Implement** — `src/components/reports/fba-inventory-map/state-mini-map.tsx`:

```tsx
"use client";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import { pathVertices } from "@/lib/us-map-geometry";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { Dot } from "@/lib/fba-inventory-map/types";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const LABELS = 6;

/** Bounding box of the state's outline (national map coordinates), padded by 8% of its larger side. */
export function miniMapBox(stateCode: string): { x: number; y: number; w: number; h: number } | null {
  const d = US_STATE_PATHS[stateCode];
  if (!d) return null;
  const v = pathVertices(d);
  const xs = v.map((p) => p[0]);
  const ys = v.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

/** The selected state alone, with each FC metro at its real projected position (same space as the national map). */
export function StateMiniMap({ stateCode, metros }: { stateCode: string; metros: Dot[] }) {
  const box = miniMapBox(stateCode);
  if (!box) return null;
  const side = Math.max(box.w, box.h);
  // AK/HI insets, PR, or a coastal metro clipped by the simplified outline can fall outside: skip, the list still has them.
  const inside = metros
    .filter((m) => m.x >= box.x && m.x <= box.x + box.w && m.y >= box.y && m.y <= box.y + box.h)
    .sort((a, b) => b.units - a.units || a.key.localeCompare(b.key));
  const max = Math.max(0, ...inside.map((m) => m.units));
  // Sized as a fraction of the frame, so dots read the same on CA and RI.
  const r = (u: number) => side * (0.018 + 0.052 * (max > 0 ? Math.sqrt(Math.max(0, u) / max) : 0));
  const labelled = inside.filter((m) => !m.approximate).slice(0, LABELS);
  return (
    <svg
      data-testid="state-mini-map"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className="mt-2 block max-h-[220px] w-full"
      role="img"
      aria-label={`FBA stock locations in ${stateDisplayName(stateCode)}`}
    >
      <path d={US_STATE_PATHS[stateCode]} fill="var(--muted)" stroke="var(--border)" vectorEffect="non-scaling-stroke" />
      {inside.map((m) => (
        <circle
          key={m.key}
          data-metro={m.key}
          cx={m.x}
          cy={m.y}
          r={r(m.units)}
          fill={m.approximate ? "none" : "var(--foreground)"}
          fillOpacity={m.approximate ? undefined : 0.85}
          stroke={m.approximate ? "var(--foreground)" : "var(--card)"}
          strokeWidth={1.5}
          strokeDasharray={m.approximate ? "3 2" : undefined}
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${m.approximate ? "Location approximate (state only)" : m.label} · ${nf.format(m.units)} units · ${m.fcs.map((f) => f.code).join(", ")}`}</title>
        </circle>
      ))}
      {labelled.map((m) => (
        <text
          key={`label-${m.key}`}
          data-metro-label={m.key}
          x={m.x + r(m.units) + side * 0.01}
          y={m.y + side * 0.012}
          fontSize={side * 0.035}
          fill="var(--foreground)"
          stroke="var(--card)"
          strokeWidth={side * 0.008}
          paintOrder="stroke"
          className="pointer-events-none font-bold"
        >
          {m.label.split(",")[0]}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 3c: Modify `state-panel.tsx`:** delete its local `AMBER` constant, the `usd`-only-for-rows uses stay (the header Mini still uses `usd`/`nf`/`pct`); import `StateFcList` from `./state-fc-list` and `StateMiniMap` from `./state-mini-map`; replace the whole `{bubble && bubble.fcs.length > 0 && ( <div className="mt-4 space-y-1.5"> … </div> )}` block with
```tsx
      {bubble && bubble.fcs.length > 0 && (
        <div className="mt-4">
          <StateFcList fcs={bubble.fcs} />
        </div>
      )}
```
and, directly under the `<h2>` state name, add `{bubble && <StateMiniMap stateCode={stateCode} metros={bubble.metros} />}`.
In `state-view.test.tsx` add `metros: []` to the `CA` and `NJ` fixture objects (type-only).

- [ ] **Step 4: Run to verify GREEN**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map src/lib/fba-inventory-map`
Expected: PASS — `state-mini-map.test.tsx` 5; `state-view.test.tsx` unchanged count (8) and green; section tests green.

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/fba-inventory-map/state-fc-list.tsx src/components/reports/fba-inventory-map/state-mini-map.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/state-mini-map.test.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
git commit -m "feat(fba-map): zoomed state mini-map with geolocated FC metros; shared StateFcList

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/state-fc-list.tsx src/components/reports/fba-inventory-map/state-mini-map.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/state-mini-map.test.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
```

---

### Task 3: `useStockLayer` hook, `StockLayerControls`, `StateStockBlock`

**Files:**
- Create: `src/components/reports/fba-inventory-map/use-stock-layer.ts`
- Create: `src/components/reports/fba-inventory-map/stock-layer-controls.tsx`
- Create: `src/components/reports/fba-inventory-map/state-stock-block.tsx`
- Test: `src/components/reports/fba-inventory-map/stock-layer.test.tsx`

**Interfaces:**
- Consumes: `monthsOverlapping`, `monthLabel` (Task 1); `groupByState`, `StateBubble` (with `metros`); `StateFcList`, `StateMiniMap` (Task 2); `GAP_TONE_CLASS`, `gapTone` from `./division-callout`; `FbaMapResponse` from `@/lib/fba-inventory-map/types`.
- Produces:
  ```ts
  export type StockLayerState =
    | { status: "off" } | { status: "loading" } | { status: "error"; message: string } | { status: "no-month" }
    | { status: "ok"; month: string; months: string[]; data: FbaMapResponse; bubbles: StateBubble[] };
  export function useStockLayer(p: { enabled: boolean; accountId: string; start: string; end: string; asin: string | null; month: string | null }): StockLayerState;
  export function StockLayerControls(p: { enabled: boolean; onToggle: (next: boolean) => void; layer: StockLayerState; onMonth: (m: string) => void }): JSX.Element;
  export function StateStockBlock(p: { stateCode: string; bubble: StateBubble | null; month: string; placedUnits: number; orderShare: number | null; filtered: boolean }): JSX.Element;
  // DOM: toggle = button "FBA stock" with aria-pressed; month select aria-label "Stock month"; block data-testid="state-stock-block"
  ```

- [ ] **Step 1: Failing test** — `src/components/reports/fba-inventory-map/stock-layer.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStockLayer, type StockLayerState } from "./use-stock-layer";
import { StockLayerControls } from "./stock-layer-controls";
import { StateStockBlock } from "./state-stock-block";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

function stock(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  return {
    accountId: "1", month: "2026-08", availableMonths: ["2026-08", "2026-07", "2026-06"], asin: null, asins: [],
    dots: [{ key: "PHX", label: "Phoenix, AZ", state: "AZ", x: 148, y: 402, units: 60, share: 0.6, approximate: false, fcs: [{ code: "PHX7", units: 60, fee: 6 }] }],
    unplaced: { units: 40, share: 0.4, fcs: [{ code: "ZZZ1", units: 40, fee: 1 }] },
    totals: { units: 100, placedUnits: 60, fee: 7 },
    demand: { status: "unavailable", reason: "no_orders" }, divisions: null, ...o,
  };
}
const fetchMock = vi.fn();
const ok = (p: FbaMapResponse) => ({ ok: true, status: 200, json: async () => p });
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

function Harness(p: Parameters<typeof useStockLayer>[0]) {
  const s: StockLayerState = useStockLayer(p);
  return <div data-testid="s">{s.status}:{s.status === "ok" ? s.month : ""}</div>;
}
const base = { accountId: "1", start: "2025-09-16", end: "2026-09-15", asin: null, month: null };

describe("useStockLayer", () => {
  it("off: no fetch", async () => {
    render(<Harness {...base} enabled={false} />);
    expect(screen.getByTestId("s")).toHaveTextContent("off:");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("on: fetches the stock API (asin appended) and returns ok for an in-range default month", async () => {
    fetchMock.mockResolvedValue(ok(stock()));
    render(<Harness {...base} enabled asin="B0TEST0001" />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ok:2026-08"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001");
  });
  it("default month outside the range → refetches the latest overlapping month", async () => {
    fetchMock.mockResolvedValueOnce(ok(stock())).mockResolvedValueOnce(ok(stock({ month: "2026-06" })));
    render(<Harness {...base} start="2026-05-01" end="2026-06-30" enabled />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ok:2026-06"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&month=2026-06");
  });
  it("no stock month overlapping the range → no-month", async () => {
    fetchMock.mockResolvedValue(ok(stock()));
    render(<Harness {...base} start="2024-01-01" end="2024-03-31" enabled />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("no-month:"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("StockLayerControls", () => {
  it("toggle, month picker, snapshot label and unplaced note", () => {
    const onToggle = vi.fn();
    const onMonth = vi.fn();
    const data = stock();
    const layer: StockLayerState = { status: "ok", month: "2026-08", months: ["2026-08", "2026-07"], data, bubbles: [] };
    render(<StockLayerControls enabled onToggle={onToggle} layer={layer} onMonth={onMonth} />);
    const btn = screen.getByRole("button", { name: "FBA stock" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByText("Stock: Aug 2026 snapshot")).toBeInTheDocument();
    expect(screen.getByText("40 units (40%) couldn't be placed on the map")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stock month"), { target: { value: "2026-07" } });
    expect(onMonth).toHaveBeenCalledWith("2026-07");
  });
});

describe("StateStockBlock", () => {
  const AZ: StateBubble = {
    state: "AZ", name: "Arizona", x: 148, y: 402, units: 60, fee: 6, share: 0.6, metros: [],
    fcs: [{ code: "PHX7", units: 60, fee: 6, place: "Phoenix, AZ", approximate: false, shareOfState: 1 }],
  };
  it("figures, stock-vs-orders gap and FC rows", () => {
    render(<StateStockBlock stateCode="AZ" bubble={AZ} month="2026-08" placedUnits={60} orderShare={0.25} filtered={false} />);
    const block = screen.getByTestId("state-stock-block");
    expect(block).toHaveTextContent("FBA stock · Aug 2026");
    expect(block).toHaveTextContent("60");
    // stock 60/60 = 100%, orders 25% → +75.0 pts
    expect(block).toHaveTextContent("+75.0 pts");
    expect(screen.getAllByTestId("state-fc-row")).toHaveLength(1);
  });
  it("no stock for the filtered product says so", () => {
    render(<StateStockBlock stateCode="TX" bubble={null} month="2026-08" placedUnits={60} orderShare={null} filtered />);
    expect(screen.getByTestId("state-stock-block")).toHaveTextContent("No FBA stock for this product in Texas in Aug 2026.");
  });
});
```

- [ ] **Step 2: Run to verify RED**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map/stock-layer.test.tsx`
Expected: FAIL — cannot resolve `./use-stock-layer`.

- [ ] **Step 3a: Implement** — `src/components/reports/fba-inventory-map/use-stock-layer.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import { groupByState, type StateBubble } from "@/lib/fba-inventory-map/state-grouping";
import { monthsOverlapping } from "@/lib/fba-inventory-map/month";

export type StockLayerState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-month" }
  | { status: "ok"; month: string; months: string[]; data: FbaMapResponse; bubbles: StateBubble[] };

type Got = { ok: true; data: FbaMapResponse } | { ok: false; message: string };

async function getStock(url: string): Promise<Got> {
  const res = await fetch(url);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: `HTTP ${res.status}` };
  }
  if (!res.ok) return { ok: false, message: (json as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
  return { ok: true, data: json as FbaMapResponse };
}

/** Stock for the latest storage-fee month overlapping start..end (or `month` when picked). No fetch while disabled. */
export function useStockLayer({
  enabled, accountId, start, end, asin, month,
}: { enabled: boolean; accountId: string; start: string; end: string; asin: string | null; month: string | null }): StockLayerState {
  const key = enabled && accountId ? `${accountId}:${start}:${end}:${asin ?? ""}:${month ?? ""}` : "";
  const [settled, setSettled] = useState<{ key: string; state: StockLayerState } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const url = (m: string | null) => {
      const qs = new URLSearchParams({ accountId });
      if (m) qs.set("month", m);
      if (asin) qs.set("asin", asin);
      return `/api/reports/fba-inventory-map?${qs.toString()}`;
    };
    const settle = (state: StockLayerState) => live && setSettled({ key, state });
    (async () => {
      let got = await getStock(url(month));
      if (!live) return;
      if (!got.ok) return settle({ status: "error", message: got.message });
      const months = monthsOverlapping(got.data.availableMonths, start, end);
      if (months.length === 0) return settle({ status: "no-month" });
      if (!got.data.month || !months.includes(got.data.month)) {
        got = await getStock(url(months[0]));
        if (!live) return;
        if (!got.ok) return settle({ status: "error", message: got.message });
      }
      const data = got.data;
      settle({ status: "ok", month: data.month ?? months[0], months, data, bubbles: groupByState(data.dots, data.totals.units) });
    })().catch((e) => settle({ status: "error", message: String(e) }));
    return () => {
      live = false;
    };
  }, [key, accountId, start, end, asin, month]);

  if (!key) return { status: "off" };
  if (!settled || settled.key !== key) return { status: "loading" };
  return settled.state;
}
```

- [ ] **Step 3b: Implement** — `src/components/reports/fba-inventory-map/stock-layer-controls.tsx`:

```tsx
"use client";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { StockLayerState } from "./use-stock-layer";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function StockLayerControls({
  enabled, onToggle, layer, onMonth,
}: { enabled: boolean; onToggle: (next: boolean) => void; layer: StockLayerState; onMonth: (m: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[12px]">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => onToggle(!enabled)}
        className={`h-9 rounded-full border px-3 text-[13px] font-medium ${enabled ? "border-transparent bg-brand text-white hover:bg-brand-hover" : "border-stone-200 bg-card text-foreground"}`}
      >
        FBA stock
      </button>
      {enabled && layer.status === "loading" && <span className="text-muted-foreground">Loading stock…</span>}
      {enabled && layer.status === "error" && <span className="text-red-600 dark:text-red-400">{layer.message}</span>}
      {enabled && layer.status === "no-month" && <span className="text-muted-foreground">No stock report in this range</span>}
      {enabled && layer.status === "ok" && (
        <>
          <select
            aria-label="Stock month"
            value={layer.month}
            onChange={(e) => onMonth(e.target.value)}
            className="h-9 rounded-full border border-stone-200 bg-card px-3 text-[13px] font-medium"
          >
            {layer.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <span className="font-bold">Stock: {monthLabel(layer.month)} snapshot</span>
          {layer.data.unplaced.units > 0 && (
            <span className="text-muted-foreground">
              {`${nf.format(layer.data.unplaced.units)} units (${pct(layer.data.unplaced.share)}) couldn't be placed on the map`}
            </span>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3c: Implement** — `src/components/reports/fba-inventory-map/state-stock-block.tsx`:

```tsx
"use client";
import { stateDisplayName } from "@/lib/reports/order-geography";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";
import { GAP_TONE_CLASS, gapTone } from "./division-callout";
import { StateFcList } from "./state-fc-list";
import { StateMiniMap } from "./state-mini-map";

const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Order Geography's State detail add-on: this state's FBA stock for one month, beside its orders. */
export function StateStockBlock({
  stateCode, bubble, month, placedUnits, orderShare, filtered,
}: { stateCode: string; bubble: StateBubble | null; month: string; placedUnits: number; orderShare: number | null; filtered: boolean }) {
  const mon = monthLabel(month);
  const stockShare = ratio(bubble?.units ?? 0, placedUnits);
  const gapPts = orderShare === null ? 0 : (stockShare - orderShare) * 100;
  return (
    <div data-testid="state-stock-block" className="border-t border-stone-200 px-[18px] py-3">
      <div className={MICRO}>FBA stock · {mon}</div>
      {!bubble ? (
        <p className="mt-1 text-[13px]">No FBA stock {filtered ? "for this product " : ""}in {stateDisplayName(stateCode)} in {mon}.</p>
      ) : (
        <>
          <StateMiniMap stateCode={stateCode} metros={bubble.metros} />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Mini label="Units" value={nf.format(bubble.units)} />
            <Mini label="Of all stock" value={pct(bubble.share)} />
            <Mini label="Est. fee" value={usd.format(bubble.fee)} />
          </div>
          {orderShare !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
              <span>Orders <span className="font-bold tabular-nums">{pct(orderShare)}</span></span>
              <span>Stock <span className="font-bold tabular-nums">{pct(stockShare)}</span></span>
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${GAP_TONE_CLASS[gapTone(gapPts)]}`}>
                {gapPts > 0 ? "+" : ""}{gapPts.toFixed(1)} pts
              </span>
            </div>
          )}
          <div className="mt-3">
            <StateFcList fcs={bubble.fcs} />
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={MICRO}>{label}</div>
      <div className="mt-0.5 text-[16px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify GREEN**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map/stock-layer.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/fba-inventory-map/use-stock-layer.ts src/components/reports/fba-inventory-map/stock-layer-controls.tsx src/components/reports/fba-inventory-map/state-stock-block.tsx src/components/reports/fba-inventory-map/stock-layer.test.tsx
git commit -m "feat(fba-map): stock-layer hook, controls and state stock block for Order Geography

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/use-stock-layer.ts src/components/reports/fba-inventory-map/stock-layer-controls.tsx src/components/reports/fba-inventory-map/state-stock-block.tsx src/components/reports/fba-inventory-map/stock-layer.test.tsx
```

---

### Task 4: Wire the layer into `OrderGeographySection` (hub page only)

**Files:**
- Modify: `src/components/reports/v2/order-geography-section.tsx`
- Modify: `src/app/reports/order-geography/page.tsx` (pass `stockLayer`)
- Modify: `src/components/reports/v2/order-geography-section.test.tsx` (append a describe)

**Interfaces:**
- Consumes: `useStockLayer`, `StockLayerState` (Task 3); `StockLayerControls`; `StateStockBlock`; `StateBubbleOverlay`, `BubbleHover` from `@/components/reports/fba-inventory-map/state-bubble-overlay`.
- Produces: `OrderGeographySection` prop `stockLayer?: boolean` (default `false`).

Code anchors in `order-geography-section.tsx`: the props destructure/type of `OrderGeographySection` (~line 272–284); `const [selectedState, setSelectedState] = useState…` (~298); `asinFilter` (~338); `statsFor` / `mapData` memos (~343–365); the early returns for loading/empty/error (~390–420); `ChartFrame` wrapping `<UsChoropleth …/>` (~511–526); the `<Surface title="State detail">` block with `{!detail || !selectedState ? ( …hint… ) : ( … )}` (~556–585).

- [ ] **Step 1: Failing tests** — append to `src/components/reports/v2/order-geography-section.test.tsx` (add imports at the top: `import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";` and `import { statePoint } from "@/lib/fc-locations";`):

```tsx
function stockPayload(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  const [tx, ty] = statePoint("TX");
  const [cx, cy] = statePoint("CA");
  return {
    accountId: "2706460", month: "2026-08", availableMonths: ["2026-08", "2026-07"], asin: null, asins: [],
    dots: [
      { key: "LGB", label: "Long Beach, CA", state: "CA", x: cx, y: cy, units: 70, share: 0.7, approximate: false, fcs: [{ code: "LGB8", units: 70, fee: 7 }] },
      { key: "DFW", label: "Dallas–Fort Worth, TX", state: "TX", x: tx, y: ty, units: 30, share: 0.3, approximate: false, fcs: [{ code: "DFW7", units: 30, fee: 3 }] },
    ],
    unplaced: { units: 0, share: 0, fcs: [] },
    totals: { units: 100, placedUnits: 100, fee: 10 },
    demand: { status: "unavailable", reason: "no_orders" }, divisions: null, ...o,
  };
}

describe("OrderGeographySection FBA stock layer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const stockCalls = () => fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/reports/fba-inventory-map"));
  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string) =>
      (url.startsWith("/api/reports/fba-inventory-map")
        ? { ok: true, status: 200, json: async () => stockPayload() }
        : { ok: true, json: async () => report() }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());
  const renderHub = (start = "2025-09-16") =>
    render(<OrderGeographySection surface="hub" accountId="2706460" start={start} end="2026-09-15" stockLayer />);

  it("without stockLayer (portal/default) there is no toggle and no stock request", async () => {
    renderSection();
    await screen.findByText("State detail");
    expect(screen.queryByRole("button", { name: "FBA stock" })).toBeNull();
    expect(stockCalls()).toHaveLength(0);
  });

  it("hub: toggle is off by default and makes no stock request until switched on", async () => {
    renderHub();
    const btn = await screen.findByRole("button", { name: "FBA stock" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(stockCalls()).toHaveLength(0);
    fireEvent.click(btn);
    await screen.findByText("Stock: Aug 2026 snapshot");
    expect(stockCalls()).toEqual(["/api/reports/fba-inventory-map?accountId=2706460"]);
    expect(document.querySelector('[data-bubble="CA"]')).not.toBeNull();
  });

  it("clicking a circle selects the state; the detail shows the stock block with its mini-map and FC rows", async () => {
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: "FBA stock" }));
    await screen.findByText("Stock: Aug 2026 snapshot");
    fireEvent.click(document.querySelector('[data-bubble="CA"]')!);
    const block = await screen.findByTestId("state-stock-block");
    expect(block).toHaveTextContent("LGB8");
    expect(screen.getByTestId("state-mini-map")).toBeInTheDocument();
  });

  it("a stocked state with no orders shows its name, a no-orders line and the stock block", async () => {
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: "FBA stock" }));
    await screen.findByText("Stock: Aug 2026 snapshot");
    fireEvent.click(document.querySelector('[data-bubble="TX"]')!);
    expect(await screen.findByText("No orders shipped here in this window.")).toBeInTheDocument();
    expect(screen.getByText("Texas")).toBeInTheDocument();
    expect(screen.getByTestId("state-stock-block")).toHaveTextContent("DFW7");
  });

  it("the product filter is passed to the stock request", async () => {
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: "FBA stock" }));
    await screen.findByText("Stock: Aug 2026 snapshot");
    fireEvent.change(screen.getByDisplayValue("All products"), { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(stockCalls().at(-1)).toBe("/api/reports/fba-inventory-map?accountId=2706460&asin=B0TEST0001"));
  });

  it("a range change drops a picked stock month", async () => {
    const { rerender } = renderHub();
    fireEvent.click(await screen.findByRole("button", { name: "FBA stock" }));
    await screen.findByText("Stock: Aug 2026 snapshot");
    fireEvent.change(screen.getByLabelText("Stock month"), { target: { value: "2026-07" } });
    await waitFor(() => expect(stockCalls().at(-1)).toBe("/api/reports/fba-inventory-map?accountId=2706460&month=2026-07"));
    rerender(<OrderGeographySection surface="hub" accountId="2706460" start="2026-03-01" end="2026-09-15" stockLayer />);
    await waitFor(() => expect(stockCalls().at(-1)).toBe("/api/reports/fba-inventory-map?accountId=2706460"));
  });
});
```

- [ ] **Step 2: Run to verify RED**
Run: `node_modules/.bin/vitest run src/components/reports/v2/order-geography-section.test.tsx`
Expected: FAIL — the 5 hub-layer tests fail (no "FBA stock" button); the portal/default test and all existing tests pass.

- [ ] **Step 3: Implement** in `order-geography-section.tsx`:

(a) Imports:
```tsx
import { useStockLayer } from "@/components/reports/fba-inventory-map/use-stock-layer";
import { StockLayerControls } from "@/components/reports/fba-inventory-map/stock-layer-controls";
import { StateStockBlock } from "@/components/reports/fba-inventory-map/state-stock-block";
import { StateBubbleOverlay, type BubbleHover } from "@/components/reports/fba-inventory-map/state-bubble-overlay";
```
(b) Props: add `stockLayer = false,` to the destructure and `stockLayer?: boolean;` to the props type (with doc comment `/** Hub only: adds the FBA stock layer (staff-only API). Portal never sets it. */`).
(c) After `const [selectedState, setSelectedState] = useState<string | null>(null);` add:
```tsx
  const [stockOn, setStockOn] = useState(false);
  // Keyed by account+range so a change drops the pick in the same render (no effect).
  const stockKey = `${accountId}:${start}:${end}`;
  const [stockPick, setStockPick] = useState<{ key: string; month: string } | null>(null);
  const stockMonth = stockPick && stockPick.key === stockKey ? stockPick.month : null;
  const [stockHover, setStockHover] = useState<BubbleHover | null>(null);
```
(d) Immediately after the `mapData` `useMemo` (before any early return — hooks rule):
```tsx
  const layer = useStockLayer({
    enabled: stockLayer && stockOn,
    accountId,
    start,
    end,
    asin: asinFilter === ALL_ASINS ? null : asinFilter,
    month: stockMonth,
  });
```
(e) Inside `<ChartFrame …>`, before `<UsChoropleth`, add
```tsx
            {stockLayer && (
              <StockLayerControls enabled={stockOn} onToggle={setStockOn} layer={layer} onMonth={(m) => setStockPick({ key: stockKey, month: m })} />
            )}
```
and give `UsChoropleth` the prop
```tsx
              overlay={
                layer.status === "ok" ? (
                  <StateBubbleOverlay bubbles={layer.bubbles} selected={selectedState} onSelect={setSelectedState} onHover={setStockHover} />
                ) : undefined
              }
```
then after `<UsChoropleth … />` (still inside ChartFrame) add the tooltip:
```tsx
            {stockHover && layer.status === "ok" && (
              <div
                className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
                style={{ left: stockHover.x, top: stockHover.y }}
              >
                <div className="font-bold">{stockHover.bubble.name}</div>
                <div className="tabular-nums">{count(stockHover.bubble.units)} units in FBA · {Math.round(stockHover.bubble.share * 100)}% of stock</div>
              </div>
            )}
```
(f) State detail: change the condition `{!detail || !selectedState ? (` to render three cases —
```tsx
              {!selectedState ? (
                <div className="text-mf-muted">Select a state on the map to see its order breakdown.</div>
              ) : !detail ? (
                <>
                  <div className="text-[22px] font-extrabold leading-none tracking-[-0.03em] text-mf-ink">{stateDisplayName(selectedState)}</div>
                  <div className="mt-1 text-[12px] text-mf-muted">No orders shipped here in this window.</div>
                </>
              ) : (
```
(the third branch is the existing detail markup, unchanged; the old hint `<div>` inside the first branch is the one being kept). Directly after the closing `</div>` of that `p-[18px]` wrapper (before the cities block), add:
```tsx
            {stockLayer && layer.status === "ok" && selectedState && (
              <StateStockBlock
                stateCode={selectedState}
                bubble={layer.bubbles.find((b) => b.state === selectedState) ?? null}
                month={layer.month}
                placedUnits={layer.data.totals.placedUnits}
                orderShare={(() => {
                  const total = Object.keys(data.states).reduce((s, c) => s + statsFor(c).units, 0);
                  return total > 0 ? statsFor(selectedState).units / total : null;
                })()}
                filtered={asinFilter !== ALL_ASINS}
              />
            )}
```
(g) In `src/app/reports/order-geography/page.tsx`, add `stockLayer` to the `<OrderGeographySection surface="hub" …>` element. Nothing else.

Verify: `grep -n "text-brand\|bg-brand\|#FF751F\|#ff751f" src/components/reports/v2/order-geography-section.tsx` prints nothing.

- [ ] **Step 4: Run to verify GREEN**
Run: `node_modules/.bin/vitest run src/components/reports/v2 src/components/reports/fba-inventory-map src/lib/fba-inventory-map`
Expected: all pass except the known pre-existing `no-hub-orange` failure on `reports-controls-bar.tsx`; order-geography-section file = previous count + 6.

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/v2/order-geography-section.tsx src/components/reports/v2/order-geography-section.test.tsx src/app/reports/order-geography/page.tsx
git commit -m "feat(reports): FBA stock layer on hub Order Geography (circles, stock block, state mini-map)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/v2/order-geography-section.tsx src/components/reports/v2/order-geography-section.test.tsx src/app/reports/order-geography/page.tsx
```

---

### Task 5: Gates + browser pass

**Files:** none (a defect found here is fixed in its owning file with its own failing test and commit).

- [ ] **Step 1: Scoped tests** — `node_modules/.bin/vitest run src/lib/albers.test.ts src/lib/us-map-geometry.test.ts src/lib/fc-locations.test.ts src/lib/fba-inventory-map src/app/api/reports src/components/reports/fba-inventory-map src/components/reports/v2 src/components/layout src/lib/reports src/app/reports`
Expected: all pass except the 1 pre-existing `no-hub-orange` failure (`reports-controls-bar.tsx`). New tests this plan adds: +2 month, +1 state-grouping, +5 mini-map, +7 stock-layer, +6 order-geography = **+21**. Record the absolute counts.
- [ ] **Step 2: tsc** (background) — 0 errors in any touched/created file; report the total.
- [ ] **Step 3: eslint** — `node_modules/.bin/eslint src/lib/fba-inventory-map src/components/reports/fba-inventory-map src/components/reports/v2/order-geography-section.tsx src/app/reports/order-geography/page.tsx` → 0 errors.
- [ ] **Step 4: Browser pass** on `localhost:3101` (in-app pane; Manu's owner session is already there):
  1. `/reports/order-geography`, Mission, 365 days: the "FBA stock" pill is off; Network shows no `fba-inventory-map` call.
  2. Toggle on → circles with labels over the sales shading; label `Stock: Aug 2026 snapshot`; unplaced note.
  3. Click California's circle → State detail shows orders + "FBA stock · Aug 2026" with the CA mini-map: Stockton / San Bernardino / Ontario dots inside the outline, top-6 labels, approx dot hollow.
  4. Click a small state (NJ or CT) → the mini-map frames it; dots inside.
  5. Filter a product → circles change; the block reflects the product.
  6. Custom range in the past (e.g. Mar–Apr 2026) → month picker lists only overlapping months; label follows.
  7. `/portal/reports/order-geography` (admin preview) → no pill.
  8. ReadyRESCUE spot-check; screenshots of steps 2 and 3.
- [ ] **Step 5: Handoff** — rewrite `/Users/manu/.claude/handoffs/thread-Z.md` and the Thread Z row in `primer.md`. Nothing pushed; push / PR each need Manu's OK.
