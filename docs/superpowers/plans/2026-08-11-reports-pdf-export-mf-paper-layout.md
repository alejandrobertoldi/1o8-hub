# Reports PDF Export — MF Paper Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `window.print()`-on-the-dashboard with a purpose-built MF paper document per report section, delivered as a print route the browser saves as PDF.

**Architecture:** A shared print layer (`src/components/reports/print/`) renders a fixed-width A4-landscape paper canvas containing the **same** v2 section component the screen uses. Twelve thin route files (six sections × hub/portal) each delegate to one of two client components — `HubPrintPage` (params from the URL) or `PortalPrintPage` (client identity from the session). Readiness is detected generically from the absence of `.animate-pulse` skeletons, which emits the `[data-report-ready]` sentinel a future server render can consume.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Recharts 3.8, Vitest 4 + jsdom + @testing-library/react, puppeteer-core 23 (verification only).

**Source spec:** `docs/superpowers/specs/2026-08-11-reports-pdf-export-design.md` (committed as `e8789c12`).

## Global Constraints

- **NEVER** push, deploy, merge to main, write to prod, or change schema without an explicit per-action OK from Manu.
- Additive only. Deletions are permitted **only** where this plan names them (Task 13).
- `node_modules/.bin/tsc --noEmit`, run in background (~2 min), read **unfiltered**, judged **by filename** against the known baseline of 1–4 errors in `/Users/manu/MFHub`. Never "fix" the `src/app/api/hours/route.ts` TS2344 — it is dev-server-generated.
- **NEVER** run `next build`.
- `vitest` does not typecheck. Every task that runs vitest must be followed by tsc before its commit is considered verified.
- Read `DESIGN.md` before any visual decision. Relevant rules: single typeface Outfit; headline = Outfit Bold ALL CAPS with tight tracking; micro-label = Outfit Bold UPPERCASE 10px; body = Outfit Regular sentence case.
- **Dual accent is load-bearing:** hub accent = Burnt Orange `--mf-orange` / `--brand`; portal accent = Charcoal Blue `--portal-accent`. Never put hub orange on a portal surface. Reference tokens, never raw hex.
- **Portal client identity comes from the session, never from a URL param.** The portal print components must never read `accountId` or `client` from the query string.
- Dev server: `PORT=3100 npm run dev`. Never port 3000.
- Hooks hard-block: `rm -r`, `rm -f`, `kill`, `git checkout -- <path>`, and any command containing `.env`. Use `git rm` (not `rm`) for the deletions in Task 13; use `Edit` to revert a file.
- Never `git add .`. Explicit pathspec on **both** `add` and `commit`, `-m` **before** `--`, one task per commit.
- Commit trailer on every commit:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Dates cross module boundaries as `YYYY-MM-DD` strings, never `Date` objects.

## Paper geometry (single source of truth — used verbatim throughout)

| Quantity | Value | Derivation |
|---|---|---|
| Page | A4 landscape | 297mm × 210mm |
| Margin | `14mm 18mm` | matches `report.css:834-846` exactly |
| Content width | **261mm** (986.5 CSS px @96dpi) | 297 − 2×18 |
| Content height | **182mm** (688 CSS px @96dpi) | 210 − 2×14 |

**The load-bearing invariant:** `.mf-paper` is `width: 261mm` **in both screen and print media**. Recharts `ResponsiveContainer` measures its parent once, on screen, via ResizeObserver and does **not** re-measure when Chrome re-runs layout for the paper box. Making the canvas width identical in both media is what makes the charts correct — it is why no chart component needs a print-specific pixel width. **Never make this width media-dependent.** A `@media print { .mf-paper { width: auto } }` rule would silently reintroduce the original bug.

---

## Architecture decisions taken during research (not in the spec, adopt as written)

1. **Readiness is detected generically, not per-section.** Every one of the six v2 sections renders its loading state as a `div` carrying `animate-pulse` (verified across all 14 section/chart files). `PrintReady` polls for `document.querySelectorAll(".animate-pulse").length === 0`. This needs **zero** changes to any section component and works identically for all six. The `prefers-reduced-motion` block in `globals.css:596` does not touch `animate-pulse`, and the query tests class presence, not animation state, so reduced motion cannot break it.
2. **Portal identity reuses `usePortalReportControls()` verbatim.** That hook resolves the client through `GET /api/portal/me/client`, which applies the admin-preview `?client=` override **server-side and ignores it for non-admins**. Reusing it therefore satisfies the session-identity rule by construction, keeps admin preview working, and brings the `canAccessSection()` grant gate along for free. The portal print components must not parse `client` or `accountId` themselves.
3. **Routes are server components; page bodies are client components.** Each route `await`s `searchParams` (the pattern `src/app/reports/monthly/print/page.tsx:16` already uses) and computes `generatedAt` server-side, so no `useSearchParams()` and no extra `Suspense` boundary is needed.
4. **The PDF control derives its section id from `usePathname()`**, not from a new prop on all 12 pages. It fails closed: an unrecognised path renders no PDF control rather than a link to a 404.
5. **The button switch is the LAST task of Phase 3, not part of Phase 2.** `showPdfExport` defaults true on all twelve existing pages. Switching the control to the print URL before all twelve print routes exist would point ten live buttons at 404s. Until Task 13 the old `window.print()` path stays live and nothing regresses. This corrects the ordering implied by the spec's "Sequencing" section.
6. **`PerformanceOverviewV2` gets a `printMode` prop.** It is the only section component that renders its own page chrome (`min-h-screen` ghost canvas + `main` + H1 + standfirst at `performance-overview-v2.tsx:84-92`); the other five have that chrome in their *page* files. `printMode` suppresses it so the cover block is not duplicated. This mirrors `Report.tsx:34`'s existing `printMode`.
7. **Section label divergence resolved to "Performance Overview".** The hub overview page passes no `sectionLabel` (default `"Performance Overview"`, `reports-controls-bar.tsx:23`) while the portal passes `"Overview"`. The registry uses `"Performance Overview"` for both surfaces; the only visible effect is that the portal's saved PDF filename gains the word "Performance".

---

## Corrections found while executing Phases 1–2 (READ BEFORE PHASE 3)

Nine tasks (1–8, 10) shipped as `3d14ab97`…`7b485b6b`, plus three review-fix commits
`17654706`, `0f4b4b67`, `d9e59669`. Three fresh-context reviews produced 1 Critical, 9 Important.
Every finding traced to this plan's own verbatim code, not to implementer error. What changed:

1. **Task 9's script had an assertion that fails always.** `bodyScrollWidth <= PAPER_PX` compares the
   *viewport* (1440px, set by the script itself) to the paper (986px), and `.mf-paper` is centred with
   `margin: 0 auto`, so body is 1440px wide **by construction**. The gate would have printed
   `GATE: FAIL` for a spurious reason and, per this plan, stopped Phase 3 and triggered a replan of 15
   `ResponsiveContainer` call sites. Corrected to compare `.mf-paper`'s `scrollWidth` to its
   `clientWidth`. The working script is committed at `scripts/_tmp-print-chart-proof.ts`.
2. **A puppeteer gate cannot see the `@page` bug, and there was one.** `page.pdf({format, margin})`
   overrides CSS `@page`. `globals.css:589-592` declares `@page { size: landscape; margin: 12mm }`
   inside `@media print`; its neighbours are prefixed `body.mf-print-report`, but **an `@page` rule
   cannot be scoped by a selector**, so it applies to every print in the app. Measured: with only an
   unnamed `@page` in `print.css`, whichever stylesheet loads **last** wins, and when the legacy rule
   wins on a US-Letter default the content box is 255.4mm — clipping ~6mm per page off the 261mm
   canvas. Fixed with a named `@page mfpaper` context (A4 landscape in either load order); the unnamed
   rule stays as a fallback. Task 9 now also renders with `preferCSSPageSize` and asserts the
   `/MediaBox` is A4 landscape, which is the geometry a real Save-as-PDF produces.
3. **Task 7 fixed `LayoutRouter` but missed route-segment layouts.** `LayoutRouter` lives in the ROOT
   layout, so every segment layout below it still renders. `src/app/portal/layout.tsx` mounts
   `AdminPreviewToggle` (in-flow banner) and `ProspectSampleBadge` (`position: fixed`) inside **every
   portal print document** — and an admin *must* pass `?client=` to resolve identity, which is exactly
   the condition the banner renders on, so this hit 100% of admin-generated portal PDFs. Both now
   carry `mf-no-print`, which `print.css` hides in **all** media. `no-app-chrome.test.ts` fails if a
   third component is added to that layout without a print decision.
4. **`numberOrNull` accepted implausible years.** `?year=0000` → `0`, which is *falsy*: it passed the
   `year !== null` gate, then rendered an empty range label and a `0-01-01` date. `?year=0999` gave
   `999-01-01`. Bounded to 2000–2100.
5. **Only missing params were refused, not invalid ones**, though the spec's error table asks for
   both. Malformed dates now normalise to `""` and fall into the existing gate, with a real calendar
   check (`2026-02-30` and `2026-02-29` rejected, `2028-02-29` accepted).
6. **`render?.()` failed open.** An id with no registry entry rendered a cover with no body, and since
   `PrintReady` only detects the *absence* of skeletons it emitted ready immediately and `AutoPrint`
   printed the blank report. Both page components now fail closed. `section-renderers.routes.test.ts`
   derives routed ids from the filesystem, so "a route with no renderer" is impossible at every
   intermediate state of Tasks 11–12 — **Task 11 Step 3's `?.` removal is already done.**
7. **The `no-hub-orange.print.test.ts` count assertion was off by one** (`toBeGreaterThan(4)` with
   exactly 4 files at Task 4) and could not catch this layer's realistic leak, which is a hardcoded
   `var(--mf-orange)` token rather than a raw hex. Both fixed.
8. **The 261mm test asserted nothing.** It only checked that `.mf-paper` exists, so it would pass with
   `@media print { .mf-paper { width: auto } }`. `print-geometry.test.ts` is now a source-scan
   tripwire, mutation-tested by injecting exactly that regression.

### Two landmines Task 13 must handle — do not discover these at implementation time

- 🔴 **`buildPrintUrl` breaks admin preview on the portal.** It deliberately drops `client` on the
  portal surface, but `usePortalReportControls()` *needs* `?client=<CODE>` (via `useSearchParams`) to
  resolve the previewed client, so Task 13's button will send admins to "This report is not
  available." Adjudicated: passing `?client=<CODE>` does **not** weaken the locked decision — identity
  is enforced by the server-side role check in `/api/portal/me/client` (`clientCode = isAdmin ?
  previewClient : session.user.clientIdCode`) and by `parsePortalPrintParams` being unable to *return*
  identity. The param is a preview *code*, not the client *name* the tests pin. Every other portal URL
  in the app already carries it.
- 🔴 **Task 13 does not clear the pre-existing red test.** `no-hub-orange.test.ts` has failed on
  `main` since `e4bd4dc7` because `reports-controls-bar.tsx:172` contains `text-brand` (verified: 1
  occurrence at `e4bd4dc7`, 0 at its parent). Task 13's replacement keeps `text-brand` in the same
  surface ternary — which is the *correct* dual-accent pattern, already exempted by filename for
  `headline-performance-section.tsx`. The `text-brand` assertion has no allowlist. Decide explicitly:
  add the file to an allowlist for that assertion, or leave `main` permanently red.

### Still unverified, and only Manu can do it

**Task 9 has not run**, so the chart mechanism is unproven on the real page. A synthetic pre-gate
(`scripts/_tmp-print-mechanism-probe.mjs`) proved the *mechanism* with zero auth: paper canvas 261mm
in both media, chart-parent and stamped-SVG widths drifting **0px** across the media switch, full-width
chart fitting the paper box. That is encouraging but it cannot prove the real page's cards, page
breaks, or absence of chrome. **Phase 3 still gates on `GATE: PASS`.** Every browser check in Tasks 1,
10, 11, 12 and 14 also remains outstanding.

## File Structure

**Create — `src/components/reports/print/`**

