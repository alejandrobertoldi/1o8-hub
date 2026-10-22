# SEO Manager: direct Helium 10 keyword acquisition

User decision: integrate into the Hub's SEO Manager, rather than run research in Codex.

## Design

The S2 page reached from `/seo/manager` offers Fetch keywords without connection controls. User-approved shared account: amazon@marketfoundry.agency. Administrators authorize that account at `/admin/helium10` using OAuth Authorization Code + PKCE. HELIUM10_CONNECTION_OWNER_ID selects one encrypted connection row for every SEO operator; there is no per-user fallback. OAuth pending state is bound to the initiating user. Any internal user with SEO access, including viewers, can reconnect directly from S2; the callback returns to their project. Explicit disconnection remains administrator-only. The official MCP SDK handles discovery, registration, token exchange, refresh and Streamable HTTP. Credentials are encrypted at rest in a dedicated user-keyed table, never sent to client JavaScript. Use the configured NEXTAUTH_SECRET with a separate encryption context. Changing that secret requires reconnecting.

Use the project's saved S1 child ASINs (parents only when no children exist), an explicitly selected marketplace, and optional competitor ASINs. Fetch exact ASINs with exclude_variations=true to avoid implicitly expanding the selection. Discover the reverse-ASIN tool from tools/list, then call it once per ASIN. Merge duplicate phrases deterministically and keep client and competitor results separate. A failed ASIN fails the batch; no partial batch silently replaces previous data.

Normalize into the existing Cerebro result interface for filters, preview and tiering. Retain missing metric names as provenance; never treat missing data as measured zero in display or model inputs. Organic/sponsored placement labels are not Exact/Phrase/Broad match types. Fetching alone never approves S2 or deletes approved keywords. Preserve fetched inputs in project content_rules so a reload restores the review. CSV remains a manual alternative.

Access: authenticated Hub operators with SEO access only; client/prospect/viewer/pending roles cannot connect or query this integration. OAuth state is expiring, user-bound and consumed once. Use configured NEXTAUTH_URL for callbacks, not arbitrary request hosts. Persist rotated credentials even when a subsequent query fails. Limit batches and request duration; do not log tokens or upstream error bodies.

## Validation

Test encryption tampering and user isolation; state expiry/replay; metric mapping, missing fields and Unicode keywords; duplicate merging; read-only tool discovery and errors; authorization and preservation of data on failed fetches; UI connection, fetch success/error and handoff to existing filters. Type-check changes and run existing Cerebro/SEO tests.

## Deployment

Apply the additive helium10_connections migration. NEXTAUTH_URL must match the deployed Hub URL; NEXTAUTH_SECRET must be stable. An administrator must complete Helium 10 consent from `/admin/helium10` using amazon@marketfoundry.agency before live keyword fetching can be verified. Helium 10 may reject a deployed callback at registration; surface connection failure and retain manual acquisition.

Official provider reference: https://github.com/helium10/Helium10-MCP/blob/main/README.md

## Shared connection deployment (2026-09-10)
Set server-only HELIUM10_CONNECTION_OWNER_ID to the Hub user UUID owning the shared credential row. Local configuration retains the sole existing authorized connection; no tokens were copied or exposed. Production must configure an owner row, canonical NEXTAUTH_URL and the matching stable encryption secret, then authorize the designated account from the production administrator page. Avoid reauthorizing the same row from local and production environments concurrently; OAuth registrations carry environment-specific redirect URLs.

The provider OAuth contract does not supply a verified account email to this integration. The account designation is based on the user's confirmation and the administrator selecting the mandated account at consent; do not claim cryptographic email enforcement. The SDK refreshes access tokens automatically and persists rotations; revocation, inactivity expiry and provider outages still require administrator attention. No API token is supported by the provider.
