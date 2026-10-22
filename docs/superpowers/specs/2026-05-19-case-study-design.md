# Case Study Section — Design Spec
**Date:** 2026-05-19  
**Project:** 1o8Hub — `/clients/[clientIdCode]/case-study`

---

## Summary

Add a per-client Case Study section to 1o8Hub. Admins build and publish scrollable dark/gold report pages that showcase Amazon work delivered for each client. Data sections auto-pull from existing hub data sources (Redshift, ppcSnapshots). Visual sections take manually entered copy + Google Drive image URLs. Published case studies surface in the client portal (read-only). PDF export via Puppeteer.

---

## Decisions Made (do not re-litigate)

| Decision | Choice |
|---|---|
| Output | Built in admin hub, exported as PDF, optionally visible in portal |
| Authoring model | Fully auto for data sections; manual copy + image URLs for visual sections |
| Section visibility | Toggle per client at generation time |
| Visual format | Scrollable web page — dark navy / gold palette |

---

## Architecture

Three layers:

1. **Data pull** — at generation time, queries Redshift (`replenishment_offer_metrics`, `store_insights`, `sales_summary`) and `ppcSnapshots` table using the client's `accountId` from `spApiCredentials`
2. **Document store** — `case_studies` + `case_study_sections` tables in Postgres; data sections frozen as JSONB snapshots
3. **Render** — shared `CaseStudyView` component used by admin page, portal page, and Puppeteer PDF renderer

---

## Data Model

### `case_studies` table

```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
client_id_code   varchar(100) NOT NULL REFERENCES aac(client_id_code)
title            text NOT NULL
date_range_start date NOT NULL
date_range_end   date NOT NULL
sections_enabled text[] NOT NULL  -- e.g. ['cover','sns','sales','ppc']
status           text NOT NULL DEFAULT 'draft'  -- draft | published
generated_at     timestamptz
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
```