| File | Responsibility |
|---|---|
| `print-sections.ts` | The six-entry registry: id, label, paper title, standfirst, range kind. Pure data + types, no JSX. |
| `print-sections.test.ts` | Registry shape + parity with the on-screen labels. |
| `print-url.ts` | `buildPrintUrl`, `parseHubPrintParams`, `parsePortalPrintParams`, and the re-homed `buildReportPdfFilename`. |
| `print-url.test.ts` | URL shapes per range kind, the portal's accountId/client strip, filename cases. |
| `print.css` | `@page A4 landscape` 14mm/18mm, the fixed 261mm canvas, card break rules, shadow removal, `print-color-adjust`. `--mf-*` tokens only. |
| `print-document.tsx` | `PrintDocument` — the paper shell: MF cover block + canvas. Sets `document.title` for the browser's save name. |
| `print-document.test.tsx` | Cover fields render; accent is surface-correct; no hub orange on portal. |
| `print-ready.tsx` | `PrintReady` — emits `[data-report-ready]` once no `.animate-pulse` remains, or on timeout. |
| `print-ready.test.tsx` | Waits while pulsing; emits when clear; emits on timeout. |
| `auto-print.tsx` | `AutoPrint` — waits for the sentinel via MutationObserver, then `window.print()`, with a hard fallback. |
| `auto-print.test.tsx` | Prints after the sentinel appears; prints once; prints on fallback. |
| `section-renderers.tsx` | `SECTION_RENDERERS` — id → the v2 section component with print props. The only file that knows each section's prop shape. |
| `hub-print-page.tsx` | `HubPrintPage` — validates URL params, renders `PrintDocument` + section + sentinel. |
| `portal-print-page.tsx` | `PortalPrintPage` — session identity + grant gate, then the same shell. |
| `portal-print-page.test.tsx` | Denies without the grant; never reads `accountId`/`client` from the URL. |
| `no-hub-orange.print.test.ts` | Extends the dual-accent guard to this directory (the existing `no-hub-orange.test.ts` reads only `src/components/reports/v2`, non-recursively, so nothing covers these files). |

**Create — 12 route files**, each a 4-line delegate:
`src/app/{reports,portal/reports}/{overview,advertising-audit,inventory,period-comparative,share-of-voice,subscribe-save}/print/page.tsx`

**Modify**

| File | Change | Task |
|---|---|---|
| `src/components/layout/top-nav.tsx:52-59, 200` | `FileText` import + Monthly Report nav item | 1 |
| `src/components/reports/v2/primitives/surface.tsx:16-19` | add `data-report-card` | 6 |
| `src/components/layout/layout-router.tsx:12-29` | move the print exclusion **above** the `/portal` branch | 7 |
| `src/components/reports/v2/performance-overview-v2.tsx:24-107` | add `printMode` | 8 |
| `src/components/reports/v2/reports-controls-bar.tsx:158-179` | PDF control → print-route link | 13 |
| `src/components/reports/v2/reports-controls-bar.client-select.test.tsx:99-113` | button → link | 13 |
| `src/app/globals.css:546-593` | **delete** the `body.mf-print-report` block | 13 |
| `src/components/monthly-report/styles/report.css` | re-token to `--mf-*` (separate PR) | 15 |

**Delete (Task 13 only, via `git rm`)**: `src/components/reports/v2/export-report-pdf.ts`, `src/components/reports/v2/export-report-pdf.test.ts`.

---

# Phase 1 — Nav link (ships alone)

### Task 1: Monthly Report link in the Clients dropdown

**Files:**
- Modify: `src/components/layout/top-nav.tsx:52-59` (icon import), `:200` (nav item)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task is independent of every other task in the plan and can ship on its own.

**Why there is no unit test here:** `TopNav` is a 1,000-line client component that requires a NextAuth session and a Radix `NavigationMenu`; a test would have to mock both to assert one array literal. A source-scan test (the `no-hub-orange.test.ts` pattern) would assert the diff rather than the behaviour. Verification is tsc plus one browser check. This is the only task in the plan without a test, and it is a deliberate exception.

- [ ] **Step 1: Add `FileText` to the lucide-react import**

In the import block at `src/components/layout/top-nav.tsx:52-59`, add `FileText` to the alphabetically-nearest position. The final line of that block currently reads:

```
  HelpCircle, X as XIcon, ChevronRight, Table, Clock, Tags, Contact, Gift, Plane, type LucideIcon,
```

Change it to:

```
  HelpCircle, X as XIcon, ChevronRight, Table, Clock, Tags, Contact, Gift, Plane, FileText, type LucideIcon,
```

- [ ] **Step 2: Add the nav item**

In the `Clients` section's `items` array, immediately after the `Client Reports` entry at `:200`, insert:

```tsx
        { title: "Monthly Report", href: "/reports/monthly", icon: FileText, visible: isAdmin },
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` (background, ~2 min, read unfiltered)
Expected: only the known baseline errors. `top-nav.tsx` must not appear.

- [ ] **Step 4: Browser check**

Run: `PORT=3100 npm run dev`, open `http://localhost:3100/`, open the **Clients** dropdown.
Expected: "Monthly Report" appears directly under "Client Reports" with a document icon, and navigates to `/reports/monthly`.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/top-nav.tsx
git commit -m "feat(nav): link the monthly report from the Clients dropdown" -m "The route had no link anywhere in the app and was reachable only by typing the URL." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase 2 — Shared print layer + overview only

Phase 2 exists to prove the chart-sizing mechanism (Task 9) before the other five sections are built. **Do not start Phase 3 until Task 9 passes.**

### Task 2: The section registry

**Files:**
- Create: `src/components/reports/print/print-sections.ts`
- Test: `src/components/reports/print/print-sections.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type PrintSectionId`, `type PrintRangeKind = "range" | "snapshot" | "year"`, `interface PrintSectionMeta { id; label; title; blurb; rangeKind }`, `const PRINT_SECTIONS: Record<PrintSectionId, PrintSectionMeta>`, `function isPrintSectionId(v: string): v is PrintSectionId`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/print/print-sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRINT_SECTIONS, isPrintSectionId, type PrintSectionId } from "./print-sections";

describe("PRINT_SECTIONS", () => {
  it("covers exactly the six v2 report sections", () => {
    expect(Object.keys(PRINT_SECTIONS).sort()).toEqual([
      "advertising-audit",
      "inventory",
      "overview",
      "period-comparative",
      "share-of-voice",
      "subscribe-save",
    ]);
  });

  it("keys every entry by its own id", () => {
    for (const [key, meta] of Object.entries(PRINT_SECTIONS)) {
      expect(meta.id).toBe(key);
    }
  });

  it("assigns the range kind each section's data actually has", () => {
    // inventory is a stock snapshot (no dates); S&S is a full calendar year.
    expect(PRINT_SECTIONS.inventory.rangeKind).toBe("snapshot");
    expect(PRINT_SECTIONS["subscribe-save"].rangeKind).toBe("year");
    expect(PRINT_SECTIONS.overview.rangeKind).toBe("range");
    expect(PRINT_SECTIONS["advertising-audit"].rangeKind).toBe("range");
    expect(PRINT_SECTIONS["period-comparative"].rangeKind).toBe("range");
    expect(PRINT_SECTIONS["share-of-voice"].rangeKind).toBe("range");
  });

  it("carries the same paper title the screen page shows", () => {
    expect(PRINT_SECTIONS.overview.title).toBe("Performance overview");
    expect(PRINT_SECTIONS["subscribe-save"].title).toBe("Subscribe & Save");
  });

  it("never ships an empty label, title, or standfirst", () => {
    for (const meta of Object.values(PRINT_SECTIONS)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(20);
    }
  });

  it("narrows only known ids", () => {
    expect(isPrintSectionId("overview")).toBe(true);
    expect(isPrintSectionId("business-model-audit")).toBe(false);
    expect(isPrintSectionId("")).toBe(false);
  });

  it("types the id union off the registry keys", () => {
    const id: PrintSectionId = "inventory";
    expect(PRINT_SECTIONS[id].label).toBe("Inventory");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/print/print-sections.test.ts`
Expected: FAIL — cannot resolve `./print-sections`.

- [ ] **Step 3: Write the implementation**

Create `src/components/reports/print/print-sections.ts`:

```ts
/** The six v2 report sections that have a paper document.
 *
 *  `label`, `title`, and `blurb` are copied VERBATIM from the on-screen pages so
 *  the paper document and the dashboard never drift apart:
 *    label → ReportsControlsBar's sectionLabel
 *    title → the page <h1>
 *    blurb → the standfirst under the <h1>
 *
 *  The portal's seventh section, business-model-audit, is deliberately absent: it
 *  is an iframe of /api/portal/audit, renders no ReportsControlsBar, and therefore
 *  has no PDF control to fix. */

export type PrintSectionId =
  | "overview"
  | "advertising-audit"
  | "inventory"
  | "period-comparative"
  | "share-of-voice"
  | "subscribe-save";

/** What the section's data is keyed by, which decides the print URL's params.
 *  range    → start + end          (the week/custom picker)
 *  snapshot → no dates at all      (inventory is a point-in-time stock read)
 *  year     → a single year        (S&S is a full calendar year) */
export type PrintRangeKind = "range" | "snapshot" | "year";

export interface PrintSectionMeta {
  id: PrintSectionId;
  label: string;
  title: string;
  blurb: string;
  rangeKind: PrintRangeKind;
}

export const PRINT_SECTIONS: Record<PrintSectionId, PrintSectionMeta> = {
  overview: {
    id: "overview",
    // Hub passes no sectionLabel, so it defaults to "Performance Overview";
    // the portal page passes "Overview". Resolved to the hub's wording for both.
    label: "Performance Overview",
    title: "Performance overview",
    blurb:
      "An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis.",
    rangeKind: "range",
  },
  "advertising-audit": {
    id: "advertising-audit",
    label: "Advertising Audit",
    title: "Advertising audit",
    blurb:
      "Ad spend, performance and campaign efficiency — campaign breakdowns, ACoS vs goal, segmentation and keyword gaps.",
    rangeKind: "range",
  },
  inventory: {
    id: "inventory",
    label: "Inventory",
    title: "Inventory",
    blurb:
      "Stock levels, availability and inventory health per ASIN — status tables and FBA breakdowns.",
    rangeKind: "snapshot",
  },
  "period-comparative": {
    id: "period-comparative",
    label: "Period Comparative",
    title: "Period comparative",
    blurb:
      "Current period against previous month and previous year — trend, comparison cards, and daily detail.",
    rangeKind: "range",
  },
  "share-of-voice": {
    id: "share-of-voice",
    label: "Share of Voice",
    title: "Share of voice",
    blurb:
      "Brand visibility in search results — top brands, keyword coverage, and brand-vs-competitor trends per keyword.",
    rangeKind: "range",
  },
  "subscribe-save": {
    id: "subscribe-save",
    label: "Subscribe & Save",
    title: "Subscribe & Save",
    blurb:
      "Weekly subscription performance across the selected year — subscriptions, sales, units and penetration vs previous year.",
    rangeKind: "year",
  },
};

export function isPrintSectionId(value: string): value is PrintSectionId {
  return Object.prototype.hasOwnProperty.call(PRINT_SECTIONS, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/reports/print/print-sections.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

```bash
git add src/components/reports/print/print-sections.ts src/components/reports/print/print-sections.test.ts
git commit -m "feat(reports): add the print section registry" -m "One place holding each section's paper title, standfirst, and range kind, copied verbatim from the on-screen pages." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Print URL and filename builders

**Files:**
- Create: `src/components/reports/print/print-url.ts`
- Test: `src/components/reports/print/print-url.test.ts`

**Interfaces:**
- Consumes: `PRINT_SECTIONS`, `PrintSectionId` (Task 2); `type Surface` from `src/components/reports/v2/primitives/palette.ts`.
- Produces:
  - `buildPrintUrl(args: { surface: Surface; sectionId: PrintSectionId; accountId?: string; clientName?: string; start?: string; end?: string; year?: number; autoprint?: boolean }): string`
  - `parseHubPrintParams(sp: Record<string, string | string[] | undefined>): { accountId: string; clientName: string; start: string; end: string; year: number | null; autoprint: boolean }`
  - `parsePortalPrintParams(sp: Record<string, string | string[] | undefined>): { start: string; end: string; year: number | null; autoprint: boolean }`
  - `buildReportPdfFilename(opts: { clientName?: string; sectionLabel?: string; start?: string; end?: string }): string` — moved verbatim from `export-report-pdf.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/print/print-url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildPrintUrl,
  buildReportPdfFilename,
  parseHubPrintParams,
  parsePortalPrintParams,
} from "./print-url";

describe("buildPrintUrl", () => {
  it("builds a hub range URL with account, client, and dates", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "overview",
        accountId: "154290",
        clientName: "Acme Co",
        start: "2026-07-27",
        end: "2026-08-02",
        autoprint: true,
      }),
    ).toBe(
      "/reports/overview/print?accountId=154290&client=Acme+Co&start=2026-07-27&end=2026-08-02&autoprint=1",
    );
  });

  it("omits dates for a snapshot section", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "inventory",
        accountId: "154290",
        start: "2026-07-27",
        end: "2026-08-02",
      }),
    ).toBe("/reports/inventory/print?accountId=154290");
  });

  it("sends a year instead of dates for subscribe-save", () => {
    expect(
      buildPrintUrl({
        surface: "hub",
        sectionId: "subscribe-save",
        accountId: "154290",
        year: 2026,
      }),
    ).toBe("/reports/subscribe-save/print?accountId=154290&year=2026");
  });

  /* The security requirement, pinned: a portal print URL must never be able to
     name a client or an Intentwise account. Identity is resolved from the
     session inside PortalPrintPage. */
  it("never puts accountId or client in a portal URL, even when passed", () => {
    const url = buildPrintUrl({
      surface: "portal",
      sectionId: "overview",
      accountId: "154290",
      clientName: "Acme Co",
      start: "2026-07-27",
      end: "2026-08-02",
      autoprint: true,
    });
    expect(url).toBe(
      "/portal/reports/overview/print?start=2026-07-27&end=2026-08-02&autoprint=1",
    );
    expect(url).not.toContain("154290");
    expect(url).not.toContain("Acme");
  });

  it("leaves autoprint off unless asked", () => {
    expect(
      buildPrintUrl({ surface: "portal", sectionId: "inventory" }),
    ).toBe("/portal/reports/inventory/print");
  });
});

