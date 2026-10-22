# Codebase Structure

**Analysis Date:** 2026-03-21

## Directory Layout

```
1o8Hub/
├── src/
│   ├── app/                          # Next.js App Router pages & API routes
│   │   ├── layout.tsx                # Root layout (providers, globals)
│   │   ├── page.tsx                  # Dashboard / home page
│   │   ├── globals.css               # Global Tailwind + custom CSS
│   │   ├── api/                      # Server routes (REST API)
│   │   │   ├── products/             # Product CRUD & operations
│   │   │   ├── variations/           # Variation hierarchy & groups
│   │   │   ├── seo/                  # SEO pipeline endpoints
│   │   │   ├── aplus/                # A+ content module management
│   │   │   ├── admin/                # Admin panel endpoints
│   │   │   ├── portal/               # Client-facing API
│   │   │   ├── cron/                 # Scheduled background jobs
│   │   │   └── [other domains]/      # See domains table below
│   │   ├── products/                 # Product detail & list pages
│   │   ├── variations/               # Variation builder UI
│   │   ├── seo/                      # SEO manager & intake UI
│   │   ├── aplus/                    # A+ content module editor
│   │   ├── admin/                    # Admin dashboards
│   │   ├── portal/                   # Client-facing views
│   │   ├── auth/                     # Login & registration pages
│   │   └── [other domains]/          # See structure table below
│   │
│   ├── components/                   # Reusable React components
│   │   ├── providers/                # Context providers (Session, Query, Theme)
│   │   ├── layout/                   # Layout chrome (Sidebar, Header, Router)
│   │   ├── ui/                       # shadcn/ui + Radix primitives
│   │   ├── products/                 # Product-specific components
│   │   ├── seo/                      # SEO pipeline components
│   │   ├── aplus/                    # A+ content components
│   │   ├── admin/                    # Admin UI components
│   │   └── [other domains]/          # Domain-specific components
│   │
│   ├── lib/                          # Utilities, services, config
│   │   ├── db/                       # Database layer
│   │   │   ├── index.ts              # Drizzle connection & pooling
│   │   │   └── schema.ts             # Full schema definition (1500+ lines)
│   │   ├── sp-api/                   # Amazon SP-API client & helpers
│   │   ├── parsers/                  # Data parsing utilities
│   │   ├── bigquery.ts               # BigQuery write/read client
│   │   ├── product-mapper.ts         # BigQuery row → Hub product transformer
│   │   ├── column-registry.ts        # Column metadata cache & fetch
│   │   ├── aplus-module-specs.ts     # A+ module type definitions
│   │   ├── seo-pipeline-config.ts    # SEO phase definitions & config
│   │   ├── auth.ts                   # NextAuth config & helpers
│   │   ├── auth-db.ts                # Session validation helper
│   │   ├── drive-client.ts           # Google Drive API wrapper
│   │   ├── firecrawl.ts              # Web scraping client
│   │   ├── email.ts                  # Transactional email (Resend)
│   │   ├── permissions.ts            # RBAC & role checking
│   │   └── [other utilities]/        # Various mappers, validators, formatters
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── use-amazon-live.ts        # Fetch live Amazon data
│   │   ├── use-category-definition.ts # Load category metadata
│   │   └── [other hooks]/
│   │
│   ├── types/                        # Shared TypeScript type definitions
│   │   └── [domain types]/           # Per-domain type files
│   │
│   ├── test/                         # Test setup & utilities
│   │   └── setup.ts                  # Vitest setup, mocks
│   │
│   └── proxy.ts                      # Request proxy utility
│
├── drizzle/
│   ├── migrations/                   # SQL migration files (numbered 0001-0024+)
│   └── seed.ts                       # (Optional) seed script
│
├── scripts/                          # One-off scripts
│   ├── create-admin.ts               # Create first admin user
│   ├── import-from-bigquery.ts       # Import products from BQ
│   ├── import-aac.ts                 # Import client metadata from BQ
│   ├── generate-column-registry.ts   # Populate column_attributes table
│   ├── seed-team.ts                  # Seed team members
│   └── backfill-activity-log.ts      # Populate activity_log retroactively
│
├── public/                           # Static assets
│   ├── fonts/                        # Custom fonts
│   └── aplus/                        # A+ content templates/assets
│
├── docs/                             # Documentation
│   ├── DESIGN.md                     # Design system & visual guidelines
│   └── designs/                      # Design artifacts
│
├── .planning/                        # GSD planning & analysis
│   ├── codebase/                     # Architecture/structure docs
│   └── milestones/                   # Project milestones
│
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript config
├── tailwind.config.ts                # Tailwind CSS config
├── vitest.config.ts                  # Vitest config
├── eslint.config.mjs                 # ESLint config
├── next.config.ts                    # Next.js config
└── .env.example                      # Environment variables template
```

