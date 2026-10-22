# 1o8Hub — Complete Application Structure

## Overview

**1o8Hub** is an internal agency platform for managing Amazon product listings, built for 1o8 Agency. It handles SEO pipeline, A+ content, product catalog, PPC forecasting, client portal, finance/revenue attribution, and more.

- **Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix)
- **Database:** PostgreSQL (Supabase) via Drizzle ORM
- **Auth:** NextAuth v5 (beta) with Google OAuth
- **Deployment:** Vercel (auto-deploy from `main`)
- **Production URL:** https://1o8hub.vercel.app

---

## Roles & Access

Five user roles: `admin`, `editor`, `viewer`, `client`, `pending`, plus `prospect`.

- **Admin/Editor/Viewer:** Full hub access based on `allowedSections` per user
- **Client:** Confined to `/portal/*` — sees their own products, reports, A+ content, finance
- **Pending:** Redirected to `/auth/register` until approved

Middleware (`src/middleware.ts`) enforces auth on all routes.

---

## Key Domains

### 1. Products (`/products`, `/api/products`)
- CRUD with inline editing, column registry with 972 attributes
- Hybrid schema: ~30 indexed core columns + categorized JSONB blobs for ~940 remaining columns + `raw_column_values` JSONB for zero-data-loss
- Products table is named `master` in the DB (not `products`)
- BigQuery sync: Import from and publish to `amazon-data-461918.1o8Hub.Master`

### 2. Variations (`/variations`, `/api/variations`)
- Hierarchical product grouping: exclusive groups (FK) + cross-cutting tags (junction table)
- Auto-detect variation themes from Amazon VariationThemeName
- Builder UI with bulk assign, drag-and-drop

### 3. A+ Content (`/aplus`, `/api/aplus`)
- Module editor: up to 7 modules per product
- 19 module types (background_image_text, comparison_table, dual_images, etc.)
- Image slots with Google Drive upload
- Markup.io-style inline comments with status tracking
- Module statuses: draft → in_review → approved → uploaded → live

### 4. SEO Pipeline (`/seo`, `/api/seo`)
- 6-phase pipeline (S1–S6): Intake → Keywords → Reviews → Rufus Q&A → COSMO Maps → Content Generation
- Content Control Center (`/seo/manager`)
- SEO Dashboard with per-client detail views (`/seo/clients/[clientId]`)
- Quality scoring with compliance reports
- Export to DOCX

### 5. PPC / Advertising (`/ppc`, `/api/ppc`)
- PPC snapshots, approvals, decisions, alerts
- Competitor analysis
- Forecast tool with versions, cell-level data, ASIN-level breakdowns
- Sales monitor with daily metrics
- Redshift integration for historical ad data

### 6. Finance (`/finances`, `/api/finances`, `/portal/finance`)
- Hub finance reports using Redshift settlement data
- Sankey flow visualization
- Client portal finance views with reports

### 7. Sales Summary (`/sales-summary`, `/api/sales-summary`)
- Daily, monthly, and inventory views
- Sales summary cache in PostgreSQL (6h cron refresh)
- Forecast V1 and V2 tools
- Subscribe & Save (SNS) tracking

### 8. Amazon Sync (`/amazon-sync`, `/api/amazon-sync`)
- SP-API + Rainforest comparisons
- Discrepancy tracking with snapshot history
- Automated sync runs via cron

### 9. Client Portal (`/portal`)
- Client-facing views: A+ approval, reports, sales, finance statements
- Design review (brand story, listing images, storefront)
- Tools (revenue calculator)
- SEO progress view
- Timeline/activity feed

### 10. Admin (`/admin`, `/api/admin`)
- User management with role assignment
- Event/audit log
- AI config (Anthropic Claude settings)
- Asana integration config
- SP-API credential management
- Observability dashboard

### 11. Publishing (`/publish`, `/api/publish`)
- Dirty-row tracking for changes since last publish
- BigQuery write-back (WRITE_TRUNCATE — full table replace)
- Publish history