### `case_study_sections` table

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
case_study_id   uuid NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE
section_type    text NOT NULL  -- see enum below
sort_order      int NOT NULL
content         jsonb NOT NULL
updated_at      timestamptz NOT NULL DEFAULT now()
```

### Section type enum

`cover` | `storefront` | `brand_story` | `product_listing` | `aplus` | `store_btp` | `sns` | `sales` | `ppc`

### Content JSONB shapes

**Visual sections** (cover, storefront, brand_story, product_listing, aplus):
```json
{
  "copy": "string",
  "tagline": "string (cover only)",
  "statCallout": "string (product_listing, aplus only)",
  "clientLogoUrl": "string (cover only)",
  "imageUrls": ["url1", "url2"]
}
```

**`store_btp`** (auto):
```json
{
  "copy": "string (editable)",
  "salesTotal": 17888.33,
  "visitors": 4701,
  "orders": 527,
  "avgOrderValue": 3.81,
  "trafficTimeline": [{ "date": "YYYY-MM-DD", "visitors": 0 }],
  "promotionsCount": 9
}
```

**`sns`** (auto):
```json
{
  "copy": "string (editable)",
  "totalSubscriptions": 796,
  "revenueTotal": 15531.52,
  "momGrowth": 38.92,
  "timeline": [{ "date": "YYYY-MM-DD", "value": 0, "yearAgo": 0 }]
}
```

**`sales`** (auto):
```json
{
  "copy": "string (editable)",
  "statCallout": "string (editable)",
  "lifetimeRevenue": 303329.12,
  "totalOrders": 10204,
  "totalUnits": 11065,
  "avgOrderValue": 29.73,
  "salesByMonth": [{ "month": "YYYY-MM", "revenue": 0, "orders": 0 }]
}
```

**`ppc`** (auto):
```json
{
  "copy": "string (editable)",
  "statCallout": "string (editable)",
  "lifetime": { "spend": 64207.27, "sales": 156910.87, "acos": 40.92, "ntb": 18505.70, "chart": [] },
  "ytd":      { "spend": 46881.71, "sales": 121169.53, "acos": 38.69, "ntb": 16491.83, "chart": [] }
}
```

---

## Sections Breakdown

| Section | Content source | Fields |
|---|---|---|
| Cover | Manual + `aac.clientName` | `clientLogoUrl`, `tagline`, `heroImages[]` |
| Storefront | Manual | `copy`, `imageUrls[]` |
| Brand Story | Manual | `copy`, `imageUrls[]` |
| Product Listing | Manual | `copy`, `statCallout`, `imageUrls[]` |
| A+ Content | Manual | `copy`, `statCallout`, `imageUrls[]` |
| Amazon Store & BTP | Redshift (table TBD — verify during impl; may be SP-API Brand Analytics) | traffic chart, sales totals, promotions list |
| Subscribe & Save | Redshift `replenishment_offer_metrics` | subscriptions count chart, MoM growth |
| Sales | Redshift `sales_summary` | lifetime revenue, orders, monthly chart |
| PPC Performance | `ppcSnapshots` table | lifetime + YTD spend/sales/ACOS/NTB + charts |

---

## PDF Export

Route: `GET /api/case-studies/[id]/pdf`

- Auth-gated (admin/editor only)
- Spawns Puppeteer, navigates to `/clients/[clientIdCode]/case-study?print=1`
- `print=1` param hides hub nav, tabs, and admin controls via `@media print` + CSS class
- Returns PDF as `Content-Disposition: attachment; filename="{clientName}-case-study-{date}.pdf"`
- Viewport: 1200px wide, full height

---

## Admin UI Flow

1. **Tab** — "Case Study" added to client layout tabs (alongside Overview, Inventory, Forecast, Brand Guidelines)
2. **Empty state** — "Generate Case Study" button opens a modal:
   - Date range picker (start / end)
   - Section toggles (checkboxes for each of the 9 sections)
3. **Generate** — POST `/api/case-studies` → pulls Redshift/ppcSnapshots data, saves snapshot, redirects to view
4. **View** — scrollable dark/gold page with:
   - **Edit** (pencil) per visual section → inline form for copy + image URLs
   - **Refresh Data** button in header → re-pulls data sections, leaves visual content untouched
   - **Export PDF** button → GET `/api/case-studies/[id]/pdf`
   - **Publish / Unpublish** toggle → flips `status` draft ↔ published
5. **Re-generate** — one case study per client. "Refresh Data" re-pulls data sections for the existing date range. To change the date range, admin deletes the case study and generates a new one.

---

## Portal Integration

Route: `/portal/[clientIdCode]/case-study`

- Read-only render of `CaseStudyView` component
- Only visible when `status = published`
- No edit controls, no PDF button, no admin header
- Gated to `client` role users whose `clientIdCode` matches

---

## File Structure

```
src/
  app/
    clients/[clientIdCode]/
      case-study/
        page.tsx                  # Admin view + edit
        page-meta.tsx
    portal/[clientIdCode]/
      case-study/
        page.tsx                  # Client read-only view
    api/
      case-studies/
        route.ts                  # POST (create/generate)
        [id]/
          route.ts                # GET, PATCH, DELETE
          pdf/
            route.ts              # GET → Puppeteer PDF
          sections/
            [sectionId]/
              route.ts            # PATCH (update visual content)
          refresh/
            route.ts              # POST (re-pull data sections)
  components/
    case-study/
      case-study-view.tsx         # Shared render component (admin + portal + print)
      case-study-cover.tsx
      case-study-section-visual.tsx
      case-study-section-data.tsx
      case-study-charts.tsx       # Recharts wrappers (SnS, Sales, PPC)
      case-study-edit-modal.tsx   # Visual section editor
      case-study-generate-modal.tsx
  lib/
    case-study/
      generate.ts                 # Data pull orchestrator
      queries/
        sns.ts
        sales.ts
        ppc.ts
        store-btp.ts
```

---

## Design Tokens (dark/gold palette)

- Background: `#2d2f3e` (matches template navy)
- Accent / gold: `#E8A700` (hub brand gold — already in design system)
- Section label tabs: `bg-[#E8A700] text-black rounded-t-lg px-4 py-2 font-bold`
- Charts: white lines on dark bg via Recharts
- Body copy: `text-white/90`
- Stat callout boxes: `border border-[#E8A700] rounded-lg p-4`

---

## Constraints

- No new migrations without explicit permission — schema changes go through `npm run db:push` (dev) only after approval
- Puppeteer must be added as a dependency (`puppeteer-core` + `@sparticuz/chromium` for Vercel serverless)
- Image URLs are Google Drive share links or any public URL — no file upload infra needed in v1
- `clientLogoUrl` added as a new optional column to `aac` table
- All Redshift queries reuse existing `queryRedshift` utility from `src/lib/redshift.ts`
- PPC data pulled from `ppcSnapshots` table — no new Redshift query needed for PPC
