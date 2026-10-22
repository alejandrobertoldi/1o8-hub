# Track 1: Deduplication Report

## Summary

| Confidence | Count | Description                                              |
|------------|-------|----------------------------------------------------------|
| HIGH       | 4     | Identical code, safe to consolidate                      |
| MEDIUM     | 3     | Similar patterns but context-dependent                   |
| LOW        | 2     | Looks similar but serves different purposes              |

---

## HIGH Confidence Findings (Implemented)

### 1. Error message extraction (`instanceof Error` pattern)

**Pattern**: `const msg = err instanceof Error ? err.message : "fallback"`
**Occurrences**: 64+ across 50+ API route files
**Variable names used**: `msg`, `message`, `raw` (same logic, different names)
**Risk**: Inconsistent fallback strings ("Unknown error", "Failed to fetch X", String(err))

**Fix**: Created `getErrorMessage(err, fallback?)` in `src/lib/api-utils.ts`.
Updated 22 files across 7 domains (seo, portal, publish, sync, admin, drive, clients).

**Files updated**:
- `src/app/api/seo/quality/route.ts` (lines 23, 66)
- `src/app/api/seo/projects/route.ts` (lines 168, 378)
- `src/app/api/seo/projects/[id]/duplicate/route.ts` (line 110)
- `src/app/api/seo/projects/catalog/route.ts` (line 310)
- `src/app/api/seo/projects/bulk/route.ts` (line 208)
- `src/app/api/seo/bq/filters/route.ts` (line 57)
- `src/app/api/seo/bq/clients/route.ts` (line 113)
- `src/app/api/admin/sync/route.ts` (line 23)
- `src/app/api/products/variation-groups/route.ts` (line 35)
- `src/app/api/cron/sync-tables/route.ts` (line 21)
- `src/app/api/sync/trigger/route.ts` (line 89)
- `src/app/api/variations/[id]/seo-projects/route.ts` (line 336)
- `src/app/api/clients/[clientIdCode]/onboarding/send_onboarding_email/route.ts` (line 141)
- `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts` (line 111)
- `src/app/api/drive/upload/route.ts` (line 154)
- `src/app/api/publish/route.ts` (line 106)

**Remaining**: ~40 more files could be updated in a follow-up pass.

---

### 2. Standard HTTP error responses (401/403/500)

**Pattern**: `return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
**Occurrences**: 205 (401), 118 (403), 82 (500) across 153+ API route files
**Risk**: Inconsistent wording ("Unauthorized" vs "Not authenticated", "Forbidden" vs "Forbidden: admin only")

**Fix**: Created `unauthorized()`, `forbidden(msg?)`, `badRequest(msg)`, `notFound(msg?)`, `serverError(err, fallback?)` in `src/lib/api-utils.ts`.
Updated 22 files.

**Files updated**:
- `src/app/api/portal/activity/route.ts`
- `src/app/api/portal/seo/route.ts`
- `src/app/api/portal/timeline/route.ts`
- `src/app/api/seo/quality/route.ts` (2 handlers)
- `src/app/api/seo/projects/route.ts` (2 handlers)
- `src/app/api/seo/bq/filters/route.ts`
- `src/app/api/admin/sync/route.ts`
- `src/app/api/products/variation-groups/route.ts`
- `src/app/api/sync/trigger/route.ts`
- `src/app/api/publish/route.ts` (2 handlers)
- `src/app/api/publish/history/route.ts`
- `src/app/api/finances/overview/route.ts`

**Remaining**: ~130 more call sites could be updated in follow-up passes.

---

### 3. Portal client code resolution

**Pattern**: 15-line block that resolves clientIdCode from session (client/prospect role) or query param (admin role).
**Occurrences**: 3 portal routes with identical logic (activity, seo, timeline)
**Risk**: High divergence risk -- any change to client resolution logic must be made in all 3+ places.

**Fix**: Created `resolvePortalClient(session, searchParams)` in `src/lib/api-utils.ts`.
Returns discriminated union: `{ clientIdCode }` on success, `{ response }` on failure.
Updated all 3 portal routes.

**Files updated**:
- `src/app/api/portal/activity/route.ts`
- `src/app/api/portal/seo/route.ts`
- `src/app/api/portal/timeline/route.ts`

---

### 4. Unused import cleanup (byproduct)

Removed unused imports exposed by the refactoring:
- `sql` from drizzle-orm in `portal/activity/route.ts` and `portal/timeline/route.ts`
- `seoAsins` from `portal/seo/route.ts` (only used in raw SQL, not Drizzle builder)

---

## MEDIUM Confidence Findings (Not Implemented)

### 5. Redshift cache wrapper pattern

**Pattern**: `buildCacheKey` + `getCachedData` + cache miss guard + `setCachedData` in reports routes.
**Files**: `reports/overview`, `reports/keywords`, `sales-summary/*` (6 files)
**Why MEDIUM**: The cache logic is identical but the SQL queries and transformations differ significantly. A higher-order wrapper could work but adds indirection for domain-specific code.

### 6. `canAccessSection` + 403 guard pattern

**Pattern**: `if (!canAccessSection(session, "X")) return forbidden()`
**Occurrences**: 34 files
**Why MEDIUM**: While the pattern is identical, the section string varies per route. A middleware approach could work but Next.js App Router middleware doesn't have access to the DB session. Not worth abstracting without a broader auth middleware refactor.

### 7. Reports accountId/start/end validation

**Pattern**: Extract `accountId`, `start`, `end` from searchParams, return 400 if missing.
**Files**: `reports/overview`, `reports/keywords`, `reports/campaigns`
**Why MEDIUM**: Only 3 files, and each adds route-specific params after. The ~5 lines saved don't justify the abstraction.

---

## LOW Confidence Findings (Left Alone)

### 8. Loader2 spinner pattern in components

**Pattern**: `<Loader2 className="h-4 w-4 animate-spin" />`
**Occurrences**: 53+ across 30 components
**Why LOW**: These are inline one-liners embedded in JSX with varying sizes (h-4, h-5, h-8), varying surrounding text, and different contexts. A shared component would add more complexity than it saves.

### 9. `.toFixed(2)` and inline currency formatting

**Pattern**: `value.toFixed(2)` or `toLocaleString("en-US", { style: "currency" })`
**Occurrences**: 104 `.toFixed(2)` across 30 files, 4 files with inline USD formatting
**Why LOW**: The codebase already has `src/lib/formatters.ts` with `fmtCurrency`, `fmtPct`, `fmtDec`. The `.toFixed(2)` usages are in different contexts (template strings, calculations, chart data) where the formatter isn't appropriate.

---

## New File Created

- **`src/lib/api-utils.ts`** -- Shared API route utilities
  - `getErrorMessage(err, fallback?)` -- Safe error extraction from unknown caught values
  - `unauthorized()` -- 401 response
  - `forbidden(message?)` -- 403 response
  - `badRequest(message)` -- 400 response
  - `notFound(message?)` -- 404 response
  - `serverError(err, fallback?)` -- 500 response with error extraction
  - `resolvePortalClient(session, searchParams)` -- Portal client code resolution

## Verification

- `npx tsc --noEmit`: PASS (no errors)
- `npm run lint`: PASS (no new errors; pre-existing warnings unchanged)
