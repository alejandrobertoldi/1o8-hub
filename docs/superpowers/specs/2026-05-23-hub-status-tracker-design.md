# Hub Status Tracker — Design Spec

**Date:** 2026-05-23
**Status:** Approved

## Overview

A public `/status` page for 1o8Hub showing the development state of the platform: features that are fully shipped, features in progress with a completion percentage, and features planned but not yet started. Data is stored in Supabase and managed via Drizzle Studio. No authentication required.

---

## Database

### Table: `hub_features`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | uuid | PK, default gen_random_uuid() | |
| `name` | varchar(100) | not null | e.g. "SEO Pipeline" |
| `description` | text | not null | One-liner shown on the card |
| `status` | enum | not null | `done` / `in_progress` / `planned` |
| `progress` | integer | default 0 | 0–100; only meaningful for `in_progress` |
| `domain` | varchar(50) | not null | Tag pill on card (e.g. SEO, A+, Finance) |
| `display_order` | integer | not null, default 0 | Sort order within each status column |
| `created_at` | timestamp with tz | default now() | |
| `updated_at` | timestamp with tz | default now() | Updated on every row change |

**Enum:** `hub_feature_status` = `done | in_progress | planned`

**Indexes:**
- `idx_hub_features_status` on `status`
- `idx_hub_features_domain` on `domain`

### Migration note
One migration is required. Since dev DB = prod Supabase, **do not run `db:generate` or `db:migrate` without explicit user confirmation**.

---

## Seed Data (`scripts/seed-hub-features.ts`)

Populates the table with the current known platform features on first run. Covers all shipped domains (Products, SEO Pipeline, A+ Content, Finance, Clients, Portal, Amazon Sync, Publishing, Reports/Export, Admin, Variations), current in-progress work, and the planned backlog. Script is idempotent (upsert on `name`).

---

## Routes

### `src/app/status/page.tsx`
- **Auth:** None — fully public
- **Rendering:** Next.js RSC (server component); queries DB at request time via Drizzle
- **Data:** Fetches all rows from `hub_features`, grouped by `status`, sorted by `display_order`

No API route needed — direct DB query from RSC.

---

## UI — `/status`

### Page header
- Title: "1o8Hub — Platform Status"
- Subtitle: last updated timestamp (most recent `updated_at` across all rows)

### Three-column layout
Columns: **Done** | **In Progress** | **Planned**

Responsive: side-by-side on desktop, stacked on mobile.

Each column has a header with:
- Status label + icon (✅ Done / 🔄 In Progress / 🗓 Planned)
- Count badge (e.g. "· 12")

### Feature card
- Domain tag: colored pill (e.g. gold for SEO, blue for Finance — matches hub accent palette)
- Feature name: bold
- Description: muted text, one line
- **In-progress only:** progress bar + `{n}%` label below description

### Styling
- Tailwind + shadcn/ui, dark-mode aware
- Matches existing hub design system (DESIGN.md)
- No client-side JS required (pure RSC + CSS)

---

## Admin Workflow

No dedicated admin UI. To update a feature:
1. Open Drizzle Studio: `npm run db:studio`
2. Edit the `hub_features` row directly (change `status`, `progress`, `display_order`, etc.)
3. Add new planned features as new rows

---

## Out of Scope

- Admin CRUD UI inside the hub (can be added later as Option C)
- Domain-grouped sub-sections within columns (can be added later as Option B)
- Public API endpoint for the feature list
- Authentication / role-gating

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | Add `hubFeatureStatusEnum` and `hubFeatures` table |
| `drizzle/migrations/` | Generated migration for `hub_features` table |
| `src/app/status/page.tsx` | Public RSC page |
| `src/app/status/layout.tsx` | Minimal layout (no hub nav — public page) |
| `scripts/seed-hub-features.ts` | Seed script with initial feature list |
