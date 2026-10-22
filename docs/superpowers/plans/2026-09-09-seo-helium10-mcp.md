# SEO Helium 10 MCP Implementation Plan

**Goal:** Fetch Helium 10 keyword data directly from Hub S2.
**Architecture:** Per-user encrypted OAuth connection, official MCP SDK, authenticated project acquisition route, existing keyword review UI.
**Tech Stack:** Next.js 16, Drizzle/PostgreSQL, MCP SDK 1.27.1, Vitest.
**Spec:** /Users/manu/MFHub/docs/superpowers/specs/2026-09-09-seo-helium10-mcp.md

## Constraints

Preserve unrelated working tree changes. No token exposure. No automatic S2 approval. Exact ASIN research. Missing fields remain identified. No deployment or production data changes in this implementation task.

## Tasks

- [x] Write failing normalization and credential tests in src/lib/helium10/*.test.ts. Assert missing metrics stay identified, duplicate keywords select a deterministic row, and credentials cannot be decrypted as another user.
- [x] Add encrypted connection table and migration. Implement the SDK OAuth provider and user-bound expiring state. Use a transaction row lock to serialize refresh-token rotation for each operator.
- [x] Add connection and callback routes under /api/seo/helium10. Restrict to SEO operators, enforce same-origin mutations, return only connection status/authorization URL.
- [x] Add project keyword fetch route. Load saved ASINs, validate marketplace and optional competitors, retrieve full batches with bounded requests, preserve previous inputs on failures, and return normalized client/competitor results.
- [x] Add the connection/acquisition UI to S2 and restore the persisted inputs. Retain CSV flow, filters, tiering, and approval.
- [x] Update S2 process instructions and add route/UI tests. Run focused Vitest suites, targeted lint and TypeScript. Report live OAuth verification separately from mocked checks.

Execution is inline in the current task under the user's authorization to integrate into the Hub.

## Verification and deployment status

Implementation and independent code review complete locally. Focused tests cover acquisition, OAuth state, credentials, access, UI, S2 runner and existing filters. Targeted lint passes. Full repository TypeScript checking has unrelated existing errors; no integration-file errors were reported. The browser smoke test reached SEO Manager but project loading timed out on the database. Migration 0102 is not applied to the Hub database; live Helium 10 consent and research are not verified. A disposable local migration check could not start because only libpq client binaries, not a PostgreSQL server, are installed. No deployment or production data mutation was performed.
