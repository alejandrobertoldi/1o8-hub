# SEO ↔ PPC Status v2 — per-ASIN live versions

**Date:** 2026-09-29 · **Thread:** AA · **Supersedes:** Section A and §3 (go-live date) of
`2026-09-28-seo-ppc-status-page-design.md`. Section B (gaps), permissions, caching approach and
the tab's location are unchanged from that spec.

## 1. Purpose

One ASIN can be touched by several SEO projects over time, but only one version of its listing is
live on Amazon. For each ASIN, Manu wants to see the PPC performance of the keywords that the live
version actually uses (title, bullets, description, backend keywords) before vs after that version
went live. The page is stacked by product (ASIN), not by project.

## 2. Decisions (locked by Manu, 2026-09-29)

| # | Decision |
|---|---|
| D1 | "Live" is set **manually**: Manu picks the project + ASIN(s) and the go-live date. |
| D2 | Live status is per **project + ASIN**. A newer project going live on an ASIN **deprecates the older project for that ASIN only**; the older project stays live on its other ASINs. A project built for a variation family is still uploaded ASIN by ASIN. |
| D3 | The live listing text is read from **BigQuery `MFBibleApp.SEO`**. A project named `…_vNN` always corresponds to BigQuery `SEOVersionNumber = NN` for each of its ASINs. |
| D4 | **Export before live.** A project + ASIN can only be marked live when its `V{NN}` row exists in BigQuery. No fallback to the Hub product record. |
| D5 | Tracked keywords = the project's **S2 research list (all tiers)** whose normalized phrase appears in the live version's text. S2 gathers the list; S6 decides which are used; the exported text therefore carries S6's final choice. |
| D6 | PPC numbers per ASIN come only from **ad groups that advertise that ASIN** (search terms joined through ad group → advertised ASIN). Shared ad groups are flagged, not split. |

## 3. Data model

New table **`seo_project_asin_live`** (migration **0121**; 0119 is this thread's, 0120 is Thread AB's):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `project_id` | uuid → `seo_projects.id` on delete cascade | |
| `asin` | varchar(20) not null | the ASIN string (not `seo_asins.id`, so status survives ASIN row churn) |
| `client_id_code` | varchar(100) not null | denormalized for per-client reads |
| `status` | varchar(20) not null | `live` \| `deprecated` |
| `live_date` | date not null | YYYY-MM-DD string mode |
| `deprecated_date` | date null | set when a newer project goes live on this ASIN |
| `deprecated_by_project_id` | uuid null | the project that took over; used by undo |
| `version_number` | integer not null | the `NN` parsed from the project name at go-live time |
| `created_at`, `updated_at` | timestamptz | |

Constraints: unique (`project_id`, `asin`); **partial unique index on (`client_id_code`, `asin`) where
`status = 'live'`** — at most one live project per ASIN, enforced by Postgres.

`seo_projects.live_date` (migration 0119, already applied in prod) is **no longer read or written**.
It is not dropped (additive only). The one value set in prod (ReadyRESCUE v01 = 2026-06-02) is
carried over manually once that project is exported (see §9).

## 4. Go-live rules

**Mark live** — `POST /api/seo/projects/[id]/live` with `{ asins: string[], liveDate: "YYYY-MM-DD" }`
(editor+):

1. `liveDate` validated by the existing `parseLiveDate` (years 2000–2100); else 400.
2. The project name must end in `_vNN` (case-insensitive); else 400 "Project name has no version".
3. Every ASIN must belong to the project (`seo_asins`); else 400.
4. For each ASIN, BigQuery must hold a row with that ASIN and `SEOVersionNumber = NN`; any missing →
   **409** `{ missing: [asin…] }` with message "Export V{NN} for these ASINs first". Nothing is
   written if any ASIN fails (all-or-nothing).
5. In one Postgres transaction per request: for each ASIN, any other project's `live` row on that
   (client, ASIN) becomes `deprecated` with `deprecated_date = liveDate` and
   `deprecated_by_project_id = this project`; then this project's row is upserted as `live`.
   Re-marking an already-live pair only updates its `live_date`.

