# Reports PDF Export — MF Paper Layout

**Date:** 2026-08-11
**Status:** Approved design, not yet planned
**Surfaces:** hub `/reports/*`, portal `/portal/reports/*`, hub `/reports/monthly`

## Problem

The PDF button added in `e4bd4dc7` calls `window.print()` on the **live dashboard DOM**
(`src/components/reports/v2/export-report-pdf.ts`). The only print styling is 40 lines of
`body.mf-print-report` rules in `src/app/globals.css` that hide chrome and force landscape.

Consequences, all observed:

- Cards are sliced across page boundaries — nothing declares `break-inside: avoid`.
- The layout is a responsive glass-card grid measured at screen width, then scaled onto paper.
- The app shell is *hidden*, not *removed*: `main` keeps `overflow: auto`, the glass panel, and its
  padding overrides fight the page box.
- Charts (Recharts `ResponsiveContainer`) measure their parent at screen size.

The project already solves this properly for one report. The monthly report renders a purpose-built
paper document at `/reports/monthly/print` with its own stylesheet
(`src/components/monthly-report/styles/report.css:834-846`: `@page A4 landscape`,
`section { break-inside: avoid }`, `section + section { break-before: page }`) and a
`[data-report-ready]` sentinel. The v2 reports export ignored that layer entirely.

Note: the PDF button is **already present on the hub** — `ReportsControlsBar` defaults
`showPdfExport = true` and all six hub v2 pages render it. Nothing needs adding there; the output is
what is broken.

## Decisions (locked)

| Decision | Choice | Rejected alternative |
|---|---|---|
| PDF content | **Designed paper document** — MF cover block, sections laid out for A4 | Faithful paginated copy of the screen |
| Export unit | **The section you are viewing** (one document per section) | One combined all-six-sections report |
| Delivery | **Print route + browser Save-as-PDF** | Server-rendered download via puppeteer |
| Portal | **In scope** — portal gets its own print routes | Hub only (would ship a broken portal button) |
| Page numbers | **Accepted absent** for now (browser-controlled) | Requires server render |
| Monthly report | **In scope, separate phase/PR** | Bundled with the v2 work |

Delivery is layered deliberately: the server-rendered download consumes the *same* print URL, so it
remains a pure add-on. It is not built now.

## Architecture

### New shared print layer — `src/components/reports/print/`

| File | Responsibility |
|---|---|
| `PrintDocument.tsx` | Paper shell: MF cover block (wordmark, client name, section title, date range, generated stamp) + running header. Takes `surface` for the accent only. |
| `print.css` | `@page A4 landscape` with 14mm/18mm margins (matches monthly), `break-inside: avoid` on cards and table rows, repeating `thead`, no shadows/glass, `print-color-adjust: exact`, `--mf-*` tokens only. |
| `AutoPrint.tsx` | Generalised from `src/app/reports/monthly/print/AutoPrint.tsx`. Waits for `[data-report-ready]`, then `window.print()`, with a timeout fallback. |
| `print-url.ts` | Builds the print URL from report controls, and the filename. Retains `buildReportPdfFilename` from `export-report-pdf.ts` — it drives the browser's default save name via `document.title`, set on the print page. |

### Print routes

Twelve routes, six sections × two surfaces:

- `/reports/{overview,advertising-audit,inventory,period-comparative,share-of-voice,subscribe-save}/print`
- `/portal/reports/{same six}/print`

Portal needs its own because `src/proxy.ts` confines client-role users to `/portal/*`. Both surfaces
render the same `PrintDocument` + section component; `surface` drives only the accent (portal teal,
hub orange), the same rule `ReportsControlsBar` already follows.

### Shell removal — load-bearing detail

`src/components/layout/layout-router.tsx` already returns bare `children` for
`/reports/monthly/print` (line ~26). The new hub print routes join that condition.

**The portal branch at line 13 runs BEFORE that check**, so `/portal/reports/*/print` would still get
`PortalShell`. The print-route exclusion must be moved above the portal branch (or duplicated inside
it). Missing this reproduces the original bug on the portal.

Once the shell is gone, the `body.mf-print-report` block in `src/app/globals.css:546-593` is deleted
along with the `#mf-print-report-banner` injection in `export-report-pdf.ts` — the cover block
replaces the banner.

### Card breaking

`Surface` (`src/components/reports/v2/primitives/surface.tsx:16`) is the single wrapper every v2 card
passes through. One `break-inside: avoid` rule reachable from it fixes all six sections. Targeting it
requires a stable hook — add `data-report-card` to `Surface` rather than matching on Tailwind classes.

