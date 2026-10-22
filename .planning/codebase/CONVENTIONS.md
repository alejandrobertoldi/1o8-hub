# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- Route handlers: `route.ts` (Next.js App Router standard)
- Components: `kebab-case.tsx` (e.g., `product-table.tsx`, `quality-sparkline.tsx`)
- Utilities/Helpers: `kebab-case.ts` (e.g., `column-utils.ts`, `drive-upload.ts`)
- Test files: `{name}.test.ts` or `{name}.test.tsx` co-located next to source
- Database: `schema.ts` (Drizzle tables defined here)
- Pages: `page.tsx` (Next.js standard for route segments)

**Functions:**
- Async API handlers: `GET`, `POST`, `PATCH`, `DELETE` (uppercase, Next.js convention)
- Utility functions: `camelCase` (e.g., `fetchProducts()`, `normalizeVariationKeys()`, `isParentRow()`)
- React components: `PascalCase` (e.g., `ProductTable`, `DiffModal`, `QualitySparkline`)
- Helper functions: `camelCase` with descriptive action verbs (e.g., `toSnakeCase()`, `setJsonbColumns()`)

**Variables:**
- Standard variables: `camelCase` (e.g., `session`, `dbUser`, `expandedFamilyIds`, `debouncedSearch`)
- Constants/Enums: `UPPER_SNAKE_CASE` (e.g., `CLIENT_NAMES` in `src/lib/constants.ts`)
- Type state variables: `camelCase` (e.g., `rowSelection`, `statuses`, `isDirty`)
- Refs: `camelCase` with "Ref" suffix (e.g., Result patterns: `useState(...Ref)`)

**Types:**
- Type names: `PascalCase` (e.g., `ProductRow`, `ClientEntry`, `SeoVersion`, `ProductsResponse`)
- Type file exports: Named types and interfaces
- Generics: Single uppercase letters when simple (e.g., `T`), descriptive names otherwise

## Code Style

**Formatting:**
- ESLint: eslint (v9) with Next.js core-web-vitals and TypeScript configs
  - Config: `eslint.config.mjs` (ESLint flat config format)
  - Uses `eslint-config-next` for Next.js specific rules and `eslint-config-next/typescript`
- No Prettier config detected — code follows ESLint output without explicit formatting rules
- TypeScript strict mode enabled in `tsconfig.json`

**Linting:**
- ESLint rules from Next.js core-web-vitals preset (enforced)
- Path alias `@/*` maps to `./src/*` (use this in all imports)
- TypeScript `strict: true` enforced for type safety

## Import Organization

**Order:**
1. React imports (`useState`, `useCallback`, etc. from `react`)
2. Next.js imports (`useRouter`, `useSearchParams`, etc.)
3. External packages (`@tanstack/react-query`, `clsx`, etc.)
4. Internal utils (`@/lib/*`, `@/components/*`)
5. Icons/UI components (last)

**Examples:**
```typescript
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
```

**Path Aliases:**
- Use `@/*` for all internal imports — NEVER relative paths like `../`
- Resolves to `./src/*` via tsconfig

## Error Handling

**Patterns:**
- API routes wrap logic in `try-catch` blocks
- Catch blocks extract `message` from errors: `catch (err: any) { ... err.message }`
- Return early with `NextResponse.json({ error: "..." }, { status: XYZ })` for validation/auth failures
- Terminal error: `catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }`
- No custom error classes observed — use message strings

