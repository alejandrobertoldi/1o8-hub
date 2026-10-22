# FBA Inventory Map — State View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-metro FC dots with one circle per US state, and show a state-detail side panel (all FCs in that state) for the clicked state — top state preselected.

**Architecture:** Pure client-side regroup: a new `groupByState(dots, totalUnits)` rolls the existing payload's `dots` up by `state`. The route, queries, cache and `FbaMapResponse` type are untouched. A new circle overlay and a new side panel replace `fc-dot-overlay.tsx`; the section component gains a `state` field in its existing `selection` object and a 2/3 + 1/3 grid.

**Tech Stack:** Next.js 16 App Router client components, React 19, Tailwind 4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-fba-map-state-view-design.md` (amends §5 of `docs/superpowers/specs/2026-09-28-fba-inventory-map-design.md`, whose other sections stay binding).

## Global Constraints

- Work ONLY in `/Users/manu/MFHub/.worktrees/thread-z-fba-map`, branch `thread-z/fba-inventory-map`. Run `git rev-parse --abbrev-ref HEAD` before every commit; it must print `thread-z/fba-inventory-map`.
- NEVER `git add .` / `-A`. Explicit pathspec on add AND commit, `-m` before `--`. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `src/generated/data-map.json`, `scripts/_tmp-fc-*`, `.superpowers/*`.
- No push / PR / merge / prod write without Manu's per-action OK.
- No server, route, query, cache or payload change. `src/lib/fba-inventory-map/types.ts`, `aggregate.ts`, `queries.server.ts`, `route.ts` are NOT modified.
- `src/components/reports/v2/us-choropleth.tsx` is NOT modified. No file under `src/components/reports/v2/` changes.
- No new npm dependency. UI per DESIGN.md: cards `rounded-[18px] border border-stone-200 bg-card p-5`; micro-labels `text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground`; numbers `tabular-nums`; badge colours from the DESIGN.md badge table (the exact class strings already used in `fc-table.tsx` / `division-callout.tsx`).
- Circles: `var(--foreground)` fill @0.85, `var(--card)` 1.5px stroke; selected state's circle `var(--brand)` 2px stroke; radius via `dotRadius` (MIN 3 / MAX 22, √-scaled).
- Gap sign convention = division card: `gapPts = (stockShare − demandShare) × 100`, stock share of PLACED units; badge tone via the existing `gapTone` (±5 pts).
- Tooling: the worktree `node_modules` is a symlink to `/Users/manu/MFHub/node_modules`; run `node_modules/.bin/vitest run <paths>`, `node_modules/.bin/tsc --noEmit` (background, ~2 min, judge BY FILENAME — ~101 pre-existing errors, 0 allowed in files this plan touches), `node_modules/.bin/eslint <paths>`. vitest does not typecheck. NEVER `next build`. Bash commands containing the env-file name and `rm -r`/`rm -f` are hook-blocked (use `git rm` for deletions).

## Rulings baked into this plan (spec deviations, each small)

- Spec §3.3 lists a `divisionsAvailable: boolean` prop. It is dropped: `demand.status === "ok"` already gates the demand line. A `placedUnits: number` prop is added instead, because the demand line's stock share must use placed units to match the division card.
- Spec §3.3 says "Stone approx badge". The FC table already tags approximate rows with the AMBER badge + text `approx.`; the panel matches the table (consistency beats the spec's colour word).
- Spec §3.3 has `stateCode: string`; it is `string | null` so the "all stock unplaced" case (§4) renders inside the panel.

## Review Focus

1. **Clicking a state must not refetch.** The state lives in the same `selection` object as month/asin; a careless `setSelection({ …, month: data.month })` turns a null month into a concrete one and changes the request key → a wasted Redshift round trip. Pinned by a Task 3 test (fetch called exactly once after two state clicks).
2. **Re-clicking the selected state** — `us-choropleth.tsx:159` sends `null`; the panel must keep the state (not jump to the top state). Pinned in Task 3.
3. **Panel sums** — the panel's FC units must add up to the state circle (approx + metro FCs of one state merged). Pinned in Task 1.
4. **Reset on account / month / product change** — a state picked for account A must not stick when account B has no stock there. Pinned in Task 3.
5. **All stock unplaced / no bubbles** — panel shows the "could not be placed" message, no crash, no NaN. Pinned in Task 3.

---

### Task 1: `groupByState` (pure)

**Files:**
- Create: `src/lib/fba-inventory-map/state-grouping.ts`
- Test: `src/lib/fba-inventory-map/state-grouping.test.ts`

**Interfaces:**
- Consumes: `Dot`, `FcRow` from `@/lib/fba-inventory-map/types`; `statePoint(state: string): [number, number]` from `@/lib/fc-locations`; `stateDisplayName(code: string): string` from `@/lib/reports/order-geography`.
- Produces:
  ```ts
  export type StateFc = FcRow & { place: string; approximate: boolean; shareOfState: number };
  export type StateBubble = { state: string; name: string; x: number; y: number; units: number; fee: number; share: number; fcs: StateFc[] };
  export function groupByState(dots: Dot[], totalUnits: number): StateBubble[];
  ```

- [ ] **Step 1: Write the failing test** — `src/lib/fba-inventory-map/state-grouping.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { groupByState } from "./state-grouping";
import { statePoint } from "@/lib/fc-locations";
import type { Dot } from "./types";

const dot = (o: Partial<Dot> & Pick<Dot, "key" | "state" | "fcs">): Dot => ({
  label: o.key, x: 0, y: 0, share: 0, approximate: false,
  units: o.fcs.reduce((s, f) => s + f.units, 0), ...o,
});

const DOTS: Dot[] = [
  dot({ key: "LGB", label: "Long Beach, CA", state: "CA", fcs: [{ code: "LGB8", units: 30, fee: 3 }, { code: "LGB3", units: 10, fee: 1 }] }),
  dot({ key: "state:CA", label: "California (approx.)", state: "CA", approximate: true, fcs: [{ code: "SCA1", units: 20, fee: 2 }] }),
  dot({ key: "PHX", label: "Phoenix, AZ", state: "AZ", fcs: [{ code: "PHX7", units: 25, fee: 4 }] }),
  dot({ key: "EWR", label: "Newark, NJ", state: "NJ", fcs: [{ code: "EWR4", units: 25, fee: 5 }] }),
  dot({ key: "ABE", label: "Allentown, PA", state: "PA", fcs: [{ code: "ABE3", units: 0, fee: 0 }] }),
];

describe("groupByState", () => {
  const out = groupByState(DOTS, 200);

  it("merges metro + approximate dots of one state and conserves units and fee", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.units).toBe(60);
    expect(ca.fee).toBe(6);
    expect(ca.fcs.map((f) => f.code)).toEqual(["LGB8", "SCA1", "LGB3"]);
    expect(out.reduce((s, b) => s + b.units, 0)).toBe(DOTS.reduce((s, d) => s + d.units, 0));
  });

  it("labels places and flags approximate rows", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.fcs.find((f) => f.code === "LGB8")).toMatchObject({ place: "Long Beach, CA", approximate: false });
    expect(ca.fcs.find((f) => f.code === "SCA1")).toMatchObject({ place: "Location approximate", approximate: true });
  });

  it("shareOfState sums to 1 per state with stock, and share uses totalUnits", () => {
    const ca = out.find((b) => b.state === "CA")!;
    expect(ca.fcs.reduce((s, f) => s + f.shareOfState, 0)).toBeCloseTo(1, 10);
    expect(ca.share).toBeCloseTo(60 / 200, 10);
  });

  it("orders by units desc, ties by state code asc", () => {
    expect(out.map((b) => b.state)).toEqual(["CA", "AZ", "NJ", "PA"]);
  });

  it("keeps a zero-unit state with 0 shares (no NaN) and positions at statePoint", () => {
    const pa = out.find((b) => b.state === "PA")!;
    expect(pa.units).toBe(0);
    expect(pa.fcs[0].shareOfState).toBe(0);
    const [x, y] = statePoint("AZ");
    expect(out.find((b) => b.state === "AZ")).toMatchObject({ x, y, name: "Arizona" });
  });

  it("returns [] for no dots and 0 shares when totalUnits is 0", () => {
    expect(groupByState([], 0)).toEqual([]);
    expect(groupByState(DOTS, 0)[0].share).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `node_modules/.bin/vitest run src/lib/fba-inventory-map/state-grouping.test.ts`
Expected: FAIL — cannot resolve `./state-grouping`.

- [ ] **Step 3: Implement** — `src/lib/fba-inventory-map/state-grouping.ts`

```ts
import { statePoint } from "@/lib/fc-locations";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { Dot, FcRow } from "./types";

export type StateFc = FcRow & { place: string; approximate: boolean; shareOfState: number };
export type StateBubble = {
  state: string;
  name: string;
  x: number;
  y: number;
  units: number;
  fee: number;
  /** Of all stock (same denominator as the stat row and Dot.share). */
  share: number;
  /** Units desc, then code asc. */
  fcs: StateFc[];
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** One bubble per state that has at least one FC row; units desc, then state code asc. */
export function groupByState(dots: Dot[], totalUnits: number): StateBubble[] {
  const groups = new Map<string, { units: number; fee: number; rows: Omit<StateFc, "shareOfState">[] }>();
  for (const d of dots) {
    let g = groups.get(d.state);
    if (!g) {
      g = { units: 0, fee: 0, rows: [] };
      groups.set(d.state, g);
    }
    for (const fc of d.fcs) {
      g.units += fc.units;
      g.fee += fc.fee;
      g.rows.push({ ...fc, place: d.approximate ? "Location approximate" : d.label, approximate: d.approximate });
    }
  }
  return [...groups.entries()]
    .map(([state, g]) => {
      const [x, y] = statePoint(state);
      return {
        state,
        name: stateDisplayName(state),
        x,
        y,
        units: g.units,
        fee: g.fee,
        share: ratio(g.units, totalUnits),
        fcs: g.rows
          .map((r) => ({ ...r, shareOfState: ratio(r.units, g.units) }))
          .sort((a, b) => b.units - a.units || a.code.localeCompare(b.code)),
      };
    })
    .sort((a, b) => b.units - a.units || a.state.localeCompare(b.state));
}
```

- [ ] **Step 4: Run to verify it passes**
Run: `node_modules/.bin/vitest run src/lib/fba-inventory-map/state-grouping.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/lib/fba-inventory-map/state-grouping.ts src/lib/fba-inventory-map/state-grouping.test.ts
git commit -m "feat(fba-map): groupByState — roll metro dots up to one bubble per state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/fba-inventory-map/state-grouping.ts src/lib/fba-inventory-map/state-grouping.test.ts
```

---

### Task 2: State circle overlay + state panel (components, tested in isolation)

**Files:**
- Create: `src/components/reports/fba-inventory-map/state-bubble-overlay.tsx`
- Create: `src/components/reports/fba-inventory-map/state-panel.tsx`
- Modify: `src/components/reports/fba-inventory-map/division-callout.tsx` (export the tone class map)
- Test: `src/components/reports/fba-inventory-map/state-view.test.tsx`

`fc-dot-overlay.tsx` is NOT deleted in this task (the section still imports it until Task 3).

**Interfaces:**
- Consumes: `StateBubble` from Task 1; `Demand` from `@/lib/fba-inventory-map/types`; `gapTone` from `./division-callout`.
- Produces:
  ```ts
  // state-bubble-overlay.tsx
  export function dotRadius(units: number, max: number): number;
  export type BubbleHover = { bubble: StateBubble; x: number; y: number };
  export function StateBubbleOverlay(p: { bubbles: StateBubble[]; selected: string | null; onSelect: (state: string) => void; onHover: (h: BubbleHover | null) => void }): JSX.Element;
  // state-panel.tsx
  export function StatePanel(p: { stateCode: string | null; bubble: StateBubble | null; demand: Demand; placedUnits: number }): JSX.Element;
  // division-callout.tsx
  export const GAP_TONE_CLASS: Record<"red" | "amber" | "green", string>;
  ```
  DOM contract used by Task 3 tests: each circle has `data-bubble="<STATE>"`; the panel root has `data-testid="state-panel"`; the demand line has `data-testid="state-demand"`; each FC row has `data-testid="state-fc-row"`.

- [ ] **Step 1: Write the failing test** — `src/components/reports/fba-inventory-map/state-view.test.tsx`

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StateBubbleOverlay, dotRadius } from "./state-bubble-overlay";
import { StatePanel } from "./state-panel";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const CA: StateBubble = {
  state: "CA", name: "California", x: 100, y: 300, units: 60, fee: 6, share: 0.3,
  fcs: [
    { code: "LGB8", units: 40, fee: 4, place: "Long Beach, CA", approximate: false, shareOfState: 40 / 60 },
    { code: "SCA1", units: 20, fee: 2, place: "Location approximate", approximate: true, shareOfState: 20 / 60 },
  ],
};
const NJ: StateBubble = { state: "NJ", name: "New Jersey", x: 800, y: 200, units: 5, fee: 1, share: 0.025, fcs: [{ code: "EWR4", units: 5, fee: 1, place: "Newark, NJ", approximate: false, shareOfState: 1 }] };

describe("dotRadius", () => {
  it("spans 3..22 and is 0 for no max", () => {
    expect(dotRadius(0, 100)).toBe(3);
    expect(dotRadius(100, 100)).toBe(22);
    expect(dotRadius(5, 0)).toBe(0);
  });
});

describe("StateBubbleOverlay", () => {
  it("draws one circle per state, largest first, selected one brand-stroked, click selects", () => {
    const onSelect = vi.fn();
    const { container } = render(<svg><StateBubbleOverlay bubbles={[NJ, CA]} selected="NJ" onSelect={onSelect} onHover={() => {}} /></svg>);
    const circles = [...container.querySelectorAll("circle")];
    expect(circles.map((c) => c.getAttribute("data-bubble"))).toEqual(["CA", "NJ"]);
    expect(circles[1].getAttribute("stroke")).toBe("var(--brand)");
    expect(circles[0].getAttribute("stroke")).toBe("var(--card)");
    fireEvent.click(circles[0]);
    expect(onSelect).toHaveBeenCalledWith("CA");
  });
});

describe("StatePanel", () => {
  const demand = { status: "ok" as const, byState: { CA: 10, TX: 30 }, totalUnits: 40, note: "includes_fbm" as const };

  it("shows header, demand line with gap badge, and FC rows with an approx badge", () => {
    render(<StatePanel stateCode="CA" bubble={CA} demand={demand} placedUnits={120} />);
    const panel = screen.getByTestId("state-panel");
    expect(panel).toHaveTextContent("California");
    expect(panel).toHaveTextContent("60");
    expect(panel).toHaveTextContent("30%");
    // demand 10/40 = 25%, stock 60/120 = 50% → +25.0 pts
    expect(screen.getByTestId("state-demand")).toHaveTextContent("25%");
    expect(screen.getByTestId("state-demand")).toHaveTextContent("50%");
    expect(screen.getByTestId("state-demand")).toHaveTextContent("+25.0 pts");
    const rows = screen.getAllByTestId("state-fc-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("LGB8");
    expect(rows[0]).toHaveTextContent("Long Beach, CA");
    expect(within(rows[1]).getByText("approx.")).toBeInTheDocument();
  });

  it("no stock in a state with demand: message + demand line, no FC rows", () => {
    render(<StatePanel stateCode="TX" bubble={null} demand={demand} placedUnits={120} />);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("No FBA stock in Texas.");
    expect(screen.getByTestId("state-demand")).toHaveTextContent("75%");
    expect(screen.queryAllByTestId("state-fc-row")).toHaveLength(0);
  });

  it("hides the demand line when demand is unavailable", () => {
    render(<StatePanel stateCode="CA" bubble={CA} demand={{ status: "unavailable", reason: "account_not_mirrored" }} placedUnits={120} />);
    expect(screen.queryByTestId("state-demand")).toBeNull();
  });

  it("null state (all stock unplaced) shows the placement message without NaN", () => {
    const { container } = render(<StatePanel stateCode={null} bubble={null} demand={demand} placedUnits={0} />);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("No FC in this month could be placed on the map.");
    expect(container.textContent).not.toContain("NaN");
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map/state-view.test.tsx`
Expected: FAIL — cannot resolve `./state-bubble-overlay`.