### Data flow

The print route mounts the **same section component** in print mode, reading `accountId`, `start`,
`end`, and `client` from the URL and using the existing hooks (`use-overview`, `use-campaigns`,
`use-keywords`). **No new API endpoints.** When data resolves the page renders
`<div data-report-ready="true" />` — the same sentinel `src/app/api/reports/monthly/pdf/drive/route.ts`
waits on, which is what keeps a future server render a drop-in.

The button changes from "print the current page" to "open the print route with `?autoprint=1`".

### Charts in print mode

`ResponsiveContainer` measures its parent, and that measurement is unreliable inside a print box.
Print mode passes explicit pixel width/height instead. **This is the highest-uncertainty part of the
design and is proven on one section before the other five are built.**

## Nav link

Add to the Clients dropdown in `src/components/layout/top-nav.tsx`, immediately after
`Client Reports` (line ~200):

```
{ title: "Monthly Report", href: "/reports/monthly", icon: FileText, visible: isAdmin }
```

`FileText` is not currently imported in that file — the `lucide-react` import needs it. `/reports/monthly`
has no link anywhere in the app today; it is reachable only by typing the URL.

## Phase 2 — monthly report onto MF layout

`src/components/monthly-report/styles/report.css` (848 lines) runs a separate palette:
`--orange: #F8BF1C`, `--grey: #2C2B36`, with Inter pulled from a Google Fonts CDN via `@import`. The MF
reports system uses `--mf-charcoal: #2a5059`, `--mf-ink: #242222`, `--mf-orange`, and Outfit loaded
locally by `next/font`.

Work: re-token the stylesheet to `--mf-*`, drop the CDN `@import` in favour of the app's local fonts,
keep `sections/` (CoverHeader, KPISection, ScorecardSection, MoMSection, FindingsSection,
DirectionsSection, ProductsSection, AppendixSection) and `charts/` structurally intact. Ships as its
own PR with its own visual QA.

## Error handling

| Case | Behaviour |
|---|---|
| Missing or invalid URL params | Plain "Missing report parameters" message; no crash, no print |
| Data still loading | Sentinel absent; `AutoPrint` waits, then prints anyway after its timeout |
| No data for the range | Document renders with an explicit "No data for this range" panel — never a blank or half-empty PDF |
| Portal viewer without the section grant | The print route applies the same `makeSectionAccess` gate (`src/components/reports/v2/portal-report-access.ts`) that the portal report pages use — a print URL must not be a way around it |
| Portal client identity | Resolved from the session, never from a URL param. The hub print URL carries `accountId`/`client`; the portal print URL must ignore any such param so one client cannot print another's report by editing the URL |

## Testing

- **Unit:** print URL + filename builder; print-mode chart sizing helper; sentinel gating.
- **Updated:** `src/components/reports/v2/export-report-pdf.test.ts` — `buildReportPdfFilename` is
  retained, the `window.print()`-on-dashboard path is replaced.
- **Manual:** browser pass on all six sections, both surfaces, at `PORT=3100`. Unavoidable — this is a
  visual feature and the failure mode is visual.
- `vitest` does not typecheck; follow with `node_modules/.bin/tsc --noEmit`, judging by filename
  against the known baseline.

## Out of scope

- Server-rendered one-click download (puppeteer). The codebase contradicts itself on whether this
  works on Vercel: `src/app/api/reports/monthly/pdf/route.ts:32` says puppeteer is "not viable on
  Vercel (missing libnss3)" while `.../pdf/drive/route.ts:122` and
  `src/app/api/case-studies/[id]/pdf/route.ts:72` launch it with `@sparticuz/chromium` anyway. Resolve
  that question separately, against the existing routes, before building on it.
- Combined all-six-sections report document.
- Drive auto-save of exported reports.

## Sequencing

1. Nav link — two lines, ships alone.
2. Shared print layer + **overview only** — proves charts and page breaks before scaling.
3. Remaining five sections, hub + portal.
4. Monthly report onto MF layout (separate PR).

## Accepted trade-offs

- **Two renderings per section to maintain.** Screen and paper diverge; a change to a section must
  land in both. This is the cost of choosing a designed document over a paginated screenshot, and it
  is the same tax the monthly report already pays. Mitigated by driving the paper layout from the six
  shared primitives rather than rewriting 2,568 lines of section code.
- **No MF page numbers.** Chrome does not support `@page` margin boxes, so "Page 3 of 8" can only come
  from the browser's own header/footer, which the user controls.
