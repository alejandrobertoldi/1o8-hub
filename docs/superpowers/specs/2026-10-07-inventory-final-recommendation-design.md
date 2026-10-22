# Inventory "Final" recommendation, sent snapshots & declutter — design

- **Thread:** AG (slice 1 of the inventory-page redesign)
- **Date:** 2026-10-07
- **Status:** approved in chat section-by-section; awaiting written-spec review
- **Predecessor:** `95b8ed369` — double-count fix (stock = available + inbound + reserved; fallback health supply-at-FBA; unfulfillable excluded). Stands unchanged.

## 1. Goal

The hub page `/sales-summary/inventory` replaces the team's spreadsheet
`All account inventory recommendations.xlsx` (30 client tabs). An account manager must be
able to: open a client, see **one** number per SKU to send, override it with a reason,
and keep a dated record of what was sent. Without those three the team keeps the sheet.

### In scope (slice 1)
- (2) One **Final** column: per-client method + configurable windows + uplift, per-SKU override + note, negatives shown as overstock.
- (5) **Mark as sent**: frozen snapshot, published to the portal, spreadsheet-layout `.xlsx` export, send history.
- (6) Declutter: summary strip, Needs-action filter, sticky columns, collapsible column groups.

### Out of scope (each gets its own spec later)
- (3) AWD on-hand / in-transit columns (feed covers 3 accounts).
- (4) Amazon restock report as a cross-check.
- Vendor Central accounts.
- Emailing clients from the hub.
- Dropping the legacy `pct_90d / pct_q1 / pct_avg` columns.

## 2. Locked decisions (from the brainstorm)

| # | Decision |
|---|---|
| Q1 | Slice 1 = items 2 + 5 + the declutter part of 6. |
| Q2 | Per-client method mirrors the sheet: `recent` / `seasonal` / `average`, recent-window length, arbitrary seasonal date range, uplift %. Per-SKU override + note on top. |
| Q3 | Portal shows the **latest sent snapshot** with its date. Notes / method / override markers never reach the portal. Before a client's first send, the portal keeps today's view. |
| Q4 | Overrides are sticky until cleared; always show set-by / set-at / live calc beside them; flagged when \|override − liveCalc\| / max(\|liveCalc\|, 1) > 25%. |
| Q5 | "Mark as sent" = save snapshot + publish to portal + download xlsx. **No email.** History of sends, each re-downloadable. |
| Q6 | Compact default: sticky product columns + Final; four collapsible groups; summary strip; Needs-action filter. |

## 3. Data model

One migration. Number taken at implementation time (0118 is the latest on `main` as of
2026-10-07; Thread AF may claim 0119). Applied via a bespoke `scripts/_apply-00NN.ts`
(house pattern; never `drizzle-kit migrate`). **Applying to prod requires Manu's explicit OK.**

