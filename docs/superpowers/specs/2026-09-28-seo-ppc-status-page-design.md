# SEO ↔ PPC Status Page — Design

**Date:** 2026-09-28
**Status:** Draft — awaiting Manu's review
**Thread:** new (proposed Thread AA)

## 1. Purpose

A per-client page in the Hub that answers two questions for the SEO team:

- **A. Did it pay off?** For the keywords we put into a listing, how did their
  PPC performance change after the new listing went live?
- **B. Where are the gaps?** Which SEO keywords get no PPC traffic, and which
  converting PPC search terms are missing from the listing?

Audience: internal (admin/editor). Not client-facing in v1.

### What was said vs. assumed

| Said by Manu | Assumed (correct me) |
|---|---|
| Per-client SEO status page | Lives under the existing `/seo/clients/[clientId]` view as a new tab/section, not a new top-level route |
| Compare keywords used vs. PPC performance | "Ranked in PPC" = PPC performance metrics. **PPC data has no organic rank**; organic rank (Helium 10 / SQP) is out of scope for v1 |
| A + B | — |
| Add an approval date to the project; pull data from that period | The date is a manually editable "go-live date"; data pulled = an equal-length window **before** it as well as after, so A has a baseline |

## 2. Data sources (all existing)

| Need | Source | Where |
|---|---|---|
| Keywords placed in listing | `seo_passage_map.passages[].keywords_used` (S6), per ASIN | `src/lib/db/schema.ts` (seo_passage_map) |
| Fallback keyword set | `seo_keywords` rows with `priority_tier IN ('T1','T2')`, `is_negative = false` | `schema.ts` (seoKeywords) |
| Client → Intentwise account | `getIntentwiseAccountId(clientIdCode)` | `src/lib/forecast-redshift.ts` |
| PPC search-term metrics | `fetchSearchTermSummary(accountId, start, end)` | `src/lib/ppc-queries.ts` |
| PPC keyword metrics (top-of-search IS) | `fetchKeywordSummary(accountId, start, end)` | `src/lib/ppc-queries.ts` |
| Caching | `reports_cache` (cache_type + cache_key + jsonb) | `schema.ts` (reportsCache) |

Redshift is SELECT-only; nothing here writes to it.

## 3. Schema change (one column)

Add to `seo_projects`:

```
live_date  date  NULL   -- "Approval / go-live date", YYYY-MM-DD
```

- Nullable; no backfill. Stored and passed across module boundaries as a
  `YYYY-MM-DD` string (house rule), never a `Date`.
- Applied via a bespoke `scripts/_apply-00NN.ts` (next free number checked at
  plan time — not `drizzle-kit migrate`). Prod schema change needs Manu's
  explicit OK at execution time.
- Edited from: (1) the new status page header, (2) the SEO Manager project
  setup (S0) — a single date input. Saved via existing
  `PUT /api/seo/projects/[id]` (add `liveDate` to its accepted fields).

## 4. Windows

Given `live_date = L` and window length `N` ∈ {30, 60, 90} (default 30):

- **Before:** `L − N` … `L − 1`
- **After:** `L` … `min(L + N − 1, yesterday)`
- If the after window is shorter than N (listing went live recently), show the
  actual day count and compare **per-day averages**, not totals, so a 9-day
  after-window isn't unfairly compared with a 30-day before-window.
- Project with no `live_date`: Section A shows an empty state
  ("Set the go-live date to see impact"); Section B still works using the last
  N days.

## 5. Matching

`normalize(s) = lower(trim(s))` with internal whitespace collapsed to one space.
A keyword matches a PPC search term when `normalize(keyword) === normalize(search_term)`.
ASIN targets (`is_asin = true`) are excluded from matching and from Section B.

Exact-normalized match only in v1. Fuzzy/contains matching is explicitly out
of scope (YAGNI until exact proves too sparse).

## 6. Page layout

Route: `/seo/clients/[clientId]` — new **"PPC Status"** tab alongside the
existing view in `seo-client-view.tsx`.

**Header:** project selector (the client's SEO projects; "All projects"
aggregates keyword sets), go-live date (editable, per project), window
selector 30/60/90, data freshness note.

**Section A — Did it pay off?** (one project at a time; disabled on "All")
Table, one row per keyword used: keyword · tier · ASIN(s) · impressions ·
clicks · spend · orders · sales · ROAS — each shown before → after with Δ%.
Sorted by after-window sales desc. Footer totals row.

**Section B — Gaps** (window = after-window, or last N days if no date)
Three lists:
1. **In listing, no PPC traffic** — SEO keywords with 0 impressions as a
   search term. Shows tier + search volume + suggested bid from `seo_keywords`.
2. **Converting in PPC, not in listing** — search terms with ≥1 order not in
   the keyword set. Sorted by orders desc, top 50.
3. **In both** — count + link to Section A.

All tables use existing shadcn table primitives and DESIGN.md tokens.

## 7. API

`GET /api/seo/clients/[clientId]/ppc-status?projectId=…&window=30`

Response (shape, not final types):

```
{
  project: { id, name, liveDate: string | null },
  windows: { before: {start,end,days} | null, after: {start,end,days} },
  accountId: number | null,
  sectionA: Array<{ keyword, tier, asins, before: Metrics|null, after: Metrics }> | null,
  sectionB: { noTraffic: [...], missing: [...], bothCount: number },
  cachedAt: string
}
```

- Auth: `getAuthSession`; editor-or-above (`isEditorOrAbove()`), same as the
  SEO pages.
- Redshift results cached in `reports_cache` with
  `cache_type = 'seo-ppc-status'`, `cache_key = accountId|start|end`, TTL 24h
  (past windows never change; the only live edge is "yesterday").
- Pure logic (windowing, normalize/match, aggregation, gap lists) lives in
  `src/lib/seo/ppc-status.ts` with no DB/Redshift imports, so it is fully
  unit-testable.

## 8. Error handling

| Case | Behaviour |
|---|---|
| Client has no Intentwise account | 200 with `accountId: null`; UI shows "No PPC account linked for this client" |
| Redshift timeout/error | 502 with message; UI shows retry; no partial cache write |
| Project has no S6 `keywords_used` | Fall back to S2 T1/T2 keywords; UI labels the set "Research keywords (listing not generated yet)" |
| `live_date` in the future | Section A empty state "Goes live on …" |

## 9. Testing

- Unit (vitest): `ppc-status.ts` — window maths incl. short after-window and
  per-day normalisation; normalize/match; ASIN exclusion; each gap list;
  S6→S2 fallback selection.
- Route test: auth gate, null account, cache hit vs miss (Redshift mocked).
- `tsc --noEmit` judged by filename (vitest doesn't typecheck).
- Browser pass on PORT=3100 against one real client with a set go-live date.

## 10. Out of scope (v1)

Organic rank (Helium 10 rank history / SQP) · client portal version ·
fuzzy matching · nightly snapshots · auto-detecting go-live from Amazon
listing-change data · write-back of suggestions to PPC campaigns.
