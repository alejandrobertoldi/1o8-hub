# Track 5: Type Strengthening Audit

Generated: 2026-04-18

## Summary

| Category                      | Found | Fixed | Preserved |
| ----------------------------- | ----: | ----: | --------: |
| `catch (e: any)`              |    61 |    61 |         0 |
| `Record<string, any>`         |     3 |     2 |         1 |
| `any` type annotation         |   ~80 |     3 |       ~77 |
| `as any` type assertions      |   ~49 |     0 |       ~49 |
| `@ts-ignore`                  |     0 |     0 |         0 |
| `@ts-expect-error`            |     0 |     0 |         0 |
| `: Object` (capital O)        |     0 |     0 |         0 |
| `eslint-disable no-explicit-any` | 12 |     3 |         9 |

## HIGH Confidence Fixes (Implemented)

### 1. Catch clause `any` -> `unknown` (61 instances, 28 files)

Every `catch (e: any)` or `catch (err: any)` replaced with proper `unknown` typing.

**Pattern A: API routes (simple `err.message`)** -- ~20 instances
```typescript
// Before
} catch (err: any) {
  return NextResponse.json({ error: err.message }, { status: 500 });
}
// After
} catch (err: unknown) {
  return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
}
```

**Pattern B: API routes with Anthropic SDK** -- ~5 instances
```typescript
// Before
} catch (err: any) {
  const status = err.status === 429 ? 429 : 500;
  const msg = err.message?.includes("ANTHROPIC_API_KEY") ? "..." : "...";
}
// After
} catch (err: unknown) {
  const errMsg = err instanceof Error ? err.message : "Failed";
  const errStatus = err instanceof Anthropic.APIError ? err.status : undefined;
  const status = errStatus === 429 ? 429 : 500;
}
```

**Pattern C: Client-side setError** -- ~25 instances
```typescript
// Before
} catch(e:any){setError(e.message);}
// After
} catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}
```

**Pattern D: fetchErr AbortError check** -- ~12 instances
```typescript
// Before
} catch (fetchErr: any) {
  throw new Error(fetchErr.name === "AbortError" ? "..." : "...");
}
// After
} catch (fetchErr: unknown) {
  throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError" ? "..." : "...");
}
```

**Pattern E: Unused error variable** -- 3 instances
```typescript
// Before: } catch (err: any) { return ... "Internal server error" ... }
// After:  } catch { return ... "Internal server error" ... }
```

Files modified:
- `src/app/api/seo/config/route.ts`
- `src/app/api/seo/dashboard/route.ts`
- `src/app/api/seo/projects/[id]/load/route.ts`
- `src/app/api/seo/projects/[id]/save/route.ts`
- `src/app/api/seo/projects/[id]/route.ts`
- `src/app/api/seo/projects/[id]/run-skill/route.ts`
- `src/app/api/seo/projects/[id]/audit-result/route.ts`
- `src/app/api/seo/projects/[id]/competitive/route.ts`
- `src/app/api/seo/projects/[id]/export-gdoc/route.ts`
- `src/app/api/seo/clients/[clientId]/route.ts`
- `src/app/api/seo/claude/reviews/route.ts`
- `src/app/api/seo/claude/cosmo/route.ts`
- `src/app/api/seo/claude/rufus/route.ts`
- `src/app/api/seo/claude/keywords/route.ts`
- `src/app/api/seo/claude/seo-audit/route.ts`
- `src/app/api/seo/claude/seo/route.ts`
- `src/app/api/seo/extract-doc/route.ts`
- `src/app/seo/[id]/seo/page.tsx`
- `src/app/seo/[id]/reviews/page.tsx`
- `src/app/seo/[id]/keywords/page.tsx`
- `src/app/seo/[id]/cosmo/page.tsx`
- `src/app/seo/[id]/rufus/page.tsx`
- `src/app/seo/[id]/intake/page.tsx`
- `src/app/seo/config/page.tsx`
- `src/app/ppc/[clientIdCode]/page.tsx`
- `src/components/aplus/module-card-video.tsx`
- `src/components/aplus/bodies/video-image-carousel.tsx`
- `src/components/aplus/aplus-image-slot.tsx`

### 2. `countTable(table: any)` -> `countTable(table: Table)` (1 instance)

File: `src/app/api/admin/observability/route.ts`
```typescript
// Before
async function countTable(table: any): Promise<number> {
// After
async function countTable(table: Table): Promise<number> {
```
Also removed the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment.

### 3. `Record<string, any>` -> `Record<string, AnyColumn | SQLWrapper>` (2 instances)