describe("parseHubPrintParams", () => {
  it("reads every hub param", () => {
    expect(
      parseHubPrintParams({
        accountId: "154290",
        client: "Acme Co",
        start: "2026-07-27",
        end: "2026-08-02",
        year: "2026",
        autoprint: "1",
      }),
    ).toEqual({
      accountId: "154290",
      clientName: "Acme Co",
      start: "2026-07-27",
      end: "2026-08-02",
      year: 2026,
      autoprint: true,
    });
  });

  it("defaults everything absent to empty, not undefined", () => {
    expect(parseHubPrintParams({})).toEqual({
      accountId: "",
      clientName: "",
      start: "",
      end: "",
      year: null,
      autoprint: false,
    });
  });

  it("takes the first value of a repeated param", () => {
    expect(parseHubPrintParams({ accountId: ["154290", "999"] }).accountId).toBe("154290");
  });

  it("rejects a non-numeric year", () => {
    expect(parseHubPrintParams({ year: "not-a-year" }).year).toBeNull();
  });
});

describe("parsePortalPrintParams", () => {
  /* The same requirement from the reading side: even a hand-edited URL carrying
     accountId and client yields neither. */
  it("drops accountId and client entirely", () => {
    const parsed = parsePortalPrintParams({
      accountId: "999999",
      client: "SomeOtherClient",
      start: "2026-07-27",
      end: "2026-08-02",
    });
    expect(parsed).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
      year: null,
      autoprint: false,
    });
    expect(Object.keys(parsed)).not.toContain("accountId");
    expect(Object.keys(parsed)).not.toContain("clientName");
  });
});

