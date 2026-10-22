# Team user detail — contact, employment, financial, holidays

**Date:** 2026-08-05
**Branch:** `feat/team-user-detail`, worktree `/Users/manu/MFHub/.worktrees/team-user-detail`
**Base:** `feat/team-calendar-time-off` @ `37c453b4` (Thread E — unmerged)
**Migration:** `0090` (Thread E holds 0087 applied + 0088 written-not-applied; 0089 is reserved for Thread C)

## 1. Problem

MFHub has no per-person record. `/admin/users` is a single 1074-line wide-matrix table whose
only job is role and section-permission checkboxes; there is no route for one user, no place to
store contact details, no financial data anywhere in the repo, and — per Thread E's session-5
finding — nothing in the app ever *displays* a holiday. `public_holidays` rows do exactly one
thing: stop a day being deducted from a time-off request.

This spec adds a team directory and a per-person detail page that holds contact, address,
employment, holiday assignment, pay, and payment details, each block gated by who is allowed to
see it.

Out of scope, deliberately: **cost reporting** (`time_entries.hours` × rate-in-force). The
effective-dated rate table and its editing UI are in scope so the data model never needs
re-migrating, but the reports that consume it get their own spec. That work has an open question
this spec does not answer — what happens to the ~15,300 existing `time_entries` rows that predate
any rate.

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Built on `feat/team-calendar-time-off`, not `main` | That branch already owns `users.country_code` (holiday calendar) and `users.residence_timezone`. Building on `main` would fork the holiday-calendar column and guarantee a conflict on `users`, `schema.ts` and `/admin/users`. |
| D2 | Three access tiers: **self**, **admin**, **super-admin** | `role === "admin"` is held by more than one person. Pay data is `isSuperAdmin`-only, read and write. |
| D3 | Sensitivity tier **is** the table boundary | `GET /api/admin/users` does an unprojected `db.select().from(users)`. Keeping sensitive fields off `users` makes the protection structural, not a code-review habit. |
| D4 | Bank/tax identifiers encrypted at the application layer (AES-256-GCM) | Supabase has no per-column encryption. This repo has already had one SQL-injection read bug, so a DB-only leak vector is real. Cost accepted: key management, and those fields can never be searched or sorted. |
| D5 | New `/team` section: directory + `/team/[userId]` detail; `/profile` redirects to own | `/admin/*` is admin-gated, so a viewer could never reach an admin-only page to fix their own phone number. |
| D6 | Holiday block shows the assignment **and** that person's holiday dates for a chosen year | First place in the hub where anyone can see which days a person actually gets — which is how the over-seeded US list becomes visible. |
| D7 | No new `team`/`department` column | `users.clientIdCode` already doubles as the internal-team field (`1o8-agency` / `1o8-marketplace` / `external`), driven by `INTERNAL_TEAMS` in `admin/users/page.tsx`. |
| D8 | `getDaysTakenByUser` stays unbuilt | Thread E decided this deliberately. The profile shows holidays, not time-off balances. |
| D9 | Holiday **editing** is not on this page | Adding/removing dates is a country-level tool. The gap is real (there is no holiday admin UI at all) but this is the wrong home for it. |
| D10 | `/admin/users` keeps role/section editing and Thread E's `UserTimeOffCell` | Only its name cell changes, becoming a link to `/team/[id]`. |

## 3. Data model — migration `0090`

Rollout order on this branch is **0088 → 0090**. Both need `DIRECT_DATABASE_URL`, which is not
set. Applying either is a production schema change requiring its own explicit OK.

### 3.1 Tier 0 — additions to `users`

Readable by anyone who can already list users. Safe because `proxy.ts:55-98` blocks `client` and
`prospect` roles from every `/api/*` outside a fixed allowlist, and `/api/team` is not on it.

| Column | Type | Editable by |
|---|---|---|
| `phone` | `varchar(40)` | self, super-admin |
| `slack_handle` | `varchar(80)` | self, super-admin |
| `job_title` | `varchar(120)` | admin |
| `start_date` | `date` | admin |
| `employment_status` | new enum `employment_status` (`active` \| `inactive` \| `alumni`), `NOT NULL DEFAULT 'active'` | admin |