## Directory Purposes

**src/app:**
- Purpose: Next.js App Router file structure. Each directory with `page.tsx` becomes a route.
- Contains: Page components, API route handlers, layout files
- Key files: `layout.tsx` (root), `page.tsx` (dashboard), `globals.css` (styles)

**src/app/api:**
- Purpose: RESTful API endpoints. Each domain (products, variations, seo, etc.) has a subdirectory.
- Contains: `GET`, `POST`, `PATCH`, `DELETE` handlers for HTTP requests
- Key files: `products/route.ts` (list/search), `products/[id]/route.ts` (detail), `seo/projects/route.ts` (SEO CRUD)

**src/components:**
- Purpose: Reusable React components organized by domain
- Contains: UI components, layout chrome, modals, tables, forms
- Key files: `providers/` (Session/Query/Theme context), `layout/layout-router.tsx` (routing logic), `ui/` (shadcn primitives)

**src/lib:**
- Purpose: Non-component code: utilities, services, integrations, business logic
- Contains: Database client, mappers, API clients, validators, config modules
- Key files: `db/schema.ts` (schema), `bigquery.ts` (BQ write), `seo-pipeline-config.ts` (pipeline definition)

**src/lib/db:**
- Purpose: Database layer
- Contains: Drizzle ORM schema definition, connection pooling, type exports
- Key files: `schema.ts` (1500+ lines defining all 50+ tables), `index.ts` (connection with HMR safety)

**src/lib/sp-api:**
- Purpose: Amazon SP-API client wrapper
- Contains: Authentication, product list/detail fetching, listing operations
- Used by: Amazon sync page, product detail page for live comparison

**drizzle/migrations:**
- Purpose: SQL migration files, auto-generated by `drizzle-kit generate` from schema changes
- Naming: `0001_create_users.sql`, `0022_variation_group_assignments.sql` (chronological)
- Run via: `npm run db:migrate` or `npm run db:push` (dev-only direct push)

**scripts:**
- Purpose: One-off TypeScript scripts for data import, initialization, maintenance
- Usage: `npm run create-admin`, `npm run import-bq`, etc.

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout with providers
- `src/app/page.tsx`: Dashboard (home page, client summary, completeness scores)
- `src/middleware.ts`: Not present; auth enforcement via NextAuth + API route checks

**Configuration:**
- `.env.example`: Documents all required env vars
- `src/lib/auth.ts`: NextAuth provider configuration
- `src/lib/seo-pipeline-config.ts`: SEO phase definitions, requirements, templates
- `src/lib/aplus-module-specs.ts`: A+ module type specs (23 types × 4-8 fields each)

**Core Logic:**
- `src/lib/db/schema.ts`: Full database schema (50+ tables, 1500+ lines)
- `src/lib/bigquery.ts`: BigQuery SDK client, write-truncate logic, schema mapping
- `src/lib/product-mapper.ts`: BigQuery row → Hub product transformation
- `src/app/api/products/route.ts`: Product list/search with complex filtering
- `src/app/api/variations/[id]/route.ts`: Variation detail with groups + assignments

**Testing:**
- `src/test/setup.ts`: Vitest setup (jsdom, mocks)
- `src/app/api/seo/projects/route.test.ts`: API route tests with mocked DB
- `src/components/seo/quality-sparkline.test.tsx`: Component tests
- `src/hooks/use-outside-click.test.ts`: Hook tests

## Naming Conventions

**Files:**
- Pages: `page.tsx` (no prefix, follows Next.js convention)
- Components: `PascalCase.tsx` (e.g., `ProductTable.tsx`, `VariationBuilder.tsx`)
- Utilities: `kebab-case.ts` (e.g., `column-registry.ts`, `product-mapper.ts`)
- API routes: `route.ts` for handler, `[id]` for dynamic segments (Next.js convention)
- Tests: `*.test.ts`, `*.test.tsx` or `*.spec.ts`
- Migrations: `NNNN_description.sql` (auto-generated by drizzle-kit)

