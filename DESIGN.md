# Design System — MFHub

## Product Context
- **What this is:** Internal agency platform for managing Amazon product listings — SEO pipeline, A+ content, product catalog, client portal, revenue attribution
- **Who it's for:** 15 agency team members (managers, SEO specialists) and their clients (portal view)
- **Space/industry:** Amazon marketplace services / agency tooling
- **Project type:** Web app / dashboard (Next.js 16, React 19, Tailwind CSS 4, shadcn/ui)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — data-dense, function-first, professional
- **Decoration level:** Minimal — typography and layout do the work, no gradients or illustrations
- **Mood:** Competent and calm. A tool that respects your time. Cool ghost-white neutrals prevent clinical sterility. Burnt Orange accent adds agency branding without being flashy.
- **Reference sites:** None (internal tool, designed from scratch)

## Typography

**One typeface — Outfit — across the entire app.** Hierarchy is created by **weight, case, and size only**, never by switching families. (Exceptions: `Geist Mono` for code blocks; `Amazon Ember` inside Amazon PDP / listing previews only.)

### Hierarchy (MarketFoundry brand)
| Role | Family / Weight | Case | Usage |
|------|-----------------|------|-------|
| **Headline** | Outfit **Bold** (700) | ALL CAPS | Page/hero headers, big display numbers. `tracking-tighter` at large sizes. |
| **Subhead** | Outfit **Bold** (700) | Sentence case | Section titles, card titles, subheads |
| **Body** | Outfit **Regular** (400) | Sentence case | Paragraphs, descriptions, table data (`tabular-nums`). Sentence case maximizes readability. |
| **Micro-label** | Outfit **Bold** (700) | UPPERCASE | `text-[10px]`/`text-xs` metadata labels and section eyebrows |

- **Wiring:** Outfit is loaded via `next/font/google` in `layout.tsx` as `--font-outfit`; `--font-sans` points at it, so all text inherits Outfit. Headers additionally pin `font-[family-name:var(--font-outfit)]`.
- **Code:** Geist Mono (`--font-mono`, bundled via `next/font`)
- **Amazon previews only:** Amazon Ember (`--font-ember`)
- **Note:** The brand guideline specifies ALL-CAPS headlines. App page headers currently use the mixed-case "jammed two-word" style (below); an ALL-CAPS rollout is a separate per-surface pass, not yet applied globally.
- **Scale:**
  - `text-[8px]` — micro badges (status pills)
  - `text-[9px]` — phase badges
  - `text-[10px]` — micro-labels, metadata
  - `text-xs` (12px) — standard labels, body small
  - `text-[13px]` — buttons (`font-medium leading-none`)
  - `text-sm` (14px) — body, card titles
  - `text-base` (16px) — primary body
  - `text-4xl` / `text-5xl` — page headings (with `tracking-tighter`)

## Color

### MarketFoundry Brand Palette (source of truth)
The five brand colors from the MarketFoundry brand deck. Every app token below derives from these.

| Name | Hex | RGB | Role |
|------|-----|-----|------|
| **Burnt Orange** | `#FF751F` | 255, 117, 31 | Primary accent — creativity, momentum, bold ideas. Hub `--brand`. |
| **Charcoal Blue** | `#2A5059` | 42, 80, 89 | Depth, trust, stability. Portal `--portal-accent` + dark canvas. |
| **Ghost White** | `#F0EFF6` | 240, 239, 246 | Openness, simplicity. Light page canvas `--background`. |
| **White** | `#FEFEFE` | 254, 254, 254 | Raised surfaces (cards, popovers, inputs). Contrast + readability. |
| **Off Black** | `#242222` | 36, 34, 34 | Primary text / foreground. Contrast partner to White. |

Supporting White + Off Black create contrast and keep the brand clean, modern, and versatile. Burnt Orange and Charcoal Blue never mix (see dual-accent rule below).

**Strict fidelity:** Tailwind's `white` token is overridden to `#FEFEFE` in `globals.css` (`@theme` → `--color-white`), so every `bg-white` / `text-white` / `border-white` utility renders brand White — no pure `#fff` anywhere in the UI. Tailwind's `black` is left at pure `#000` on purpose (it backs image/modal **dimming scrims** like `bg-black/50` backdrops and the `bg-black/95` lightbox, where a warm tint would degrade the darkening). Brand **Off Black text** ships via the `--foreground` token (`text-foreground`), which is `#242222`.

### Approach: Restrained
One Burnt Orange accent + cool ghost-white neutrals. Color is rare and meaningful.

### Brand — Dual Accent (Hub vs Portal)

