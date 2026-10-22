# Hours logging page — categories + formatting

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/hours-owner-only-edit`
**Scope:** The `/hours` logging page ([src/components/hours/hours-tracker.tsx](../../../src/components/hours/hours-tracker.tsx)) plus a new admin category-management surface. The super-admin hours **dashboard** (`/admin/users` + `/api/hours/summary`) is out of scope for this pass — it's the next piece of work.

## Goals

Five changes to the hours logging experience:

1. **Fix clipped time dropdowns** — the hour/minute selects are too narrow and clip 2-digit values.
2. **Add a mandatory work Category** to each logged entry, backed by an admin-managed list.
3. **Move the list filters** (client + note search) up beside the range-preset buttons.
4. **Reformat the day label** to `YYYY-MM-DD Ddd` (e.g. `2026-07-22 Wed`).
5. **Reformat hours** as zero-padded `HHh MMm` (e.g. `00h 02m`, `08h 05m`, `37h 03m`).

## Non-goals (YAGNI)

- No filter-by-category on the list view (can add later, mirrors the client filter).
- No per-client category lists — the category list is **global**.
- No category colours / icons.
- No changes to the super-admin dashboard or `/api/hours/summary` in this pass.
- No backfill of the ~15,297 existing category-less rows (they stay `NULL`, editable individually).

## Data model

Two **additive** PostgreSQL changes on the production Supabase instance (authorized; exact SQL shown at execution, run as raw additive SQL via a `node`+`dotenv` script — **never** `drizzle-kit migrate`, which could drop the `end_time > start_time` CHECK).

### New table `hour_categories`

| column       | type                        | notes                              |
|--------------|-----------------------------|------------------------------------|
| `id`         | `uuid` PK `default gen_random_uuid()` |                          |
| `name`       | `text NOT NULL UNIQUE`      | the label shown/stored             |
| `active`     | `boolean NOT NULL DEFAULT true` | soft-delete flag               |
| `sort_order` | `integer NOT NULL DEFAULT 0` | display order in dropdowns         |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |                           |

Drizzle model added to [src/lib/db/schema.ts](../../../src/lib/db/schema.ts) alongside `timeEntries`.

**Seed (initial rows, `sort_order` ascending):** `PPC, SEO, Design, Asana, Gmail, Drive, Markup, Meetings, Other`.

### New column on `time_entries`

- `category text NULL` — stores the category **label as text**, not a foreign key.

Rationale for text-not-FK: an admin renaming or deactivating a category must never orphan or rewrite the 15k rows of history. Historical entries keep whatever label they were logged with. `NULL` means "logged before categories existed."

## Behaviour

### Mandatory-ness

- **Create (POST `/api/hours`):** `category` is **required** and must equal the `name` of an **active** `hour_categories` row. Missing / unknown / inactive → `400`.
- **Edit (PATCH `/api/hours/[id]`):** `category` is **optional** and editable. A legacy `NULL` row can be given a category; an existing one can be changed or cleared. If a non-empty value is supplied it must match an active category → else `400`.
- **Bootstrapping guard:** if the active-category list is empty, the logging form shows an inline notice ("Ask an admin to add categories") and disables logging. Never a crash, never a silent broken submit. (With the seed above, the list is non-empty on day one.)

### API changes

- **`GET /api/hours`** — `serializeEntry` returns `category` on each entry.
- **`POST /api/hours`** — `validateEntryBody` validates `category` (required). Category validated against the active list.
- **`PATCH /api/hours/[id]`** — accepts optional `category`; validates against the active list when non-empty. Owner-only guard unchanged (from commit `ce74a508`).
- **New `GET /api/hours/categories`** — active categories (id, name), team-role gated (`admin`/`editor`/`viewer`) — used to populate the logging + edit dropdowns. (Read-only list for all loggers.)
- **New `/api/admin/hour-categories`** — `role === "admin"` gated (mirrors [/api/admin/ai-config](../../../src/app/api/admin/ai-config/route.ts)):
  - `GET` — all categories incl. inactive.
  - `POST` — add `{ name, sortOrder? }`.
  - `PATCH` — `{ id, name?, active?, sortOrder? }` (rename / toggle-active / reorder).
  - Deactivation is a soft delete (`active=false`) — never a hard delete, to keep history labels meaningful.

### UI changes — logging page

- **Category select** (mandatory) added to the form after Client. "Log hours" stays disabled until a category is chosen (folded into `canSubmit`).
- **Inline edit row** gains a Category select, pre-filled with the entry's current value (empty for legacy rows).
- **Entries table** gains a **Category** column after Client. Day-summary (L1) rows show distinct category badges (same treatment as the client badges); detail rows show the entry's category or `—`.
- **Time dropdown width:** `TimeSelect` hour/minute `<Select>` widen from `w-16` → `w-20` (and trigger padding tightened if needed) so `00`–`23` + caret aren't clipped.
- **Filters row:** the "All clients" select + "Search notes…" input move onto the **same row** as the `This Week / This Month / All Time` preset buttons — presets left, filters right (`justify-between`). The `This week (…) — Total: …` header drops to its own line below.

### UI changes — admin

- **New page `/admin/hour-categories`** — a small table: name (inline-editable), active toggle, sort order, and an "add category" row. Gated on `role === "admin"` like the other `/admin/*` config pages. Uses `/api/admin/hour-categories`.

### Formatting

- **`dayLabel(dateStr)`** in [hours-tracker.tsx](../../../src/components/hours/hours-tracker.tsx#L114): `"Wed, 2026-07-22"` → `"2026-07-22 Wed"` (ISO date, then weekday abbrev). Still parses date parts locally (no UTC off-by-one).
- **`formatHoursMinutes(hours)`** in [src/lib/hours/validation.ts](../../../src/lib/hours/validation.ts#L135): always `HHh MMm`, hours zero-padded to ≥2 digits, minutes always 2 digits. `NaN` → `"—"` unchanged.
  - `formatHoursMinutes(8.08)` → `"08h 05m"`
  - `formatHoursMinutes(1.5)`  → `"01h 30m"`
  - `formatHoursMinutes(1)`    → `"01h 00m"`
  - `formatHoursMinutes(0.5)`  → `"00h 30m"`
  - `formatHoursMinutes(0)`    → `"00h 00m"`
  - `formatHoursMinutes(37.05)`→ `"37h 03m"`
  - Blast radius: only the logging page uses this helper (verified). The 6 existing assertions in [validation.test.ts](../../../src/lib/hours/validation.test.ts#L114) are updated to the new format.

## Test plan (TDD)

- **Unit (`src/lib/hours/`):** update `formatHoursMinutes` assertions to the zero-padded form; add cases for 0, sub-hour, >99h. Add a `dayLabel` test if a testable helper is extracted, else cover via the format change.
- **API (`src/app/api/hours`):** POST rejects missing/unknown/inactive category (400); POST accepts a valid active category and round-trips it through GET. PATCH accepts optional category, validates when present, allows clearing, and rejects an inactive value. Admin category routes: `role !== "admin"` → 403; add/rename/toggle-active happy paths.
- All existing hours tests (71/71) must stay green.
- Typecheck via `npx tsc --noEmit` (a `next dev` server is running — do **not** `next build`, it clobbers the dev `.next`).

## Rollout order

1. Schema: `CREATE TABLE hour_categories` + seed + `ALTER TABLE time_entries ADD COLUMN category` (additive, authorized; SQL shown before running).
2. Drizzle model + queries.
3. API (category endpoints + POST/PATCH/GET validation) — TDD.
4. Logging-page UI (dropdown fix, category select, table column, filters row, date + hours format).
5. Admin `/admin/hour-categories` page + API.
6. Typecheck + full hours test run.

## Hard-rule reminders

- DEV DB = PROD Supabase; additive only; explicit per-action OK already given for the two additive statements above; SQL surfaced before execution.
- Stage explicit files, never `git add .`.
- Brand = Burnt Orange `#FF751F` (`text-brand`); no "red" — errors use `text-destructive`. Read DESIGN.md before any colour/spacing decision on the admin page.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
