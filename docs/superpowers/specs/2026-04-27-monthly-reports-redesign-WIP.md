# Monthly Reports — Dr. Cuddles Aesthetic Redesign (WIP — brainstorming paused)

**Date:** 2026-04-27
**Branch:** `feat/monthly-reports` (worktree `.worktrees/monthly-reports/`)
**Status:** WIP — brainstorming paused at Q1, fresh session needed (context ran low)
**Predecessor:** `2026-04-24-monthly-reports-renderer-swap-design.md` (V1.1, shipped sections cover/toc/kpis/mom/products/appendix)

## Trigger

User dropped a complete reference HTML (Dr. Cuddles · ReadyRESCUE Full Audit, ~14-section magazine-style brand audit) and said: "retake client monthly report section, match the uploaded file to creqte future reports." Reference HTML was pasted in the brainstorming conversation — **user has it; ask them to re-paste at session start so it's on disk before designing.**

Save reference to: `.worktrees/monthly-reports/docs/superpowers/specs/_assets/2026-04-27-dr-cuddles-reference.html`

## Decision so far

**Q1 — Scope:** **Option C selected** — restyle the 6 existing monthly sections in Dr. Cuddles aesthetic AND add new analytical content sections (Findings / Directions / Roadmap / Health Scorecard style).

**Q2 — New analytical sections (2026-04-27):** **Option A selected** — add `findings` + `directions` + `scorecard`. Skip `roadmap` (quarterly artifact, mismatched to monthly cadence). Map onto existing `Report` type fields with light extension: `findings` → `highlights`, `directions` → `goals`, `scorecard` → `risks` (extend `severity` → red/amber/green status grade). No `Report`-shape breaking change; existing AI-summary infrastructure populates them.

**Q3 — Sticky chrome (2026-04-27):** Render `position: sticky` top-bar + TOC in web preview at `/reports/monthly/preview/[id]`. Strip via a `print-mode` body class (or skip elements entirely) in the puppeteer print route at `/reports/monthly/print`.

**Q4 — Per-client accent (2026-04-27):** Defer DB lookup to v1.2. Keep `meta.accent` field on `ReportMeta`, default to `#F7BF1D` (1o8Hub gold; reference uses `#F8BF1C` — within rounding, accept reference value as the spec value going forward). Hardcode in `lib/defaults.ts` as today.

**SCOPE CORRECTION (2026-04-27, mid-Q5):** User clarified — **Dr. Cuddles is a visual-format template only, NOT a content blueprint.** No AI generation, no analyzers for findings/directions/scorecard, no auto-commentary anywhere. User decides per report which sections appear and what data fills them. The redesign ships:
1. The Dr. Cuddles **CSS + component primitives** (`stats-bar`, `hero-stat`, `callout` (default/crit/ok/sky), `pullquote`, `dt` data table, `ladder`, `sku-cards`, `insights`, `chart-card`, `phases`, section types `dark`/`soft`/default, sticky `top-bar` + `toc`).
2. **Renderers** for the new analytical sections (`findings`, `directions`, `scorecard`) populated entirely from `Report` fields the user provides — section auto-hides if its array is empty.
3. **No analyzer code, no orchestrator changes beyond passing through user-provided arrays.** The orchestrator continues to fetch KPI/MoM/Products data as today; new sections are pure render layers.

This makes Q5 trivial: data source = user-provided fields on `Report`. Same shape as today's `highlights`/`goals`/`risks`, possibly extended for the new red/amber/green status grade.

Options that were on the table:
- A. Pure restyle inside A4 (rejected — too cosmetic)
- B. Long-form web layout, drop page breaks (rejected — lost PDF deliverable)
- **C. Restyle + new content sections** ← chosen
- D. Hybrid dual-format (rejected — too much work for V1.2)

## Aesthetic deltas — Dr. Cuddles vs current monthly

| Token | Current monthly (V1.1) | Dr. Cuddles target |
|---|---|---|
| Display font | Space Grotesk | Inter (heavy weights 700–900) |
| Body | Inter | Inter (400–600) |
| Mono | JetBrains Mono | JetBrains Mono (keep) |
| Paper bg | `#FAFAF7` cream | `#FFFFFF` white + `#f7f6f3` soft |
| Brand | `#F7BF1D` gold | `#F8BF1C` gold (~identical) |
| Dark surface | n/a (paper-only) | `#2C2B36` grey for full-bleed sections |
| Layout DNA | A4 page breaks (794×1123px) | flowing web; sticky top bar + TOC |
| Body text | 11px / 1.5 | 11.5px / 1.65 |

## Visual primitives Dr. Cuddles introduces

`stats-bar` (4-up KPI grid w/ gold top-rule), `hero-stat` (2-up hero KPIs), `callout` (variants: crit / ok / sky), `pullquote` (large italic-orange opener), `dt` (data table w/ dark header + gold tfoot rule), `ladder` (5-up rung cards), `sku-cards` (loss/profit econ cards), `insights` (3-up numbered insight cards), `chart-card` (chart in framed card with title+axis), `phases` (3-up dark-bg phase cards w/ giant numerals), section types: `.dark` / `.soft` / default.

## Open questions (resume here in fresh session)

1. **Format constraints** — Keep A4 page breaks for PDF email-attachment? Or flow-document with Puppeteer paginating? *Recommended A: keep A4, the deliverable is a PDF email attachment.*
2. **New content sections** — which to add for monthly reports? Candidates: `findings` (root-cause callouts), `directions` (next-step recommendations w/ pullquotes), `roadmap` (3-phase 30/60/90 cards), `scorecard` (status table). *Recommended: add `findings` + `directions` + `scorecard`. Skip `roadmap` until ops team validates.*
3. **Sticky chrome handling** — TOC stays interactive in web preview; gets stripped for PDF export.
4. **Per-client accent** — DB-driven yet? Primer says hardcoded `#F7BF1D` for V1.1. Likely defer.
5. **Data contract changes** — adding `findings`, `directions`, `scorecard` to `Report` type means new `analyzers/` and orchestrator wiring. Where does the data come from? Likely AI-generated commentary + hand-edit, similar to existing exec-summary pattern.

## Files touched / referenced

- `/Users/manu/1o8Hub/.worktrees/monthly-reports/src/components/monthly-report/types.ts` — data contract
- `/Users/manu/1o8Hub/.worktrees/monthly-reports/src/components/monthly-report/styles/report.css` — 771 lines, will be largely rewritten
- `/Users/manu/1o8Hub/.worktrees/monthly-reports/src/components/monthly-report/sections/{Cover,TOC,KPI,MoM,Products,Appendix}Page.tsx`
- `/Users/manu/1o8Hub/.worktrees/monthly-reports/src/lib/monthly-report/build-report-data.ts` — orchestrator
- `/Users/manu/1o8Hub/.worktrees/monthly-reports/docs/superpowers/specs/2026-04-24-monthly-reports-renderer-swap-design.md` — V1.1 spec

## Brainstorming checklist progress

- [x] Explore project context
- [ ] Ask clarifying questions (Q1 done; Q2–Q5 pending)
- [ ] Propose 2–3 approaches
- [ ] Present design sections
- [ ] Write design doc → `2026-04-27-monthly-reports-redesign-design.md`
- [ ] User reviews spec
- [ ] Invoke writing-plans
