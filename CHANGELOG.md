# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3.0] - 2026-03-20

### Added
- **Variation Builder** — Hierarchical product grouping system for managing Amazon product families across SEO, A+, PPC, and ads pipelines
  - 4 new database tables: `variations`, `variation_groups`, `variation_tags`, `variation_tag_assignments`
  - 2 new FK columns on `master`: `variation_ref`, `group_ref` (ON DELETE SET NULL)
  - 8 API endpoints: CRUD for variations/groups/tags, bulk assign, and auto-detect from Amazon variation data
  - List view (`/variations`) with client filtering, search, and create modal
  - Detail builder view (`/variations/[id]`) with collapsible groups, tag management, bulk toolbar, inline editing, and auto-detect from Amazon VariationThemeName
  - Mobile-aware: desktop-only builder with graceful mobile fallback
- **Sidebar navigation** — Variations link added under Catalog section
- **Alert Dialog** — New shadcn/ui component for destructive action confirmations

### Changed
- Variation grouping upgraded from flat `variation_group` varchar to relational hierarchy (exclusive groups + cross-cutting tags)
- SEO Wizard catalog API with variation group support and card-based layout
- Portal finance page synced with hub — Sankey chart and transaction detail views
- Product family component updated with variation group badges and improved layout

### Fixed
- Transaction View support for derived settlement periods
- All Statements table header alignment with data rows
- Fallback for same-date Redshift entries in All Statements tab

## [0.1.2.0] - 2026-03-19

### Added
- **Content Control Center** (SEO Manager upgrade) — 4-tier card layout with content previews, quality score badges, export tracking, version timeline with diff modal, and bulk operations (approve/export/reassign)
  - 5 new components: `ContentPreview`, `DiffModal`, `ExportHistory`, `VersionTimeline`, `BulkActionBar`
  - Enriched projects API with 4-query bulk fetch (projects + content + quality scores + exports)
  - Quality scores API (`/api/seo/quality`) for persisting and retrieving audit scores
  - Bulk operations API (`/api/seo/projects/bulk`) for approve, export, and reassign actions
  - `useOutsideClick` hook for dropdown dismissal
- **SEO Dashboard** — Client health cards, team workload tracking, and pipeline funnel visualization
  - Dashboard API (`/api/seo/dashboard`) with aggregated metrics
  - Section dots component for phase progress visualization
  - Avatar circle component for team member display
- **SEO Client Detail Pages** (`/seo/clients/[clientId]`) with per-client project views
- **Hub Finance Reports** — Internal finance section with client selector, custom date range pickers, and Redshift settlement data
  - Settlement period detection (real ranges + derived biweekly from disbursement dates)
  - Beginning balance, de-duplicated reserves, and correct expense categorization
- **Client Portal Finance Section** — Settlement statement view with period selector and net proceeds calculation
- **Revenue Attribution Pipeline** — Cron handler (`/api/cron/impact`), client scoping, and ImpactCard embed
- **Debug Finance Route** — Redshift data comparison endpoint for settlement reconciliation (admin/editor auth required)
- **Test framework** — Vitest + Testing Library bootstrapped with 15 tests covering all new components
- Calendar UI component (`src/components/ui/calendar.tsx`)

### Changed
- SEO Pipeline page refactored with improved loading resilience and middot rendering
- Portal shell and home page updated with finance navigation
- Middleware updated with new route patterns
- Database schema extended with `seo_quality_scores` and `seo_exports` tables

### Fixed
- Removed hardcoded debug key bypass in finance debug route (security)
- Inactive client names now resolve correctly on SEO Dashboard
- Settlement period derivation handles same-date-only Redshift data

## [0.1.1.0] - 2026-03-19

### Added
- **Client Portal Finance Section** — New settlement statement view with period selector, net proceeds calculation, and detailed transaction breakdown
  - Real-time data from Redshift (sales, expenses, refunds, advertising fees, account reserves)
  - Settlement period selector to view historical statements
  - Net proceeds waterfall showing itemized income and deductions
  - Budget pacing indicator for ad spend tracking
- API endpoint `/api/portal/finance` returning statement data, available periods, and budget metrics
- Finance routes in portal client area (`/portal/finance`)
- Integration with Intentwise IntentwiseID mapping from BigQuery AAC table

### Changed
- Portal shell to include finance navigation link
- Portal home page with finance section reference

