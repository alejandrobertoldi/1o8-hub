# Amazon 75-char Title + 125-char Item Highlight — Design Spec

- **Date:** 2026-06-15
- **Status:** Approved for planning (not yet committed)
- **Area:** 1o8 SEO Manager — S6 Listing Content (in-app `/seo/manager` runtime + `1o8-seo-manager` skill spec)

## Background / Why

Amazon mandate (effective **2026-07-27**): product titles in all categories **except media** must be **≤75 characters including spaces**. A new **Item Highlight** field adds **125 characters**, searchable, shown below the title in search results and on detail pages. Amazon's own AI splits the legacy long title — key info → title (75), remainder → Item Highlight (125).

Today the 1o8 SEO Manager hard-codes **190–200 char titles** in eight places across two sources of truth and has **no Item Highlight concept**. This spec migrates title generation to the new rules, propagates both fields into the Master products table (→ BigQuery), and lets existing projects regenerate to the new scope.

## Locked decisions

1. **Title:** hard **max 75** chars (drop the 190 floor). Keep: no colons, hyphen-only separators (one space each side), word-repeat cap 2, brand front-loaded, highest-priority keyword right after brand.
2. **Item Highlight:** single field, **max 125** chars. Comma-separated **Title-Case** phrases, no colons, **no words duplicated from the title**. Carries the overflow keywords + use cases.
3. **Generation:** one Claude call — the existing `titles` batch emits `{ ASIN, Title, ItemHighlight }`. (No separate batch.)
4. **Keyword split:** done **in the prompt**; `keyword-distribution.ts` is **unchanged**. Highest-priority keywords front-load the 75-char title; the remaining title-bucket keywords flow into the 125-char Item Highlight; together they cover all title-bucket keywords; **neither appears** in bullets/description/backend (the existing "reserved" guarantee is preserved).
5. **Post-generation passes:** Title keeps the native-voice + Chicago passes. **Item Highlight gets Title-Case normalization + compliance scan only** — no prose voice pass (it is a phrase list, not prose).
6. **Rollout:** 75/125 is the new default **immediately**. No flag, no toggle. Media-category exception ignored (no 1o8 media clients).
7. **Master storage:** new core column `master.item_highlight text`; **BigQuery Master** gains a coined **`ItemHighlight`** column via the full-replace publish path.
8. **Existing-project migration:** **per-project** "Regenerate to 75/125" action (no cross-project sweep).
9. **Exports** (gdoc / CSV-TSV / DOCX): **fast-follow** after generation + UI + Master land.
10. **Backward compat:** new columns nullable; existing rows null until regenerated; **no backfill**; historical 200-char titles untouched until re-run.

## Data model & migrations

- **Migration `drizzle/migrations/0077_seo_item_highlight.sql`** applied via **`scripts/_apply-0077.ts`** (TTY-safe path; `drizzle-kit generate/migrate` blocks on TTY; **dev DB = prod Supabase** — both ALTERs are nullable, non-breaking):
  - `ALTER TABLE seo_listings ADD COLUMN item_highlight varchar(130);`  *(130 = 125 + headroom)*
  - `ALTER TABLE master ADD COLUMN item_highlight text;`
- **`src/lib/db/schema.ts`:** add `itemHighlight: varchar("item_highlight", { length: 130 })` to `seoListings` (alongside `title`), and `itemHighlight: text("item_highlight")` to `master` (alongside `itemName`).
- **BigQuery `1o8Hub.Master`:** new `ItemHighlight` column. Publish is `WRITE_TRUNCATE` (full replace from master), so the load job materializes the column — ensure the publish column list / schema in `src/lib/bigquery.ts` includes `ItemHighlight`.

## Generation — `titles` batch (`src/app/api/seo/claude/seo/route.ts`)

- **TITLE RULES** block (~L733): `190-200` → `≤75`; replace the 195-char worked example with a ≤75-char example; keep front-load, keyword-coverage, parent-ASIN, size-placement rules.
- **New ITEM HIGHLIGHT RULES** block: ≤125 chars; comma-separated Title-Case phrases; no colons; must not repeat words used in the title; carries overflow keywords + use cases.
- **Keyword section** (~L760): instruct the title/highlight split as in locked decision #4.
- **OUTPUT FORMAT** (~L748): `{ "ASIN": "...", "Title": "...", "ItemHighlight": "..." }`.
- **Compliance rules** (~L700-702): title length note updated; "no colons in titles" extended to Item Highlight.
- **HUMANIZE** (`HUMANIZE_CHAR_LIMITS`, ~L327): `"Titles: 190-200 characters exactly."` → `"Titles: ≤75 characters."` Item Highlight is **not** added to the prose humanize fields; add a Title-Case normalization step for it instead.

## Validation & byte budgets

- **`src/lib/seo/validators.ts` `buildS6`** (~L164): title `.min(190).max(200)` → `.max(75)` (keep the `no ':'` and word-repeat-cap-2 refinements). Add to each listing object:
  `item_highlight: z.string().max(125).refine((s) => !s.includes(":"), "item_highlight may not contain ':'")`.