`employment_status` also replaces the `ilike '%@marketfoundry.agency'` filter in `/api/team` as
the way to keep 1o8-era duplicate rows out of team pickers. The `ilike` filter stays until every
row has a status set; removing it is a follow-up, not part of this work.

### 3.2 Tier 1 — `user_profiles` (1:1)

Readable and writable by **self and super-admin only**. Ordinary admins cannot see it.

```
user_id                    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
personal_email             varchar(255)
address_line1              varchar(200)
address_line2              varchar(200)
city                       varchar(120)
postcode                   varchar(20)
address_country            char(2)
date_of_birth              date
emergency_contact_name     varchar(120)
emergency_contact_phone    varchar(40)
emergency_contact_relation varchar(60)
created_at                 timestamptz NOT NULL DEFAULT now()
updated_at                 timestamptz
```

`address_country` is deliberately **not** named `country_code`. That name is taken on `users` and
Thread E locked it as "a policy assignment, not geography" — a Manila-based person working US
hours is assigned `US`. Two country fields meaning different things is the most likely future bug
here, so they get different column names and visibly different UI labels
("Holiday calendar" vs "Country of residence").

Accepted trade-off: gating emergency contact to super-admin means an ordinary admin cannot pull
it in an actual emergency. Widening that single field to `admin` is a one-line change to
`FIELD_TIERS` if wanted later.

### 3.3 Tier 2 — `user_pay_periods` (1:N, effective-dated)

Super-admin only, read and write.

```
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
effective_from date NOT NULL
effective_to   date                      -- NULL = currently in force
contract_type  enum contract_type (hourly | salaried | contractor) NOT NULL
rate_amount    numeric(12,2) NOT NULL
rate_currency  char(3) NOT NULL
rate_period    enum rate_period (hour | month | year) NOT NULL
note           text
created_at     timestamptz NOT NULL DEFAULT now()
created_by     uuid REFERENCES users(id) ON DELETE SET NULL

CHECK (effective_to IS NULL OR effective_to >= effective_from)
CHECK (rate_amount >= 0)
EXCLUDE USING gist (
  user_id WITH =,
  daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') WITH &&
)
```

`contract_type` and `rate_period` are separate because they are separate facts: a contractor can
be paid monthly, a salaried person is quoted yearly.

The `EXCLUDE` constraint is what makes "the rate in force on date X" a well-defined question.
It requires the `btree_gist` extension. Thread E's migration 0087 is believed to have installed
it; **this must be verified against prod before the migration is written** — if absent, 0090
creates it (`CREATE EXTENSION IF NOT EXISTS btree_gist`).

This constraint exists in **SQL only**. drizzle-orm 0.45 has no exclusion-constraint primitive.
It is the **second** deliberate SQL↔Drizzle divergence on this branch, alongside Thread E's
`time_off_no_overlap_per_user`. Both must be listed in a schema comment so no reviewer "fixes"
them as drift.

### 3.4 Tier 3 — `user_payment_details` (1:1)

Super-admin only, read and write.

```
user_id                        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
payment_method                 enum payment_method (bank_transfer | wise | payoneer | paypal | other)
payment_cadence                enum payment_cadence (monthly | biweekly | weekly | per_invoice)
invoices_required              boolean NOT NULL DEFAULT false
payee_name                     varchar(200)
bank_name                      varchar(120)
bank_country                   char(2)
account_identifier_ciphertext  text
account_identifier_last4       varchar(4)
tax_id_ciphertext              text
tax_id_last4                   varchar(4)
key_version                    smallint NOT NULL DEFAULT 1
created_at                     timestamptz NOT NULL DEFAULT now()
updated_at                     timestamptz
updated_by                     uuid REFERENCES users(id) ON DELETE SET NULL
```

The `last4` columns are plaintext so the masked display (`••••4821`) never needs to decrypt.
`key_version` exists so the key can be rotated without a schema change.

## 4. Access control

`src/lib/team/access.ts`:

