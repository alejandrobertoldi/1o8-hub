# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code, strict mode enabled
- JavaScript - Runtime context only (Node.js/browser execution)

**Secondary:**
- SQL - Direct Redshift queries and PostgreSQL schema migrations
- HTML/CSS - Rendered via React/Next.js (Tailwind CSS 4)

## Runtime

**Environment:**
- Node.js 20+ (inferred from dependencies, no lockfile found)
- Next.js 16.1.6 (App Router, React 19)
- Browser: ES2017 minimum target

**Package Manager:**
- npm (implied from package.json, no lockfile present)
- Installation: `npm install`

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework (App Router, server components, API routes)
- React 19.2.3 - UI library
- React DOM 19.2.3 - DOM rendering

**Authentication:**
- NextAuth.js v5 (beta) 5.0.0-beta.30 - OAuth with Google provider, JWT tokens, role-based access

**Styling & UI:**
- Tailwind CSS 4 - Utility-first CSS framework
- shadcn/ui (via Radix) - Headless component library (cmdk, popover, dialog, etc.)
- Radix UI 1.4.3 - Primitive components
- Lucide React 0.575.0 - Icon library
- Geist 1.7.0 - Font/design tokens

**Tables & Data Display:**
- TanStack React Table 8.21.3 - Headless table library with sorting/filtering
- TanStack React Query 5.90.21 - Server state management, caching, synchronization

**Forms & Validation:**
- React Hook Form 7.71.2 - Form state management (uncontrolled, performant)
- @hookform/resolvers 5.2.2 - Form validation integration
- Zod 4.3.6 - TypeScript-first schema validation

**Data Visualization:**
- Recharts 3.8.0 - React charting library (sparklines, charts)

**File Processing:**
- XLSX 0.18.5 - Excel file read/write
- jsPDF 4.2.0 - PDF generation
- jspdf-autotable 5.0.7 - PDF table layouts
- DOCX 9.6.0 - Word document generation
- Mammoth 1.11.0 - DOCX parser (Word to HTML conversion)
- PDF.js 5.5.207 - PDF viewing/rendering
- CSV-Parse 6.1.0 - CSV parsing

**UI Utilities:**
- Clsx 2.1.1 - Conditional CSS class composition
- Tailwind Merge 3.5.0 - Merge Tailwind class conflicts
- Date FNS 4.1.0 - Date manipulation and formatting
- Sonner 2.0.7 - Toast notifications
- React Day Picker 9.14.0 - Date picker component

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Headless drag-drop library
- @dnd-kit/sortable 10.0.0 - Sortable preset for dnd-kit

**Themes:**
- next-themes 0.4.6 - Dark mode and theme management

**Utilities:**
- class-variance-authority 0.7.1 - Component variant system (CVA)
- p-limit 7.3.0 - Concurrency control for promises
- Diff 8.0.3 - Text diffing (for change tracking)

**Fonts:**
- @fontsource/syne 5.2.7 - Syne font for brand typography

**Testing:**
- Vitest 4.1.0 - Unit test runner (Vite-based, Jest-compatible)
- @testing-library/react 16.3.2 - React component testing utilities
- @testing-library/jest-dom 6.9.1 - DOM matchers for testing
- jsdom 29.0.0 - Browser environment simulation
- @vitejs/plugin-react 6.0.1 - Vite React support

**Build & Dev:**
- ESLint 9 - Linting (Next.js core-web-vitals + TypeScript config)
- typescript 5.9.3 - TypeScript compiler
- tsx 4.21.0 - TypeScript execution for scripts

## Database

**Primary:**
- PostgreSQL (via Supabase) - Main application database
- Driver: `postgres` 3.4.8 (connection pooling, HMR-safe)
- ORM: Drizzle ORM 0.45.1 - Type-safe SQL with migrations
- Schema: `src/lib/db/schema.ts`
- Migrations: `drizzle/migrations/` (24 versions as of 2026-03-21)
- Tool: drizzle-kit 0.31.9 - Schema generation and migrations

**Read-Only Analytics:**
- Amazon Redshift (Intentwise) - Sales/analytics data
  - Driver: `pg` 8.20.0 (separate pool due to Redshift compatibility)
  - Host: `analytics.intentwise.com:5439`
  - Database: `data_platform`
  - Schema: `intentwise_ecommerce_graph`

