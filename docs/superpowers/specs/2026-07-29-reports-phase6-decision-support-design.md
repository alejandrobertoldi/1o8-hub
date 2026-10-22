# Reports Redesign — Phase 6: Decision Support — Design Spec

**Date:** 2026-07-29
**Parent spec:** `docs/superpowers/specs/2026-07-27-reports-redesign-design.md` (§10 Decision support, §11 data mapping, §16 testing)
**Phase 5 reference (shared-primitive pattern):** `docs/superpowers/specs/2026-07-29-reports-phase5-tables-design.md`
**Branch:** `feat/reports-redesign` (main dir, not a worktree)

---

## 1. Purpose

Close out the `actions` section of the redesigned reports shell ("Top performers · Efficiency risks · Recommended actions") with three deterministic decision-support cards. The page should end with clear, ranked opportunities and risks so a reader knows what to *do*, not just what happened (acceptance criterion: "page ends with clear opportunities and risks").

Everything here is a **pure derivation over data already lifted in the shell**. No new endpoint, no new fetch, no per-component fetch.

## 2. Scope

### In scope
- One new pure module `primitives/decision-support.ts` (fully unit-tested).
- One new presentational section `decision-support-section.tsx` mounted at the `actions` section id.
- Wiring `sectionContent.actions` in the shell (`performance-overview-v2.tsx`), reusing the already-lifted `keywords` + `campaigns` state.

### Out of scope (deferred)
- Threshold overriding UI (thresholds are a config object with defaults now; per-account/client override is Phase 7 controls).
- Deep links / click-through from a card row into the table (Phase 7 wiring).
- Any change to the keyword/campaign tables or their derivations.

