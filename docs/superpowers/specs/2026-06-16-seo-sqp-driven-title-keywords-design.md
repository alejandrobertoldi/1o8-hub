# SEO Manager — SQP-Driven Title Keyword Selection

**Date:** 2026-06-16
**Status:** Approved design (pre-plan)
**Branch:** `feat/seo-75char-title-item-highlight`

## Problem

The SEO Manager's S6.2 "Titles" step decides which keywords earn the scarce 75 title
characters (and the 125 Item Highlight characters) using **Helium 10 search volume +
manual tiers** (`seoKeywords.priorityTier`). Search volume measures *impressions*, not
*purchases* — high-volume head terms get title space even when they don't convert for the
ASIN.

The desired behavior (from the `amazon-sqp-title-split` skill) is: **before generating or
splitting a title, pull Search Query Performance (SQP) data and rank keywords by the
purchases each query actually drove for this ASIN**, then build the Title + Item Highlight
around the top converters. The UI must surface a per-ASIN SQP ranking table so the keyword
choices are auditable.

## Key reframe — no MCP needed

The skill assumes the Intentwise **AI Gateway MCP server** is the SQP data path. That was
only true for an interactive Claude Code session. **The app already pulls the identical
data directly from Redshift** (Intentwise's analytics warehouse):

- `src/lib/ppc-queries.ts:187` — `fetchSqpData(accountId, startDate, endDate): Promise<SqpRow[]>`
  queries `brandanalytics_searchqueryperformance_report`.
- `src/lib/ppc-queries.ts:76-91` — `SqpRow` returns, **per ASIN**: `search_query`,
  `search_query_volume`, `asin_impression_count/share`, `asin_click_count/share`,
  `asin_cart_add_count/share`, `asin_purchase_count/share`, `start_date`, `end_date`.
- `src/lib/forecast-redshift.ts:13` — `getIntentwiseAccountId(clientIdCode): Promise<number | null>`
  resolves a client to its Intentwise `account_id`.
- `src/lib/db/schema.ts:680` — `seoProjects.clientIdCode` links a project to a client;
  `seoAsins` holds the family's parent + child ASINs.

So the MCP is discarded. The skill's *ranking logic* is preserved; its *plumbing* is
replaced by existing code. **No MCP, no new external integration, no env vars, no schema
migration.**

## Locked decisions

1. **SQP primary, Helium 10 fallback.** SQP (ranked by `asin_purchase_count`) is the
   primary signal for Title + Item Highlight keyword selection. Helium 10 keywords/tiers
   continue to drive bullets / description / backend, and are the fallback for Title +
   Item Highlight when an ASIN/family has no SQP rows.
2. **Top-selling ASIN drives the family title.** A title is one-per-variation-family.
   The **lead ASIN** = the family ASIN with the highest *total* purchases
   (Σ `asin_purchase_count` over the window). The lead ASIN's purchase-ranked query list
   is the family's title signal. The UI still shows every ASIN's own SQP table.
3. **Live fetch, 8-week default.** Query Redshift on demand (no cache/snapshot table).
   Default window = the last 8 complete Sun–Sat weeks (the SQP report's weekly grain).
   Window length is a parameter with a default of 8, adjustable later.
4. **New collapsible per-ASIN table** in the S6.2 view, separate from the existing
   "Keywords — Titles" (Helium 10) table — they are different keyword universes.

## Architecture

Chosen approach: **shared ranking module + one read endpoint, reused by the title route.**
The UI table and the title-generation prompt must rank keywords *identically*; a single
implementation guarantees the displayed table explains exactly why a keyword won the title.

### 1. Ranking module — `src/lib/seo/sqp.ts` (new, pure where possible, unit-tested)

`getProjectSqp(projectId, { weeks = 8 }): Promise<ProjectSqp>`:

1. Load `seoProjects.clientIdCode` and the family ASINs from `seoAsins`.
2. `getIntentwiseAccountId(clientIdCode)` → `accountId`. If `null` → return
   `{ available: false, reason: "no-account-mapping" }`.
3. Compute the window: last 8 complete Sun–Sat weeks → `startDate`, `endDate`.
4. `fetchSqpData(accountId, startDate, endDate)`. On timeout/error → return
   `{ available: false, reason: "redshift-error" }` (non-blocking; caller falls back).
5. Filter rows to the family ASINs; group by ASIN; rank each ASIN's queries by
   `asin_purchase_count` desc (tie-break: `asin_cart_add_count`, then volume).
6. **Lead ASIN** = ASIN with max Σ `asin_purchase_count`. If all families' totals are 0
   → `{ available: false, reason: "no-sqp-rows" }`.
7. Return:
   ```
   ProjectSqp = {
     available: true,
     window: { startDate, endDate, weeks },
     leadAsin: string,
     perAsin: Record<string, SqpRankedRow[]>,   // every family ASIN, ranked
     titleQueries: SqpRankedRow[],               // = perAsin[leadAsin], the family signal
   }
   ```

Pure helpers extracted for direct unit testing (no Redshift): `rankByPurchases(rows)`,
`pickLeadAsin(perAsin)`, `lastNFullWeeks(n, today)`. The Redshift call (`fetchSqpData`)
and `getIntentwiseAccountId` are mocked in tests.

### 2. Read endpoint — `GET /api/seo/projects/[id]/sqp` (new)

Returns the `getProjectSqp` output as JSON for the UI. Called on S6.2 tab load. ~1 small
Redshift query (one account, filtered to a handful of ASINs, 8 weeks).

### 3. Title generation — `src/app/api/seo/claude/seo/route.ts` (batch `"titles"`)

- Before building the prompt, call `getProjectSqp(projectId)`.
- **If `available`:** inject the lead ASIN's top-N purchase-ranked queries as the
  **primary** "title keywords" block (replacing today's Helium-10-T1-only block), with
  Helium 10 keywords retained as secondary context. The existing TITLE RULES and ITEM
  HIGHLIGHT RULES are unchanged (brand first; highest-converting phrase contiguous;
  Title ≤ 75 chars; Item Highlight ≤ 125 chars; no colons; no pack count; no promo
  language; no competitor brands).
- **If not `available`:** today's Helium 10 path, unchanged.
- The reason string is surfaced so the UI/log can show why SQP was/wasn't used.

### 4. UI — `src/app/seo/[id]/seo/page.tsx`

- Fetch `GET /api/seo/projects/[id]/sqp` on the S6.2 "Titles" tab.
- New collapsible **"SQP — Purchases (last 8 wks)"** section, one table per family ASIN,
  rendered above the existing "Keywords — Titles" table.
  - Columns: `Query · Volume · Purchases · Purch% · Cart% · Click% · Impr%`, sorted by
    Purchases desc.
  - The **lead ASIN** is badged ("drives title").
  - An **"in title ✓"** marker flags a query whose phrase currently appears in that row's
    Title or Item Highlight (reuses the existing substring-match used by the keyword
    highlighter).
- When SQP is unavailable, the section shows a one-line notice
  ("No SQP for this account — titles use Helium 10 volume") instead of the tables.
- The existing Helium 10 "Keywords — Titles" table is unchanged and stays separate.

## Data flow

```
S6.2 tab load
   └─ GET /api/seo/projects/[id]/sqp
        └─ getProjectSqp(projectId)
             clientIdCode → getIntentwiseAccountId → accountId
             fetchSqpData(accountId, last-8-weeks)
             filter to family ASINs → rank by purchases → pick lead ASIN
        → render per-ASIN SQP tables (+ "in title" markers)

Click "Generate Titles" (batch "titles")
   └─ POST /api/seo/claude/seo { batch: "titles", projectId, ... }
        └─ getProjectSqp(projectId)  (same module)
             available → prompt primary keywords = lead ASIN's ranked queries
             not available → Helium 10 fallback (unchanged)
        → Claude → Title (≤75) + Item Highlight (≤125)
        → existing post-processing + save to seoAsins.generatedContent (unchanged)
```

## Edge cases

| Case | Behavior |
|------|----------|
| No `account_id` mapping for the client | `available:false` (`no-account-mapping`); H10 fallback; UI notice. |
| Redshift timeout / error (30s cap in `ppc-queries`) | `available:false` (`redshift-error`); H10 fallback; non-blocking warning. |
| Family has SQP rows but all purchases = 0 | `available:false` (`no-sqp-rows`); H10 fallback. |
| One child ASIN has no SQP rows | Omitted from lead-ASIN calc; its UI table shows "no SQP rows". |
| Single ASIN (no variation family) | That ASIN is trivially the lead ASIN. |

## Out of scope (explicit)

- **Per-child pack suffixes in titles.** Today the app writes per-child titles with pack
  suffixes (e.g. `…- 30g Vial`, `…- 2-Pack`). The skill says pack belongs in the size
  attribute, not the title. This feature does **not** change that convention — it only
  changes which *keywords* are selected. Pack-stripping is a separate decision.
- SQP caching/snapshot table (live fetch chosen).
- Backend search terms and bullets keyword selection (still Helium 10).
- Any change to the Intentwise → Redshift ingestion pipeline.
- Step 7 of the skill (post-upload weekly impression/click-share validation loop) — a
  future analytics feature, not part of this title-generation change.

## Testing

- **Unit (TDD):** `rankByPurchases`, `pickLeadAsin`, `lastNFullWeeks`, and `getProjectSqp`
  fallback branches, against `SqpRow` fixtures. `fetchSqpData` and `getIntentwiseAccountId`
  mocked.
- **Route:** `GET /api/seo/projects/[id]/sqp` returns expected shape for available /
  unavailable; title route injects SQP block when available and falls back otherwise.
- **Manual (live Redshift):** open S6.2 for a client with Intentwise data (e.g. the
  ReadyRESCUE account), confirm per-ASIN tables render ranked by purchases with the lead
  ASIN badged, generate a title and confirm the top converting phrase is preserved.

## Files touched

| File | Change |
|------|--------|
| `src/lib/seo/sqp.ts` | **new** — ranking module + pure helpers |
| `src/lib/seo/sqp.test.ts` | **new** — unit tests |
| `src/app/api/seo/projects/[id]/sqp/route.ts` | **new** — read endpoint |
| `src/app/api/seo/claude/seo/route.ts` | inject SQP-ranked keywords into the `titles` prompt; H10 fallback |
| `src/app/seo/[id]/seo/page.tsx` | new collapsible per-ASIN SQP table + fetch + "in title" markers |