- **`src/lib/seo/phases/s6.ts`:**
  - `S6Output.listings[]` type gains `item_highlight: string`.
  - Compliance `fields` array (~L142): add `{ field: "item_highlight", text: l.item_highlight }`.
  - `checkCharBudget(l.title, 190, 200)` (~L191) → `(l.title, 1, 75)`; add `item_highlight: checkCharBudget(l.item_highlight, 1, 125)` to `byteUsage`.
  - `seoListings` insert (~L206): add `itemHighlight: l.item_highlight`.

## Master propagation (`.../migrate-to-products/route.ts`)

- `FIELD_MAP` (~L24): add `ItemHighlight: { target: "core", field: "itemHighlight" }`. (`Title → core.itemName` is unchanged; `master.itemName` is unbounded `text`, so the shorter title flows through with no schema impact.)
- BQ-raw-name mapping (~L237): map `ItemHighlight → "ItemHighlight"` so it lands in `rawColumnValues` for publish.
- `master` select projections in GET (preview) and POST: add `itemHighlight` so old-value diffing works.

## Review UI (`src/app/seo/[id]/seo/page.tsx`)

- In the `titles` batch review, render Item Highlight beneath each title with its own char meter (green ≤125). "Regenerate titles" refreshes **both** fields (single call). Accept/store flow persists both.

## Regenerate-to-75/125 action (per-project)

- **New endpoint** `POST /api/seo/projects/[id]/regenerate-titles`: re-runs **only the titles batch** under the new rules for all project ASINs → writes a new `seo_listings` version + updates `seoAsins.generatedContent`, leaving bullets/description/backend/QA intact. Optionally chains into migrate-to-products in the same request so Master updates.
- **UI:** a "Regenerate titles → 75/125" button on the SEO project page with a confirm dialog and a per-ASIN result summary (regenerated / skipped / failed).

## Skill-spec parity (in-chat runner — source of truth)

Mirror every rule change so the in-chat and in-app runners do not drift:
- `.claude/skills/1o8-seo-manager/SKILL.md` (L22 title rule, L62 byte-budget line)
- `.claude/skills/1o8-seo-manager/phases/s6-listing-content.md` (title rule + length range)
- `.claude/skills/1o8-seo-manager/schema.json` (title `maxChars` 75 + drop `minChars`; add `item_highlight` entry)
- `.claude/skills/1o8-seo-manager/rubrics/byte-budgets.md` (title row + new item_highlight row)
- `src/lib/seo/coherence.ts` (character-limits note)

## Exports (fast-follow)

`export-gdoc` route, CSV/TSV export, `src/lib/seo-docx-builder.ts`: add an Item Highlight column/section so deliverables carry it.

## Out of scope (YAGNI)

- Bullets / description / backend rules — Amazon's mandate doesn't touch them.
- Cross-project bulk regenerate sweep.
- Per-project old/new title-mode toggle.
- Backfill of historical 200-char titles.
- Media-category exception handling.

## Testing

- **Unit:** title validator passes at 75 / fails at 76; item_highlight passes at 125 / fails at 126; colon rejection on both; word-repeat cap unchanged; `keyword-distribution` tests stay green (logic unchanged).
- **Integration:** titles batch returns `Title` + `ItemHighlight`; `s6` persist writes `item_highlight` + `byteUsage`; migrate-to-products maps `ItemHighlight → core.itemHighlight` + `rawColumnValues`.
- **Manual:** run the regenerate action on a real existing project; verify `master.item_highlight` set + `isDirty=true`; publish dry-run shows the `ItemHighlight` column.

## File change list

**Runtime**
- `drizzle/migrations/0077_seo_item_highlight.sql` *(new)*
- `scripts/_apply-0077.ts` *(new)*
- `src/lib/db/schema.ts` — `seoListings.itemHighlight`, `master.itemHighlight`
- `src/lib/seo/validators.ts`
- `src/lib/seo/phases/s6.ts`
- `src/app/api/seo/claude/seo/route.ts` — titles batch + humanize
- `src/app/api/seo/projects/[id]/migrate-to-products/route.ts` — FIELD_MAP + projections
- `src/app/api/seo/projects/[id]/regenerate-titles/route.ts` *(new)*
- `src/app/seo/[id]/seo/page.tsx` — Item Highlight render + regenerate button
- `src/lib/bigquery.ts` — `ItemHighlight` publish column

**Skill-spec parity**
- `.claude/skills/1o8-seo-manager/{SKILL.md, phases/s6-listing-content.md, schema.json, rubrics/byte-budgets.md}`
- `src/lib/seo/coherence.ts`

**Fast-follow (exports)**
- `src/app/api/seo/projects/[id]/export-gdoc/route.ts`, CSV/TSV export, `src/lib/seo-docx-builder.ts`
