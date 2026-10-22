# 1o8Hub — Full Project Context

## What Is This

1o8Hub is an internal agency platform built by **1o8 Agency** for managing Amazon product listings at scale. It serves 3-5 agency team members (managers, SEO specialists, editors) and their Amazon seller clients (via a portal view).

- **Production**: https://1o8hub.vercel.app
- **GitHub**: https://github.com/1o8-Marketplace/1o8Hub
- **Branch strategy**: Single `main` branch, auto-deploys to Vercel
- **Git author**: `Manu <manuel.lancharro@1o8.agency>`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 App Router |
| Runtime | React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4, shadcn/ui (Radix primitives) |
| ORM | Drizzle ORM (`postgres` driver) |
| Database | PostgreSQL via Supabase |
| Analytics DB | Amazon Redshift (Intentwise) |
| Data warehouse | Google BigQuery (`amazon-data-461918.1o8Hub.Master`) |
| Auth | NextAuth v5 (beta) with Google OAuth |
| AI | Anthropic Claude API (alt-text, video titles, SEO content) |
| File storage | Google Drive API |
| Email | Resend |
| Testing | Vitest + Testing Library |
| Deployment | Vercel (auto-deploy from `main`) |

**Path alias**: `@/*` → `./src/*`

---

## Commands

```bash
# Development
PORT=3000 npm run dev          # Dev server on localhost:3000

# Build & lint
npm run build
npm run lint

# Database (Drizzle + Supabase)
npm run db:generate            # Generate migration from schema changes
npm run db:migrate             # Run pending migrations
npm run db:push                # Push schema directly (dev only)
npm run db:studio              # Open Drizzle Studio GUI

# Data scripts
npm run create-admin           # Create admin user
npm run import-bq              # Import products from BigQuery
npm run import-aac             # Import AAC client data
npm run generate-columns       # Regenerate column registry from DB
npm run seed-team              # Seed team members
npm run backfill-activity      # Backfill activity log entries

# Testing
npm run test                   # Run all tests
npm run test:watch             # Watch mode
```

---

## Auth & Roles

NextAuth v5 with Google OAuth. Middleware at `src/middleware.ts` enforces auth on all routes.

| Role | Access |
|------|--------|
| `admin` | Full access to everything |
| `editor` | All hub pages, can edit products |
| `viewer` | All hub pages, read-only |
| `client` | Confined to `/portal/*` only |
| `pending` | Redirected to `/auth/register` |
| `prospect` | Limited onboarding access |

Public routes: `/auth/*`, `/calculator`, `/api/auth`, `/api/cron`, `/api/webhooks`, static assets.

---

## Database Schema

PostgreSQL via Supabase. Schema defined at `src/lib/db/schema.ts` (~1700 lines).

### All Tables (44 tables)

| Category | Tables |
|----------|--------|
| **Core** | `users`, `master` (products), `columnAttributes`, `aac` |
| **Products** | `variations`, `variationGroups`, `variationTags`, `variationTagAssignments`, `variationGroupAssignments`, `varietyPackItems` |
| **A+ Content** | `aplusSets`, `aplusModules`, `aplusModuleImages`, `brandStory`, `aplusComments` |
| **SEO Pipeline** | `seoProjects`, `seoAsins`, `seoKeywords`, `seoReviews`, `seoRufus`, `seoCosmopMaps`, `seoComplianceReports`, `seoExports`, `seoQualityScores`, `seoSettings` |
| **Amazon Sync** | `amazonSnapshots`, `amazonSyncSnapshots`, `amazonSyncRuns`, `amazonSyncDiscrepancies`, `spApiCredentials` |
| **Category Definitions** | `categoryDefinitions`, `categoryAttributes` |
| **Publishing** | `publishHistory` |
| **Finance** | `salesSummaryCache` |
| **Analytics** | `contentImpactSnapshots`, `inventoryRecSettings` |
| **Client Mgmt** | `clientOnboardingSteps`, `clientGanttTasks`, `clientForecasts`, `ganttTemplates` |
| **Files** | `driveFolders`, `driveFiles` |
| **Admin** | `activityLog`, `adminEventLog`, `fieldComments`, `issueReports` |

### Products Table (master)

Hybrid schema design:
- ~30 indexed core columns (ASIN, title, brand, price, etc.)
- Categorized JSONB blobs for ~940 remaining Amazon attributes
- `raw_column_values` JSONB for zero-data-loss on import

---

## Application Domains

### Products (`/products`, `/api/products`)
CRUD for Amazon product listings. Inline editing. Column registry with 972 attributes. Product detail page with collapsible sections. Amazon metadata (requirement badges R/C/P/O, dropdowns for valid values).

### Variations (`/variations`, `/api/variations`)
Hierarchical product grouping: exclusive groups (FK) + cross-cutting tags (junction table). Auto-detect from Amazon VariationThemeName. Builder UI with bulk assign.