Files: `src/app/api/products/route.ts`, `src/app/api/portal/products/route.ts`
```typescript
// Before
const sortColumns: Record<string, any> = { asin: master.asin, ... };
// After
const sortColumns: Record<string, AnyColumn | SQLWrapper> = { asin: master.asin, ... };
```
Also removed both `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments.

### 4. `children: any[]` -> `children: FileChild[]` (1 instance)

File: `src/lib/seo-docx-builder.ts`
```typescript
// Before
const children: any[] = [];
// After
const children: FileChild[] = [];
```

## MEDIUM Confidence (Preserved)

### `as any` for dynamic JSONB property access (~20 instances)

SEO pages access JSONB column properties dynamically using patterns like `(row as any)[col]` or `(a.existingContent as any)?.item_name`. These are MEDIUM because:
- The JSONB `$type<>` definition may not include all runtime properties
- Dynamic column names (`OUT_SEO_COLS.forEach(c => { (merged as any)[c] = sr[c] })`) require index signatures
- Proper fix would require defining comprehensive interfaces for all JSONB shapes

Files: `src/app/seo/[id]/seo/page.tsx`, `src/app/seo/[id]/intake/page.tsx`, `src/app/api/seo/projects/[id]/load/route.ts`, `src/lib/seo-skill-runner.ts`

### `as any` for Drizzle enum casting (~5 instances)

File: `src/app/api/support/route.ts`
```typescript
conditions.push(eq(supportTickets.status, status as any));
```
Drizzle expects the exact enum union type, but input is `string` from query params. DB-level enum constraint validates. Proper fix: define typed enum values and narrow at boundary.

### `Record<string, any>` for dynamic Drizzle updates (1 instance)

File: `src/app/api/support/route.ts`
```typescript
const updates: Record<string, any> = { updatedAt: new Date() };
```
Passed to `db.update().set()`. Proper fix: use `Partial<NewSupportTicket>` but would require restructuring the dynamic key assignment pattern.

### `as any` for Recharts/Sankey component props (~6 instances)

Files: `src/app/finances/page.tsx`, `src/app/portal/finance/reports/page.tsx`
```typescript
<Sankey link={renderLink as any} node={renderNode as any} />
<Tooltip content={({ payload }: any) => ...} />
```
Third-party component type mismatch. Recharts Sankey types are incomplete/imprecise.

### Recharts formatter callback `any` params (~4 instances)

Files: `src/components/analytics/forecast-editor.tsx`, `src/components/ppc/sales-monitor.tsx`
```typescript
formatter={(value: any, name: any) => { ... }}
```
Recharts types pass `any` for these callbacks. The eslint-disable comments are appropriate here.

### `useState<any>` for AI response data (~10 instances)

Files: `src/app/seo/[id]/seo/page.tsx`, `src/app/seo/[id]/reviews/page.tsx`, etc.
```typescript
const [aiUsage, setAiUsage] = useState<any>(null);
const [auditResult, setAuditResult] = useState<any>(null);
```
These store Claude API response objects with complex/varying shapes. Proper fix: define interfaces for each AI response type. Medium effort.

### `any[]` for SEO data rows (~15 instances)

Files: `src/app/seo/[id]/seo/page.tsx`, `src/app/seo/[id]/cosmo/page.tsx`
```typescript
const [cosmoRows, setCosmoRows] = useState<any[]>([]);
```
Rows come from JSONB columns with varying shapes depending on the SEO phase. Would need typed interfaces per phase.

## LOW Confidence (Legitimate boundary types -- preserved)

### SP-API normalizer `any` types (~15 instances)

File: `src/lib/sp-api/normalizer.ts`
External Amazon SP-API response shapes are undocumented and vary. The `eslint-disable @typescript-eslint/no-explicit-any` at file top is appropriate. These are true boundary types.

### SP-API type aliases

File: `src/lib/sp-api/client.ts`
```typescript
export type CatalogItem = any;
export type ListingItem = any;
```
Placeholder types for Amazon SP-API responses. Should be typed when SP-API definitions stabilize.

### Claude API route callback types (~30 instances)

Files: `src/app/api/seo/claude/seo/route.ts`, `src/app/api/seo/claude/keywords/route.ts`, etc.
```typescript
cosmo.filter((c: any) => ...)
keywords.map((k: any) => ...)
```
These iterate over data from JSONB columns. The rows have shapes defined by earlier pipeline stages. Would need shared interfaces across the SEO pipeline.

### `repairTruncatedJson` return type

File: `src/app/api/seo/claude/cosmo/route.ts`
```typescript
function repairTruncatedJson(raw: string): any[] | null {
```
Parses arbitrary truncated JSON. Return type is genuinely unknown.

### Dynamic function parameter types

File: `src/app/api/seo/claude/cosmo/route.ts`, `src/app/api/seo/claude/rufus/route.ts`
```typescript
async function handleGenerate(body: any, session: any, ...)
```
These receive parsed request bodies and session objects. Could be typed with interfaces but low risk since they're internal module boundaries.

## Verification

- `npx tsc --noEmit`: 0 errors (exit code 0)
- `npm run lint`: Pre-existing errors only (no new errors introduced)
