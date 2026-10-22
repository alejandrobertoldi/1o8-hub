# 1o8 Agency — Brand & Design Reference

**Source:** the internal deck "1O8_Creative_Workflow" (Google Slides,
https://docs.google.com/presentation/d/1VRvd4rQ6ZP2OWCNmPz5SSG-j1fYCsxYkrm30hHSnTs8, revised Jul 20, 2026).
Colors and fonts below were read straight from the deck's shapes and text runs, not estimated.
Reference thumbnails: `docs/brand/deck/` (cover, three-card layout, four-card layout).

This is the design direction for the 1o8 Hub, and it **replaces the MarketFoundry palette and fonts in
`DESIGN.md`**. Applied app-wide on 2026-10-20 (tokens in `src/app/globals.css`, Inter in `src/app/layout.tsx`).

## Palette

| Name | Hex | Deck usage | Hub role (proposed token) |
|---|---|---|---|
| **1o8 Yellow** | `#F7BF1D` | Cover and closing backgrounds, eyebrow-pill text, letters inside icon circles, highlight bubbles ("new") | Primary accent: `--brand` |
| **Ink** | `#2C2B35` | Headlines, eyebrow pills, icon circles, page-number dots, the "1O8 AGENCY" wordmark on yellow | Foreground text, dark surfaces: `--foreground`, `--brand-foreground` |
| **Slate** | `#817F8A` | Body copy under card titles, subtitles | Secondary text: `--muted-foreground` |
| **Card Gray** | `#F4F4F2` | Rounded content cards (secondary `#EFEFEC`) | Card / raised surface: `--card` |
| **Hairline** | `#D8D7DC` | Faint dividers / light text | Borders: `--border` |
| **White** | `#FFFFFF` | Default slide background | Page background: `--background` |

Rules seen in the deck:
- **Yellow is never a text color on white.** It shows up as a full-bleed background, inside dark pills and circles, or as a solid bubble.
- **On yellow, text is always Ink** (never white). Ink on yellow ≈ 8.3:1 contrast. White on yellow fails WCAG.
- Content slides are white with gray cards. Yellow is reserved for the cover, the closing slide and small accents. The look stays mostly white, gray and ink, with a little yellow.
- Slate on white is about 4.0:1, under WCAG AA for small text. Use it at ≥14px, or darken it slightly (e.g. `#6E6C77`) for small UI labels.

## Typography

- **Inter** for everything in the UI. Weights in the deck: **800** (display titles), **700** (headlines, card titles, pill labels), **400** (body). (The deck also uses Calibri for some body text; that's a Slides default, so don't copy it.)
- **Headlines:** Inter 700/800, **sentence case**, large and tight ("Built for how we actually work").
- **Eyebrow labels:** Inter 700, **UPPERCASE**, small, letter-spaced, inside an Ink pill with Yellow text ("WHY WE'RE ADDING THIS ROLE", "TRACK 1 — WEEKLY RHYTHM").
- **Card titles:** Inter 700, ~1.1× body, Ink. **Card body:** Inter 400, Slate, relaxed line height.

## Components & motifs

- **Eyebrow pill:** fully rounded, Ink fill, Yellow uppercase text. Sits above the page title. Also works as a status/day chip inside cards (FRIDAY, MONDAY, ONGOING).
- **Content card:** Card Gray `#F4F4F2`, rounded corners (~8–12px), very soft drop shadow, **no border**, generous padding. Layouts are 3- or 4-across in a grid.
- **Icon circle:** Ink circle with a single Yellow lowercase letter or number (v / c / b, 1 / 2 / 3). Used for numbered steps and feature icons.
- **Highlight bubble:** solid Yellow circle with Ink bold text ("new", "more in depth"), overlapping a card edge. Use sparingly for "new" markers.
- **Page-number dot:** small Ink circle with a Yellow numeral, bottom-right.
- **Flow arrows:** step sequences written inline: `Intake → Setup → Kickoff → …`.

## Logo

- Wordmark **"1O8 AGENCY"**: Ink on Yellow, set vertically along the right edge of the cover, with "1O8" heavy and "AGENCY" light and spaced out.
- Official PNG: `docs/brand/1o8-logo-original.png` (ink wordmark on transparent). Derived assets in
  `public/`: `1o8_Logo_Ink.png`, `1o8_Logo_White.png` (dark mode), `1o8_Mark_Ink.png` / `1o8_Mark_White.png`
  ("108" numerals only), `favicon.png` (ink "108" on yellow). Render it with `<BrandLogo />`
  (`src/components/brand/brand-logo.tsx`). An SVG version would be sharper; ask for it if available.

## Voice (from the deck copy)

Plain, direct and operational: "Built for how we actually work", "The cadence that never stops",
"Who owns which call". Short sentence-case headlines, no hype.
