# Archived: MarketFoundry hours tracker (start/end times)

Removed from the 1o8 Hub on 2026-10-21. 1o8 logs **decimal hours per day against
client → department → project number** (Time Tracking 2.0), which lives in
`/hours` (My timesheet) and `/hours/insights` on the `time_logs` table.

Parked here unchanged: `/hours-log`, `/hours-admin`, `/admin/hour-categories`.
Their APIs (`/api/hours/*`, `/api/admin/hour-categories`), components
(`src/components/hours`, `src/components/admin/hours-*`) and the `time_entries` /
`hour_categories` tables are still in place. Move a folder back to `src/app/`
and re-add its nav entry to restore it.