```ts
export type Access = { isSelf: boolean; isAdmin: boolean; isSuperAdmin: boolean };
export function resolveAccess(session, targetUserId): Access
export function canWriteField(field: string, access: Access): boolean
```

Capabilities, not an ordered tier. The three flags are independent and can all be true at once —
an admin viewing their own record is `{isSelf: true, isAdmin: true, isSuperAdmin: false}` and must
still be able to edit their own phone number. A single ordered enum would silently take that away,
which is why this is modelled as a set.

Field-level authorization lives in one map,
`FIELD_TIERS: Record<string, "self" | "admin" | "superadmin">`, and `canWriteField` resolves it:

| Field tier | Writable when |
|---|---|
| `self` | `isSelf \|\| isSuperAdmin` |
| `admin` | `isAdmin \|\| isSuperAdmin` |
| `superadmin` | `isSuperAdmin` |

So a `self` field such as `phone` is **not** editable by an ordinary admin on someone else's
record — the owner or a super-admin changes it. A PATCH key absent from the map is a **400**; a
key the caller may not write is a **403**. Nothing is silently dropped — a silent drop looks
exactly like a successful save.

Read access uses the same flags: `user_profiles` requires `isSelf || isSuperAdmin`, pay and
payment require `isSuperAdmin`.

### Routes

| Route | Guard | Behaviour |
|---|---|---|
| `GET /api/team` | session | Existing route, extended: add `job_title`, `employment_status`, `phone`, `slack_handle` to the projection and filter `employment_status = 'active'` **in addition to** the existing `ilike '%@marketfoundry.agency'`, which stays until every row has a status set |
| `GET /api/team/[userId]` | session | Tiered payload. Always: identity, role, team (`clientIdCode`), job title, start date, status, phone, slack, `country_code`, `residence_timezone`. `profile` only when `isSelf \|\| isSuperAdmin`. `pay` (periods) and `payment` (masked) only when `isSuperAdmin`. |
| `PATCH /api/team/[userId]` | `canWriteField` per key | Writes `users` + `user_profiles` |
| `GET/POST/PATCH/DELETE /api/team/[userId]/pay-periods` | `isSuperAdmin` | |
| `PUT /api/team/[userId]/payment` | `isSuperAdmin` | Encrypts on write |
| `POST /api/team/[userId]/payment/reveal` | `isSuperAdmin` | Decrypts one named field, returns it once, writes an `admin_event_log` row. POST not GET so the identifier never reaches a URL log or a prefetch. |
| `GET /api/holidays?country=XX&year=YYYY` | session | **Already exists**, reused unchanged. Its 400 message still reads "one of US, PK, ES" while `VALID_COUNTRY_CODES` is six — corrected here. |

**Ciphertext is never sent to the browser.** The detail payload carries `last4` only. A test
asserts no response body contains a `*_ciphertext` key.

**Audit.** Every write goes through `after(logEventAsync(...))`, the pattern Thread E established
for `PUT /api/admin/users`. `section: "admin"`, `resourceType: "user"`, `resourceId` = target id.
The `detail` payload records changed field **names** only, never values, for tier‑1 and above.
Reveal logs `action: "user:payment:reveal"` with the field name.

**Also in this PR:** tighten `GET /api/admin/users` (`route.ts:14`) to an explicit column
projection. Tier-0 fields are safe there, but the unprojected `select()` is the habit that makes
the next field unsafe.

## 5. UI

### Routes and navigation

- `/team` — directory of active staff.
- `/team/[userId]` — detail page.
- `/profile` — redirect to `/team/<own id>`.
- New section id `team` in `src/lib/permissions.ts` (standalone, like `calendar`) and a nav entry
  in `top-nav.tsx` beside Calendar.
- `/admin/users`: the name cell becomes a link to `/team/[id]`. Nothing else on that page moves.
- `INTERNAL_TEAMS` moves out of `admin/users/page.tsx` into `src/lib/constants.ts` so the
  directory and the matrix share one definition.

### Detail page

DESIGN.md's mandatory fixed page chrome. Hub accent `#FF751F`, `focus:border-brand`. Charcoal Blue
`#2A5059` is portal-only and never appears here.

Card sections, in order:

1. **Identity** — avatar, name, email, role badge, team badge, employment-status badge
2. **Contact** — phone, Slack handle, personal email (personal email tier-1)
3. **Employment** — job title, start date, employment status
4. **Time off & holidays** — holiday calendar (country, admin-set), country of residence
   (timezone, admin-set), then a year selector and the read-only date list from
   `GET /api/holidays`, with the **weekday-effective count** displayed
5. **Financial** — current pay period as a summary card, full history as a table
6. **Payment** — method, cadence, invoicing, payee, bank, masked identifiers with a Reveal button

Sections the viewer's tier does not permit are **omitted**, not rendered locked. A greyed-out
"Salary" box tells an admin there is salary to go looking for.

Editing is inline edit-in-place, matching the existing `EditableName` / `EditableAsanaEmail`
pattern in `admin/users/page.tsx`. Pay periods use a small dialog because they are multi-field.

The weekday-effective count matters: `countWorkingDays` (`working-days.ts:77`) already skips
Saturday and Sunday, so a holiday falling on a weekend is inert — it neither credits nor costs a
day. Showing the raw list without that count would misrepresent what a person actually gets.

## 6. Encryption

`src/lib/crypto/pii.ts`:

```ts
encryptPii(plaintext: string): { ciphertext: string; last4: string; keyVersion: number }
decryptPii(ciphertext: string, keyVersion: number): string
```

AES-256-GCM via `node:crypto`. A fresh random 12-byte IV per encryption, stored as
`base64(iv ‖ authTag ‖ ciphertext)`. Key from `USER_PII_ENCRYPTION_KEY` (base64, 32 bytes decoded).

A missing or wrong-length key **throws at call time**; the route maps that to **503**. There is no
plaintext fallback path. Payment routes declare `export const runtime = "nodejs"` — `node:crypto`
has no edge equivalent.

`USER_PII_ENCRYPTION_KEY` must exist in Vercel production and in the worktree's local env before
the payment block works. Absent it, everything else on the page still functions.

## 7. Testing

Vitest, scoped runs only — never the full suite (21 pre-existing environmentally-failing files).
Every test count predicted before running, per house rule.

- `pii.test.ts` — round-trip; tampered ciphertext throws; wrong key throws; `last4` extraction
  including inputs shorter than 4 characters; missing env throws
- `access.test.ts` — the full `resolveAccess` × `canWriteField` matrix: each role × self/other ×
  `isSuperAdmin` on/off × each of the three field tiers. Must include the admin-editing-own-`self`-field
  case and the admin-editing-someone-else's-`self`-field case, which are the two the ordered-tier
  model got wrong.
- Route tests per endpoint — 403 for wrong tier, 400 for a field absent from `FIELD_TIERS`, 403
  for a field above the caller's tier, no `*_ciphertext` key in any response body, reveal writes
  an `admin_event_log` row
- Pay-period overlap — the SQL `EXCLUDE` clause asserted present in the migration file, plus a
  unit test on the client-side pre-check that gives a readable error before the DB rejects it

`tsc --noEmit` after every test run (vitest does not typecheck), unfiltered, judged by filename
against this worktree's baseline of exactly one pre-existing error in
`scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46`.

## 8. Risks and open items

| Risk | Status |
|---|---|
| 0088 must be applied before 0090; both need `DIRECT_DATABASE_URL` | Not set. Blocks the DB half, not the code. |
| `btree_gist` presence in prod | Unverified. Must be checked before writing 0090. |
| `USER_PII_ENCRYPTION_KEY` missing in Vercel at deploy | Payment routes 503; rest of the page works. Fail-closed by design. |
| DOB and address for ES/PT/FI staff is GDPR personal data | Gated to self + super-admin and audited, but not encrypted. Deliberate proportionality call. |
| This branch cannot ship before `feat/team-calendar-time-off` ships | Accepted when D1 was taken. Thread E is blocked on holiday data from five people. |
| `employment_status` defaults every existing row to `active` | The 1o8-era duplicate rows will default to `active` too and must be set to `alumni` by hand before the `ilike` filter can be dropped from `/api/team`. |
