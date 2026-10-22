# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** Next.js 16 App Router with React 19, full-stack TypeScript application using server components and client components, connected to PostgreSQL via Drizzle ORM.

**Key Characteristics:**
- Next.js App Router with server/client component split
- Drizzle ORM for type-safe database queries
- React Query (TanStack Query) for client-side state management and caching
- NextAuth v5 beta for authentication with Google OAuth
- Multi-domain application serving internal (admin/editor) and client-facing (portal) users
- API-first architecture with RESTful endpoints

## Layers

**Presentation Layer (UI/Pages):**
- Purpose: React components rendering pages and interactive UI. Uses client components with hooks and server components for data fetching.
- Location: `src/app/` (page routes), `src/components/` (reusable UI components)
- Contains: Page components (`.tsx`), form components, modal dialogs, data tables, charts
- Depends on: Services layer (via API calls), hooks (React Query, custom hooks)
- Used by: Browser clients (internal and portal users)

**API Layer (Server Routes):**
- Purpose: Next.js API routes handling HTTP requests, auth checks, database operations, external service calls
- Location: `src/app/api/` (route handlers)
- Contains: GET/POST/PATCH/DELETE handlers for each domain (products, variations, SEO, etc.)
- Depends on: Data layer (Drizzle DB), Services layer (business logic, external APIs)
- Used by: Client components (fetch calls), external services (webhooks, cron jobs)

**Services Layer (Business Logic):**
- Purpose: Utilities, mappers, validators, and integrations with external services
- Location: `src/lib/` (utility modules)
- Contains: BigQuery client, SP-API client, file upload handlers, data mappers, config modules
- Depends on: Data layer (DB queries), external SDKs (Google Cloud, Anthropic, etc.)
- Used by: API routes, client components, scripts

**Data Layer (Database):**
- Purpose: PostgreSQL database accessed via Drizzle ORM. Type-safe schema definition.
- Location: `src/lib/db/` (schema, connection), `drizzle/migrations/` (SQL migrations)
- Contains: Schema definitions (`schema.ts`), migration files, connection pooling
- Depends on: PostgreSQL (Supabase), environment variables
- Used by: All API routes, services layer

**External Service Integrations:**
- Location: `src/lib/` (specialized modules)
- Contains: `bigquery.ts` (analytics write), `sp-api/` (Amazon selling), `firecrawl.ts` (web scraping), `drive-client.ts` (Google Drive), `gcp-auth.ts` (GCP auth)

## Data Flow

**Product Management Flow (e.g., product edit → publish):**

1. User opens product detail page (`src/app/products/[id]/page.tsx`)
2. Page fetches product via GET `/api/products/[id]` (server route at `src/app/api/products/[id]/route.ts`)
3. Server route queries `master` table via Drizzle: `db.select().from(master).where(eq(master.id, id))`
4. User edits field and submits form via client component
5. `useMutation` sends PATCH `/api/products/[id]` with new value
6. Server route validates, updates `master` row, logs change to `activityLog` table, sets `isDirty = true`
7. React Query invalidates cache; component re-fetches and displays updated value
8. User clicks "Publish" button (Publish Button component at `src/components/layout/publish-button.tsx`)
9. Publish flow: GET dirty rows → transform to BigQuery schema → write to `amazon-data-461918.1o8Hub.Master` via BigQuery client
10. On success: mark rows `isDirty = false`, write to `publishHistory` table

**Variation Hierarchy Flow (new product group assignment):**

1. User navigates to Variations Builder (`src/app/variations/[id]/page.tsx`)
2. Page fetches variation + groups via GET `/api/variations/[id]`
3. Server joins `variations` → `variationGroups` → `variationGroupAssignments` → products via Drizzle
4. UI renders groups with product count, bulk assign button
5. User clicks assign button, selects products, specifies group
6. Client sends POST `/api/variations/[id]/assign` with `{ productIds, groupId }`
7. Server route inserts rows into `variationGroupAssignments` (many-to-many junction table)
8. For each product, also updates `master.variationGroup` varchar (comma-separated group names) for denormalization
9. Query is invalidated; page re-fetches and displays updated group membership
10. User can remove from specific group via DELETE `/api/variations/[id]/groups/[groupId]/members?productId=X`

**SEO Pipeline Flow (project creation → publishing):**

1. User creates SEO project (`src/app/seo/[id]/intake/page.tsx`)
2. POST `/api/seo/projects` creates row in `seoProjects` table with status='draft', currentPhase='S1'
3. Page navigates to intake form, user fills S1 (brand/keywords) → system moves to S2 (reviews)
4. Each phase completion calls PATCH `/api/seo/projects/[id]` updating `currentPhase` and approval timestamps (s1ApprovedAt, etc.)
5. At S6, system generates content and stores variants in `seoAsins` table
6. Project can be published back to Hub products via separate publish flow

**State Management Flow (client-side):**