### Locked decisions (do not re-litigate)
- **Entity scope:** the two ranking cards (Top performers, Efficiency risks) rank **keywords only** — keywords are the bid-level lever and match every §10 example string. **Recommended actions** synthesize from **both** keyword rules (bid actions) and campaign rules (budget-shift action).
- Rules are generic over `MetricRow[]` and run once per population (keywords, campaigns) — no pooled ranking (a campaign's spend already contains its keywords' spend; pooling would double-count).
- Default thresholds: `{ roasScaleFloor: 4.0, acosRiskCeiling: 0.60, zeroConvSpendFloor: 15 }`.
- Emphasis color = `accentFor(surface)` (#FF751F hub / #2A5059 portal — never orange on portal). Band colors: good #18864B / warn #A66600 / bad #C73737.
- Every panel has three states: skeleton · populated · explicit "data unavailable" (never blank). Cards with too few qualifying entities render fewer items or an explicit empty message, never padded placeholders.
- No new endpoints; reuse `keywords` + `campaigns` already lifted once per surface.

## 3. Data inputs

Both populations are already fetched in the shell and normalize to the shared `MetricRow` shape via existing mappers:

| Population | Source (already in shell) | Mapper | Used for |
|---|---|---|---|
| Keywords | `keywords` (`useKeywords`) | `keywordToMetricRow` | Top performers, Efficiency risks, keyword-level actions |
| Campaigns | `campaigns.rowsByName` (`useCampaigns`) | `campaignToMetricRow` | Campaign-level budget-shift action only |

`MetricRow` already carries every field the rules need: `name`, `matchType?`, `adSpend`, `adRevenue`, `acos` (percent-points), `roas` (ratio), `conversions`, `cvr` (percent-points).

**Unit reconciliation (critical):** `MetricRow.acos` is in **percent points** (e.g. `262.87`), but `acosRiskCeiling` is a ratio (`0.60`). The risk rule therefore compares `acos > acosRiskCeiling * 100` (i.e. `acos > 60`). `roasScaleFloor` and `zeroConvSpendFloor` are already in the same units as `roas` and `adSpend` respectively — no conversion.

## 4. Pure module — `primitives/decision-support.ts`

### Types
```ts
export interface DecisionThresholds {
  roasScaleFloor: number;     // ROAS >= this → scale candidate (default 4.0)
  acosRiskCeiling: number;    // ACoS ratio; acos% > ceiling*100 → risk (default 0.60)
  zeroConvSpendFloor: number; // spend > this AND 0 conversions → risk (default 15)
}
export const DEFAULT_THRESHOLDS: DecisionThresholds =
  { roasScaleFloor: 4.0, acosRiskCeiling: 0.60, zeroConvSpendFloor: 15 };

export const TOP_N = 2;

export interface RiskRow extends MetricRow {
  reasons: { highAcos: boolean; zeroConv: boolean };
}

export type ActionKind = "cut-zero-conv" | "cut-high-acos" | "scale-keywords" | "shift-budget";
export interface Action { kind: ActionKind; text: string; count: number; }
```

### Functions
- `rankPerformers(rows: MetricRow[], t = DEFAULT_THRESHOLDS): MetricRow[]`
  Filter `roas >= t.roasScaleFloor`; sort by `roas` **desc**; return the **full** qualifying list (stable). Card slices `.slice(0, TOP_N)`.
- `rankRisks(rows: MetricRow[], t = DEFAULT_THRESHOLDS): RiskRow[]`
  A row qualifies if `acos > t.acosRiskCeiling * 100` **OR** (`adSpend > t.zeroConvSpendFloor` **AND** `conversions === 0`). Attach `reasons.highAcos` / `reasons.zeroConv`. Sort by `adSpend` **desc**; return the **full** qualifying list (stable). Card slices `.slice(0, TOP_N)`.
- `recommendedActions(keywordRows, campaignRows, t = DEFAULT_THRESHOLDS): Action[]`
  Compute keyword risks + keyword performers + campaign performers, then emit gated actions in this fixed order (waste-first, then scale), each only when its count > 0, capped at 4:
  1. `cut-zero-conv` — count of keyword risks with `reasons.zeroConv` → "Reduce or pause bids on N zero-conversion term(s) (>$15 spend, 0 orders)."
  2. `cut-high-acos` — count of keyword risks with `reasons.highAcos` → "Lower bids on M term(s) running above 60% ACoS."
  3. `scale-keywords` — count of keyword performers → "Scale P keyword(s) at ROAS ≥ 4 — raise bids/budget."
  4. `shift-budget` — count of campaign performers → "Shift budget toward Q campaign(s) at ROAS ≥ 4."
  Counts use the **full** qualifying sets (not the top-2 displayed). If no action triggers, return `[]` (the card renders an explicit "efficient" line).

### Boundary conventions (all strict per §10 `>` / `≥`)
- Performers: `roas >= 4.0` **inclusive** (exactly 4.0 qualifies).
- High-ACoS risk: `acos > 60` **exclusive** (exactly 60 does **not** qualify).
- Zero-conv risk: `adSpend > 15` **exclusive** (exactly 15 does **not** qualify) **AND** `conversions === 0`.
- A row satisfying both risk reasons appears once, with both `reasons` flags true.

## 5. Presentational section — `decision-support-section.tsx`

Mirrors the Phase 5 section contract exactly.

- **Props:** `{ surface: SurfaceKind; keywords?: KeywordsResponse; campaigns?: CampaignsResponse; loading: boolean; requestKey?: string }`.
- **Layout:** three cards in a responsive row (span-4 each; stack on narrow), matching the Executive Insights card rhythm. Section wrapped in the shared `Surface`.
- **Top performers card:** rows of `name · ROAS · CVR` with a "candidate for scale" tag. ROAS chip uses band color. Empty → "No scale candidates — no entities at ROAS ≥ 4."
- **Efficiency risks card:** rows of `name · tripping metric`. If `highAcos` → show `ACoS%` (bad band); else zero-conv → "$X spend · 0 orders". Empty → "No efficiency risks this period."
- **Recommended actions card:** the generated `Action[]` as a list. Empty (`[]`) → "Spend is efficient and within targets — no actions this period."
- **Accessibility:** never color-only — numeric value always visible in every chip; `aria-label` where a status must be unambiguous.

### Three states
- **Skeleton:** `loading === true` → skeleton card rows.
- **Populated:** data present → cards as above (each card independently shows its own empty message when its rule yields nothing).
- **Data unavailable:** not loading and both `keywords` and `campaigns` are absent/failed → explicit "data unavailable" state for the whole section (mirrors Phase 5 sections). Keywords present but campaigns absent (or vice-versa) still renders — the keyword cards populate and only the campaign-derived action is suppressed.

## 6. Shell wiring — `performance-overview-v2.tsx`

Add to `sectionContent`:
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
No new hook, no new fetch — `keywords`, `campaigns`, and their loading flags are already lifted once per surface.

## 7. Testing strategy (TDD — pure logic only)

Unit-test `primitives/decision-support.ts` with `npx vitest run`:
- `rankPerformers`: inclusion at `roas === 4.0`, exclusion just below, ROAS-desc ordering, empty input → `[]`, full-list return (not pre-truncated).
- `rankRisks`: high-ACoS boundary (`60` excluded, `60.01` included), zero-conv boundary (`spend === 15` excluded, `15.01` included; `conversions === 0` required), a row that trips both reasons has both flags, spend-desc ordering, empty input → `[]`.
- `.slice(0, TOP_N)` truncation yields the two highest by the respective sort.
- `recommendedActions`: each trigger in isolation, all-four combined, none-triggered → `[]`, counts reflect full qualifying sets (not top-2), fixed order + 4-cap, campaign-absent case suppresses only `shift-budget`.

**Not unit-tested:** the section's DOM (jsdom-unfriendly; no fake DOM asserts). Verified by `npx tsc --noEmit` + visual dogfood on `/reports/v2-preview` (account 1707700, month-to-date, hub + portal stacked).

Commands: typecheck `npx tsc --noEmit` (never `next build`, PORT 3000 is the dev server); tests `npx vitest run <path>`. Green vitest can hide TS errors — run tsc before claiming compilation.

## 8. Task breakdown (one task per commit)

1. **T1 — pure module + tests (TDD):** `primitives/decision-support.ts` with types, thresholds, `rankPerformers`, `rankRisks`, `recommendedActions`; full boundary test suite written first.
2. **T2 — section component:** `decision-support-section.tsx` (three cards, three states), verified by `tsc`.
3. **T3 — shell wiring:** mount `DecisionSupportSection` in `sectionContent.actions`; update the section blurb; `tsc` clean; hand off to visual dogfood.

## 9. Acceptance criteria

- Reader sees ranked opportunities (top 2 keywords at ROAS ≥ 4) and ranked risks (top 2 keywords by spend among high-ACoS / zero-conv) plus concrete recommended actions.
- Every threshold boundary behaves exactly as §4 specifies (proven by unit tests).
- Cards degrade independently and never blank: skeleton → populated → "data unavailable"; per-card empty messages when a rule yields nothing.
- No new endpoint / fetch; `tsc` 0-new-errors; new vitest suite green.
- Hub↔portal color separation preserved (no orange on portal).
