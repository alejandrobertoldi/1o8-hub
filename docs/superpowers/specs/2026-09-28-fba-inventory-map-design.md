# FBA Inventory Distribution Map — Design

- **Date:** 2026-09-28
- **Thread:** Z
- **Status:** Design approved in chat (sections 1–3); spec review 2026-09-28 APPROVED with four fixes (§3.2 tolerance, no bake script, census-division callout, availableMonths cache + fixture units)
- **Surface:** Hub only (staff), `/reports/fba-inventory-map`

## 1. Purpose

Show, for one account and one month, **where Amazon holds the account's FBA stock** and **where its customers are**, so staff can see placement-vs-demand mismatches at a glance.

- **Dots** = average units on hand per fulfilment-center *metro*.
- **State shading** = customer demand (units ordered) in the same calendar month.

Success = a staff member picks an account and a month and within one screen can answer "which high-demand states have little stock nearby?" and "how much stock could we not place on the map?".

### Out of scope (v1)
- Portal / client-facing version.
- "Current stock" from the inventory ledger — v1 is monthly storage-fee data only.
- Shipments-based demand (`sellercentral_fbaamazonfulfilledshipments_report_deduplicated`): `LIMIT 1` timed out twice and the table holds buyer PII. Never read it.
- Any runtime projection library (d3-geo is not installed and will not be).
- Filtering FBM out of demand (no channel column exists — see §4.4).

## 2. Measured facts this design rests on (2026-09-28, read-only probes)

| Fact | Value |
|---|---|
| Source table | Redshift `amazon_source_data.sellercentral_fbastoragefees_report` |
| Distinct US FC codes | 433 over 365d; 358 in 2026-08 |
| `month_of_charge` | `'YYYY-MM'` string; a month lands once, ~15th of the next month (2026-08 downloaded 2026-09-15) |
| Accounts per month | swings: Jun 24, Jul 14, Aug 20 ⇒ "no report for this month" is normal |
| Aug 2026 total | ≈109,507 avg units; largest account 4283010 = 17,840 rows / 322 FCs |
| Unit share by FC rank (Aug) | top25 29.2% · top50 48.0% · top100 76.0% · top150 93.5% · top200 98.8% · top300 99.9% |
| `S***` codes | 118 FCs / 13.9% of units; mostly S + state (SFL4, STX9, SCA7) but SAT SAN SAV SMF SNA SWF SDF SLC SCK SBD SBN SYR SJA are real metros and SAX SNL SAH SDC SBW are not states |
| `X***` codes | 13 FCs / 6.2% of units |
| FC code hygiene | codes and `country_code` can carry literal quote characters ⇒ `btrim(col, '''" ')` |
| Demand table | Postgres `order_geography_lines` (schema.ts `orderGeographyLines`): account × order × purchase_day × ship_state × asin × units; index (account_id, purchase_day); trailing 365d; 16 Active accounts; **includes FBM, no FC, no channel column** |
| Map geometry | `src/lib/us-map-paths.ts`: baked Albers USA, viewBox 960×569.2, `US_STATE_PATHS`, `US_STATE_LABEL_POINTS`, `US_MAP_CODES`; no bake script exists for it |

The "top 25 + other" idea is dead: it would leave ~70% of units off the map. The lookup must cover ≥ top 150 FCs by units (≥93.5%).

## 3. Architecture

Four units, each testable on its own:

```
fc-locations.ts ──► fba-inventory-map/aggregate.ts ──► /api/reports/fba-inventory-map ──► /reports/fba-inventory-map page
(static lookup)      (pure: rows → dots/unplaced)       (Redshift + Postgres + cache)      (UsChoropleth + dot overlay + table)
      ▲
src/lib/albers.ts (pure projection math, 3 fitted constants) + alignment test
```

