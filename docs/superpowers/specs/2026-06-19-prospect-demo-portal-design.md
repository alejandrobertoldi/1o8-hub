# Prospect Demo Portal — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design), pending implementation plan
**Author:** Manu + Claude

## Problem

Prospect-role users (`role === "prospect"`) land on `/portal`, see a "Preview Mode"
banner, and get section cards filtered by `aac.allowed_sections`. A prospect with no
sections enabled sees the empty "portal is being set up" state — they get no sense of
what the agency offers. We want every section to show **illustrative sample data** so a
prospect can preview the full portal experience.

## Goals

- A prospect sees all 7 capability sections, each leading to one polished showcase screen
  populated with sample data, rendered by the **real** portal components.
- No fake rows in the database (DEV DB = PROD Supabase — seeding is off the table).
- Sample data is honestly labeled so it can't over-promise.
- Minimal, mechanical change surface; no edits to the large section page components.

## Non-Goals

- No per-subpage demos (Sales has 4 subpages, Design 3, Reports 6+) — one showcase per section.
- No seeded demo client / no DB migration.
- No per-prospect tailoring — one shared generic sample brand.
- No edits to the giant `sales/overview` component (~1300 lines) or other section components.

## Core Mechanism — API short-circuit

Prospects render the existing react-query components unchanged. The data is swapped at the
**API layer**: each showcase endpoint returns a baked-in fixture when the caller is a
prospect, short-circuiting **before** any client/account resolution.

```ts
// top of each route handler, AFTER auth() resolves the session, BEFORE client lookup
if (session.user.role === "prospect") {
  return NextResponse.json(DEMO.<slice>);
}
```

This works because the proxy (`src/proxy.ts`) already permits prospect GETs to
`/api/portal/*`, `/api/sales-summary*`, `/api/aplus`, `/api/reports/*`, `/api/ppc/*`.
The components already handle "data arrives → render"; no component edits needed for data.

## Fixtures module

`src/lib/portal-demo.ts` — one exported constant per endpoint shape, all themed to a single
fictional brand: **Zingora** (verified not to collide with any real client). Each constant's TypeScript type is the **real response type of
its route** (copy/import the existing type so the real component renders without changes).

```
export const DEMO = {
  timeline: <shape of /api/portal/timeline response>,
  salesSummary: <shape of /api/sales-summary response>,
  salesDaily: <shape of /api/sales-summary/daily response>,
  products: <shape of /api/portal/products response>,
  seo: <shape of /api/portal/seo response>,
  design: <shape of /api/portal/design response>,
  finance: <shape of /api/portal/finance response>,
};
```

Numbers should be plausible-but-modest so they don't set expectations the real onboarding
can't meet (the over-promising risk this spec explicitly guards against).

## The 7 showcase screens

| Card            | Showcase route (prospect)                 | Endpoint(s) guarded                          |
|-----------------|-------------------------------------------|----------------------------------------------|
| Timeline        | `/portal/timeline`                        | `/api/portal/timeline`                       |
| Sales           | `/portal/sales/overview`                  | `/api/sales-summary` + `/api/sales-summary/daily` |
| Product Catalog | `/portal/products`                        | `/api/portal/products`                       |
| SEO             | `/portal/seo`                             | `/api/portal/seo`                            |
| Design          | `/portal/design`                          | `/api/portal/design`                         |
| Reports         | `/portal/reports2` (Business Model Audit) | **reuse existing** `/api/portal/audit` (already prospect-visible) |
| Finance         | `/portal/finance`                         | `/api/portal/finance`                        |

Reports is already implemented (static Business Model Audit bypasses `allowed_sections`).
No new work beyond ensuring the card points there.

## Landing changes (`src/app/portal/page.tsx`)

For `isProspect`:
- Render all 7 section cards as **enabled**, bypassing the `allowedSections` filter.
- Override each card's `href` to its showcase route from the table above (prospects skip the
  sub-landings — e.g. `/portal/sales` — which remain `allowedSections`-gated and would be empty).

Implementation note: add an optional `prospectHref` to the card definitions (or a small
lookup) and, when `isProspect`, use `prospectHref ?? href` and force `enabled = true`. Admin
preview and client behavior unchanged.

## Labeling

`<ProspectSampleBadge/>` — small client component (~10 lines) reading `useSession`, rendering
a subtle "Sample data" pill only when `role === "prospect"`. Mounted once in
`src/app/portal/layout.tsx` so it appears on every prospect screen with a single change.
The existing landing "Preview Mode — contact your account manager" banner stays as-is.

## Files touched

- **New:** `src/lib/portal-demo.ts` (fixtures), `src/components/portal/prospect-sample-badge.tsx`.
- **Edit:** `src/app/portal/page.tsx` (card override for prospects), `src/app/portal/layout.tsx`
  (mount badge), and the showcase endpoint routes (one guard each):
  `src/app/api/portal/timeline/route.ts`, `src/app/api/portal/products/route.ts`,
  `src/app/api/portal/seo/route.ts`, `src/app/api/portal/design/route.ts`,
  `src/app/api/portal/finance/route.ts`, `src/app/api/sales-summary/route.ts`,
  `src/app/api/sales-summary/daily/route.ts`.
- **No** DB migration, **no** new dependency, **no** edits to section page components.

## Risks / mitigations

- **Shape drift:** a fixture whose shape diverges from the route type breaks the real
  component. Mitigation: type each fixture with the route's actual response type; verify by
  live render, not just build.
- **Sales endpoints are shared with the hub:** guard is keyed on `role === "prospect"` only,
  so hub/admin/client/editor callers are unaffected.
- **Over-promising:** sample numbers kept modest + "Sample data" badge on every screen.

## Verification

- `npm run build` green (PORT=3000).
- Live render as a prospect on localhost:3000/portal: all 7 cards visible → each showcase
  screen renders sample data with the "Sample data" badge. Verify render, not just build.