### A+ Content (`/aplus`, `/api/aplus`)
Module editor — up to 7 modules per product. 19 module types (comparison tables, carousels, images, video, Q&A, etc.). Image slots with Google Drive upload. Markup.io-style inline comments for review workflow. Status flow: draft → in_review → approved → uploaded → live.

### SEO Pipeline (`/seo`, `/api/seo`)
6-phase pipeline:
- **S1** Intake — product onboarding
- **S2** Keywords — keyword research
- **S3** Reviews — review analysis
- **S4** Rufus Q&A — AI Q&A generation
- **S5** COSMO Maps — conceptual maps
- **S6** Content — final content generation

Includes Content Control Center (`/seo/manager`), SEO Dashboard, per-client detail views (`/seo/clients/[clientId]`).

### Finance (`/finances`, `/portal/finance`)
Hub finance reports using Redshift settlement data. Sankey flow visualization. Client portal finance views.

### Amazon Sync (`/amazon-sync`, `/api/amazon-sync`)
SP-API + Rainforest API comparisons. Discrepancy tracking between hub data and live Amazon listings.

### Client Portal (`/portal`)
Client-facing views: A+ content approval, reports, sales data, finance statements. Clients only see their own data.

### Admin (`/admin`, `/api/admin`)
User management, event log, AI configuration (model selection, prompt templates).

### Publishing (`/publish`, `/api/publish`)
Dirty-row tracking. BigQuery write-back using `WRITE_TRUNCATE` (full table replace) to `amazon-data-461918.1o8Hub.Master`.

### Reports & Export (`/reports`, `/export`)
PDF, XLSX, DOCX generation. Client reports with branded templates.

### Client Onboarding (`/onboarding`)
Gantt-chart-based onboarding flow. AIA/NTA client type templates. Asana task auto-assignment. 6-section layout.

### Sales Summary (`/sales-summary`)
Cached sales data with weekly columns. PostgreSQL cache + 6h cron refresh.

### Other Routes
- `/calculator` — public fee calculator
- `/calendar` — team calendar
- `/timeline` — project timeline
- `/tools` — internal utilities
- `/variety-packs` — variety pack management
- `/activity` — activity feed

---

## External Service Integrations

| Service | Purpose | Config |
|---------|---------|--------|
| **Google BigQuery** | Product data warehouse (read/write) | `GCP_PROJECT_ID`, `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY` |
| **Google Drive** | File upload/folder management for A+ images | `GOOGLE_SHARED_DRIVE_ID`, `GOOGLE_DRIVE_FOLDER_ID` |
| **Amazon SP-API** | Per-client selling partner API | `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET` + per-client creds in `sp_api_credentials` table |
| **Rainforest API** | Amazon product data scraping | `RAINFOREST_API_KEY` |
| **Firecrawl** | Web scraping | `FIRECRAWL_API_KEY` |
| **Anthropic Claude** | AI content generation | `ANTHROPIC_API_KEY` |
| **Redshift** | Intentwise analytics (finance/sales) | `REDSHIFT_HOST`, `REDSHIFT_USER`, `REDSHIFT_PASSWORD` |
| **Resend** | Transactional email | `RESEND_API_KEY` |
| **Asana** | Task management (onboarding) | Connected via MCP |

---

## Key Library Files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth configuration |
| `src/lib/db/schema.ts` | All Drizzle table definitions (~1700 lines) |
| `src/lib/bigquery.ts` | BigQuery client + publish logic |
| `src/lib/column-registry.ts` | 972-attribute product column definitions |
| `src/lib/column-groups.ts` | Grouping of columns into categories |
| `src/lib/product-mapper.ts` | Maps raw data → product schema |
| `src/lib/category-attribute-matcher.ts` | Maps Amazon category attributes to hub fields |
| `src/lib/ai-config.ts` | AI config (client-safe constants) |
| `src/lib/ai-config.server.ts` | AI config (server-side with DB lookups) |
| `src/lib/drive-client.ts` | Google Drive API client |
| `src/lib/drive-upload.ts` | Drive upload helpers |
| `src/lib/redshift.ts` | Redshift connection + queries |
| `src/lib/sales-cache.ts` | Sales summary caching logic |
| `src/lib/seo-pipeline-config.ts` | SEO pipeline phase definitions |
| `src/lib/permissions.ts` | Role-based access control |
| `src/lib/event-logger.ts` | Activity logging |
| `src/lib/email.ts` | Resend email helpers |
| `src/lib/sp-api/` | Amazon SP-API client directory |

---

## Design System

Full design system documented in `DESIGN.md`. Key points:

- **Aesthetic**: Industrial/utilitarian — data-dense, function-first, professional
- **Font**: Geist Sans (display + body), Geist Mono (code)
- **Brand color**: Warm gold `#E8A700` (light) / `#F8BF1C` (dark)
- **Background**: `#F7F5F1` warm linen (light) / `#05070B` near-black slate (dark)
- **Cards**: `rounded-xl border` with hover shadow
- **Buttons**: `rounded-lg bg-brand` with glow shadow
- **Badges**: `rounded-md px-2 py-0.5 text-[9px] font-bold`
- **Motion**: Minimal-functional only (150ms hover transitions, staggered card entrance)
- **Hub heading pattern**: `<span font-bold>Word1</span><span text-brand>Word2</span>` (jammed words like "ClientsInsight")

---

## Environment Variables

All defined in `.env.example`:

```
DATABASE_URL          # Supabase PostgreSQL connection string
NEXTAUTH_URL          # Production URL
NEXTAUTH_SECRET       # Auth encryption key
GOOGLE_CLIENT_ID      # Google OAuth
GOOGLE_CLIENT_SECRET
GCP_PROJECT_ID        # BigQuery (amazon-data-461918)
GCP_CLIENT_EMAIL      # Service account
GCP_PRIVATE_KEY       # Must set via Vercel CLI, not dashboard
BQ_DATASET            # 1o8Hub
BQ_TABLE              # Master
GOOGLE_SHARED_DRIVE_ID
GOOGLE_DRIVE_FOLDER_ID
ANTHROPIC_API_KEY
RAINFOREST_API_KEY
FIRECRAWL_API_KEY
SP_API_CLIENT_ID
SP_API_CLIENT_SECRET
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
REDSHIFT_HOST
REDSHIFT_PORT         # 5439
REDSHIFT_DATABASE     # data_platform
REDSHIFT_USER
REDSHIFT_PASSWORD
```

**Important**: GCP private key must be set via Vercel CLI due to multiline handling:
```bash
npx vercel env add GCP_PRIVATE_KEY production < key.pem
```

---

## Deployment

- **Platform**: Vercel
- **Auto-deploy**: Pushes to `main` trigger production deploys
- **Production URL**: https://1o8hub.vercel.app
- **Git author for deploys**: `Manu <manuel.lancharro@1o8.agency>` (required)

---

## Key Patterns & Conventions

1. **JSONB blobs**: Products use categorized JSONB fields to store 940+ Amazon attributes without needing 940 columns
2. **Column registry**: `column-registry.ts` defines all 972 product attributes with metadata (type, group, validation)
3. **Activity logging**: `event-logger.ts` records user actions for audit trail
4. **Dirty-row tracking**: Publishing tracks which rows changed since last BigQuery sync
5. **Per-client credentials**: SP-API creds stored per-client in DB, not env vars
6. **AI config split**: Client-safe constants in `ai-config.ts`, server-side with DB lookups in `ai-config.server.ts`
7. **Cron jobs**: Authenticated via `CRON_SECRET` header, bypasses auth middleware
8. **Sales cache**: PostgreSQL cache with 6-hour cron refresh for fast dashboard loads

---

## Current State (as of April 2026)

### Recently Completed
- Product detail UX — collapsible PDP, dropdowns for Amazon metadata fields
- Amazon category attribute matching — XLSM upload with baseline snapshots
- Requirement badges (R/C/P/O) on product fields from Amazon category definitions
- Client onboarding Gantt chart with Asana integration
- Revenue attribution with Redshift data
- Client portal finance views

### In Progress / Known Issues
- `baselineSnapshot` column needs `npm run db:push` to apply
- Content Impact Attribution card hidden (needs refinement)
- Admin Users "Assigned Client" dropdown doesn't handle multi-client codes
- Resend DNS verification pending for 1o8.agency domain
- Recharts type errors in reports code (non-blocking)

---

## API Routes

Full list of API route directories:

```
/api/activity          /api/admin            /api/amazon-live
/api/amazon-sync       /api/aplus            /api/attributes
/api/auth              /api/category-definitions
/api/clients           /api/compare          /api/cron
/api/debug             /api/debug-finance    /api/drive
/api/export            /api/finances         /api/forecasts
/api/gantt             /api/impact           /api/import
/api/intentwise-test   /api/inventory-rec-settings
/api/issue-reports     /api/portal           /api/products
/api/publish           /api/reports          /api/sales-summary
/api/search            /api/seo              /api/sync
/api/team              /api/variations       /api/variety-packs
/api/webhooks
```

---

## Component Structure

```
src/components/
├── activity/          # Activity feed components
├── admin/             # Admin panel components
├── analytics/         # Analytics dashboards
├── aplus/             # A+ Content editor
├── clients/           # Client management
├── export/            # Export/download UI
├── impact/            # Content impact tracking
├── import/            # Data import wizards
├── layout/            # Sidebar, nav, shell
├── portal/            # Client portal components
├── products/          # Product table, detail form, sections
├── providers/         # React context providers
├── publish/           # Publishing UI
├── reports/           # Report generation
├── seo/               # SEO pipeline components
├── tools/             # Internal tools
└── ui/                # shadcn/ui primitives (Button, Card, Dialog, etc.)
```