### 3.1 `src/lib/fc-locations.ts` (static lookup, no I/O)
- `FC_METROS: Record<string, { name: string; state: string; lat: number; lon: number; x: number; y: number }>` — ~130 metro prefixes (IATA-style: `PHX`, `SDF`, `BDL`, …). Entries hold `lat`/`lon` only; `x`/`y` are computed once at module load via `projectAlbers()` from `src/lib/albers.ts` into the `us-map-paths.ts` viewBox (not stored as literals, so they can never go stale against lat/lon).
- `FC_OVERRIDES: Record<string, string>` — ~25 full codes or prefixes → metro key, for codes the rules get wrong (`KRB`, `MQY`, `LUK`, `IGQ`, `GYR`, `PCW`, `RMN`, `TEB`, `MMU`, `HGR`, `AVP`, the S-collisions above, and the `X***` codes that can be resolved).
- `STATE_ANCHORS` — reuse `US_STATE_LABEL_POINTS` for approximate placement; do not duplicate coordinates.
- `resolveFc(code: string): { kind: "metro"; metro: string; approximate: false } | { kind: "state"; state: string; approximate: true } | { kind: "unplaced" }`

Resolution order (first match wins):
1. Normalise: `trim`, strip quotes, upper-case.
2. Exact code in `FC_OVERRIDES`.
3. 3-letter prefix in `FC_OVERRIDES`.
4. 3-letter prefix in `FC_METROS`.
5. `S` + 2-letter US state code (`SFL4` → FL) → state anchor, `approximate: true`.
6. Otherwise `unplaced`.

Explicit entries (2–4) always beat the S+state rule (5), so `SAT`/`SLC`/`SDF`… resolve to their real metros.

### 3.2 `src/lib/albers.ts` + fit + alignment test

**Correction to the chat-approved design (found in spec self-review):** the chat design said "a test re-projects state label points and requires ≤1px error against `US_STATE_LABEL_POINTS`". That test cannot work. The label points are described in `us-map-paths.ts` as "centroid-ish" anchors: the centroid of a projected polygon is not the projection of any known lat/lon. The file also records no fit parameters (scale/translate), and its AK/HI/PR positions (AK `[130.7, 49.7]` top-left, HI `[940.6, 71.4]` top-right, PR present) are **not** the standard Albers USA insets. The replacement:

- `src/lib/albers.ts` — hand-written conic equal-area (Albers) forward projection for the lower 48, standard parallels 29.5°N / 45.5°N, origin 96°W / 38.7°N, plus three fitted constants (`SCALE`, `TX`, `TY`). Pure math (~15 lines), **no d3-geo, no new dependency**. This is not a projection *library*; it is app code, so the test exercises exactly what the page runs. **No bake script** (review fix 2).
- **Fit recovery (one-off, dev-only):** `scripts/fit-albers.ts` recovers `SCALE`/`TX`/`TY` by linear least squares (x = S·u + TX, y = −S·v + TY on the unit-scale projection (u, v)) from known geographic **tripoints/corners** matched to the nearest shared vertex in `US_STATE_PATHS`. Fit set examples: Four Corners (CO/UT/AZ/NM, 36.999°N 109.045°W); CO/WY/NE, WY/SD/NE, ID/WY/MT, OK/TX/NM corners; KS/NE/CO/MO corners. The script prints the constants and the per-point residuals; the constants are pasted into `albers.ts`.
- **Tolerance (review fix 1):** `us-map-paths.ts` is 47 KB for 53 shapes ⇒ heavily simplified, so tripoint vertices may be displaced by simplification itself. Before fixing the pass mark, the fit script measures the held-out error. Pass mark = **max(2px, measured max held-out error + 0.5px)**, recorded as a constant with the measurement in a comment. Dots are 3–22px, so ≤2–3px is invisible. The test fails only if error exceeds that. If measured held-out error exceeds **5px**, stop and report — that means the projection parameters (parallels/origin), not simplification, are wrong.
- **Alignment test (`albers.test.ts`):** hold out ≥4 tripoints *not* used in the fit, project them, assert each lands within the pass mark of its nearest path vertex.
- **Lower 48 only.** FCs in AK, HI or PR (none of the top 150 by units) use the `approximate` state-anchor path from `US_STATE_LABEL_POINTS` instead of projection.
- **Lookup tests (`fc-locations.test.ts`):** every override target exists in `FC_METROS`; collision codes (`SAT`, `SLC`, `SDF`, `SAN`, `SAV`, `SMF`, `SNA`, `SWF`, `SCK`, `SBD`, `SBN`, `SYR`, `SJA`) resolve to metros, not states; `SFL4` → FL approximate; `SAX1`-style non-state codes → unplaced unless overridden; quoted input (`'"PHX7"'`) normalises; every metro's computed x/y lies inside the 960×569.2 viewBox **and inside (or within 3px of) its own state's path** (catches lat/lon typos).
- **Coverage fixture (review fix 4b):** `src/lib/__fixtures__/fc-top150-2026-08.json` = `[{ code, units }]` for the top-150 Aug 2026 FC codes, **units summed across all accounts** (no account ids, no per-account data). The test asserts ≥ 93% of fixture units resolve to `metro` or `state`.