### 12. Reports & Export (`/reports`, `/export`)
- PDF generation (jsPDF)
- XLSX generation
- DOCX generation (docx library)
- Client reports with overview

### 13. Design Status (`/design`)
- Brand story, listing images, storefront tracking
- Per-category design status (brand_story, listing_images, storefront)
- Status values: not_started, in_progress, in_review, approved, live

### 14. Client Onboarding (`/onboarding`, `/clients/[id]/onboarding`)
- Gantt chart with templates (AIA/NTA client types)
- Asana project creation
- Google Drive folder creation
- Step-by-step onboarding checklist

### 15. Content Impact (`/impact`)
- Before/after content change snapshots
- Impact measurement tracking

---

## Database Schema (40+ tables)

### Core Tables
| Table                | Purpose                                                 |
|----------------------|---------------------------------------------------------|
| `users`              | User accounts with roles, allowed sections, client codes |
| `master`             | Products — core columns + JSONB blobs (972 attributes)  |
| `column_attributes`  | Column registry — metadata for each product attribute   |
| `aac`                | AAC (Amazon Advertising Console) client data            |

### SEO Tables
| Table                    | Purpose                                       |
|--------------------------|-----------------------------------------------|
| `seo_projects`           | SEO project per product with 6-phase pipeline |
| `seo_asins`              | ASINs linked to SEO projects                  |
| `seo_keywords`           | Keyword research data                         |
| `seo_reviews`            | Review analysis data                          |
| `seo_rufus`              | Rufus Q&A data                                |
| `seo_cosmo_maps`         | COSMO map data                                |
| `seo_compliance_reports` | Compliance check results                      |
| `seo_exports`            | Export history                                |
| `seo_quality_scores`     | Quality scoring                               |
| `seo_settings`           | Per-project SEO config                        |

### A+ Content Tables
| Table                 | Purpose                      |
|-----------------------|------------------------------|
| `aplus_sets`          | A+ content sets per product  |
| `aplus_modules`       | Individual content modules   |
| `aplus_module_images` | Image slots per module       |
| `aplus_comments`      | Inline review comments       |
| `brand_story`         | Brand story content          |

### Amazon Integration
| Table                       | Purpose                        |
|-----------------------------|--------------------------------|
| `amazon_snapshots`          | Product data snapshots         |
| `sp_api_credentials`        | Per-client SP-API credentials  |
| `amazon_sync_snapshots`     | Sync snapshot data             |
| `amazon_sync_runs`          | Sync execution history         |
| `amazon_sync_discrepancies` | Detected discrepancies         |

### PPC & Forecasting
| Table                      | Purpose                        |
|----------------------------|--------------------------------|
| `ppc_snapshots`            | PPC performance snapshots      |
| `ppc_approvals`            | Budget/bid change approvals    |
| `ppc_decisions`            | Strategic PPC decisions        |
| `ppc_alerts`               | PPC alerts and notifications   |
| `forecast_tool_versions`   | Forecast tool saved versions   |
| `forecast_tool_cells`      | Cell-level forecast data       |
| `forecast_tool_asins`      | ASIN breakdown in forecasts    |
| `forecast_tool_asin_cells` | Per-ASIN cell data             |

### Finance & Sales
| Table                    | Purpose                           |
|--------------------------|-----------------------------------|
| `sales_summary_cache`    | Cached sales data (6h refresh)    |
| `client_forecasts`       | Client-level forecast settings    |
| `inventory_rec_settings` | Inventory recommendation config   |

