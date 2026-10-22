# Reports Phase 6 — Decision Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `actions` section of the redesigned reports shell with three deterministic decision-support cards (Top performers · Efficiency risks · Recommended actions) computed purely from keyword + campaign data already lifted in the shell.

**Architecture:** One new pure module `primitives/decision-support.ts` (fully TDD'd) exposes `rankPerformers`, `rankRisks`, and `recommendedActions` over the shared `MetricRow` shape. One new presentational section `decision-support-section.tsx` renders three cards with the established skeleton/populated/data-unavailable states, reusing `HeatCell` for band-colored chips. The shell mounts it at `sectionContent.actions`, passing the already-lifted `keywords` + `campaigns` state — no new fetch, no new endpoint.

**Tech Stack:** TypeScript 5.9, React 19, Next.js App Router, Vitest 4, Tailwind v4. Pure logic in `.ts`, presentational component in `.tsx`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-29-reports-phase6-decision-support-design.md` is source of truth.
- **Thresholds (defaults):** `{ roasScaleFloor: 4.0, acosRiskCeiling: 0.60, zeroConvSpendFloor: 15 }`.
- **Unit fix:** `MetricRow.acos` is percent-points; `acosRiskCeiling` is a ratio → risk compares `acos > acosRiskCeiling * 100` (i.e. `> 60`).
- **Boundaries:** performers `roas >= 4.0` inclusive; high-ACoS risk `acos > 60` exclusive; zero-conv risk `adSpend > 15` exclusive AND `conversions === 0`.
- **Entity scope:** ranking cards use **keywords only**; recommended actions use **keyword rules + campaign rules** (campaign rows feed only the budget-shift action).
- **Emphasis color:** `getSurfacePalette(surface).accent` (#FF751F hub / #2A5059 portal — never orange on portal). Band colors via `HeatCell` (good/warn/bad tokens).
- **Three states everywhere:** skeleton · populated · explicit "data unavailable"; too-few results render fewer items / explicit empty message, never padded placeholders, never blank.
- **No new endpoints / no per-component fetch.** Reuse `keywords` + `campaigns` already lifted once per surface.
- **Commands:** typecheck `npx tsc --noEmit` (NEVER `next build` — PORT 3000 is the dev server); tests `npx vitest run <path>`. Green vitest can hide TS errors — run tsc before claiming compilation.
- **Commits:** one task per commit; explicit pathspec on `git add` AND `git commit` (never `git add .`); trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit only on the user's explicit per-action OK.
- **DOM not unit-tested** (jsdom-unfriendly) — verified by `tsc` + visual dogfood on `/reports/v2-preview` (account 1707700, month-to-date, hub + portal stacked). No fake DOM asserts.

---

### Task 1: Pure decision-support module (TDD)

**Files:**
- Create: `src/components/reports/v2/primitives/decision-support.ts`
- Test: `src/components/reports/v2/primitives/decision-support.test.ts`

**Interfaces:**
- Consumes: `MetricRow` from `./table-derivations`.
- Produces:
  - `DecisionThresholds { roasScaleFloor: number; acosRiskCeiling: number; zeroConvSpendFloor: number }`
  - `DEFAULT_THRESHOLDS: DecisionThresholds`
  - `TOP_N: number` (= 2)
  - `RiskRow extends MetricRow { reasons: { highAcos: boolean; zeroConv: boolean } }`
  - `ActionKind = "cut-zero-conv" | "cut-high-acos" | "scale-keywords" | "shift-budget"`
  - `Action { kind: ActionKind; text: string; count: number }`
  - `rankPerformers(rows: MetricRow[], t?: DecisionThresholds): MetricRow[]`
  - `rankRisks(rows: MetricRow[], t?: DecisionThresholds): RiskRow[]`
  - `recommendedActions(keywordRows: MetricRow[], campaignRows: MetricRow[], t?: DecisionThresholds): Action[]`

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/primitives/decision-support.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MetricRow } from "./table-derivations";
import {
  rankPerformers, rankRisks, recommendedActions,
  DEFAULT_THRESHOLDS, TOP_N,
} from "./decision-support";

const mr = (o: Partial<MetricRow>): MetricRow => ({
  name: "r", adSpend: 0, adRevenue: 0, acos: 0, roas: 0, avgCpc: 0,
  impressions: 0, clicks: 0, conversions: 0, cvr: 0, ...o,
});

describe("rankPerformers", () => {
  it("includes roas exactly at the floor (>=)", () => {
    expect(rankPerformers([mr({ name: "a", roas: 4.0 })]).map((r) => r.name)).toEqual(["a"]);
  });
  it("excludes roas just below the floor", () => {
    expect(rankPerformers([mr({ name: "a", roas: 3.99 })])).toEqual([]);
  });
  it("sorts by roas descending (full list, not truncated)", () => {
    const out = rankPerformers([
      mr({ name: "lo", roas: 4.5 }), mr({ name: "hi", roas: 25 }), mr({ name: "mid", roas: 8 }),
    ]);
    expect(out.map((r) => r.name)).toEqual(["hi", "mid", "lo"]);
  });
  it("returns [] for empty input", () => {
    expect(rankPerformers([])).toEqual([]);
  });
});

describe("rankRisks", () => {
  it("high-ACoS boundary: exactly 60 is excluded, above 60 included", () => {
    expect(rankRisks([mr({ name: "at60", acos: 60, conversions: 3 })])).toEqual([]);
    const out = rankRisks([mr({ name: "over", acos: 60.01, conversions: 3, adSpend: 5 })]);
    expect(out.map((r) => r.name)).toEqual(["over"]);
    expect(out[0].reasons).toEqual({ highAcos: true, zeroConv: false });
  });
  it("zero-conv boundary: spend exactly 15 excluded, above 15 with 0 conv included", () => {
    expect(rankRisks([mr({ name: "at15", adSpend: 15, conversions: 0 })])).toEqual([]);
    const out = rankRisks([mr({ name: "over", adSpend: 15.01, conversions: 0 })]);
    expect(out.map((r) => r.name)).toEqual(["over"]);
    expect(out[0].reasons).toEqual({ highAcos: false, zeroConv: true });
  });
  it("zero-conv requires conversions === 0 (spend>15 with a conversion does not trip zero-conv)", () => {
    expect(rankRisks([mr({ name: "x", adSpend: 100, conversions: 1, acos: 30 })])).toEqual([]);
  });
  it("a row tripping both reasons carries both flags", () => {
    const out = rankRisks([mr({ name: "both", acos: 80, adSpend: 20, conversions: 0 })]);
    expect(out[0].reasons).toEqual({ highAcos: true, zeroConv: true });
  });
  it("sorts by adSpend descending", () => {
    const out = rankRisks([
      mr({ name: "lo", acos: 70, adSpend: 5, conversions: 2 }),
      mr({ name: "hi", acos: 70, adSpend: 90, conversions: 2 }),
    ]);
    expect(out.map((r) => r.name)).toEqual(["hi", "lo"]);
  });
  it("returns [] for empty input", () => {
    expect(rankRisks([])).toEqual([]);
  });
});

describe("TOP_N truncation on ranked output", () => {
  it("slice(0, TOP_N) yields the two highest performers", () => {
    const out = rankPerformers([
      mr({ name: "a", roas: 5 }), mr({ name: "b", roas: 9 }), mr({ name: "c", roas: 7 }),
    ]).slice(0, TOP_N);
    expect(out.map((r) => r.name)).toEqual(["b", "c"]);
  });
});

describe("recommendedActions", () => {
  it("returns [] when nothing triggers", () => {
    expect(recommendedActions([mr({ roas: 1, acos: 10, adSpend: 1, conversions: 1 })], [])).toEqual([]);
  });
  it("emits cut-zero-conv with the full count (not top-2)", () => {
    const kw = [
      mr({ name: "z1", adSpend: 20, conversions: 0 }),
      mr({ name: "z2", adSpend: 30, conversions: 0 }),
      mr({ name: "z3", adSpend: 40, conversions: 0 }),
    ];
    const actions = recommendedActions(kw, []);
    const a = actions.find((x) => x.kind === "cut-zero-conv");
    expect(a?.count).toBe(3);
    expect(a?.text).toContain("3 zero-conversion terms");
  });
  it("emits cut-high-acos for high-ACoS terms", () => {
    const a = recommendedActions([mr({ name: "h", acos: 90, conversions: 4 })], []);
    expect(a.find((x) => x.kind === "cut-high-acos")?.count).toBe(1);
  });
  it("emits scale-keywords for keyword performers", () => {
    const a = recommendedActions([mr({ name: "p", roas: 8 })], []);
    expect(a.find((x) => x.kind === "scale-keywords")?.count).toBe(1);
  });
  it("shift-budget comes only from campaign performers; absent campaigns suppress it", () => {
    const withCamp = recommendedActions([], [mr({ name: "c", roas: 6 }), mr({ name: "c2", roas: 5 })]);
    expect(withCamp.find((x) => x.kind === "shift-budget")?.count).toBe(2);
    const noCamp = recommendedActions([mr({ name: "p", roas: 8 })], []);
    expect(noCamp.find((x) => x.kind === "shift-budget")).toBeUndefined();
  });
  it("emits all four kinds in fixed waste-first order, capped at 4", () => {
    const kw = [
      mr({ name: "zc", adSpend: 20, conversions: 0 }),
      mr({ name: "ha", acos: 90, conversions: 3 }),
      mr({ name: "perf", roas: 10 }),
    ];
    const camp = [mr({ name: "cperf", roas: 6 })];
    const kinds = recommendedActions(kw, camp).map((a) => a.kind);
    expect(kinds).toEqual(["cut-zero-conv", "cut-high-acos", "scale-keywords", "shift-budget"]);
  });
  it("respects custom thresholds", () => {
    const kw = [mr({ name: "p", roas: 3.0 })];
    expect(recommendedActions(kw, [], { ...DEFAULT_THRESHOLDS, roasScaleFloor: 3.0 })
      .find((x) => x.kind === "scale-keywords")?.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/reports/v2/primitives/decision-support.test.ts`
Expected: FAIL — cannot find module `./decision-support`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reports/v2/primitives/decision-support.ts`:

```ts
import type { MetricRow } from "./table-derivations";

export interface DecisionThresholds {
  /** ROAS >= this → scale candidate. */
  roasScaleFloor: number;
  /** ACoS ratio; a row with acos% > ceiling*100 is a risk. */
  acosRiskCeiling: number;
  /** spend > this AND 0 conversions → risk. Dollars. */
  zeroConvSpendFloor: number;
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  roasScaleFloor: 4.0,
  acosRiskCeiling: 0.6,
  zeroConvSpendFloor: 15,
};

/** How many entities each ranking card displays. */
export const TOP_N = 2;

export interface RiskRow extends MetricRow {
  reasons: { highAcos: boolean; zeroConv: boolean };
}

export type ActionKind = "cut-zero-conv" | "cut-high-acos" | "scale-keywords" | "shift-budget";
export interface Action {
  kind: ActionKind;
  text: string;
  count: number;
}

/** Full qualifying list of scale candidates, ROAS desc. Consumer slices to TOP_N. */
export function rankPerformers(rows: MetricRow[], t: DecisionThresholds = DEFAULT_THRESHOLDS): MetricRow[] {
  return rows.filter((r) => r.roas >= t.roasScaleFloor).sort((a, b) => b.roas - a.roas);
}

/** Full qualifying list of efficiency risks, adSpend desc. Consumer slices to TOP_N.
 *  acos is percent-points; the ratio ceiling is scaled to percent (0.60 → 60). */
export function rankRisks(rows: MetricRow[], t: DecisionThresholds = DEFAULT_THRESHOLDS): RiskRow[] {
  const ceilingPct = t.acosRiskCeiling * 100;
  const out: RiskRow[] = [];
  for (const r of rows) {
    const highAcos = r.acos > ceilingPct;
    const zeroConv = r.adSpend > t.zeroConvSpendFloor && r.conversions === 0;
    if (highAcos || zeroConv) out.push({ ...r, reasons: { highAcos, zeroConv } });
  }
  return out.sort((a, b) => b.adSpend - a.adSpend);
}

const plural = (n: number) => (n === 1 ? "" : "s");

/** Concrete next steps derived from the rule outputs. Counts reflect the FULL
 *  qualifying sets (not the TOP_N shown). Waste-first order, capped at 4. */
export function recommendedActions(
  keywordRows: MetricRow[],
  campaignRows: MetricRow[],
  t: DecisionThresholds = DEFAULT_THRESHOLDS,
): Action[] {
  const kwRisks = rankRisks(keywordRows, t);
  const zeroConvCount = kwRisks.filter((r) => r.reasons.zeroConv).length;
  const highAcosCount = kwRisks.filter((r) => r.reasons.highAcos).length;
  const scaleKwCount = rankPerformers(keywordRows, t).length;
  const shiftCount = rankPerformers(campaignRows, t).length;
  const acosPct = Math.round(t.acosRiskCeiling * 100);

  const actions: Action[] = [];
  if (zeroConvCount > 0)
    actions.push({ kind: "cut-zero-conv", count: zeroConvCount,
      text: `Reduce or pause bids on ${zeroConvCount} zero-conversion term${plural(zeroConvCount)} (>$${t.zeroConvSpendFloor} spend, 0 orders).` });
  if (highAcosCount > 0)
    actions.push({ kind: "cut-high-acos", count: highAcosCount,
      text: `Lower bids on ${highAcosCount} term${plural(highAcosCount)} running above ${acosPct}% ACoS.` });
  if (scaleKwCount > 0)
    actions.push({ kind: "scale-keywords", count: scaleKwCount,
      text: `Scale ${scaleKwCount} keyword${plural(scaleKwCount)} at ROAS ≥ ${t.roasScaleFloor} — raise bids/budget.` });
  if (shiftCount > 0)
    actions.push({ kind: "shift-budget", count: shiftCount,
      text: `Shift budget toward ${shiftCount} campaign${plural(shiftCount)} at ROAS ≥ ${t.roasScaleFloor}.` });
  return actions.slice(0, 4);
}
```

*Note: zero-conversion terms have zero ad revenue, which the route collapses to `acos = 0`, so in practice a zero-conv term never also trips high-ACoS — the two counts don't overlap. The `reasons` struct still tracks both flags defensively.*

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/reports/v2/primitives/decision-support.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 new errors (only the two known pre-existing errors — sales-summary `not-connected-card.test.tsx` and the `clients/[clientIdCode]` route-types quirk).

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/v2/primitives/decision-support.ts src/components/reports/v2/primitives/decision-support.test.ts
git commit -m "feat(reports-v2): decision-support pure rules (rankPerformers/rankRisks/recommendedActions), TDD (phase 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Decision-support section component

**Files:**
- Create: `src/components/reports/v2/decision-support-section.tsx`

**Interfaces:**
- Consumes: `rankPerformers`, `rankRisks`, `recommendedActions`, `TOP_N`, `RiskRow`, `Action` from `./primitives/decision-support`; `keywordToMetricRow`, `campaignToMetricRow`, `roasBandOf`, `acosBandOf`, `MetricRow` from `./primitives/table-derivations`; `KeywordsResponse` from `./primitives/keywords`; `CampaignsResponse` from `./primitives/campaigns`; `getSurfacePalette`, `Surface as SurfaceKind` from `./primitives/palette`; `Surface` from `./primitives/surface`; `HeatCell` from `./primitives/heat-cell`; `fmtPct`, `fmtRoas`, `fmtCurrencyCompact` from `./primitives/kpi-derivations`.
- Produces: `export function DecisionSupportSection({ surface, keywords, campaigns, loading, requestKey }): JSX.Element` — prop shape mirrors the Phase 5 sections exactly (`surface: SurfaceKind; keywords: KeywordsResponse | null; campaigns: CampaignsResponse | null; loading: boolean; requestKey: string`).

- [ ] **Step 1: Write the component**

Create `src/components/reports/v2/decision-support-section.tsx`:

```tsx
"use client";
import { useMemo, type ReactNode } from "react";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { getSurfacePalette } from "./primitives/palette";
import type { KeywordsResponse } from "./primitives/keywords";
import type { CampaignsResponse } from "./primitives/campaigns";
import { Surface } from "./primitives/surface";
import { HeatCell } from "./primitives/heat-cell";
import {
  keywordToMetricRow, campaignToMetricRow, roasBandOf, acosBandOf,
  type MetricRow,
} from "./primitives/table-derivations";
import {
  rankPerformers, rankRisks, recommendedActions, TOP_N,
  type RiskRow, type Action,
} from "./primitives/decision-support";
import { fmtPct, fmtRoas, fmtCurrencyCompact } from "./primitives/kpi-derivations";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-mf-line bg-white p-[18px] shadow-[0_10px_30px_rgba(16,34,39,0.12)]">
      <h3 className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-mf-muted">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="py-4 text-sm text-mf-muted">{label}</div>;
}