### 3.3 `src/lib/fba-inventory-map/aggregate.ts` (pure)
Input: storage-fee rows `{ fc, units, fee }[]` + demand rows `{ state, units }[]`. Output: the response payload (§3.4). No I/O, fully unit-tested. Merges FCs of the same metro into one dot; state-approximate FCs merge per state into one hollow dot at the state anchor.

### 3.4 `GET /api/reports/fba-inventory-map?accountId=…&month=YYYY-MM`
Follows `src/app/api/reports/order-geography/route.ts`: `requireAuthOrCron`, `getEffectiveAccountId`, `getCachedReport` / `setCachedReport`. Hub staff only.

Response:
```ts
{
  accountId: string;
  month: string;                 // 'YYYY-MM'
  availableMonths: string[];     // 'YYYY-MM', newest first, months with a storage-fee report for this account
  dots: {
    key: string;                 // metro key, or 'state:FL' for approximate
    label: string;               // "Phoenix, AZ" / "Florida (approx.)"
    state: string;
    x: number; y: number;
    units: number;
    share: number;               // of TOTAL units (placed + unplaced)
    approximate: boolean;
    fcs: { code: string; units: number; fee: number }[];
  }[];
  unplaced: { units: number; share: number; fcs: { code: string; units: number; fee: number }[] };
  totals: { units: number; placedUnits: number; fee: number };
  demand:
    | { status: "ok"; byState: Record<string, number>; totalUnits: number; note: "includes_fbm" }
    | { status: "unavailable"; reason: "account_not_mirrored" | "month_outside_window" | "no_orders" };
  divisions:                     // null when demand.status !== "ok"
    | { division: string; demandShare: number; stockShare: number; gapPts: number }[]
    | null;
}
```

## 4. Data and edge cases

### 4.1 Stock query (Redshift, SELECT-only, via `queryRedshiftOrThrow`)
```sql
select btrim(fulfillment_center, '''" ')        as fc,
       sum(average_quantity_on_hand::float)     as units,
       sum(estimated_monthly_storage_fee::float) as fee
from amazon_source_data.sellercentral_fbastoragefees_report
where account_id = $1
  and month_of_charge = $2
  and btrim(country_code, '''" ') = 'US'
group by 1
```
- Parameterised; `month` validated as `^\d{4}-(0[1-9]|1[0-2])$` before use; `accountId` validated against the caller's permitted accounts.
- **Plan task 1 must verify, read-only:** (a) the fee column name (`estimated_monthly_storage_fee` is assumed, not yet measured); (b) whether a month can be downloaded more than once for the same account (if so, restrict to the latest `download_date` per account-month to avoid double-counting).
- `availableMonths`: `select distinct month_of_charge … where account_id = $1 order by 1 desc limit 24`.

### 4.2 Demand query (Postgres)
Sum `units` from `order_geography_lines` grouped by `ship_state` where `account_id = $1` and `purchase_day` in `[month-01, first day of next month)`. Dates passed as `'YYYY-MM-DD'` strings. States normalised to `US_MAP_CODES`; unknown/blank states are counted in `totalUnits` but not shaded.