describe("buildReportPdfFilename", () => {
  it("builds a filesystem-safe name from client, section, and range", () => {
    expect(
      buildReportPdfFilename({
        clientName: "Dr. Cuddles",
        sectionLabel: "Performance Overview",
        start: "2026-07-27",
        end: "2026-08-02",
      }),
    ).toBe("Dr.-Cuddles_Performance-Overview_2026-07-27_2026-08-02");
  });

  it("falls back when fields are missing", () => {
    expect(buildReportPdfFilename({})).toBe("report");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/print/print-url.test.ts`
Expected: FAIL — cannot resolve `./print-url`.

- [ ] **Step 3: Write the implementation**

Create `src/components/reports/print/print-url.ts`:

```ts
import type { Surface } from "@/components/reports/v2/primitives/palette";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";

/** Which params a print URL carries is decided by the section's range kind, so
 *  a snapshot section can never be handed a stale date range. */
export function buildPrintUrl({
  surface,
  sectionId,
  accountId,
  clientName,
  start,
  end,
  year,
  autoprint = false,
}: {
  surface: Surface;
  sectionId: PrintSectionId;
  accountId?: string;
  clientName?: string;
  start?: string;
  end?: string;
  year?: number;
  autoprint?: boolean;
}): string {
  const base =
    surface === "portal"
      ? `/portal/reports/${sectionId}/print`
      : `/reports/${sectionId}/print`;
  const params = new URLSearchParams();

  // Identity is a HUB-ONLY param. The portal resolves its client from the
  // session inside PortalPrintPage, so emitting either of these on a portal URL
  // would create exactly the cross-client leak the spec forbids.
  if (surface !== "portal") {
    if (accountId) params.set("accountId", accountId);
    if (clientName) params.set("client", clientName);
  }

  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  } else if (rangeKind === "year" && year) {
    params.set("year", String(year));
  }

  if (autoprint) params.set("autoprint", "1");

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function numberOrNull(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  return Number(value);
}

export interface HubPrintParams {
  accountId: string;
  clientName: string;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
}

export function parseHubPrintParams(sp: RawParams): HubPrintParams {
  return {
    accountId: one(sp.accountId),
    clientName: one(sp.client),
    start: one(sp.start),
    end: one(sp.end),
    year: numberOrNull(one(sp.year)),
    autoprint: one(sp.autoprint) === "1",
  };
}

export interface PortalPrintParams {
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
}

/** Deliberately narrower than parseHubPrintParams: it cannot return an
 *  accountId or a client name, so no portal print page can accidentally trust
 *  one. Keep these two parsers separate — merging them and "just not reading"
 *  the identity fields is the regression this shape prevents. */
export function parsePortalPrintParams(sp: RawParams): PortalPrintParams {
  return {
    start: one(sp.start),
    end: one(sp.end),
    year: numberOrNull(one(sp.year)),
    autoprint: one(sp.autoprint) === "1",
  };
}

/* ── Saved-file name ──────────────────────────────────────────────────────
   Moved verbatim from export-report-pdf.ts (deleted in Task 13). It drives the
   browser's default Save-as-PDF name via document.title, which PrintDocument
   sets on the print page. */

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildReportPdfFilename(opts: {
  clientName?: string;
  sectionLabel?: string;
  start?: string;
  end?: string;
}): string {
  const parts = [
    opts.clientName ? slugPart(opts.clientName) : null,
    opts.sectionLabel ? slugPart(opts.sectionLabel) : "report",
    opts.start && opts.end ? `${opts.start}_${opts.end}` : null,
  ].filter(Boolean);
  return parts.join("_") || "report";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/reports/print/print-url.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

```bash
git add src/components/reports/print/print-url.ts src/components/reports/print/print-url.test.ts
git commit -m "feat(reports): add print URL and filename builders" -m "Range kind decides the params. The portal builder and parser structurally cannot carry accountId or client, so identity stays session-resolved." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The paper shell — `print.css` + `PrintDocument`

**Files:**
- Create: `src/components/reports/print/print.css`, `src/components/reports/print/print-document.tsx`
- Test: `src/components/reports/print/print-document.test.tsx`, `src/components/reports/print/no-hub-orange.print.test.ts`

**Interfaces:**
- Consumes: `PRINT_SECTIONS`, `PrintSectionId` (Task 2); `buildReportPdfFilename` (Task 3); `getSurfacePalette`, `Surface` (`src/components/reports/v2/primitives/palette.ts`).
- Produces: `PrintDocument({ surface, sectionId, clientName, rangeLabel, generatedAt, children }): JSX.Element` — wraps children in `div.mf-paper` and renders the cover block. `rangeLabel` is a pre-formatted display string (e.g. `"2026-07-27 – 2026-08-02"`, `"Current snapshot"`, `"2026"`); `generatedAt` is a `YYYY-MM-DD` string.

- [ ] **Step 1: Write the failing tests**

Create `src/components/reports/print/print-document.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrintDocument } from "./print-document";

describe("PrintDocument", () => {
  it("renders the cover block fields", () => {
    render(
      <PrintDocument
        surface="hub"
        sectionId="overview"
        clientName="Acme Co"
        rangeLabel="2026-07-27 – 2026-08-02"
        generatedAt="2026-08-11"
      >
        <div>body</div>
      </PrintDocument>,
    );
    expect(screen.getByText("MARKETFOUNDRY")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Performance overview" })).toBeInTheDocument();
    expect(screen.getByText("2026-07-27 – 2026-08-02")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-11/)).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the section standfirst from the registry", () => {
    render(
      <PrintDocument surface="hub" sectionId="inventory" clientName="Acme Co" rangeLabel="Current snapshot" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    expect(screen.getByText(/Stock levels, availability and inventory health/)).toBeInTheDocument();
  });

  it("puts the paper canvas at the printable width in both media", () => {
    const { container } = render(
      <PrintDocument surface="hub" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    // The class is the contract; print.css owns the 261mm value and must never
    // make it media-dependent (see the plan's paper-geometry invariant).
    expect(container.querySelector(".mf-paper")).not.toBeNull();
  });

  it("accents hub with mf-orange and portal with the portal token", () => {
    const hub = render(
      <PrintDocument surface="hub" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    const hubRule = hub.container.querySelector("[data-print-accent]") as HTMLElement;
    expect(hubRule.style.background).toContain("--mf-orange");
    hub.unmount();

    const portal = render(
      <PrintDocument surface="portal" sectionId="overview" clientName="A" rangeLabel="r" generatedAt="2026-08-11">
        <div />
      </PrintDocument>,
    );
    const portalRule = portal.container.querySelector("[data-print-accent]") as HTMLElement;
    expect(portalRule.style.background).toContain("--portal-accent");
    expect(portalRule.style.background).not.toContain("--mf-orange");
  });

  it("sets document.title to the saved-file name", () => {
    render(
      <PrintDocument surface="hub" sectionId="overview" clientName="Acme Co" rangeLabel="r" generatedAt="2026-08-11" start="2026-07-27" end="2026-08-02">
        <div />
      </PrintDocument>,
    );
    expect(document.title).toBe("Acme-Co_Performance-Overview_2026-07-27_2026-08-02");
  });
});
```

Create `src/components/reports/print/no-hub-orange.print.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The existing guard (src/components/reports/v2/no-hub-orange.test.ts) reads
 *  only the v2 directory, non-recursively, so nothing covered the print layer.
 *  The print layer renders on BOTH surfaces from the same components, which is
 *  exactly where a hardcoded hub orange would leak onto a client's PDF. */
const PRINT_DIR = join(process.cwd(), "src/components/reports/print");

function printFiles(): string[] {
  return readdirSync(PRINT_DIR).filter(
    (f) => (f.endsWith(".tsx") || f.endsWith(".ts") || f.endsWith(".css")) && !f.includes(".test."),
  );
}

describe("the print layer and the dual-accent rule", () => {
  it("scans a plausible number of print-layer files", () => {
    expect(printFiles().length).toBeGreaterThan(4);
  });

  it.each(printFiles())("%s contains no hardcoded hub orange", (file) => {
    expect(readFileSync(join(PRINT_DIR, file), "utf8").toLowerCase()).not.toContain("ff751f");
  });

  it.each(printFiles())("%s never inlines a bare text-brand class", (file) => {
    expect(readFileSync(join(PRINT_DIR, file), "utf8")).not.toContain("text-brand");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/reports/print/print-document.test.tsx src/components/reports/print/no-hub-orange.print.test.ts`
Expected: FAIL — cannot resolve `./print-document`; the orange guard fails its plausible-count assertion.

- [ ] **Step 3: Write `print.css`**

Create `src/components/reports/print/print.css`:

```css
/* ============================================================
   MF paper document — A4 landscape, 14mm/18mm margins.
   Matches src/components/monthly-report/styles/report.css:834-846.
   Colours come from the app's --mf-* tokens (src/app/globals.css);
   this file defines none of its own.
   ============================================================ */

@page {
  size: A4 landscape;
  margin: 14mm 18mm;
}

/* The printable content box: 297mm − 2×18mm = 261mm.
   ⚠️ LOAD-BEARING: this width must be IDENTICAL on screen and on paper.
   Recharts' ResponsiveContainer measures its parent once, on screen, and does
   not re-measure when Chrome re-runs layout for the page box. A media-dependent
   width here reintroduces the exact chart-sizing bug this feature fixes.
   Never wrap it in @media print, and never set it to auto. */
.mf-paper {
  width: 261mm;
  margin: 0 auto;
  background: var(--mf-white);
  color: var(--mf-ink);
  font-family: var(--font-outfit), system-ui, sans-serif;
  font-size: 11px;
  line-height: 1.5;
}

/* Sections sized for a viewport must not reserve a viewport on paper.
   PerformanceOverviewV2 drops its own wrapper under printMode; this covers any
   nested min-h-screen inside the five other sections. */
.mf-paper .min-h-screen {
  min-height: 0 !important;
}

/* Every v2 card reaches paper through Surface, which carries data-report-card. */
.mf-paper [data-report-card] {
  box-shadow: none !important;
  border-color: var(--mf-line);
  break-inside: avoid;
  page-break-inside: avoid;
}

.mf-paper table thead {
  display: table-header-group;
}
.mf-paper tr,
.mf-paper img,
.mf-paper svg {
  break-inside: avoid;
  page-break-inside: avoid;
}
.mf-paper h1,
.mf-paper h2,
.mf-paper h3 {
  break-after: avoid;
  page-break-after: avoid;
}

/* One report sub-section per page where a section component uses <section>,
   the same rule the monthly report applies. Harmless where absent. */
.mf-paper section + section {
  break-before: page;
  page-break-before: always;
}

/* ── Cover block ─────────────────────────────────────────── */
.mf-cover {
  border-bottom: 1px solid var(--mf-line);
  padding-bottom: 10mm;
  margin-bottom: 8mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

@media print {
  html,
  body {
    background: var(--mf-white) !important;
    margin: 0;
    padding: 0;
  }
  /* Designed document: the orange hero fills and status tints are content, not
     decoration, so keep them exactly as rendered. */
  .mf-paper,
  .mf-paper * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .mf-no-print {
    display: none !important;
  }
}
```

- [ ] **Step 4: Write `PrintDocument`**

Create `src/components/reports/print/print-document.tsx`:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { getSurfacePalette, type Surface } from "@/components/reports/v2/primitives/palette";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { buildReportPdfFilename } from "./print-url";
import "./print.css";

/** The paper shell. Renders the MF cover block and a fixed-width canvas, then
 *  the section component itself as children. `surface` drives ONLY the accent —
 *  hub orange, portal charcoal blue — the same rule ReportsControlsBar follows. */
export function PrintDocument({
  surface,
  sectionId,
  clientName,
  rangeLabel,
  generatedAt,
  start,
  end,
  children,
}: {
  surface: Surface;
  sectionId: PrintSectionId;
  clientName: string;
  /** Pre-formatted for display: "2026-07-27 – 2026-08-02", "Current snapshot", "2026". */
  rangeLabel: string;
  /** YYYY-MM-DD. */
  generatedAt: string;
  /** Only for the saved-file name; the visible range is rangeLabel. */
  start?: string;
  end?: string;
  children: ReactNode;
}) {
  const meta = PRINT_SECTIONS[sectionId];
  const palette = getSurfacePalette(surface);

  // The browser's default Save-as-PDF name comes from document.title.
  useEffect(() => {
    const prev = document.title;
    document.title = buildReportPdfFilename({
      clientName,
      sectionLabel: meta.label,
      start,
      end,
    });
    return () => {
      document.title = prev;
    };
  }, [clientName, meta.label, start, end]);

  return (
    <div className="mf-paper">
      <header className="mf-cover">
        <div
          data-print-accent
          className="mb-4 h-[3px] w-[46mm]"
          style={{ background: palette.accent }}
        />
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-mf-muted">
              MARKETFOUNDRY
            </div>
            <div className="mt-2 text-[22px] font-bold leading-none tracking-tight text-mf-ink">
              {clientName}
            </div>
          </div>
          <div className="text-right text-[10px] font-bold uppercase tracking-[0.11em] text-mf-muted">
            <div>{rangeLabel}</div>
            <div className="mt-1 font-normal normal-case tracking-normal">
              Generated {generatedAt}
            </div>
          </div>
        </div>
        <h1 className="mt-6 m-0 text-[30px] font-bold uppercase leading-none tracking-tighter text-mf-ink">
          {meta.title}
        </h1>
        <p className="mt-2 max-w-[180mm] text-[11px] text-mf-muted">{meta.blurb}</p>
      </header>
      {children}
    </div>
  );
}
```

Note on the `<h1>`: `uppercase` implements DESIGN.md's "Headline = Outfit Bold ALL CAPS" rule, which the paper document is a clean surface to honour (the app's own headers are still mixed-case pending a separate rollout). `screen.getByRole("heading", { name: "Performance overview" })` still matches because `text-transform` is presentational and does not change the accessible name.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/components/reports/print/`
Expected: PASS — 5 PrintDocument tests, plus the orange guard's 3 groups.

- [ ] **Step 6: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

```bash
git add src/components/reports/print/print.css src/components/reports/print/print-document.tsx src/components/reports/print/print-document.test.tsx src/components/reports/print/no-hub-orange.print.test.ts
git commit -m "feat(reports): add the MF paper shell for print documents" -m "Fixed 261mm canvas so Recharts measures the same width on screen and on paper. Extends the dual-accent guard to the print layer, which the v2 guard never covered." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Readiness sentinel and auto-print

**Files:**
- Create: `src/components/reports/print/print-ready.tsx`, `src/components/reports/print/auto-print.tsx`
- Test: `src/components/reports/print/print-ready.test.tsx`, `src/components/reports/print/auto-print.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `PrintReady({ timeoutMs? }): JSX.Element | null` — renders `<div data-report-ready="true" />` once no `.animate-pulse` element remains in the document, or on timeout. `AutoPrint({ settleMs?, fallbackMs? }): null` — calls `window.print()` once, after the sentinel appears.

- [ ] **Step 1: Write the failing tests**

Create `src/components/reports/print/print-ready.test.tsx`:

```tsx
import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrintReady } from "./print-ready";

/** The whole readiness mechanism rests on one observed fact: every v2 section
 *  renders its loading state as a div carrying `animate-pulse`. These tests are
 *  the tripwire for that assumption. */
describe("PrintReady", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("withholds the sentinel while a skeleton is still pulsing", () => {
    const skeleton = document.createElement("div");
    skeleton.className = "h-64 animate-pulse rounded-[18px]";
    document.body.appendChild(skeleton);

    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();
  });

  it("emits the sentinel once the skeletons are gone", () => {
    const skeleton = document.createElement("div");
    skeleton.className = "animate-pulse";
    document.body.appendChild(skeleton);

    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();

    skeleton.remove();
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });

  it("emits immediately when nothing was ever pulsing", () => {
    const { container } = render(<PrintReady />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });

  it("gives up and emits after the timeout so a stuck fetch still prints", () => {
    const stuck = document.createElement("div");
    stuck.className = "animate-pulse";
    document.body.appendChild(stuck);

    const { container } = render(<PrintReady timeoutMs={3_000} />);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).toBeNull();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector("[data-report-ready]")).not.toBeNull();
  });
});
```

Create `src/components/reports/print/auto-print.test.tsx`:

```tsx
import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutoPrint } from "./auto-print";

describe("AutoPrint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("print", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("prints once the sentinel is already present", () => {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("data-report-ready", "true");
    document.body.appendChild(sentinel);

    render(<AutoPrint />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("waits for the sentinel to appear, then prints exactly once", async () => {
    render(<AutoPrint />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).not.toHaveBeenCalled();

    await act(async () => {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("data-report-ready", "true");
      document.body.appendChild(sentinel);
    });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(window.print).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("prints anyway after the fallback when the sentinel never appears", () => {
    render(<AutoPrint fallbackMs={5_000} />);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(window.print).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/reports/print/print-ready.test.tsx src/components/reports/print/auto-print.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `PrintReady`**

Create `src/components/reports/print/print-ready.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

/** Emits the [data-report-ready] sentinel a print consumer waits on.
 *
 *  Readiness is detected generically: every v2 section renders its loading state
 *  as an element carrying Tailwind's `animate-pulse`, so "no pulse anywhere"
 *  means every fetch on the page has settled. This needs no per-section wiring
 *  and works identically for all six sections. It queries the CLASS, not the
 *  running animation, so prefers-reduced-motion cannot affect it.
 *
 *  The timeout is deliberate: a stuck Redshift query must still yield a printable
 *  document rather than a page that never prints. */
export function PrintReady({ timeoutMs = 20_000 }: { timeoutMs?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const deadline = Date.now() + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const pending = document.querySelectorAll(".animate-pulse").length;
      if (pending === 0 || Date.now() >= deadline) {
        setReady(true);
        return;
      }
      timer = setTimeout(tick, 250);
    };
    timer = setTimeout(tick, 250);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ready, timeoutMs]);

  return ready ? <div data-report-ready="true" /> : null;
}
```

- [ ] **Step 4: Write `AutoPrint`**

Create `src/components/reports/print/auto-print.tsx`:

```tsx
"use client";
import { useEffect } from "react";

/** Generalised from src/app/reports/monthly/print/AutoPrint.tsx. That version
 *  fired on a flat 800ms timer whether or not data had arrived; this one waits
 *  for the [data-report-ready] sentinel and keeps a hard fallback so a stuck
 *  page still prints. */
export function AutoPrint({
  settleMs = 400,
  fallbackMs = 25_000,
}: {
  settleMs?: number;
  fallbackMs?: number;
}) {
  useEffect(() => {
    let printed = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      if (printed) return;
      printed = true;
      window.print();
    };
    // Let fonts, images and chart SVGs settle before the dialog opens.
    const fireSoon = () => {
      if (settle) return;
      settle = setTimeout(fire, settleMs);
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector("[data-report-ready]")) {
        observer.disconnect();
        fireSoon();
      }
    });

    if (document.querySelector("[data-report-ready]")) {
      fireSoon();
    } else {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const fallback = setTimeout(() => {
      observer.disconnect();
      fire();
    }, fallbackMs);

    return () => {
      observer.disconnect();
      if (settle) clearTimeout(settle);
      clearTimeout(fallback);
    };
  }, [settleMs, fallbackMs]);

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/components/reports/print/print-ready.test.tsx src/components/reports/print/auto-print.test.tsx`
Expected: PASS — 4 + 3 tests.

- [ ] **Step 6: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

```bash
git add src/components/reports/print/print-ready.tsx src/components/reports/print/auto-print.tsx src/components/reports/print/print-ready.test.tsx src/components/reports/print/auto-print.test.tsx
git commit -m "feat(reports): add print readiness sentinel and auto-print" -m "Readiness is the absence of animate-pulse skeletons, which every v2 section already renders, so no section component needs print wiring." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `data-report-card` on `Surface`

**Files:**
- Modify: `src/components/reports/v2/primitives/surface.tsx:16-19`
- Test: `src/components/reports/v2/primitives/surface.test.tsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: every `Surface` root element carries `data-report-card`, which `print.css`'s `break-inside: avoid` and shadow-removal rules target.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/primitives/surface.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Surface } from "./surface";

/** Surface is the single wrapper every v2 card passes through, so one stable
 *  hook on it is what lets print.css avoid breaking cards across page
 *  boundaries in all six sections. Matching on Tailwind classes instead would
 *  break the moment a card's styling changed. */
describe("Surface", () => {
  it("marks its root as a report card", () => {
    const { container } = render(<Surface><div>body</div></Surface>);
    expect(container.firstElementChild?.getAttribute("data-report-card")).toBe("true");
  });

  it("keeps the hook when a title and tools are present", () => {
    const { container } = render(
      <Surface title="Spend" tools={<button>csv</button>}><div>body</div></Surface>,
    );
    expect(container.querySelectorAll("[data-report-card]").length).toBe(1);
  });

  it("still applies caller classes alongside the hook", () => {
    const { container } = render(<Surface className="col-span-6"><div /></Surface>);
    expect(container.firstElementChild?.className).toContain("col-span-6");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/v2/primitives/surface.test.tsx`
Expected: FAIL — `expected null to be "true"`.

- [ ] **Step 3: Add the attribute**

In `src/components/reports/v2/primitives/surface.tsx`, change the root element (lines 16-19) from:

```tsx
    <div
      className={`overflow-hidden rounded-[18px] border border-mf-line bg-white shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${className}`}
    >
```

to:

```tsx
    <div
      /* Stable hook for print.css: break-inside: avoid + shadow removal. Do not
         replace with a class match — card styling changes, this contract does not. */
      data-report-card="true"
      className={`overflow-hidden rounded-[18px] border border-mf-line bg-white shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${className}`}
    >
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/reports/v2/primitives/surface.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full v2 suite for regressions, then typecheck**

Run: `npm run test -- src/components/reports/v2/`
Expected: PASS. Predict before running: the v2 directory's existing suites (`no-hub-orange`, `export-report-pdf`, `keywords-gaps-v2`, `period-comparative-section`, `portal-report-access`, `share-of-voice-section`, `subscribe-save-section`, `reports-controls-bar.client-select`, plus the `primitives/` suites) must all still pass; no count should drop.
Run: `node_modules/.bin/tsc --noEmit` — baseline only.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/v2/primitives/surface.tsx src/components/reports/v2/primitives/surface.test.tsx
git commit -m "feat(reports): add a data-report-card hook to Surface" -m "One attribute on the single card wrapper lets print CSS keep cards whole across page breaks in all six sections." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Shell removal — reorder `layout-router.tsx`

**Files:**
- Modify: `src/components/layout/layout-router.tsx:9-29`
- Test: `src/components/layout/layout-router.test.tsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `LayoutRouter` returns bare `children` for any path matching `/reports/*/print` or `/portal/reports/*/print`, **before** the `/portal` branch runs.

**Why this task exists:** the `/portal` branch at `:13` returns `PortalShell` and runs **before** the print exclusion at `:26`. Left as-is, every portal print route would render inside the portal shell and reproduce the exact bug this feature fixes.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/layout-router.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/** Mocked because the real shells pull in NextAuth, react-query and Radix; this
 *  test is about ONE thing — which branch a pathname takes. */
const pathname = { current: "/" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/components/layout/top-nav", () => ({ TopNav: () => <div data-testid="top-nav" /> }));
vi.mock("@/components/layout/portal-shell", () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-shell">{children}</div>
  ),
}));
vi.mock("@/components/layout/command-palette", () => ({ CommandPalette: () => null }));

const { LayoutRouter } = await import("./layout-router");

function renderAt(path: string) {
  pathname.current = path;
  return render(<LayoutRouter><div data-testid="page" /></LayoutRouter>);
}

describe("LayoutRouter", () => {
  it("gives hub print routes no chrome", () => {
    const { queryByTestId } = renderAt("/reports/overview/print");
    expect(queryByTestId("page")).not.toBeNull();
    expect(queryByTestId("top-nav")).toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
  });

  /* The load-bearing case: the /portal branch used to win. */
  it("gives PORTAL print routes no chrome either", () => {
    const { queryByTestId } = renderAt("/portal/reports/overview/print");
    expect(queryByTestId("page")).not.toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
    expect(queryByTestId("top-nav")).toBeNull();
  });

  it("keeps the existing monthly print exclusion", () => {
    const { queryByTestId } = renderAt("/reports/monthly/print");
    expect(queryByTestId("top-nav")).toBeNull();
  });

  it("still wraps ordinary portal pages in the portal shell", () => {
    const { queryByTestId } = renderAt("/portal/reports/overview");
    expect(queryByTestId("portal-shell")).not.toBeNull();
  });

  it("still wraps ordinary hub pages in the top nav", () => {
    const { queryByTestId } = renderAt("/reports/overview");
    expect(queryByTestId("top-nav")).not.toBeNull();
    expect(queryByTestId("portal-shell")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/layout/layout-router.test.tsx`
Expected: FAIL on "gives PORTAL print routes no chrome either" — `portal-shell` is found.

- [ ] **Step 3: Reorder the branches**

In `src/components/layout/layout-router.tsx`, replace lines 12-29 (the `/portal` branch and the chrome-less branch) with:

```tsx
  /* Print/PDF pages get NO chrome — and this must be tested BEFORE the /portal
     branch below. A portal print route matches both, and if the portal branch
     won it would render the paper document inside PortalShell, which is the very
     bug the print routes exist to fix. */
  const isReportPrintRoute =
    /^\/(portal\/)?reports\/[^/]+\/print(\/|$)/.test(pathname ?? "");

  if (
    isReportPrintRoute ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/calculator") ||
    pathname.startsWith("/status")
  ) {
    return <>{children}</>;
  }

  // Portal routes get a clean client-facing layout
  if (pathname.startsWith("/portal")) {
    return (
      <Suspense>
        <PortalShell>{children}</PortalShell>
      </Suspense>
    );
  }
```

The regex subsumes the old literal `pathname.startsWith("/reports/monthly/print")`, which is why that string no longer appears; the third test above pins that it still works.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/layout/layout-router.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck, then commit**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

```bash
git add src/components/layout/layout-router.tsx src/components/layout/layout-router.test.tsx
git commit -m "fix(layout): exclude report print routes before the portal branch" -m "The /portal branch ran first, so a portal print route would have rendered the paper document inside PortalShell. Generalises the monthly-print literal to any /reports/*/print path on either surface." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Hub overview print route

**Files:**
- Create: `src/components/reports/print/section-renderers.tsx`, `src/components/reports/print/hub-print-page.tsx`, `src/app/reports/overview/print/page.tsx`
- Modify: `src/components/reports/v2/performance-overview-v2.tsx:24-107`
- Test: `src/components/reports/print/hub-print-page.test.tsx` (create)

**Interfaces:**
- Consumes: `PRINT_SECTIONS`, `PrintSectionId` (Task 2); `parseHubPrintParams` (Task 3); `PrintDocument` (Task 4); `PrintReady`, `AutoPrint` (Task 5); `formatDate` from `@/lib/report-date-range`.
- Produces:
  - `SECTION_RENDERERS: Record<PrintSectionId, (a: { surface: Surface; accountId: string; start: string; end: string }) => ReactNode>` — Task 11/12 add the remaining five entries.
  - `rangeLabelFor(sectionId, { start, end, year }): string`
  - `HubPrintPage({ sectionId, accountId, clientName, start, end, year, autoprint, generatedAt }): JSX.Element`
  - `PerformanceOverviewV2` gains `printMode?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/print/hub-print-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("./section-renderers", () => ({
  SECTION_RENDERERS: {
    overview: () => <div data-testid="section" />,
    "advertising-audit": () => null,
    inventory: () => <div data-testid="section" />,
    "period-comparative": () => null,
    "share-of-voice": () => null,
    "subscribe-save": () => <div data-testid="section" />,
  },
}));

const { HubPrintPage } = await import("./hub-print-page");

const base = { clientName: "Acme Co", generatedAt: "2026-08-11", autoprint: false, year: null };

describe("HubPrintPage", () => {
  it("renders the paper document when the params are complete", () => {
    render(<HubPrintPage sectionId="overview" accountId="154290" start="2026-07-27" end="2026-08-02" {...base} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Performance overview" })).toBeInTheDocument();
    expect(screen.getByText("2026-07-27 – 2026-08-02")).toBeInTheDocument();
  });

  it("refuses to render a document without an accountId", () => {
    render(<HubPrintPage sectionId="overview" accountId="" start="2026-07-27" end="2026-08-02" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
    expect(screen.queryByTestId("section")).toBeNull();
  });

  it("refuses to render a range section without dates", () => {
    render(<HubPrintPage sectionId="overview" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
  });

  it("needs no dates for a snapshot section", () => {
    render(<HubPrintPage sectionId="inventory" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("Current snapshot")).toBeInTheDocument();
  });

  it("derives the year range for subscribe-save", () => {
    render(<HubPrintPage sectionId="subscribe-save" accountId="154290" start="" end="" {...base} year={2026} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("refuses a year section with no year", () => {
    render(<HubPrintPage sectionId="subscribe-save" accountId="154290" start="" end="" {...base} />);
    expect(screen.getByText(/Missing report parameters/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/print/hub-print-page.test.tsx`
Expected: FAIL — cannot resolve `./hub-print-page`.

- [ ] **Step 3: Add `printMode` to `PerformanceOverviewV2`**

In `src/components/reports/v2/performance-overview-v2.tsx`, add the prop to the signature (after `refreshKey`):

```tsx
  refreshKey,
  printMode = false,
}: {
  surface: SurfaceKind;
  accountId?: string;
  start?: string;
  end?: string;
  refreshKey?: number;
  /** Print routes supply their own paper shell and cover block, so the page
   *  chrome this component normally renders (viewport canvas, H1, standfirst)
   *  would duplicate it. Mirrors monthly-report/Report.tsx's printMode. */
  printMode?: boolean;
}) {
```

Then replace the `return (` block at lines 84-106 with:

```tsx
  const body = visibleSections.map((s) => (
    <section key={s.id} aria-labelledby={`${s.id}-title`} className={printMode ? "mt-6" : "mt-10"}>
      <div className={`mb-3.5 ${headingText}`}>
        <h2 id={`${s.id}-title`} className={`m-0 text-[18px] font-bold tracking-tight ${palette.eyebrowClass}`}>{s.title}</h2>
      </div>
      {sectionContent[s.id] ?? (
        <Surface><div className="p-[18px] text-mf-muted">{s.blurb}</div></Surface>
      )}
    </section>
  ));

  if (printMode) return <>{body}</>;

  return (
    <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
      <main className="mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
        <div className={`mb-5 flex items-end justify-between gap-6 ${headingText}`}>
          <div>
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">Performance overview</h1>
            <p className={`mt-2.5 max-w-[760px] ${subText}`}>An executive-first reporting layout that separates headline performance, diagnostics, and detailed analysis.</p>
          </div>
        </div>
        {body}
      </main>
    </div>
  );
```

- [ ] **Step 4: Write `section-renderers.tsx`**

Create `src/components/reports/print/section-renderers.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import type { Surface } from "@/components/reports/v2/primitives/palette";
import { PerformanceOverviewV2 } from "@/components/reports/v2/performance-overview-v2";
import type { PrintSectionId } from "./print-sections";

export interface SectionRenderArgs {
  surface: Surface;
  accountId: string;
  /** Empty for snapshot sections; the year-derived bounds for subscribe-save. */
  start: string;
  end: string;
}

/** The one file that knows each section component's prop shape. `refreshKey` is
 *  always 0: a print document is a one-shot render, never manually refreshed.
 *
 *  Tasks 11 and 12 fill in the remaining five entries. Until then their routes
 *  do not exist, so the registry gap is unreachable rather than broken. */
export const SECTION_RENDERERS: Partial<
  Record<PrintSectionId, (a: SectionRenderArgs) => ReactNode>
> = {
  overview: ({ surface, accountId, start, end }) => (
    <PerformanceOverviewV2
      surface={surface}
      accountId={accountId}
      start={start}
      end={end}
      refreshKey={0}
      printMode
    />
  ),
};
```

- [ ] **Step 5: Write `hub-print-page.tsx`**

Create `src/components/reports/print/hub-print-page.tsx`:

```tsx
"use client";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { PrintDocument } from "./print-document";
import { PrintReady } from "./print-ready";
import { AutoPrint } from "./auto-print";
import { SECTION_RENDERERS } from "./section-renderers";

/** Display string for the cover block's range slot. */
export function rangeLabelFor(
  sectionId: PrintSectionId,
  { start, end, year }: { start: string; end: string; year: number | null },
): string {
  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "snapshot") return "Current snapshot";
  if (rangeKind === "year") return year ? String(year) : "";
  return start && end ? `${start} – ${end}` : "";
}

/** True when the URL lacks something the section cannot render without. */
export function hasRequiredParams(
  sectionId: PrintSectionId,
  { accountId, start, end, year }: { accountId: string; start: string; end: string; year: number | null },
): boolean {
  if (!accountId) return false;
  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range") return Boolean(start && end);
  if (rangeKind === "year") return year !== null;
  return true;
}

export function PrintMissingParams() {
  return (
    <div className="mf-paper p-10 text-[13px] text-mf-ink">
      Missing report parameters. Open this report from the PDF button on the report page.
    </div>
  );
}

/** The hub half of the print layer. All twelve route files are 4-line delegates
 *  to this or PortalPrintPage. */
export function HubPrintPage({
  sectionId,
  accountId,
  clientName,
  start,
  end,
  year,
  autoprint,
  generatedAt,
}: {
  sectionId: PrintSectionId;
  accountId: string;
  clientName: string;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
  /** YYYY-MM-DD, computed server-side by the route. */
  generatedAt: string;
}) {
  if (!hasRequiredParams(sectionId, { accountId, start, end, year })) {
    return <PrintMissingParams />;
  }

  // Subscribe & Save is keyed by year on screen too (page.tsx derives the same
  // bounds), so the print route reproduces that derivation rather than
  // inventing a second convention.
  const resolvedStart = PRINT_SECTIONS[sectionId].rangeKind === "year" ? `${year}-01-01` : start;
  const resolvedEnd = PRINT_SECTIONS[sectionId].rangeKind === "year" ? `${year}-12-31` : end;
  const render = SECTION_RENDERERS[sectionId];

  return (
    <PrintDocument
      surface="hub"
      sectionId={sectionId}
      clientName={clientName}
      rangeLabel={rangeLabelFor(sectionId, { start, end, year })}
      generatedAt={generatedAt}
      start={resolvedStart}
      end={resolvedEnd}
    >
      {render?.({ surface: "hub", accountId, start: resolvedStart, end: resolvedEnd })}
      <PrintReady />
      {autoprint && <AutoPrint />}
    </PrintDocument>
  );
}
```

- [ ] **Step 6: Write the route**

Create `src/app/reports/overview/print/page.tsx`:

```tsx
import { HubPrintPage } from "@/components/reports/print/hub-print-page";
import { parseHubPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseHubPrintParams(await searchParams);
  return <HubPrintPage sectionId="overview" {...params} generatedAt={formatDate(new Date())} />;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -- src/components/reports/print/ src/components/reports/v2/`
Expected: PASS. Predict before running: 6 new `HubPrintPage` tests pass, and no existing v2 count drops.

- [ ] **Step 8: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

- [ ] **Step 9: Commit**

```bash
git add src/components/reports/print/section-renderers.tsx src/components/reports/print/hub-print-page.tsx src/components/reports/print/hub-print-page.test.tsx src/app/reports/overview/print/page.tsx src/components/reports/v2/performance-overview-v2.tsx
git commit -m "feat(reports): add the hub overview print route" -m "Routes are server components that parse searchParams and stamp the generated date; the page body is one shared client component. PerformanceOverviewV2 gains printMode so the paper cover block is not duplicated." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 🚦 RISK GATE — prove the chart sizing on paper

**Files:**
- Create: `scripts/_tmp-print-chart-proof.ts` (temporary; deleted in Task 14)

**Interfaces:**
- Consumes: a running dev server on `PORT=3100` and the route from Task 8.
- Produces: a PASS/FAIL verdict plus `scratchpad/overview-hub-print.pdf`. **No later task may start until this passes.**

**What is being proven and why:** Recharts' `ResponsiveContainer` measures its parent via ResizeObserver and does not re-measure when Chrome re-runs layout for the page box. The design bets that a canvas fixed at 261mm in *both* media makes the measurement correct by construction, requiring no changes to any chart component. If that bet is wrong, Phases 3 and 4 change shape and the fallback (threading an explicit pixel width into all 11 `ResponsiveContainer` call sites) has to be planned instead.

- [ ] **Step 1: Start the dev server and capture a real print URL**

Run: `PORT=3100 npm run dev`
Open `http://localhost:3100/reports/overview` in your normal browser, pick a client with data, and note the values the controls resolve to. Build the URL:
`http://localhost:3100/reports/overview/print?accountId=<ID>&client=<Name>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>`
(no `autoprint=1` — the proof script drives printing itself).

- [ ] **Step 2: Authenticate a headless session**

The route is behind `src/proxy.ts`, so an unauthenticated fetch redirects. Use the recipe already proven on this project:

```bash
npx gstack browse cookie-import   # pick the localhost:3100 domain
npx gstack browse state save      # writes <repo>/.gstack/browse-states/<name>.json
```

Verify auth independently by loading `http://localhost:3100/api/auth/session` in the same context and confirming a JSON body with a `user` — not by inspecting cookies.

- [ ] **Step 3: Write the proof script**

Create `scripts/_tmp-print-chart-proof.ts`:

```ts
/* Temporary verification script (Task 9 gate). Deleted in Task 14.
   Measures every Recharts SVG on the hub overview print route in SCREEN media
   and again in PRINT-emulated media, then emits a PDF for the visual check.

   Usage:
     npx tsx scripts/_tmp-print-chart-proof.ts "<print-url>" "<path-to-browse-state.json>"
*/
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// 261mm at 96dpi. Must match .mf-paper's width in print.css.
const PAPER_PX = (261 / 25.4) * 96;

const [url, statePath] = process.argv.slice(2);
if (!url || !statePath) throw new Error("usage: <print-url> <browse-state.json>");

const state = JSON.parse(readFileSync(statePath, "utf8")) as {
  cookies: Parameters<Awaited<ReturnType<typeof puppeteer.launch>>["setCookie"]>[0][];
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  await browser.setCookie(...state.cookies);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 });
  await page.waitForSelector("[data-report-ready]", { timeout: 60_000 });

  const measure = () =>
    page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll("svg.recharts-surface"));
      const nodes = svgs.length ? svgs : Array.from(document.querySelectorAll(".mf-paper svg"));
      return {
        count: nodes.length,
        widths: nodes.map((n) => Math.round(n.getBoundingClientRect().width)),
        paper: Math.round(
          document.querySelector(".mf-paper")?.getBoundingClientRect().width ?? 0,
        ),
        bodyScrollWidth: document.body.scrollWidth,
        cards: document.querySelectorAll("[data-report-card]").length,
      };
    });

  const screen = await measure();
  await page.emulateMediaType("print");
  const print = await measure();

  const pdf = await page.pdf({
    format: "a4",
    landscape: true,
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "18mm", right: "18mm" },
  });
  writeFileSync("scratchpad/overview-hub-print.pdf", pdf);

  const drift = screen.widths.map((w, i) => Math.abs(w - (print.widths[i] ?? 0)));
  const checks = [
    ["charts found", screen.count > 0],
    ["cards found", screen.cards > 0],
    ["no zero-width chart (screen)", screen.widths.every((w) => w > 0)],
    ["no zero-width chart (print)", print.widths.every((w) => w > 0)],
    ["chart count stable across media", screen.count === print.count],
    ["chart widths stable across media (±2px)", drift.every((d) => d <= 2)],
    ["every chart fits the paper box", print.widths.every((w) => w <= PAPER_PX + 2)],
    ["paper canvas at the printable width (±2px)", Math.abs(screen.paper - PAPER_PX) <= 2],
    ["no horizontal page overflow", screen.bodyScrollWidth <= Math.ceil(PAPER_PX) + 2],
  ] as const;

  console.log(JSON.stringify({ PAPER_PX: Math.round(PAPER_PX), screen, print, drift }, null, 2));
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(checks.every(([, ok]) => ok) ? "GATE: PASS" : "GATE: FAIL");
} finally {
  await browser.close();
}
```

- [ ] **Step 4: Run the proof**

Run: `npx tsx scripts/_tmp-print-chart-proof.ts "<print-url>" "<state.json>"`
Expected: every line reads `PASS`, ending `GATE: PASS`.
Judge from the printed check lines, never from an exit code — appending `; echo $?` reports the echo's status, not the script's.

- [ ] **Step 5: Visual check of the PDF**

Open `scratchpad/overview-hub-print.pdf`. Confirm:
1. The cover block (MARKETFOUNDRY wordmark, client name, PERFORMANCE OVERVIEW, range, generated stamp) sits at the top of page 1 with the accent rule in **hub orange**.
2. No card is sliced across a page boundary.
3. No chart is clipped at the right edge or squeezed to a sliver.
4. No app chrome (top nav, ambient background, glass panel) anywhere.

- [ ] **Step 6: Delete the plaintext browse state**

Run: `git status --porcelain .gstack/` and remove the saved state file with `git clean`-free means: use `Bash` with `mv` into `scratchpad/` and note it, since `rm -f` is hook-blocked.

- [ ] **Step 7: Record the verdict**

Nothing to commit — the script is temporary and untracked. Write the verdict (PASS/FAIL plus the measured numbers) into the handoff before proceeding.

**If the gate FAILS:** stop. Do not start Task 10. The fallback design is to thread an explicit pixel width into every `ResponsiveContainer` call site (`subscribe-save-section.tsx:153`, `traffic-chart.tsx:42`, `keywords-gaps-v2.tsx:76`, `roas-ranking-chart.tsx:28`, `inventory-section.tsx:307`, `cpc-cvr-chart-v2.tsx:41`, `combined-performance-chart.tsx:68`, `period-comparative-section.tsx:347`, `advertising-audit-section.tsx:193,236,470`, `share-of-voice-section.tsx:116,256`, `primitives/kpi-sparkline.tsx:18`, `spend-roas-scatter.tsx`), which is a materially larger change and needs its own plan.

---

### Task 10: Portal overview print route

**Files:**
- Create: `src/components/reports/print/portal-print-page.tsx`, `src/app/portal/reports/overview/print/page.tsx`
- Test: `src/components/reports/print/portal-print-page.test.tsx`

**Interfaces:**
- Consumes: `usePortalReportControls` (`src/components/reports/v2/use-portal-report-controls.ts`); `parsePortalPrintParams` (Task 3); `PrintDocument` (Task 4); `PrintReady`, `AutoPrint` (Task 5); `SECTION_RENDERERS`, `rangeLabelFor` (Task 8).
- Produces: `PortalPrintPage({ sectionId, start, end, year, autoprint, generatedAt }): JSX.Element`.

**The security contract, restated:** this component takes **no** `accountId` and **no** client name as props. Identity comes from `usePortalReportControls()`, which resolves it through `GET /api/portal/me/client` — that route applies the admin-preview `?client=` override server-side and ignores it for non-admins. Section access comes from the same hook's `canAccessSection()`, the same gate the portal report pages use.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/print/portal-print-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const controls = {
  current: {
    loading: false,
    notFound: false,
    canAccessSection: (_id: string) => true,
    accountId: "154290",
    clientName: "Acme Co",
    clientIdCode: "AC01",
  },
};
vi.mock("@/components/reports/v2/use-portal-report-controls", () => ({
  usePortalReportControls: () => controls.current,
}));
vi.mock("./section-renderers", () => ({
  SECTION_RENDERERS: { overview: () => <div data-testid="section" /> },
}));

const { PortalPrintPage } = await import("./portal-print-page");

const props = {
  sectionId: "overview" as const,
  start: "2026-07-27",
  end: "2026-08-02",
  year: null,
  autoprint: false,
  generatedAt: "2026-08-11",
};

describe("PortalPrintPage", () => {
  beforeEach(() => {
    controls.current = {
      loading: false,
      notFound: false,
      canAccessSection: () => true,
      accountId: "154290",
      clientName: "Acme Co",
      clientIdCode: "AC01",
    };
  });

  it("renders the client's own report using the session-resolved account", () => {
    render(<PortalPrintPage {...props} />);
    expect(screen.getByTestId("section")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  /* The gate a print URL must not be a way around. */
  it("refuses a section the client has no grant for", () => {
    controls.current.canAccessSection = () => false;
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it("renders nothing printable while the client is still resolving", () => {
    controls.current.loading = true;
    const { container } = render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(container.querySelector("[data-report-ready]")).toBeNull();
  });

  it("refuses when no client row resolves", () => {
    controls.current.notFound = true;
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
  });

  it("explains a client with no Intentwise account instead of printing an empty document", () => {
    controls.current.accountId = "";
    render(<PortalPrintPage {...props} />);
    expect(screen.queryByTestId("section")).toBeNull();
    expect(screen.getByText(/no analytics account/i)).toBeInTheDocument();
  });

  /* Type-level guarantee, asserted structurally: the component's props contain
     no identity fields, so no caller can inject one from a URL. */
  it("accepts no accountId or client prop", () => {
    const keys = Object.keys(props);
    expect(keys).not.toContain("accountId");
    expect(keys).not.toContain("clientName");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/print/portal-print-page.test.tsx`
Expected: FAIL — cannot resolve `./portal-print-page`.

- [ ] **Step 3: Write `portal-print-page.tsx`**

Create `src/components/reports/print/portal-print-page.tsx`:

```tsx
"use client";
import { usePortalReportControls } from "@/components/reports/v2/use-portal-report-controls";
import { PRINT_SECTIONS, type PrintSectionId } from "./print-sections";
import { PrintDocument } from "./print-document";
import { PrintReady } from "./print-ready";
import { AutoPrint } from "./auto-print";
import { SECTION_RENDERERS } from "./section-renderers";
import { rangeLabelFor } from "./hub-print-page";

function PrintNotice({ children }: { children: React.ReactNode }) {
  return <div className="mf-paper p-10 text-[13px] text-mf-ink">{children}</div>;
}

/** The portal half of the print layer.
 *
 *  ⚠️ It takes NO accountId and NO client name. Identity comes from
 *  usePortalReportControls(), which resolves it through /api/portal/me/client —
 *  a route that applies the admin-preview ?client= override server-side and
 *  ignores it for non-admins. Adding an identity prop here, however convenient,
 *  would let one client print another's report by editing the URL.
 *
 *  Denial and loading branches deliberately render NEITHER the sentinel nor
 *  AutoPrint, so a refusal never reaches a printer. */
export function PortalPrintPage({
  sectionId,
  start,
  end,
  year,
  autoprint,
  generatedAt,
}: {
  sectionId: PrintSectionId;
  start: string;
  end: string;
  year: number | null;
  autoprint: boolean;
  /** YYYY-MM-DD, computed server-side by the route. */
  generatedAt: string;
}) {
  const controls = usePortalReportControls();

  if (controls.loading) return <PrintNotice>Preparing report…</PrintNotice>;
  if (controls.notFound) return <PrintNotice>This report is not available.</PrintNotice>;
  if (!controls.canAccessSection(sectionId)) {
    return <PrintNotice>This report is not available.</PrintNotice>;
  }
  if (!controls.accountId) {
    return <PrintNotice>No analytics account is linked to this client yet.</PrintNotice>;
  }

  const { rangeKind } = PRINT_SECTIONS[sectionId];
  if (rangeKind === "range" && !(start && end)) {
    return <PrintNotice>Missing report parameters.</PrintNotice>;
  }
  if (rangeKind === "year" && year === null) {
    return <PrintNotice>Missing report parameters.</PrintNotice>;
  }

  const resolvedStart = rangeKind === "year" ? `${year}-01-01` : start;
  const resolvedEnd = rangeKind === "year" ? `${year}-12-31` : end;
  const render = SECTION_RENDERERS[sectionId];

  return (
    <PrintDocument
      surface="portal"
      sectionId={sectionId}
      clientName={controls.clientName}
      rangeLabel={rangeLabelFor(sectionId, { start, end, year })}
      generatedAt={generatedAt}
      start={resolvedStart}
      end={resolvedEnd}
    >
      {render?.({
        surface: "portal",
        accountId: controls.accountId,
        start: resolvedStart,
        end: resolvedEnd,
      })}
      <PrintReady />
      {autoprint && <AutoPrint />}
    </PrintDocument>
  );
}
```

- [ ] **Step 4: Write the route**

Create `src/app/portal/reports/overview/print/page.tsx`:

```tsx
import { PortalPrintPage } from "@/components/reports/print/portal-print-page";
import { parsePortalPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/* parsePortalPrintParams cannot return an accountId or a client name, so this
   route structurally cannot pass one through. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parsePortalPrintParams(await searchParams);
  return <PortalPrintPage sectionId="overview" {...params} generatedAt={formatDate(new Date())} />;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/components/reports/print/`
Expected: PASS — 6 new `PortalPrintPage` tests plus everything from Tasks 2-8.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

- [ ] **Step 7: Browser check on the portal**

With the dev server on `PORT=3100`, open
`http://localhost:3100/portal/reports/overview/print?client=<CODE>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>`
as an admin (admin preview). Confirm: no `PortalShell` chrome, the accent rule is **charcoal blue not orange**, and the client name matches the previewed client. Then confirm that editing `client=` to a different code either previews that client (you are an admin) or is ignored — never mixes one client's name with another's data.

- [ ] **Step 8: Commit**

```bash
git add src/components/reports/print/portal-print-page.tsx src/components/reports/print/portal-print-page.test.tsx src/app/portal/reports/overview/print/page.tsx
git commit -m "feat(reports): add the portal overview print route" -m "Client identity and section grants come from usePortalReportControls, so the print URL cannot name a client. Denial branches render neither the sentinel nor AutoPrint." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase 3 — The remaining five sections, hub + portal

**Do not start until Task 9 reads `GATE: PASS`.**

### Task 11: Five remaining hub print routes

**Files:**
- Modify: `src/components/reports/print/section-renderers.tsx`
- Create: `src/app/reports/{advertising-audit,inventory,period-comparative,share-of-voice,subscribe-save}/print/page.tsx`
- Test: `src/components/reports/print/section-renderers.test.tsx` (create)

**Interfaces:**
- Consumes: everything from Phase 2.
- Produces: `SECTION_RENDERERS` becomes a total `Record<PrintSectionId, …>` (no longer `Partial`).

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/print/section-renderers.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { SECTION_RENDERERS } from "./section-renderers";
import { PRINT_SECTIONS } from "./print-sections";

describe("SECTION_RENDERERS", () => {
  it("has a renderer for every registered section", () => {
    for (const id of Object.keys(PRINT_SECTIONS)) {
      expect(typeof SECTION_RENDERERS[id as keyof typeof SECTION_RENDERERS]).toBe("function");
    }
  });

  it("registers exactly six renderers and no extras", () => {
    expect(Object.keys(SECTION_RENDERERS).sort()).toEqual(Object.keys(PRINT_SECTIONS).sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/print/section-renderers.test.tsx`
Expected: FAIL — five ids resolve to `undefined`.

- [ ] **Step 3: Fill in the renderers**

In `src/components/reports/print/section-renderers.tsx`, add the imports:

```tsx
import { AdvertisingAuditSection } from "@/components/reports/v2/advertising-audit-section";
import { InventorySection } from "@/components/reports/v2/inventory-section";
import { PeriodComparativeSection } from "@/components/reports/v2/period-comparative-section";
import { ShareOfVoiceSection } from "@/components/reports/v2/share-of-voice-section";
import { SubscribeSaveSection } from "@/components/reports/v2/subscribe-save-section";
```

Change the declaration from `Partial<Record<…>>` to `Record<PrintSectionId, (a: SectionRenderArgs) => ReactNode>` and add the five entries after `overview`:

```tsx
  "advertising-audit": ({ surface, accountId, start, end }) => (
    <AdvertisingAuditSection surface={surface} accountId={accountId} start={start} end={end} refreshKey={0} />
  ),
  // InventorySection takes neither a surface nor dates: it is a point-in-time
  // stock read, and it renders the same on both surfaces today.
  inventory: ({ accountId }) => <InventorySection accountId={accountId} refreshKey={0} />,
  "period-comparative": ({ surface, accountId, start, end }) => (
    <PeriodComparativeSection surface={surface} accountId={accountId} start={start} end={end} refreshKey={0} />
  ),
  "share-of-voice": ({ surface, accountId, start, end }) => (
    <ShareOfVoiceSection surface={surface} accountId={accountId} start={start} end={end} refreshKey={0} />
  ),
  // start/end already carry the year-derived bounds from the page component.
  "subscribe-save": ({ surface, accountId, start, end }) => (
    <SubscribeSaveSection surface={surface} accountId={accountId} start={start} end={end} refreshKey={0} />
  ),
```

Then drop `?.` from the two `render?.(…)` call sites in `hub-print-page.tsx` and `portal-print-page.tsx`, since the record is now total.

- [ ] **Step 4: Create the five routes**

Each file is the Task 8 route with one word changed. Create all five, substituting `<ID>`:

`src/app/reports/advertising-audit/print/page.tsx` → `sectionId="advertising-audit"`
`src/app/reports/inventory/print/page.tsx` → `sectionId="inventory"`
`src/app/reports/period-comparative/print/page.tsx` → `sectionId="period-comparative"`
`src/app/reports/share-of-voice/print/page.tsx` → `sectionId="share-of-voice"`
`src/app/reports/subscribe-save/print/page.tsx` → `sectionId="subscribe-save"`

Body for each (this is the full file — do not abbreviate it):

```tsx
import { HubPrintPage } from "@/components/reports/print/hub-print-page";
import { parseHubPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseHubPrintParams(await searchParams);
  return <HubPrintPage sectionId="<ID>" {...params} generatedAt={formatDate(new Date())} />;
}
```

- [ ] **Step 5: Run tests, then typecheck**

Run: `npm run test -- src/components/reports/print/`
Expected: PASS, including the 2 new `SECTION_RENDERERS` tests.
Run: `node_modules/.bin/tsc --noEmit` — baseline only.

- [ ] **Step 6: Browser check each of the five hub print routes**

For each, load the print URL with a real `accountId` (plus `start`/`end`, or `year` for subscribe-save, or neither for inventory) and confirm charts are full-width, no card is sliced, and there is no app chrome.

- [ ] **Step 7: Commit**

```bash
git add src/components/reports/print/section-renderers.tsx src/components/reports/print/section-renderers.test.tsx src/components/reports/print/hub-print-page.tsx src/components/reports/print/portal-print-page.tsx src/app/reports/advertising-audit/print/page.tsx src/app/reports/inventory/print/page.tsx src/app/reports/period-comparative/print/page.tsx src/app/reports/share-of-voice/print/page.tsx src/app/reports/subscribe-save/print/page.tsx
git commit -m "feat(reports): add hub print routes for the five remaining sections" -m "SECTION_RENDERERS is now total over the registry, so a missing renderer is a type error rather than a blank page." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Five remaining portal print routes

**Files:**
- Create: `src/app/portal/reports/{advertising-audit,inventory,period-comparative,share-of-voice,subscribe-save}/print/page.tsx`

**Interfaces:**
- Consumes: `PortalPrintPage` (Task 10), `SECTION_RENDERERS` (Task 11).
- Produces: all twelve print routes exist, which is Task 13's precondition.

- [ ] **Step 1: Create the five routes**

Full body for each, substituting `<ID>` as in Task 11:

```tsx
import { PortalPrintPage } from "@/components/reports/print/portal-print-page";
import { parsePortalPrintParams } from "@/components/reports/print/print-url";
import { formatDate } from "@/lib/report-date-range";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parsePortalPrintParams(await searchParams);
  return <PortalPrintPage sectionId="<ID>" {...params} generatedAt={formatDate(new Date())} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` — baseline only.

- [ ] **Step 3: Run the whole print + v2 suite**

Run: `npm run test -- src/components/reports/`
Expected: PASS, no count drop anywhere.

- [ ] **Step 4: Browser check each of the five portal print routes**

Load each as an admin using `?client=<CODE>`. For every one confirm: **charcoal blue accent, never orange** on the cover rule; no `PortalShell`; and that a section the previewed client lacks a grant for renders "This report is not available." rather than data.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/reports/advertising-audit/print/page.tsx src/app/portal/reports/inventory/print/page.tsx src/app/portal/reports/period-comparative/print/page.tsx src/app/portal/reports/share-of-voice/print/page.tsx src/app/portal/reports/subscribe-save/print/page.tsx
git commit -m "feat(reports): add portal print routes for the five remaining sections" -m "All twelve print routes now exist, which is the precondition for switching the PDF control off window.print()." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Switch the PDF control to the print route, and delete the old path

**Files:**
- Modify: `src/components/reports/v2/reports-controls-bar.tsx:1-10, 158-179`, `src/components/reports/v2/reports-controls-bar.client-select.test.tsx:99-113`, `src/app/globals.css:546-593`
- Delete (via `git rm`): `src/components/reports/v2/export-report-pdf.ts`, `src/components/reports/v2/export-report-pdf.test.ts`
- Test: `src/components/reports/v2/reports-controls-bar.pdf-link.test.tsx` (create)

**Interfaces:**
- Consumes: `buildPrintUrl`, `isPrintSectionId`, `PRINT_SECTIONS`.
- Produces: the PDF control is an `<a target="_blank">` to the print route with `autoprint=1`. `exportReportPagePdf` and `body.mf-print-report` no longer exist.

**Why this is last:** `showPdfExport` defaults true on all twelve report pages. Switching before Task 12 would have pointed ten live buttons at 404s.

- [ ] **Step 1: Write the failing test**

Create `src/components/reports/v2/reports-controls-bar.pdf-link.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReportControls, ReportRangeControls } from "./use-report-controls";

const pathname = { current: "/reports/overview" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { ReportsControlsBar } = await import("./reports-controls-bar");

const range: ReportRangeControls = {
  mode: "week", setMode: () => {},
  customStart: "2026-08-01", setCustomStart: () => {},
  customEnd: "2026-08-04", setCustomEnd: () => {},
  year: 2026, setYear: () => {},
  week: 31, setWeek: () => {},
  accountId: "154290", start: "2026-07-27", end: "2026-08-02",
};
const hubControls: ReportControls = {
  ...range,
  clients: [{ clientIdCode: "AC01", clientName: "Acme Co", clientStatus: "Active" }],
  clientsLoading: false, selectedClient: "Acme Co", setSelectedClient: () => {},
  refreshKey: 0, bumpRefresh: () => {},
};

describe("the PDF control", () => {
  it("links the hub print route with the live range and autoprint", () => {
    pathname.current = "/reports/overview";
    render(<ReportsControlsBar surface="hub" controls={hubControls} />);
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute(
      "href",
      "/reports/overview/print?accountId=154290&client=Acme+Co&start=2026-07-27&end=2026-08-02&autoprint=1",
    );
  });

  it("links the portal print route with no identity in the URL", () => {
    pathname.current = "/portal/reports/overview";
    render(
      <ReportsControlsBar
        surface="portal"
        controls={range}
        showClientSelect={false}
        showRefreshButton={false}
        clientLabel="Acme Co · AC01"
      />,
    );
    const href = screen.getByRole("link", { name: /pdf/i }).getAttribute("href")!;
    expect(href).toBe("/portal/reports/overview/print?start=2026-07-27&end=2026-08-02&autoprint=1");
    expect(href).not.toContain("154290");
    expect(href).not.toContain("Acme");
  });

  it("sends a year, not dates, for subscribe-save", () => {
    pathname.current = "/reports/subscribe-save";
    render(
      <ReportsControlsBar
        surface="hub"
        controls={hubControls}
        sectionLabel="Subscribe & Save"
        showDates={false}
        refreshRange={{ start: "2026-01-01", end: "2026-12-31" }}
      />,
    );
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute(
      "href",
      "/reports/subscribe-save/print?accountId=154290&client=Acme+Co&year=2026&autoprint=1",
    );
  });

  it("sends no dates for the inventory snapshot", () => {
    pathname.current = "/reports/inventory";
    render(<ReportsControlsBar surface="hub" controls={hubControls} sectionLabel="Inventory" showDates={false} />);
    expect(screen.getByRole("link", { name: /pdf/i })).toHaveAttribute(
      "href",
      "/reports/inventory/print?accountId=154290&client=Acme+Co",
    );
  });

  /* Fails closed rather than linking a 404. */
  it("renders no PDF control on a page with no print route", () => {
    pathname.current = "/portal/reports/business-model-audit";
    render(<ReportsControlsBar surface="portal" controls={range} showClientSelect={false} showRefreshButton={false} />);
    expect(screen.queryByRole("link", { name: /pdf/i })).toBeNull();
  });

  it("opens in a new tab so the dashboard is not navigated away", () => {
    pathname.current = "/reports/overview";
    render(<ReportsControlsBar surface="hub" controls={hubControls} />);
    const link = screen.getByRole("link", { name: /pdf/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/reports/v2/reports-controls-bar.pdf-link.test.tsx`
Expected: FAIL — the control is a `button`, so `getByRole("link")` finds nothing.

- [ ] **Step 3: Replace the control**

In `src/components/reports/v2/reports-controls-bar.tsx`, replace the `exportReportPagePdf` import (line 8) with:

```tsx
import { usePathname } from "next/navigation";
import { buildPrintUrl } from "@/components/reports/print/print-url";
import { isPrintSectionId, PRINT_SECTIONS } from "@/components/reports/print/print-sections";
```

Inside the component, after `const palette = getSurfacePalette(surface);`, add:

```tsx
  /* The section id is derived from the path rather than added as a prop to all
     twelve pages. It fails closed: an unrecognised path renders no PDF control
     instead of linking a 404 (e.g. the portal's business-model-audit page). */
  const pathname = usePathname() ?? "";
  const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  const printSectionId = isPrintSectionId(lastSegment) ? lastSegment : null;
  const printHref = printSectionId
    ? buildPrintUrl({
        surface,
        sectionId: printSectionId,
        accountId,
        clientName: clientLabel?.split("·")[0]?.trim() || selectedClient || undefined,
        start: refreshRange ? refreshRange.start : showDates ? start : undefined,
        end: refreshRange ? refreshRange.end : showDates ? end : undefined,
        year:
          PRINT_SECTIONS[printSectionId].rangeKind === "year" && refreshRange
            ? Number(refreshRange.start.slice(0, 4))
            : undefined,
        autoprint: true,
      })
    : null;
```

Then replace the whole `{showPdfExport && (<button …>…</button>)}` block at lines 158-179 with:

```tsx
        {showPdfExport && printHref && (
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 bg-background border rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
              surface === "portal"
                ? "border-portal-accent/60 text-portal-accent hover:bg-portal-accent/10"
                : "border-brand/60 text-brand hover:bg-brand/10"
            }`}
            title="Open the print-ready PDF of this report"
          >
            <FileDown className="size-3.5" />
            PDF
          </a>
        )}
```

- [ ] **Step 4: Update the existing controls-bar test**

In `src/components/reports/v2/reports-controls-bar.client-select.test.tsx`, the suite now needs a `usePathname` mock at the top of the file:

```tsx
vi.mock("next/navigation", () => ({ usePathname: () => "/reports/overview" }));
```

and the final test (lines 99-113) changes `getByRole("button", { name: /pdf/i })` to `getByRole("link", { name: /pdf/i })` in both halves, and its name to `"renders the PDF export link on hub and portal"`.

- [ ] **Step 5: Delete the old print path**

```bash
git rm src/components/reports/v2/export-report-pdf.ts src/components/reports/v2/export-report-pdf.test.ts
```

(`rm -f` is hook-blocked; `git rm` is the supported route. The filename builder these tests covered now lives in `print-url.ts` with the same two cases asserted there.)

Then delete `src/app/globals.css:546-593` — the whole `/* ── Report page PDF export … ── */` block from the `#mf-print-report-banner` rule through the closing `}` of its `@media print`. Verify by grep that no `mf-print-report` reference survives anywhere:

Run: `grep -rn "mf-print-report\|exportReportPagePdf" src/`
Expected: no output.

- [ ] **Step 6: Run the tests**

Run: `npm run test -- src/components/reports/`
Expected: PASS. Predict before running: 6 new PDF-link tests pass; the client-select suite still has 5 tests; the deleted `export-report-pdf.test.ts`'s 2 tests are gone but their assertions live on in `print-url.test.ts`.

- [ ] **Step 7: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` — baseline only. `reports-controls-bar.tsx` must not appear.

- [ ] **Step 8: Commit**

```bash
git add src/components/reports/v2/reports-controls-bar.tsx src/components/reports/v2/reports-controls-bar.pdf-link.test.tsx src/components/reports/v2/reports-controls-bar.client-select.test.tsx src/app/globals.css
git commit -m "feat(reports): point the PDF control at the print route" -m "Replaces window.print() on the live dashboard with a link to the section's paper document. The section id is derived from the path and fails closed, so a page without a print route renders no control. Deletes export-report-pdf and the body.mf-print-report block." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Full-surface verification sweep

**Files:**
- Delete: `scripts/_tmp-print-chart-proof.ts` (untracked; move to `scratchpad/`)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS. Predict the count before running and compare — a drop means something was deleted, not fixed.

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: the known baseline only, judged by filename. Never "fix" `src/app/api/hours/route.ts`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new findings in `src/components/reports/print/`, the 12 route files, `layout-router.tsx`, `surface.tsx`, `reports-controls-bar.tsx`, or `top-nav.tsx`.

- [ ] **Step 4: Twelve-route browser pass at `PORT=3100`**

For each of the six hub pages: click PDF, confirm a new tab opens the paper document, the print dialog appears by itself, and Chrome's preview shows whole cards, full-width charts, and the orange cover rule. Then each of the six portal pages, confirming charcoal blue instead. This is the unavoidable manual gate — the feature is visual and so is its failure mode.

- [ ] **Step 5: Move the temporary script out of the repo**

Run: `mv scripts/_tmp-print-chart-proof.ts "$SCRATCHPAD/"` (using the session scratchpad path). Confirm `git status --porcelain scripts/` shows nothing.

- [ ] **Step 6: Report, do not push**

Summarise: tests run and counts, tsc verdict by filename, which of the twelve routes were opened in a browser and what was seen. **Push, deploy, and merge all require an explicit per-action OK from Manu.**

---

# Phase 4 — Monthly report onto the MF palette (SEPARATE PR)

### Task 15: Re-tokenise `report.css`

**Do not include this task in the same PR as Tasks 1-14.** The spec makes it a separate PR with its own visual QA, and it touches an 848-line stylesheet that the puppeteer Drive route also renders.

**Files:**
- Modify: `src/components/monthly-report/styles/report.css:1-33` (tokens + `@import`), then every `var(--orange|grey|grey-2|grey-3|black|white|ink|ink-soft|muted|rule|rule-2|bg|bg-soft|bg-card)` reference
- Modify: `src/components/monthly-report/Report.tsx:49-59` if the accent mirroring needs adjusting

**Interfaces:**
- Consumes: the `--mf-*` tokens in `src/app/globals.css:189-206`.
- Produces: no visual regression in the monthly report; no CDN font fetch.

**The trap to preserve:** `Report.tsx:51-53` writes `meta.accent` into **both** `--accent` and `--orange` at runtime so per-client accent overrides work. Renaming `--orange` without updating that mirroring silently breaks every client-specific accent. The comment at `report.css:30-32` says so explicitly.

- [ ] **Step 1: Map the tokens**

| `report.css` | Replace with | Note |
|---|---|---|
| `--orange: #F8BF1C` | `var(--mf-orange)` `#ff751f` | brand accent; keep `--accent: var(--orange)` mirroring |
| `--grey: #2C2B36` | `var(--mf-charcoal)` `#2a5059` | dark section fills |
| `--grey-2: #1f1e26` | `var(--mf-charcoal-900)` `#19343b` | |
| `--grey-3: #3a3946` | `var(--mf-charcoal-700)` `#23464f` | |
| `--white: #FFFFFF` | `var(--mf-white)` `#fefefe` | brand White, per DESIGN.md strict fidelity |
| `--ink: #2C2B36` | `var(--mf-ink)` `#242222` | Off Black |
| `--muted: #7a7886` | `var(--mf-muted)` `#68777c` | |
| `--rule: #e6e4dd` | `var(--mf-line)` `#dbe1e4` | |
| `--bg-soft: #f7f6f3` | `var(--mf-ghost)` `#f0eff6` | |
| `--positive: #35C759` | `var(--mf-positive)` `#18864b` | AA on tint |
| `--negative: #FF5C60` | `var(--mf-negative)` `#c73737` | |
| `--neutral: #FAC800` | `var(--mf-warning)` `#a66600` | |
| `--black: #000000` | keep | backs dimming, per DESIGN.md |

- [ ] **Step 2: Drop the CDN font import**

Delete `report.css:6` (the `fonts.googleapis.com` `@import`) and change `.report-doc`'s `font-family` at `:38` from `'Inter', system-ui, …` to `var(--font-outfit), system-ui, -apple-system, sans-serif`. Replace `'JetBrains Mono'` usages with `var(--font-mono)` (Geist Mono, already bundled via `next/font`). Removing the CDN also removes a render-blocking third-party fetch from the puppeteer Drive route.

- [ ] **Step 3: Verify the accent override still works**

Run the monthly report with a `meta.accent` override and confirm the per-client accent still applies through `Report.tsx`'s mirroring.

- [ ] **Step 4: Visual QA**

Open `/reports/monthly` and `/reports/monthly/print?token=…` and compare every section (CoverHeader, KPISection, ScorecardSection, MoMSection, FindingsSection, DirectionsSection, ProductsSection, AppendixSection) against the pre-change render. `sections/` and `charts/` stay structurally intact — this is a token change, not a redesign.

- [ ] **Step 5: Tests, typecheck, commit on its own branch**

Run: `npm run test -- src/components/monthly-report/` then `node_modules/.bin/tsc --noEmit`.

```bash
git add src/components/monthly-report/styles/report.css
git commit -m "refactor(monthly-report): re-tokenise onto the MF palette" -m "Replaces the report's private palette and the Google Fonts CDN import with the app's --mf-* tokens and locally bundled Outfit. Preserves Report.tsx's --accent/--orange mirroring so per-client accents keep working." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** — every section of `2026-08-11-reports-pdf-export-design.md` maps to a task:

| Spec section | Task(s) |
|---|---|
| New shared print layer (`PrintDocument`, `print.css`, `AutoPrint`, `print-url.ts`) | 3, 4, 5 |
| Print routes (12) | 8, 10, 11, 12 |
| Shell removal + `globals.css` deletion + banner removal | 7, 13 |
| Card breaking via `Surface` `data-report-card` | 6 |
| Data flow: same section component, existing hooks, no new endpoints, sentinel | 5, 8, 10 |
| Charts in print mode (highest uncertainty, proven on one section) | 4 (mechanism), 9 (gate) |
| Nav link | 1 |
| Phase 2 monthly re-token | 15 |
| Error handling: missing params / loading / no data / no grant / portal identity | 8, 10 |
| Testing: unit, updated `export-report-pdf.test.ts`, manual pass, tsc after vitest | 2-14 |
| Sequencing 1→2→3→4 | Phases 1-4, with the button switch moved to Task 13 and the reason stated |

**Gaps found and closed during review:**
- The spec's "No data for this range" panel has no dedicated task. It is **deliberately not implemented as a separate panel**: every v2 section already renders its own empty state from `data === null`, and `PrintReady` fires once the skeletons clear, so an empty range yields the section's own empty rendering inside the paper shell rather than a blank page. Verify this per section in Task 14 step 4; if any section renders literally nothing, add a panel then. Stated here rather than silently dropped.
- The spec says "six sections × two surfaces". The portal actually has a seventh page, `business-model-audit`. Checked: it renders an iframe of `/api/portal/audit` and **no `ReportsControlsBar`**, so it has no PDF control and needs no print route. Task 13's fail-closed derivation covers it by construction and one test pins it.
- Nothing covered the dual-accent rule in the new directory — `no-hub-orange.test.ts` reads only `src/components/reports/v2`, non-recursively. Task 4 adds `no-hub-orange.print.test.ts`.

**Type consistency:** `PrintSectionId`, `PrintRangeKind`, `PrintSectionMeta`, `PRINT_SECTIONS`, `isPrintSectionId` (Task 2) are used unchanged in Tasks 3, 4, 8, 10, 11, 13. `buildPrintUrl` / `parseHubPrintParams` / `parsePortalPrintParams` / `buildReportPdfFilename` (Task 3) are consumed in 4, 8, 10, 11, 12, 13 with the signatures declared there. `SectionRenderArgs` (Task 8) is the same shape Task 11 extends. `rangeLabelFor` and `hasRequiredParams` are declared in `hub-print-page.tsx` and `rangeLabelFor` is imported from there by `portal-print-page.tsx`.

**Known accepted costs:** `src/app/reports/layout.tsx` mounts `ReportControlsProvider` above every `/reports/*` route including the print routes, so each hub print page load fires one unused `GET /api/clients`. Removing it needs a route-group refactor and is out of scope; the request does not block rendering because section data comes from `/api/reports/*`.
