# Track 6: Error Handling Cleanup

**Date**: 2026-04-18
**Scope**: `src/` — all `.ts` and `.tsx` files

## Summary

| Confidence | Count | Action                |
|------------|------:|-----------------------|
| HIGH       |    10 | Fixed                 |
| MEDIUM     |    45 | Left alone (see below)|
| LOW        |    80+ | Left alone (reasonable)|

## HIGH Confidence — Fixed

### 1. SEO Manager: Silent failures on user CRUD operations
**Files**: `src/app/seo/manager/page.tsx`
- **Lines 416, 437, 471, 484, 520**: `renameProject`, `loadProjects`, `duplicateProject`, `updateAssignee`, `updateClient` had empty `catch { }` blocks
- **Impact**: User performs rename/duplicate/assign actions, nothing happens, no feedback
- **Fix**: Added `toast.error(...)` with descriptive messages for each operation

### 2. SEO Pipeline: Silent failures on initial data load
**Files**:
- `src/app/seo/[id]/reviews/page.tsx` (line 73)
- `src/app/seo/[id]/rufus/page.tsx` (line 146)
- `src/app/seo/[id]/cosmo/page.tsx` (line 128)
- **Impact**: If saved data fails to load, page shows empty state with no error. User may re-do work that already exists.
- **Fix**: Added `console.error("[S3/S4/S5] Failed to load saved data:", err)` to all three

### 3. SEO Rufus: Silent auto-save failure
**File**: `src/app/seo/[id]/rufus/page.tsx` (line 383)
- **Impact**: AI-generated draft not persisted; user navigates away and loses work
- **Fix**: Added `console.error("[S4 Rufus] Auto-save draft failed:", err)`

### 4. SEO COSMO: Silent save on approve
**File**: `src/app/seo/[id]/cosmo/page.tsx` (line 831)
- **Impact**: User clicks "Approve" but data save fails silently; page shows approved state but data lost on refresh
- **Fix**: Added `console.error("[S5 COSMO] Failed to save approved data:", err)`

### 5. Finance Overview: Swallowed Redshift error returns 200 with empty array
**File**: `src/app/api/finances/overview/route.ts` (line 65)
- **Impact**: Redshift connection failures invisible; finance page shows "no data" instead of indicating error
- **Fix**: Added `console.error` with error message. Kept 200 status (no known consumer to update)

### 6. Google Drive: Silent file cleanup failures
**Files**:
- `src/app/api/seo/projects/[id]/export-gdoc/route.ts` (line 125)
- `src/app/api/seo/projects/bulk/route.ts` (line 159)
- **Impact**: Old files not cleaned up, no indication in logs; stale files accumulate
- **Fix**: Changed `catch (_) {}` to `catch (err) { console.warn(...) }`

## MEDIUM Confidence — Left Alone

### Fire-and-forget event logging / cache writes (~20 instances)
- `logEvent(...).catch(err => console.error(...))` — event-logger.ts already logs
- `setCachedData(...).catch(() => {})` — cache writes are non-critical optimization
- `fetch(auditUrl).catch(() => {})` — persisting audit/quality results to DB after successful generation
- **Rationale**: These are background writes that should not block the main operation. The pattern is intentional.

### Report card `.catch(() => setLoading(false))` (~15 instances)
- Files: `cpc-cvr-chart.tsx`, `ad-revenue-card.tsx`, `sessions-card.tsx`, etc.
- **Rationale**: UI graceful degradation — shows empty state instead of crashing. Loading spinner stops.

### PPC cron `.catch(() => [])` for parallel data fetches
- File: `src/app/api/cron/ppc-snapshot/route.ts` (lines 92-101)
- **Rationale**: Allows partial data collection; some sources may be down while others work.

### SEO pipeline non-critical enrichment
- `catch { /* non-critical */ }` in `seo/claude/seo/route.ts`, `aplus/ai/video-title/route.ts`
- **Rationale**: These enrich prompts with optional context; missing context degrades quality slightly but doesn't break the feature.

### Onboarding page individual client fetch failures
- `src/app/onboarding/page.tsx` (line 74)
- **Rationale**: Parallel fetch per client; one failure shouldn't block others from loading.

### Client detail / editable cell save failures
- `src/components/clients/editable-cell.tsx`, `client-detail.tsx`
- **Rationale**: Sets save state back to "idle" on failure. Could add toast, but the save state indicator already communicates failure (no "saved" confirmation).

## LOW Confidence — Left Alone (Clearly Reasonable)

### `res.json().catch(() => ({}))` for error body parsing (~40 instances)
Response body may not be valid JSON when the server returns an error. The fallback `{}` is the correct defensive pattern.

### `req.json().catch(() => ({}))` for optional body parsing (~10 instances)
Routes like `/api/admin/sync/route.ts`, `/api/publish/route.ts` use this to accept optional JSON bodies. Intentional.

### `localStorage` try/catch blocks (~10 instances)
`localStorage` may be unavailable (SSR, private browsing, storage quota). Graceful fallback is correct.

### GCP private key format probing (`gcp-auth.ts`)
The try/catch chain on lines 29-49 intentionally tries multiple key formats. The final `throw` at line 52 provides diagnostics if all fail.

### JSON repair in Claude response parsing
`seo/claude/cosmo/route.ts`, `keywords/route.ts`, `reviews/route.ts` — truncated JSON salvage with try/catch is the correct pattern for streaming AI output.

### `Redshift queryRedshift` returning `[]` on failure
`src/lib/redshift.ts` — already logs with `console.error` before returning empty array. Callers handle empty results gracefully.

### Command palette search failure
`src/components/layout/command-palette.tsx` — shows empty state, which is the correct UX for a search.

### Session provider redirect check
`src/components/providers/session-provider.tsx` — network failure during role check doesn't crash the app.

## Verification

- `npx tsc --noEmit` — passes (0 errors)
- `npm run lint` — no new errors introduced (pre-existing: 2091 errors, 17470 warnings)
