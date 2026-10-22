# Case Study Kit — Tracker + In-Hub Builder (High-Level & Detailed) — Design Spec

**Date:** 2026-09-28
**Branch:** `thread-ab/case-study-kit` (worktree `.worktrees/thread-ab-case-study`)
**Source of truth for look & content:** `docs/case-study-kit/` (copied verbatim from Manu's "Case Study Kit 2"):
- `High Level Case Study Template.html` — 5 slides
- `Detailed Case Study Template.html` — 14 slides
- `Template Instructions.html` — playbook (fill rules, voice, banding, chart geometry §5, image rules §6, tokens §8)
- `Claude Project Context Pack.html` — the same playbook packaged for a Claude Project
- `assets/mf-logo.png`, `assets/mf-mark.png`, `assets/image-slot.js`

---

## 1. Intent

Market Foundry staff need to (a) see, across **every active client**, which case studies exist in which format and how far along each is, and (b) build those case studies **inside the Hub** in the two new brand formats, with numbers pulled from Hub data and editable by staff.

Success = a staff member opens `/case-studies`, sees every active client with a High-Level and a Detailed cell, clicks **Create** on an empty cell, picks a period, gets a deck pre-filled with real data in the exact template look, edits copy/images/overrides, moves it through review, and exports a PDF.

## 2. Decisions made (do not re-litigate)

| # | Decision | Choice |
|---|---|---|
| D1 | Relationship to the existing 13-section builder | **Evolve it**: keep tables, data queries, drawer-editor shell, PDF route; replace renderers/section types with the two new formats |
| D2 | Existing case-study data | **DELETED 2026-09-28** on Manu's OK: C23_SC_US, GLO_SC_US, REA_SC_US (3 drafts + 39 sections) via `scripts/_oneoff-delete-legacy-case-studies.ts --confirm`; `case_studies` and `case_study_sections` are now empty in prod |
| D3 | Audience | **Internal + PDF only**. `/portal/case-study` and its portal/preview wiring are removed |
| D4 | Numbers | **Every metric is pulled from Redshift** (Intentwise `intentwise_ecommerce_graph`), frozen, with per-field staff override; a metric Redshift returns nothing for = flagged MISSING, never invented, never a manual-entry field by design |
| D5 | Architecture | **Approach A — shared snapshot**: one metrics snapshot per deck, React slides replicating the templates, banding as a render-time pure function |
| D6 | Tracker stages | **5-step**: Not started → Drafting → In review → Approved → Sent |
| D7 | Images | **Pulled from the Hub's Design section** (Brand Story, A+ Content, Listing Images, Storefront) for the client. A per-slot **emergency manual URL** override exists for images missing from Design, visibly marked as an exception. `image-slot.js` is **not** ported |
| D8 | AI redraft | Dropped. `/api/case-studies/[id]/redraft` is removed |

## 3. Data model

Migration number: next free at implementation time (repo tip is `0118`; verify against `drizzle/migrations/` and `scripts/run-migration-*.ts` before claiming one). Applied via a bespoke `scripts/run-migration-NNNN.ts`, never `drizzle-kit migrate`. Schema change requires Manu's explicit OK before it touches prod.

### `case_studies` (altered)

| Column | Change |
|---|---|
| `client_id_code` | drop `UNIQUE`; add `UNIQUE (client_id_code, format)` |
| `format` | **new** `case_study_format` enum `('high_level','detailed')` NOT NULL |
| `stage` | **new** `case_study_stage` enum `('drafting','in_review','approved','sent')` NOT NULL default `'drafting'`. "Not started" = no row |
| `owner_id` | **new** nullable FK → `users.id` |
| `sent_at` | **new** nullable timestamptz |
| `metrics` | **new** jsonb NOT NULL default `'{}'` — see §5 |
| `status` (`draft`/`published`) | **dropped** (superseded by `stage`) |
| `contact_email`, `office_locations` | defaults changed to `hello@marketfoundry.com` / `''` (1o8 defaults removed) |
| `title`, `date_range_start`, `date_range_end`, `client_sector`, `generated_at`, timestamps | kept |
| `sections_enabled` | kept; lists the slide types in this deck (Detailed may swap `demand_curve` → `sns`, per template §2 slide 08) |

### `case_study_sections` (unchanged shape)

`section_type` values are replaced by the new slide types (§4). `content` jsonb holds **slide copy and image URLs only** — no numbers. Numbers live in `case_studies.metrics`.

## 4. Slide types

**High-Level (5):** `hl_cover`, `hl_challenge`, `hl_results`, `hl_approach`, `hl_creative`.

**Detailed (14):** `cover`, `brief`, `results`, `snapshot`, `approach`, `sales_growth`, `product_mix`, `demand_curve` (or `sns`), `paid_media`, `brand_story`, `listing_images`, `aplus`, `storefront`, `next_steps`.

Each type has: a content TypeScript interface (copy fields + image URL fields named after the template's slot ids, e.g. `li1…li9`, `ap1…ap12`, `sf1…sf3`), a renderer component, and an editor panel. The template HTML is the field list: every `[bracketed placeholder]` is either a metric key (§5) or a copy field; every `<image-slot>` is an image URL field with its `fit`/`align`/`shape` attributes preserved in the renderer.

## 5. Metrics snapshot

```ts
interface CaseStudyMetrics {
  pulledAt: string;                       // ISO timestamp of last pull
  period: { start: string; end: string }; // YYYY-MM-DD strings
  auto: Partial<Record<MetricKey, MetricValue>>;      // last pull; replaced on Refresh
  overrides: Partial<Record<MetricKey, MetricValue>>; // staff edits; survive Refresh
}
// effective(key) = overrides[key] ?? auto[key] ?? MISSING
```

`MetricValue` is a number, a monthly series (`{month: 'YYYY-MM', value}[]`), or a small typed record (top-products rows, per-channel paid-media blocks). `MetricKey` is a closed union.

**Sources — all Redshift, `intentwise_ecommerce_graph` (columns verified 2026-09-28 by sampling one row per table):**

| Metric | Table · columns |
|---|---|
| Ordered sales (total + monthly), units | `account_summary` · `product_sales`, `product_quantity` (cross-check `ordered_revenue`/`ordered_units` in plan) |
| Ad revenue, spend, impressions, clicks, orders | `account_summary` · `ad_revenue`, `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_orders` |
| Sessions | `account_summary` · `browser_session` + `mobile_app_sessions` |
| Page views | `product_summary` · `browser_page_views` + `mobile_app_page_views` (summed over products); `account_summary.glance_view_byasin` as cross-check |
| Buy Box % | `product_summary.buy_box_prcntg`, sales-weighted across products |
| Top 3 products by revenue / by units, concentration % | `product_summary` · `product`, `product_title`, `product_sales`, `product_quantity` |
| SKU count | `product_summary` · distinct `sku` with sales in period |
| Paid media: Sponsored Products vs SB + SD | `campaign_summary` · `campaign_type` split, with `ad_spend`, `ad_revenue`, `ad_orders` monthly |
| Subscribe & Save | existing `queries/sns.ts` (Redshift) |
| CVR, organic vs ad split, ROAS, ACOS, growth multiple, H2-vs-H1 | derived from the above |
| Fulfilment (FBA/FBM) | **RULED 2026-09-28: Hub Postgres `master.fulfillment`** for the client's active rows — the single labelled non-Redshift field (no Redshift column exists) |

`campaign_type` values must be enumerated in the plan (read-only probe) before mapping SP vs SB/SD.

Derived metrics are computed from effective inputs at render time, not stored — so an override on an input flows through.

**Missing handling:** a slide field bound to a MISSING metric renders an orange "needs data" chip in the editor preview (never a zero, never a placeholder bracket in export). A deck with any MISSING metric that is actually on an enabled slide **cannot move to Approved** (server-enforced).

**Refresh data:** re-runs the pull, replaces `auto`, keeps `overrides`, stamps `pulledAt`. Editor shows per-field origin: `auto` / `manual` / `missing`.

## 6. Banding (High-Level only)

`bandFigure(usd: number): string` — pure function, exhaustively unit-tested.

- N = digit count of `floor(usd)`; L = `usd / 10^(N-1)` (so 1 ≤ L < 10). **Low** if L < 4, **Mid** if 4 ≤ L < 7, **High** if L ≥ 7. Output `"<Low|Mid|High> N-Fig"`. Pinned by tests, e.g. `$450,000 → "Mid 6-Fig"`, `$2,100,000 → "Low 7-Fig"`, `$780,000 → "High 6-Fig"`, `$3,000,000 → "Low 7-Fig"`, `$35,000 → "Low 5-Fig"` (corrected 2026-09-30 to COPYWRITING.md §8; was 3/7). Values < $1,000 are shown as `"<4-Fig"`; zero/negative → MISSING-style "n/a" (never banded).
- Applies to every metric tagged `privateUsd` (revenue, ordered sales, ad-attributed sales, spend, ASP, starting-point sales). Percentages, ratios, counts **never** band.
- Applied only by the High-Level renderers; the Detailed renderers show exact rounded values (`$64.6K`, `5.2×`, `98.9%`).
- Guard test: rendering every High-Level slide with a fixture snapshot produces HTML containing **no** `$` followed by a digit.

## 7. Tracker — `/case-studies`

- Nav: **Design → Case Studies**, visible to staff (`hasAdminPowers(role) || role === 'editor'`; viewers read-only). Not visible to client role.
- Rows: every `aac` row whose `client_status` is active (exact value confirmed in plan), sorted by client name. Columns: Client · High-Level cell · Detailed cell.
- Cell: stage chip (Not started / Drafting / In review / Approved / Sent), owner avatar/name, period, last updated. Click → builder. Empty cell → **Create** (period picker; defaults to last 12 full months) → pull → builder.
- Filters: stage, owner, format, "has missing data". Counts summary at top (e.g. "12 High-Level sent · 4 in review").
- API: `GET /api/case-studies` (no params) returns tracker rows; existing `?clientIdCode=` form gains `&format=`.

## 8. Builder — `/clients/[clientIdCode]/case-study?format=high_level|detailed`

- Existing page, reworked. Header: client, format toggle (jumps to the sibling deck or offers Create), stage control, owner picker, Refresh data, Export PDF.
- Canvas: slides rendered at 1920×1080 and scaled to fit width, stacked vertically (not the template's arrow-key deck navigation — editing needs scroll). A slide-strip of thumbnails for jumping.
- Per-slide **Edit** opens the existing drawer (`section-editor-shell.tsx`) with that slide's copy fields, its image slots (Design source shown, emergency manual URL behind a collapsed "image missing from Design?" control), and the metric fields it uses (showing auto value + override input + origin tag).
- Stage transitions: Drafting ↔ In review → Approved (blocked while missing data) → Sent (set automatically by a successful PDF export from Approved; also settable manually). Any edit to an Approved/Sent deck drops it back to Drafting.

## 9. Rendering

- Tokens and CSS copied 1:1 from the templates' `<style>` blocks into a scoped stylesheet (e.g. `case-study-kit.css`, scoped under a `.cs-deck` root so Hub styles don't leak in or out). Outfit via `next/font` or the same Google Fonts link. **Do not restyle per client** (template §8).
- `mf-logo.png`, `mf-mark.png` → `public/case-study/`.
- Charts (Detailed slides 06, 08, 09) are SVG components implementing the template §5 geometry exactly (bars: viewBox 880×340, baseline 280, top 40, width 44, first x 74, pitch 65.85; cumulative: plot 40–250, x 60→860; spend/sales: viewBox 880×300, plot 40–240, x 50→860). Axis maxima round up to a "nice" value ≥ series max. Series shorter than 12 months render the available months.
- **Image source = the Design section.** On Create/Refresh, each slot is resolved from the client's latest approved/current Design assets: cover hero + listing images ← Listing Images (`listing_image_slot_versions`/`listing_image_slot_status`); brand story banner ← Brand Story (`brand_story_*` tables); A+ modules ← A+ Content v2 (`aplus2_*`, existing `aplus-screenviews` helper); storefront pages ← Storefront (`storefront_*`). Exact "which version counts" rule fixed in the plan. Client logo: `client_brand_guidelines` if it holds one, else emergency manual.
- **Emergency manual override:** per slot, a staff-entered image URL (Drive or direct) used only when Design has nothing for that slot. Stored in the section `content` as `manualImages[slotId]`; the editor shows it with an amber "manual — not from Design" tag, and the tracker cell shows a small count of manual images so exceptions stay visible. Refresh never overwrites a manual image but the editor offers "use Design image" once Design has one.
- Slots render `<img>` with `object-fit` from the template slot's `fit` (`cover`/`contain`/`width` → `width:100%` top-aligned). Drive links go through the existing `drive-screenviews` helpers. Empty slot (neither Design nor manual) = dashed placeholder in the editor and blocks Approved like MISSING data.
- Footer page numbers are computed (`NN / total`) from enabled slides.

## 10. PDF export

**Superseded 2026-09-29 by Manu's ruling (binding): PDF export = the browser's own print ("Save as PDF") from the chrome-less print page; server-side PDF generation is dropped.** Reason: the browser pass proved the Puppeteer route worked locally but produced 43 MB / 91 MB files (~39 full-resolution images at ~2.5 MB each) — far over Vercel's 4.5 MB function response cap, so it would fail in production — plus a blank trailing page.

- Export PDF (builder, editor-or-above, enabled only for Approved/Sent) opens `/case-studies/[id]/print?autoprint=1` in a new tab; the page calls `window.print()` once after `[data-case-study-ready]` and `document.fonts.ready`. An Approved deck is first moved to Sent via the existing `PATCH { stage: "sent" }` transition (which sets `sent_at=now()`); a failed PATCH surfaces the error and does not print.
- Print layout unchanged: one slide per page at 1920×1080 (`@page` 1920px×1080px, no margins), no page break after the last slide.
- In print mode every Design image proxy URL is rewritten to `/api/case-studies/print-image?driveFileId=…&w=1600` (Hub-staff-gated, a Drive-generated JPEG via `driveClient.getThumbnail`); manual external URLs pass through unchanged.
- The document title is `<Client> - <High-Level|Detailed> Case Study`, so the browser's default PDF filename matches the old one.
- `/api/case-studies/[id]/pdf` is removed.

## 11. Removal

- Delete: the 13 old section renderers + editors, `case-study-tokens.tsx` (navy/gold), `redraft` route, `/portal/case-study` page, the `"case-study"` entry in `admin-preview-toggle.tsx`, `narrative.ts` if only redraft used it.
- Keep and adapt: `queries/*`, `generate.ts` (becomes the metrics pull), `evidence.ts`/`work-signals.ts` only if the plan finds a slide that uses them (else delete), `aplus-screenviews`/`drive-screenviews`, `format.ts`, `section-editor-shell.tsx`, `field-controls.tsx`, PDF route.
- Data: **done 2026-09-28** — legacy rows deleted (see D2), so the migration's `format NOT NULL` needs no backfill.

## 12. Error handling

- Redshift pull failure on Create/Refresh: deck is still created/kept; failed metrics become MISSING; toast names which metric groups failed. Never a 500 that loses copy edits.
- No resolvable `accountId` for the client: Create still works; every auto metric MISSING; banner explains.
- Concurrent edits: last-writer-wins per section row (current behaviour); metrics overrides updated with a jsonb merge on a single key, not a whole-object overwrite, so two editors overriding different fields don't clobber each other.

## 13. Testing

- Unit: `bandFigure` (boundaries, 4–9 digit values, negatives/zero), effective-value resolution, derived metrics, chart geometry mappers (values → coordinates), axis nice-max, Drive URL conversion (existing tests).
- Guard: no raw `$<digit>` in any High-Level render; no `[` placeholder bracket in any render with a complete fixture.
- API: tracker listing, create per format (unique conflict → 409), stage transition rules incl. Approved blocked by missing data, override merge survives refresh.
- Component: each renderer renders with a full fixture and with an all-MISSING fixture without throwing.
- Browser pass (Manu or headless): tracker, create both formats for one real client, edit, refresh, export PDF, open PDF — 5 and 14 pages at 16:9.
- `vitest` then `tsc` (vitest does not typecheck); judge tsc by filename against baseline.

## 14. Out of scope

Client-facing links/portal, editable PPTX, AI-written copy, drag-drop image upload / pan-zoom, Vendor Central variants, versions/history per deck.
