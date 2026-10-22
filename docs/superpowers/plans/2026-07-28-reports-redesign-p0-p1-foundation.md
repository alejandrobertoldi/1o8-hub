# Reports Redesign — Phase 0 & 1: Foundation & Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the v2 design-system foundation (tokens, palette switch, status-band logic, 8 reusable primitives) and an empty-but-visible v2 dashboard shell on a dev-only preview route, without touching the live `/reports` or `/portal/reports2/overview` dashboards.

**Architecture:** All v2 code lives under `src/components/reports/v2/`. A pure `getSurfacePalette(surface)` function resolves the hub (orange/dark) vs portal (charcoal/light) palette; every primitive takes the resolved palette so hub↔portal recolor is one switch. Pure logic (palette, status bands) is TDD'd with vitest; presentational primitives are verified by `npx tsc --noEmit` + visual dogfood on the preview route (Recharts/jsdom SVG is not asserted). The live dashboards are untouched until the phase-8 swap.

**Tech Stack:** Next.js 16.1.6 (App Router) · React 19.2 · TypeScript 5.9 · Tailwind CSS v4 (`@theme inline` tokens in `src/app/globals.css`) · shadcn/ui · Vitest 4. Font: Outfit (`--font-sans`).

**Spec:** `docs/superpowers/specs/2026-07-27-reports-redesign-design.md` (§4 brand reconciliation, §9 status bands, §14 component inventory, §15 phasing are the load-bearing sections for this plan).

## Global Constraints

- Typecheck with `npx tsc --noEmit`. **NEVER run `next build`** (PORT 3000 is taken locally).
- Tests: `npx vitest run <path>`. Vitest passing does NOT prove tsc passes — always run tsc before claiming a change compiles.
- Fonts: single-family **Outfit** via `--font-sans`. Never introduce Inter. Numeric values/cells use `tabular-nums`.
- Hero / text-bearing orange fills use `--brand-solid` (`#B8500F`) + white text (WCAG AA ~5:1). Bright `--mf-orange`/`--brand` (`#FF751F`) is for accents/borders/icons/current-period line/progress bars only — never a fill behind text.
- **Dual-accent, load-bearing:** hub = orange, portal = charcoal, never mixed. No `#FF751F` / `--mf-orange` / `--brand` may appear anywhere the portal palette is used.
- Adopt the prototype's `--mf-*` tokens verbatim (namespaced `--mf-*`); flag — do not rename — that `--mf-orange` == `--brand`.
- Categorical data colors (ad-revenue green, ad-spend purple `#65418A`, CVR/CTR blue `#5B6EF5`, heat red/amber/green) are shared and identical on both surfaces — they are NOT part of the orange→charcoal recolor.
- Never `git add .` — stage explicit paths only. Never stage `graphify-out/` churn (the commit hook regenerates it). Fish shell: no bash `for` loops / multiline `$(...)`; use `git add -- <paths>`.
- One task per commit; commit only on the user's explicit per-action OK. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Modify:** `src/app/globals.css` — add `--mf-*` vars to `:root` + map color tokens in `@theme inline`.
- **Create (pure logic):**
  - `src/components/reports/v2/primitives/palette.ts` — `Surface` type + `getSurfacePalette`.
  - `src/components/reports/v2/primitives/status-bands.ts` — `classifyRoas` / `classifyAcos`.
- **Create (primitives):** `surface.tsx`, `chip.tsx`, `segmented.tsx`, `kpi-card.tsx`, `heat-cell.tsx`, `progress-bar.tsx`, `table-toolbar.tsx`, `chart-frame.tsx` under `src/components/reports/v2/primitives/`.
- **Create (composition + preview):**
  - `src/components/reports/v2/performance-overview-v2.tsx` — shell composition, takes `surface`.
  - `src/app/reports/v2-preview/page.tsx` — dev-only mount rendering both surfaces.
- **Create (tests):** `palette.test.ts`, `status-bands.test.ts` colocated in `src/components/reports/v2/primitives/`.

---

## Task 1: `--mf-*` design tokens in globals.css

**Files:**
- Modify: `src/app/globals.css` (`@theme inline` block ~line 23–70; `:root` block further down)