1. React Query provider wraps app (`src/components/providers/query-provider.tsx`) with stale time 30s, gc time 15m
2. Client component calls `useQuery({ queryKey: ['products', id], queryFn: () => fetch(...) })`
3. React Query caches result by key; subsequent calls return cached version if not stale
4. On mutation (PATCH/POST/DELETE), component calls `useMutation` which invalidates related query keys
5. Invalidation triggers automatic re-fetch; component receives fresh data
6. Sonner toast provides feedback on success/error

## Key Abstractions

**Product Entity:**
- Purpose: Represents a product (ASIN/SKU) with ~972 metadata columns
- Examples: `src/lib/db/schema.ts` line 115 (`master` table), `src/lib/product-mapper.ts` (converts BigQuery row to Hub product)
- Pattern: Hybrid schema — ~30 core indexed columns + 10 JSONB blobs for categorized data + `rawColumnValues` for zero-data-loss

**Variation Hierarchy:**
- Purpose: 3-level grouping — VariationID (Amazon) → VariationGroup (user-defined) → individual ASIN
- Examples: `src/lib/db/schema.ts` lines 1353-1447 (variations, variationGroups, variationGroupAssignments tables)
- Pattern: One variation has many groups (1:N FK), groups have many products via junction table (N:N)

**SEO Project:**
- Purpose: Represents a product going through 6-phase content pipeline (S1-S6)
- Examples: `src/lib/db/schema.ts` line 481 (`seoProjects` table), `src/lib/seo-pipeline-config.ts` (phase definitions)
- Pattern: State machine — draft → in_progress → completed; phase approval timestamps mark completion

**Activity Log Entry:**
- Purpose: Immutable record of every field change on a product
- Examples: `src/lib/db/schema.ts` line 305 (`activityLog` table)
- Pattern: Insert-only table; never updated or deleted; indexed by product/user/timestamp for audit trails

**Column Registry:**
- Purpose: Metadata for all 972 product attributes (names, types, groups, requirements, client-specific rules)
- Examples: `src/lib/db/schema.ts` line 227 (`columnAttributes` table), `src/lib/column-registry.ts` (module to fetch/cache registry)
- Pattern: Static reference data imported from BigQuery; used to populate column pickers and validate inputs

## Entry Points

**Web App Root:**
- Location: `src/app/layout.tsx`
- Triggers: User browses to `https://1o8hub.vercel.app/`
- Responsibilities: Sets up providers (Session, Query, Theme), layout router, global CSS

**Authentication Gate:**
- Location: NextAuth middleware (implicit via session checks in API routes)
- Triggers: Every page load and API call
- Responsibilities: Redirects unauthenticated users to `/auth/login`, enforces role-based access

**Layout Router:**
- Location: `src/components/layout/layout-router.tsx`
- Triggers: After auth, on every page navigation
- Responsibilities: Routes `/portal/*` to portal shell (client UI), `/auth/*` to bare auth form, everything else to admin sidebar + header

**API Route Entry Points:**
- Products: `src/app/api/products/route.ts` (list/search), `src/app/api/products/[id]/route.ts` (get/patch/delete)
- Variations: `src/app/api/variations/route.ts` (list), `src/app/api/variations/[id]/route.ts` (get/patch)
- SEO: `src/app/api/seo/projects/route.ts` (list/create), `src/app/api/seo/projects/[id]/route.ts` (get/patch)
- Cron Jobs: `src/app/api/cron/[job]/route.ts` (scheduled tasks for syncs, imports, cache refreshes)

## Error Handling

**Strategy:** Try-catch blocks in API routes; graceful fallbacks on client side via React Query error state; toast notifications for user feedback.

**Patterns:**
- API routes catch errors and return `NextResponse.json({ error: "message" }, { status: 500 })`
- Client mutations show toast on error: `toast.error(error.message)` via Sonner
- Validation errors return 400 with specific field messages
- Auth errors return 401
- Query errors stored in React Query state; components display fallback UI (skeleton, empty state, error message)

## Cross-Cutting Concerns

**Logging:**
- Activity log (insert-only) for product changes via `src/lib/event-logger.ts`
- Console logging for dev debugging
- Vercel deployment logs for production monitoring

**Validation:**
- Zod schemas for request bodies (if implemented)
- Database constraints (unique, not null, foreign keys)
- Client-side form validation via react-hook-form + Zod

**Authentication:**
- NextAuth v5 beta with Google OAuth
- Session checked at start of every API route: `const session = await getAuthSession()`
- User role from `session.user.role` determines permissions
- Client role users confined to `/portal/*` by layout router

**Authorization:**
- Role-based access control (RBAC): admin, editor, viewer, client, pending
- Some routes check `session.user.role === "admin"` before allowing mutations
- Pending users redirected to `/auth/register`
- Clients can only access their own data (filtered by `clientIdCode` in queries)

---

*Architecture analysis: 2026-03-21*
