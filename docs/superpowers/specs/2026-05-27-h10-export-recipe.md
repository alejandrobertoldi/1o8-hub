# Helium 10 Cerebro Export Recipe

**Status:** Active — ship this filter setup to every account manager before they upload to 1o8Hub S2.

## Why

The 1o8Hub SEO Manager has a pre-tier filter in S2 (Step 2.5 on
`/seo/[id]/keywords`), but Cerebro lets you filter at the source.
Filtering in H10 before export gives a cleaner CSV, smaller file
(faster upload), and lower Claude token cost during tiering.

## Recommended Filter Settings

In Helium 10 Cerebro, after running a competitor ASIN search, apply:

| Filter | Recommended Value | Notes |
|---|---|---|
| Minimum Search Volume | **300** | Drops long-tail noise. 1o8Hub UI re-applies 100 as safety net. |
| Maximum Search Volume | _leave blank_ | Caps the head — usually unnecessary. |
| Position (organic rank) | **1 to 50** | Only keywords where at least one tracked ASIN ranks top 50. |
| Word count | **1 to 6** | Drops degenerate 7+ word queries (usually parsing artifacts). |
| Exclude (Phrases Contain) | wrong-form noise — see below | Pre-strip wrong product types. |
| Title Density | _leave blank_ | |
| CPR | _leave blank_ | |

## Exclude Phrase Examples (per category)

Copy the relevant block into "Phrases Contain → Exclude":

- **Supplements** — `seed, plant, capsule (if selling powder), drops, gummy (if not the form)`
- **Apparel** — `pattern, fabric only, by the yard, sewing`
- **Kitchen** — `replacement part, accessory only, manual, instructions`
- **Pets** — `for humans, food only (if selling treats), bag only`

## Output Columns to Include

Leave all default columns enabled. The parser at
`src/lib/parsers/cerebro.ts` reads these specifically:

- Keyword Phrase (required)
- Search Volume (required)
- Cerebro IQ Score
- Competing Products
- Title Density
- CPR
- Position
- Organic
- H10 PPC Suggested Bid

## After Export

1. Save the CSV with a descriptive name: `cerebro-<brand>-<asin>-<YYYY-MM-DD>.csv`.
2. Open the 1o8Hub project at `/seo/[id]/keywords`.
3. Upload the CSV to "Step 2 — Upload the Helium 10 Cerebro CSV export".
4. **Optional but recommended:** apply Step 2.5 pre-tier filter to fine-tune
   (stacks on top of H10 filtering).
5. Click "Tier Keywords" to run Claude classification.