**Critical rule:** The platform uses two accent colors to distinguish sides.
- **Hub (internal / agency team):** Burnt Orange `#FF751F` — `--brand`
- **Portal (client-facing, `/portal/*`):** Charcoal Blue `#2A5059` — `--portal-accent`

Never mix them. The portal is always charcoal blue; the hub is always burnt orange. This separation is intentional and load-bearing — clients and internal users must instantly recognize which side they are on.

| Token                   | Light                   | Dark                    | Usage                                                        |
|-------------------------|-------------------------|-------------------------|--------------------------------------------------------------|
| `--brand`               | `#FF751F`               | `#FF751F`               | **Hub only** — primary accent, buttons, links, active states |
| `--brand-hover`         | `#E5661C`               | `#FF8A42`               | Hover state for hub brand elements                           |
| `--brand-foreground`    | `#111`                  | `#111`                  | Dark text on `--brand` backgrounds (white fails WCAG contrast on `#FF751F`) |
| `--brand-solid`         | `#B8500F`               | `#B8500F`               | **Text-bearing** orange fills (badges, toggles) — deeper orange so WHITE text clears WCAG AA (~5:1). Use `bg-brand-solid text-white`. Default filled buttons use `bg-brand`, not this token. |
| `--brand-solid-hover`   | `#A2470D`               | `#A2470D`               | Hover for `--brand-solid` fills |
| `--brand-glow`          | `rgba(255,117,31,0.15)` | `rgba(255,117,31,0.14)` | Box shadow glow on hub primary CTAs |
| `--portal-accent`       | `#2A5059`               | `#4E7A85`               | **Portal only** — MarketFoundry Charcoal Blue. Dark mode uses a lightened tint for legibility on near-black. Headings, card CTAs, hover borders, active nav |
| `--portal-accent-hover` | `#1E3B42`               | `#6B9AA6`               | Portal hover states |

Tailwind usage: `text-portal-accent`, `bg-portal-accent`, `border-portal-accent`. Never use raw hex `#2A5059` — always reference the token (it carries the dark-mode variant).

**All page headers use the split pattern: first word `text-foreground font-bold` (white in dark / near-black in light), second word accent color.** Portal pages use `text-portal-accent` for the second span, hub pages use `text-brand`. The two-word "jammed" heading style (no space between words) is preserved. Weight hierarchy (`font-bold` + `font-medium`) stays.

**Narrow exception — categorical chart data fills.** The dual-accent rule governs *brand emphasis*: accents, CTAs, headings, active states, and the current-period emphasis series (`accentFor()` in `src/components/reports/v2/primitives/chart-colors.ts`). It does **not** govern the multi-slot **categorical data palettes** that merely identify chart categories, which are shared and identical on both surfaces — as `CHART_DATA`'s purple/green/blue already are. Two such 4-slot arrays hold `#FF751F` in slot 0 and render it on the portal: `SLOT_COLORS` (`advertising-audit-section.tsx` — pie/donut segments) and `STACK` (`inventory-section.tsx` — stacked bars). There the hex is a category key sitting beside blue, green and purple, not a brand accent; the token `--brand` itself remains hub-only. Recolouring slot 0 to `--portal-accent` on portal was considered and **rejected**: it puts dark teal against the slot-1 blue `#006BBB` at **1.60:1** in a chart type where colour is the only identifier, and voids the arrays' validated CVD spacing (worst adjacent pair ΔE 22.2 protan). The exception is bounded by an explicit allowlist in `src/components/reports/v2/no-hub-orange.test.ts`; every other v2 section is still scanned and must contain no hub orange. **Do not widen it** — portal chrome, accents and emphasis series stay charcoal blue, always.

### Semantic
| Token             | Value     | Usage                                                          |
|-------------------|-----------|----------------------------------------------------------------|
| `--brand-green`   | `#34C759` | Success, approved, achieving goals, positive scores (80+)      |
| `--brand-red`     | `#FF5C5F` | Error, destructive, not achieving goals, negative scores (<60) |
| `--brand-yellow`  | `#FAC800` | Warning, in-progress, moderate scores (60-80)                  |
| `--brand-orange`  | `#FF751F` | Accent variation (matches `--brand`)                           |

### Third-party brand colors
Used only to mark where an item *comes from* — never for status, emphasis or brand accents.

| Token     | Value     | RGB / CMYK / Pantone                  | Usage |
|-----------|-----------|---------------------------------------|-------|
| `--asana` | `#FF584A` | 255/88/74 · 0/80/75/0 · Pantone 171 C | Asana Coral. Marks Asana-sourced tasks (solid chip fill on the `/me` calendar). Tailwind: `border-asana`, `bg-asana`, `text-asana`. |

