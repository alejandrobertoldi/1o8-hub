# AGENTS.md

## Cursor Cloud specific instructions

This is a single **Next.js 16** app (`marketfoundry-hub`, aka "1o8 Hub"). It requires a
**PostgreSQL** database and gates every route behind Google OAuth. The Cloud Agent
environment is defined by `.cursor/environment.json` + `.cursor/Dockerfile` +
`.cursor/install.sh` + `.cursor/start.sh`, which install a local PostgreSQL, apply the
schema, seed an owner user, and auto-run the dev server. See `CLAUDE.md` for the
domain/architecture overview and the full list of `npm run` scripts.

### Services

| Service | Required | How to run / notes |
| --- | --- | --- |
| PostgreSQL (local) | Yes | Provisioned by the Dockerfile and `.cursor/install.sh`. Auto-started each boot by the `start` phase (`.cursor/start.sh`, version-agnostic). Creds: `mfhub` / `mfhub`, db `mfhub`, `127.0.0.1:5432`. To start manually: `bash .cursor/start.sh`. |
| Next.js dev server | Yes | Runs automatically in the `dev-server` terminal (`PORT=3000 npm run dev`, Next 16 + webpack). Reads `.env.local` natively. |
| BigQuery / Redshift / Anthropic / SP-API / Rainforest / Firecrawl / Google Drive / Resend | No | Optional integrations; env vars are unset locally, so those specific features will error. Core catalog/portal/admin work without them. Add real keys as Cloud Agent Secrets to enable them. |

### Non-obvious gotchas

- **SSL is mandatory for the DB.** `src/lib/db/index.ts` hardcodes `ssl: "require"`, so
  the local Postgres cluster must keep SSL enabled (Ubuntu's default snakeoil cert is
  already configured; `postgres.js` "require" does not verify the cert, so self-signed is fine).
  A plain non-SSL Postgres will not connect.
- **Set up schema with `npm run db:push`, not `npm run db:migrate`.** The Drizzle journal
  (`drizzle/migrations/meta/_journal.json`) only tracks migrations `0000`–`0004`; the other
  ~90 SQL files were hand-applied through one-off `scripts/*.ts`. On a fresh DB
  `drizzle-kit migrate` exits with a silent error, while `db:push` applies the full
  `src/lib/db/schema.ts` (107 tables). Note `db:push` is **interactive** against a
  non-empty DB (it prompts before truncating), so `.cursor/install.sh` only runs it when
  the schema is absent.
- **`tsx` data scripts need `DATABASE_URL` exported in the shell**, e.g.
  `export DATABASE_URL="postgresql://mfhub:mfhub@127.0.0.1:5432/mfhub"` before
  `npm run create-admin <email>` / `seed-*` / etc. Because of ESM import hoisting,
  `src/lib/db` is evaluated before these scripts' `dotenv.config({ path: ".env.local" })`
  call runs, so `.env.local` alone is not seen by them. The `next dev` server loads
  `.env.local` natively and is unaffected.
- **Auth has no local bypass.** `src/proxy.ts` redirects all unauthenticated traffic to
  `/auth/signin` and the only provider is Google OAuth (placeholder creds locally). To
  exercise authenticated flows without a real Google login, mint a NextAuth session JWT
  with the `@auth/core`/`next-auth` `encode` (salt + cookie name `authjs.session-token`,
  secret = `NEXTAUTH_SECRET` from `.env.local`) and send it as the `authjs.session-token`
  cookie. A seeded owner user `dev@localhost.test` already exists.

### Lint / test baseline (pre-existing, not env issues)

- `npm run lint` runs but reports ~1949 pre-existing errors, including "rule not found"
  for inline `react-doctor/*` comments (that plugin is not a dependency).
- `npm run test` (vitest): ~2013 pass, ~35 pre-existing failures — mainly a stale mock
  (`@/lib/api-auth` missing `getEffectiveAccountId`) in the Redshift report route tests,
  plus tests that need `ANTHROPIC_API_KEY` or a Chromium/PDF binary.