### 4.3 Caching
Two keys (review fix 4a):
- `fba-inventory-map:months:{accountId}` → `availableMonths`, **TTL 12h**. Needed first on every request (it resolves the default month), and a new month lands ~15th of the following month, so a 7-day TTL would hide it for up to a week.
- `fba-inventory-map:{accountId}:{month}` → the payload minus `availableMonths`, **TTL 7 days**: a month's storage-fee report doesn't change after it lands. The route merges the fresh `availableMonths` into the response.
- An empty month (no report) is cached with the 12h TTL, not 7 days, so a month that lands later is picked up.

### 4.4 Edge cases
| Case | Behaviour |
|---|---|
| No `month` param | Default to `availableMonths[0]` |
| Month has no storage-fee report | 200 with empty `dots`; UI shows empty state listing `availableMonths` as clickable pills |
| Account has no report in any month | Empty state: "No FBA storage-fee reports for this account" |
| Demand unavailable (non-Active account, month > 365d old, zero orders) | Dots render; shading off; banner states the reason |
| Demand includes FBM | Permanent micro-note under the legend: "Demand includes FBM orders." Accepted v1 limitation — no channel column exists |
| Unplaced FCs | Units + share always shown in a stat and as rows in the table, tagged "unplaced" |
| Approximate dots | Hollow ring; tooltip says "location approximate (state only)" |
| Stock-share for the callout | Computed over **placed** units (metro + approximate), per census division; UI labels it as such |
| Redshift timeout/error | 502 with message; UI error card with retry; nothing cached |

## 5. UI (per DESIGN.md)

Page `src/app/reports/fba-inventory-map/page.tsx`, following the `/reports/order-geography` shell.