`#FF584A` and `--brand-red` `#FF5C5F` are near-identical, so overdue/error is never shown as a red fill or red text on an Asana item — it is shown as a **red strikethrough on the due date** (task list) or on the **day number** (calendar), Calendar chips encode overdue by **fill, not colour**: upcoming = solid fill (`bg-asana text-white`, Hub `bg-brand/15`); overdue = white chip in both light and dark mode with the source colour on border/text (`bg-white border-asana text-asana`, Hub `bg-white border-brand`) plus an `AlarmClock` icon. Never strike through a task title — strikethrough reads as *done*.

⚠️ Contrast: white on `#FF584A` is ~3.1:1 — below WCAG AA (4.5:1) for small text. Accepted by Manu 2026-10-08 for the 11px calendar chips. If AA is required later, add an `--asana-solid` (e.g. `#D63A2E`, ~4.7:1) for text-bearing fills, mirroring `--brand-solid`.

### Surfaces
| Token                | Light                    | Dark                      |
|----------------------|--------------------------|---------------------------|
| `--background`       | `#F0EFF6` (Ghost White)  | `#2A5059` (Charcoal Blue) |
| `--foreground`       | `#242222` (Off Black)    | `oklch(0.93 0.005 250)`   |
| `--card`             | `#FEFEFE` (White)        | `oklch(0.18 0.012 250)`   |
| `--sidebar`          | `#F0EFF6`                | `#2A5059`                 |
| `--muted-foreground` | `oklch(0.55 0.01 250)`   | `oklch(0.75 0.012 250)`   |
| `--border`           | `oklch(0 0 0 / 8%)`      | `oklch(1 0 0 / 10%)`      |

### Tailwind Badge Colors (component-level)
| State          | Light                                               | Dark                                                       |
|----------------|-----------------------------------------------------|------------------------------------------------------------|
| Approved/Green | `bg-emerald-50 text-emerald-700 border-emerald-300` | `bg-emerald-500/10 text-emerald-400 border-emerald-500/30` |
| Active/Amber   | `bg-amber-100 text-amber-800 border-amber-300`      | `bg-amber-500/20 text-amber-400 border-amber-500/30`       |
| Pending/Stone  | `bg-stone-200 text-stone-500 border-stone-300`      | `bg-zinc-800/50 text-zinc-500 border-zinc-800`             |
| Error/Red      | `bg-red-50 text-red-600 border-red-300`             | `bg-red-500/10 text-red-400 border-red-500/30`             |
| Selection      | `bg-amber-50 border-amber-300/40`                   | `bg-amber-500/10 border-amber-500/20`                      |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable (agency users on large screens, but data-dense views)
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Card padding:** `p-5` (20px)
- **Card gap:** `space-y-2.5` (10px) between cards, `space-y-6` (24px) between client groups
- **Section gap:** `gap-4` (16px) for inline elements, `mb-4` between sections

## Layout
- **Approach:** Grid-disciplined — strict alignment, predictable structure
- **Grid:** Single column content area within sidebar layout
- **Sidebar:** Fixed left, collapsible, 256px wide
- **Max content width:** Fluid within sidebar (no max-width constraint)
- **Border radius:**
  - `rounded-md` (6px) — nested elements (inputs moved to `rounded-full`, see 2026-09-24)
  - `rounded-lg` (8px) — dropdowns, nested cards
  - `rounded-[18px]` (18px) — cards, panels, version shells (matches h-9 pill radius of 36px/2; do not use `rounded-full` on large panels)
  - `rounded-full` — buttons (pills), text inputs/selects (`h-9` pills), chips and badges, single-line banners, avatars, status pills

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** `transition-colors`, `transition-all` (Tailwind defaults); button press is `ease-out`
- **Duration:** Micro (~150ms for hover states, **100ms for button press**), card entrance uses `animate-card-enter` with staggered delay. Sheets open and close in **300ms** (mirrored).
- **Patterns:**
  - Card hover: `hover:border-stone-300 hover:shadow-md transition-all`
  - Button press: `active:scale-[0.97]` on pointer-down (100ms). Color still changes on hover. Links (`variant="link"`) do not scale. Gated by `motion-reduce`.
  - Card entrance: staggered `animationDelay: ${index * 50}ms`
  - Modal: `backdrop-blur-sm` backdrop fade; dialog/alert scale originates from the trigger, not the viewport center
  - Reduced motion: named keyframes off; `animate-in`/`animate-out` become 200ms opacity cross-fades (no slide/zoom)
  - Reduced transparency: `.opal-nav` and `.glass-card` go solid (no `backdrop-filter`)
  - No scroll animations, no decorative motion. **No spring physics in chrome.** Isolated exception: the data-map visual canvas may rubber-band, project flick velocity, and settle with a critically damped step — it is already a direct-manipulation surface.