- [ ] **Step 3a: Export the tone map** — in `division-callout.tsx`, rename `const TONE` to `export const GAP_TONE_CLASS` and update its single use (`TONE[gapTone(r.gapPts)]` → `GAP_TONE_CLASS[gapTone(r.gapPts)]`). No other change.

- [ ] **Step 3b: Implement** — `src/components/reports/fba-inventory-map/state-bubble-overlay.tsx`

```tsx
"use client";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

const MIN_R = 3;
const MAX_R = 22;

/** √-scaled so area tracks units; scaled to the account's largest state. */
export function dotRadius(units: number, max: number): number {
  if (max <= 0) return 0;
  return MIN_R + (MAX_R - MIN_R) * Math.sqrt(Math.max(0, units) / max);
}

export type BubbleHover = { bubble: StateBubble; x: number; y: number };

export function StateBubbleOverlay({
  bubbles,
  selected,
  onSelect,
  onHover,
}: {
  bubbles: StateBubble[];
  selected: string | null;
  onSelect: (state: string) => void;
  onHover: (h: BubbleHover | null) => void;
}) {
  const max = Math.max(0, ...bubbles.map((b) => b.units));
  // Largest first so small states (NJ, DE, MD, CT, RI) paint on top and stay clickable.
  const ordered = [...bubbles].sort((a, b) => b.units - a.units || a.state.localeCompare(b.state));
  return (
    <g>
      {ordered.map((b) => {
        const isSelected = b.state === selected;
        return (
          <circle
            key={b.state}
            data-bubble={b.state}
            cx={b.x}
            cy={b.y}
            r={dotRadius(b.units, max)}
            fill="var(--foreground)"
            fillOpacity={0.85}
            stroke={isSelected ? "var(--brand)" : "var(--card)"}
            strokeWidth={isSelected ? 2 : 1.5}
            className="cursor-pointer"
            // The circle sits over the state path, so it forwards the click itself.
            onClick={() => {
              onHover(null);
              onSelect(b.state);
            }}
            onMouseMove={(e) => onHover({ bubble: b, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
    </g>
  );
}
```