**Mark not live** — `DELETE /api/seo/projects/[id]/live` with `{ asins: string[] }`: deletes this
project's rows for those ASINs; any row it deprecated (`deprecated_by_project_id = this project`) on
the same ASIN goes back to `live` with `deprecated_date` and `deprecated_by_project_id` cleared.
Same transaction rule.

A deprecated row is never edited directly; it only changes through the rules above.

## 5. Project status pill

The project cards already carry a manual status pill (`ProjectStatusPicker`, statuses
`draft · in_progress · completed · live · deprecated · archived`). That pill **is** the status pill;
no second pill is added.

- `live` and `deprecated` become **derived** from `seo_project_asin_live` and are written to
  `seo_projects.status` by the go-live / not-live routes: any live row → `live`; no live row and at
  least one deprecated row → `deprecated`; no rows left after "mark not live" → `completed`.
  A deprecation caused by another project's go-live updates the older project's status the same way.
- In the picker, choosing **live** opens the go-live popover (ASIN checkboxes, one date input,
  save-on-blur/Enter + error toast, "Export V{NN} first" message on 409, and per-ASIN rows showing
  status, go-live date and "deprecated by …"). **deprecated** is not a manual choice. The other four
  statuses stay manual. `PATCH /api/seo/projects/[id]` rejects `status: "live" | "deprecated"` with
  400 "Use Go live".
- When the popover is open it shows **k/n ASINs live**. (The card pill itself shows the status label
  only; the k/n count lives in the popover.) Existing prod rows already set to `live`/`deprecated`
  manually are left as they are.

## 6. Tracked keywords per ASIN

For each live row (project P, ASIN A, version NN):

1. Read the BigQuery row for (A, NN): `ItemName`, `DetailedBulletPoint1–5`, `ProductDescription`,
   `GenericKeyword1–5`. When several SKUs share the ASIN, use the first row (the same rule as
   `versionsForListing` in `src/lib/seo/baseline-source.ts`).
2. Normalize each field and each keyword with a new `normalizePhrase` (lowercase, every character
   that is not a letter or digit → space, collapse spaces). The existing `normalizeTerm` (used to match
   Redshift search terms) is unchanged. Concatenate bullets into one "Bullets" field and the five generic keywords into one
   "Backend" field.
3. Take P's S2 keywords (`seo_keywords`, all tiers, `is_negative = false`), normalized.
4. A keyword is tracked when its normalized phrase appears in a field **on word boundaries**
   (" dog first aid kit " inside " … a dog first aid kit for … "), not as a raw substring.
5. Record which fields matched → pills **T / B / D / K** (Title, Bullets, Description, Backend).
6. Search terms Redshift flags as ASIN targets (`is_asin`, the existing exclusion in `ppc-status.ts`) are excluded.

## 7. PPC numbers per ASIN

One Redshift read per client and window setting, returning **per (advertised ASIN, search term,
window)** sums — the before/after split is done in SQL from a `VALUES` list of each live ASIN's own
windows, so the cached payload stays small (no date-level rows):

```sql
WITH w(asin, before_start, before_end, after_start, after_end) AS (VALUES ($2, $3::date, $4::date, $5::date, $6::date), …),
pa AS (SELECT DISTINCT adgroupid::varchar AS ag, asin FROM amazon_source_data.ad_sponsoredproducts_productads WHERE account_id = $1)
SELECT w.asin, st.search_term,
       CASE WHEN st.report_date BETWEEN w.before_start AND w.before_end THEN 'before' ELSE 'after' END AS win,
       SUM(st.ad_impressions) AS ad_impressions, SUM(st.ad_clicks) AS ad_clicks, SUM(st.ad_spend) AS ad_spend,
       SUM(st.ad_revenue) AS ad_revenue, SUM(st.ad_orders) AS ad_orders
FROM intentwise_ecommerce_graph.searchterm_summary st
JOIN pa ON pa.ag = st.adgroup_id::varchar
JOIN w ON w.asin = pa.asin
WHERE st.account_id = $1 AND NOT st.is_asin AND st.search_term IS NOT NULL
  AND (st.report_date BETWEEN w.before_start AND w.before_end OR st.report_date BETWEEN w.after_start AND w.after_end)
GROUP BY 1, 2, 3
```

