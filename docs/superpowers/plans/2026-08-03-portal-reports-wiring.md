# Portal Reports Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the client portal's six report pages at the same `src/components/reports/v2/*` section components the hub already uses, scoped to one client's own account, and retire the dead Power BI iframe page.

**Architecture:** The hub's `/reports/*` pages are thin shells over a shared `useReportControls()` context. The portal gets a parallel `usePortalReportControls()` context whose account comes from the logged-in client's session (or `?client=` for admin preview) instead of a free client-select. `ReportsControlsBar` gains four optional props so one bar serves both surfaces. Five section components that currently hardcode hub orange gain a `surface` prop first, because nothing portal-facing can render correctly until they do.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Recharts, NextAuth v5, `@tanstack/react-query`, Vitest + jsdom + `@testing-library/react`.

**Source spec:** `docs/superpowers/specs/2026-08-03-portal-reports-wiring-design.md` — read §9 first. It records eight false claims the spec originally made about existing code, all corrected, plus the two design decisions Manu locked on 2026-08-03. Every task below is built against the corrected spec.

## Global Constraints

- Work **only** in the worktree `/Users/manu/MFHub/.worktrees/portal-reports-wiring` on branch `feat/portal-reports-wiring`. Never touch `/Users/manu/MFHub` — that is Thread C (Redshift archival) and has its own live work.
- Additive only. No schema changes. No DB writes expected anywhere in this plan.
- Typecheck: `node_modules/.bin/tsc --noEmit`, run in background, takes ~2 min. **NEVER** run `next build`.
- Tests: `node_modules/.bin/vitest run <path>`. Vitest does **not** typecheck — always follow with `tsc --noEmit` before claiming a task done.
- **This worktree has no `node_modules` of its own** — it is symlinked to `/Users/manu/MFHub/node_modules` (the house pattern; dependencies are identical to `main`). If the symlink is missing, recreate it rather than running `npm install`.

### Verification baseline — READ THIS BEFORE INTERPRETING ANY TEST OR TSC RUN

**This section overrides every "Expected: PASS" / "Expected: no errors" line below.** The branch did **not** start green, and the pre-existing failures are all inherited from `main` and out of scope. Full numbers, the failing-file list and the diagnosed causes are in `.superpowers/sdd/2026-08-03-portal-reports-wiring/verification-baseline.md`. In summary, measured at `5897da0d` before any work:

- **`tsc --noEmit` has exactly 1 pre-existing error**, in `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46` (TS2349, `TransactionSql` not callable). Any *other* tsc error is new and belongs to whoever introduced it. There is **no** `.next/dev/types` TS2344 pair in this worktree — that known false positive only appears where a dev server has run.
- **The full `vitest run` has 21 pre-existing failing files / 41 failing tests** out of 1100. Do not fix them; do not count them as your failure. Most are a stale `@/lib/api-auth` mock missing `getEffectiveAccountId`; the rest are Chromium, `DATABASE_URL` and a pre-existing SEO suite.
- **Every file this plan touches lives in a clean scope.** Prefer these while iterating, and treat them as the real gate:
  - `node_modules/.bin/vitest run src/components/reports` → 8 files / 112 tests, must stay 100%
  - `node_modules/.bin/vitest run src/lib/report-date-range src/lib/permissions` → 2 files / 14 tests, must stay 100%
- When a step says to run the **full** suite, the pass condition is "no *new* failures versus the 21/41 baseline", not zero failures.
- `rm -r` and `rm -f` are hard-blocked. Use `git rm` for tracked deletions.
- Never `git add .`. Use an explicit pathspec on both add and commit: `git commit -m "msg" -- <pathspec>` — `-m` **before** `--`.
- One task per commit. Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*` out of every commit.
- **Dual-accent rule** (`DESIGN.md`, load-bearing): hub accent is `#FF751F` (orange), portal accent is `#2A5059` (charcoal). Never orange on portal. The only approved exceptions are the two shared categorical slot arrays — `advertising-audit-section.tsx:131 SLOT_COLORS` and `inventory-section.tsx:69 STACK` — which Manu locked as identical on both surfaces (spec §9).
- **Mandatory import alias.** Every v2 section already imports a *component* named `Surface` from `./primitives/surface`. The palette *type* must therefore always be aliased, exactly as `performance-overview-v2.tsx:3` does it:
  `import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";`
- Recharts strokes and fills are SVG attributes and **cannot** resolve CSS `var()`. Chart colors must be concrete hex. This is why `accentFor()` exists alongside `getSurfacePalette()`.
- The portal never renders the Refresh button. Clients see data as last refreshed by the team or cron.
- `accentFor(surface)` lives in `src/components/reports/v2/primitives/chart-colors.ts` and returns `"#2A5059"` for `"portal"`, `"#FF751F"` for `"hub"`. It is already unit-tested in `primitives/chart-colors.test.ts` — do not re-test its values, test that callers route through it.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/components/reports/v2/portal-report-access.ts` | Pure section-permission logic. The only place the `canAccessSection` vs `clientHasSection` distinction is decided. |
| `src/components/reports/v2/portal-report-access.test.ts` | Unit tests for the above. No mocking needed. |
| `src/components/reports/v2/use-portal-report-controls.ts` | `PortalReportControls` type, `PortalReportControlsProvider`, `usePortalReportControls()`. Portal twin of `use-report-controls.ts`. |
| `src/components/reports/v2/portal-report-state.tsx` | `PortalReportState` (loading / not-found / unavailable) + `MissingAccountIdBanner`. Kills six copies of each state. |
| `src/components/reports/v2/no-hub-orange.test.ts` | Source-level regression guard: no v2 section reintroduces hub orange or a bare `text-brand`. |
| `src/components/reports/v2/subscribe-save-section.test.ts` | Tests `snsSeriesColors`. |
| `src/components/reports/v2/share-of-voice-section.test.ts` | Tests `sovEntityColors`. |
| `src/components/reports/v2/period-comparative-section.test.ts` | Tests `periodsFor`. |
| `src/components/reports/v2/keywords-gaps-v2.test.ts` | Tests `gapsBarColor`. |
| `src/app/portal/reports/layout.tsx` | Mounts the provider under a `Suspense` boundary so date selections survive page switches. |

**Modified**

| File | Change |
|---|---|
| `src/components/reports/v2/use-report-controls.ts` | Split `ReportRangeControls` base out of `ReportControls`; export `previousWeek`. |
| `src/components/reports/v2/reports-controls-bar.tsx` | Four new optional props; widen the `controls` prop type. |
| `src/components/reports/v2/subscribe-save-section.tsx` | `surface` prop; `snsSeriesColors`; thread into `SnsChart`. |
| `src/components/reports/v2/share-of-voice-section.tsx` | `surface` prop; `sovEntityColors`; thread two levels. |
| `src/components/reports/v2/period-comparative-section.tsx` | `surface` prop; `periodsFor`; `getSurfacePalette(surface)`. |
| `src/components/reports/v2/advertising-audit-section.tsx` | `surface` prop; `palette.eyebrowClass`; forward to `KeywordsGapsV2`. |
| `src/components/reports/v2/keywords-gaps-v2.tsx` | `surface` prop; `gapsBarColor`. |
| `src/components/reports/inventory-date-badge.tsx` | `surface` prop; portal-safe colors. |
| `src/app/reports/{advertising-audit,period-comparative,share-of-voice,subscribe-save}/page.tsx` | Add `surface="hub"`. |
| `src/app/reports/inventory/page.tsx` | Add `surface="hub"` to `InventoryDateBadge`. |
| `src/app/portal/reports/page.tsx` (renamed from `reports2/`) | Consume the provider; use `clientHasSection`. |
| `src/app/portal/reports/{overview,advertising-audit,inventory,period-comparative,share-of-voice,subscribe-save}/page.tsx` | Rewritten as thin shells. |
| `src/app/portal/reports/business-model-audit/page.tsx` | Back-link path only. |
| `src/app/portal/page.tsx` | Two `/portal/reports2` hrefs. |
| `src/components/layout/portal-shell.tsx` | Nav href. |
| `src/components/portal/admin-preview-toggle.tsx` | Drop the dead `reports2` map entry. |
| `src/lib/permissions.ts`, `src/lib/portal-audits.ts`, `src/app/api/portal/audit/route.ts` | Comment text only. |

**Deleted**

| File | Why |
|---|---|
| `src/app/portal/reports/page.tsx` (the 146-line Power BI iframe) | Orphaned, unlinked; frees the URL for the rename. |
| `src/app/api/portal/embed-url/route.ts` | Sole caller is the page above (verified by grep). |

---

## Task 1: SubscribeSaveSection — surface prop

Establishes the pattern the next three tasks follow: pull the hardcoded accent into a small exported pure function, thread the resolved colors down to whichever sub-component draws them.

**Files:**
- Modify: `src/components/reports/v2/subscribe-save-section.tsx` (imports at :7-10; constants at :58-63; `SnsChart` at :127-174; exported signature at :176-186; render at :272)
- Modify: `src/app/reports/subscribe-save/page.tsx:48`
- Test: `src/components/reports/v2/subscribe-save-section.test.ts` (create)

**Interfaces:**
- Consumes: `accentFor(surface: SurfaceKind): string` from `./primitives/chart-colors`; `type Surface as SurfaceKind` from `./primitives/palette`.
- Produces: `snsSeriesColors(surface: SurfaceKind): { current: string; py: string }` — exported. `SubscribeSaveSection` gains a **required** prop `surface: SurfaceKind`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/subscribe-save-section.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { snsSeriesColors } from "./subscribe-save-section";

describe("snsSeriesColors", () => {
  it("uses the hub accent for the current series on hub", () => {
    expect(snsSeriesColors("hub").current).toBe("#FF751F");
  });

  it("uses the portal accent for the current series on portal", () => {
    expect(snsSeriesColors("portal").current).toBe("#2A5059");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(snsSeriesColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("keeps the previous-year green shared across both surfaces", () => {
    expect(snsSeriesColors("hub").py).toBe("#05893E");
    expect(snsSeriesColors("portal").py).toBe("#05893E");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/v2/subscribe-save-section.test.ts`
Expected: FAIL — `snsSeriesColors` is not exported from `./subscribe-save-section` (import resolves to `undefined`, so the first `expect` throws `TypeError: snsSeriesColors is not a function`).

- [ ] **Step 3: Add the imports**

In `src/components/reports/v2/subscribe-save-section.tsx`, after the existing line 10 (`import { ChartFrame } from "./primitives/chart-frame";`) add:

```ts
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";
```

- [ ] **Step 4: Replace the hardcoded constants with the exported helper**

Replace lines 58-61, which currently read:

```ts
// Period entity colors — same as the Period Comparative section: current period
// orange, previous year green + dashed (validated pair, dataviz validator).
const CURRENT_COLOR = "#FF751F";
const PY_COLOR = "#05893E";
```

with:

```ts
// Period entity colors — same as the Period Comparative section. The current
// series follows the surface accent (orange on hub, charcoal on portal — the
// load-bearing dual-accent rule); previous year stays green + dashed on both.
// Recharts strokes are SVG attributes and cannot resolve CSS var(), so these
// must be concrete hex.
const PY_COLOR = "#05893E";

export function snsSeriesColors(surface: SurfaceKind): { current: string; py: string } {
  return { current: accentFor(surface), py: PY_COLOR };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/v2/subscribe-save-section.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Thread the colors into `SnsChart`**

Replace the `SnsChart` signature at line 127:

```ts
function SnsChart({ config, data }: { config: ChartConfig; data: DataRow[] }) {
```

with:

```ts
function SnsChart({
  config,
  data,
  colors,
}: {
  config: ChartConfig;
  data: DataRow[];
  colors: { current: string; py: string };
}) {
```

Inside `SnsChart`, replace the four color references:
- line 133: `<LegendKey key="cur" color={CURRENT_COLOR} label={config.barLabel} />` → `color={colors.current}`
- line 134: `<LegendKey key="py" color={PY_COLOR} label={config.pyLabel} dash />` → `color={colors.py}`
- line 153: `stroke={CURRENT_COLOR}` → `stroke={colors.current}`
- line 163: `stroke={PY_COLOR}` → `stroke={colors.py}`

- [ ] **Step 7: Add the `surface` prop to the exported component**

Replace the signature at lines 176-186:

```ts
export function SubscribeSaveSection({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
```

with:

```ts
export function SubscribeSaveSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const colors = snsSeriesColors(surface);
```

(the existing first body line, `const [selectedAsin, setSelectedAsin] = useState<string>("ALL");`, follows immediately.)

- [ ] **Step 8: Pass the colors at the render site**

At line 272, replace:

```tsx
            <SnsChart key={String(config.barKey)} config={config} data={rows} />
```

with:

```tsx
            <SnsChart key={String(config.barKey)} config={config} data={rows} colors={colors} />
```

- [ ] **Step 9: Update the hub call site**

In `src/app/reports/subscribe-save/page.tsx`, line 48, replace:

```tsx
          <SubscribeSaveSection accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

with:

```tsx
          <SubscribeSaveSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

- [ ] **Step 10: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors in `subscribe-save-section.tsx` or `app/reports/subscribe-save/page.tsx`. Per the verification baseline, exactly one pre-existing error is expected repo-wide (`rename-1o8m-keys-to-mf.ts:46`); ignore it, and treat anything else as yours.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(reports-v2): make SubscribeSaveSection surface-aware

The current-period series hardcoded hub orange, so the section could not
render on the portal without violating the dual-accent rule. Pull the color
choice into an exported snsSeriesColors(surface) and thread the resolved
pair down to SnsChart, which is where both usages live.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/subscribe-save-section.tsx src/components/reports/v2/subscribe-save-section.test.ts src/app/reports/subscribe-save/page.tsx
```

---

## Task 2: ShareOfVoiceSection — surface prop (two-level thread)

Same shape as Task 1, but the colors must travel two levels: `ShareOfVoiceSection` → `KeywordSeriesCharts` → `ComparisonLineChart`. The middle component renders `ComparisonLineChart` three times and currently passes no colors at all.

**Files:**
- Modify: `src/components/reports/v2/share-of-voice-section.tsx` (imports at :19-20; constants at :74-79; `ComparisonLineChart` at :202-236; `KeywordSeriesCharts` at :238-318; exported signature at :321-331; render sites at :392, :399, :410, :417, :443)
- Modify: `src/app/reports/share-of-voice/page.tsx:27`
- Test: `src/components/reports/v2/share-of-voice-section.test.ts` (create)

**Interfaces:**
- Consumes: `accentFor(surface: SurfaceKind): string`; `type Surface as SurfaceKind`.
- Produces: `sovEntityColors(surface: SurfaceKind): { brand: string; competitor: string }` — exported. `ShareOfVoiceSection` gains a **required** prop `surface: SurfaceKind`. `KeywordSeriesCharts` and `ComparisonLineChart` each gain a required `colors: { brand: string; competitor: string }` prop.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/share-of-voice-section.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sovEntityColors } from "./share-of-voice-section";

describe("sovEntityColors", () => {
  it("uses the hub accent for the brand series on hub", () => {
    expect(sovEntityColors("hub").brand).toBe("#FF751F");
  });

  it("uses the portal accent for the brand series on portal", () => {
    expect(sovEntityColors("portal").brand).toBe("#2A5059");
  });

  it("keeps the competitor blue shared across both surfaces", () => {
    expect(sovEntityColors("hub").competitor).toBe("#006BBB");
    expect(sovEntityColors("portal").competitor).toBe("#006BBB");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(sovEntityColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/v2/share-of-voice-section.test.ts`
Expected: FAIL — `sovEntityColors is not a function`.

- [ ] **Step 3: Add the imports**

In `src/components/reports/v2/share-of-voice-section.tsx`, after line 20 (`import { ChartFrame } from "./primitives/chart-frame";`) add:

```ts
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";
```

- [ ] **Step 4: Replace the hardcoded constants with the exported helper**

Replace lines 74-77, which currently read:

```ts
// Entity colors — brand vs competitor / organic vs sponsored. Validated pair
// (dataviz validator, white surface): #FF751F ↔ #006BBB, CVD ΔE well above target.
const BRAND_COLOR = "#FF751F";
const COMP_COLOR = "#006BBB";
```

with:

```ts
// Entity colors — brand vs competitor / organic vs sponsored. The brand series
// follows the surface accent (dual-accent rule); competitor blue is a shared
// categorical color. The hub pair (hub accent ↔ #006BBB) is validated (dataviz
// validator, white surface, CVD ΔE well above target). The portal pair
// #2A5059 ↔ #006BBB is teal-against-blue and has NOT been re-validated — it is
// on the dogfood checklist (plan Task 17, spec §9).
//
// NB: this comment deliberately says "hub accent" rather than spelling the hub
// hex, because Task 5's guard scans this file's source for that literal.
const COMP_COLOR = "#006BBB";

export function sovEntityColors(surface: SurfaceKind): { brand: string; competitor: string } {
  return { brand: accentFor(surface), competitor: COMP_COLOR };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/v2/share-of-voice-section.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Thread colors into `ComparisonLineChart`**

In the props destructure at lines 202-218, add `colors` after `reversed = false,` and add its type. The signature becomes:

```ts
function ComparisonLineChart({
  title,
  subtitle,
  data,
  brandKey,
  compKey,
  fmt,
  reversed = false,
  colors,
}: {
  title: string;
  subtitle: string;
  data: MergedDay[];
  brandKey: keyof MergedDay;
  compKey: keyof MergedDay;
  fmt: (n: number) => string;
  reversed?: boolean;
  colors: { brand: string; competitor: string };
}) {
```

Then inside it replace the three color references:
- line 223: `legend={[<LegendDot key="b" color={BRAND_COLOR} label="Brand" />, <LegendDot key="c" color={COMP_COLOR} label="Competitors" />]}` → `color={colors.brand}` and `color={colors.competitor}` respectively
- line 230: `stroke={BRAND_COLOR}` → `stroke={colors.brand}`
- line 231: `stroke={COMP_COLOR}` → `stroke={colors.competitor}`

- [ ] **Step 7: Thread colors through `KeywordSeriesCharts`**

In the props destructure at lines 238-250, add `colors` after `refreshKey = 0,` and add its type:

```ts
function KeywordSeriesCharts({
  accountId,
  start,
  end,
  keyword,
  refreshKey = 0,
  colors,
}: {
  accountId: string;
  start: string;
  end: string;
  keyword: string;
  refreshKey?: number;
  colors: { brand: string; competitor: string };
}) {
```

Then add `colors={colors}` to each of the three `ComparisonLineChart` render sites (lines 291-298, 299-306, 307-315). For example the first becomes:

```tsx
      <ComparisonLineChart
        title="Organic share of voice"
        subtitle={`“${keyword}” — brand vs competitors`}
        data={merged}
        brandKey="brandSov"
        compKey="compSov"
        fmt={fmtPct}
        colors={colors}
      />
```

Add the same `colors={colors}` line to the "ASINs in search results" chart and the "Best organic position" chart (the latter keeps its `reversed` prop).

- [ ] **Step 8: Add the `surface` prop to the exported component**

Replace the signature at lines 321-331:

```ts
export function ShareOfVoiceSection({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
```

with:

```ts
export function ShareOfVoiceSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const colors = sovEntityColors(surface);
```

(the existing first body line, `const requestKey = accountId && start && end ? ...`, follows immediately.)

- [ ] **Step 9: Update the four `RankedBars` color props and the `KeywordSeriesCharts` render**

In the returned JSX:
- line 392 (`RankedBars` "Top 10 brands — organic share of voice"): `color={BRAND_COLOR}` → `color={colors.brand}`
- line 399 (`RankedBars` "Top 10 brands — ad share of voice"): `color={COMP_COLOR}` → `color={colors.competitor}`
- line 410 (`RankedBars` "Brand organic share of voice"): `color={BRAND_COLOR}` → `color={colors.brand}`
- line 417 (`RankedBars` "Brand ad share of voice"): `color={COMP_COLOR}` → `color={colors.competitor}`
- line 443, replace:

```tsx
        <KeywordSeriesCharts accountId={accountId} start={start} end={end} keyword={selectedKeyword} refreshKey={refreshKey} />
```

with:

```tsx
        <KeywordSeriesCharts accountId={accountId} start={start} end={end} keyword={selectedKeyword} refreshKey={refreshKey} colors={colors} />
```

- [ ] **Step 10: Update the hub call site**

In `src/app/reports/share-of-voice/page.tsx`, line 27, replace:

```tsx
          <ShareOfVoiceSection accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

with:

```tsx
          <ShareOfVoiceSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

- [ ] **Step 11: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors in `share-of-voice-section.tsx` or `app/reports/share-of-voice/page.tsx`. `BRAND_COLOR` must no longer be referenced anywhere — if tsc reports `Cannot find name 'BRAND_COLOR'`, a render site was missed in Step 9.

- [ ] **Step 12: Commit**

```bash
git commit -m "feat(reports-v2): make ShareOfVoiceSection surface-aware

The brand series hardcoded hub orange at four sites across three scopes.
Pull the choice into an exported sovEntityColors(surface) and thread the
resolved pair two levels down, through KeywordSeriesCharts, which renders
ComparisonLineChart three times and previously passed no colors.

Competitor blue stays shared. The portal brand/competitor pair is
teal-against-blue and is flagged for a dogfood legibility check.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/share-of-voice-section.tsx src/components/reports/v2/share-of-voice-section.test.ts src/app/reports/share-of-voice/page.tsx
```

---

## Task 3: PeriodComparativeSection — surface prop (two orange sources)

This file has **two** independent hub-orange sources, which is why the original spec's read of it was incomplete: a `getSurfacePalette("hub")` literal, and a module-level `PERIODS` array whose current-period entry is `#FF751F`.

**Files:**
- Modify: `src/components/reports/v2/period-comparative-section.tsx` (import at :13; `PERIODS` at :82-99; exported signature at :136-147; `PERIODS` usages at :228, :251, :310, :348)
- Modify: `src/app/reports/period-comparative/page.tsx:28`
- Test: `src/components/reports/v2/period-comparative-section.test.ts` (create)

**Interfaces:**
- Consumes: `accentFor(surface: SurfaceKind): string`; `getSurfacePalette(surface: SurfaceKind): SurfacePalette`; `type Surface as SurfaceKind`.
- Produces: `interface PeriodSpec { key: PeriodKey; suffix: "" | "_pm" | "_py"; label: string; color: string; width: number; dash?: string }` and `periodsFor(surface: SurfaceKind): PeriodSpec[]` — both exported. `PeriodComparativeSection` gains a **required** prop `surface: SurfaceKind`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/period-comparative-section.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { periodsFor } from "./period-comparative-section";

describe("periodsFor", () => {
  it("uses the hub accent for the current period on hub", () => {
    expect(periodsFor("hub").find((p) => p.key === "current")?.color).toBe("#FF751F");
  });

  it("uses the portal accent for the current period on portal", () => {
    expect(periodsFor("portal").find((p) => p.key === "current")?.color).toBe("#2A5059");
  });

  it("emits no hub orange anywhere in the portal trio (dual-accent rule)", () => {
    for (const period of periodsFor("portal")) {
      expect(period.color.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("keeps previous-month blue and previous-year green + dashed on both surfaces", () => {
    for (const surface of ["hub", "portal"] as const) {
      const periods = periodsFor(surface);
      expect(periods.find((p) => p.key === "pm")?.color).toBe("#006BBB");
      const py = periods.find((p) => p.key === "py");
      expect(py?.color).toBe("#05893E");
      expect(py?.dash).toBe("6 4");
    }
  });

  it("returns the three periods in current → pm → py order", () => {
    expect(periodsFor("hub").map((p) => p.key)).toEqual(["current", "pm", "py"]);
  });

  it("keeps the suffixes the daily-row lookup depends on", () => {
    expect(periodsFor("hub").map((p) => p.suffix)).toEqual(["", "_pm", "_py"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/v2/period-comparative-section.test.ts`
Expected: FAIL — `periodsFor is not a function`.

- [ ] **Step 3: Update the palette import and add `accentFor`**

Replace line 13, which currently reads:

```ts
import { getSurfacePalette } from "./primitives/palette";
```

with:

```ts
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { accentFor } from "./primitives/chart-colors";
```

- [ ] **Step 4: Replace the `PERIODS` const with the exported factory**

Replace lines 82-99, which currently read:

```ts
// ── Period entities. Color follows the period, never the metric, so switching
//    metrics never repaints a series. Trio validated with the dataviz palette
//    validator on the white card surface: worst CVD pair ΔE 22.2 (protan),
//    normal-vision 23.3; PY additionally dashed as secondary encoding. ──
type PeriodKey = "current" | "pm" | "py";

const PERIODS: {
  key: PeriodKey;
  suffix: "" | "_pm" | "_py";
  label: string;
  color: string;
  width: number;
  dash?: string;
}[] = [
  { key: "current", suffix: "", label: "Current period", color: "#FF751F", width: 2.25 },
  { key: "pm", suffix: "_pm", label: "Previous month", color: "#006BBB", width: 2 },
  { key: "py", suffix: "_py", label: "Previous year", color: "#05893E", width: 2, dash: "6 4" },
];
```

with:

```ts
// ── Period entities. Color follows the period, never the metric, so switching
//    metrics never repaints a series. The current period takes the surface
//    accent (dual-accent rule); previous month and previous year are shared.
//    The HUB trio was validated with the dataviz palette validator on the white
//    card surface: worst CVD pair ΔE 22.2 (protan), normal-vision 23.3; PY
//    additionally dashed as secondary encoding. The PORTAL trio substitutes
//    #2A5059 for the current period, putting teal next to the #006BBB previous
//    month, and has NOT been re-validated — Manu accepted this on 2026-08-03
//    with a dogfood legibility check instead (plan Task 17, spec §9). ──
type PeriodKey = "current" | "pm" | "py";

export interface PeriodSpec {
  key: PeriodKey;
  suffix: "" | "_pm" | "_py";
  label: string;
  color: string;
  width: number;
  dash?: string;
}

export function periodsFor(surface: SurfaceKind): PeriodSpec[] {
  return [
    { key: "current", suffix: "", label: "Current period", color: accentFor(surface), width: 2.25 },
    { key: "pm", suffix: "_pm", label: "Previous month", color: "#006BBB", width: 2 },
    { key: "py", suffix: "_py", label: "Previous year", color: "#05893E", width: 2, dash: "6 4" },
  ];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/v2/period-comparative-section.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Add the `surface` prop and resolve both sources from it**

Replace lines 136-147:

```ts
export function PeriodComparativeSection({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const palette = getSurfacePalette("hub");
```

with:

```ts
export function PeriodComparativeSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const palette = getSurfacePalette(surface);
  const periods = periodsFor(surface);
```

- [ ] **Step 7: Point the four `PERIODS` usages at the local `periods`**

The module-level `PERIODS` no longer exists, so all four references must change. Each is a plain identifier swap:
- line 228: `{PERIODS.map((p) => {` → `{periods.map((p) => {`
- line 251: `const legend = PERIODS.filter((p) => activePeriods.has(p.key)).map((p) => (` → `const legend = periods.filter(...)`
- line 310: `{PERIODS.map((p) => (` → `{periods.map((p) => (`
- line 348: `{PERIODS.filter((p) => activePeriods.has(p.key)).map((p) => (` → `{periods.filter(...)`

- [ ] **Step 8: Update the hub call site**

In `src/app/reports/period-comparative/page.tsx`, line 28, replace:

```tsx
          <PeriodComparativeSection accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

with:

```tsx
          <PeriodComparativeSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

- [ ] **Step 9: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. If tsc reports `Cannot find name 'PERIODS'`, one of the four usages in Step 7 was missed.

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(reports-v2): make PeriodComparativeSection surface-aware

Two independent hub-orange sources here, not one: a getSurfacePalette(\"hub\")
literal feeding palette.accent and KpiCard's hero fill, and a module-level
PERIODS array whose current-period entry hardcoded #FF751F across four render
sites. Both now resolve from a surface prop via an exported periodsFor().

The portal trio puts teal next to the previous-month blue and is not
re-validated for CVD spacing; Manu accepted that with a dogfood check.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/period-comparative-section.tsx src/components/reports/v2/period-comparative-section.test.ts src/app/reports/period-comparative/page.tsx
```

---

## Task 4: AdvertisingAuditSection + KeywordsGapsV2 — surface prop

Two files, one commit: `KeywordsGapsV2` is rendered only from `AdvertisingAuditSection`, so threading `surface` into the parent without the child would leave orange on the portal and split a single logical change across two reviews.

`AdvertisingAuditSection`'s leak is a hardcoded `text-brand` class in `SectionHeading` — the exact string `primitives/palette.test.ts:28` bans from the portal palette.

**Files:**
- Modify: `src/components/reports/v2/advertising-audit-section.tsx` (`SectionHeading` at :143-145; `SegmentationBlock` at :542-545; exported signature at :659-669; `SegmentationBlock` renders at :734-735; `SectionHeading` + `KeywordsGapsV2` at :738-739)
- Modify: `src/components/reports/v2/keywords-gaps-v2.tsx` (`KeywordsGapsBlock` at :211-212; exported signature at :230-240; renders at :278-279)
- Modify: `src/app/reports/advertising-audit/page.tsx:27`
- Test: `src/components/reports/v2/keywords-gaps-v2.test.ts` (create)

**Interfaces:**
- Consumes: `accentFor(surface: SurfaceKind): string`; `getSurfacePalette(surface: SurfaceKind): SurfacePalette` (for `.eyebrowClass`); `type Surface as SurfaceKind`.
- Produces: `gapsBarColor(surface: SurfaceKind, accentIndex: 0 | 1): string` — exported from `keywords-gaps-v2.tsx`. `KeywordsGapsV2` and `AdvertisingAuditSection` each gain a **required** prop `surface: SurfaceKind`. `SectionHeading` and `SegmentationBlock` each gain a required `eyebrowClass: string` prop. `KeywordsGapsBlock` gains a required `surface: SurfaceKind` prop.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/keywords-gaps-v2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gapsBarColor } from "./keywords-gaps-v2";

describe("gapsBarColor", () => {
  it("uses the hub accent for the first block on hub", () => {
    expect(gapsBarColor("hub", 0)).toBe("#FF751F");
  });

  it("uses the portal accent for the first block on portal", () => {
    expect(gapsBarColor("portal", 0)).toBe("#2A5059");
  });

  it("keeps the second block's blue shared across both surfaces", () => {
    expect(gapsBarColor("hub", 1)).toBe("#006BBB");
    expect(gapsBarColor("portal", 1)).toBe("#006BBB");
  });

  it("emits no hub orange on portal for either block (dual-accent rule)", () => {
    for (const accentIndex of [0, 1] as const) {
      expect(gapsBarColor("portal", accentIndex).toLowerCase()).not.toContain("ff751f");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/v2/keywords-gaps-v2.test.ts`
Expected: FAIL — `gapsBarColor is not a function`.

- [ ] **Step 3: Add imports and the exported helper to `keywords-gaps-v2.tsx`**

After line 10 (`import { Surface } from "./primitives/surface";`) add:

```ts
import { accentFor } from "./primitives/chart-colors";
import { type Surface as SurfaceKind } from "./primitives/palette";

// Sponsored Products takes the surface accent; Sponsored Brands takes the
// shared categorical blue. Recharts fills cannot resolve CSS var().
export function gapsBarColor(surface: SurfaceKind, accentIndex: 0 | 1): string {
  return accentIndex === 0 ? accentFor(surface) : "#006BBB";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/v2/keywords-gaps-v2.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Thread `surface` through `KeywordsGapsBlock`**

Replace lines 211-212:

```ts
function KeywordsGapsBlock({ title, data, accentIndex }: { title: string; data: GapsData; accentIndex: 0 | 1 }) {
  const barColor = accentIndex === 0 ? "#FF751F" : "#006BBB";
```

with:

```ts
function KeywordsGapsBlock({
  title,
  data,
  accentIndex,
  surface,
}: {
  title: string;
  data: GapsData;
  accentIndex: 0 | 1;
  surface: SurfaceKind;
}) {
  const barColor = gapsBarColor(surface, accentIndex);
```

- [ ] **Step 6: Add `surface` to `KeywordsGapsV2` and pass it down**

Replace lines 230-240:

```ts
export function KeywordsGapsV2({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
```

with:

```ts
export function KeywordsGapsV2({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
```

Then replace lines 278-279:

```tsx
      <KeywordsGapsBlock title="Sponsored Products — keywords gaps" data={data.sp} accentIndex={0} />
      <KeywordsGapsBlock title="Sponsored Brands — keywords gaps" data={data.sb} accentIndex={1} />
```

with:

```tsx
      <KeywordsGapsBlock title="Sponsored Products — keywords gaps" data={data.sp} accentIndex={0} surface={surface} />
      <KeywordsGapsBlock title="Sponsored Brands — keywords gaps" data={data.sb} accentIndex={1} surface={surface} />
```

- [ ] **Step 7: Add the palette import to `advertising-audit-section.tsx`**

After line 24 (`import { ChartFrame } from "./primitives/chart-frame";`) add:

```ts
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
```

- [ ] **Step 8: Make `SectionHeading` take its eyebrow class as a prop**

Replace lines 143-145:

```tsx
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 mb-3.5 text-[18px] font-bold tracking-tight text-brand">{children}</h2>;
}
```

with:

```tsx
// eyebrowClass comes from getSurfacePalette(surface).eyebrowClass — the hub brand
// class on hub, "text-portal-accent" on portal. primitives/palette.test.ts bans
// the hub brand class from the portal palette, so it must never be inlined here.
//
// NB: this comment deliberately does not spell that class name, because Task 5's
// guard scans this file's source for that literal.
function SectionHeading({ eyebrowClass, children }: { eyebrowClass: string; children: React.ReactNode }) {
  return <h2 className={`m-0 mb-3.5 text-[18px] font-bold tracking-tight ${eyebrowClass}`}>{children}</h2>;
}
```

- [ ] **Step 9: Thread `eyebrowClass` through `SegmentationBlock`**

Replace line 542:

```tsx
function SegmentationBlock({ title, brandRows, matchRows }: { title: string; brandRows: SegRow[]; matchRows: SegRow[] }) {
```

with:

```tsx
function SegmentationBlock({
  title,
  brandRows,
  matchRows,
  eyebrowClass,
}: {
  title: string;
  brandRows: SegRow[];
  matchRows: SegRow[];
  eyebrowClass: string;
}) {
```

and line 545:

```tsx
      <SectionHeading>{title}</SectionHeading>
```

with:

```tsx
      <SectionHeading eyebrowClass={eyebrowClass}>{title}</SectionHeading>
```

- [ ] **Step 10: Add `surface` to `AdvertisingAuditSection`**

Replace lines 659-669:

```ts
export function AdvertisingAuditSection({
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
```

with:

```ts
export function AdvertisingAuditSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const { eyebrowClass } = getSurfacePalette(surface);
```

- [ ] **Step 11: Pass the resolved values at the three render sites**

Replace lines 734-735:

```tsx
      <SegmentationBlock title="Sponsored Products — segmentation" brandRows={data.spBrandType} matchRows={data.spMatchType} />
      <SegmentationBlock title="Sponsored Brands — segmentation" brandRows={data.sbBrandType} matchRows={data.sbMatchType} />
```

with:

```tsx
      <SegmentationBlock title="Sponsored Products — segmentation" brandRows={data.spBrandType} matchRows={data.spMatchType} eyebrowClass={eyebrowClass} />
      <SegmentationBlock title="Sponsored Brands — segmentation" brandRows={data.sbBrandType} matchRows={data.sbMatchType} eyebrowClass={eyebrowClass} />
```

and lines 738-739:

```tsx
        <SectionHeading>Keywords gaps</SectionHeading>
        <KeywordsGapsV2 accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

with:

```tsx
        <SectionHeading eyebrowClass={eyebrowClass}>Keywords gaps</SectionHeading>
        <KeywordsGapsV2 surface={surface} accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

- [ ] **Step 12: Update the hub call site**

In `src/app/reports/advertising-audit/page.tsx`, line 27, replace:

```tsx
          <AdvertisingAuditSection accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

with:

```tsx
          <AdvertisingAuditSection surface="hub" accountId={accountId} start={start} end={end} refreshKey={refreshKey} />
```

- [ ] **Step 13: Run the full v2 test suite and typecheck**

Run: `node_modules/.bin/vitest run src/components/reports/v2`
Expected: PASS — all v2 tests, including the four new colour test files and the pre-existing `primitives/*.test.ts`.

Then run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. `SLOT_COLORS` at :131 is deliberately untouched — it stays `#FF751F` on both surfaces per Manu's locked decision.

- [ ] **Step 14: Commit**

```bash
git commit -m "feat(reports-v2): make AdvertisingAuditSection and KeywordsGapsV2 surface-aware

SectionHeading inlined the text-brand class, which primitives/palette.test.ts
explicitly bans from the portal palette; it now takes palette.eyebrowClass.
KeywordsGapsV2, which only AdvertisingAuditSection renders, hardcoded #FF751F
for its Sponsored Products bars; that moves behind an exported gapsBarColor().

SLOT_COLORS is deliberately unchanged — it is a shared categorical data
palette, not a brand accent (spec section 9 decision).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/advertising-audit-section.tsx src/components/reports/v2/keywords-gaps-v2.tsx src/components/reports/v2/keywords-gaps-v2.test.ts src/app/reports/advertising-audit/page.tsx
```

---

## Task 5: Hub-orange regression guard

A source-level invariant test that locks Tasks 1-4 in. Unlike those tasks, this test is written *after* the code it guards — its job is to stop reintroduction, and the red-green cycle in Steps 2-4 verifies it actually detects a leak rather than passing vacuously.

Rendering these sections in jsdom cannot substitute for this: `ResponsiveContainer` reports zero width in jsdom, so Recharts renders no `<path>` or `<line>` elements at all, and a colour assertion against the DOM would pass regardless of what the code does.

**Why the `text-brand` check needs no allowlist.** The guard scans raw source, so a *comment* mentioning the banned token trips it just as an inlined class would. Tasks 2 and 4 originally wrote comments that spelled out the hub hex and the hub class respectively, and both were reworded specifically so this guard can stay absolute — see the `NB:` lines in those two tasks. Keep it that way: if a future comment needs to name either token, reword the comment rather than weakening the guard. The orange check *does* carry a three-file allowlist, but only for real code (the two locked categorical arrays and one correct surface ternary), never for prose.

**Files:**
- Test: `src/components/reports/v2/no-hub-orange.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime — it reads source files from disk. Vitest's cwd is the repo root (`src/test/setup.ts` already relies on that for `.env.local`).
- Produces: nothing importable.

- [ ] **Step 1: Write the guard test**

Create `src/components/reports/v2/no-hub-orange.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const V2_DIR = join(process.cwd(), "src/components/reports/v2");

// Files allowed to contain the hub-orange literal, with the reason. Locked by
// Manu on 2026-08-03 (spec §9): the two 4-slot arrays are SHARED categorical
// data palettes, not brand-emphasis accents, and recolouring slot 0 on portal
// would put dark teal beside the slot-1 blue and break their validated CVD
// spacing. headline-performance-section picks its accent with an inline surface
// ternary, which is the correct pattern, not a leak.
const ALLOW_HUB_ORANGE = new Set([
  "advertising-audit-section.tsx",     // SLOT_COLORS slot 0 — shared categorical
  "inventory-section.tsx",            // STACK slot 0 — shared categorical
  "headline-performance-section.tsx", // strokeFor()'s surface ternary
]);

function sectionFiles(): string[] {
  return readdirSync(V2_DIR).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
}

describe("v2 section components and the dual-accent rule", () => {
  it("scans a plausible number of section components", () => {
    // Guards against the glob silently matching nothing after a refactor.
    expect(sectionFiles().length).toBeGreaterThan(10);
  });

  it.each(sectionFiles().filter((f) => !ALLOW_HUB_ORANGE.has(f)))(
    "%s contains no hardcoded hub orange",
    (file) => {
      const src = readFileSync(join(V2_DIR, file), "utf8");
      expect(src.toLowerCase()).not.toContain("ff751f");
    },
  );

  it.each(sectionFiles())("%s never inlines a bare text-brand class", (file) => {
    const src = readFileSync(join(V2_DIR, file), "utf8");
    expect(src).not.toContain("text-brand");
  });
});
```

- [ ] **Step 2: Run it to confirm it passes against the fixed code**

Run: `node_modules/.bin/vitest run src/components/reports/v2/no-hub-orange.test.ts`
Expected: PASS. Every file is scanned; the three allowlisted files are skipped by the orange check only.

- [ ] **Step 3: Verify the guard actually detects a leak (temporary regression)**

In `src/components/reports/v2/subscribe-save-section.tsx`, temporarily change the `PY_COLOR` line to:

```ts
const PY_COLOR = "#FF751F";
```

Run: `node_modules/.bin/vitest run src/components/reports/v2/no-hub-orange.test.ts`
Expected: FAIL — `subscribe-save-section.tsx contains no hardcoded hub orange`. If it passes, the test is vacuous and must be fixed before proceeding.

- [ ] **Step 4: Revert the temporary regression and re-confirm green**

Restore the line to `const PY_COLOR = "#05893E";`:

```bash
git checkout -- src/components/reports/v2/subscribe-save-section.tsx
```

Run: `node_modules/.bin/vitest run src/components/reports/v2/no-hub-orange.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the working tree holds only the new test**

Run: `git status --short`
Expected: exactly one line — `?? src/components/reports/v2/no-hub-orange.test.ts`. If `subscribe-save-section.tsx` still shows as modified, Step 4's revert did not take.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(reports-v2): guard against reintroducing hub orange in section components

Source-level invariant across every v2 section: no hardcoded #FF751F and no
inlined text-brand class, with a three-file allowlist carrying the reason for
each exception. Rendering these sections in jsdom cannot cover this —
ResponsiveContainer reports zero width there, so Recharts emits no elements
and a DOM colour assertion would pass no matter what the source says.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/no-hub-orange.test.ts
```

---

## Task 6: InventoryDateBadge — surface prop

The portal inventory page reuses this badge as the controls bar's `extras`, exactly as the hub page does. It currently hardcodes hub orange plus a dark `#3C4043` pill background and white text — all three of which are wrong on the portal's light ghost canvas, where white text on a light background is invisible.

**Files:**
- Modify: `src/components/reports/inventory-date-badge.tsx` (whole render block at :26-32; signature at :11)
- Modify: `src/app/reports/inventory/page.tsx:23`
- Test: `src/components/reports/inventory-date-badge.test.ts` (create)

**Interfaces:**
- Consumes: `accentFor(surface: SurfaceKind): string` from `@/components/reports/v2/primitives/chart-colors`; `type Surface as SurfaceKind` from `@/components/reports/v2/primitives/palette`.
- Produces: `inventoryBadgeColors(surface: SurfaceKind): { accent: string; background: string; text: string }` — exported. `InventoryDateBadge` gains a **required** prop `surface: SurfaceKind`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/inventory-date-badge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { inventoryBadgeColors } from "./inventory-date-badge";

describe("inventoryBadgeColors", () => {
  it("uses the hub accent and the dark pill on hub", () => {
    const c = inventoryBadgeColors("hub");
    expect(c.accent).toBe("#FF751F");
    expect(c.background).toBe("#3C4043");
  });

  it("uses the portal accent on portal", () => {
    expect(inventoryBadgeColors("portal").accent).toBe("#2A5059");
  });

  it("emits no hub orange anywhere on portal (dual-accent rule)", () => {
    for (const value of Object.values(inventoryBadgeColors("portal"))) {
      expect(value.toLowerCase()).not.toContain("ff751f");
    }
  });

  it("pairs light text with the dark hub pill and dark text with the light portal pill", () => {
    // The portal renders on the light ghost canvas, so the hub's white-on-dark
    // pairing would make the date unreadable there.
    expect(inventoryBadgeColors("hub").text).toBe("#FEFEFE");
    expect(inventoryBadgeColors("portal").text).toBe("#242222");
    expect(inventoryBadgeColors("portal").background).toBe("#FEFEFE");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/inventory-date-badge.test.ts`
Expected: FAIL — `inventoryBadgeColors is not a function`.

- [ ] **Step 3: Add imports and the exported helper**

In `src/components/reports/inventory-date-badge.tsx`, after line 5 (`import { useEffect, useState } from "react";`) add:

```ts
import { accentFor } from "./v2/primitives/chart-colors";
import { type Surface as SurfaceKind } from "./v2/primitives/palette";

// Concrete hex, not CSS var() or Tailwind arbitrary values, so the pairing is
// unit-testable and the whole badge flips together. The portal renders on the
// light ghost canvas, so it needs a light pill with dark text; the hub keeps its
// dark pill with light text.
export function inventoryBadgeColors(surface: SurfaceKind): {
  accent: string;
  background: string;
  text: string;
} {
  return surface === "portal"
    ? { accent: accentFor("portal"), background: "#FEFEFE", text: "#242222" }
    : { accent: accentFor("hub"), background: "#3C4043", text: "#FEFEFE" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/inventory-date-badge.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add the `surface` prop and apply the colors**

Replace line 11:

```tsx
export function InventoryDateBadge({ accountId, refreshKey = 0 }: { accountId: string; refreshKey?: number }) {
```

with:

```tsx
export function InventoryDateBadge({
  surface,
  accountId,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  refreshKey?: number;
}) {
```

Then replace the returned JSX at lines 26-32:

```tsx
    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md border border-[#FF751F] bg-[#3C4043]">
      <span className="text-[10px] font-semibold text-[#FF751F] uppercase tracking-wide whitespace-nowrap">
        Inventory Date Max
      </span>
      <span className="text-xs font-bold text-white tabular-nums whitespace-nowrap">{maxDate}</span>
    </div>
```

with:

```tsx
    <div
      className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md border"
      style={{ borderColor: colors.accent, background: colors.background }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ color: colors.accent }}
      >
        Inventory Date Max
      </span>
      <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: colors.text }}>
        {maxDate}
      </span>
    </div>
```

and add the `colors` binding immediately after the existing `if (!maxDate) return null;` guard (line 23):

```tsx
  const colors = inventoryBadgeColors(surface);
```

- [ ] **Step 6: Update the hub call site**

In `src/app/reports/inventory/page.tsx`, line 23, replace:

```tsx
          extras={<InventoryDateBadge accountId={accountId} />}
```

with:

```tsx
          extras={<InventoryDateBadge surface="hub" accountId={accountId} />}
```

- [ ] **Step 7: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(reports): make InventoryDateBadge surface-aware

The portal inventory page reuses this badge as the controls bar's extras, but
it hardcoded hub orange plus a dark pill with white text — unreadable on the
portal's light ghost canvas. All three values now flip together behind an
exported inventoryBadgeColors(surface).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/inventory-date-badge.tsx src/components/reports/inventory-date-badge.test.ts src/app/reports/inventory/page.tsx
```

---

## Task 7: ReportControls type split + ReportsControlsBar portal props

This is the blocker the original spec missed (§9 correction 3). `ReportsControlsBar` types its prop `controls: ReportControls` and unconditionally destructures `clients`, `clientsLoading`, `selectedClient`, `setSelectedClient` and `bumpRefresh` — none of which the portal controls object has. Splitting a shared base out first is what lets one bar serve both surfaces with **zero** changes at the six hub call sites.

**Files:**
- Modify: `src/components/reports/v2/use-report-controls.ts` (`previousWeek` at :9-17; `ReportControls` at :26-46)
- Modify: `src/components/reports/v2/reports-controls-bar.tsx` (imports at :2-6; signature at :11-29; destructure at :31-35; heading at :41-45; select block at :48-65; refresh at :111-117)

**Interfaces:**
- Produces:
  - `export function previousWeek(now: Date): { year: number; week: number }` — newly exported from `use-report-controls.ts` so the portal hook reuses the year-boundary guards instead of copying them.
  - `export interface ReportRangeControls` — `mode`, `setMode`, `customStart`, `setCustomStart`, `customEnd`, `setCustomEnd`, `year`, `setYear`, `week`, `setWeek`, `accountId`, `start`, `end`.
  - `export interface ReportControls extends ReportRangeControls` — adds `clients`, `clientsLoading`, `selectedClient`, `setSelectedClient`, `refreshKey`, `bumpRefresh`. Its full shape is unchanged, so nothing that consumes `ReportControls` today needs edits.
  - `export type ControlsBarControls = ReportRangeControls & Partial<Omit<ReportControls, keyof ReportRangeControls>>` — the bar's widened prop type.
  - `ReportsControlsBar` gains four optional props: `showClientSelect?: boolean` (default `true`), `showRefreshButton?: boolean` (default `true`), `clientLabel?: string`, `backHref?: string`.

- [ ] **Step 1: Export `previousWeek`**

In `src/components/reports/v2/use-report-controls.ts`, line 9, replace:

```ts
function previousWeek(now: Date): { year: number; week: number } {
```

with:

```ts
export function previousWeek(now: Date): { year: number; week: number } {
```

- [ ] **Step 2: Split the interface**

Replace lines 26-46, which currently read:

```ts
export interface ReportControls {
  clients: ReportClient[];
  clientsLoading: boolean;
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  mode: RangeMode;
  setMode: (m: RangeMode) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  year: number;
  setYear: (y: number) => void;
  week: number;
  setWeek: (w: number) => void;
  accountId: string;
  start: string;
  end: string;
  refreshKey: number;
  bumpRefresh: () => void;
}
```

with:

```ts
/** The half of the report controls both surfaces share: the date range plus the
 *  resolved Intentwise account. The portal has no client *list* and no manual
 *  refresh, so PortalReportControls implements only this base — which is what
 *  lets ReportsControlsBar serve both surfaces. */
export interface ReportRangeControls {
  mode: RangeMode;
  setMode: (m: RangeMode) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  year: number;
  setYear: (y: number) => void;
  week: number;
  setWeek: (w: number) => void;
  accountId: string;
  start: string;
  end: string;
}

/** Hub-only additions: the free client-select and the manual Redshift refresh. */
export interface ReportControls extends ReportRangeControls {
  clients: ReportClient[];
  clientsLoading: boolean;
  selectedClient: string;
  setSelectedClient: (name: string) => void;
  refreshKey: number;
  bumpRefresh: () => void;
}
```

- [ ] **Step 3: Typecheck to confirm the split is transparent**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. `ReportControls` still has exactly the same members, so `useReportControlsState()`'s return and all existing consumers keep typechecking untouched. If anything errors here, the split changed the shape and must be corrected before continuing.

- [ ] **Step 4: Widen the bar's prop type and add the four props**

In `src/components/reports/v2/reports-controls-bar.tsx`, replace the imports at lines 2-6:

```ts
import type { ReactNode } from "react";
import { getSurfacePalette, type Surface } from "./primitives/palette";
import { DatePicker } from "@/components/ui/date-picker";
import { RefreshButton } from "@/components/reports/refresh-button";
import type { ReportControls } from "./use-report-controls";
```

with:

```ts
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSurfacePalette, type Surface } from "./primitives/palette";
import { DatePicker } from "@/components/ui/date-picker";
import { RefreshButton } from "@/components/reports/refresh-button";
import type { ReportControls, ReportRangeControls } from "./use-report-controls";

/** The bar needs the shared range fields; the client-select and refresh fields
 *  are optional because the portal omits both. Hub still passes a full
 *  ReportControls, which satisfies this structurally with no call-site change. */
export type ControlsBarControls = ReportRangeControls &
  Partial<Omit<ReportControls, keyof ReportRangeControls>>;
```

- [ ] **Step 5: Add the props to the signature**

Replace lines 11-29:

```ts
export function ReportsControlsBar({
  surface,
  controls,
  sectionLabel = "Performance Overview",
  refreshSection = "overview",
  showDates = true,
  refreshRange,
  extras,
}: {
  surface: Surface;
  controls: ReportControls;
  sectionLabel?: string;
  refreshSection?: string;
  showDates?: boolean;
  /** Overrides the range sent to RefreshButton (e.g. a year range when the
      date pickers are hidden). */
  refreshRange?: { start: string; end: string };
  extras?: ReactNode;
}) {
```

with:

```ts
export function ReportsControlsBar({
  surface,
  controls,
  sectionLabel = "Performance Overview",
  refreshSection = "overview",
  showDates = true,
  showClientSelect = true,
  showRefreshButton = true,
  clientLabel,
  backHref,
  refreshRange,
  extras,
}: {
  surface: Surface;
  controls: ControlsBarControls;
  sectionLabel?: string;
  refreshSection?: string;
  showDates?: boolean;
  /** false on portal: the client is resolved from the session, not selectable. */
  showClientSelect?: boolean;
  /** false on portal: forcing a Redshift re-query is a hub/internal action. */
  showRefreshButton?: boolean;
  /** Portal only — static client identification replacing the select, e.g.
      "Acme Co · AC01". */
  clientLabel?: string;
  /** Portal only — renders a "← Back to reports" link before the heading. */
  backHref?: string;
  /** Overrides the range sent to RefreshButton (e.g. a year range when the
      date pickers are hidden). */
  refreshRange?: { start: string; end: string };
  extras?: ReactNode;
}) {
```

- [ ] **Step 6: Default the now-optional destructured fields**

Replace lines 31-35:

```ts
  const palette = getSurfacePalette(surface);
  const {
    clients, clientsLoading, selectedClient, setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, accountId, start, end, bumpRefresh,
  } = controls;
```

with:

```ts
  const palette = getSurfacePalette(surface);
  const {
    clients = [], clientsLoading = false, selectedClient = "", setSelectedClient,
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, accountId, start, end, bumpRefresh,
  } = controls;
```

- [ ] **Step 7: Add the back link and the client label to the heading**

Replace lines 41-45:

```tsx
      <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
        <span className="font-bold text-sidebar-foreground">Client</span>
        <span className="font-normal" style={{ color: palette.accent }}>Reports</span>
      </h1>
      <span className="text-xs text-muted-foreground/70 truncate">{sectionLabel}</span>
```

with:

```tsx
      {backHref && (
        <Link
          href={backHref}
          className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground shrink-0"
        >
          <ArrowLeft className="size-3.5" />
          Back to reports
        </Link>
      )}
      <div className="flex flex-col min-w-0 shrink-0">
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
          <span className="font-bold text-sidebar-foreground">Client</span>
          <span className="font-normal" style={{ color: palette.accent }}>Reports</span>
        </h1>
        {clientLabel && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{clientLabel}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground/70 truncate">{sectionLabel}</span>
```

- [ ] **Step 8: Gate the client select and its divider**

Replace lines 48-65:

```tsx
        {/* Client select — 3 states: loading / empty / populated */}
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          disabled={clientsLoading || clients.length === 0}
          className={fieldCls}
        >
          {clientsLoading && <option>Loading clients…</option>}
          {!clientsLoading && clients.length === 0 && <option>No clients available</option>}
          {!clientsLoading &&
            clients.map((c) => (
              <option key={c.clientIdCode} value={c.clientName}>
                {c.clientName}
              </option>
            ))}
        </select>

        <div className="h-4 w-px bg-border/40" />
```

with:

```tsx
        {/* Client select — 3 states: loading / empty / populated. Hidden on
            portal, where the client is resolved from the session. The
            `setSelectedClient &&` guard is load-bearing as well as a type
            narrowing: a controls object without it can never render the
            select, so the portal cannot grow one by accident. */}
        {showClientSelect && setSelectedClient && (<>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient?.(e.target.value)}
          disabled={clientsLoading || clients.length === 0}
          className={fieldCls}
        >
          {clientsLoading && <option>Loading clients…</option>}
          {!clientsLoading && clients.length === 0 && <option>No clients available</option>}
          {!clientsLoading &&
            clients.map((c) => (
              <option key={c.clientIdCode} value={c.clientName}>
                {c.clientName}
              </option>
            ))}
        </select>

        <div className="h-4 w-px bg-border/40" />
        </>)}
```

- [ ] **Step 9: Gate the refresh button**

Replace lines 111-117:

```tsx
        <RefreshButton
          section={refreshSection}
          accountId={accountId}
          start={refreshRange ? refreshRange.start : showDates ? start : ""}
          end={refreshRange ? refreshRange.end : showDates ? end : ""}
          onRefreshed={bumpRefresh}
        />
```

with:

```tsx
        {/* Hub/internal only. The `bumpRefresh &&` guard is load-bearing as well
            as a type narrowing: a controls object without it can never render
            the button, so the portal cannot grow one by accident. */}
        {showRefreshButton && bumpRefresh && (
          <RefreshButton
            section={refreshSection}
            accountId={accountId}
            start={refreshRange ? refreshRange.start : showDates ? start : ""}
            end={refreshRange ? refreshRange.end : showDates ? end : ""}
            onRefreshed={bumpRefresh}
          />
        )}
```

- [ ] **Step 10: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. All six hub call sites (`overview`, `advertising-audit`, `inventory`, `period-comparative`, `subscribe-save`, `share-of-voice`) pass a full `ReportControls` and none of them set the four new props, so they keep today's behavior with no edits.

- [ ] **Step 11: Run the whole test suite**

Run: `node_modules/.bin/vitest run src/components/reports src/lib/report-date-range src/lib/permissions`
Expected: PASS — 10 files / 126 tests. No test currently renders `ReportsControlsBar`, so this is a regression check on the surrounding scopes rather than direct coverage of the change; the bar is covered by the dogfood pass in Task 17. (Scoped rather than full-suite because the full run carries 21 pre-existing failures — see the verification baseline.)

- [ ] **Step 12: Commit**

```bash
git commit -m "feat(reports-v2): let ReportsControlsBar serve the portal surface

Split a ReportRangeControls base (date range + accountId) out of
ReportControls, and widen the bar's controls prop to that base plus the
client-select and refresh fields as optional. ReportControls keeps exactly its
old shape, so all six hub call sites are untouched.

Adds showClientSelect, showRefreshButton, clientLabel and backHref, all
defaulting to today's hub behavior. Also exports previousWeek so the portal
hook reuses the year-boundary guards rather than copying them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/use-report-controls.ts src/components/reports/v2/reports-controls-bar.tsx
```

---

## Task 8: Portal section-access helpers

The one piece of genuinely branching logic in this whole change, isolated so it can be tested without mocking `next-auth/react` or `next/navigation` — no test in this repo mocks either today, and this change is not the place to introduce that.

It encodes §9 correction 4: the index card grid and a section page ask **different** questions, and collapsing them into one would silently destroy the admin's view of what a client actually has.

**Files:**
- Create: `src/components/reports/v2/portal-report-access.ts`
- Test: `src/components/reports/v2/portal-report-access.test.ts`

**Interfaces:**
- Consumes: `canAccess(section: string, allowedSections: string[], isAdmin: boolean): boolean` from `@/lib/permissions`.
- Produces:
  - `export interface SectionAccess { canAccessSection: (sectionId: string) => boolean; clientHasSection: (sectionId: string) => boolean }`
  - `export function makeSectionAccess(opts: { isAdminPreview: boolean; isProspect: boolean; allowedSections: string[] }): SectionAccess`
  - Both take a bare section id (`"overview"`, `"share-of-voice"`) and prefix `reports-` internally, matching the `reports-*` ids in `CONFIGURABLE_SECTIONS` (`permissions.ts:144-149`).

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/portal-report-access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeSectionAccess } from "./portal-report-access";

const GRANTED = ["reports-overview", "reports-inventory"];

describe("makeSectionAccess — a real client session", () => {
  const access = makeSectionAccess({
    isAdminPreview: false,
    isProspect: false,
    allowedSections: GRANTED,
  });

  it("allows a granted section", () => {
    expect(access.canAccessSection("overview")).toBe(true);
    expect(access.clientHasSection("overview")).toBe(true);
  });

  it("blocks an ungranted section", () => {
    expect(access.canAccessSection("share-of-voice")).toBe(false);
    expect(access.clientHasSection("share-of-voice")).toBe(false);
  });

  it("prefixes the bare section id with reports-", () => {
    // "inventory" alone is a different permission from "reports-inventory";
    // only the prefixed form may grant a report section.
    const onlyBare = makeSectionAccess({
      isAdminPreview: false,
      isProspect: false,
      allowedSections: ["inventory"],
    });
    expect(onlyBare.clientHasSection("inventory")).toBe(false);
  });
});

describe("makeSectionAccess — a prospect", () => {
  const access = makeSectionAccess({
    isAdminPreview: false,
    isProspect: true,
    allowedSections: [],
  });

  it("sees every section despite holding no grants (demo behavior)", () => {
    expect(access.canAccessSection("share-of-voice")).toBe(true);
    expect(access.clientHasSection("share-of-voice")).toBe(true);
  });
});

describe("makeSectionAccess — an admin previewing a client", () => {
  const access = makeSectionAccess({
    isAdminPreview: true,
    isProspect: false,
    allowedSections: GRANTED,
  });

  it("may open any section, granted or not", () => {
    expect(access.canAccessSection("overview")).toBe(true);
    expect(access.canAccessSection("share-of-voice")).toBe(true);
  });

  it("still reports the client's real grants, so the card grid can show them", () => {
    // This is the distinction that matters: collapsing these two into one
    // would make every card read as enabled during preview and destroy the
    // admin's view of what the client actually has (spec §9 correction 4).
    expect(access.clientHasSection("overview")).toBe(true);
    expect(access.clientHasSection("share-of-voice")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run src/components/reports/v2/portal-report-access.test.ts`
Expected: FAIL — cannot resolve `./portal-report-access`.

- [ ] **Step 3: Write the implementation**

Create `src/components/reports/v2/portal-report-access.ts`:

```ts
import { canAccess } from "@/lib/permissions";

export interface SectionAccess {
  /** May the CURRENT VIEWER open this section's page? Admin preview bypasses,
   *  so an admin can inspect any section of the client they are previewing.
   *  This is the per-page gate. */
  canAccessSection: (sectionId: string) => boolean;
  /** Does the CLIENT hold this grant? Ignores the admin-preview bypass, so the
   *  index card grid can keep rendering ungranted cards at 40% opacity labelled
   *  "Hidden from client" with the eye toggle. */
  clientHasSection: (sectionId: string) => boolean;
}

/** Two deliberately different questions. See SectionAccess above — conflating
 *  them is a regression, not a simplification (spec §9 correction 4).
 *
 *  Section ids arrive bare ("overview", "share-of-voice") and are prefixed here
 *  to match the reports-* ids in permissions.ts CONFIGURABLE_SECTIONS. */
export function makeSectionAccess({
  isAdminPreview,
  isProspect,
  allowedSections,
}: {
  isAdminPreview: boolean;
  isProspect: boolean;
  allowedSections: string[];
}): SectionAccess {
  const clientHasSection = (sectionId: string): boolean =>
    isProspect || canAccess(`reports-${sectionId}`, allowedSections, false);

  return {
    clientHasSection,
    canAccessSection: (sectionId: string): boolean =>
      isAdminPreview || clientHasSection(sectionId),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run src/components/reports/v2/portal-report-access.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(reports-v2): add portal section-access helpers

Isolates the one piece of branching permission logic the portal reports need,
so it is unit-testable without mocking next-auth or next/navigation (no test
in this repo mocks either today).

Exposes two deliberately distinct questions: canAccessSection (the per-page
gate, which admin preview bypasses) and clientHasSection (the client's real
grant, which the index card grid needs to keep showing 'Hidden from client').
Collapsing them would be a regression — see spec section 9 correction 4.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/portal-report-access.ts src/components/reports/v2/portal-report-access.test.ts
```

---

## Task 9: usePortalReportControls hook + provider

The portal twin of `use-report-controls.ts`. Note what it deliberately does **not** do: it does not re-derive which client to load. `/api/portal/me/client` already resolves session-vs-admin-preview server-side (`route.ts:13-19`), and duplicating that rule client-side would create two places to get it wrong.

It fetches `/api/clients` through `react-query` under the key `["portal-clients"]` — matching what `portal/reports2/page.tsx:104-113` does today — because the index page's eye-toggle mutation invalidates exactly that key to refresh after a toggle. A plain `fetch` here would silently break that refresh.

**Files:**
- Create: `src/components/reports/v2/use-portal-report-controls.ts`

**Interfaces:**
- Consumes: `ReportRangeControls` and `previousWeek` from `./use-report-controls` (Task 7); `makeSectionAccess` from `./portal-report-access` (Task 8); `formatDate`, `getFirstDayOfCurrentMonth`, `resolveRange`, `type RangeMode` from `@/lib/report-date-range`.
- Produces:
  - `export interface PortalReportControls extends ReportRangeControls` — adds `clientIdCode: string`, `clientName: string`, `clientStatus: string | null`, `allowedSections: string[]`, `isAdminPreview: boolean`, `isProspect: boolean`, `canAccessSection: (id: string) => boolean`, `clientHasSection: (id: string) => boolean`, `clientParam: string`, `backHref: string`, `loading: boolean`, `notFound: boolean`.
  - `export function PortalReportControlsProvider({ children }: { children: ReactNode }): ReactElement`
  - `export function usePortalReportControls(): PortalReportControls` — throws if the provider is missing.

- [ ] **Step 1: Write the hook**

Create `src/components/reports/v2/use-portal-report-controls.ts`:

```ts
"use client";
/* eslint-disable react-doctor/no-fetch-in-effect */
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatDate, getFirstDayOfCurrentMonth, resolveRange, type RangeMode } from "@/lib/report-date-range";
import { previousWeek, type ReportRangeControls } from "./use-report-controls";
import { makeSectionAccess } from "./portal-report-access";

interface PortalClientRow {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  rawData?: Record<string, string>;
}

type ClientLite = { clientIdCode: string; allowedSections: string[] };

export interface PortalReportControls extends ReportRangeControls {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  allowedSections: string[];
  isAdminPreview: boolean;
  isProspect: boolean;
  canAccessSection: (sectionId: string) => boolean;
  clientHasSection: (sectionId: string) => boolean;
  /** "?client=<code>" built from the RESOLVED client, always set once loaded.
   *  Used for the index card links, matching today's behavior. */
  clientParam: string;
  /** The index URL, carrying the preview param only when the current URL had
   *  one — so a real client's back link stays a clean /portal/reports, exactly
   *  as it is today. Deliberately not derived from clientParam. */
  backHref: string;
  loading: boolean;
  notFound: boolean;
}

function usePortalReportControlsState(): PortalReportControls {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("client") ?? "";
  const isAdmin = session?.user?.role === "admin";
  const isAdminPreview = Boolean(isAdmin && previewParam);
  const isProspect = session?.user?.clientStatus === "Prospect";

  const [row, setRow] = useState<PortalClientRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<RangeMode>("week");
  const [customStart, setCustomStart] = useState(() => getFirstDayOfCurrentMonth(new Date()));
  const [customEnd, setCustomEnd] = useState(() => formatDate(new Date()));
  const [year, setYear] = useState(() => previousWeek(new Date()).year);
  const [week, setWeek] = useState(() => previousWeek(new Date()).week);

  // Resolve the client row. The route applies the admin-preview ?client=
  // override server-side and ignores it for non-admins, so one call serves both
  // cases and the rule lives in exactly one place.
  useEffect(() => {
    setLoading(true);
    const url = previewParam
      ? `/api/portal/me/client?client=${encodeURIComponent(previewParam)}`
      : "/api/portal/me/client";

    let ignore = false;
    fetch(url)
      .then(async (r) => {
        if (ignore) return;
        if (!r.ok) {
          setRow(null);
          setLoading(false);
          return;
        }
        setRow((await r.json()) as PortalClientRow);
        setLoading(false);
      })
      .catch(() => {
        if (ignore) return;
        setRow(null);
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [previewParam]);

  // Admin preview needs the PREVIEWED client's own grants, which
  // /api/portal/me/client does not return (spec §9 correction 6). Keyed
  // "portal-clients" because the index page's eye-toggle mutation invalidates
  // that key to refresh after a toggle.
  const { data: previewedClient } = useQuery<ClientLite[], Error, ClientLite | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === previewParam),
  });

  const allowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? [])
    : (session?.user?.allowedSections ?? []);

  const access = makeSectionAccess({ isAdminPreview, isProspect, allowedSections });

  const { start, end } = useMemo(
    () => resolveRange(mode, { customStart, customEnd, year, week }),
    [mode, customStart, customEnd, year, week],
  );

  const clientIdCode = row?.clientIdCode ?? "";

  return {
    clientIdCode,
    clientName: row?.clientName ?? "",
    clientStatus: row?.clientStatus ?? null,
    allowedSections,
    isAdminPreview,
    isProspect,
    ...access,
    clientParam: clientIdCode ? `?client=${encodeURIComponent(clientIdCode)}` : "",
    backHref: `/portal/reports${previewParam ? `?client=${encodeURIComponent(previewParam)}` : ""}`,
    loading,
    notFound: !loading && row === null,
    accountId: row?.rawData?.IntentwiseID?.trim() ?? "",
    mode, setMode, customStart, setCustomStart, customEnd, setCustomEnd,
    year, setYear, week, setWeek, start, end,
  };
}

/* State lives in a provider mounted by src/app/portal/reports/layout.tsx, above
   the page segment, so the client's date selection survives switching between
   report pages within one visit — matching hub behavior. */
const PortalReportControlsContext = createContext<PortalReportControls | null>(null);

export function PortalReportControlsProvider({ children }: { children: ReactNode }) {
  return createElement(PortalReportControlsContext.Provider, { value: usePortalReportControlsState() }, children);
}

export function usePortalReportControls(): PortalReportControls {
  const ctx = useContext(PortalReportControlsContext);
  if (!ctx) {
    throw new Error(
      "usePortalReportControls requires PortalReportControlsProvider (mounted by src/app/portal/reports/layout.tsx)",
    );
  }
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. In particular `PortalReportControls` must satisfy `ReportRangeControls`, which is what makes it assignable to the bar's `ControlsBarControls` in Tasks 13-16.

- [ ] **Step 3: Confirm the assignability that the page tasks depend on**

Add this temporary file, `src/components/reports/v2/__assignability-check.ts`:

```ts
import type { ControlsBarControls } from "./reports-controls-bar";
import type { PortalReportControls } from "./use-portal-report-controls";

// Compile-time only: proves a portal controls object can be passed to
// ReportsControlsBar. If this errors, Tasks 13-16 cannot compile.
export const _check = (c: PortalReportControls): ControlsBarControls => c;
```

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

Then delete the file — it exists only to fail loudly here rather than six tasks later:

```bash
git clean -f src/components/reports/v2/__assignability-check.ts
```

Run: `git status --short`
Expected: the check file is gone; only `use-portal-report-controls.ts` remains untracked.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(reports-v2): add usePortalReportControls hook and provider

The portal twin of use-report-controls: same date-range shape (reusing the
hub's previousWeek guards and the shared resolveRange), but the account comes
from the session-resolved client instead of a free select.

Deliberately does not re-derive which client to load — /api/portal/me/client
already applies the admin-preview ?client= override server-side, so that rule
stays in one place. Fetches /api/clients via react-query under the
'portal-clients' key because the index page's eye-toggle mutation invalidates
exactly that key; a plain fetch would break the post-toggle refresh.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/use-portal-report-controls.ts
```

---

## Task 10: Shared portal report states

Three states and one banner, currently copy-pasted across six portal pages with three different sets of wording and colors. Consolidating them first means Tasks 13-16 are genuinely thin.

The colors come from `DESIGN.md` line 107's Error/Red badge row (light + dark pairing), not the index page's old dark-only string (`portal/reports/page.tsx`, since renamed from `reports2/` by Task 11) nor the section pages' (`text-red-200` on `border-red-500`). Manu ruled DESIGN.md governs over the plan's original choice, which had picked the dark row's values with no `dark:` pairing at all — a fixed appearance in both themes, on a portal that is moving to a light ghost canvas.

**Files:**
- Create: `src/components/reports/v2/portal-report-state.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function PortalReportState({ kind }: { kind: "loading" | "not-found" | "unavailable" }): ReactElement`
  - `export function MissingAccountIdBanner(): ReactElement`

- [ ] **Step 1: Write the component**

Create `src/components/reports/v2/portal-report-state.tsx`:

```tsx
"use client";

// The three whole-page states a portal report can be in before it has data to
// show. Each REPLACES the report body.
const COPY = {
  loading: "Loading report…",
  "not-found": "No client linked to your session.",
  unavailable:
    "This report isn't available for your account — reach out to your account manager for access.",
} as const;

export function PortalReportState({ kind }: { kind: keyof typeof COPY }) {
  return (
    <div className="p-8 text-muted-foreground" role={kind === "loading" ? "status" : undefined}>
      {COPY[kind]}
    </div>
  );
}

// Renders ABOVE the report body rather than replacing it — the report still has
// something to show, it just cannot resolve an Intentwise account. That is why
// this is a separate component and not a fourth PortalReportState kind.
//
// Colors are DESIGN.md's Error/Red badge row (light + dark pairing), not a copy
// of the index page's old dark-only string. The light row is what makes this
// correct on the portal's light ghost canvas; the dark row keeps it correct in
// dark mode too.
export function MissingAccountIdBanner() {
  return (
    <div className="mx-auto w-[min(calc(100%-32px),1760px)] pt-3">
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
        Missing IntentwiseID for this client.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(reports-v2): add shared portal report states

Consolidates the loading / no-client / not-available states and the missing
IntentwiseID banner, each currently copy-pasted across six portal report pages
with inconsistent wording and colors.

The banner is a separate export rather than a fourth state kind because it
renders above the report body instead of replacing it. Colors follow the index
page's variant, since the portal is moving to the light ghost canvas where the
old section pages' light-red-on-dark would wash out.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/components/reports/v2/portal-report-state.tsx
```

---

## Task 11: Delete the iframe page, rename reports2 → reports, fix every reference

Atomic by necessity: the deletion frees the URL, the rename claims it, and the seven reference updates keep the app navigable. Splitting any of them out leaves the portal with a dead nav link or two routes colliding on the same path.

After this task the portal reports work at the **new** URL with the **old** hand-rolled pages still in place. That is a deliberate, verifiable green checkpoint — Tasks 12-16 then replace those pages one at a time.

**Files:**
- Delete: `src/app/portal/reports/page.tsx` (the 146-line Power BI iframe), `src/app/api/portal/embed-url/route.ts`
- Rename: `src/app/portal/reports2/` → `src/app/portal/reports/` (8 page files)
- Modify: `src/app/portal/page.tsx:115`, `:140`; `src/components/layout/portal-shell.tsx:116`; `src/components/portal/admin-preview-toggle.tsx:34`; `src/app/portal/reports/business-model-audit/page.tsx:30`; `src/lib/permissions.ts:190`; `src/lib/portal-audits.ts:6`; `src/app/api/portal/audit/route.ts:8`
- Also modify (rename fallout inside the moved pages): the `reportsHref` template in each of `overview/page.tsx:146`, `advertising-audit/page.tsx:125`, `share-of-voice/page.tsx:125`, `inventory/page.tsx:80`, `period-comparative/page.tsx:129`, `subscribe-save/page.tsx:70`, and the two card links in `page.tsx:222`, `:268`

**Interfaces:**
- Consumes / Produces: no type surface. This is a routing change.

- [ ] **Step 1: Confirm the embed-url route has no caller but the page being deleted**

Run: `grep -rn "embed-url" src/`
Expected: exactly two hits, both in `src/app/portal/reports/page.tsx` (:82 query key, :87 fetch) plus the route's own file. If any other caller appears, stop — the deletion is not safe and the spec's §4 claim needs revisiting.

- [ ] **Step 2: Delete the iframe page and its route**

```bash
git rm src/app/portal/reports/page.tsx src/app/api/portal/embed-url/route.ts
```

Note: `aac.powerbiEmbedUrl` (the DB column) and `src/lib/sync-tables.ts:130` (which populates it) are **not** touched — the column has a producer outside the portal and dropping it would be a schema change, which is out of scope.

- [ ] **Step 3: Rename the route folder**

```bash
git mv src/app/portal/reports2 src/app/portal/reports
```

Run: `ls -1 src/app/portal/reports/`
Expected: `advertising-audit`, `business-model-audit`, `inventory`, `overview`, `page.tsx`, `period-comparative`, `share-of-voice`, `subscribe-save`.

- [ ] **Step 4: Repoint every `/portal/reports2` string**

There are 14 occurrences across 10 files. Replace `"/portal/reports2"` with `"/portal/reports"` and `` `/portal/reports2` `` with `` `/portal/reports` `` in each:

| File | Line | Context |
|---|---|---|
| `src/app/portal/page.tsx` | 115 | `href: "/portal/reports2",` in `SECTION_CARDS` |
| `src/app/portal/page.tsx` | 140 | `reports: "/portal/reports2",` in `PROSPECT_SHOWCASE_HREF` |
| `src/components/layout/portal-shell.tsx` | 116 | nav entry `href: "/portal/reports2"` |
| `src/app/portal/reports/page.tsx` | 222 | business-model-audit card `href` |
| `src/app/portal/reports/page.tsx` | 268 | report card `href` |
| `src/app/portal/reports/business-model-audit/page.tsx` | 30 | "Back to Reports" link |
| `src/app/portal/reports/overview/page.tsx` | 146 | `reportsHref` template |
| `src/app/portal/reports/advertising-audit/page.tsx` | 125 | `reportsHref` template |
| `src/app/portal/reports/share-of-voice/page.tsx` | 125 | `reportsHref` template |
| `src/app/portal/reports/inventory/page.tsx` | 80 | `reportsHref` template |
| `src/app/portal/reports/period-comparative/page.tsx` | 129 | `reportsHref` template |
| `src/app/portal/reports/subscribe-save/page.tsx` | 70 | `reportsHref` template |
| `src/lib/permissions.ts` | 190 | comment only |
| `src/lib/portal-audits.ts` | 6 | comment only |
| `src/app/api/portal/audit/route.ts` | 8 | comment only |

`portal-shell.tsx:77` (`if (pathname.startsWith("/portal/reports")) return "Reports";`) already matches either path and needs **no** change.

- [ ] **Step 5: Drop the now-dead `reports2` permission mapping**

In `src/components/portal/admin-preview-toggle.tsx`, delete line 34:

```ts
  reports2: "reports",
```

Line 33 (`reports: "reports",`) already covers the new path, so the admin-preview banner's toggle keeps working.

- [ ] **Step 6: Verify no reference survives**

Run: `grep -rn "reports2" src/`
Expected: no output at all.

- [ ] **Step 7: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. Next.js will not report a route collision because the old `portal/reports/page.tsx` was removed in Step 2 before the rename in Step 3.

- [ ] **Step 8: Run the test suite**

Run: `node_modules/.bin/vitest run src/components/reports src/lib/report-date-range src/lib/permissions`
Expected: PASS — 10 files / 126 tests. Then run the full `node_modules/.bin/vitest run` once and confirm the failure count is still **21 files / 41 tests** — the pre-existing baseline. A route rename can break a test that references a path, so this is the one task where checking the full count matters; a count above 41 means this task broke something.

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(portal): retire the Power BI iframe page, rename reports2 to reports

Deletes the orphaned /portal/reports iframe page and /api/portal/embed-url,
its only caller (verified by grep), then moves the linked, nav-reachable
reports2 tree onto the freed URL and repoints all 14 references.

The aac.powerbi_embed_url column and its sync in lib/sync-tables.ts are
untouched — the column has a producer outside the portal and dropping it
would be a schema change.

Portal reports now work at the new URL with the existing hand-rolled pages
still in place; the thin-shell rewrites follow one page at a time.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports src/app/portal/reports2 src/app/api/portal/embed-url src/app/portal/page.tsx src/components/layout/portal-shell.tsx src/components/portal/admin-preview-toggle.tsx src/lib/permissions.ts src/lib/portal-audits.ts src/app/api/portal/audit/route.ts
```

Both `src/app/portal/reports` (the new path) and `src/app/portal/reports2` (the old path) must appear in the pathspec. `git mv` in Step 3 stages a delete+add pair; committing with only the new path stages and commits the add side, leaving the old files still present in HEAD's tree while the working directory looks perfectly clean. This was proven empirically on this branch — `git show HEAD:src/app/portal/reports2/page.tsx` still succeeded after a commit with only the new path in its pathspec, meaning a fresh checkout would have resurrected 8 dead files and put two routes on one URL. The fix was a second commit for the delete side alone. The durable lesson: a clean working tree is NOT proof a rename committed correctly — verify with `git show HEAD:<old path>`.

---

## Task 12: Portal reports layout + index page dedup

The layout mounts the provider; the index becomes its first consumer. Both in one commit because the index cannot compile without the provider above it.

The `Suspense` boundary in the layout is required, not decorative: the provider calls `useSearchParams()`, and Next.js needs a boundary above any client component that does. Every current portal report page wraps itself in `<Suspense>` for exactly this reason — hoisting it to the layout is what lets the six pages drop theirs.

**Files:**
- Create: `src/app/portal/reports/layout.tsx`
- Modify: `src/app/portal/reports/page.tsx` (imports at :3-25; component body at :87-193; default export at :301-307)

**Interfaces:**
- Consumes: `PortalReportControlsProvider`, `usePortalReportControls` (Task 9); `PortalReportState` (Task 10).
- Produces: the mounted context every page in Tasks 13-16 depends on.

- [ ] **Step 1: Create the layout**

Create `src/app/portal/reports/layout.tsx`:

```tsx
import { Suspense, type ReactNode } from "react";
import { PortalReportControlsProvider } from "@/components/reports/v2/use-portal-report-controls";

// Holds the resolved client + date range above the page segment so the client's
// date selection persists when switching between report pages, matching hub
// behavior (src/app/reports/layout.tsx).
//
// The Suspense boundary is required: the provider calls useSearchParams(), which
// Next.js will not allow without one. Hoisting it here is what lets the six
// section pages drop their own <Suspense> wrappers.
export default function PortalReportsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <PortalReportControlsProvider>{children}</PortalReportControlsProvider>
    </Suspense>
  );
}
```

- [ ] **Step 2: Rewrite the index page's imports**

In `src/app/portal/reports/page.tsx`, replace lines 3-6:

```tsx
import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

with:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
```

and replace lines 22-25:

```tsx
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { canAccess } from "@/lib/permissions";
import { CLIENT_NAMES } from "@/lib/constants";
import { PORTAL_AUDITS } from "@/lib/portal-audits";
```

with:

```tsx
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { PortalReportState } from "@/components/reports/v2/portal-report-state";
import { CLIENT_NAMES } from "@/lib/constants";
import { PORTAL_AUDITS } from "@/lib/portal-audits";
```

- [ ] **Step 3: Delete the two now-unused local types**

Delete lines 27-32:

```tsx
interface PortalClient {
  clientIdCode: string;
  clientName: string;
  clientStatus: string | null;
  rawData?: Record<string, string>;
}
```

and delete line 85:

```tsx
type ClientLite = { clientIdCode: string; allowedSections: string[] };
```

**Leave `REPORT_CARDS` (lines 34-83) exactly as it is** — the card ids, labels, descriptions, icons and colors are all unchanged.

- [ ] **Step 4: Replace the state-and-resolution block with the hook**

Replace lines 87-117 — from `function PortalReports2Content() {` through the `effectiveAllowedSections` assignment — which currently read:

```tsx
function PortalReports2Content() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const clientCode = searchParams.get("client") ?? "";
  const isAdmin = session?.user?.role === "admin";
  // Prospect-labelled clients see all report cards (demo). Detail pages pull live
  // data and are not yet wired for demo — known dead links for now.
  const isProspect = session?.user?.clientStatus === "Prospect";
  const isAdminPreview = !!(isAdmin && clientCode);
  const previewClientName = clientCode
    ? CLIENT_NAMES[clientCode] || clientCode
    : "";

  const [client, setClient] = useState<PortalClient | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: previewedClient } = useQuery<ClientLite[], Error, ClientLite | undefined>({
    queryKey: ["portal-clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: isAdminPreview,
    select: (data) => data.find((c) => c.clientIdCode === clientCode),
  });

  const effectiveAllowedSections = isAdminPreview
    ? (previewedClient?.allowedSections ?? [])
    : (session?.user?.allowedSections ?? []);
```

with:

```tsx
export default function PortalReportsPage() {
  const controls = usePortalReportControls();
  const qc = useQueryClient();
  const { clientIdCode, clientName, isAdminPreview } = controls;
  const previewClientName = isAdminPreview
    ? CLIENT_NAMES[clientIdCode] || clientName
    : "";
```

Note: the session, the search param, the `/api/portal/me/client` fetch and the `["portal-clients"]` query all moved into the hook. The query key is unchanged, so the toggle's invalidation below still refreshes it.

- [ ] **Step 5: Point the toggle mutation at the hook's values**

Inside the `toggleSection` mutation (was lines 120-143), make three replacements:
- `if (!clientCode) throw new Error("No preview client");` → `if (!clientIdCode) throw new Error("No preview client");`
- `const current = previewedClient?.allowedSections ?? [];` → `const current = controls.allowedSections;`
- `` const res = await fetch(`/api/clients/${clientCode}/sections`, { `` → `` const res = await fetch(`/api/clients/${clientIdCode}/sections`, { ``

Leave the `onSuccess` / `onError` handlers untouched — `qc.invalidateQueries({ queryKey: ["portal-clients"] })` is exactly what the hook's query listens on.

- [ ] **Step 6: Delete the local fetch effect and replace the two guard returns**

Delete the whole `useEffect` block (was lines 145-167) that fetched `/api/portal/me/client`.

Then replace the two guard returns (was lines 169-181):

```tsx
  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading reports...</div>;
  }

  if (!client) {
    return (
      <div className="p-8 text-muted-foreground">
        {clientCode
          ? `Client not found or not active: ${clientCode}`
          : "No client linked to your session."}
      </div>
    );
  }
```

with:

```tsx
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
```

- [ ] **Step 7: Repoint the derived values**

Replace lines 183-193:

```tsx
  const accountId = client.rawData?.IntentwiseID?.trim() ?? "";
  const clientParam = `?client=${encodeURIComponent(client.clientIdCode)}`;
  const audit = PORTAL_AUDITS[client.clientIdCode];
  // The IntentwiseID warning only matters when a live (IntentwiseID-backed)
  // report card is actually visible. Prospects have no granted sections, so
  // none are — suppress the noise for them.
  const anyReportEnabled =
    isAdminPreview ||
    REPORT_CARDS.some((card) =>
      canAccess(`reports-${card.id}`, effectiveAllowedSections, false),
    );
```

with:

```tsx
  const { accountId, clientParam, isProspect } = controls;
  const audit = PORTAL_AUDITS[clientIdCode];
  // The IntentwiseID warning only matters when a live (IntentwiseID-backed)
  // report card is actually visible. Prospects have no granted sections, so
  // none are — suppress the noise for them.
  //
  // clientHasSection folds in the isProspect bypass, which the old inline
  // canAccess() call did not. That changes nothing here: the banner is already
  // gated on `&& !isProspect` below, so a prospect suppresses it either way.
  const anyReportEnabled =
    isAdminPreview || REPORT_CARDS.some((card) => controls.clientHasSection(card.id));
```

- [ ] **Step 8: Repoint the JSX references**

In the returned JSX, replace:
- line 208 (inside `PageMetaSlot`): `{client.clientName} &middot; {client.clientIdCode}` → `{clientName} &middot; {clientIdCode}`
- line 241: `const enabled = isProspect || canAccess(permissionId, effectiveAllowedSections, false);` → `const enabled = controls.clientHasSection(card.id);`
- line 214 (the index page's own inline IntentwiseID banner, pre-existing code Task 10 copied from): replace the class string `rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500` with `rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400`. This is Manu's DESIGN.md:107 ruling applied to the index page's own banner, keeping it consistent with `MissingAccountIdBanner`. Colour-only — the `{!accountId && anyReportEnabled && !isProspect && (` condition wrapping it must NOT be touched.

Leave line 240 (`const permissionId = \`reports-${card.id}\`;`) in place — `toggleSection.mutate(permissionId)` at line 283 still needs the prefixed id.

Leave lines 242 (`if (!isAdminPreview && !enabled) return null;`), 277 (`{isAdminPreview && (`) and every card class, label and eye-toggle attribute **exactly** as they are. This is the behavior §9 correction 4 protects: during admin preview an ungranted card still renders, at 40% opacity, as a `<div>` rather than a `<Link>`, labelled "Hidden from client".

- [ ] **Step 9: Delete the Suspense wrapper export**

Delete lines 301-307:

```tsx
export default function PortalReports2Page() {
  return (
    <Suspense>
      <PortalReports2Content />
    </Suspense>
  );
}
```

The component renamed in Step 4 is now the default export directly, and the layout provides the boundary.

- [ ] **Step 10: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. If tsc reports `'canAccess' is declared but its value is never read` or similar for `useState`/`useEffect`/`useSession`/`useSearchParams`/`Suspense`, an import from Step 2 was not removed.

- [ ] **Step 11: Commit**

```bash
git commit -m "refactor(portal): mount report controls in a layout, dedup the index page

Adds src/app/portal/reports/layout.tsx mounting PortalReportControlsProvider
under a Suspense boundary — required because the provider reads
useSearchParams, and hoisting it lets the section pages drop their own.

The index page drops its local client state, its /api/portal/me/client effect
and its duplicate portal-clients query in favour of the hook, and switches its
per-card boolean to controls.clientHasSection. It deliberately does NOT use
canAccessSection: that would make every card read as enabled during admin
preview and destroy the admin's view of the client's real grants.

No visible behavior change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports/layout.tsx src/app/portal/reports/page.tsx
```

---

## Task 13: Portal overview page

The first thin-shell rewrite: 321 lines down to ~30. Establishes the shape the next three tasks repeat. It also deletes the local `formatDate` / `getWeekNumber` / `getSundayOfWeek` / `getMaxWeek` copies at lines 40-74, which duplicate `@/lib/report-date-range`.

**Files:**
- Modify (full rewrite): `src/app/portal/reports/overview/page.tsx`

**Interfaces:**
- Consumes: `usePortalReportControls` (Task 9); `PortalReportState`, `MissingAccountIdBanner` (Task 10); `ReportsControlsBar` with its four new props (Task 7); `PerformanceOverviewV2`, which already accepts `surface`.
- Produces: nothing importable.

- [ ] **Step 1: Replace the file's entire contents**

Overwrite `src/app/portal/reports/overview/page.tsx` with:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";

// Portal twin of /reports/overview — same v2 section, scoped to the client's own
// account. No client select and no Refresh button (hub/internal only).
export default function PortalOverviewPage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("overview")) return <PortalReportState kind="unavailable" />;

  const { accountId, start, end, clientName, clientIdCode, backHref } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Overview"
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <PerformanceOverviewV2 surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. This is the first real proof that `PortalReportControls` satisfies the bar's `ControlsBarControls` at a call site.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(portal): rewrite the overview report as a v2 thin shell

321 lines to 30. Renders the same PerformanceOverviewV2 the hub uses, with
surface=\"portal\", and drops the local formatDate/getWeekNumber/
getSundayOfWeek/getMaxWeek copies of @/lib/report-date-range along with the
pre-v2 KPI card set and the hardcoded dark canvas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports/overview/page.tsx
```

---

## Task 14: Portal advertising-audit, share-of-voice and period-comparative pages

Three pages, one commit: they are structurally identical (full-width canvas, h1 + blurb, one section component, standard date controls) and differ only in five values each. A reviewer would accept or reject all three together.

Each mirrors its hub counterpart's heading copy verbatim so the two surfaces do not drift.

**Files:**
- Modify (full rewrite): `src/app/portal/reports/advertising-audit/page.tsx`, `src/app/portal/reports/share-of-voice/page.tsx`, `src/app/portal/reports/period-comparative/page.tsx`

**Interfaces:**
- Consumes: `usePortalReportControls`; `PortalReportState`, `MissingAccountIdBanner`; `ReportsControlsBar`; `AdvertisingAuditSection`, `ShareOfVoiceSection`, `PeriodComparativeSection` — all three of which gained their required `surface` prop in Tasks 2, 3 and 4.
- Produces: nothing importable.

- [ ] **Step 1: Overwrite the advertising-audit page**

Overwrite `src/app/portal/reports/advertising-audit/page.tsx` with:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { AdvertisingAuditSection } from "@/components/reports/v2/advertising-audit-section";

// Portal twin of /reports/advertising-audit.
export default function PortalAdvertisingAuditPage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("advertising-audit")) return <PortalReportState kind="unavailable" />;

  const { accountId, start, end, clientName, clientIdCode, backHref } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Advertising Audit"
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Advertising audit</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps.</p>
          </div>
          <AdvertisingAuditSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Overwrite the share-of-voice page**

Overwrite `src/app/portal/reports/share-of-voice/page.tsx` with:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { ShareOfVoiceSection } from "@/components/reports/v2/share-of-voice-section";

// Portal twin of /reports/share-of-voice.
export default function PortalShareOfVoicePage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("share-of-voice")) return <PortalReportState kind="unavailable" />;

  const { accountId, start, end, clientName, clientIdCode, backHref } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Share of Voice"
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Share of voice</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Brand visibility in search results — top brands, keyword coverage, and brand-vs-competitor trends per keyword.</p>
          </div>
          <ShareOfVoiceSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Overwrite the period-comparative page**

Overwrite `src/app/portal/reports/period-comparative/page.tsx` with:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { PeriodComparativeSection } from "@/components/reports/v2/period-comparative-section";

// Portal twin of /reports/period-comparative.
export default function PortalPeriodComparativePage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("period-comparative")) return <PortalReportState kind="unavailable" />;

  const { accountId, start, end, clientName, clientIdCode, backHref } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Period Comparative"
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Period comparative</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Current period against previous month and previous year — trend, comparison cards, and daily detail.</p>
          </div>
          <PeriodComparativeSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors. All three section components now require `surface`, so a missed prop fails here rather than silently rendering orange on the portal.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(portal): rewrite three report pages as v2 thin shells

advertising-audit, share-of-voice and period-comparative — 267, 267 and 274
lines down to ~35 each, rendering the same v2 sections the hub uses with
surface=\"portal\". Heading copy mirrors each hub counterpart verbatim so the
two surfaces do not drift.

Replaces three copies of the client fetch, the date-picker state and the
pre-v2 component sets.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports/advertising-audit/page.tsx src/app/portal/reports/share-of-voice/page.tsx src/app/portal/reports/period-comparative/page.tsx
```

---

## Task 15: Portal inventory page

Inventory is snapshot-based, so it keeps the hub's `showDates={false}` plus the `InventoryDateBadge` in `extras` — now passed `surface="portal"` (Task 6) so its pill flips to the light variant.

**Files:**
- Modify (full rewrite): `src/app/portal/reports/inventory/page.tsx`

**Interfaces:**
- Consumes: `usePortalReportControls`; `PortalReportState`, `MissingAccountIdBanner`; `ReportsControlsBar`; `InventorySection` (unchanged — its only orange is the approved `STACK` slot 0, so it takes no `surface` prop); `InventoryDateBadge` with its new `surface` prop.
- Produces: nothing importable.

- [ ] **Step 1: Overwrite the file**

Overwrite `src/app/portal/reports/inventory/page.tsx` with:

```tsx
"use client";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { InventorySection } from "@/components/reports/v2/inventory-section";
import { InventoryDateBadge } from "@/components/reports/inventory-date-badge";

// Portal twin of /reports/inventory. Inventory is snapshot-based, so the
// date-range controls are hidden and the badge shows the snapshot date instead.
export default function PortalInventoryPage() {
  const controls = usePortalReportControls();
  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("inventory")) return <PortalReportState kind="unavailable" />;

  const { accountId, clientName, clientIdCode, backHref } = controls;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Inventory"
          showDates={false}
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
          extras={<InventoryDateBadge surface="portal" accountId={accountId} />}
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Inventory</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Stock levels, availability and inventory health per ASIN — status tables and FBA breakdowns.</p>
          </div>
          <InventorySection accountId={accountId} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(portal): rewrite the inventory report as a v2 thin shell

140 lines to ~40. Keeps the snapshot-date badge in the controls bar's extras
like the hub page does, now with surface=\"portal\" so the pill uses the light
variant instead of the hub's dark-with-white-text one. Drops the page's own
/api/reports/inventory maxDate fetch, which the badge already does.

InventorySection needs no surface prop — its only orange is the approved
shared STACK slot 0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports/inventory/page.tsx
```

---

## Task 16: Portal subscribe-save page

S&S is a full-year view, so like the hub it swaps the week/custom controls for a single year selector held in local page state. Two deliberate differences from the hub page: the select's focus ring uses `portal-accent`, and there is no `refreshRange` because there is no Refresh button to feed.

This page also adopts the hub's year default (`currentYear - 1`) in place of the portal's current `currentYear` — see §9 correction 7.

**Files:**
- Modify (full rewrite): `src/app/portal/reports/subscribe-save/page.tsx`

**Interfaces:**
- Consumes: `usePortalReportControls`; `PortalReportState`, `MissingAccountIdBanner`; `ReportsControlsBar`; `SubscribeSaveSection` with its required `surface` prop (Task 1).
- Produces: nothing importable.

- [ ] **Step 1: Overwrite the file**

Overwrite `src/app/portal/reports/subscribe-save/page.tsx` with:

```tsx
"use client";
import { useState } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { PortalReportState, MissingAccountIdBanner } from "@/components/reports/v2/portal-report-state";
import { SubscribeSaveSection } from "@/components/reports/v2/subscribe-save-section";

// Portal twin of /reports/subscribe-save. S&S is a full-year view, so the
// week/custom date controls are replaced by a single year selector. Defaults to
// the last complete year, matching the hub page.
export default function PortalSubscribeSavePage() {
  const controls = usePortalReportControls();
  const [year, setYear] = useState(() => new Date().getFullYear() - 1);

  if (controls.loading) return <PortalReportState kind="loading" />;
  if (controls.notFound) return <PortalReportState kind="not-found" />;
  if (!controls.canAccessSection("subscribe-save")) return <PortalReportState kind="unavailable" />;

  const { accountId, clientName, clientIdCode, backHref } = controls;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="portal"
          controls={controls}
          sectionLabel="Subscribe & Save"
          showDates={false}
          showClientSelect={false}
          showRefreshButton={false}
          clientLabel={`${clientName} · ${clientIdCode}`}
          backHref={backHref}
          extras={
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-portal-accent"
            >
              {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          }
        />
      </PageMetaSlot>
      {!accountId && <MissingAccountIdBanner />}
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Subscribe &amp; Save</h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">Weekly subscription performance across the selected year — subscriptions, sales, units and penetration vs previous year.</p>
          </div>
          <SubscribeSaveSection surface="portal" accountId={accountId} start={start} end={end} refreshKey={0} />
        </main>
      </div>
    </div>
  );
}
```

Note the hook order: `useState` runs before the three early returns, so it is never conditionally called.

- [ ] **Step 2: Typecheck and run the full suite**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `node_modules/.bin/vitest run src/components/reports src/lib/report-date-range src/lib/permissions`
Expected: PASS, including all six new test files from Tasks 1-8. Then confirm the full `node_modules/.bin/vitest run` still shows the 21-file / 41-test pre-existing baseline and nothing more.

- [ ] **Step 3: Confirm no `reports2` or stale import survives anywhere**

```bash
grep -rn "reports2" src/ ; grep -rn "total-sales-card\|organic-sales-card\|acos-card" src/app/portal/
```
Expected: no output from either. The second command catches a portal page still importing a pre-v2 KPI card.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(portal): rewrite the subscribe-save report as a v2 thin shell

136 lines to ~55. Keeps the year selector in the controls bar's extras like the
hub page, with a portal-accent focus ring and no refreshRange since there is no
Refresh button to feed. Adopts the hub's last-complete-year default in place of
the portal's current-year one.

This completes the six portal report pages.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" -- src/app/portal/reports/subscribe-save/page.tsx
```

---

## Task 17: Final verification and dogfood

No code changes. This is the gate before the branch is offered for merge, and the only place the portal is checked with real eyes — several risks in this plan are visual and cannot be caught by `tsc` or `vitest`.

**Files:** none modified.

- [ ] **Step 1: Full test suite**

Run: `node_modules/.bin/vitest run`
Expected: **exactly the 21-file / 41-test pre-existing baseline and no more** (see `.superpowers/sdd/2026-08-03-portal-reports-wiring/verification-baseline.md` for the file list). Any additional failure is this branch's and blocks.

Then run the scoped gate: `node_modules/.bin/vitest run src/components/reports src/lib/report-date-range src/lib/permissions` — must be 100%, and should now be well above the 126-test starting count given the six test files added by Tasks 1-8.

- [ ] **Step 2: Full typecheck**

Run in background: `node_modules/.bin/tsc --noEmit`
Expected: **exactly one error** — the pre-existing `rename-1o8m-keys-to-mf.ts:46` TS2349. Anything else blocks.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. The v2 sections carry `/* eslint-disable react-doctor/... */` headers that must survive the edits — if a rule now fires, a disable comment was lost.

- [ ] **Step 4: Review the whole diff**

Run: `git diff main...HEAD --stat` then `git diff main...HEAD`
Confirm: no `.env` file, no `graphify-out/*`, no `.claude/*`, no `.superpowers/*`, no `redshift-client-exports/*`, and no change to `src/lib/db/schema.ts` or `drizzle/`.

- [ ] **Step 5: Start the dev server**

Run: `PORT=3000 npm run dev`
Note: run it from the worktree. `.env.local` is gitignored and may be missing here — if the server fails with `MissingSecret`, see memory `mfhub-env-local-recovery` (copy from another worktree, URL-encode the `DATABASE_URL` password).

- [ ] **Step 6: Dogfood as an admin previewing a client**

Visit `/portal/reports?client=<a client code with an IntentwiseID>` and confirm:
- The card grid renders; ungranted cards still appear at 40% opacity labelled "Hidden from client", not as links, with the eye toggle on hover. **This is the §9 correction 4 regression check — if every card looks enabled, `canAccessSection` was wired where `clientHasSection` belongs.**
- Toggling a card's eye icon updates it and shows the "Section visibility updated" toast. **This verifies the hook's `["portal-clients"]` query key still matches the mutation's invalidation.**
- Opening a section the client does **not** have loads the report (admin bypass), rather than the "not available" message.
- The date range picked on one section persists when navigating to another.
- No Refresh button appears on any of the six pages.
- "← Back to reports" returns to the card grid with `?client=` preserved.

- [ ] **Step 7: Dogfood as a real client-role user**

Log in as a client user (see memory `dogfood-auth-chrome-profiles` — the cookie import only reads Chrome's Default profile, so use `browse connect` and log in once in the headed window). Confirm:
- No client-select control anywhere; the client's own name · code shows under the "Client Reports" heading.
- Only granted sections appear on the index.
- Navigating **directly** to an ungranted section URL shows "This report isn't available for your account — reach out to your account manager for access." and **not** the report. This is the whole point of the per-page gate; today it loads the report anyway.
- Data shown is the client's own.

- [ ] **Step 8: Check the two accepted color risks with real eyes**

These were accepted on 2026-08-03 rather than pre-emptively fixed, so this step is where they get judged:
- **Period comparative, portal:** with all three periods enabled, can you distinguish the current-period line (`#2A5059` teal) from previous-month (`#006BBB` blue)? They differ only in hue and stroke width (2.25 vs 2). If not, the fallback is a portal-only dash pattern on previous-month — see spec §9.
- **Share of voice, portal:** same question for the brand line (`#2A5059`) against the competitor line (`#006BBB`) in the three per-keyword charts, and for the organic-vs-ad ranked bars.

- [ ] **Step 9: Confirm no orange on the portal**

On each of the six portal pages, confirm the only orange visible is inside the two approved categorical charts — the advertising-audit campaign donuts (`SLOT_COLORS` slot 0) and the inventory stacked bars (`STACK` slot 0). Everything else — headings, active toggles, KPI hero fills, emphasis lines, the inventory date badge — must be charcoal.

Known and deliberately deferred: `focus:border-brand` on `<select>`/`<input>` controls inside five sections still flashes orange **while focused**. That is logged in spec §9, not a Task 17 failure.

- [ ] **Step 10: Report results and hand off**

Summarise for Manu: test count, tsc/lint status, what was checked in Steps 6-9, and any Step 8 legibility verdict. Do **not** merge, push or deploy — per the standing rule those need explicit per-action approval. If everything passes, offer `superpowers:finishing-a-development-branch`.

---

## Self-Review

Run against the corrected spec after writing the plan.

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| §2 thread `surface` into the five section components | 1, 2, 3, 4 |
| §2 `InventoryDateBadge` surface | 6 |
| §2 hub-orange regression guard | 5 |
| §2 / §4 delete iframe page + `embed-url` route | 11 |
| §2 rename `reports2` → `reports` | 11 |
| §2 rewrite the six section pages | 13, 14, 15, 16 |
| §3 `usePortalReportControls` + provider | 9 |
| §3 `ReportRangeControls` split (correction 3) | 7 |
| §3 four new `ReportsControlsBar` props | 7 |
| §3 `PortalReportState` + `MissingAccountIdBanner` (correction 2) | 10 |
| §3 `clientHasSection` vs `canAccessSection` (correction 4) | 8, 12 |
| §3 index page dedup | 12 |
| §3 layout-mounted provider | 12 |
| §5 all seven reference updates | 11 |
| §6 per-page permission gating | 13, 14, 15, 16 (each page's third guard) |
| §7 unit tests for the access logic | 8 |
| §7 `tsc` + dogfood in place of page-level unit tests | 17 |
| §7 full dogfood checklist | 17 (Steps 6-9) |
| §9 correction 6 (`allowedSections` not from `me/client`) | 9 (separate `/api/clients` query) |
| §9 correction 7 (subscribe-save year default) | 16 |
| §9 both locked color decisions | 3 (accepted trio), 5 (allowlist) |

No spec requirement is unassigned. Two spec items are deliberately *not* implemented and both are recorded in §9 as decisions rather than gaps: the categorical slot-0 arrays stay shared, and `focus:border-brand` is deferred.

**2. Placeholder scan**

No "TBD", "implement later", "add error handling", "similar to Task N", or bare prose where code is required. Every code step carries the literal text to write. Task 14 repeats all three page bodies in full rather than cross-referencing, per the no-placeholder rule. The one place the plan says "leave unchanged" (`REPORT_CARDS`, Task 12 Step 3) is an instruction not to touch existing code, with exact line numbers — not a gap.

**3. Type consistency**

Checked each name across task boundaries:
- `SurfaceKind` — the aliased import is used identically in Tasks 1, 2, 3, 4, 6.
- `snsSeriesColors` / `sovEntityColors` / `periodsFor` / `gapsBarColor` / `inventoryBadgeColors` — each defined in exactly one task and referenced only there and in its own test.
- `ReportRangeControls` — produced in Task 7, consumed by Task 9's `PortalReportControls extends`.
- `ControlsBarControls` — produced in Task 7, proven assignable in Task 9 Step 3, first used at a call site in Task 13.
- `PortalReportControls` — produced in Task 9, consumed in Tasks 12-16.
- `makeSectionAccess` / `SectionAccess` — produced in Task 8, consumed in Task 9, surfaced as `canAccessSection` / `clientHasSection` in Tasks 12-16.
- `PortalReportState` / `MissingAccountIdBanner` — produced in Task 10, consumed in Tasks 12-16. Task 12 imports only `PortalReportState`, which is correct: the index has its own inline IntentwiseID banner gated on `anyReportEnabled`.
- `previousWeek` — exported in Task 7, imported in Task 9.
- `surface` prop names and required-vs-optional match between each component and every call site updated in the same task.

One consistency note carried deliberately: `InventorySection` is the only v2 section rendered on the portal **without** a `surface` prop (Task 15). That is correct, not an oversight — it has no surface-dependent styling once `STACK` is left shared.