- [ ] **Step 3c: Implement** — `src/components/reports/fba-inventory-map/state-panel.tsx`

```tsx
"use client";
import { stateDisplayName } from "@/lib/reports/order-geography";
import type { Demand } from "@/lib/fba-inventory-map/types";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";
import { GAP_TONE_CLASS, gapTone } from "./division-callout";

const CARD = "rounded-[18px] border border-stone-200 bg-card p-5";
const MICRO = "text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
const AMBER = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function StatePanel({
  stateCode,
  bubble,
  demand,
  placedUnits,
}: {
  stateCode: string | null;
  bubble: StateBubble | null;
  demand: Demand;
  /** Stock share in the demand line is of PLACED units, matching the division card. */
  placedUnits: number;
}) {
  if (!stateCode) {
    return (
      <aside data-testid="state-panel" className={CARD}>
        <p className="text-[13px] text-muted-foreground">No FC in this month could be placed on the map.</p>
      </aside>
    );
  }
  const name = stateDisplayName(stateCode);
  const demandShare = demand.status === "ok" ? ratio(demand.byState[stateCode] ?? 0, demand.totalUnits) : null;
  const stockShare = ratio(bubble?.units ?? 0, placedUnits);
  const gapPts = demandShare === null ? 0 : (stockShare - demandShare) * 100;

  return (
    <aside data-testid="state-panel" className={CARD}>
      <div className={MICRO}>State</div>
      <h2 className="mt-1 text-[20px] font-bold leading-tight">{name}</h2>

      {bubble ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="Units" value={nf.format(bubble.units)} />
          <Mini label="Of all stock" value={pct(bubble.share)} />
          <Mini label="Est. fee" value={usd.format(bubble.fee)} />
        </div>
      ) : (
        <p className="mt-2 text-[13px]">No FBA stock in {name}.</p>
      )}

      {demandShare !== null && (
        <div data-testid="state-demand" className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <span>Demand <span className="font-bold tabular-nums">{pct(demandShare)}</span></span>
          <span>Stock <span className="font-bold tabular-nums">{pct(stockShare)}</span></span>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${GAP_TONE_CLASS[gapTone(gapPts)]}`}>
            {gapPts > 0 ? "+" : ""}{gapPts.toFixed(1)} pts
          </span>
        </div>
      )}

      {bubble && bubble.fcs.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className={`grid grid-cols-[72px_1fr_60px_48px_52px] gap-2 ${MICRO}`}>
            <span>FC</span><span>Place</span><span className="text-right">Units</span><span className="text-right">Share</span><span className="text-right">Fee</span>
          </div>
          {bubble.fcs.map((f) => (
            <div key={f.code} data-testid="state-fc-row" className="grid grid-cols-[72px_1fr_60px_48px_52px] items-center gap-2 border-t border-stone-100 pt-1.5 text-[13px]">
              <span className="font-medium">{f.code}</span>
              <span className="truncate">
                {f.place}
                {f.approximate && <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${AMBER}`}>approx.</span>}
              </span>
              <span className="text-right tabular-nums">{nf.format(f.units)}</span>
              <span className="text-right tabular-nums">{pct(f.shareOfState)}</span>
              <span className="text-right tabular-nums">{usd.format(f.fee)}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
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

- [ ] **Step 4: Run to verify it passes**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map`
Expected: `state-view.test.tsx` 6 tests PASS; the existing section tests still pass (division-callout rename is internal).

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/fba-inventory-map/state-bubble-overlay.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/division-callout.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
git commit -m "feat(fba-map): state circle overlay + state-detail panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/state-bubble-overlay.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/division-callout.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
```

---

### Task 3: Wire the state view into the section (layout, selection, copy) and delete the dot overlay

**Files:**
- Modify: `src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx`
- Modify: `src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`
- Delete: `src/components/reports/fba-inventory-map/fc-dot-overlay.tsx` (`git rm`)

**Interfaces:**
- Consumes: `groupByState` / `StateBubble` (Task 1); `StateBubbleOverlay`, `BubbleHover`, `dotRadius` (Task 2, `./state-bubble-overlay`); `StatePanel` (Task 2); `US_STATE_PATHS` from `@/lib/us-map-paths` (tests only).
- Produces: nothing new for later tasks.

Current code anchors (in `fba-inventory-map-section.tsx`): the `selection` `useState` (~line 30) and the derived `month`/`asin` below it; `setMonth` (~line 38); the `hover` `useState` typed `{ dot: Dot; … }` (~line 41); the product `<select>` `onChange` (~line 113); the stat row `Stat testId="stat-unplaced"`; the `<section className={CARD}>` that holds `UsChoropleth` with `selected={null}` / `onSelect={() => {}}` / `overlay={<FcDotOverlay …/>}`, the legend and the hover tooltip. The fetch effect's dependency list is `[accountId, month, asin, refreshKey, attempt, requestKey]` — the new `state` field MUST NOT enter `requestKey` or those deps.

- [ ] **Step 1: Update + add the failing tests** — in `fba-inventory-map-section.test.tsx`:

1. Change the import `import { dotRadius } from "./fc-dot-overlay";` → delete it, and delete the `it("dotRadius spans 3..22 …")` test from the `helpers` block (it moved to `state-view.test.tsx` in Task 2). Add `import { US_STATE_PATHS } from "@/lib/us-map-paths";`.
2. Replace the first section test (`"renders solid and hollow dots, unplaced stat, FBM note, and division callout"`) with:

```tsx
  it("renders one circle per state, unplaced stat as units · pct, FBM note, and division callout", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Demand includes FBM orders.");
    expect([...container.querySelectorAll("[data-bubble]")].map((c) => c.getAttribute("data-bubble")).sort()).toEqual(["AZ", "FL"]);
    expect(container.querySelector('[data-dot="hollow"]')).toBeNull();
    expect(screen.getByTestId("stat-unplaced")).toHaveTextContent("20 units · 20%");
    expect(screen.getByTestId("division-callout")).toHaveTextContent("South Atlantic");
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1");
  });
```
3. Append these tests inside `describe("FbaInventoryMapSection", …)`:

```tsx
  it("preselects the state with the most units", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const panel = await screen.findByTestId("state-panel");
    expect(panel).toHaveTextContent("Arizona");
    expect(panel).toHaveTextContent("PHX7");
  });

  it("clicking a circle or a state shape swaps the panel without refetching; re-click keeps it", async () => {
    fetchMock.mockResolvedValue(ok(payload({ demand: { status: "ok", byState: { AZ: 5, FL: 15, TX: 10 }, totalUnits: 30, note: "includes_fbm" } })));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("state-panel");
    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");
    expect(screen.getByTestId("state-panel")).toHaveTextContent("SFL4");
    // re-click the selected state's shape: us-choropleth sends null, the panel must keep Florida
    fireEvent.click(container.querySelector(`path[d="${US_STATE_PATHS.FL}"]`)!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");
    // a demand-only state's shape → "no stock" message
    fireEvent.click(container.querySelector(`path[d="${US_STATE_PATHS.TX}"]`)!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("No FBA stock in Texas.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resets to the new top state on account change and on month change", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container, rerender } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("state-panel");
    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");

    fetchMock.mockResolvedValue(ok(payload({ month: "2026-07" })));
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-07" } });
    await waitFor(() => expect(screen.getByTestId("state-panel")).toHaveTextContent("Arizona"));

    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    fetchMock.mockResolvedValue(ok(payload({
      accountId: "2",
      dots: [{ key: "EWR", label: "Newark, NJ", state: "NJ", x: 800, y: 200, units: 10, share: 1, approximate: false, fcs: [{ code: "EWR4", units: 10, fee: 1 }] }],
      totals: { units: 10, placedUnits: 10, fee: 1 }, unplaced: { units: 0, share: 0, fcs: [] },
    })));
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(screen.getByTestId("state-panel")).toHaveTextContent("New Jersey"));
  });

  it("all stock unplaced: panel explains, no circles, no NaN", async () => {
    fetchMock.mockResolvedValue(ok(payload({ dots: [], unplaced: { units: 10, share: 1, fcs: [{ code: "ZZZ1", units: 10, fee: 1 }] }, totals: { units: 10, placedUnits: 0, fee: 1 } })));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const panel = await screen.findByTestId("state-panel");
    expect(panel).toHaveTextContent("No FC in this month could be placed on the map.");
    expect(container.querySelectorAll("[data-bubble]")).toHaveLength(0);
    expect(container.textContent).not.toContain("NaN");
  });
```

- [ ] **Step 2: Run to verify the new tests fail**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`
Expected: FAIL — no `[data-bubble]` / no `state-panel` yet (the existing unplaced "100%" test still passes).

- [ ] **Step 3: Implement** — in `fba-inventory-map-section.tsx`:

(a) Imports: replace `import { FcDotOverlay } from "./fc-dot-overlay";` with
```tsx
import { StateBubbleOverlay, type BubbleHover } from "./state-bubble-overlay";
import { StatePanel } from "./state-panel";
import { groupByState } from "@/lib/fba-inventory-map/state-grouping";
```
and drop `Dot` from the types import if it becomes unused.

(b) Selection: add `state: string | null` to the `selection` type and to its initial value (`state: null`). Below the derived `asin`, add
```tsx
  const pickedState = selection.accountId === accountId ? selection.state : null;
```
Every existing `setSelection({ … })` call gets `state: null` (setMonth, the product `onChange`) — a month or product change resets the panel to the top state. Add, next to `setMonth`:
```tsx
  // Picking a state never changes month/asin (so it never changes requestKey → no refetch).
  // us-choropleth sends null when the selected state is clicked again: ignore it, keep the state.
  const pickState = (code: string | null) => {
    if (code) setSelection({ accountId, month, asin, state: code });
  };
```
(`month` and `asin` here are the derived values, NOT `data.month` — using `data.month` would turn a null month into a concrete one and refetch.)

(c) Hover: `const [hover, setHover] = useState<BubbleHover | null>(null);`

(d) Just after `placedShare` is computed:
```tsx
  const bubbles = groupByState(data.dots, data.totals.units);
  const effectiveState = pickedState ?? bubbles[0]?.state ?? null;
  const bubble = bubbles.find((b) => b.state === effectiveState) ?? null;
```

(e) Unplaced stat value: `` `${nf.format(data.unplaced.units)} units · ${pct(data.unplaced.share)}` ``.

(f) Replace the whole `<section className={CARD}> … </section>` block with:
```tsx
      <div className="grid gap-2.5 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          {data.demand.status === "unavailable" && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400">{REASON[data.demand.reason]}</p>
          )}
          <UsChoropleth
            surface="hub"
            data={choropleth}
            selected={effectiveState}
            onSelect={pickState}
            formatLegend={(v) => nf.format(v)}
            overlay={<StateBubbleOverlay bubbles={bubbles} selected={effectiveState} onSelect={pickState} onHover={setHover} />}
          />
          <div className={`mt-2 flex flex-wrap items-center gap-4 ${MICRO}`}>
            <span className="flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--foreground)" fillOpacity={0.85} /></svg>FBA units by state (circle size)</span>
            <span className="normal-case tracking-normal font-medium">Demand includes FBM orders.</span>
          </div>
          {hover && (
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-mf-ink px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="font-bold">{hover.bubble.name}</div>
              <div className="tabular-nums">{nf.format(hover.bubble.units)} units · {pct(hover.bubble.share)} · {usd.format(hover.bubble.fee)}</div>
              <div className="opacity-80">{hover.bubble.fcs.length} FC{hover.bubble.fcs.length === 1 ? "" : "s"} · click for detail</div>
            </div>
          )}
        </section>
        <StatePanel stateCode={effectiveState} bubble={bubble} demand={data.demand} placedUnits={data.totals.placedUnits} />
      </div>
```

(g) Delete the old overlay: `git rm src/components/reports/fba-inventory-map/fc-dot-overlay.tsx`, then `grep -rn "fc-dot-overlay\|FcDotOverlay" src` must print nothing.

- [ ] **Step 4: Run to verify all pass**
Run: `node_modules/.bin/vitest run src/components/reports/fba-inventory-map src/lib/fba-inventory-map`
Expected: all PASS — section file = previous 17 − 1 (dotRadius helper moved) + 4 new = 20 tests; `state-view.test.tsx` 6; `state-grouping.test.ts` 6.

- [ ] **Step 5: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add -- src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx
git commit -m "feat(fba-map): one circle per state + state-detail side panel; unplaced card reads 'N units · P%'

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx src/components/reports/fba-inventory-map/fc-dot-overlay.tsx
```

---

### Task 4: Gates + browser pass

**Files:** none modified (unless a gate finds a defect — fix it in the owning file, own commit).

- [ ] **Step 1: Scoped tests** — `node_modules/.bin/vitest run src/lib/albers.test.ts src/lib/us-map-geometry.test.ts src/lib/fc-locations.test.ts src/lib/fba-inventory-map src/app/api/reports/fba-inventory-map src/components/reports/fba-inventory-map src/components/reports/v2 src/components/layout src/lib/reports src/app/reports`
Expected: everything passes except the 1 pre-existing `no-hub-orange` failure on `reports-controls-bar.tsx`. Previous run was 402/403; this plan adds +6 (state-grouping) +6 (state-view) −1 (dotRadius helper test moved out of the section file) +4 (section) = **417 passed / 418**.

- [ ] **Step 2: tsc** — `node_modules/.bin/tsc --noEmit` in background; zero errors in any file this plan touched (the 3 new files, the 3 modified files); total should stay 101.

- [ ] **Step 3: eslint** — `node_modules/.bin/eslint src/lib/fba-inventory-map src/components/reports/fba-inventory-map` → 0 errors.

- [ ] **Step 4: Browser pass** — the controller runs it in the in-app browser pane on `localhost:3101` (launch entry `thread-z-dev-3101`; Thread AA holds 3100; the pane's localhost session is already Manu's owner login). Accounts ReadyRESCUE and Mission, month 2026-08:
  1. At most one circle per state; no hollow dots; Unplaced card reads `N units · P%`.
  2. Panel opens on the top state; its FC units add up to the state's units.
  3. Click a small NE state's circle (NJ / CT / MD) → panel swaps; selected circle has the orange stroke and the state outline.
  4. Click a state shape with orders but no stock → "No FBA stock in {State}."
  5. Change product, month, account → panel resets to the new top state; Network shows no fetch on a state click.
  6. Hover a circle → tooltip with name, units, share, fee, FC count.
  7. Screenshot light + dark for Manu.

- [ ] **Step 5: Handoff** — rewrite `/Users/manu/.claude/handoffs/thread-Z.md` + the Thread Z row in `primer.md`. Nothing is pushed; push / PR each need Manu's OK.
