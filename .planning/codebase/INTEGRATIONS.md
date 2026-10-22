# External Integrations

**Analysis Date:** 2026-03-21

## APIs & External Services

**Authentication:**
- Google OAuth 2.0 - User sign-in, email-based identity
  - Provider: `next-auth/providers/google`
  - Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (from console.cloud.google.com)
  - Callback: `NEXTAUTH_URL` (production: https://1o8hub.vercel.app)
  - Scope: Basic profile (email, name, picture)

**Product Data (Amazon):**
- Amazon SP-API (Selling Partner API) - Catalog, listings, product data
  - Auth: LoginWithAmazon (LWA) refresh token flow
  - Client: `src/lib/sp-api/client.ts`
  - Credentials stored per-client: `sp_api_credentials` table
  - Config: `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET` (shared across all clients)
  - Regional endpoints: NA, EU, FE
  - Operations: Catalog items, listing data, variations

- Rainforest API - Product pricing, ratings, availability, buybox
  - Scraping: Amazon product pages (alternative to SP-API)
  - Config: `RAINFOREST_API_KEY`
  - Type: `src/types/rainforest.ts`

- Firecrawl - Web scraper with structured extraction
  - Purpose: Alternative to Rainforest API, extracts Amazon product data
  - API: https://api.firecrawl.dev/v1/scrape
  - Config: `FIRECRAWL_API_KEY`
  - Client: `src/lib/firecrawl.ts`
  - Output: Maps to RainforestProduct shape for compatibility

**AI & Content Generation:**
- Anthropic Claude API - Alt-text generation, video titles, SEO analysis
  - SDK: `@anthropic-ai/sdk` v0.78.0
  - Config: `ANTHROPIC_API_KEY`
  - Default model: `claude-haiku-4-5-20251001` (configurable per feature)
  - Client config: `src/lib/ai-config.ts` (defaults) + `src/lib/ai-config.server.ts` (DB overrides)
  - Features:
    - A+ Alt Text: max 150 tokens
    - A+ Video Titles: max 150 tokens
    - SEO Keywords: max 8192 tokens
    - SEO Reviews: max 8192 tokens
    - SEO COSMO Maps: configurable
    - SEO Rufus Q&A: configurable
    - SEO Content: max 4096 tokens
    - SEO Audit: configurable
    - SEO Extract Doc: configurable
  - Overrides stored in `seoSettings` table (key: `ai_config`)

## Data Storage

**Databases:**

*PostgreSQL (Supabase)*
- Primary application database
- Connection: `DATABASE_URL` (Supabase PostgreSQL connection string)
- Client: `postgres` driver (v3.4.8) with connection pooling
  - Pool size: 10 connections max
  - Idle timeout: 20s
  - Connect timeout: 30s
  - SSL: Required
  - Prepare statements: Disabled (HMR safety)
- ORM: Drizzle ORM v0.45.1
- Schema: `src/lib/db/schema.ts`
  - Tables: users, master (products), variations, aplus_modules, aplus_sets, aplus_comments, amazon_sync_*, seo_projects, seo_settings, panel_data, variation_groups, variation_group_assignments, etc.
  - Enums: user_role (admin, editor, viewer, client, pending), aplus_module_type, aplus_module_status

*Amazon Redshift (Intentwise)*
- Analytics and sales data (read-only)
- Host: analytics.intentwise.com:5439
- Database: data_platform
- User/password: `REDSHIFT_USER`, `REDSHIFT_PASSWORD`
- Schema: `intentwise_ecommerce_graph`
- Driver: `pg` v8.20.0 (separate pool due to Redshift compatibility)
  - Pool size: 10 connections max
  - Idle timeout: 30s
  - SSL: Enabled (rejectUnauthorized: false)
- Client: `src/lib/redshift.ts` (raw SQL queries only)
- Use cases: Sales summary, settlement data, inventory reports

*Google BigQuery*
- Data warehouse: Product catalog archive
- Project: `amazon-data-461918`
- Dataset: `1o8Hub`
- Table: `Master` (all columns STRING type)
- Auth: Service account credentials (GCP)
  - Config: `GCP_PROJECT_ID`, `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY`
  - Private key: Set via Vercel CLI (`npx vercel env add GCP_PRIVATE_KEY production < key.pem`)
- Client: `@google-cloud/bigquery` v8.1.1
- Operations:
  - Read: Import product data via `npm run import-bq`
  - Write: Publish via WRITE_TRUNCATE (full table replace)
  - Path: `src/lib/bigquery.ts`
  - Staging table: `Master_Staging`

**File Storage:**
- Google Drive - User-uploaded assets (A+ images, documents, spreadsheets)
  - Shared drive ID: `GOOGLE_SHARED_DRIVE_ID`
  - Root folder: `GOOGLE_DRIVE_FOLDER_ID`
  - API: Google Drive REST v3 (manual fetch, no googleapis SDK)
  - Auth: GCP service account JWT
  - Endpoints:
    - Create/list/delete files and folders
    - Upload files (resumable protocol supported)
  - Client: `src/lib/drive-client.ts`
  - Upload handler: `src/lib/drive-upload.ts`

**Caching:**
- None (application-level caching only via React Query)
- Memory cache for AI config: `src/lib/ai-config.server.ts` (60s TTL)
- Token caching: GCP auth `src/lib/gcp-auth.ts` (50min TTL), SP-API `src/lib/sp-api/client.ts` (60min TTL)

## Authentication & Identity

**Auth Provider:**
- NextAuth.js v5 (beta) with Google OAuth 2.0

**Implementation:**
- Middleware: `src/middleware.ts` - Enforces auth on all routes
- Handler: `src/lib/auth.ts`
  - OAuth provider: Google
  - JWT callbacks: Email, name, picture stored in token
  - Session enrichment: Role, sections, clientIdCode resolved from DB at sign-in
  - Roles: admin, editor, viewer, client, pending (5-tier access model)
  - Client users: Confined to `/portal/*`
  - Pending users: Redirect to `/auth/register` for onboarding

**Database Schema:**
- `users` table: id (UUID), email, name, image, role, allowedSections (JSONB), clientIdCode, lastLoginAt, createdAt
- Index: `idx_users_client_id_code` on clientIdCode (for client-role lookups)

## Monitoring & Observability

**Error Tracking:**
- Not detected (application logs errors to console)

**Logs:**
- Console output
  - Development: Standard Node.js stderr/stdout
  - Production: Vercel log system (captured from stdout)
  - Format: `[context] message` (e.g., `[Redshift] Query failed:`)
- Activity logging: `src/lib/event-logger.ts` (writes to PostgreSQL `activity` table)

**Tracing:**
- Not detected

## CI/CD & Deployment

**Hosting:**
- Vercel (serverless deployment)
- Production URL: `https://1o8hub.vercel.app/`
- Automatic deployment: `main` branch commits
- Cron jobs: Vercel Cron via `/api/cron/*` routes
  - Authentication: `CRON_SECRET` (OpenSSL-generated 32-char key)

**CI Pipeline:**
- None detected (no GitHub Actions, Jenkins, or GitLab CI config)
- Type checking: `npm run build` (Next.js build includes TS check)
- Linting: `npm run lint` (ESLint)

**Environment Management:**
- `.env.example` - Template for all required variables
- Vercel Secrets: Credentials stored via `vercel env` CLI (not dashboard for multiline values like GCP_PRIVATE_KEY)
- Development: `.env.local` (not committed, loaded via dotenv in drizzle.config.ts)

## Webhooks & Callbacks

**Incoming:**
- NextAuth OAuth callback: `[NEXTAUTH_URL]/api/auth/callback/google`
- Amazon sync: None detected (polling via cron jobs instead)
- Drive upload: None (client-initiated uploads via resumable protocol)

**Outgoing:**
- Resend email webhooks: Optional (not configured by default)
- BigQuery publish: One-way writes (WRITE_TRUNCATE mode)

**Cron Jobs:**
- Endpoint pattern: `/api/cron/*` routes
- Authentication: `CRON_SECRET` env var
- Examples: Daily sales cache refresh, inventory sync, activity backfill
- Frequency: Configured via Vercel cron schedule
- Entry point: `src/app/api/cron/*` directories

## Data Synchronization

**BigQuery ↔ PostgreSQL:**
- Direction: Bidirectional
  - Read: `npm run import-bq` (script: `scripts/import-from-bigquery.ts`) — imports Master table
  - Write: `npm run publish` via `/api/publish/*` routes — WRITE_TRUNCATE Master table
- Mapping: `src/lib/product-mapper.ts` (BQ row ↔ PostgreSQL master row)
- Dirty tracking: `master.isDirty` column (marks rows for publishing)

**SP-API ↔ PostgreSQL:**
- Direction: Inbound polling
  - Credentials: Per-client refresh tokens in `sp_api_credentials` table
  - Comparator: `src/lib/sp-api/comparator.ts` (detects discrepancies)
  - Sync endpoint: `/api/amazon-sync/*` routes
  - Normalization: `src/lib/sp-api/normalizer.ts`

**Activity Logging:**
- All mutations logged to `activity` table (event-logger: `src/lib/event-logger.ts`)
- Captured: User, timestamp, action, resource type, old/new values

## Required Environment Variables (Critical)

**Authentication:**
- `NEXTAUTH_URL` - OAuth callback URL (e.g., https://1o8hub.vercel.app)
- `NEXTAUTH_SECRET` - JWT signing secret (32 chars, `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth credentials

**Database:**
- `DATABASE_URL` - PostgreSQL connection (Supabase)

**BigQuery:**
- `GCP_PROJECT_ID` - Google Cloud project
- `GCP_CLIENT_EMAIL` - Service account email
- `GCP_PRIVATE_KEY` - Service account private key (PEM format, set via `vercel env add`)

**Amazon:**
- `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET` - LWA credentials (shared across clients)
- Per-client `refreshToken` stored in `sp_api_credentials` table

**Google Drive:**
- `GOOGLE_SHARED_DRIVE_ID` - Shared drive ID
- `GOOGLE_DRIVE_FOLDER_ID` - Root folder ID

**AI:**
- `ANTHROPIC_API_KEY` - Claude API key

**Analytics:**
- `REDSHIFT_HOST`, `REDSHIFT_DATABASE`, `REDSHIFT_USER`, `REDSHIFT_PASSWORD` - Intentwise credentials

**Email:**
- `RESEND_API_KEY` - Transend API key (optional, email silently fails if missing)

**Cron:**
- `CRON_SECRET` - 32-char secret for Vercel cron job authentication

---

*Integration audit: 2026-03-21*
