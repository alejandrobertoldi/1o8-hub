# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
PORT=3000 npm run dev

# Build & lint
npm run build
npm run lint

# Database (Drizzle + PostgreSQL via Supabase)
npm run db:generate    # Generate migration from schema changes
npm run db:migrate     # Run pending migrations
npm run db:push        # Push schema directly (dev only)
npm run db:studio      # Open Drizzle Studio GUI

# Data scripts
npm run create-admin       # Create admin user
npm run import-bq          # Import products from BigQuery
npm run import-aac         # Import AAC client data
npm run generate-columns   # Regenerate column registry from DB
npm run seed-team          # Seed team members
npm run backfill-activity  # Backfill activity log entries

# Testing (Vitest + Testing Library)
npm run test               # Run all tests
npm run test:watch         # Watch mode
```

## Architecture

**Next.js 16 App Router** with React 19, Tailwind CSS 4, and shadcn/ui (Radix). Path alias: `@/*` → `./src/*`.

### Auth & Roles

NextAuth v5 (beta) with Google OAuth. Proxy (`src/proxy.ts`, renamed from `middleware.ts` per Next.js 16 convention) enforces auth on all routes. Five roles: `admin`, `editor`, `viewer`, `client`, `pending`. Client-role users are confined to `/portal/*`; pending users redirect to `/auth/register`.

### Data Layer

- **ORM**: Drizzle ORM with `postgres` driver. Connection pooling cached on `globalThis` for HMR safety.
- **DB**: PostgreSQL (Supabase), schema at `src/lib/db/schema.ts`, migrations in `drizzle/migrations/`.
- **BigQuery**: Read (import) and write (publish) via `@google-cloud/bigquery`. Publish uses `WRITE_TRUNCATE` (full table replace) to `mfhub-501815.MFHub.Master`.
- **Products table**: Hybrid schema — ~30 indexed core columns + categorized JSONB blobs for ~940 remaining columns + `raw_column_values` JSONB for zero-data-loss.

### Key Domains

| Domain | Routes | Description |
|--------|--------|-------------|
| Products | `/products`, `/api/products` | CRUD, inline editing, column registry with 972 attributes |
| Variations | `/variations`, `/api/variations` | Hierarchical product grouping: exclusive groups (FK) + cross-cutting tags (junction). Auto-detect from Amazon VariationThemeName. Builder UI with bulk assign. |
| A+ Content | `/design/aplus2`, `/api/aplus2` | Module editor (up to 7 modules/product), image slots, Google Drive upload, Markup.io-style comments |
| SEO Pipeline | `/seo`, `/api/seo` | 6-phase pipeline (S1-S6): intake → keywords → reviews → Rufus Q&A → COSMO maps → content generation. Includes Content Control Center (`/seo/manager`), SEO Dashboard, and per-client detail views (`/seo/clients/[clientId]`) |
| Finance | `/finances`, `/portal/finance`, `/api/portal/finance` | Hub finance reports (Redshift settlement data, Sankey flow) and client portal finance views |
| Amazon Sync | `/amazon-sync`, `/api/amazon-sync` | SP-API + Rainforest comparisons, discrepancy tracking |
| Reviews | `/reviews`, `/portal/reviews`, `/api/reviews`, `/api/portal/reviews` | Product-level Amazon review store (`product_reviews`, `review_asin_status`, `review_topic_snapshots`, `review_rating_history`, `review_sync_runs`). Review text via Rainforest `type=reviews` (PDP `top_reviews` fallback); Customer Feedback topics + rating history via the shared Helium 10 MCP connection (`src/lib/reviews/`). Weekly snapshot cron `/api/cron/reviews-sync` (every 5 min on Saturdays UTC, batches of `REVIEWS_SYNC_BATCH` until every active ASIN is fresh) (env `REVIEWS_SYNC_BATCH`, `REVIEWS_SYNC_STALE_DAYS`, `REVIEWS_SYNC_ENABLED`). SEO S3 imports from this store via `/api/seo/projects/[id]/reviews/import`. Permission id `reviews` (Catalog subsection; portal card). |
| Portal | `/portal` | Client-facing views: A+ approval, reports, sales, finance statements |
| Admin | `/admin`, `/api/admin` | User management, event log, AI config |
| Publishing | `/publish`, `/api/publish` | Dirty-row tracking, BigQuery write-back |
| Reports/Export | `/reports`, `/export` | PDF/XLSX/DOCX generation, client reports |

### External Services

- **Google Drive**: File upload/folder management via `src/lib/drive-client.ts` and `src/lib/drive-upload.ts`
- **Anthropic AI**: Claude API for alt-text generation, video titles. Config split: `src/lib/ai-config.ts` (client-safe constants) and `src/lib/ai-config.server.ts` (server-side with DB lookups)
- **Rainforest API / Firecrawl**: Amazon product data scraping. Rainforest also feeds the Reviews store (`src/lib/reviews/rainforest.ts`)
- **Helium 10 MCP**: MCP client (`src/lib/helium10/`) used for S2 reverse-ASIN keywords and for review topic analysis + rating history (`src/lib/reviews/helium10.ts`). All callers go through `withHelium10` (`src/lib/helium10/session.ts`): the `HELIUM10_API_KEY` Bearer token when set, else the shared OAuth connection owned by `HELIUM10_CONNECTION_OWNER_ID`. Each tool call costs 1 of the account's monthly MCP calls and is logged. **Switched OFF by default (2026-10-13)**: `helium10Enabled()` (`src/lib/helium10/enabled.ts`) is false unless `NEXT_PUBLIC_HELIUM10_ENABLED=true`; then S2 = Cerebro CSV upload, S3 = review CSV upload, review syncs = Rainforest only
- **Amazon SP-API**: Per-client credentials stored in `sp_api_credentials` table
- **Redshift**: Intentwise analytics integration
- **Resend**: Transactional email

### Environment

All env vars documented in `.env.example`. GCP private key must be set via Vercel CLI (not dashboard) due to multiline handling: `npx vercel env add GCP_PRIVATE_KEY production < key.pem`.

### Deployment

Vercel (auto-deploy from `main`). Production URL: `https://www.marketfoundryhub.com` (Vercel project: mfhub). Git author for deploys: `Manu <manu@marketfoundry.agency>`.

## Design System

**1o8 brand (this repo is the 1o8 Hub, a copy of MarketFoundry's hub):** the 1o8 brand reference is
`docs/brand/1O8-BRAND.md` (taken from the 1O8_Creative_Workflow deck: Yellow `#F7BF1D`, Ink `#2C2B35`,
Slate `#817F8A`, Card Gray `#F4F4F2`, Inter). Read it before any visual or UI decision. Wherever it
conflicts with the MarketFoundry palette/fonts in `DESIGN.md`, the 1o8 brand wins. Layout, spacing and
component structure still follow `DESIGN.md`. Local setup notes: `LOCAL.md`.

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match DESIGN.md.

## Superpowers

Use superpowers skills for structured workflows. Invoke via the Skill tool before starting work.

Available skills:
- `/brainstorming` — Before any creative work, feature design, or behavior changes
- `/writing-plans` — Multi-step task planning before touching code
- `/executing-plans` — Execute written plans in separate sessions with review checkpoints
- `/test-driven-development` — Before implementing any feature or bugfix
- `/systematic-debugging` — Before proposing fixes for any bug or test failure
- `/using-git-worktrees` — Isolate feature work from current workspace
- `/dispatching-parallel-agents` — 2+ independent tasks that can run concurrently
- `/subagent-driven-development` — Execute plans with independent tasks in current session
- `/requesting-code-review` — After completing tasks or major features
- `/receiving-code-review` — Before implementing review feedback
- `/verification-before-completion` — Before claiming work is done
- `/finishing-a-development-branch` — When implementation is complete and tests pass

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Claudify Bundle (claudify + seo-specialist + content-specialist)

This project layers the Claudify operating system with the SEO and Content specialists. All bundle assets live under `.claude/`. Always read `.claude/memory.md` and `.claude/knowledge-base.md` at session start.

### Workflow Commands
- `/start` — begin a session (creates daily note, loads context)
- `/sync` — mid-session memory refresh
- `/wrap-up` — end-of-day handoff
- `/safe-clear` — flush context safely and resume
- `/audit` — quality review of recent work
- `/unstick` — root-cause unblocker
- `/retro` — sprint retrospective
- `/system-audit` — deep infrastructure audit
- `/handoff`, `/standup`, `/brief`, `/playbook`, `/proposal`, `/release`, `/report`, `/review`, `/launch`, `/onboard`, `/debt-map`, `/drift-detect`, `/competitive-intel` — Claudify base utilities

### SEO Commands
- `/seo-audit {url}` — tiered audit (T1 quick → T4 strategic)
- `/keyword-research {topic}` — keyword map with intent classification
- `/content-score` — 12-dimension content rubric before publish
- `/rank-check` — ranking movement review
- `/competitor-seo {domain}` — competitor keyword + backlink analysis
- `/backlink-scan {domain}` — backlink audit + prospecting
- `/content-refresh` — stale-content prioritization
- `/topical-map {domain} {topic}` — topical authority map

### Content Commands
- `/content {brand}` — full content production pipeline
- `/post {platform} {topic}` — single post draft (X/LinkedIn/IG/Threads)
- `/thread {topic}` — X thread
- `/blog {keyword}` — long-form SEO-aware blog post
- `/newsletter {action} [N]` — 9-phase newsletter pipeline (uses `newsletter/` starter pack at repo root)
- `/launch-post {platform}` — Product Hunt / HN / Indie Hackers launch
- `/readme {project}` — README + docs draft
- `/feedback` — auto-fires after content verdicts to log learnings

### Specialist Agents
- **Base (9):** `auditor`, `unsticker`, `error-whisperer`, `rubber-duck`, `pr-ghostwriter`, `yak-shave-detector`, `debt-collector`, `onboarding-sherpa`, `archaeologist`
- **SEO (4):** `seo-agent`, `content-optimizer`, `keyword-strategist`, `link-builder`
- **Content (10):** `content-creator`, `content-strategist`, `brand-voice-keeper`, `newsletter-orchestrator`, `drafter`, `prompt-architect`, `newsletter-auditor`, `stylist`, `analyst` (+ shared `auditor`)

### Key Bundle Files
- `.claude/memory.md` — active session context (max 100 lines)
- `.claude/knowledge-base.md` — system rules (max 500 lines, auditor-gated, provenance required)
- `.claude/command-index.md` — full command catalog
- `.claude/skills/{seo,content,...}/` — domain skill workflows
- `.claude/agent-memory/{agent}/MEMORY.md` — per-agent persistent memory
- `.claude/hooks/` — safety/voice/schema gates wired in `.claude/settings.json`
- `newsletter/` (repo root) — newsletter starter pack (foundations, build scripts, components)

### Per-User Setup
Fill in `.claude/CLAUDE.local.md` (gitignored) for SEO domain config, brand voice anchors, GSC properties, target keywords, competitors. Templates available in `bundle/seo-specialist/CLAUDE.local.md` and `bundle/content-specialist/CLAUDE.local.md`.
