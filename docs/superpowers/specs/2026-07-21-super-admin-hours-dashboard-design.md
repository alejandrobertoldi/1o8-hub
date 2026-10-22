# Super-admin-gated hours dashboard — design

Date: 2026-07-21
Branch: `feat/super-admin-hours-dashboard`

## Goal

1. Introduce a **super admin** capability in the app, layered on top of the existing `admin` role.
2. Restrict the admin **hours overview** section so it is visible/usable only by super admins.
3. Replace the current plain-table hours overview with a **charted dashboard** to navigate team hours by member or by client(s).

## Context / current state

- Roles are a Postgres enum `user_role` = `[viewer, editor, admin, client, pending, prospect]` (`src/lib/db/schema.ts:26`). No super-admin tier exists.
- `session.user.role` is resolved in `src/lib/auth.ts` and typed in `src/types/next-auth.d.ts`. `role === "admin"` / `isAdmin` gate checks appear across ~177 files.
- The admin hours section already exists: `/admin/users` (`src/app/admin/users/page.tsx`) has a Users/Hours tab toggle; the Hours tab renders `HoursOverview` (`src/components/admin/hours-overview.tsx`).
- `HoursOverview` is a date-range + by-client/by-member expandable drill-down **table**, backed by `GET /api/hours/summary` (`src/app/api/hours/summary/route.ts`), which is admin-gated and returns `{ byMember, byClient }` aggregates from `summaryRows` (`src/lib/hours/queries.ts`).
- `recharts ^3.8.1` is already a dependency, used across `src/components/reports/*`. No new chart dependency.
- Hard constraint: DEV DB **is** PROD Supabase. Schema changes must be additive-only, never `drizzle-migrate`, and require explicit per-action approval. The `end>start` CHECK must not be dropped.

## Decision: super admin = capability flag (not a new enum role)

Chosen over a new `superadmin` enum value because a separate role would strip `admin` capabilities from super admins unless all ~177 admin-check sites were audited (lockout risk), and an enum value is an irreversible PROD change. A boolean flag is orthogonal, additive, reversible, and manageable in-app.

A super admin is a user with `role === "admin"` **and** `is_super_admin = true`. All existing admin checks keep working unchanged; only the new hours gate reads the flag.

## Design

### A. Capability flag

- **Schema (additive):** add column to `users` in `src/lib/db/schema.ts`:
  `isSuperAdmin: boolean("is_super_admin").notNull().default(false)`.
- **PROD DB change (requires explicit OK, run manually — no drizzle-migrate):**
  `ALTER TABLE users ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;`
- **Bootstrap (requires explicit OK):** grant to `amazon.seo@1o8.agency`:
  `UPDATE users SET is_super_admin = true WHERE email = 'amazon.seo@1o8.agency';`
  Rationale: without a first super admin, nobody can grant the flag to anyone.
- **Auth wiring:** `src/lib/auth.ts` selects `isSuperAdmin` at sign-in, stores it on the JWT token, and exposes `session.user.isSuperAdmin: boolean`. `src/types/next-auth.d.ts` adds `isSuperAdmin` to the session user type. On `update()` trigger, allow refreshing the flag like role/sections already do.
- **Granting in-app:** `PUT /api/admin/users` accepts an optional `isSuperAdmin: boolean`. A new `requireSuperAdmin` check (in the route) means only a super admin may set/clear it; a plain admin gets 403 if they try. Prevent a super admin from clearing their **own** flag (self-lockout guard), mirroring the existing "cannot change your own role" guard. `GET /api/admin/users` returns the flag.
- **UI toggle:** in `src/app/admin/users/page.tsx`, add a super-admin control (shield toggle + badge) per user row, rendered only when the current viewer is a super admin. Uses the existing mutation pattern (a new `superAdminMutation` hitting the PUT endpoint). The `User` type and `ROLE_COLORS`-adjacent styling extend to include the flag.

### B. Re-gating the hours section

- **Hours tab visibility:** in `src/app/admin/users/page.tsx`, the "Hours" toggle button and the `adminView === "hours"` branch render only when `session.user.isSuperAdmin`. If a non-super-admin somehow has `adminView === "hours"`, fall back to the users view.
- **API gate:** `GET /api/hours/summary` changes its check from `session.user.role !== "admin"` to `!session.user.isSuperAdmin` → 403.
- **Untouched:** the personal `/hours` tracker (`src/app/hours/page.tsx`, all team roles) is unchanged — it logs a user's own time and is not the org-wide aggregate.

### C. Charted hours dashboard

New component `src/components/admin/hours-dashboard.tsx` replacing `HoursOverview` in the Hours tab. Consumes the **existing** `/api/hours/summary` payload (no query/endpoint change).

Layout (top to bottom):
1. **Controls bar:** From/To date inputs (default current month, reuse existing `currentMonthRange`), pivot toggle (By client / By member), and a multi-select filter to narrow to specific member(s) or client(s). Filtering is client-side over the fetched payload.
2. **KPI tiles:** Total hours, Active members, Active clients, Avg hours/member — computed from the filtered payload.
3. **Two bar charts (recharts):** Top members by hours, Top clients by hours (horizontal bars, sorted desc, sensible top-N with the rest grouped or scrollable).
4. **Member × client heatmap:** cross-tab grid derived from `byMember[].clients` (or `byClient[].members`); intensity by hours.
5. **Drill-down table:** the current expandable by-member/by-client table, preserved.

Conventions:
- Colors/marks follow the `dataviz` skill (loaded during implementation) applied to recharts.
- `INTERNAL` renders as "MarketFoundry" and uses `--brand`/`text-brand`, as today.
- Light + dark theme aware, matching existing report charts.

`HoursOverview` may be deleted once `HoursDashboard` subsumes it, or kept as the table sub-view imported by the dashboard — implementer's call during planning, whichever is cleaner.

## Out of scope (YAGNI)

- Hours-over-time trend line (would need a date-grouped query; not requested).
- Editing/deleting other members' time entries from the dashboard.
- Exporting the dashboard.
- Any change to the personal hours tracker or the cross-midnight logic.

## Testing

- `src/lib/auth.ts` flag propagation: unit-cover the session mapping if a test seam exists (existing `auth.test.ts` / `auth-db.test.ts`).
- `/api/hours/summary` and `/api/admin/users` gate changes: extend the existing route tests (`route.test.ts`) — non-super-admin → 403 on summary; only super admin can set `isSuperAdmin`; self-revoke blocked.
- Dashboard: aggregation/derivation helpers (KPIs, heatmap cross-tab, filtering) unit-tested pure-function-style; render smoke test.
- `npm run build` must pass (esbuild has no typecheck; build is the TS gate).

## Approvals required before shipping

1. `ALTER TABLE users ADD COLUMN is_super_admin ...` — additive PROD column.
2. Bootstrap `UPDATE` granting `amazon.seo@1o8.agency` super admin.
3. Any push / PR / merge to main.