**Directories:**
- Features: `kebab-case` (e.g., `seo/`, `aplus/`, `amazon-sync/`)
- UI components: `kebab-case` subdirectories (e.g., `components/seo/manager/`)
- API domains: matches feature name (e.g., `api/seo/`, `api/variations/`)

**Database Tables:**
- Naming: `snake_case` (e.g., `master`, `seo_projects`, `variation_groups`, `activity_log`)
- Columns: `snake_case` (e.g., `client_id_code`, `item_name`, `is_dirty`)
- Enums: `snake_case` (e.g., `user_role`, `aplus_module_status`)

**React Components:**
- Props interfaces: `[ComponentName]Props` (e.g., `ProductTableProps`)
- State variables: `camelCase` (e.g., `selectedClient`, `isLoading`)
- Event handlers: `on[Event]` (e.g., `onClick`, `onSubmit`, `onAssign`)

**API Endpoints:**
- GET (fetch): `/api/[domain]/[resource]` or `/api/[domain]/[resource]/[id]`
- POST (create): `POST /api/[domain]/[resource]`
- PATCH (update): `PATCH /api/[domain]/[resource]/[id]`
- DELETE (remove): `DELETE /api/[domain]/[resource]/[id]`
- Actions: `POST /api/[domain]/[resource]/[id]/[action]` (e.g., `/api/variations/123/assign`)

## Where to Add New Code

**New Feature (e.g., new product workflow):**
- Primary code: `src/app/products/[new-workflow]/page.tsx` (page), `src/app/api/products/[new-workflow]/route.ts` (API)
- Business logic: `src/lib/[feature-name].ts` (utilities/mappers)
- Components: `src/components/products/[feature-name]/` (UI)
- Tests: Co-locate with implementation (`page.test.tsx`, `route.test.ts`)

**New Component/Module:**
- Implementation: `src/components/[domain]/[ComponentName].tsx`
- Props: Define `[ComponentName]Props` interface in same file or `types/[domain].ts`
- Tests: `src/components/[domain]/[ComponentName].test.tsx`

**Utilities/Helpers:**
- Shared helpers: `src/lib/[feature-name].ts` (e.g., `column-registry.ts`, `permissions.ts`)
- Domain-specific utilities: `src/lib/[domain]/[helper].ts` (e.g., `src/lib/sp-api/comparator.ts`)
- If re-exported, add to barrel file (if present) or import directly

**New Domain (e.g., new major feature area):**
- Pages: `src/app/[domain-name]/` (list page `page.tsx`, detail `[id]/page.tsx`)
- API: `src/app/api/[domain-name]/` (route handlers matching page structure)
- Components: `src/components/[domain-name]/` (all UI for this domain)
- Types: `src/types/[domain-name].ts` (TypeScript types)
- Tests: Same structure but with `.test.ts` suffix
- Database: Add tables to `src/lib/db/schema.ts`, run `npm run db:generate` to create migration

## Special Directories

**src/components/ui:**
- Purpose: Shadcn/ui component library (Radix-based)
- Generated: Yes (via `npx shadcn-ui@latest add [component]`)
- Committed: Yes (committed to repo, not in node_modules)
- Contains: Button, Input, Dialog, Select, Table, Toast, Sidebar, and 20+ other base components

**src/components/providers:**
- Purpose: React context providers for global state
- Contains: SessionProvider (NextAuth session), QueryProvider (React Query), ThemeProvider (dark/light mode)
- Used in: `src/app/layout.tsx` for root setup

**drizzle/migrations:**
- Purpose: SQL migration history, one file per schema change
- Generated: Automatically by `npm run db:generate` from schema changes
- Applied via: `npm run db:migrate` (uses Drizzle's migration system)
- Committed: Yes, all migration files committed to git

**public/aplus:**
- Purpose: A+ content templates, default images, module blueprints
- Static: Yes, served as-is by Next.js static file handler

**scripts:**
- Purpose: One-off data operations (imports, initialization, exports)
- Run with: `npm run [script-name]` (configured in package.json)
- Examples: `npm run import-bq` (BigQuery import), `npm run create-admin` (first user)

---

*Structure analysis: 2026-03-21*
