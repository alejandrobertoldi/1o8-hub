# Portal Per-Client Section Panel — Design Spec

**Date:** 2026-05-28
**Status:** Approved (brainstorm phase complete)
**Owner:** Manu
**Related work shipped (don't touch):** commit `46b15b1d` (per-client-group bulk toggle in `/admin/users`), commit `0176a093` (AAC empty-state fix), commit `e10da8af` (strict per-subsection permissions, no cascade).
**In-flight work to avoid:** Case Study redesign (`docs/superpowers/specs/2026-05-28-case-study-redesign.md`), SEO Phase 2, Attributes per-category storage Phase 1.

---

## 1. Goal

Move portal section visibility from a **per-user** model (`users.allowed_sections`) to a **per-client** model (`aac.allowed_sections`), and give admins a dedicated, discoverable place to manage that visibility: a Sheet editor opened from each client card in `AdminPortalLanding` (the `/portal` admin landing page).

New users assigned to a client should inherit that client's visibility automatically — admins should never have to "re-configure section access" when a new user joins an existing client.

## 2. Non-goals

- Per-user **overrides** on top of per-client visibility. Deferred until a concrete use case appears.
- A "section visibility audit log" UI. Activity log row on PATCH is enough.
- Bulk-apply across multiple clients in one Sheet.
- Schema changes to `CONFIGURABLE_SECTIONS` / `DEPARTMENTS` in `src/lib/permissions.ts`.
- Touching the Case Study redesign, SEO Phase 2, or Attributes per-category storage work.

## 3. Locked decisions

1. **Storage model: per-client, no override.** A new `aac.allowed_sections text[] NOT NULL DEFAULT [...]` column is the source of truth for client/prospect roles. `users.allowed_sections` stays in the schema (for admin/editor/viewer roles, and as historical record) but is **no longer read** for client/prospect roles.
2. **UI: shadcn Sheet, opened from a gear icon on each client card.** Card body click still navigates to `/portal?client=<code>` preview; gear icon opens the section editor.
3. **Inline toggles removed.** Per-card Eye/EyeOff toggles on the admin-preview dashboard AND the `<AdminPreviewToggle />` banner on `/portal/*` subpages are deleted. The Sheet is the single editing surface.

## 4. Architecture

### 4.1 Data model

**Schema change (additive):**

```sql
ALTER TABLE "aac"
  ADD COLUMN "allowed_sections" text[] NOT NULL
  DEFAULT ARRAY[
    'timeline','sales','products','seo','design','reports','finances',
    'brandstory','aplus','listing-images','storefront','files','finance-reports'
  ]::text[];
```

Default matches `DEFAULT_CLIENT_SECTIONS` in `src/lib/permissions.ts`. Hand-written migration at `scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql` (drizzle-kit db:generate is broken per `CLAUDE.md`).

**Drizzle update** — `src/lib/db/schema.ts` `aac` table gets:

```ts
allowedSections: text("allowed_sections")
  .array()
  .notNull()
  .default([/* DEFAULT_CLIENT_SECTIONS */]),
```

**Backfill** — single SQL pass in `migration.sql`, AFTER the ADD COLUMN: for each client with assigned users, write the union of their `users.allowed_sections` into `aac.allowed_sections`. Clients with zero users keep the column default. Provides per-client continuity from the existing per-user data.

```sql
-- pseudocode; final form in migration file
UPDATE "aac" a
SET allowed_sections = sub.union_sections
FROM (
  SELECT
    unnest(string_to_array(u.client_id_code, ',')) AS code,
    array_agg(DISTINCT s) AS union_sections
  FROM users u, unnest(u.allowed_sections) s
  WHERE u.role IN ('client','prospect')
    AND u.client_id_code IS NOT NULL
  GROUP BY code
) sub
WHERE TRIM(sub.code) = a.client_id_code;
```

Backup script at `scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql` snapshots `aac` and `users.allowed_sections` for client/prospect rows before the migration runs.

### 4.2 Session resolution

NextAuth session callback (locate during plan — likely `src/lib/auth.ts` or `src/auth.ts`):

```ts
// client/prospect roles only
const codes = (user.clientIdCode ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (codes.length > 0) {
  const rows = await db
    .select({ a: aac.allowedSections })
    .from(aac)
    .where(inArray(aac.clientIdCode, codes));
  session.user.allowedSections = Array.from(
    new Set(rows.flatMap((r) => r.a))
  );
} else {
  session.user.allowedSections = [];
}
```

For roles in `{admin, editor, viewer, pending}`: behavior unchanged — keep reading `users.allowed_sections`.

`canAccess(section, allowedSections, isAdmin)` in `src/lib/permissions.ts` keeps its signature. Inside-function logic unchanged. Callers now pass the resolved per-client union for client/prospect users.

### 4.3 API surface

**New:** `PATCH /api/clients/[clientIdCode]/sections` at `src/app/api/clients/[clientIdCode]/sections/route.ts`.

Request:
```ts
{ allowedSections: string[] }   // full replacement, not delta
```

Behavior:
- Admin-only (return 403 otherwise).
- Validates every section ID against `VALID_SECTION_IDS` from `src/lib/permissions.ts` (400 on bad IDs).
- Writes via `db.update(aac).set({ allowedSections }).where(eq(aac.clientIdCode, code))`.
- 404 if `clientIdCode` is unknown.
- Writes an `activity_log` row (existing pattern; copy from `/api/admin/users` PUT handler).
- Returns `{ clientIdCode, allowedSections }`.

**Modified:** `GET /api/clients` — extend the select to include `allowedSections` so the AdminPortalLanding and ClientSectionsSheet can read current values without a second roundtrip.

**Removed call sites (not the endpoints):** the inline-toggle and banner-toggle paths that fan out PUTs to `/api/admin/users` for client-role users. `/api/admin/users` PUT endpoint itself is untouched.

### 4.4 UI components

**New file: `src/components/portal/client-sections-sheet.tsx`**

Props:
```ts
{
  client: { clientIdCode: string; clientName: string; allowedSections: string[]; count: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Layout (shadcn `Sheet` from `src/components/ui/sheet.tsx`, side="right", `sm:max-w-[480px]`):

- **Header:** `{clientName}` (large, brand-style heading) + `{clientIdCode} · {N} users assigned` subtitle. If `count === 0`: subtitle says "0 users assigned — visibility will apply when users are added."
- **Section list:** sections from `CONFIGURABLE_SECTIONS` filtered to client-relevant IDs (excludes admin-only: `activity`, `import`, `publish`, `export`, `clients`, `calendar`, `sync`). Grouped by department for scannability (Design, Catalog, PPC, etc.). Each row: a shadcn `Checkbox` + label + (optional) description. Standalone departments (Timeline, SEO, Reports, Finances) appear as single-row groups.
- **Footer:**
  - `[Reset to defaults]` — sets local state to `DEFAULT_CLIENT_SECTIONS`. Does not save.
  - `[Save & preview ▸]` — saves via PATCH, then navigates to `/portal?client=<code>`. Disabled when not dirty.

Local state:
```ts
const [draft, setDraft] = useState<string[]>(client.allowedSections);
const dirty = !sameArray(draft, client.allowedSections);
```

Save uses `useMutation` with `onSuccess: queryClient.invalidateQueries(["portal-clients"])` then `router.push("/portal?client=<code>")` if "Save & preview" path taken.

**Modified: `src/app/portal/page.tsx` (`AdminPortalLanding`)**

- Each card in the Active Clients grid (line ~594) gets a gear `Settings2` icon button (top-right, absolute, next to the existing `Eye` icon). Click handler stops propagation, sets `setEditingClient(client)`. Card body link still navigates to preview.
- Add `<ClientSectionsSheet client={editingClient} open={!!editingClient} onOpenChange={(o) => !o && setEditingClient(null)} />` once at the end of the component.
- **"Client Users & Section Access" table** (lines 647-817) → simplified:
  - Rename heading to "Client User Assignments".
  - Drop the `CLIENT_SECTIONS` columns (Timeline / Sales / Products / SEO / Design / Reports / Finance) and their checkboxes.
  - Keep: Avatar/Name, Email, Assigned Client(s) dropdown, Last Login, Remove button.
  - `sectionMutation` and `toggleSection` become dead code; remove them.

**Modified: `src/app/portal/page.tsx` (`ClientDashboard`)**

- Remove `previewBulkMutation`, `togglePreviewSection`, `cardBulkState`, `togglePreviewSection`.
- Remove per-card Eye/EyeOff buttons (lines ~355-371).
- Remove "partial" badge logic (lines ~341-345).
- Keep dimming behavior — but driven by the **previewed client's `allowedSections`** (read from `/api/clients` cache), not from `cardBulkState`. A card whose `permission` isn't in the client's allowedSections is dimmed `opacity-40`.
- Keep `visibleCards = isAdminPreview ? SECTION_CARDS.slice() : SECTION_CARDS.filter(...)`.
- Keep the existing "Admin preview · viewing as X · Exit preview" banner (lines 290-310). Remove the "No users — toggles disabled" badge since there are no toggles to disable.

**Modified: `src/app/portal/layout.tsx`**

- Remove the `<AdminPreviewToggle />` line and its import.

**Deleted: `src/components/portal/admin-preview-toggle.tsx`**

Full file deletion.

**Modified: `src/app/admin/users/page.tsx`**

- Per-client-group bulk toggle row (from commit `46b15b1d`): remove for `client`/`prospect` groups only. Keep for internal team groups.
- Per-user section checkbox columns: remove for `client`/`prospect` rows. Replace the cell with a single "Managed in Client Portal →" link to `/portal`. Internal roles (admin/editor/viewer/pending) unchanged.

### 4.5 File plan

| Path | Status | Notes |
|---|---|---|
| `scripts/migrations/2026-05-28-portal-per-client-sections/backup.sql` | **new** | Snapshot `aac` and `users.allowed_sections` for rollback. |
| `scripts/migrations/2026-05-28-portal-per-client-sections/migration.sql` | **new** | ALTER TABLE + backfill UPDATE. |
| `src/lib/db/schema.ts` | **edit** | Add `allowedSections` to `aac` table. |
| `src/lib/auth.ts` (or wherever session callback lives) | **edit** | Resolve per-client union for client/prospect roles. |
| `src/app/api/clients/[clientIdCode]/sections/route.ts` | **new** | PATCH endpoint. |
| `src/app/api/clients/route.ts` | **edit** | Include `allowedSections` in response. |
| `src/components/portal/client-sections-sheet.tsx` | **new** | Sheet editor. |
| `src/app/portal/page.tsx` | **edit** | Add gear icon + Sheet in `AdminPortalLanding`; simplify Client User Assignments table; remove preview toggles from `ClientDashboard`; dim cards based on client's allowedSections. |
| `src/app/portal/layout.tsx` | **edit** | Remove `<AdminPreviewToggle />`. |
| `src/components/portal/admin-preview-toggle.tsx` | **DELETE** | No longer needed. |
| `src/app/admin/users/page.tsx` | **edit** | Remove per-client bulk row for client/prospect; remove per-user section checkboxes for client/prospect; add "Managed in Client Portal →" link. |

## 5. UX flow

### 5.1 Admin configures a client

1. Admin lands on `/portal` → `AdminPortalLanding` renders.
2. Each Active Client card shows: name, code, user counts, avatar stack, [Eye] preview icon, **[Gear] configure icon** (new).
3. Admin clicks gear → Sheet slides in from right.
4. Sheet displays current `allowed_sections` as checked boxes, grouped by department.
5. Admin toggles checkboxes → local draft state updates → "Save & preview" enables.
6. Admin clicks "Save & preview" → PATCH `/api/clients/<code>/sections` → success toast → navigates to `/portal?client=<code>`.
7. Dashboard renders with the new visibility (toggled-off cards dimmed).

### 5.2 Real client logs in

1. NextAuth session callback resolves `session.user.allowedSections` from the union of assigned clients' `aac.allowed_sections`.
2. `/portal` renders `ClientDashboard`. `visibleCards` filters `SECTION_CARDS` by `canAccess(card.permission, session.user.allowedSections, false)`.
3. Top-nav and any other surface using `canAccess` reflects the same set.

### 5.3 Multi-client client user

User has `clientIdCode = "C1,C2"`. Session callback fetches both `aac` rows and unions their `allowed_sections`. If C1 allows `aplus` and C2 doesn't, user sees `aplus`.

## 6. Acceptance criteria

1. `migration.sql` runs cleanly against prod Supabase. `aac.allowed_sections` populated for all rows.
2. Per-client visible sections after migration match what assigned users saw the day before (manual spot-check on 3+ clients).
3. Real client user login: dashboard cards filtered by their client's `allowed_sections`. Multi-client user sees the union.
4. Admin clicks gear icon on a client card → Sheet opens → toggle one section → Save → re-open Sheet → toggle persisted. Activity log row written.
5. "Save & preview" navigates to `/portal?client=<code>` and dashboard reflects new visibility.
6. `/admin/users`: no section checkboxes on client/prospect rows; "Managed in Client Portal →" link present. Internal users' section toggles still work.
7. `<AdminPreviewToggle />` banner gone from all `/portal/*` subpages. Dashboard's "Admin preview · Exit preview" banner remains (no toggle button).
8. Per-card Eye/EyeOff toggles on admin-preview dashboard are gone. Dimming still works for sections the client can't access.
9. PATCH `/api/clients/<code>/sections`: 403 for non-admin, 400 for invalid section IDs, 404 for unknown client, 200 with body for valid update.
10. `vitest` passes, `npm run lint` passes, `npm run build` succeeds.

## 7. Risks & mitigations

- **Extra DB read in session callback.** One query per session resolution. NextAuth JWT caching (default 5min `maxAge`) keeps this rare. If it becomes a hot path, cache the resolved sections in the JWT payload directly.
- **Multi-client union surprises.** Admin enables `aplus` for C1 only, expects users on `"C1,C2"` not to see `aplus` → they will (union semantics). Documented in acceptance criteria #3 and tested. Matches existing union semantics for multi-client.
- **Stale `users.allowed_sections`.** After migration, admin/editor/viewer rows still use it; client/prospect rows ignore it. Mitigation: don't drop the column; spec note in `src/lib/db/schema.ts` documents the dual semantics. Drop column in a later migration once we're confident.
- **Migration partial-failure.** Backup SQL must run before ALTER TABLE. Migration script is idempotent: re-running won't double-apply because UPDATE WHERE matches `clientIdCode` exactly.

## 8. References

- `src/lib/permissions.ts` — `CONFIGURABLE_SECTIONS`, `DEFAULT_CLIENT_SECTIONS`, `VALID_SECTION_IDS`, `canAccess`.
- `src/app/portal/page.tsx` lines 405-841 — `AdminPortalLanding` existing layout.
- `src/app/portal/page.tsx` lines 166-401 — `ClientDashboard` existing layout (where toggles live now).
- `src/components/portal/admin-preview-toggle.tsx` — file to delete.
- `src/lib/db/schema.ts` lines 319-342 — `aac` table.
- Commit `46b15b1d` — per-client-group bulk toggle row, partially superseded by this work.
- Commit `e10da8af` — strict per-subsection permission model (no cascade) — unchanged by this work.

End of spec.