## Component Patterns

### Cards
```
rounded-[18px] border border-stone-200 bg-card
hover:border-stone-300 hover:shadow-md transition-all
card-glow animate-card-enter
dark:border-zinc-800 dark:hover:border-zinc-700
```
Cards use the `bg-card` token (light: white; dark: opaque charcoal
`oklch(0.18 0.012 250)`). The old `bg-white dark:bg-zinc-900/50` pattern is
retired. Modals keep `bg-white dark:bg-zinc-900` (opaque) per the Modals block.

### Badges
```
rounded-md px-2 py-0.5 text-[9px] font-bold
```
Use semantic color table above for state variants.

### Micro-labels
```
text-[10px] font-bold text-muted-foreground
```

### Section Headers
```
text-xs font-bold uppercase tracking-wider text-brand
```

### Modals
```
fixed inset-0 z-50 flex items-center justify-center
bg-black/40 dark:bg-black/60 backdrop-blur-sm
```
Modal content: `rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900`

### Primary Button
```
inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium leading-none text-white transition-colors hover:bg-brand-hover active:scale-[0.97]
```
Default buttons are 36px pills: `h-9`, `rounded-full`, `px-3`, `text-[13px] font-medium leading-none`, `gap-1.5` for icons. Filled brand is `bg-brand text-white` with `hover:bg-brand-hover`. `--brand-solid` remains for other text-bearing orange fills (badges, toggles) where the deeper orange is needed for WCAG AA.

### Ghost/Secondary Button
```
inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 text-[13px] font-medium leading-none text-muted-foreground hover:bg-stone-50
dark:border-zinc-700 dark:hover:bg-zinc-800
```

### Inputs
```
h-9 rounded-full border border-stone-300 bg-white px-4 text-sm
text-foreground focus:border-amber-500 focus:outline-none
dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300
```
Single-line text inputs and selects are `h-9` pills, matching buttons. Multi-line `textarea`s keep `rounded-[18px]` (a pill cannot hold multiple lines). Collapsible rows are `rounded-full` collapsed and `rounded-[18px]` expanded.