### Other
| Table                           | Purpose                              |
|---------------------------------|--------------------------------------|
| `publish_history`               | BigQuery publish history             |
| `activity_log`                  | User activity tracking               |
| `field_comments`                | Field-level comments on products     |
| `category_definitions`          | Amazon category definitions          |
| `category_attributes`           | Category-specific attributes         |
| `drive_folders`                 | Google Drive folder mapping          |
| `drive_files`                   | Google Drive file tracking           |
| `design_status`                 | Design status per product category   |
| `content_impact_snapshots`      | Before/after content impact          |
| `gantt_templates`               | Onboarding Gantt templates           |
| `client_gantt_tasks`            | Client onboarding task tracking      |
| `client_onboarding_steps`       | Onboarding step checklist            |
| `variations`                    | Product variations                   |
| `variation_groups`              | Exclusive variation groups           |
| `variation_tags`                | Cross-cutting variation tags         |
| `variation_tag_assignments`     | Tag ↔ product junction             |
| `variation_group_assignments`   | Group ↔ product junction           |
| `variety_pack_items`            | Variety pack composition             |
| `issue_reports`                 | Bug/issue tracking                   |
| `admin_event_log`               | Admin audit trail                    |
| `support_tickets`               | Support ticket system                |

---

## External Services

| Service                  | Purpose                      | Integration                                            |
|--------------------------|------------------------------|--------------------------------------------------------|
| **Google BigQuery**      | Product data warehouse       | Import/export via `@google-cloud/bigquery`             |
| **Google Drive**         | File storage for A+ images   | `src/lib/drive-client.ts`, `src/lib/drive-upload.ts`   |
| **Anthropic Claude**     | AI alt-text, video titles    | `@anthropic-ai/sdk`, config in `src/lib/ai-config*.ts` |
| **Rainforest API**       | Amazon product scraping      | `src/lib/rainforest-field-map.ts`                      |
| **Firecrawl**            | Web scraping                 | `src/lib/firecrawl.ts`                                 |
| **Amazon SP-API**        | Official Amazon data         | `src/lib/sp-api/client.ts`                             |
| **Redshift (Intentwise)** | Ad analytics, settlement data | `src/lib/redshift.ts`                                  |
| **Resend**               | Transactional email          | `src/lib/email.ts`                                     |
| **Asana**                | Project management sync      | `src/lib/asana-sync.ts`                                |
| **Supabase**             | PostgreSQL hosting           | Drizzle ORM connection                                 |

---

## API Routes (196 total)

Major API route groups:
- `/api/products` — Product CRUD, bulk ops, completeness, variation groups
- `/api/aplus` — A+ content, AI generation, bulk compare, import
- `/api/seo` — SEO pipeline, clients, config, dashboard, quality
- `/api/ppc` — PPC snapshots, alerts, analysis, approvals, forecast tool
- `/api/sales-summary` — Daily, monthly, inventory, SNS
- `/api/finances` — Finance overview
- `/api/amazon-sync` — Compare, fetch, run, snapshots, discrepancies
- `/api/portal` — Client portal endpoints (activity, products, SEO, finance)
- `/api/admin` — Users, logs, AI config, SP-API, sync
- `/api/clients` — Client data, AAC
- `/api/variations` — Variation CRUD
- `/api/publish` — Publishing, history
- `/api/export` — BQ export, preview
- `/api/import` — BigQuery import, parse
- `/api/drive` — File upload, ping
- `/api/reports` — Client reports, keywords, overview
- `/api/cron` — Scheduled jobs (amazon-sync, sales refresh, BQ sync, PPC snapshot)

---

## Pages (84 total)

Major page groups:
- Product management: product list, detail, inline editing
- Variation builder: group management, tag assignment
- A+ content editor: module builder, image management, compare
- SEO pipeline: 6 phase editors, manager, dashboard, client views
- PPC dashboard: client view, forecast tool
- Sales: summary, forecast V1/V2, inventory, monitor
- Finance: hub reports, Sankey flow
- Client portal: A+, design, products, reports, sales, SEO, finance, timeline
- Admin: users, logs, AI, Asana, SP-API, observability
- Onboarding: Gantt chart, timeline
- Tools: revenue calculator

---

## Component Library