**Cloud Data Warehouse:**
- Google BigQuery - Product data archive and publishing
  - Project: `amazon-data-461918`
  - Dataset: `1o8Hub`
  - Table: `Master` (all columns as STRING type, WRITE_TRUNCATE mode)

## External APIs & Services

**Google Cloud:**
- @google-cloud/bigquery 8.1.1 - BigQuery client
- Service account auth: JWT-based (no googleapis SDK dependency)
- GCP auth helper: `src/lib/gcp-auth.ts` (token caching, PEM parsing)

**Google Drive:**
- REST API v3 (via manual fetch, no SDK)
- Client: `src/lib/drive-client.ts`
- Scope: `https://www.googleapis.com/auth/drive`
- Supports: Shared drives, folder management, file upload
- Upload handler: `src/lib/drive-upload.ts`

**Amazon SP-API:**
- Listing management, product catalog data
- Client: `src/lib/sp-api/client.ts`
- Auth: LWA (LoginWithAmazon) refresh token flow
- Region-aware: NA, EU, FE endpoints
- Token caching (60s reuse, 60min expiry)
- Includes: Catalog items, listings, variations

**AI (Anthropic):**
- @anthropic-ai/sdk 0.78.0 - Claude API client
- Models: claude-haiku-4-5-20251001 (default, configurable per feature)
- Features: A+ alt-text, A+ video titles, SEO analysis, keyword extraction, Q&A generation
- Config: `src/lib/ai-config.ts` (client-safe defaults) + `src/lib/ai-config.server.ts` (DB overrides)
- Token limits: 150 tokens (A+) to 8192 tokens (SEO)

**Product Data Scraping:**
- Rainforest API - Legacy product data API
  - Types: `src/types/rainforest.ts`
  - Usage: Price, ratings, availability comparison
- Firecrawl - Alternative scraper with structured extraction
  - Client: `src/lib/firecrawl.ts`
  - Maps to RainforestProduct shape for compatibility
  - Schema: Extracts title, price, rating, images, features, availability

**Email:**
- Resend - Transactional email service
  - API: POST to `https://api.resend.com/emails`
  - Default sender: `1o8 Hub <noreply@1o8.agency>` (configurable)
  - Client: `src/lib/email.ts` (with graceful fallback if unconfigured)

## Configuration

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (Supabase)
- `NEXTAUTH_URL` - OAuth callback URL (production: `https://1o8hub.vercel.app`)
- `NEXTAUTH_SECRET` - JWT signing key (generated via openssl)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `GCP_PROJECT_ID`, `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY` - BigQuery auth (key via Vercel CLI, not dashboard)
- `BQ_DATASET`, `BQ_TABLE` - BigQuery target (defaults: `1o8Hub`, `Master`)
- `GOOGLE_SHARED_DRIVE_ID`, `GOOGLE_DRIVE_FOLDER_ID` - Google Drive targets
- `ANTHROPIC_API_KEY` - Claude API key
- `RAINFOREST_API_KEY`, `FIRECRAWL_API_KEY` - Product scraping
- `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET` - Amazon SP-API LWA credentials
- `REDSHIFT_HOST`, `REDSHIFT_PORT`, `REDSHIFT_DATABASE`, `REDSHIFT_USER`, `REDSHIFT_PASSWORD` - Analytics
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` - Transactional email
- `CRON_SECRET` - Vercel cron authentication
- `NEXT_PUBLIC_*` - Client-visible variables (deploy slug, commit SHA, build time)
- `.env.example` - Full reference in repo root

**Build Configuration:**
- `next.config.ts` - Server external packages (Anthropic SDK, BigQuery, Mammoth, Docx, GCP metadata)
- `tsconfig.json` - Path alias `@/*` → `./src/*`, strict mode, incremental builds
- `vitest.config.ts` - Test environment (jsdom), file patterns, setup files
- `eslint.config.mjs` - Next.js core web vitals + TypeScript rules

## Platform Requirements

**Development:**
- Node.js 20+ (inferred)
- npm 10+ (inferred)
- PostgreSQL 12+ (Supabase compatible)
- Environment: macOS, Linux, or Windows (Node.js universal)

**Production:**
- Vercel (auto-deploy from `main` branch)
- PostgreSQL 12+ (Supabase)
- Google Cloud credentials (BigQuery, Drive, GCP auth)
- Amazon SP-API (per-client refresh tokens stored in DB)
- Anthropic API key
- Redshift credentials (optional, read-only)
- Resend API key (optional, email falls back silently)

---

*Stack analysis: 2026-03-21*
