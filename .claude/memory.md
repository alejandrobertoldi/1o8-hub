# Memory

## 1o8 Hub (local copy) — design source of truth
- 1o8 brand: `docs/brand/1O8-BRAND.md` (from the 1O8_Creative_Workflow deck). Yellow #F7BF1D accent, Ink #2C2B35 text,
  Slate #817F8A body, Card Gray #F4F4F2 cards, Inter. Overrides MF's DESIGN.md colors/fonts on any rebranded surface.
- Local run + sheet seeding: `LOCAL.md`.

## Now
- Reviews section shipped on `claude/elegant-archimedes-4m5hzj` (091726): `src/lib/reviews/*`, `/reviews`, `/portal/reviews`,
  migration 0114 APPLIED to prod 091726 via Supabase MCP (project lmmbeswipsjygogwksol), cron `/api/cron/reviews-sync` in vercel.json.
  Sources: Rainforest `type=reviews` + shared Helium 10 MCP (`get_asin_review_analysis`, `get_asin_reviews_history`).
  agentcentral MCP (`get_product_reviews`) evaluated but its trial is expired; not wired.
- Bundle integration onboarding (`claude/bundle-integration` branch, c1fe7ea + new files)
- Verifying Claudify + SEO + Content specialist install
- T1 SEO audit pending for 1o8hub.vercel.app

## Active Project
- 1o8Hub — Amazon marketplace product management hub for 1o8 agency
- Production: https://1o8hub.vercel.app (auto-deploy from main)
- Stack: Next.js 16 App Router · React 19 · Tailwind 4 · shadcn/ui · Drizzle + Supabase
- Brand colors: hub gold #E8A700, portal blue #2563EB
- Last shipped: attributes-table-sync (DB cols `master_row` + `client_requirements` dropped, commit cb1869d on main)

## Open Threads
- Per-client brand-memories not yet populated (pending user input on voice anchors)
- Target keywords + competitors for 1o8 brand pending (`.claude/CLAUDE.local.md`)
- Newsletter pack at `newsletter/` — tracked at root, not yet customised for 1o8
- Sales WIP `stash@{1}` on `claude/youthful-bhaskara` branch (carry-over)
- Pre-existing WIP on this branch (sales-monitor, forecast rename) follows back to main on checkout

## Recent Decisions (050526)
- Bundle install: 23 agents, 37 commands, 32 skills, 14 hooks — counts verified
- Daily notes / task board moved from root to `.claude/daily/` + `.claude/task-board.md` (project file-org rule)
- Per-client architecture: `brand-memories/{client}.md` + `keyword-maps/{domain-slug}.md` per agency client
- Bundle source (`bundle/`), pre-bundle backups, per-user working files gitignored
- Knowledge-base completeness-gate cap raised 200 → 500 lines

## Workflow Conventions
- `PORT=3000 npm run dev` (DB pooler 6543 = prod; careful with destructive ops)
- Dev DB IS prod DB per `.env.local` — every "local" migration hits production
- Drizzle DDL via direct port 5432 (drizzle-kit hangs on pooler)
- Hand-written SQL migrations: one runner per file at `scripts/run-migration-NNNN.ts`
- Vercel 4.5MB body limit: use FormData re-upload for files
- bqName lookup: `getProductFieldValue` walks core → JSONB → raw

## Blockers
- (none)

## Claudify Everything update (080326)

### Stated priorities (from Manu, this session)
- Goals: (1) ship Redshift→BigQuery archival Plan 2A, (2) ship portal reports wiring (Thread D).
  NOT the agency-growth/research use case — so the Analyst engine is a later unlock, not a now one.
- Biggest time sinks: (1) verifying agents really finished, (2) re-establishing context each session.
- Stack context unchanged: Next.js 16 · React 19 · Tailwind 4 · Drizzle + Supabase · BigQuery ·
  Redshift (Intentwise, SELECT-only) · Google Drive · Anthropic API · Resend.

### What changed
- 216 files created, 1,853 refreshed, 0 removed. Inventory now: 49 agents · 66 commands ·
  36 skills · 29 hooks (was 25 · 39 · 36 · 14).
- Analyst research engine installed for the first time (54 modules, 14 research agents,
  19 commands, 9 recipes). It shipped in the Jul 21 download but was never copied in.
- Rollback lives at `.claude.backup/` (2,918 files) + `.claude.backup/_newsletter-backup/`.
- `.claude/UPDATE-MANIFEST.json` now present → the NEXT update can hash-diff precisely
  instead of guessing. Do not edit it.

### Protected from vendor updates (verified untouched)
`CLAUDE.md` · `CLAUDE.local.md` · `.gitignore` (89 lines; vendor's is 22 and would wipe it) ·
`.mcp.json` (not installed on purpose) · `.claude/memory.md` · every `agent-memory/**/MEMORY.md` ·
`logs/` · `backups/`.

### settings.json is a MERGE, never a copy
The vendor file ships **no `permissions`, no `enabledPlugins`, no `extraKnownMarketplaces`**.
Replacing it wholesale disables superpowers + ui-ux-pro-max + figma. Merge hooks/env only.
New hook set was verified a strict superset of the old one (0 hooks lost). All 25 hooks
PASS via `bash .claude/hooks/tests/run-all.sh` (or `/test-hooks`).

### Highest-value unlocks for the two stated pains
1. `/prove`, `/verify`, `/test` + the `claim-check.sh` Stop/SubagentStop hook — force a
   completion claim closed with real command output. Aimed at subagent "done" that isn't.
2. `/test-hooks` — proves all hooks fire. Relevant given the Jul 22–30 hook regression and
   `b78151a2` (removed a Stop judge that poisoned 461 sessions of verdicts).
3. `/utilization` + `/memory-consolidate` + `inject-related-context.sh` — maps installed vs
   actually-used, and reloads relevant context on resume.

### Topic routing (project-specific, appended to `.claude/hooks/topic-routing.yml`)
Added 9 keys beyond the vendor's 24: `seo`/`listing`/`amazon`/`asin`/`rufus`/`cosmo` route to
`1o8-seo-manager` (the generic web-SEO agent is the wrong engine here per CLAUDE.local.md);
`archival`/`redshift`/`bigquery` route to the Plan 2A ledger, plan and archive modules.
Contract: lowercase keys, no digits/slashes, two-space `- path`, every path must exist on disk.

### Known gap
`validate-handoff.sh` ships but is NOT wired in `settings.json`. It validates a
`Daily Notes/MMDDYY.md` "Session Handoff" block (requires Task/Done/Remaining/Files/Next and
checks that Files: paths exist) — it does NOT enforce the primer.md starting-prompt rule.

## Bundle File Map
- Skills: `~/.claude/skills/` (32 categories — claudify base + SEO + content)
- Agents: `.claude/agents/` (23 specialists)
- Commands: `.claude/commands/` (37 commands)
- Knowledge base: `.claude/knowledge-base.md` (216 lines, max 500)
- User config: `.claude/CLAUDE.local.md` (gitignored, agency + per-client)
- Per-brand voice: `.claude/agent-memory/content-creator/brand-memories/{slug}.md`
- Per-domain SEO: `.claude/agent-memory/seo/keyword-maps/{slug}.md`
- Daily notes: `.claude/daily/MMDDYY.md`
- Task board: `.claude/task-board.md`
