# Hours nav dropdown — design spec

**Date:** 2026-07-27
**Branch:** design/consistency-tokens
**Author:** Manu + Claude (Opus 4.8)

## Goal

Convert the standalone "Hours" top-nav item into a dropdown with three children:

- **Log hours** → `/hours` — visible to all team users (`role ∈ {admin, editor, viewer}`)
- **Admin hours** → `/admin/users?view=hours` — visible to super-admins only
- **Hour categories** → `/admin/hour-categories` — visible to super-admins only

The two admin items are hidden from non-super-admins in every nav surface **and** the
hour-categories server API is tightened to enforce super-admin (not just hidden).

## Background / current state (verified in code)

- `session.user.isSuperAdmin` exists (`src/types/next-auth.d.ts`), is populated from the JWT
  in `src/lib/auth.ts`, and is exposed on the session. No nav surface reads it yet; all four
  use `role === "admin"` / `isAdmin`.
- **"Admin hours" is not a route.** It is a `<HoursDashboard/>` view rendered inside
  `src/app/admin/users/page.tsx` when local `adminView === "hours"`, reached by an in-page
  toggle button that is itself `isSuperAdmin`-gated (line ~759). There is no URL param today.
- The backing APIs `/api/hours/summary` and `/api/hours/drill` are **already** `isSuperAdmin`-gated
  server-side.
- `/api/admin/hour-categories` (`GET`/`POST`/`PATCH`) is gated by a single shared
  `requireAdmin()` helper checking `session.user.role !== "admin"` — **not** super-admin.
- Nav is rendered in four surfaces: `top-nav.tsx` (dropdown target), `app-sidebar.tsx`,
  `command-palette.tsx`, `src/lib/help/registry.ts`.

## Locked decisions

1. **Admin hours target** = `/admin/users?view=hours` deep link (add search-param support to the
   users page), NOT a plain `/admin/users` link.
2. **Server enforcement** = enforce `isSuperAdmin` on `/api/admin/hour-categories` (change the
   shared guard), matching the already-super-admin-gated hours dashboard APIs. This closes the
   URL/API bypass a plain admin has today. Trade-off accepted: any non-super admin who currently
   manages categories loses access.
3. **One-child UX** = when only one child ("Log hours") is visible (i.e. a non-super-admin), render
   "Hours" as a **direct link** to `/hours` (today's one-click behaviour). Render the dropdown only
   when ≥2 children are visible (super-admins). Avoids a pointless one-item dropdown for ~90% of users.
4. **Consistency scope** = tightening the two admin items to super-admin in `app-sidebar.tsx`,
   `command-palette.tsx`, and `help/registry.ts` is **required** (otherwise a plain admin's existing
   "Hour Categories" link would 403 after the server change). "Admin hours" is added to those three
   surfaces as flat entries for parity; the sidebar is NOT restructured into its own Hours dropdown.

## Changes by file

### 1. `src/components/layout/top-nav.tsx` (core)
- Add `const isSuperAdmin = session?.user?.isSuperAdmin ?? false;`.
- Remove the standalone `Hours` entry from `topLevelItems`.
- Introduce a `Hours` `NavSection` (icon `Clock`) as the **first** section in `sections`, with three
  `NavItem`s:
  - Log hours → `/hours`, icon `Clock`, `visible: role === "admin" || role === "editor" || role === "viewer"`
  - Admin hours → `/admin/users?view=hours`, icon `BarChart3`, `visible: isSuperAdmin`
  - Hour categories → `/admin/hour-categories`, icon `Tags`, `visible: isSuperAdmin`
- Remove the existing "Hour Categories" item from the `Admin` section (no duplication).
- **One-child rule:** in both the desktop and mobile renderers, when the Hours section has exactly
  one visible item, render it as a direct link (matching the existing top-level-item styling) instead
  of a dropdown/collapsible. `visibleSections` already filters invisible items and drops empty sections.

### 2. `src/app/api/admin/hour-categories/route.ts` (server gate)
- Rename `requireAdmin` → `requireSuperAdmin`; change the check to
  `if (!session || !session.user.isSuperAdmin)`. Keep the 403 shape. Applies to GET/POST/PATCH via
  the shared helper.

### 3. `src/app/admin/users/page.tsx` (deep-link)
- Rename the current default-export component to `UsersPageInner`.
- Add a new default export `UsersPage` that renders `<Suspense fallback={null}><UsersPageInner/></Suspense>`
  (required by Next 16 for `useSearchParams`).
- Inside `UsersPageInner`, seed `adminView` from the param:
  `useState<"users"|"hours">(searchParams.get("view") === "hours" && isSuperAdmin ? "hours" : "users")`.
  The existing toggle buttons are unchanged. Non-super-admins never open the hours view (guarded by
  the existing `adminView === "hours" && isSuperAdmin` render condition).

### 4–6. `app-sidebar.tsx`, `command-palette.tsx`, `help/registry.ts` (consistency)
- Add `isSuperAdmin` where needed.
- Change "Hour Categories" visibility from `isAdmin`/`admin:true` to super-admin.
- Add an "Admin hours" entry → `/admin/users?view=hours`, super-admin-gated, as a flat item near Hours.
- `help/registry.ts` has no visibility flag today; keep it consistent with how that file expresses
  admin-only entries (or leave the two admin items where category-style entries already live if the
  registry is ungated) — match the file's existing idiom, do not invent a new one.

## Testing / verification

- `npx tsc --noEmit` (never `next build` — port 3000 is taken by the live dev server).
- TDD the server-gate flip in `src/app/api/admin/hour-categories/route.test.ts`:
  - super-admin session → 200 on GET
  - `role === "admin"` but `isSuperAdmin === false` → 403 (previously 200)
- Dogfood in-browser after implementation: the top-nav Hours dropdown for a super-admin (three items)
  vs. a team user (single direct link), and that `/admin/users?view=hours` opens the HoursDashboard.

## Out of scope

- The `isSuperAdmin` JWT-staleness (revocation lags until token refresh) — pre-existing, tracked
  separately; not fixed here.
- Any restructure of the sidebar into a nested Hours dropdown.
- The HoursDashboard component itself and the hours-tracker feature (already shipped/reviewed).
