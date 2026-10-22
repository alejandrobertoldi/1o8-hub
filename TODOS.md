# TODOS

## P1 — Active

### PPC Performance Module
6-capability PPC intelligence system: auto-compare dashboard, root cause insight panel, approval tracking, predictive alerts, competitor benchmark, decision accountability tracker. Redshift-first data layer.

**Why:** Turns Hub from a reporting tool into a decision-making system. Account Managers currently spend hours/week manually downloading and comparing Amazon Ads reports. This automates comparison and adds AI-powered root cause analysis.
**Pros:** All data patterns already exist in codebase (Redshift, caching, Claude API, Rainforest). Redshift-first minimizes new infrastructure. 6 proven patterns to reuse.
**Cons:** L effort (~20 new files, 4 new DB tables). Blocked by Intentwise Redshift schema discovery.
**Context:** Design doc APPROVED: `~/.gstack/projects/1o8-Marketplace-1o8Hub/manu-main-design-20260408-014837.md`. Eng review resolved 6 issues: parameterized queries, graceful degradation, single-route orchestration, pre-computed deltas in cron, shared date-ranges.ts, batched cron with skip-on-failure. Test plan: 28 paths, 2 E2E.
**Blocker:** Run Redshift schema discovery first: `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('intentwise_ecommerce_graph', 'amazon_source_data') ORDER BY table_schema, table_name`
**Effort:** L | **Priority:** P1 | **Depends on:** Redshift schema discovery
**Source:** Eng Review 2026-04-08

## P2 — Strategic

### AI Copilot Layer
Embed Claude as a conversational copilot across 1o8Hub — persistent chat sidebar that understands product catalog, generates A+ content, analyzes sales trends, drafts bullet points.

**Why:** Transforms platform from "tool with AI features" to "AI-native platform." Hardest moat to replicate.
**Pros:** Differentiation, user delight, leverages existing 9 Claude integrations.
**Cons:** L effort (2-3 weeks), prompt engineering complexity, per-query cost.
**Context:** Build after Revenue Attribution proves ROI to clients. Copilot can reference impact data in its recommendations.
**Effort:** L | **Priority:** P2 | **Depends on:** Revenue Attribution
**Source:** CEO Review 2026-03-17

### Amazon SP-API Write-Back
Direct publishing from 1o8Hub to Amazon Seller Central via SP-API. Approved content changes go live on Amazon without leaving the platform.

**Why:** Closes the content management loop. Makes 1o8Hub the single source of truth, not a staging area.
**Pros:** Eliminates manual Seller Central work, enables detect→fix→publish→verify workflow.
**Cons:** L effort, Amazon SP-API write approval process, throttling, error recovery complexity.
**Context:** SP-API read integration already exists with per-client credentials. Write is the natural extension.
**Effort:** L | **Priority:** P2 | **Depends on:** Nothing (independent)
**Source:** CEO Review 2026-03-17

### A+ Content Impact Triggers
Auto-create impact snapshots when A+ content changes are saved (approve, reject, publish). Currently only product edits and bulk edits call `createImpactSnapshot()`. A+ changes — the agency's primary content output — don't trigger impact tracking at all.

**Why:** A+ content is the main value 1o8 delivers to clients. Without impact triggers on A+ changes, the Revenue Attribution feature misses the most important content changes.
**Pros:** Captures the highest-signal content changes, makes impact data meaningful for client conversations.
**Cons:** S effort, need to instrument A+ save/approve/reject endpoints.
**Context:** `createImpactSnapshot()` in `src/lib/impact-snapshots.ts` already handles the logic. Just need to call it from A+ endpoints (e.g., `src/app/api/aplus/[productId]/bulk-status/route.ts`).
**Effort:** S | **Priority:** P2 | **Depends on:** Revenue Attribution (shipped)
**Source:** CEO Review 2026-03-18

## P3 — Hardening

### Runtime Variation Validation on Write Paths
Add Zod schema validation on the product edit API endpoint (`/api/products/[id]`) for the `variations` JSONB blob. Currently the `VariationData` type is compile-time only — if raw JSON with wrong casing (e.g., `color` instead of `Color`) is POSTed, it persists unchecked.

**Why:** Prevents casing drift after the PascalCase normalization migration. Defense in depth beyond TypeScript.
**Pros:** Catches bad data at the API boundary, not after it's in the DB.
**Cons:** XS effort, but low risk since only internal tools (BQ import mapper, product edit UI) write to this blob.
**Context:** The import mapper (`src/lib/product-mapper.ts`) already controls casing via `COLUMN_GROUPS`. The edit UI sends back what it received. Risk of wrong casing is near-zero, but validation closes the gap.
**Effort:** XS | **Priority:** P3 | **Depends on:** Canonical VariationData type (this PR)
**Source:** Eng Review 2026-03-20

## Completed

### SEO Quality Score Trends
Track S6 compliance audit scores over time per client. Show trend lines on the SEO Dashboard and per-client detail pages. Requires storing historical snapshots of audit scores.

**Completed:** v0.1.2.0 (2026-03-19) — Quality scores persist in `seo_quality_scores` table with 7-category breakdown. Displayed as badges in Content Control Center. API at `/api/seo/quality` for GET/POST.