| Directory                     | Purpose                                            |
|-------------------------------|----------------------------------------------------|
| `src/components/ui/`          | shadcn/ui primitives (button, card, dialog, etc.)  |
| `src/components/layout/`      | App layout, sidebar, navigation                    |
| `src/components/products/`    | Product table, editors, filters                    |
| `src/components/aplus/`       | A+ module editor, image slots, bodies              |
| `src/components/seo/`         | SEO pipeline components, manager                   |
| `src/components/ppc/`         | PPC dashboard, forecast tool grid                  |
| `src/components/analytics/`   | Charts, forecast editor                            |
| `src/components/clients/`     | Client views, detail pages                         |
| `src/components/portal/`      | Client portal components                           |
| `src/components/admin/`       | Admin panels                                       |
| `src/components/activity/`    | Activity feeds                                     |
| `src/components/export/`      | Export dialogs                                     |
| `src/components/import/`      | Import wizards                                     |
| `src/components/impact/`      | Content impact views                               |
| `src/components/publish/`     | Publish management                                 |
| `src/components/reports/`     | Report generators                                  |
| `src/components/tools/`       | Utility tools                                      |
| `src/components/providers/`   | React context providers                            |

---

## Key Libraries

| Library                      | Purpose                                    |
|------------------------------|--------------------------------------------|
| `src/lib/db/schema.ts`       | Full DB schema (2004 lines, 40+ tables)    |
| `src/lib/db/index.ts`        | DB connection with HMR-safe pooling        |
| `src/lib/auth.ts`            | NextAuth config                            |
| `src/lib/bigquery.ts`        | BigQuery read/write                        |
| `src/lib/redshift.ts`        | Redshift (Intentwise) queries              |
| `src/lib/column-registry.ts` | 972-attribute column registry              |
| `src/lib/ppc-queries.ts`     | PPC data queries                           |
| `src/lib/sales-cache.ts`     | Sales summary caching                      |
| `src/lib/sp-api/client.ts`   | Amazon SP-API client                       |
| `src/lib/drive-client.ts`    | Google Drive API                           |
| `src/lib/drive-upload.ts`    | Drive file upload                          |
| `src/lib/email.ts`           | Resend email                               |
| `src/lib/event-logger.ts`    | Activity event logging                     |
| `src/lib/permissions.ts`     | Role-based permissions                     |
| `src/lib/rate-limit.ts`      | API rate limiting                          |
| `src/lib/formatters.ts`      | Data formatting utilities                  |
| `src/lib/utils.ts`           | General utilities                          |

---

## Cron Jobs

| Job                      | Schedule | Purpose                        |
|--------------------------|----------|--------------------------------|
| Amazon Sync              | Periodic | Sync product data from SP-API  |
| Amazon Sync (Rainforest) | Periodic | Scrape Amazon via Rainforest   |
| Sales Refresh            | Every 6h | Refresh sales summary cache    |
| BQ Sync                  | Periodic | Sync BigQuery data             |
| PPC Snapshot             | Periodic | Capture PPC metrics            |
| Impact Capture           | Periodic | Content impact tracking        |
| Snapshot Cleanup         | Periodic | Clean old snapshots            |
| Table Sync               | Periodic | Sync DB tables                 |

---

## Design System

- **Brand colors:** `#E8A700` (dark), `#F8BF1C` (light)
- **Aesthetic:** Industrial/Utilitarian — data-dense, function-first
- **Typography:** Geist Sans (display & body), Geist Mono (code)
- **Surfaces:** Warm linen (#F7F5F1 light), near-black slate (#05070B dark)
- **Components:** shadcn/ui with custom styling via Tailwind CSS 4
- **Patterns:** Restrained color use, gold accent, warm stone neutrals

---

## Environment & Config

- All env vars documented in `.env.example`
- GCP private key set via Vercel CLI (multiline handling)
- Path alias: `@/*` → `./src/*`
- Migrations: `drizzle/migrations/`
- Test framework: Vitest + Testing Library