**Interfaces:**
- Produces: CSS custom properties `--mf-orange`, `--mf-charcoal`, `--mf-charcoal-900`, `--mf-charcoal-700`, `--mf-ghost`, `--mf-white`, `--mf-ink`, `--mf-muted`, `--mf-line`, `--mf-positive(-bg)`, `--mf-negative(-bg)`, `--mf-warning(-bg)`, `--mf-info`, plus Tailwind utilities `bg-mf-charcoal`, `text-mf-muted`, etc. via `@theme inline`.

- [ ] **Step 1: Add the `--mf-*` raw variables to `:root`.** Locate the `:root { ... }` block that defines `--brand` etc. Append this block inside it:

```css
  /* ── Reports redesign tokens (prototype market-foundry-dashboard-redesign.html).
     Adopted verbatim per spec §4.1. NOTE: --mf-orange is identical to --brand
     (#FF751F); kept as a distinct name for prototype-parity, NOT a new color.
     --mf-positive/negative/warning are DARKER text-on-tint status colors (AA on
     light bg) and intentionally coexist with --brand-green/red/yellow (badge fills). */
  --mf-orange: #ff751f;
  --mf-orange-700: #c4510a;
  --mf-orange-100: #fff0e6;
  --mf-charcoal: #2a5059;
  --mf-charcoal-900: #19343b;
  --mf-charcoal-700: #23464f;
  --mf-ghost: #f0eff6;
  --mf-white: #fefefe;
  --mf-ink: #242222;
  --mf-muted: #68777c;
  --mf-line: #dbe1e4;
  --mf-positive: #18864b;
  --mf-positive-bg: #e9f7ef;
  --mf-negative: #c73737;
  --mf-negative-bg: #fff0f0;
  --mf-warning: #a66600;
  --mf-warning-bg: #fff7df;
  --mf-info: #356bb3;
```

- [ ] **Step 2: Map the color tokens for Tailwind utilities.** Inside the `@theme inline { ... }` block, add:

```css
  --color-mf-orange: var(--mf-orange);
  --color-mf-charcoal: var(--mf-charcoal);
  --color-mf-charcoal-900: var(--mf-charcoal-900);
  --color-mf-charcoal-700: var(--mf-charcoal-700);
  --color-mf-ghost: var(--mf-ghost);
  --color-mf-muted: var(--mf-muted);
  --color-mf-line: var(--mf-line);
  --color-mf-positive: var(--mf-positive);
  --color-mf-positive-bg: var(--mf-positive-bg);
  --color-mf-negative: var(--mf-negative);
  --color-mf-negative-bg: var(--mf-negative-bg);
  --color-mf-warning: var(--mf-warning);
  --color-mf-warning-bg: var(--mf-warning-bg);
```

- [ ] **Step 3: Verify tokens are present.**

Run: `grep -c "mf-charcoal" src/app/globals.css`
Expected: `>= 3` (raw var + charcoal-900 + charcoal-700 + @theme mappings).

- [ ] **Step 4: Verify the app still typechecks.**

Run: `npx tsc --noEmit`
Expected: no NEW errors (pre-existing unrelated errors in `/api/hours` route + sales-summary test import may remain; note them, do not fix here).

- [ ] **Step 5: Commit.**

```bash
git add -- src/app/globals.css
git commit -m "feat(reports-v2): add --mf-* design tokens for redesign foundation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Surface palette resolver (pure — TDD)

**Files:**
- Create: `src/components/reports/v2/primitives/palette.ts`
- Test: `src/components/reports/v2/primitives/palette.test.ts`

**Interfaces:**
- Produces: `type Surface = "hub" | "portal"`; `interface SurfacePalette { surface, canvas, heroFill, heroText, cta, ctaText, accent, eyebrowClass }` (all string CSS values / class names); `function getSurfacePalette(surface: Surface): SurfacePalette`.
- Consumed by: every primitive and the shell (Tasks 4–13) and all later phases.

- [ ] **Step 1: Write the failing test.**

```ts
// palette.test.ts
import { describe, it, expect } from "vitest";
import { getSurfacePalette } from "./palette";