- **Header:** split jammed two-word heading — "Inventory" `text-foreground font-bold` + "Map" `text-brand`. Account picker and month picker are `h-9 rounded-full` pill selects.
- **Map card** (`rounded-[18px] border bg-card p-5`): `UsChoropleth` renders the demand shading with its existing orange ramp (`heatCellStyle`). An SVG overlay in the same viewBox draws dots:
  - radius ∝ √units (min 3px, max ~22px, scaled to the account's largest dot);
  - fill = `--foreground` (Off Black / theme foreground) at ~85% opacity with a `--card`-coloured 1.5px stroke — neutral so it never competes with the orange demand ramp;
  - approximate dots = hollow ring, same stroke colour as the solid fill;
  - drawn largest-first so small dots stay on top.
  - Hover tooltip: metro label, FC codes, units (`tabular-nums`), share of units, fee.
  - Legend: demand ramp + dot-size key + hollow = approximate + FBM note.
- **Stat row:** total units · placed % · unplaced units/share · est. storage fee. Micro-labels `text-[10px] font-bold uppercase text-muted-foreground`.
- **Placement-vs-demand callout card (review fix 3):** compares at **US Census division** level (9: New England, Middle Atlantic, East North Central, West North Central, South Atlantic, East South Central, West South Central, Mountain, Pacific; DC → South Atlantic; AK/HI → Pacific; PR excluded from divisions). Rationale: Amazon serves states from neighbouring FCs (NY from NJ/PA), so a per-state comparison would permanently flag FC-light states red. All 9 divisions listed, sorted by demand share; each row shows demand share, stock share (placed units in that division), and the gap in points. Gap badge (`rounded-full`, DESIGN.md semantic badge colours): red = under-stocked by >5 pts, amber = within ±5 pts, green = over-stocked by >5 pts (±5 remains a starting guess; one constant). Hidden when demand is unavailable. `STATE_TO_DIVISION` lives in `src/lib/fba-inventory-map/divisions.ts`.
- **FC table card:** sortable columns FC · metro · state · units · share · est. storage fee; unplaced rows tagged with a stone "unplaced" badge, approximate rows with an amber "approx." badge. Default sort units desc.
- **Nav:** add the page to the hub Reports navigation next to Order Geography, gated by the same permission as `/reports/order-geography`.
- Hub-only surface ⇒ `--brand` usage is permitted; the portal `no-hub-orange` rule does not apply.

## 6. Testing

- `albers.test.ts` — held-out tripoint alignment within the measured pass mark (§3.2).
- `fc-locations.test.ts` — resolution rules, collisions, normalisation, viewBox + in-own-state bounds, ≥93% fixture coverage (§3.2).
- `divisions.test.ts` — every `US_MAP_CODES` state except PR maps to exactly one of 9 divisions.
- `aggregate.test.ts` — metro merging, per-division stock/demand shares, approximate-per-state merging, unplaced bucket, shares sum to 1, placed-only stock share, empty inputs, demand-unavailable passthrough.
- `route.test.ts` — month validation (400), default month, empty month (12h TTL), months cache separate from payload cache, demand-unavailable reasons, cache hit/miss, Redshift error → 502 not cached. Redshift and DB mocked.
- Component test — renders dots/hollow dots/unplaced stat, callout hidden without demand, FBM note present, table sort.
- Gates: vitest, then `node_modules/.bin/tsc --noEmit` judged by filename; browser pass on `PORT=3100` in the worktree (needs Manu to copy the env file in) against one high-FC account (4283010) and one month with no report.

## 7. Build sequence (for /writing-plans)
1. Read-only verification probe (§4.1 a/b) — never committed.
2. `albers.ts` + fit script + alignment test; `fc-locations.ts` + lookup/coverage tests; `divisions.ts`.
3. `aggregate.ts` + tests.
4. Storage-fee + demand queries and the route + tests.
5. Page, map overlay, callout, table per DESIGN.md + component tests.
6. Nav entry; vitest + tsc; browser pass.

## 8. Hard constraints
- Redshift is SELECT-only; never touch the fulfilled-shipments table.
- Dates cross module boundaries as `'YYYY-MM'` / `'YYYY-MM-DD'` strings, never `Date`.
- No runtime projection library in app code.
- `scripts/_tmp-fc-*` probes are never committed.
- No push, deploy, merge or prod write without Manu's per-action OK.

## 9. Additions (2026-09-28, approved by Manu after plan review)

### 9.1 Product (ASIN) filter — conditional on the probe
Account-level shares can hide per-product misplacement (product A stocked West with East buyers, product B the reverse, the account looks balanced). v1 therefore adds an optional product filter that narrows BOTH the dots (storage-fee rows) and the demand shading (`order_geography_lines.asin`) to one ASIN.
- **Precondition:** plan Task 1 must confirm the storage-fee table has an ASIN column. If it does not, §9.1 is dropped (no half-feature) and the picker never renders.
- Route: optional `asin` param, upper-cased, validated `^[A-Z0-9]{10}$` (else 400). Payload cache key becomes `{accountId}:{month}:{asin|all}`.
- Response gains `asin: string | null` and `asins: { asin: string; units: number; title: string }[]` (top 200 ASINs by avg units on hand for the month, titles via `resolveCatalog`, fallback = the ASIN). ASIN list cached 7d under its own key, only when non-empty.
- UI: `h-9 rounded-full` "Product" select, "All products" first; hidden when `asins` is empty; reset on account change.

### 9.2 Link to Order Geography
The section shows "View these orders in Order Geography →" linking to `/reports/order-geography?start={month}-01&end={last day of month}`. The account carries over via the shared `ReportControlsProvider` (client-side navigation). `/reports/order-geography` gains optional `start`/`end` query params (validated `YYYY-MM-DD`, start ≤ end) that open its range picker in "custom" mode; absent/invalid params keep today's default (trailing 365 days). The page wraps its `useSearchParams` consumer in `<Suspense>`.

## 10. Superseded UI (2026-09-29)

The per-metro dot map in §5 is replaced by a per-state circle map + state-detail side panel: see `docs/superpowers/specs/2026-09-29-fba-map-state-view-design.md`. All non-UI sections here remain binding.