## Shared Components
- `SectionDots` (`src/components/seo/section-dots.tsx`) — S1-S6 phase visualization
- `AvatarCircle` (`src/components/seo/avatar-circle.tsx`) — User avatar with fallback initials

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Initial design system codified | Formalized implicit system from existing codebase via /design-consultation. No creative redesign — documentation of what exists. |
| 2026-03-19 | Quality badge thresholds: 80+/60-80/<60 | Maps to existing emerald/amber/red badge semantics. Decided in /plan-design-review. |
| 2026-03-19 | Bulk mode via header toggle | Gmail/Notion pattern — checkboxes hidden by default, activated by "Select" button. Decided in /plan-design-review. |
| 2026-03-19 | Inline diff (not side-by-side) | Amazon content is long text — inline with red strikethrough / green underline is more readable. Decided in /plan-design-review. |
| 2026-07-22 | `--brand-solid` (`#B8500F`) + white text on filled orange | Brand rule: white on orange. Bright `#FF751F` fails WCAG with white (~2.7:1); a deeper orange fill clears AA (~5:1) while keeping the white-on-orange look. `#FF751F` stays for accents/borders/icons/bars. Decided in /design-review. |
| 2026-07-22 | Dark `--muted-foreground` → `oklch(0.75)`; nav labels use theme token | Contrast audit: dark bg is `#2A5059` (not near-black), so mid-grey secondary text and hardcoded ghost-white nav labels failed. Decided in /design-review. |
| 2026-07-22 | Cards standardized on `bg-card` token; retired `bg-white dark:bg-zinc-900/50` | Single theme-reactive surface; dark cards go opaque charcoal (accepted). Decided in /design-review. |
| 2026-07-27 | Codified MarketFoundry 5-color brand palette; text/surfaces → Off Black `#242222` / White `#FEFEFE` | Aligned app tokens to the brand deck. The 3 core colors (Burnt Orange, Charcoal Blue, Ghost White) already matched; only light `--foreground` (was blue-tinted near-black) → Off Black and card/popover/input white `#ffffff` → brand White `#FEFEFE` changed. Semantic/status/chart tokens untouched (not in brand deck). Dark mode kept (brand deck is light-oriented). Strict fidelity: Tailwind `--color-white` overridden to `#FEFEFE` so all `*-white` utilities render brand White; `black` left pure `#000` for image/modal dimming scrims. |
| 2026-10-08 | Overdue calendar chips = white chip (both themes) + alarm icon; upcoming = solid | A struck day number alone was too subtle; title strikethrough would read as completed. |
| 2026-10-08 | Added `--asana` (`#FF584A`, Asana Coral) as a third-party source color | `/me` mixes Asana and Hub items; coral marks Asana origin. Asana chips are a solid coral fill with white text; overdue moved to a red strikethrough on the date so it never competes with the near-identical `--brand-red`. White-on-coral is ~3.1:1 (below AA) — accepted by Manu. |
| 2026-07-27 | Typography confirmed single-family Outfit with weight/case hierarchy | Headline = Outfit Bold ALL CAPS · Subhead = Outfit Bold · Body = Outfit Regular sentence case · Micro-label = Outfit Bold uppercase. No second body font. |
| 2026-07-31 | Hours-log heatmap card is a permanent light island in dark mode via a new `.light-surface` utility | Deliberate, user-approved deviation from the 2026-07-22 "cards standardized on `bg-card`" row above, scoped to the `/hours-log` heatmap card only — no other card changes. The density ramp reads better on a white surface, and the user chose this after being shown the conflict. Mechanism: `globals.css` widens the light-token selector from `:root` to `:root, .light-surface` (values are never duplicated, so they cannot drift), and the card carries `light-surface`, declaring the light tokens directly on itself so they beat the inherited `.dark` values with no `!important`. The card's five `dark:border-zinc-800` utilities were deleted rather than overridden, because `@custom-variant dark (&:is(.dark *))` matches any descendant of `.dark` and no wrapper can un-match them. `BUCKET_PCT` needed no retuning: `--brand` and `--brand-foreground` are identical in both themes. |
| 2026-08-04 | Categorical chart data fills are exempt from the dual-accent rule; `#FF751F` stays in slot 0 of `SLOT_COLORS` + `STACK`, including on the portal | Ruled after seeing it rendered live at `/portal/reports/advertising-audit` — four pie/donut charts with 132px orange segments. The 2026-08-03 spec §9 approval of these arrays had been given **unseen**, which is why the dogfood check existed. Independently re-derived contrast confirms the alternative is worse: surface-switching slot 0 to `--portal-accent` puts `#2A5059` against slot-1 `#006BBB` at **1.60:1** inside the same 4-category pie, where colour is the sole identifier, and voids the arrays' validated CVD spacing (ΔE 22.2 protan). Distinction that makes this coherent: `--brand` the *token* stays hub-only; only the raw hex appears, as a category key. Scope is bounded by the allowlist in `no-hub-orange.test.ts` (3 files); all other v2 sections stay scanned. Comment at `chart-colors.ts:21` corrected — it previously read "NEVER orange on the portal", which was literally false once these arrays were exercised. |
| 2026-09-14 | Default buttons are `h-9` / `rounded-full` pills (`px-3`, `text-[13px] font-medium`, `bg-brand text-white`) | Canonical chip is Generate Alt Text (`GenerateAllAltTextsBtn`). Buttons are no longer `rounded-lg`. `--brand-solid` stays for badges/toggles. |
| 2026-09-14 | Cards/panels use `rounded-[18px]` (18px), not `rounded-xl` / `rounded-2xl` | Matches h-9 pill radius (36px/2) without `rounded-full` on large panels. Inputs stay `rounded-md`. |
| 2026-09-16 | Industrial-compatible Apple motion: button press scale, reduced-motion cross-fade, reduced-transparency solids, mirrored 300ms sheets, dialog origin from trigger, data-map canvas rubber-band/flick | Apple-design audit. Chrome stays industrial (no bounce, no Vaul). Button `:active` scale 0.97 / 100ms is the one DESIGN.md amendment (was color-only). Data-map is the isolated direct-manipulation exception. |
| 2026-09-24 | Text inputs, selects, chips/badges and single-line banners are `rounded-full` pills (inputs `h-9 px-4`) | Supersedes "Inputs stay `rounded-md`" in the 2026-09-14 cards row. Manu's call after seeing it on `/seo/new`: every control on a row reads as one pill family. Textareas stay `rounded-[18px]`; collapsible rows are pill collapsed / 18px expanded. Rolled out on `/seo/new` first; other pages migrate as touched. |