Cached in `reports_cache` type `seo-ppc-status-asin`, key
`accountId|<asin:before_start:after_end, sorted, joined by ",">`, 24h. Uses `queryRedshiftOrThrow`
with `retry: false`; failure → 502, never cached. Redshift stays SELECT-only. ASINs whose after
window is empty (live today) still get a before window and an empty after.

Also from the same `pa` set: for each ASIN, the number of **other** ASINs sharing any of its ad
groups → the "shared ad group" note.

Measured 2026-09-29 on ReadyRESCUE (account 1899670): the join works (B0DCLWMB4Y 865 terms / 232
orders, B0CLMBGMS6 787 / 147 over 05-03→07-01); three newer ASINs share one ad group and show
identical numbers — exactly the case the note exists for. **Known limitation:** `productads` is a
current snapshot, not a history, so an ASIN added to an ad group recently counts for the whole window.
The page states this in a one-line footnote.

Windows: per ASIN, `computeWindows(liveDate, windowDays, today)` (existing), 30/60/90, default 30,
per-day averages, same delta and ROAS formatting as now (orders/clicks via `fmtAvg`).

## 8. Page layout (PPC Status tab)

Header row: ASIN filter (All / one ASIN), window pills 30/60/90, "Data as of …" (cache fetched-at).
The project dropdown and project-level date input are removed.

Then **one block per live ASIN**, sorted by after-window sales desc:

- Block header: ASIN · short title (first 60 chars of `ItemName`) · project name + `V{NN}` ·
  go-live date · window label · shared-ad-group note when applicable.
- Table: Keyword · where-pills (T/B/D/K) · Tier · Impr/Clicks/Spend/Orders/Sales before · after · Δ ·
  ROAS before → after (same columns as today minus the old ASINs column), sorted by after-window
  sales desc, **Total** row per block.
- Empty states inside a block: "No tracked keywords found in V{NN}" (text matched none of S2);
  "Live today — no after-window yet".

Below the blocks: **Not tracked** — the client's ASINs (from its SEO projects) with no live row, as a
compact list with "Mark live from project…" hint. Then Section B (gaps) unchanged.

Client with no Intentwise account: "No PPC account linked for this client" (unchanged).

## 9. Migration of existing state

- 0119's `seo_projects.live_date` stays in the schema, unused. ReadyRESCUE v01 (`653b548f…`) has
  `live_date = 2026-06-02` in prod; after v01 is exported to BigQuery, Manu marks it live on its
  ASINs through the new UI with that date. No automatic backfill.
- The current branch's PATCH `live_date` handling on `/api/seo/projects/[id]` is removed.

## 10. Errors

- BigQuery read fails → 502 "Listing versions unavailable" + Retry; not cached.
- Redshift read fails → 502 + Retry; not cached (unchanged rule).
- Mark live with missing export → 409 with the ASIN list; UI toast "Export V{NN} for B0…, B0… first".
- Unique-live violation (race between two users) → 409 "Another project just went live on this ASIN —
  reload".
- Raw Redshift/BigQuery error text is not returned to the browser (closes old M8 for new routes).

## 11. Testing

- Unit: go-live transaction rules (deprecate other project, all-or-nothing, re-mark, undo restores
  the deprecated row); phrase matcher (word boundaries, field pills, ASIN exclusion); per-ASIN window
  split from date-level rows; shared-ad-group count; project pill derivation (4 cases).
- Route tests: POST/DELETE live (400 cases, 409 missing export, happy path), GET status (per-ASIN
  blocks, not-tracked list, 502s).
- tsc by filename against baseline; eslint on touched files.
- Browser pass (headless, PORT 3100): ReadyRESCUE after v01 is exported and marked live.

## 12. Out of scope

- Exporting to BigQuery (existing export flow is used as-is).
- S0 project-setup go-live editor (deferred earlier, R5).
- Historical ad-group membership (snapshot limitation stated on the page).
- Client portal.