**Status Code Conventions:**
- `401`: Not authenticated (`if (!session)`)
- `403`: Forbidden (authenticated but insufficient permission, e.g., viewer role)
- `400`: Bad request (missing/invalid body params)
- `404`: Not found (resource doesn't exist)
- `409`: Conflict (e.g., duplicate unique key)
- `500`: Internal server error (catch block fallback)
- `503`: External service unavailable (Redshift, Amazon SP-API, etc.)

**Examples from codebase:**
```typescript
// src/app/api/variations/[id]/assign/route.ts (lines 12-24)
const session = await getAuthSession();
if (!session)
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

const { id } = await params;
const body = await req.json();
const { productIds, groupId, tagIds, unassign } = body;

if (!Array.isArray(productIds) || productIds.length === 0)
  return NextResponse.json(
    { error: "productIds array is required" },
    { status: 400 }
  );

// src/app/api/seo/projects/[id]/route.ts (lines 43-56)
try {
  const { id } = await params;
  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ... success path
  return NextResponse.json(toSnakeCase(project));
} catch (err: any) {
  return NextResponse.json({ error: err.message }, { status: 500 });
}
```

## Logging

**Framework:** `console.*` for logging (no custom logger library)

**Patterns:**
- `console.log()` for informational/trace logs (cron jobs, batch operations)
- `console.error()` for errors (caught exceptions, failures)
- Format: `console.log("[Context]", JSON.stringify(data))` for structured data

**Examples from codebase:**
```typescript
// src/app/api/cron/sync-tables/route.ts
console.log("[Sync Cron] Syncing...");
console.error("[Sync Cron] Failed:", message);

// src/app/api/cron/amazon-sync-rainforest/route.ts
console.log("[Rainforest Sync Cron] Summary:", JSON.stringify(summary));
```

## Comments

**When to Comment:**
- Complex SQL queries (e.g., subqueries, JSONB operations)
- Non-obvious transformations (e.g., `toSnakeCase()` mapping camelCase to snake_case)
- Database constraints and relationships
- Transaction boundaries
- Intent comments for business logic (e.g., "Auto-create user on first sign-in")

**JSDoc/TSDoc:**
- Used selectively for public functions, especially in `/lib` modules
- Multi-line format: `/** Comment on single line */` or multi-line `/** ... */`
- Parameter docs: `/** Param description */` inline above params
- Server-only function warnings: Document runtime constraints

**Examples:**
```typescript
// src/lib/auth-db.ts
/**
 * Get the current session with the user's DB role resolved.
 * Only call from Node.js runtime (API routes, server components) — NOT from middleware.
 */
export async function getAuthSession() { ... }

/**
 * Check if the current session user can access a given section.
 * Supports hierarchical department-based permissions.
 */
export function canAccessSection(...) { ... }

// src/lib/column-registry.ts
/** Original BQ column name (exactly as it appears in BigQuery) */
bqName: string;

/** Column group ID (matches COLUMN_GROUPS) */
group: string;

// src/app/api/variations/[id]/assign/route.ts
// 1. Set variation_ref and VariationID in JSONB (no groupRef — groups are via junction now)
// 2. Handle group assignment via junction table (additive — doesn't remove from other groups)
```

## Function Design

**Size:** Inline functions for simple transforms; extracted functions for reusable logic
- Small API handlers: 50-100 lines (including error handling)
- Larger handlers split into helper functions in the same file or `/lib`

**Parameters:**
- Typed parameters always (no implicit `any`)
- Object destructuring for multiple params: `{ productIds, groupId, tagIds, unassign }`
- Promise params unpacked immediately: `const { id } = await params` (Next.js pattern)

**Return Values:**
- API routes: always return `NextResponse.json(...)`
- Components: return JSX or `null` (no early returns with conditional render)
- Utilities: return typed values, never implicit `undefined`

**Examples:**
```typescript
// src/components/products/product-table.tsx
async function fetchClients(): Promise<ClientEntry[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) return [];
  return res.json();
}

function isParentRow(row: ProductRow): boolean {
  return row.parentageLevel?.toLowerCase() === "parent";
}

// src/app/api/seo/projects/[id]/route.ts
function toSnakeCase(p: typeof seoProjects.$inferSelect, variation?: { ... } | null) {
  return {
    id: p.id,
    name: p.name,
    brand_name: p.brandName,
    // ... mapped fields
  };
}
```

## Module Design

**Exports:**
- Named exports for all public functions and types
- Default exports used ONLY for Next.js page/layout/route components
- Type exports: `export type { TypeName }` on same line as definition or separate

**Barrel Files:**
- NOT used extensively in this codebase
- Direct imports from specific files preferred: `import { getAuthSession } from "@/lib/auth-db"`

**File Structure:**
- Types defined at top of file before functions
- Utility functions mid-file
- API handlers at bottom
- Drizzle schema uses consistent section headers: `// ─── [Section] ──────────────`

**Example structure:**
```typescript
// src/app/api/variations/[id]/assign/route.ts
import { ... } from "...";           // Imports

type Params = { params: Promise<{ id: string }> };  // Types

// PATCH /api/variations/[id]/assign — bulk assign...  // Route comment
export async function PATCH(req: NextRequest, { params }: Params) {
  // Implementation
}
```

---

*Convention analysis: 2026-03-21*
