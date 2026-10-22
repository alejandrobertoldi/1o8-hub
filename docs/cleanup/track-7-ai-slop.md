# Track 7: Deprecated Code & AI Slop Audit

## Summary

| Category                        | Count | HIGH | MEDIUM | LOW |
|---------------------------------|-------|------|--------|-----|
| console.log debugging           |    13 |    5 |      6 |   2 |
| eslint-disable comments         |    27 |    0 |      0 |  27 |
| TODO comments                   |     1 |    0 |      1 |   0 |
| @deprecated files               |     2 |    0 |      2 |   0 |
| Narrating comments              |    ~5 |    5 |      0 |   0 |
| Old Next.js / React patterns    |     0 |    0 |      0 |   0 |
| Stub / not-implemented          |     0 |    0 |      0 |   0 |
| Class components                |     0 |    0 |      0 |   0 |
| getServerSideProps etc.         |     0 |    0 |      0 |   0 |

---

## Findings

### 1. console.log Debugging Statements

#### HIGH — Pure debug logs, safe to remove

| File                                              | Line | Statement                                                                              |
|---------------------------------------------------|------|----------------------------------------------------------------------------------------|
| `src/app/seo/[id]/seo/page.tsx`                   | 447  | `console.log("[SEO FE] API batchRows[0] Title length:...")`                            |
| `src/app/seo/[id]/seo/page.tsx`                   | 448  | `console.log("[SEO FE] rows[0] Title before merge:...")`                               |
| `src/app/seo/[id]/seo/page.tsx`                   | 460  | `console.log("[SEO FE] freshRows[0] Title after merge:...")`                           |
| `src/app/seo/[id]/intake/page.tsx`                | 547  | `console.log("Full data loaded:", deduped.length, "ASINs")`                            |
| `src/app/seo/[id]/intake/page.tsx`                | 548  | `console.log("Parentage breakdown:", ...)`                                             |

#### MEDIUM — Operational logging in cron/sync routes (useful for Vercel logs)

| File                                              | Line | Statement                                                                              |
|---------------------------------------------------|------|----------------------------------------------------------------------------------------|
| `src/lib/sync-tables.ts`                          | 235  | `console.log("[Sync] Starting AAC sync...")`                                           |
| `src/lib/sync-tables.ts`                          | 238  | `console.log("[Sync] AAC done: ...")`                                                  |
| `src/lib/sync-tables.ts`                          | 242  | `console.log("[Sync] Starting Attributes sync...")`                                    |
| `src/lib/sync-tables.ts`                          | 245  | `console.log("[Sync] Attributes done: ...")`                                           |
| `src/app/api/cron/sync-tables/route.ts`           |  15  | `console.log("[Sync Cron] Complete in ...")`                                           |
| `src/app/api/cron/sync-bq/route.ts`               |  67  | `console.log("[BQ Sync Cron] Synced ...")`                                             |

#### LOW — Borderline; they log useful operational data

| File                                              | Line | Statement                                                                              |
|---------------------------------------------------|------|----------------------------------------------------------------------------------------|
| `src/app/api/cron/amazon-sync-rainforest/route.ts`| 126  | `console.log("[Rainforest Sync Cron] Summary:", ...)`                                  |
| `src/app/api/reports/inventory/route.ts`           |  73  | `console.log("Query date:", maxDate)` + line 74 SQL snippet log                        |

### 2. eslint-disable Comments (ALL LOW — intentional suppressions)

All 27 `eslint-disable` comments fall into three categories, all intentional:

- **`react-hooks/exhaustive-deps`** (16 instances): Intentionally limiting useEffect/useCallback deps to avoid re-render loops. These are a deliberate React pattern choice.
- **`@typescript-eslint/no-explicit-any`** (8 instances): Suppressing `any` on Recharts custom tick/label props and Drizzle table params where the library types are insufficient.
- **`@next/next/no-img-element`** (2 instances): Using native `<img>` for external Amazon product thumbnails where Next.js Image optimization doesn't apply.
- **`@typescript-eslint/no-var-requires`** (1 instance): Dynamic `require("mammoth")` for DOCX parsing in API route.

None of these are removable without code changes.

### 3. TODO Comment

| File                                              | Line | Comment                                                        | Confidence |
|---------------------------------------------------|------|----------------------------------------------------------------|------------|
| `src/components/aplus/bodies/hotspots.tsx`        | 259  | `// TODO: implement actual image removal via API`              | MEDIUM     |

This is a genuine planned feature (button exists in UI, shows toast "not yet implemented"). Keeping it.

### 4. @deprecated Files

| File                          | Still Used By                                         | Confidence |
|-------------------------------|-------------------------------------------------------|------------|
| `src/lib/column-groups.ts`    | `product-mapper.ts` (JSONB blob routing)              | MEDIUM     |
| `src/lib/column-registry.ts`  | `product-mapper.ts`, `product-detail-form.tsx`, revert routes, SEO activate | MEDIUM     |

Both files are marked `@deprecated` but have active consumers. Cannot remove yet.

### 5. Narrating Comments (AI Slop)

#### HIGH — Comments that restate what code does

| File                                              | Line | Comment                                                                |
|---------------------------------------------------|------|------------------------------------------------------------------------|
| `src/lib/onboarding/create-drive-folders.ts`      |   98 | `// Check if already exists in DB`                                     |
| `src/app/api/aplus/[productId]/modules/route.ts`  |   82 | `// Insert the module`                                                 |
| `src/lib/onboarding/create-asana-project.ts`      |    2 | `// Create an Asana project for a client onboarding.`                  |
| `src/app/api/reports/inventory/route.ts`           |   73 | `// Query date:` / `// SQL snippet:` (console.log debug, not comment)  |
| `src/app/api/ppc/forecast-tool/versions/route.ts`  |   63 | `// Create new version`                                                |

Note: Most "narrating" comments found (e.g., `// Check if duplicate`, `// Fetch all clients`, `// Filter to admin/editor only`) are section headers in long functions. They serve as navigation aids in 200+ line files and are worth keeping.

### 6. No Issues Found

- No class components
- No getServerSideProps/getStaticProps/getInitialProps
- No `throw new Error("not implemented")` stubs
- No old React lifecycle methods

---

## Changes Made (HIGH confidence only)

1. Removed 5 console.log debug statements from SEO pages
2. Removed 2 console.log debug statements from inventory API route
3. Removed 5 narrating comments that restate what the next line of code does

## Left Unchanged

- **Cron/sync console.logs**: These are operational logging in server-only routes, visible in Vercel function logs. Useful for debugging production sync issues.
- **All eslint-disable comments**: Each has a valid reason (dep array control, missing lib types, external images, dynamic require).
- **TODO in hotspots.tsx**: Genuine planned work with a visible UI button.
- **@deprecated files**: Still actively imported by product-mapper, detail form, revert routes.
- **Section-header comments**: Navigational aids in long files, not narrating slop.