describe("getSurfacePalette", () => {
  it("hub uses the dark charcoal canvas and AA-safe orange hero fill", () => {
    const p = getSurfacePalette("hub");
    expect(p.canvas).toBe("var(--mf-charcoal)");
    expect(p.heroFill).toBe("var(--brand-solid)"); // #B8500F, NOT bright #FF751F
    expect(p.heroText).toBe("var(--mf-white)");
    expect(p.accent).toBe("var(--mf-orange)");
    expect(p.eyebrowClass).toBe("text-brand");
  });

  it("portal uses the light ghost canvas and charcoal emphasis", () => {
    const p = getSurfacePalette("portal");
    expect(p.canvas).toBe("var(--mf-ghost)");
    expect(p.heroFill).toBe("var(--portal-accent)");
    expect(p.cta).toBe("var(--portal-accent)");
    expect(p.accent).toBe("var(--portal-accent)");
    expect(p.eyebrowClass).toBe("text-portal-accent");
  });

  it("portal palette contains NO hub-orange value anywhere (load-bearing dual-accent rule)", () => {
    const p = getSurfacePalette("portal");
    const banned = ["--mf-orange", "--brand)", "--brand-solid", "#ff751f", "#FF751F", "text-brand"];
    for (const v of Object.values(p)) {
      for (const b of banned) expect(String(v).toLowerCase()).not.toContain(b.toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npx vitest run src/components/reports/v2/primitives/palette.test.ts`
Expected: FAIL — cannot resolve `./palette`.

- [ ] **Step 3: Write the minimal implementation.**

```ts
// palette.ts
export type Surface = "hub" | "portal";

export interface SurfacePalette {
  surface: Surface;
  /** page/shell background */
  canvas: string;
  /** hero KPI card fill — text-bearing, must clear WCAG AA with heroText */
  heroFill: string;
  heroText: string;
  /** primary CTA (Refresh) fill */
  cta: string;
  ctaText: string;
  /** current-period line, progress bars, active state, icons */
  accent: string;
  /** section-heading eyebrow Tailwind class */
  eyebrowClass: string;
}

const HUB: SurfacePalette = {
  surface: "hub",
  canvas: "var(--mf-charcoal)",
  heroFill: "var(--brand-solid)",
  heroText: "var(--mf-white)",
  cta: "var(--brand-solid)",
  ctaText: "var(--mf-white)",
  accent: "var(--mf-orange)",
  eyebrowClass: "text-brand",
};

const PORTAL: SurfacePalette = {
  surface: "portal",
  canvas: "var(--mf-ghost)",
  heroFill: "var(--portal-accent)",
  heroText: "var(--mf-white)",
  cta: "var(--portal-accent)",
  ctaText: "var(--mf-white)",
  accent: "var(--portal-accent)",
  eyebrowClass: "text-portal-accent",
};

export function getSurfacePalette(surface: Surface): SurfacePalette {
  return surface === "portal" ? PORTAL : HUB;
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npx vitest run src/components/reports/v2/primitives/palette.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add -- src/components/reports/v2/primitives/palette.ts src/components/reports/v2/primitives/palette.test.ts
git commit -m "feat(reports-v2): surface palette resolver (hub orange / portal charcoal)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Status-band classifiers (pure — TDD)

**Files:**
- Create: `src/components/reports/v2/primitives/status-bands.ts`
- Test: `src/components/reports/v2/primitives/status-bands.test.ts`

**Interfaces:**
- Produces: `type Band = "good" | "warn" | "bad" | "none"`; `function classifyRoas(roas: number | null): Band`; `function classifyAcos(acosPct: number | null): Band`. **Unit note:** `classifyAcos` takes ACoS in **percent points** (e.g. `36.22` = 36.22%). The consuming call site (phase 5 tables) must normalize the API value to percent points before calling.
- Consumed by: `HeatCell` (Task 8), tables (phase 5), decision-support (phase 6).

- [ ] **Step 1: Write the failing test.**

```ts
// status-bands.test.ts
import { describe, it, expect } from "vitest";
import { classifyRoas, classifyAcos } from "./status-bands";

describe("classifyRoas", () => {
  it("good at/above 4.0", () => { expect(classifyRoas(4.0)).toBe("good"); expect(classifyRoas(25.58)).toBe("good"); });
  it("warn from 2.0 to just under 4.0", () => { expect(classifyRoas(2.0)).toBe("warn"); expect(classifyRoas(3.99)).toBe("warn"); });
  it("bad below 2.0", () => { expect(classifyRoas(1.99)).toBe("bad"); expect(classifyRoas(0.38)).toBe("bad"); });
  it("zero or null → none (zero-conversion '—')", () => { expect(classifyRoas(0)).toBe("none"); expect(classifyRoas(null)).toBe("none"); });
});

describe("classifyAcos (percent points)", () => {
  it("good at/below 25%", () => { expect(classifyAcos(25)).toBe("good"); expect(classifyAcos(3.91)).toBe("good"); });
  it("warn above 25% up to 60%", () => { expect(classifyAcos(25.01)).toBe("warn"); expect(classifyAcos(60)).toBe("warn"); });
  it("bad above 60%", () => { expect(classifyAcos(60.01)).toBe("bad"); expect(classifyAcos(262.87)).toBe("bad"); });
  it("null → none (zero-revenue '—')", () => { expect(classifyAcos(null)).toBe("none"); });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npx vitest run src/components/reports/v2/primitives/status-bands.test.ts`
Expected: FAIL — cannot resolve `./status-bands`.

- [ ] **Step 3: Write the minimal implementation.**

```ts
// status-bands.ts
export type Band = "good" | "warn" | "bad" | "none";

/** ROAS bands per spec §9: good ≥4.0, warn 2.0–3.99, bad <2.0, none for 0/null. */
export function classifyRoas(roas: number | null): Band {
  if (roas === null || roas === 0) return "none";
  if (roas >= 4.0) return "good";
  if (roas >= 2.0) return "warn";
  return "bad";
}

/** ACoS bands per spec §9, input in percent points: good ≤25, warn 25–60, bad >60, none for null. */
export function classifyAcos(acosPct: number | null): Band {
  if (acosPct === null) return "none";
  if (acosPct <= 25) return "good";
  if (acosPct <= 60) return "warn";
  return "bad";
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npx vitest run src/components/reports/v2/primitives/status-bands.test.ts`
Expected: PASS (8 assertions across 8 tests).

- [ ] **Step 5: Commit.**

```bash
git add -- src/components/reports/v2/primitives/status-bands.ts src/components/reports/v2/primitives/status-bands.test.ts
git commit -m "feat(reports-v2): ROAS/ACoS status-band classifiers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `Surface` primitive (card frame)

**Files:**
- Create: `src/components/reports/v2/primitives/surface.tsx`

**Interfaces:**
- Consumes: nothing (presentational).
- Produces: `function Surface(props: { title?: string; subtitle?: string; tools?: React.ReactNode; children: React.ReactNode; className?: string }): JSX.Element`. White card with optional head row (title/subtitle left, tools right), rounded-`lg` (18px), soft shadow, `--mf-line` border, `overflow-hidden`.

- [ ] **Step 1: Write the component.**

```tsx
// surface.tsx
import type { ReactNode } from "react";

export function Surface({
  title,
  subtitle,
  tools,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  tools?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[18px] border border-mf-line bg-white shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${className}`}
    >
      {(title || tools) && (
        <div className="flex min-h-[54px] items-center justify-between gap-3.5 border-b border-mf-line px-[18px] py-3.5">
          <div>
            {title && <h3 className="m-0 text-[15px] font-bold tracking-tight text-mf-ink">{title}</h3>}
            {subtitle && <div className="text-xs text-mf-muted">{subtitle}</div>}
          </div>
          {tools && <div className="flex flex-wrap gap-2">{tools}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/surface.tsx
git commit -m "feat(reports-v2): Surface card primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `Chip` primitive (status pill)

**Files:**
- Create: `src/components/reports/v2/primitives/chip.tsx`

**Interfaces:**
- Produces: `type ChipTone = "positive" | "negative" | "warning" | "neutral"`; `function Chip(props: { tone: ChipTone; children: React.ReactNode }): JSX.Element`. Pill using the `--mf-positive/negative/warning` text-on-tint tokens (shared on both surfaces — status is not brand accent).

- [ ] **Step 1: Write the component.**

```tsx
// chip.tsx
import type { ReactNode } from "react";

export type ChipTone = "positive" | "negative" | "warning" | "neutral";

const TONE: Record<ChipTone, string> = {
  positive: "text-mf-positive bg-mf-positive-bg",
  negative: "text-mf-negative bg-mf-negative-bg",
  warning: "text-mf-warning bg-mf-warning-bg",
  neutral: "text-mf-charcoal bg-mf-ghost",
};

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/chip.tsx
git commit -m "feat(reports-v2): Chip status-pill primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `Segmented` primitive (accessible segmented control)

**Files:**
- Create: `src/components/reports/v2/primitives/segmented.tsx`

**Interfaces:**
- Consumes: `SurfacePalette` (Task 2) for the active-tab accent.
- Produces: `function Segmented<T extends string>(props: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; palette: SurfacePalette; ariaLabel: string }): JSX.Element`. Keyboard-operable radio-group semantics; active tab gets a white chip + palette accent text.

- [ ] **Step 1: Write the component.**

```tsx
// segmented.tsx
"use client";
import type { SurfacePalette } from "./palette";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  palette,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  palette: SurfacePalette;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[10px] bg-mf-ghost p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              active ? "bg-white font-semibold shadow-[0_2px_8px_rgba(16,34,39,0.08)]" : "text-mf-muted hover:text-mf-ink"
            }`}
            style={active ? { color: palette.accent } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/segmented.tsx
git commit -m "feat(reports-v2): accessible Segmented control primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `KpiCard` primitive (hero + supporting variants)

**Files:**
- Create: `src/components/reports/v2/primitives/kpi-card.tsx`

**Interfaces:**
- Consumes: `SurfacePalette` (Task 2), `Chip` (Task 5).
- Produces: `interface KpiMiniStat { label: string; value: string }`; `function KpiCard(props: { variant: "hero" | "supporting"; label: string; value: string; chip?: { tone: ChipTone; text: string }; miniStats: [KpiMiniStat, KpiMiniStat]; sparkline?: React.ReactNode; palette: SurfacePalette }): JSX.Element`. Hero = palette.heroFill background + heroText; supporting = white card. Anatomy per spec §6: label · value · chip · two mini-stats · sparkline slot.

- [ ] **Step 1: Write the component.**

```tsx
// kpi-card.tsx
import type { ReactNode } from "react";
import type { SurfacePalette } from "./palette";
import { Chip, type ChipTone } from "./chip";

export interface KpiMiniStat { label: string; value: string }

export function KpiCard({
  variant,
  label,
  value,
  chip,
  miniStats,
  sparkline,
  palette,
}: {
  variant: "hero" | "supporting";
  label: string;
  value: string;
  chip?: { tone: ChipTone; text: string };
  miniStats: [KpiMiniStat, KpiMiniStat];
  sparkline?: ReactNode;
  palette: SurfacePalette;
}) {
  const hero = variant === "hero";
  return (
    <div
      className={`flex min-h-[190px] flex-col overflow-hidden rounded-[18px] shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${
        hero ? "border border-white/20" : "border border-black/10 bg-white"
      }`}
      style={hero ? { background: palette.heroFill, color: palette.heroText } : undefined}
    >
      <div className="flex items-start justify-between gap-3.5 px-[18px] pt-[18px] pb-2.5">
        <div>
          <div className={`text-[10px] font-extrabold uppercase tracking-[0.11em] ${hero ? "" : "text-mf-muted"}`}>{label}</div>
          <div className="mt-[7px] text-[clamp(29px,2.5vw,42px)] font-extrabold leading-none tracking-[-0.045em] tabular-nums">{value}</div>
        </div>
        {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
      </div>
      <div className="grid grid-cols-2 gap-2 px-[18px] pb-3">
        {miniStats.map((m) => (
          <div key={m.label} className={`rounded-[10px] px-2.5 py-2 ${hero ? "bg-white/15" : "bg-mf-ghost"}`}>
            <span className={`block text-[9px] uppercase tracking-[0.08em] ${hero ? "opacity-70" : "text-mf-muted"}`}>{m.label}</span>
            <b className="mt-[3px] block text-[13px] tabular-nums">{m.value}</b>
          </div>
        ))}
      </div>
      {sparkline && <div className="mt-auto h-[58px] px-3.5 pb-2.5">{sparkline}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/kpi-card.tsx
git commit -m "feat(reports-v2): KpiCard primitive (hero + supporting variants)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `HeatCell` + `ProgressBar` primitives

**Files:**
- Create: `src/components/reports/v2/primitives/heat-cell.tsx`
- Create: `src/components/reports/v2/primitives/progress-bar.tsx`

**Interfaces:**
- Consumes: `Band` (Task 3), `SurfacePalette` (Task 2, for ProgressBar fill).
- Produces: `function HeatCell(props: { band: Band; children: React.ReactNode }): JSX.Element` (text-on-tint background by band; value ALWAYS visible — never color-only, spec §13). `function ProgressBar(props: { pct: number; palette: SurfacePalette }): JSX.Element`.

- [ ] **Step 1: Write `heat-cell.tsx`.**

```tsx
// heat-cell.tsx
import type { ReactNode } from "react";
import type { Band } from "./status-bands";

const BAND: Record<Band, string> = {
  good: "text-mf-positive bg-mf-positive-bg",
  warn: "text-mf-warning bg-mf-warning-bg",
  bad: "text-mf-negative bg-mf-negative-bg",
  none: "text-mf-muted bg-mf-ghost",
};

export function HeatCell({ band, children }: { band: Band; children: ReactNode }) {
  return (
    <span className={`inline-block min-w-[58px] rounded-[7px] px-[7px] py-[5px] text-center font-semibold tabular-nums ${BAND[band]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Write `progress-bar.tsx`.**

```tsx
// progress-bar.tsx
import type { SurfacePalette } from "./palette";

export function ProgressBar({ pct, palette }: { pct: number; palette: SurfacePalette }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-[58px] overflow-hidden rounded-full bg-[#e7ebed]" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full" style={{ width: `${clamped}%`, background: palette.accent }} />
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit.**

```bash
git add -- src/components/reports/v2/primitives/heat-cell.tsx src/components/reports/v2/primitives/progress-bar.tsx
git commit -m "feat(reports-v2): HeatCell + ProgressBar primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `TableToolbar` primitive

**Files:**
- Create: `src/components/reports/v2/primitives/table-toolbar.tsx`

**Interfaces:**
- Produces: `function TableToolbar(props: { search: string; onSearch: (v: string) => void; searchPlaceholder: string; filters?: React.ReactNode; count: string }): JSX.Element`. Search input + filter slot left, result count right; lives inside a `Surface` above the scroll area.

- [ ] **Step 1: Write the component.**

```tsx
// table-toolbar.tsx
"use client";
import type { ReactNode } from "react";

export function TableToolbar({
  search,
  onSearch,
  searchPlaceholder,
  filters,
  count,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  filters?: ReactNode;
  count: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-mf-line bg-white px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 min-w-[240px] rounded-[9px] border border-mf-line bg-white px-[11px] text-mf-ink"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {filters}
      </div>
      <div className="text-xs text-mf-muted tabular-nums">{count}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/table-toolbar.tsx
git commit -m "feat(reports-v2): TableToolbar primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `ChartFrame` primitive

**Files:**
- Create: `src/components/reports/v2/primitives/chart-frame.tsx`

**Interfaces:**
- Consumes: `Surface` (Task 4).
- Produces: `function ChartFrame(props: { title: string; subtitle?: string; tools?: React.ReactNode; summary?: React.ReactNode; legend?: React.ReactNode; children: React.ReactNode; className?: string }): JSX.Element`. A `Surface` with an optional summary strip above the chart body and a legend below; body padded 18px.

- [ ] **Step 1: Write the component.**

```tsx
// chart-frame.tsx
import type { ReactNode } from "react";
import { Surface } from "./surface";

export function ChartFrame({
  title,
  subtitle,
  tools,
  summary,
  legend,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  tools?: ReactNode;
  summary?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface title={title} subtitle={subtitle} tools={tools} className={className}>
      <div className="p-[18px]">
        {summary && <div className="mb-3.5">{summary}</div>}
        {children}
        {legend && <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-mf-muted">{legend}</div>}
      </div>
    </Surface>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/primitives/chart-frame.tsx
git commit -m "feat(reports-v2): ChartFrame primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `PerformanceOverviewV2` shell composition

**Files:**
- Create: `src/components/reports/v2/performance-overview-v2.tsx`

**Interfaces:**
- Consumes: `Surface` (Task 4), `getSurfacePalette` + `Surface`/`Segmented` types (Task 2/6).
- Produces: `function PerformanceOverviewV2(props: { surface: Surface; accountId?: string; start?: string; end?: string }): JSX.Element`. The full-page shell: sticky 72px header (brand block + control row), page heading + refreshed badge, and labelled empty section placeholders for Executive Insights, Headline performance, Business performance, Keyword analysis, Campaign & product detail, Decision support. Sections are `<section aria-labelledby>` with a heading + a "Section scaffold" placeholder Surface. Canvas background comes from `palette.canvas`.

- [ ] **Step 1: Write the shell.** (Placeholders here are *intentional empty sections* to be filled by phases 2–8, not plan placeholders — each section is a real labelled landmark.)

```tsx
// performance-overview-v2.tsx
"use client";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";

const SECTIONS: { id: string; title: string; blurb: string }[] = [
  { id: "insights", title: "Executive insights", blurb: "Immediate context before charts or tables. (phase 3)" },
  { id: "kpi", title: "Headline performance", blurb: "3 hero + 4 supporting KPIs. (phase 2)" },
  { id: "performance", title: "Business performance", blurb: "Combined chart + supporting charts + funnel + ROAS rank + scatter. (phase 4)" },
  { id: "keywords", title: "Keyword analysis", blurb: "Sponsored Products keywords table. (phase 5)" },
  { id: "campaigns", title: "Campaign & product detail", blurb: "Campaign performance table. (phase 5)" },
  { id: "actions", title: "Decision support", blurb: "Top performers · Efficiency risks · Recommended actions. (phase 6)" },
];

export function PerformanceOverviewV2({ surface }: { surface: SurfaceKind }) {
  const palette = getSurfacePalette(surface);
  return (
    <div className="min-h-screen" style={{ background: palette.canvas }}>
      <header className="sticky top-0 z-50 flex min-h-[72px] items-center border-b border-white/10 backdrop-blur-md" style={{ background: "rgba(42,80,89,0.97)" }}>
        <div className="mx-auto flex w-[min(calc(100%-32px),1760px)] items-center justify-between gap-6">
          <div className="flex items-center gap-3.5 text-white">
            <div className="grid h-[38px] w-[38px] place-items-center rounded-[11px] font-black text-white" style={{ background: palette.accent }}>MF</div>
            <div>
              <div className="text-[20px] font-extrabold tracking-tight">Client<span style={{ color: palette.accent }}>Reports</span></div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/60">Market Foundry analytics</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5 text-white/80 text-xs">Controls scaffold (phase 7)</div>
        </div>
      </header>

      <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-7">
        <div className="mb-5 flex items-end justify-between gap-6 text-white">
          <div>
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Performance overview</h1>
            <p className="mt-2.5 max-w-[760px] text-white/70">An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis.</p>
          </div>
        </div>

        {SECTIONS.map((s) => (
          <section key={s.id} aria-labelledby={`${s.id}-title`} className="mt-10">
            <div className="mb-3.5 text-white">
              <h2 id={`${s.id}-title`} className={`m-0 text-[18px] font-bold tracking-tight ${palette.eyebrowClass}`}>{s.title}</h2>
            </div>
            <Surface><div className="p-[18px] text-mf-muted">{s.blurb}</div></Surface>
          </section>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit.**

```bash
git add -- src/components/reports/v2/performance-overview-v2.tsx
git commit -m "feat(reports-v2): PerformanceOverviewV2 shell composition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Dev-only preview route

**Files:**
- Create: `src/app/reports/v2-preview/page.tsx`

**Interfaces:**
- Consumes: `PerformanceOverviewV2` (Task 11).
- Produces: a page at `/reports/v2-preview` rendering both surfaces stacked (hub then portal) for side-by-side dogfooding. This route is temporary scaffolding, removed at the phase-8 swap.

- [ ] **Step 1: Write the preview page.**

```tsx
// page.tsx
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";

// DEV-ONLY preview of the v2 redesign shell. Not linked in nav. Removed at phase-8 swap.
export default function ReportsV2PreviewPage() {
  return (
    <div>
      <PerformanceOverviewV2 surface="hub" />
      <PerformanceOverviewV2 surface="portal" />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Dogfood.** With the app already running on PORT 3000, open `/reports/v2-preview`. Confirm: hub shell renders on a dark charcoal canvas with orange "Reports" accent; portal shell renders on a light ghost canvas with charcoal accent; six labelled section scaffolds appear on each; no console errors; sticky header stays on scroll. (Visual verification per spec §16 — do not assert SVG in jsdom.)

- [ ] **Step 4: Commit.**

```bash
git add -- src/app/reports/v2-preview/page.tsx
git commit -m "feat(reports-v2): dev-only /reports/v2-preview mount for both surfaces

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage (this plan targets spec §4, §9, §14, §15 phases 0–1):**
- §4.1 token adoption → Task 1. §4.2 hero `#B8500F` → palette `heroFill` (Task 2) + KpiCard hero (Task 7). §4.3 Outfit → Global Constraints (inherited `--font-sans`; no Inter). §4.4 `surface` prop + dual-accent + portal light canvas → Task 2 palette + Task 11 shell. §9 status bands → Task 3 + HeatCell (Task 8). §14 primitives (Surface, KpiCard, Chip, Segmented, TableToolbar, ChartFrame, HeatCell, ProgressBar) → Tasks 4–10. §15 phase 0 (tokens+primitives) → Tasks 1–10; phase 1 (shell+scaffold) → Tasks 11–12. **No gaps for phases 0–1.** Phases 2–8 are the roadmap below (out of scope for this plan by design).
- Deferred to later phases (correctly not here): KPI data wiring, sparklines, insights logic, all six charts, tables, decision-support, live state, a11y pass, swap.

**2. Placeholder scan:** No "TBD/TODO/implement later". The `SECTIONS` blurbs in Task 11 are intentional in-product section labels naming the phase that fills them, not plan placeholders — every task ships real, compiling code.

**3. Type consistency:** `Surface` type (palette) vs `Surface` component (card) share a name in different modules — Task 11 imports the type as `Surface as SurfaceKind` to disambiguate. `SurfacePalette` fields (`canvas/heroFill/heroText/cta/ctaText/accent/eyebrowClass`) used identically in Tasks 6, 7, 8, 11. `Band` union (`good/warn/bad/none`) consistent between Task 3 and Task 8's `BAND` record. `ChipTone` consistent between Task 5 and Task 7's `chip.tone`.

---

## Roadmap: Phases 2–8 (each becomes its own plan, written just-in-time)

Plan each phase immediately before executing it, so signatures reflect what earlier phases actually built. Each phase produces working, testable software on its own.

- **Phase 2 — KPI hierarchy.** Rebuild the 7 KPI cards on `KpiCard` (reuse the existing `/api/reports/overview` fetch pattern from `total-sales-card.tsx`); 3 heroes + 4 supporting; sparklines; PY/target/variance mini-stats + chips; net-new `CvrCard` (CVR = conversions/clicks); relocate dropped metrics per spec §6. Fill the `kpi` section.
- **Phase 3 — Executive Insights (TDD).** `computeInsights(overview): Insight[]` per spec §7 (YoY / efficiency / target-variance / traffic-anomaly rules, top-4 by severity, no fabricated targets, fewer-than-4 renders fewer). `ExecutiveInsightGrid` + `InsightCard`. Fill the `insights` section.
- **Phase 4 — Charts.** Restyle `sales-acos-chart` → dominant combined chart (series toggles, granularity, 4-value summary via `ChartFrame`); restyle `cpc-cvr-chart` + `clicks-impressions-ctr-chart`; net-new `ConversionFunnel`, `RoasRankingChart`, `SpendRoasScatter`. TDD the pure derivations only (funnel values/%, ROAS sort+banding, scatter scaling); verify SVG by tsc + dogfood.
- **Phase 5 — Tables.** `keywords-table` + campaign table on the redesigned table shell (sticky header + first column, zebra, total row, `TableToolbar` search/filter/sort, `HeatCell` on ACoS/ROAS — normalize ACoS to percent points at the call site, `ProgressBar` for CVR, CSV export, metric tooltips). Typed stubs for column chooser / saved views / virtualization.
- **Phase 6 — Decision support (TDD).** Rule functions per spec §10 (`roasScaleFloor 4.0`, `acosRiskCeiling 0.60`, `zeroConvSpendFloor 15`; boundaries, ranking, top-N, empty-state). `DecisionSupportSection` + `ActionCard`. Fill the `actions` section.
- **Phase 7 — Live wiring + states + a11y.** Connect client/date/granularity/comparison/series-visibility/table-filter/export/refresh to the existing fetch layer; skeleton + explicit "data unavailable" states (inherit the ECONNRESET degradation from commit `7cc9e963`); full a11y pass (focus styles, keyboard, chart text summaries, `prefers-reduced-motion`).
- **Phase 8 — Swap.** Repoint `src/app/reports/page.tsx` → `<PerformanceOverviewV2 surface="hub" />` and `src/app/portal/reports2/overview/page.tsx` → `<PerformanceOverviewV2 surface="portal" />` wired to their fetch layers; verify both; delete `src/app/reports/v2-preview/`; remove the dropped KPI cards from the grid and retire the superseded composition.