### 3.1 `inventory_rec_settings` — add columns (additive only)
| column | type | default | notes |
|---|---|---|---|
| `method` | text | `'recent'` | CHECK in (`recent`,`seasonal`,`average`) |
| `recent_days` | integer | `90` | CHECK 7–365 |
| `seasonal_start` | text NULL | — | `YYYY-MM-DD` |
| `seasonal_end` | text NULL | — | `YYYY-MM-DD`; both null ⇒ "same quarter last year" (today's behaviour) |
| `uplift_pct` | integer | `0` | CHECK 0–200 |

`pct_90d`, `pct_q1`, `pct_avg` stay but are no longer read.

### 3.2 `inventory_rec_overrides`
`id` uuid pk · `client_id_code` varchar(50) · `asin` text · `sku` text · `qty` integer (may be negative) · `note` text NOT NULL default `''` · `set_by` varchar(255) · `set_at` timestamptz default now().
Unique (`client_id_code`, `sku`). Clearing = delete row.

### 3.3 `inventory_rec_snapshots`
`id` uuid pk · `client_id_code` · `sent_by` · `sent_at` timestamptz · `method` · `recent_days` · `seasonal_start` · `seasonal_end` · `uplift_pct` · `sku_count` · `units_to_send` (sum of positive finals) · `overstock_skus` · `overstock_units`.
Index (`client_id_code`, `sent_at` desc).

### 3.4 `inventory_rec_snapshot_rows`
`id` uuid pk · `snapshot_id` fk → snapshots (on delete cascade) · `asin` · `sku` · `product_name` · `main_image_url` · `available` · `inbound` · `reserved` · `stock_position` · `basis_units` · `live_calc` · `override_qty` NULL · `note` text · `final` integer.

Header + rows are inserted in **one transaction**.

## 4. Calculation

New pure module beside the existing helpers (exported from / next to
`src/components/analytics/inventory-forecast-table.tsx`, or a new
`src/lib/inventory/final-rec.ts` imported by it — implementer's choice, tested either way).

```
basis(method):
  recent   = units over the last recent_days
  seasonal = units in [seasonal_start, seasonal_end]  (or same quarter last year if unset)
  average  = mean of the non-zero of (recent, seasonal); 0 if both 0   // matches today's avgBasis
shortfall = ceil(basis × 1.1) − stockPosition(p)          // calcShipIn without the clamp
liveCalc  = shortfall > 0 ? ceil(shortfall × (1 + uplift_pct/100)) : shortfall
final     = override?.qty ?? liveCalc
isOverstock = final < 0
drifted   = override != null && |override.qty − liveCalc| / max(|liveCalc|, 1) > 0.25
```

**Uplift applies to the shortfall, not the basis**, and never to a negative (overstock) result.
This matches the sheet ("+30% Prime Day on the shortfall") and today's `addtl*` columns.
(Chat Q2 loosely wrote "basis × 1.1 × (1+uplift)"; this spec corrects it to the sheet's behaviour.)

`calcShipIn` and `stockPosition` keep their current signatures and tests.

## 5. API

| Route | Method | Who | Purpose |
|---|---|---|---|
| `/api/inventory-rec-settings` | GET/PUT (existing) | PUT: `isEditorOrAbove` | Add the 5 new fields; validate. |
| `/api/inventory-rec-overrides?client=` | GET | hub users with client access | List overrides. |
| `/api/inventory-rec-overrides` | PUT / DELETE | `isEditorOrAbove` | Upsert / clear one SKU's override. |
| `/api/inventory-rec-snapshots?client=` | GET | hub users; portal clients for **their own** codes | List sends (header only). |
| `/api/inventory-rec-snapshots/[id]` | GET | same | Header + rows. Portal callers get rows **without** `note` / `override_qty`. |
| `/api/inventory-rec-snapshots` | POST | `isEditorOrAbove` | Body = client + rows as computed in the browser; server re-validates shape and writes in one tx. |
| `/api/sales-summary/inventory` | GET (existing) | unchanged | Reads client settings; computes recent window from `recent_days` and seasonal window from settings instead of the fixed 90d / current quarter. |

### Validation (security)
- Seasonal dates: strict `^\d{4}-\d{2}-\d{2}$`, real calendar date, start ≤ end, span ≤ 366 days — enforced in the settings PUT **and** again in `route.ts` immediately before SQL is built. Today's Q1 query string-interpolates dates (`route.ts` ~311-312); this becomes reachable from user input, so the second check is mandatory.
- `recent_days` integer 7–365; `uplift_pct` integer 0–200; override `qty` integer within ±1,000,000; note ≤ 1,000 chars.
- Portal reads scope to the caller's visible client codes (multi-code users per Thread U).

## 6. Hub UI (`/sales-summary/inventory`)

Follows DESIGN.md: hub accent `--brand`; badges `rounded-md px-2 py-0.5 text-[9px] font-bold`; buttons/inputs `h-9` pills; modals per DESIGN.md Modals block; semantic badge table for amber (drift) and red (overstock).

1. **Header row:** client selector (unchanged) · **Method chip** (e.g. `Seasonal · 2024-10-01→2025-01-31 · +30%`) → settings modal · **History** button (`Sent 2026-10-07 by Ana ▾`, list of past sends, each with Download) · primary **Mark as sent**.
2. **Summary strip:** SKUs needing action · units to send · overstock (SKUs / units) · last sent (date or "Never").
3. **Filter row:** All / Needs action / Overstock + existing search.
   Needs action = `final > 0` OR `drifted` OR `isOverstock`.
4. **Table:**
   - Sticky left: image · ASIN/SKU · status.
   - Always visible: Stock position · Basis units (header names the window) · Live calc · **Final**.
   - Final cell: bold number; click to edit inline (editors only) with qty + note; `override` badge + note icon, tooltip "Set by X on YYYY-MM-DD · live calc N"; amber `drift` badge when drifted; red `Overstock −N` badge when negative (replaces today's "—"); "clear override" action.
   - Collapsible groups, collapsed by default, state in `localStorage` (try/catch): **Stock detail** (available / inbound / reserved / unfulfillable) · **Sales** (7/30/90d units + $) · **Health** (weeks of cover, days of supply) · **All methods** (recent / seasonal / average live calcs side by side).
5. **Orphaned overrides:** overrides whose SKU is absent from the current data are listed under the table ("Orphaned overrides (n)") with a clear action; they are excluded from snapshots.
6. **Mark as sent:** confirm modal "Send N SKUs, U units to <Client>? This replaces what the client sees in the portal." → POST snapshot → on success build + download xlsx from the saved rows. Disabled while loading, on load error, or with zero rows.

## 7. Portal (`/portal/sales/inventory`)

- If the client has ≥1 snapshot: render the latest read-only — product · stock position at send · Final (overstock badge) · caption "Recommendation sent YYYY-MM-DD". Charcoal blue `--portal-accent`; **no hub orange**. No notes, method, or override markers.
- If none: unchanged current view.
- Works per visible client via the existing `PortalStackedClients` pattern.

## 8. Export (xlsx)

Built client-side with the `xlsx` package (avoids the Vercel 4.5 MB server cap), always **from snapshot rows**, never live data.
- Row 1: `<Client name> — sent YYYY-MM-DD by <name> · <method summary>`.
- Columns: Product · ASIN · SKU · Available · Inbound · Reserved · Stock position · Basis units (window in header) · Recommendation (×1.1 + uplift) · **Final**.
- Negatives kept. Notes and override markers excluded (file goes to the client).
- Filename: `<CLIENTCODE>-inventory-recommendation-YYYY-MM-DD.xlsx`.

## 9. Error handling summary

| Case | Behaviour |
|---|---|
| Bad settings input | 400 with field message; modal shows it inline. |
| Non-editor write | 403. |
| Redshift load fails | Table error state; Mark as sent disabled. |
| Snapshot insert fails | Transaction rolls back; toast error; no download. |
| Seasonal window unset | Same-quarter-last-year default. |
| Override for vanished SKU | Orphaned list; not snapshotted. |

## 10. Testing

TDD per task.
- `finalRec`: each method; average with one zero side; uplift only on positive shortfall; override precedence; negative ⇒ overstock; drift at exactly 25% (not drifted) and just above; zero-sales SKU; liveCalc 0 with override (denominator floor 1).
- Date validator: valid, malformed, impossible date (2025-02-30), start > end, > 366 days, SQL-injection strings.
- API: settings PUT validation + 403; overrides upsert/clear + 403; snapshot POST tx + 403; portal GET strips `note`/`override_qty` and rejects other clients' codes.
- Export row builder: column order, negatives kept, notes excluded.
- Existing `inventory-forecast-table.test.ts` (6/6) stays green.
- `tsc --noEmit` judged by filename (baseline has unrelated errors). vitest does not typecheck.
- Browser pass on **PORT=3100** in the worktree (needs Manu to copy the env file in — Claude is hook-blocked).

## 11. Delivery constraints

- Worktree `.worktrees/thread-ag-inventory-final`, branch `thread-ag/inventory-final`.
- Local commits only; explicit pathspecs; check branch before each commit.
- Prod migration apply = separate explicit OK.
- Redshift SELECT-only. Dates cross module boundaries as `YYYY-MM-DD` strings.