function PerformersCard({ available, rows }: { available: boolean; rows: MetricRow[] }) {
  if (!available) return <Card title="Top performers"><Empty label="Keyword data unavailable for this period." /></Card>;
  const top = rankPerformers(rows).slice(0, TOP_N);
  return (
    <Card title="Top performers">
      {top.length === 0 ? (
        <Empty label="No scale candidates — no keywords at ROAS ≥ 4." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {top.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <span className="truncate font-semibold text-mf-ink" title={r.name}>{r.name}</span>
              <span className="flex items-center gap-2 text-xs text-mf-muted">
                <HeatCell band={roasBandOf(r.roas)}>{fmtRoas(r.roas)}</HeatCell>
                <span>CVR {fmtPct(r.cvr)}</span>
                <span className="text-mf-positive">candidate for scale</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RisksCard({ available, rows }: { available: boolean; rows: RiskRow[] }) {
  if (!available) return <Card title="Efficiency risks"><Empty label="Keyword data unavailable for this period." /></Card>;
  const top = rows.slice(0, TOP_N);
  return (
    <Card title="Efficiency risks">
      {top.length === 0 ? (
        <Empty label="No efficiency risks this period." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {top.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <span className="truncate font-semibold text-mf-ink" title={r.name}>{r.name}</span>
              <span className="flex items-center gap-2 text-xs text-mf-muted">
                {r.reasons.highAcos ? (
                  <HeatCell band={acosBandOf(r.acos)}>{fmtPct(r.acos)} ACoS</HeatCell>
                ) : (
                  <span className="text-mf-negative">{fmtCurrencyCompact(r.adSpend)} spend · 0 orders</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActionsCard({ actions }: { actions: Action[] }) {
  return (
    <Card title="Recommended actions">
      {actions.length === 0 ? (
        <Empty label="Spend is efficient and within targets — no actions this period." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {actions.map((a) => (
            <li key={a.kind} className="flex gap-2 text-sm text-mf-ink">
              <span aria-hidden className="text-mf-muted">•</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DecisionSupportSection({ surface, keywords, campaigns, loading, requestKey }: {
  surface: SurfaceKind;
  keywords: KeywordsResponse | null;
  campaigns: CampaignsResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  getSurfacePalette(surface); // surface reserved for future accenting; keeps prop contract aligned with siblings
  const kwAvailable = !!(keywords && Array.isArray(keywords.keywords));
  const campAvailable = !!(campaigns && Array.isArray(campaigns.rowsByName));

  const kwRows = useMemo<MetricRow[]>(
    () => (kwAvailable ? keywords!.keywords.map(keywordToMetricRow) : []),
    [kwAvailable, keywords],
  );
  const campRows = useMemo<MetricRow[]>(
    () => (campAvailable ? campaigns!.rowsByName.map(campaignToMetricRow) : []),
    [campAvailable, campaigns],
  );
  const risks = useMemo(() => rankRisks(kwRows), [kwRows]);
  const actions = useMemo(() => recommendedActions(kwRows, campRows), [kwRows, campRows]);

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load decision support.</div></Surface>;
  }
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-[18px] border border-mf-line bg-white/60" />)}
      </div>
    );
  }
  if (!kwAvailable && !campAvailable) {
    return <Surface title="Decision support"><div className="p-[18px] text-mf-muted">Data unavailable for this period.</div></Surface>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <PerformersCard available={kwAvailable} rows={kwRows} />
      <RisksCard available={kwAvailable} rows={risks} />
      <ActionsCard actions={actions} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 new errors (only the two known pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/v2/decision-support-section.tsx
git commit -m "feat(reports-v2): decision-support section — 3 cards, 3 states, reuses HeatCell (phase 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the section into the shell

**Files:**
- Modify: `src/components/reports/v2/performance-overview-v2.tsx` (add import; add `actions` entry to `sectionContent`; update the `actions` section blurb)

**Interfaces:**
- Consumes: `DecisionSupportSection` from `./decision-support-section`; existing shell state `keywords`, `campaigns`, `keywordsLoading`, `campaignsLoading`, `requestKey`, `surface`.

- [ ] **Step 1: Add the import**

In `src/components/reports/v2/performance-overview-v2.tsx`, alongside the other section imports (near the `CampaignDetailSection` import), add:

```tsx
import { DecisionSupportSection } from "./decision-support-section";
```

- [ ] **Step 2: Mount the section in `sectionContent`**

In the `sectionContent` object (currently ending at the `campaigns:` entry, around line 63), add the `actions` entry:

```tsx
    actions: (
      <DecisionSupportSection
        surface={surface}
        keywords={keywords}
        campaigns={campaigns}
        loading={keywordsLoading || campaignsLoading}
        requestKey={requestKey}
      />
    ),
```

- [ ] **Step 3: Update the section blurb (fallback no longer used, keep accurate)**

In the `SECTIONS` array, change the `actions` entry blurb from `"... (phase 6)"` to reflect it's live:

```tsx
  { id: "actions", title: "Decision support", blurb: "Top performers · Efficiency risks · Recommended actions." },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 new errors (only the two known pre-existing errors).

- [ ] **Step 5: Re-run the full v2 primitives test suite (regression guard)**

Run: `npx vitest run src/components/reports/v2/primitives/`
Expected: PASS (existing suites + the new decision-support suite).

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/v2/performance-overview-v2.tsx
git commit -m "feat(reports-v2): mount decision-support section in shell actions slot (phase 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Hand off to visual dogfood**

Ask the user to eyeball `/reports/v2-preview` (account 1707700, month-to-date, hub + portal stacked) in their real browser (endpoints Redshift-slow ~20s). Confirm on both surfaces: three cards render; top performers show ROAS + CVR with band-colored ROAS chip; efficiency risks show the tripping metric (ACoS band chip or "$X spend · 0 orders"); recommended actions list reads sensibly with correct counts; empty states appear where a rule yields nothing; no orange anywhere on the portal surface. Fix anything flagged in a follow-up commit.

---

## Self-Review

**1. Spec coverage:**
- §10 Top performers (ROAS ≥ 4, top 2) → Task 1 `rankPerformers` + Task 2 `PerformersCard`. ✅
- §10 Efficiency risks (ACoS > 60% OR spend>$15 & 0 conv, ranked by spend, top 2) → Task 1 `rankRisks` + Task 2 `RisksCard`. ✅
- §10 Recommended actions (derived, not hardcoded; both keyword + campaign levers) → Task 1 `recommendedActions` + Task 2 `ActionsCard`. ✅
- §10 default thresholds → Task 1 `DEFAULT_THRESHOLDS`. ✅
- §10 empty-state (explicit, never empty card) → Task 2 per-card `Empty`. ✅
- §11 no new endpoints, reuse keywords+campaigns → Task 3 shell wiring, no new hook. ✅
- §16 TDD boundaries/ranking/top-N/zero-conv AND/empty-state → Task 1 test suite. ✅
- §16 DOM not unit-tested, tsc + dogfood → Task 2 Step 2, Task 3 Step 7. ✅
- Three states (skeleton/populated/unavailable) → Task 2. ✅
- Color rules (accent, HeatCell bands, no orange on portal) → Task 2 reuses HeatCell; dogfood confirms. ✅

**2. Placeholder scan:** No TBD/TODO; all steps carry actual code and exact run commands. ✅

**3. Type consistency:** `rankPerformers`/`rankRisks`/`recommendedActions`/`RiskRow`/`Action`/`TOP_N`/`DEFAULT_THRESHOLDS` names identical between Task 1 (definition), its tests, and Task 2 (consumer). Section prop shape matches the Phase 5 sibling contract. `HeatCell` `band` prop consumes `Band` from `roasBandOf`/`acosBandOf` (returns `Band`). ✅
