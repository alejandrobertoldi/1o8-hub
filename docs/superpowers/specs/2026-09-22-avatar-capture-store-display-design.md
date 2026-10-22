# User avatar capture, storage, and hub-wide display

**Date:** 2026-09-22
**Status:** Approved design, pending implementation plan (`/writing-plans`) in a FRESH session
**Depends on two human prerequisites (see §7) before any backfill can run.**

## Problem

Avatars are inconsistent across the hub. `users.image` holds a Google OAuth `picture` URL for only ~23 of ~81 users; the other ~58 are NULL and render initials, because Google's OAuth only sometimes returns a `picture` claim. Where a URL exists it is a hotlinked `lh3.googleusercontent.com` link (no-referrer), which can rotate or expire. Manu wants every user's avatar **captured, stored in our own storage, and displayed across all hub sections** where users appear.

## Key facts established during brainstorming (verify still true at build time)

- `[Certain 2026-09-22]` ~58/81 users have `users.image = NULL`; Google does not reliably send `picture`. Source: `src/lib/auth-db.test.ts` comment ("58 of 81 users have image NULL and Google sends no `picture`").
- `[Certain]` No blob storage is configured today (no Supabase Storage, no Vercel Blob). The only file store is Google Drive (`src/lib/drive-client.ts`).
- `[Likely]` ~82 files render avatars, nearly all through the shared `Avatar`/`AvatarImage` component (`src/components/ui/avatar.tsx`) reading `users.image`. So repointing `users.image` at a stored URL updates display everywhere with no per-site changes. **Verify at build time** that non-team sites (comments, assignees, admin lists, portal) read `users.image` and not a separately cached value.
- The app already authenticates to Google with a GCP **service account** (`GCP_CLIENT_EMAIL` / `GCP_PRIVATE_KEY`, used by BigQuery and Drive per memory `drive-auth-uses-gcp-client-email`).

## Decisions (locked)

- **Source = Google Workspace Admin SDK Directory API** (`directory.users.photos.get`), called by the existing GCP service account via **domain-wide delegation (DWD)** impersonating a Workspace admin. This returns org members' profile photos for `@marketfoundry.agency` accounts. External/client/prospect users are not in the org and keep the initials fallback.
- **Storage = Supabase Storage**, a public-read bucket named `avatars`. Object path `{userId}.jpg` (or `{userId}.<ext>` by content type). The object's public URL is written to `users.image`.
- **Display is unchanged** — everything keeps reading `users.image`.
- **Additive, non-destructive.** Users we can't source keep their current value (a Google URL or NULL → initials). No column drops.

## Architecture

### 1. Storage bucket
Supabase Storage bucket `avatars`, public read. Create via the Supabase dashboard or management API (prerequisite §7.2). Public URL form: `https://<project>.supabase.co/storage/v1/object/public/avatars/<path>`.

### 2. Directory photo source (`src/lib/avatars/directory.ts`)
- Build a JWT-authorized Admin SDK Directory client from the service-account credentials **with `subject` = a Workspace admin email** (DWD impersonation) and scope `https://www.googleapis.com/auth/admin.directory.user.readonly`.
- `getDirectoryPhoto(email): Promise<{ bytes: Buffer; contentType: string } | null>` — calls `users.photos.get({ userKey: email })`; the API returns base64url `photoData` + `mimeType`; decode to bytes. Returns `null` on 404 (no photo) or non-org user.
- Config: reuse `GCP_CLIENT_EMAIL`/`GCP_PRIVATE_KEY`; add `GOOGLE_WORKSPACE_ADMIN_EMAIL` (the admin to impersonate) to env.

### 3. Storage upload (`src/lib/avatars/storage.ts`)
- A Supabase client with the **service_role** key (server-only) to upload to the `avatars` bucket (bypasses RLS for writes; bucket is public for reads).
- `uploadAvatar(userId, bytes, contentType): Promise<string>` — `upsert` the object at `{userId}.{ext}`, return its public URL. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in env (confirm what exists; the app may only have the `postgres` connection string today).

### 4. Capture orchestration (`src/lib/avatars/capture.ts`)
- `captureUserAvatar(user): Promise<{ status: "stored" | "no-photo" | "skipped"; url?: string }>` — for an active `@marketfoundry.agency` user: fetch Directory photo → upload → return the public URL. Skips non-org emails. Pure orchestration over §2 + §3, unit-testable with both mocked.

### 5. Backfill script (`scripts/backfill-avatars.ts`)
- Iterate active users (reuse the `@marketfoundry.agency` + active filter, but include dept-assigned users too if desired), run `captureUserAvatar`, and on `stored` set `users.image = url` (one UPDATE per user). Idempotent (re-runnable; `upsert` storage + overwrite the column). Flags: `--dry-run` (report counts, no writes), default live. Prints a summary: stored / no-photo / skipped / errors.
- Model script mechanics on existing `scripts/*.ts` (dotenv `.env.local`, direct DB URL). **DB writes = prod**, so it runs only with an explicit per-action OK.

### 6. On-login refresh (PHASE 2 — optional, defer)
In the NextAuth callback (`src/lib/auth-db.ts` name/image sync path), when Google supplies a fresh `picture`, download + store it and set `users.image` to the stored URL instead of the hotlink. Keeps new users covered without a re-backfill. Design so it never blocks or fails login (best-effort, catch-all). Deferred: the backfill covers "all now"; ship it first.

### 7. Human prerequisites (BLOCK execution)
1. **DWD scope grant (Google Workspace admin):** Security → Access and data control → API controls → Domain-wide delegation → Add new → the service account's **numeric Client ID** + scope `https://www.googleapis.com/auth/admin.directory.user.readonly`. Find the Client ID in GCP console → IAM & Admin → Service Accounts → the BQ/Drive account → its **Unique ID** (a long number), or in the DWD "Client ID" field. Also set `GOOGLE_WORKSPACE_ADMIN_EMAIL` in env to a real super-admin address.
2. **Supabase `avatars` bucket (public read):** create it; confirm `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are available to the server (the project currently connects via a Postgres URL — the storage upload needs the REST endpoint + service-role key, which may need adding to env).

## Display verification (not just team)
At build time, grep the ~82 avatar sites and confirm each renders `user.image` from the DB (comments/mention/assignee pickers, `user-menu.tsx`, `portal-shell.tsx`, admin `shared-logins.tsx`, etc.). Any site that fetches Google directly or caches a URL elsewhere gets repointed to `users.image`. Fallback (`AvatarFallback` initials) stays for null images — no regression.

## Testing
- `directory.ts`: mock the Admin SDK client — returns bytes on a photo, `null` on 404.
- `storage.ts`: mock the Supabase client — asserts upsert path + returns public URL.
- `capture.ts`: mock §2+§3 — stored / no-photo / skipped branches; non-org email skipped.
- Backfill script: `--dry-run` count only; no unit test required beyond the modules.
- Follow `npm run test` then `tsc --noEmit` (vitest does not typecheck).

## Out of scope
- User-uploaded custom avatars (approach B) — not chosen; org photo is the source. A follow-up if wanted.
- Client/prospect/external avatars (not in the Workspace directory) — they keep initials.
- On-login refresh is Phase 2.

## Rollback
Non-destructive: `users.image` previously held a Google URL or NULL. To revert, restore the prior `users.image` values (keep a snapshot before the backfill: `SELECT id, image FROM users` dumped to a file) and optionally empty the bucket.
