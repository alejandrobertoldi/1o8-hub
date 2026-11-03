# Archived: hub tools 1o8 doesn't use (2026-11-03)

Parked unchanged, same folder structure as `src/`:

| Former page | Why |
|---|---|
| `/activity` (Activity log) + `/api/activity` | Product field edit history from MarketFoundry's catalog; nothing in 1o8 writes to it. |
| `/admin/observability` + `/api/admin/observability` | Checked MarketFoundry's systems (BigQuery, SP-API, Redshift, Rainforest, product data). Replaced by `/admin/system-health`. |

To restore one, move its folders back under `src/` and re-add its nav entry in
`src/components/layout/top-nav.tsx` (and `app-sidebar.tsx`). The `activity`
section id is still accepted in Admin → Users grants (CONFIGURABLE_SECTIONS),
just not shown as a column.

This folder is excluded from TypeScript (`tsconfig.json`) and is outside
`src/app`, so Next.js does not build it.
