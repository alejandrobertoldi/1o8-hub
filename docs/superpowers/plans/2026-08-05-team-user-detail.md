# Team User Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/team` directory and a `/team/[userId]` detail page holding contact, address, employment, holiday assignment, pay history and payment details, with each block gated by three independent capability flags.

**Architecture:** Sensitivity tier *is* the table boundary — tier-0 fields go on `users`, tier-1 on `user_profiles` (1:1), tier-2 on `user_pay_periods` (1:N effective-dated), tier-3 on `user_payment_details` (1:1, AES-256-GCM app-side encryption). Authorization resolves through one pure module (`src/lib/team/access.ts`) holding a single `FIELD_TIERS` map, so no route re-implements the rules. `isSuperAdmin` is re-read from the database on every route that touches tier-2/tier-3 data, because the session flag is JWT-sourced and never refreshed.

**Tech Stack:** Next.js 16.1.6 (App Router), React 19, drizzle-orm 0.45.1, PostgreSQL (Supabase), Tailwind CSS 4, shadcn/ui, Vitest (jsdom), `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-08-05-team-user-detail-design.md` (commit `ece563f1`)
**Branch:** `feat/team-user-detail`, worktree `/Users/manu/MFHub/.worktrees/team-user-detail`, base `feat/team-calendar-time-off` @ `37c453b4`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Additive only.** No column drop, no column rename, no row deletion. `calendar_events` gets **zero** changes.
- **Per-action OK from Manu for EVERY database write and EVERY schema change.** Stop and ask; never apply.
- **NEVER run `next build`.** NEVER run `npm run db:generate` on this branch — 0084–0088 are absent from `_journal.json` and it emits huge drift. The house pattern is one bespoke `scripts/_apply-00NN.ts` per migration; `scripts/_apply-0088.ts` is the template.
- **NEVER run the full vitest suite** (21 pre-existing environmentally-failing files). Always scope to a path. **Predict every test count before running it.**
- **vitest does not typecheck.** Follow every test run with `node_modules/.bin/tsc --noEmit`, run in background (~2 min), read UNFILTERED, judge **by filename**. Baseline in this worktree is exactly **one** pre-existing error: `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46 TS2349`.
- Repo-wide `npm run lint` exits 1 pre-existing. Scope eslint to touched paths only.
- `.env` commands are hard-blocked; `ls -la` on any `.env` path is hook-blocked. `rm -r` / `rm -f` hard-blocked. `git checkout -- <path>` blocked — use Edit to revert.
- **NEVER `git add .`** — explicit pathspec on add AND commit, `-m` BEFORE `--`, one task per commit. Keep `graphify-out/*`, `.claude/*`, `.superpowers/*`, `redshift-client-exports/*` and every `scripts/_diag*` / `_probe*` / `_verify*` / `_tmp-*` out of every commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Dates are `YYYY-MM-DD` strings across every module boundary.** Never a `Date` object. drizzle `date()` columns already return strings; `numeric()` columns also return strings — keep them as strings end to end.
- **Design:** `/team` is a HUB page. Hub accent is `#FF751F` via `text-brand` / `border-brand` / `focus:border-brand`. Charcoal Blue `#2A5059` (`text-portal-accent`) is portal-only and must never appear. **Never put text on a `bg-brand` fill** (2.7:1, fails WCAG) — text-bearing orange is `bg-brand-solid text-white`. DESIGN.md has no "fixed page chrome" section; the real pattern is `PageMetaSlot` — copy `src/app/hours-log/page.tsx:24-33`.
- **`users.country_code` is a POLICY assignment** (which set of days off this person gets — a Manila-based person on US hours is `US`). **`user_profiles.address_country` is where they physically live.** Different column names, visibly different UI labels ("Holiday calendar" vs "Country of residence"). Conflating them silently changes someone's leave allowance.
- **Thread E's explanatory comments on `users.countryCode` (`schema.ts:114-126`) and `users.residenceTimezone` (`schema.ts:128-133`) must NOT be shortened or reflowed.**
- A line number is trustworthy only if it came from grepping the committed file.

### Rulings taken 2026-08-05 (do not re-litigate)

| Ref | Ruling |
|---|---|
| **F1** | `btree_gist` is proven present in prod (`0087:44` creates it; `0087:46-51` uses `EXCLUDE USING gist (user_id WITH =, …)`, which cannot compile without it; `public_holidays` holds 144 live rows). 0090 still ships `CREATE EXTENSION IF NOT EXISTS btree_gist;` as free insurance. **No prod check.** |
| **F2** | 0088 is already applied in prod. Spec §3 and §8 are stale on this point. The only live item is `DIRECT_DATABASE_URL` in **this worktree's** `.env.local` — Manu adds it (Task 0). |
| **F3** | **Ruled: every tier-2/tier-3 route re-reads `users.isSuperAdmin` from the database.** That is `GET` and `PATCH /api/team/[userId]`, all pay-period methods, `PUT /payment` and `POST /payment/reveal` — the GET is included because it returns the pay and payment blocks. `resolveAccess` takes `isSuperAdmin` as an explicit argument so the caller chooses JWT-vs-DB. |
| **F4** | **Ruled: `daterange(effective_from, effective_to, '[]')`** — inclusive upper bound, bare `effective_to`, **no `coalesce(…, 'infinity'::date)`**. A NULL bound is natively unbounded in Postgres, and an inclusive `'infinity'::date` upper bound would have to be canonicalised by incrementing infinity. This is a deliberate, ruled deviation from the spec's literal §3.3 SQL. |
| **Key** | `USER_PII_ENCRYPTION_KEY` **does not exist** — not in Vercel production, not in the worktree `.env.local`. Task 7 must ship fail-closed: **503, never a plaintext fallback.** Everything else on the page works without it. |

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `src/lib/crypto/pii.ts` | AES-256-GCM encrypt/decrypt + `last4`. Pure; env-key loading is the only side effect. |
| `src/lib/crypto/pii.test.ts` | 11 tests. |
| `src/lib/team/access.ts` | `Access`, `FIELD_TIERS`, `resolveAccess`, `isKnownField`, `allowsTier`, `canWriteField`. **Pure — no DB, no session import.** |
| `src/lib/team/access.test.ts` | 21 tests. |
| `src/lib/team/access-db.ts` | `readIsSuperAdmin(userId)` — the one indexed lookup F3 requires. Kept out of `access.ts` so that module stays pure. |
| `drizzle/migrations/0090_team_user_detail.sql` | The migration. |
| `scripts/_apply-0090.ts` | Apply script, copied from `_apply-0088.ts`. |
| `src/lib/db/migrations-0090.test.ts` | 5 file-content guards on the SQL. |
| `src/app/api/team/route.test.ts` | 4 tests (task 4). |
| `src/app/api/team/[userId]/route.ts` | `GET` + `PATCH`. |
| `src/app/api/team/[userId]/route.test.ts` | 12 tests. |
| `src/app/api/team/[userId]/pay-periods/route.ts` | `GET` + `POST`. |
| `src/app/api/team/[userId]/pay-periods/[periodId]/route.ts` | `PATCH` + `DELETE`. |
| `src/app/api/team/[userId]/pay-periods/route.test.ts` | 9 tests. |
| `src/app/api/team/[userId]/payment/route.ts` | `PUT`. |
| `src/app/api/team/[userId]/payment/reveal/route.ts` | `POST`. |
| `src/app/api/team/[userId]/payment/route.test.ts` | 8 tests. |
| `src/app/team/page.tsx` | Directory. |
| `src/app/team/[userId]/page.tsx` | Detail page shell. |
| `src/components/team/team-directory.tsx` | Directory grid (client component). |
| `src/components/team/user-detail.tsx` | Detail orchestrator (client component). |
| `src/components/team/editable-field.tsx` | Shared inline edit-in-place control. |
| `src/components/team/holiday-block.tsx` | Year selector + date list + weekday-effective count. |
| `src/components/team/financial-block.tsx` | Pay history table + pay-period dialog. |
| `src/components/team/payment-block.tsx` | Payment details + masked identifiers + Reveal. |
| `src/app/profile/page.tsx` | Redirect to own detail page. |

**Modified files**

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | 5 new `pgEnum`s + 5 new `users` columns + 3 new tables + the paired SQL↔Drizzle divergence banner. |
| `src/app/api/team/route.ts` | Extend projection, add the `employment_status` filter. |
| `src/app/api/admin/users/route.ts:17` | Tighten `db.select().from(users)` to the 13 fields the page consumes. |
| `src/app/api/holidays/route.ts:38,:82` | Two stale `"US, PK, ES"` 400 messages → derived from `VALID_COUNTRY_CODES`. |
| `src/lib/constants.ts` | Receive `INTERNAL_TEAMS`. |
| `src/lib/permissions.ts:116` | Add the `team` standalone section. |
| `src/components/layout/top-nav.tsx:161-163` | Add the Team nav entry. |
| `src/app/admin/users/page.tsx` | Import `INTERNAL_TEAMS` (call sites `:448`, `:944`); wrap the name cell at `:342` in a link. |

### Predicted test counts

| Task | File | New tests | File total after |
|---|---|---|---|
| 1 | `src/lib/crypto/pii.test.ts` | 11 | 11 |
| 2 | `src/lib/team/access.test.ts` | 21 | 21 |
| 3 | `src/lib/db/migrations-0090.test.ts` | 5 | 5 |
| 4 | `src/app/api/team/route.test.ts` | 4 | 4 |
| 4 | `src/app/api/admin/users/route.test.ts` | 1 | 1 (or existing + 1) |
| 4 | `src/app/api/holidays/route.test.ts` | 2 | 2 (or existing + 2) |
| 5 | `src/app/api/team/[userId]/route.test.ts` | 12 | 12 |
| 6 | `src/app/api/team/[userId]/pay-periods/route.test.ts` | 9 | 9 |
| 7 | `src/app/api/team/[userId]/payment/route.test.ts` | 8 | 8 |
| 8 | `src/lib/permissions.test.ts` | 2 | **10** (8 existing must still pass) |
| 8 | `src/lib/constants.test.ts` | 1 | 1 (or existing + 1) |
| 9–13 | — | 0 | UI tasks verify via tsc + scoped eslint + manual dev-server check |

**`readIsSuperAdmin` has no dedicated unit test on purpose** — it is a four-line indexed lookup, and Task 5 test 7 and Task 6 test 2 both assert DB-over-session behaviour through the routes, which is the behaviour that matters.

---

## Task 0: Preflight (Manu-run — do not attempt these yourself)

**Files:** none committed.

- [ ] **Step 1: Manu adds `DIRECT_DATABASE_URL` to the worktree `.env.local`**

Derive it from that file's existing `DATABASE_URL` by changing the port **6543 → 5432**. Append-only string surgery — **never** `URL.toString()`, which re-encodes the password. `.env` commands are hard-blocked for Claude; this is Manu's action alone.

Without it, `scripts/_apply-0090.ts` falls back to the transaction pooler (`_apply-0088.ts:38-46`), which is what dropped an 0087 attempt with `CONNECTION_CLOSED`.

- [ ] **Step 2: Confirm the encryption-key decision**

`USER_PII_ENCRYPTION_KEY` is **absent everywhere** as of 2026-08-05. Task 7 ships assuming absence: routes return 503 and never fall back to plaintext. If Manu creates it later, generate with `openssl rand -base64 32` and set it in Vercel production **and** the worktree `.env.local`. No code change is needed when it appears.

- [ ] **Step 3: Confirm F3 and F4 rulings are recorded**

Both are ruled in the Global Constraints table above. If the implementer finds either contradicted by the spec text, **the plan wins** — the spec is stale on both.

---

## Task 1: PII encryption module

**Files:**
- Create: `src/lib/crypto/pii.ts`
- Test: `src/lib/crypto/pii.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class PiiKeyMissingError extends Error`
  - `const PII_KEY_VERSION: 1`
  - `function last4(plaintext: string): string`
  - `function encryptPii(plaintext: string): { ciphertext: string; last4: string; keyVersion: number }`
  - `function decryptPii(ciphertext: string, keyVersion: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/crypto/pii.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptPii,
  decryptPii,
  last4,
  PiiKeyMissingError,
  PII_KEY_VERSION,
} from "./pii";

// Two distinct 32-byte keys, written as base64 exactly as the env var will be.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

const original = process.env.USER_PII_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.USER_PII_ENCRYPTION_KEY = KEY_A;
});

afterEach(() => {
  if (original === undefined) delete process.env.USER_PII_ENCRYPTION_KEY;
  else process.env.USER_PII_ENCRYPTION_KEY = original;
});

describe("last4", () => {
  it("returns the final four characters", () => {
    expect(last4("GB29NWBK60161331926819")).toBe("6819");
  });

  it("strips whitespace before slicing, so a spaced IBAN masks correctly", () => {
    expect(last4("GB29 NWBK 6016 1331 9268 19")).toBe("6819");
  });

  it("returns the whole value when it is shorter than four characters", () => {
    // The column is varchar(4), so a 1-3 char result still fits.
    expect(last4("42")).toBe("42");
  });
});

describe("encryptPii / decryptPii", () => {
  it("round-trips a plaintext", () => {
    const { ciphertext, keyVersion } = encryptPii("GB29NWBK60161331926819");
    expect(decryptPii(ciphertext, keyVersion)).toBe("GB29NWBK60161331926819");
  });

  it("stamps the current key version and the last4", () => {
    const out = encryptPii("GB29NWBK60161331926819");
    expect(out.keyVersion).toBe(PII_KEY_VERSION);
    expect(out.last4).toBe("6819");
  });

  it("produces a different ciphertext every call, because the IV is random", () => {
    const a = encryptPii("same-value");
    const b = encryptPii("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptPii(a.ciphertext, a.keyVersion)).toBe("same-value");
    expect(decryptPii(b.ciphertext, b.keyVersion)).toBe("same-value");
  });

  it("throws when the auth tag has been tampered with", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    const buf = Buffer.from(ciphertext, "base64");
    buf[12] ^= 0xff; // first byte of the 16-byte tag, which starts at offset 12
    expect(() => decryptPii(buf.toString("base64"), PII_KEY_VERSION)).toThrow();
  });

  it("throws when the ciphertext body has been tampered with", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    const buf = Buffer.from(ciphertext, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptPii(buf.toString("base64"), PII_KEY_VERSION)).toThrow();
  });

  it("throws when decrypted under a different key", () => {
    const { ciphertext } = encryptPii("GB29NWBK60161331926819");
    process.env.USER_PII_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptPii(ciphertext, PII_KEY_VERSION)).toThrow();
  });

  it("throws PiiKeyMissingError when the env var is absent", () => {
    delete process.env.USER_PII_ENCRYPTION_KEY;
    expect(() => encryptPii("x")).toThrow(PiiKeyMissingError);
  });

  it("throws PiiKeyMissingError when the key does not decode to 32 bytes", () => {
    // Buffer.from(…, "base64") never throws — it silently drops invalid
    // characters — so the decoded LENGTH is the only real guard.
    process.env.USER_PII_ENCRYPTION_KEY = Buffer.alloc(16, 3).toString("base64");
    expect(() => encryptPii("x")).toThrow(PiiKeyMissingError);
  });

  it("throws for a key version it has no key for", () => {
    const { ciphertext } = encryptPii("x");
    expect(() => decryptPii(ciphertext, 99)).toThrow(PiiKeyMissingError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/crypto/pii.test.ts
```

Expected: FAIL — `Failed to resolve import "./pii"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crypto/pii.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer encryption for bank and tax identifiers (spec D4).
 *
 * Supabase has no per-column encryption, and this repo has already shipped one
 * SQL-injection read bug, so a database-only leak vector is real. The cost is
 * accepted deliberately: these fields can never be searched or sorted.
 *
 * There is NO plaintext fallback. A missing or wrong-length key throws
 * PiiKeyMissingError at call time and the route maps that to 503 — storing a
 * plaintext IBAN in a column named `..._ciphertext` would be worse than
 * refusing the write, because nothing downstream would ever notice.
 */

/** 96-bit IV, the size AES-GCM is specified for. */
const IV_BYTES = 12;
/** 128-bit GCM auth tag, Node's default. */
const TAG_BYTES = 16;

/**
 * The key version stamped onto every new ciphertext. `key_version` exists on
 * user_payment_details so the key can be rotated without a schema change: a
 * future rotation adds version 2 here and keeps a decrypt path for 1.
 */
export const PII_KEY_VERSION = 1;

export class PiiKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiiKeyMissingError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.USER_PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new PiiKeyMissingError(
      "USER_PII_ENCRYPTION_KEY is not set — payment details are unavailable"
    );
  }
  // Buffer.from(…, "base64") silently discards characters outside the base64
  // alphabet instead of throwing, so garbage in produces a short buffer rather
  // than an error. The length check below is therefore the only real guard.
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new PiiKeyMissingError(
      `USER_PII_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`
    );
  }
  return key;
}

/**
 * The plaintext tail stored alongside the ciphertext so the masked display
 * (`••••4821`) never needs to decrypt. Whitespace is stripped first, so a
 * hand-typed "GB29 NWBK … 68 19" masks the same as the unspaced form. Inputs
 * shorter than four characters return whole — the column is varchar(4).
 */
export function last4(plaintext: string): string {
  return plaintext.replace(/\s+/g, "").slice(-4);
}

/** Encrypts to `base64(iv ‖ authTag ‖ ciphertext)`. */
export function encryptPii(plaintext: string): {
  ciphertext: string;
  last4: string;
  keyVersion: number;
} {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, body]).toString("base64"),
    last4: last4(plaintext),
    keyVersion: PII_KEY_VERSION,
  };
}

/** Reverses `encryptPii`. Throws on a tampered payload — GCM authenticates. */
export function decryptPii(ciphertext: string, keyVersion: number): string {
  if (keyVersion !== PII_KEY_VERSION) {
    throw new PiiKeyMissingError(
      `No decryption key for key_version ${keyVersion}`
    );
  }
  const key = loadKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Stored ciphertext is too short to be valid");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/crypto/pii.test.ts
```

**Predicted: 11 tests, 11 passed, 1 file.** Anything other than 11 means a test was dropped or duplicated — stop and reconcile before continuing.

- [ ] **Step 5: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task1.txt 2>&1; wc -l /tmp/tsc-task1.txt
```

Run in the background (~2 min). Read the file UNFILTERED **after** the completion notification, never before. Judge by filename: the only acceptable error is `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/lib/crypto/pii.ts src/lib/crypto/pii.test.ts
```

Expected: clean exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/lib/crypto/pii.ts src/lib/crypto/pii.test.ts && \
git commit -m "feat(team): AES-256-GCM PII encryption for bank and tax identifiers

Fail-closed: a missing or wrong-length USER_PII_ENCRYPTION_KEY throws
PiiKeyMissingError, which the payment routes map to 503. There is no
plaintext fallback path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/lib/crypto/pii.ts src/lib/crypto/pii.test.ts
```

---

## Task 2: Access-control module

**Files:**
- Create: `src/lib/team/access.ts`, `src/lib/team/access-db.ts`
- Test: `src/lib/team/access.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Access = { isSelf: boolean; isAdmin: boolean; isSuperAdmin: boolean }`
  - `type FieldTier = "self" | "admin" | "superadmin"`
  - `const FIELD_TIERS: Record<string, FieldTier>`
  - `const USERS_PATCH_FIELDS: ReadonlySet<string>` / `const PROFILE_PATCH_FIELDS: ReadonlySet<string>`
  - `function resolveAccess(viewer: { id: string; role: string }, targetUserId: string, isSuperAdmin: boolean): Access`
  - `function isKnownField(field: string): boolean`
  - `function allowsTier(tier: FieldTier, access: Access): boolean`
  - `function canWriteField(field: string, access: Access): boolean`
  - `async function readIsSuperAdmin(userId: string): Promise<boolean>` (from `access-db.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/team/access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveAccess,
  isKnownField,
  allowsTier,
  canWriteField,
  FIELD_TIERS,
  type Access,
} from "./access";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

/** Shorthand for building an Access without repeating three keys everywhere. */
function acc(p: Partial<Access>): Access {
  return { isSelf: false, isAdmin: false, isSuperAdmin: false, ...p };
}

describe("resolveAccess", () => {
  it("sets isSelf when the viewer is the target", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, ME, false).isSelf).toBe(true);
  });

  it("clears isSelf for someone else's record", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, THEM, false).isSelf).toBe(false);
  });

  it("sets isAdmin only for the admin role", () => {
    expect(resolveAccess({ id: ME, role: "admin" }, THEM, false).isAdmin).toBe(true);
  });

  it("clears isAdmin for editor and viewer", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, THEM, false).isAdmin).toBe(false);
    expect(resolveAccess({ id: ME, role: "viewer" }, THEM, false).isAdmin).toBe(false);
  });

  it("takes isSuperAdmin from the explicit argument, never from the role", () => {
    // F3: the caller decides JWT-vs-DB. An admin is not automatically super.
    expect(resolveAccess({ id: ME, role: "admin" }, THEM, false).isSuperAdmin).toBe(false);
    expect(resolveAccess({ id: ME, role: "viewer" }, THEM, true).isSuperAdmin).toBe(true);
  });

  it("lets all three flags be true at once", () => {
    // The whole reason this is a set of capabilities and not an ordered enum.
    expect(resolveAccess({ id: ME, role: "admin" }, ME, true)).toEqual({
      isSelf: true,
      isAdmin: true,
      isSuperAdmin: true,
    });
  });
});

describe("isKnownField", () => {
  it("accepts a field present in FIELD_TIERS", () => {
    expect(isKnownField("phone")).toBe(true);
  });

  it("rejects a field absent from FIELD_TIERS", () => {
    expect(isKnownField("salary")).toBe(false);
  });

  it("rejects inherited Object.prototype keys", () => {
    // A bare `in` returns true for these, so PATCH {"toString":"x"} would be
    // treated as a known field and fall through to a tier lookup of undefined.
    expect(isKnownField("toString")).toBe(false);
    expect(isKnownField("constructor")).toBe(false);
    expect(isKnownField("__proto__")).toBe(false);
    // Belt and braces: the map itself has no prototype, so even a lookup that
    // bypassed isKnownField could not resolve an inherited key to a tier.
    expect(Object.getPrototypeOf(FIELD_TIERS)).toBe(null);
  });
});

describe("canWriteField — self tier (phone)", () => {
  it("lets the owner write their own", () => {
    expect(canWriteField("phone", acc({ isSelf: true }))).toBe(true);
  });

  it("refuses a non-admin on someone else's", () => {
    expect(canWriteField("phone", acc({}))).toBe(false);
  });

  it("refuses a plain admin on someone ELSE's", () => {
    // One of the two cases the ordered-tier model got wrong.
    expect(canWriteField("phone", acc({ isAdmin: true }))).toBe(false);
  });

  it("lets a plain admin write their OWN", () => {
    // The other case the ordered-tier model got wrong: an admin viewing their
    // own record must still be able to edit their own phone number.
    expect(canWriteField("phone", acc({ isSelf: true, isAdmin: true }))).toBe(true);
  });

  it("lets a super-admin write anyone's", () => {
    expect(canWriteField("phone", acc({ isSuperAdmin: true }))).toBe(true);
  });
});

describe("canWriteField — admin tier (jobTitle)", () => {
  it("lets an admin write someone else's", () => {
    expect(canWriteField("jobTitle", acc({ isAdmin: true }))).toBe(true);
  });

  it("refuses the owner when they are not an admin", () => {
    // Nobody promotes themselves by editing their own job title.
    expect(canWriteField("jobTitle", acc({ isSelf: true }))).toBe(false);
  });

  it("refuses a non-admin on someone else's", () => {
    expect(canWriteField("jobTitle", acc({}))).toBe(false);
  });

  it("lets a super-admin who is not role-admin write it", () => {
    expect(canWriteField("jobTitle", acc({ isSuperAdmin: true }))).toBe(true);
  });
});

describe("allowsTier — superadmin tier", () => {
  it("admits a super-admin", () => {
    expect(allowsTier("superadmin", acc({ isSuperAdmin: true }))).toBe(true);
  });

  it("refuses a plain admin", () => {
    expect(allowsTier("superadmin", acc({ isAdmin: true }))).toBe(false);
  });

  it("refuses the owner", () => {
    // Pay is super-admin only, read AND write — you cannot read your own.
    expect(allowsTier("superadmin", acc({ isSelf: true }))).toBe(false);
  });
});

```

Count check before running: 6 (`resolveAccess`) + 3 (`isKnownField`) + 5 (self tier) + 4 (admin tier) + 3 (`allowsTier` superadmin) = **21**.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/team/access.test.ts
```

Expected: FAIL — `Failed to resolve import "./access"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/team/access.ts`:

```ts
/**
 * Field-level authorization for the team detail page (spec §4).
 *
 * PURE: no database, no session import, no `next/*`. Routes resolve an Access
 * and pass it in. That is what makes the whole matrix unit-testable and stops
 * each route re-implementing the rules slightly differently.
 */

export type Access = {
  isSelf: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type FieldTier = "self" | "admin" | "superadmin";

/**
 * The single source of truth for who may write what.
 *
 * Null-prototype on purpose: it removes `toString`, `constructor` and
 * `__proto__` from the object entirely, so even a lookup that bypassed
 * isKnownField cannot resolve an inherited key to a tier.
 *
 * Only fields reachable through PATCH /api/team/[userId] appear here. Pay and
 * payment are not per-field — their whole routes are gated on the superadmin
 * tier via allowsTier.
 */
export const FIELD_TIERS: Record<string, FieldTier> = Object.assign(
  Object.create(null) as Record<string, FieldTier>,
  {
    // ── tier 0, columns on `users` ──
    phone: "self",
    slackHandle: "self",
    jobTitle: "admin",
    startDate: "admin",
    employmentStatus: "admin",
    // ── tier 1, columns on `user_profiles` ──
    personalEmail: "self",
    addressLine1: "self",
    addressLine2: "self",
    city: "self",
    postcode: "self",
    addressCountry: "self",
    dateOfBirth: "self",
    emergencyContactName: "self",
    emergencyContactPhone: "self",
    emergencyContactRelation: "self",
  } satisfies Record<string, FieldTier>
);

/** Which table each writable field lands in. Used by PATCH to split the body. */
export const USERS_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "phone",
  "slackHandle",
  "jobTitle",
  "startDate",
  "employmentStatus",
]);

export const PROFILE_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "personalEmail",
  "addressLine1",
  "addressLine2",
  "city",
  "postcode",
  "addressCountry",
  "dateOfBirth",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
]);

/**
 * Three INDEPENDENT capabilities, not an ordered tier (spec D2).
 *
 * `isSuperAdmin` is an explicit argument rather than something read off the
 * session here, because the two callers want different sources: tier-0/tier-1
 * reads can trust the JWT, while every tier-2/tier-3 route re-reads it from the
 * database (ruling F3 — the JWT copy is written at sign-in by auth.ts:37 and is
 * never refreshed, so a revoked super-admin would otherwise keep pay access
 * until they signed out).
 */
export function resolveAccess(
  viewer: { id: string; role: string },
  targetUserId: string,
  isSuperAdmin: boolean
): Access {
  return {
    isSelf: viewer.id === targetUserId,
    isAdmin: viewer.role === "admin",
    isSuperAdmin,
  };
}

/**
 * True only for an OWN property of FIELD_TIERS.
 *
 * `Object.hasOwn`, never a bare `in`: `"toString" in FIELD_TIERS` is true for a
 * normal object literal, so a PATCH body of {"toString":"x"} would be accepted
 * as a known field and then resolve to an undefined tier. tsconfig has
 * lib:[…,"esnext"], so Object.hasOwn typechecks.
 */
export function isKnownField(field: string): boolean {
  return Object.hasOwn(FIELD_TIERS, field);
}

/**
 * The one place a tier is turned into a yes/no. Reads use it too: the
 * `user_profiles` read gate is allowsTier("self", access) and the pay/payment
 * read gate is allowsTier("superadmin", access), so read and write rules can
 * never drift apart.
 */
export function allowsTier(tier: FieldTier, access: Access): boolean {
  switch (tier) {
    case "self":
      return access.isSelf || access.isSuperAdmin;
    case "admin":
      return access.isAdmin || access.isSuperAdmin;
    case "superadmin":
      return access.isSuperAdmin;
  }
}

/**
 * False for an unknown field as well as a forbidden one. Callers MUST test
 * isKnownField first so they can return 400 (unknown) rather than 403
 * (forbidden) — the two answers leak different things and the spec requires
 * both. Nothing is ever silently dropped: a silent drop looks exactly like a
 * successful save.
 */
export function canWriteField(field: string, access: Access): boolean {
  if (!isKnownField(field)) return false;
  return allowsTier(FIELD_TIERS[field], access);
}
```

Create `src/lib/team/access-db.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Reads `users.is_super_admin` straight from the database.
 *
 * Ruling F3: session.user.isSuperAdmin is JWT-sourced — src/lib/auth.ts:28
 * reads it at sign-in, :37 writes it into the token and :85 copies it onto the
 * session, while getAuthSession's authUserColumns (src/lib/auth-db.ts:14-21)
 * deliberately omits it. It is therefore never refreshed, and a revoked
 * super-admin would keep pay and bank-detail access until they signed out.
 *
 * Every route that reads or writes tier-2/tier-3 data calls this instead. It is
 * one indexed primary-key lookup. Kept in its own module so access.ts stays
 * pure and unit-testable.
 */
export async function readIsSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.isSuperAdmin ?? false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/team/access.test.ts
```

**Predicted: 21 tests, 21 passed, 1 file.**

- [ ] **Step 5: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task2.txt 2>&1; wc -l /tmp/tsc-task2.txt
```

Background, ~2 min, read UNFILTERED after the notification. Only `rename-1o8m-keys-to-mf.ts:46` is acceptable.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/lib/team/access.ts src/lib/team/access-db.ts src/lib/team/access.test.ts
```

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/lib/team/access.ts src/lib/team/access-db.ts src/lib/team/access.test.ts && \
git commit -m "feat(team): field-level access control with three independent capabilities

isSelf/isAdmin/isSuperAdmin are a set, not an ordered tier, so an admin can
still edit their own self-tier fields but not someone else's. isSuperAdmin is
an explicit argument (ruling F3) so tier-2/3 routes can pass the DB value
instead of the never-refreshed JWT copy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/lib/team/access.ts src/lib/team/access-db.ts src/lib/team/access.test.ts
```

---

## Task 3: Migration 0090 — schema, SQL, apply script

**Files:**
- Create: `drizzle/migrations/0090_team_user_detail.sql`
- Create: `scripts/_apply-0090.ts`
- Create: `src/lib/db/migrations-0090.test.ts`
- Modify: `src/lib/db/schema.ts` (5 new enums before the `// ─── Users ───` banner at `:98`; 5 new columns inside `users` after `residenceTimezone` at `:134`; 3 new tables after `publicHolidays`' type exports at `:3492`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (all from `@/lib/db/schema`):
  - `employmentStatusEnum`, `contractTypeEnum`, `ratePeriodEnum`, `paymentMethodEnum`, `paymentCadenceEnum`
  - `users.phone`, `users.slackHandle`, `users.jobTitle`, `users.startDate`, `users.employmentStatus`
  - `userProfiles`, `userPayPeriods`, `userPaymentDetails` tables
  - `UserProfile` / `NewUserProfile`, `UserPayPeriod` / `NewUserPayPeriod`, `UserPaymentDetail` / `NewUserPaymentDetail` types

> **DO NOT APPLY THE MIGRATION IN THIS TASK.** Writing the file, the script and the schema mirror is the deliverable. Running `_apply-0090.ts` is a production schema change and needs its own explicit OK from Manu — see Step 8.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/migrations-0090.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0090_team_user_detail.sql"),
  "utf8"
);

describe("0090_team_user_detail.sql", () => {
  it("touches `users` with exactly one ALTER TABLE", () => {
    // One statement means one ACCESS EXCLUSIVE lock acquisition on the table
    // every auth read holds an ACCESS SHARE lock on.
    const alters = SQL.match(/ALTER TABLE "users"/g) ?? [];
    expect(alters).toHaveLength(1);
  });

  it("takes the lock on `users` before creating any table", () => {
    // Each new table's FK to users(id) takes SHARE ROW EXCLUSIVE. Acquiring
    // ACCESS EXCLUSIVE first means those never have to UPGRADE a lock, which
    // is the path that can deadlock against a concurrent reader.
    const alterAt = SQL.indexOf('ALTER TABLE "users"');
    const firstCreateTableAt = SQL.indexOf("CREATE TABLE");
    expect(alterAt).toBeGreaterThan(-1);
    expect(firstCreateTableAt).toBeGreaterThan(-1);
    expect(alterAt).toBeLessThan(firstCreateTableAt);
  });

  it("uses an inclusive bare-effective_to daterange in the EXCLUDE (ruling F4)", () => {
    expect(SQL).toContain("daterange(effective_from, effective_to, '[]')");
    // '[)' would make effective_to exclusive AND would let
    // effective_to = effective_from be an EMPTY range, which never overlaps —
    // defeating the constraint entirely.
    expect(SQL).not.toContain("'[)'");
    // coalesce(…, 'infinity'::date) under '[]' would ask Postgres to
    // canonicalise an inclusive infinite upper bound.
    expect(SQL).not.toContain("infinity");
    expect(SQL).toContain("user_pay_periods_no_overlap");
  });

  it("creates btree_gist idempotently before using gist", () => {
    const extAt = SQL.indexOf("CREATE EXTENSION IF NOT EXISTS btree_gist");
    const gistAt = SQL.indexOf("EXCLUDE USING gist");
    expect(extAt).toBeGreaterThan(-1);
    expect(gistAt).toBeGreaterThan(extAt);
  });

  it("is additive only — no drop, no rename, no delete", () => {
    expect(SQL).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX)/i);
    expect(SQL).not.toMatch(/RENAME\s+(TO|COLUMN)/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\b/i);
    // calendar_events must not appear at all (global constraint).
    expect(SQL).not.toContain("calendar_events");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/db/migrations-0090.test.ts
```

Expected: FAIL — `ENOENT: no such file or directory … 0090_team_user_detail.sql`.

- [ ] **Step 3: Write the migration SQL**

Create `drizzle/migrations/0090_team_user_detail.sql`:

```sql
-- 0090_team_user_detail.sql
--
-- Additive only. Nothing is dropped, renamed or deleted, and calendar_events is
-- untouched. Hand-written: `npm run db:generate` is unusable on this branch
-- (0084-0088 are absent from _journal.json and it emits huge drift), so the
-- house pattern is one bespoke scripts/_apply-00NN.ts per migration.
--
-- STATEMENT ORDER IS LOAD-BEARING:
--   1. CREATE TYPE x5 — takes no lock on "users" at all.
--   2. ONE ALTER TABLE "users" adding all five tier-0 columns. Combined into a
--      single statement so the ACCESS EXCLUSIVE lock on "users" is acquired
--      exactly once, and placed before the CREATE TABLEs because each new
--      table's FOREIGN KEY to users(id) takes SHARE ROW EXCLUSIVE — arriving at
--      those first would mean UPGRADING to ACCESS EXCLUSIVE later, and a lock
--      upgrade can deadlock against a concurrent reader. Taking the strongest
--      lock once, first, removes that path.
--      Adding a NOT NULL column with a CONSTANT default does not rewrite the
--      table on PG11+ (the default is stored in pg_attribute.attmissingval), so
--      this is metadata-only and finishes in microseconds once the lock is won.
--   3. The three new tables, their foreign keys, the index and the EXCLUDE.
--
-- The whole file runs as ONE implicit transaction: _apply-0090.ts sends zero
-- bind parameters, which selects the simple query protocol, so a failure at any
-- point rolls back all of it. There is no half-applied state to clean up.

CREATE TYPE "public"."employment_status" AS ENUM('active', 'inactive', 'alumni');
--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('hourly', 'salaried', 'contractor');
--> statement-breakpoint
CREATE TYPE "public"."rate_period" AS ENUM('hour', 'month', 'year');
--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'wise', 'payoneer', 'paypal', 'other');
--> statement-breakpoint
CREATE TYPE "public"."payment_cadence" AS ENUM('monthly', 'biweekly', 'weekly', 'per_invoice');
--> statement-breakpoint
ALTER TABLE "users"
	ADD COLUMN "phone" varchar(40),
	ADD COLUMN "slack_handle" varchar(80),
	ADD COLUMN "job_title" varchar(120),
	ADD COLUMN "start_date" date,
	ADD COLUMN "employment_status" "public"."employment_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"personal_email" varchar(255),
	"address_line1" varchar(200),
	"address_line2" varchar(200),
	"city" varchar(120),
	"postcode" varchar(20),
	"address_country" char(2),
	"date_of_birth" date,
	"emergency_contact_name" varchar(120),
	"emergency_contact_phone" varchar(40),
	"emergency_contact_relation" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_pay_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"contract_type" "public"."contract_type" NOT NULL,
	"rate_amount" numeric(12, 2) NOT NULL,
	"rate_currency" char(3) NOT NULL,
	"rate_period" "public"."rate_period" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "pay_period_dates_ordered" CHECK ("user_pay_periods"."effective_to" IS NULL OR "user_pay_periods"."effective_to" >= "user_pay_periods"."effective_from"),
	CONSTRAINT "pay_period_rate_non_negative" CHECK ("user_pay_periods"."rate_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_payment_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payment_method" "public"."payment_method",
	"payment_cadence" "public"."payment_cadence",
	"invoices_required" boolean DEFAULT false NOT NULL,
	"payee_name" varchar(200),
	"bank_name" varchar(120),
	"bank_country" char(2),
	"account_identifier_ciphertext" text,
	"account_identifier_last4" varchar(4),
	"tax_id_ciphertext" text,
	"tax_id_last4" varchar(4),
	"key_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_pay_periods" ADD CONSTRAINT "user_pay_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_pay_periods" ADD CONSTRAINT "user_pay_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_payment_details" ADD CONSTRAINT "user_payment_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_payment_details" ADD CONSTRAINT "user_payment_details_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_user_pay_periods_user_from" ON "user_pay_periods" USING btree ("user_id","effective_from");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Ruling F4: '[]' (inclusive) with a BARE effective_to.
--   * '[)' would make effective_to exclusive, so "this rate ran until June 30"
--     would stop applying on June 29.
--   * Worse, under '[)' a period with effective_to = effective_from — which
--     pay_period_dates_ordered permits — is an EMPTY range, and empty ranges
--     never overlap anything, so a zero-length period would slip straight past
--     the one constraint this design exists for.
--   * A NULL upper bound is natively unbounded in Postgres, so no
--     coalesce(…, 'infinity'::date) wrapper is needed — and under '[]' that
--     wrapper would ask Postgres to canonicalise an inclusive infinite bound.
-- This matches Thread E's time_off_no_overlap_per_user in 0087 exactly.
ALTER TABLE "user_pay_periods"
	ADD CONSTRAINT "user_pay_periods_no_overlap"
	EXCLUDE USING gist (
		user_id WITH =,
		daterange(effective_from, effective_to, '[]') WITH &&
	);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/db/migrations-0090.test.ts
```

**Predicted: 5 tests, 5 passed, 1 file.**

- [ ] **Step 5: Mirror the schema in Drizzle**

Three separate edits to `src/lib/db/schema.ts`.

**(a)** Insert the five enums immediately **before** the `// ─── Users ───` banner at `:98`. They must be declared before `users` uses `employmentStatusEnum`:

```ts
// ─── Team user detail enums (migration 0090) ─────────────────────────
// `contract_type` and `rate_period` are separate facts, not one field: a
// contractor can be paid monthly and a salaried person is quoted yearly.
export const employmentStatusEnum = pgEnum("employment_status", [
  "active",
  "inactive",
  "alumni",
]);
export const contractTypeEnum = pgEnum("contract_type", [
  "hourly",
  "salaried",
  "contractor",
]);
export const ratePeriodEnum = pgEnum("rate_period", ["hour", "month", "year"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "wise",
  "payoneer",
  "paypal",
  "other",
]);
export const paymentCadenceEnum = pgEnum("payment_cadence", [
  "monthly",
  "biweekly",
  "weekly",
  "per_invoice",
]);
```

**(b)** Add the five columns inside `users`, immediately after `residenceTimezone: text("residence_timezone"),` at `:134` and before `asanaEmail`. **Do not touch, reflow or shorten the `countryCode` comment at `:114-126` or the `residenceTimezone` comment at `:128-133`:**

```ts
    // ── Tier-0 team-directory fields (migration 0090) ──
    // Deliberately the ONLY new person-data on `users`. Everything more
    // sensitive lives in user_profiles / user_pay_periods /
    // user_payment_details, because the sensitivity tier IS the table
    // boundary (spec D3): GET /api/admin/users did an unprojected
    // select().from(users), so keeping these fields off this table makes the
    // protection structural rather than a code-review habit.
    // `phone` and `slackHandle` are self-tier, the other three admin-tier —
    // see FIELD_TIERS in src/lib/team/access.ts.
    phone: varchar("phone", { length: 40 }),
    slackHandle: varchar("slack_handle", { length: 80 }),
    jobTitle: varchar("job_title", { length: 120 }),
    startDate: date("start_date"),
    // NOT NULL DEFAULT 'active' backfills every existing row to 'active',
    // including the 1o8-era duplicates. They must be set to 'alumni' by hand
    // before the `ilike '%@marketfoundry.agency'` filter can leave /api/team —
    // that removal is a follow-up, not part of this work.
    employmentStatus: employmentStatusEnum("employment_status")
      .notNull()
      .default("active"),
```

**(c)** Append the three tables after `publicHolidays`' type exports at `:3492`, led by the paired-divergence banner. `char`, `date`, `numeric`, `smallint`, `check`, `index`, `pgEnum`, `uuid`, `varchar`, `text`, `boolean`, `timestamp` are all already imported at `:1-24` — **no import edit is needed**:

```ts
// ═══ SQL-ONLY CONSTRAINTS ON THIS BRANCH — READ BEFORE "FIXING" DRIFT ═══
// drizzle-orm@0.45's pg-core ships checks.js and unique-constraint.js but has
// NO exclusion-constraint module, so two EXCLUDE USING gist constraints exist
// in SQL with no Drizzle mirror. Neither is drift. Both are deliberate:
//   1. `time_off_no_overlap_per_user` on time_off_requests (migration 0087) —
//      see the note above the timeOffRequests definition.
//   2. `user_pay_periods_no_overlap` on user_pay_periods (migration 0090) —
//      see the note on userPayPeriods below.
// A schema-drift checker that compares Drizzle to the database WILL flag both.
// ═══════════════════════════════════════════════════════════════════════

// ─── User Profiles (tier 1) ──────────────────────────────────────────
// 1:1 with users. Readable and writable by SELF and SUPER-ADMIN only —
// ordinary admins cannot see it (spec §3.2).
//
// `addressCountry` is deliberately NOT called `country_code`. That name is
// taken on `users` and means something completely different: a POLICY
// assignment of which holiday calendar this person gets (a Manila-based
// person working US hours is assigned 'US'). This column is where they
// physically live. Conflating the two silently changes someone's leave
// allowance, which is why they have different names and visibly different
// UI labels — "Holiday calendar" vs "Country of residence".
//
// GDPR note: date_of_birth and the address are personal data for ES/PT/FI
// staff. Gated to self + super-admin and audited, but NOT encrypted — a
// deliberate proportionality call, unlike the bank/tax identifiers below.
export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  personalEmail: varchar("personal_email", { length: 255 }),
  addressLine1: varchar("address_line1", { length: 200 }),
  addressLine2: varchar("address_line2", { length: 200 }),
  city: varchar("city", { length: 120 }),
  postcode: varchar("postcode", { length: 20 }),
  addressCountry: char("address_country", { length: 2 }),
  dateOfBirth: date("date_of_birth"),
  emergencyContactName: varchar("emergency_contact_name", { length: 120 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 40 }),
  emergencyContactRelation: varchar("emergency_contact_relation", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

// ─── User Pay Periods (tier 2) ───────────────────────────────────────
// 1:N and effective-dated. Super-admin only, read AND write.
// `effectiveTo` NULL means "currently in force".
//
// SQL-only, no Drizzle mirror: migration 0090 also adds
//   EXCLUDE USING gist (user_id WITH =,
//                       daterange(effective_from, effective_to, '[]') WITH &&)
// named `user_pay_periods_no_overlap`. It is what makes "the rate in force on
// date X" a well-defined question rather than a guess between two overlapping
// rows. drizzle-orm 0.45 cannot express it (see the banner above). The
// route-level overlaps() pre-check in the pay-periods handler is the friendly
// fast path; this constraint is the backstop for the read-then-write race that
// no amount of application code can close.
//
// The bound style is INCLUSIVE '[]' with a bare effective_to. '[)' would make
// effective_to exclusive and would let effective_to = effective_from form an
// EMPTY range, which never overlaps and would defeat the constraint.
//
// `rateAmount` is numeric(12,2), which the postgres driver returns as a
// STRING. Keep it a string across every module boundary — parsing to a float
// for display is the UI's job and must never round-trip back into the column.
export const userPayPeriods = pgTable(
  "user_pay_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    contractType: contractTypeEnum("contract_type").notNull(),
    rateAmount: numeric("rate_amount", { precision: 12, scale: 2 }).notNull(),
    rateCurrency: char("rate_currency", { length: 3 }).notNull(),
    ratePeriod: ratePeriodEnum("rate_period").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("idx_user_pay_periods_user_from").on(t.userId, t.effectiveFrom),
    check(
      "pay_period_dates_ordered",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`
    ),
    check("pay_period_rate_non_negative", sql`${t.rateAmount} >= 0`),
  ]
);

export type UserPayPeriod = typeof userPayPeriods.$inferSelect;
export type NewUserPayPeriod = typeof userPayPeriods.$inferInsert;

// ─── User Payment Details (tier 3) ───────────────────────────────────
// 1:1. Super-admin only, read AND write.
//
// The bank account identifier and the tax ID are encrypted app-side with
// AES-256-GCM (src/lib/crypto/pii.ts) because Supabase has no per-column
// encryption and this repo has already shipped one SQL-injection read bug.
// Accepted cost: these two fields can never be searched or sorted.
//
// The `last4` columns are PLAINTEXT on purpose so the masked display
// (••••4821) never needs to decrypt — decryption happens only on an explicit,
// audited POST to the reveal route. `keyVersion` exists so the key can be
// rotated without a schema change.
//
// Ciphertext must NEVER reach the browser. A route test asserts no response
// body contains a `*_ciphertext` key.
export const userPaymentDetails = pgTable("user_payment_details", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paymentMethod: paymentMethodEnum("payment_method"),
  paymentCadence: paymentCadenceEnum("payment_cadence"),
  invoicesRequired: boolean("invoices_required").notNull().default(false),
  payeeName: varchar("payee_name", { length: 200 }),
  bankName: varchar("bank_name", { length: 120 }),
  bankCountry: char("bank_country", { length: 2 }),
  accountIdentifierCiphertext: text("account_identifier_ciphertext"),
  accountIdentifierLast4: varchar("account_identifier_last4", { length: 4 }),
  taxIdCiphertext: text("tax_id_ciphertext"),
  taxIdLast4: varchar("tax_id_last4", { length: 4 }),
  keyVersion: smallint("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type UserPaymentDetail = typeof userPaymentDetails.$inferSelect;
export type NewUserPaymentDetail = typeof userPaymentDetails.$inferInsert;
```

- [ ] **Step 6: Write the apply script**

Create `scripts/_apply-0090.ts` as a copy of `scripts/_apply-0088.ts` with only the filename and the verification block changed. Keep `config({ path: ".env.local" })` at module top with the dynamic `await import("postgres")` **inside** `main()` — ESM hoists static imports ahead of every module-level statement, and postgres.js connects lazily, so a static import would silently point at `localhost:5432` with no error. Keep `pgError`, `MAX_ATTEMPTS = 6`, `RETRY_DELAY_MS = 4000`, the `SET LOCAL lock_timeout = '3s'` prefix, the `55P03`/`57014`-only retry predicate, and the `ddlCommitted` flag verbatim.

Replace only these two regions:

```ts
    const migSql = fs.default.readFileSync(
      "./drizzle/migrations/0090_team_user_detail.sql",
      "utf8"
    );
```

and the verification block between the retry loop and `console.log("0090 applied OK.")`:

```ts
    // ── Verification. Everything below runs AFTER the DDL has committed. ──

    const newCols = await sql`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('phone','slack_handle','job_title','start_date','employment_status')
      ORDER BY column_name
    `;
    console.log("new users columns:", newCols);
    if (newCols.length !== 5) {
      throw new Error(`expected 5 new users columns, found ${newCols.length}`);
    }

    // Additive-only guard: the columns this branch REUSES must be untouched.
    const kept = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('country_code','residence_timezone','client_id_code','is_super_admin')
    `;
    if (kept.length !== 4) {
      throw new Error(
        "an existing users column went missing — 0090 must be additive"
      );
    }

    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('user_profiles','user_pay_periods','user_payment_details')
      ORDER BY table_name
    `;
    console.log("new tables:", tables);
    if (tables.length !== 3) {
      throw new Error(`expected 3 new tables, found ${tables.length}`);
    }

    // The EXCLUDE constraint is the whole point of the pay-period table, and it
    // is invisible to Drizzle, so verify it explicitly. contype 'x' = exclusion.
    const excl = await sql`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'user_pay_periods_no_overlap' AND contype = 'x'
    `;
    console.log("exclusion constraint:", excl);
    if (excl.length !== 1) {
      throw new Error("user_pay_periods_no_overlap is missing");
    }
    // Ruling F4 — prove the bound style actually landed inclusive.
    if (!String(excl[0].def).includes("'[]'")) {
      throw new Error(
        `user_pay_periods_no_overlap is not inclusive: ${excl[0].def}`
      );
    }

    const types = await sql`
      SELECT typname FROM pg_type
      WHERE typname IN ('employment_status','contract_type','rate_period','payment_method','payment_cadence')
      ORDER BY typname
    `;
    if (types.length !== 5) {
      throw new Error(`expected 5 new enum types, found ${types.length}`);
    }

    console.log("0090 applied OK.");
```

Also change the two `0088_user_residence_timezone.sql` strings in the log lines and the final `console.error` guidance to `0090`.

- [ ] **Step 7: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task3.txt 2>&1; wc -l /tmp/tsc-task3.txt
```

Background, ~2 min, read UNFILTERED after the notification. Only `rename-1o8m-keys-to-mf.ts:46` is acceptable. A `sql` or `check` "not defined" error here means step 5(c) landed outside the file's import scope — fix it before continuing.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/lib/db/schema.ts scripts/_apply-0090.ts src/lib/db/migrations-0090.test.ts
```

Re-run the guard test after the schema edits to prove nothing in the SQL moved:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/db/migrations-0090.test.ts
```

**Predicted: 5 tests, 5 passed.**

- [ ] **Step 8: STOP — ask Manu for explicit OK to apply**

Do not run the script. Present this and wait:

> 0090 is written and verified as a file. Applying it is a production schema
> change: 5 new nullable-or-defaulted columns on `users`, 3 new tables, 5 new
> enum types, 1 exclusion constraint. It is additive — nothing is dropped,
> renamed or deleted, and `calendar_events` is untouched. It needs
> `DIRECT_DATABASE_URL` in this worktree's `.env.local` (Task 0 step 1).
> May I run `npx tsx scripts/_apply-0090.ts`?

On an explicit yes, and only then:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx tsx scripts/_apply-0090.ts
```

Read the whole output. If it prints `DDL COMMITTED SUCCESSFULLY. A verification query then failed.` **do not rerun** — the migration is applied and only a check failed.

- [ ] **Step 9: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add drizzle/migrations/0090_team_user_detail.sql scripts/_apply-0090.ts src/lib/db/schema.ts src/lib/db/migrations-0090.test.ts && \
git commit -m "feat(team): migration 0090 — tier-0 user columns plus profile, pay and payment tables

One combined ALTER TABLE on users, placed before the CREATE TABLEs so the
ACCESS EXCLUSIVE lock is taken once and the new tables' foreign keys never
have to upgrade a lock. The pay-period non-overlap guarantee is an EXCLUDE
USING gist constraint with an inclusive bare-effective_to daterange (ruling
F4); it is the second SQL-only constraint on this branch and both are named
in a schema banner so neither reads as drift.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- drizzle/migrations/0090_team_user_detail.sql scripts/_apply-0090.ts src/lib/db/schema.ts src/lib/db/migrations-0090.test.ts
```

---

## Task 4: Extend `/api/team`, tighten `/api/admin/users`, fix two stale 400 messages

**Files:**
- Modify: `src/app/api/team/route.ts` (projection at `:26-37`, filter at `:37`)
- Modify: `src/app/api/admin/users/route.ts:17`
- Modify: `src/app/api/holidays/route.ts:38` and `:82`
- Test: `src/app/api/team/route.test.ts` (new), `src/app/api/admin/users/route.test.ts`, `src/app/api/holidays/route.test.ts`

**Interfaces:**
- Consumes: `users.jobTitle`, `users.employmentStatus`, `users.phone`, `users.slackHandle` from Task 3.
- Produces: `GET /api/team` now returns `{ id, name, email, asanaEmail, image, role, clientIdCode, jobTitle, employmentStatus, phone, slackHandle }[]`, filtered to active MarketFoundry staff. The `/team` directory page (Task 9) consumes exactly this.

- [ ] **Step 1: Check whether the two shared test files already exist**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && ls -1 src/app/api/team/route.test.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.test.ts 2>&1
```

For any file that already exists, **append** the new `describe` block rather than creating the file, and add its existing test count to the prediction before running. For any that does not, create it with the content below. Record the pre-existing counts:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/app/api/admin/users/route.test.ts src/app/api/holidays/route.test.ts 2>&1 | tail -20
```

(If a file does not exist, vitest reports no matching file for it — that is the "create" case, not a failure.)

- [ ] **Step 2: Write the failing tests**

Create `src/app/api/team/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * Every field GET /api/team is allowed to return. Tier-0 only: proxy.ts blocks
 * client and prospect roles from /api/* outside a fixed allowlist and /api/team
 * is on neither list, but this route is still readable by every internal role,
 * so anything above tier 0 appearing here is a leak.
 */
const TIER0_ALLOWLIST = new Set([
  "id",
  "name",
  "email",
  "asanaEmail",
  "image",
  "role",
  "clientIdCode",
  "jobTitle",
  "employmentStatus",
  "phone",
  "slackHandle",
]);

let whereSpy: ReturnType<typeof vi.fn>;

function mockSelect(rows: unknown[]) {
  whereSpy = vi.fn().mockResolvedValue(rows);
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: whereSpy,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "u1", role: "editor", email: "jo@marketfoundry.agency" },
  });
  mockSelect([]);
});

describe("GET /api/team", () => {
  it("401s without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("projects the four new directory fields", async () => {
    await GET();
    const projection = asMock(db.select).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(projection)).toEqual(
      expect.arrayContaining(["jobTitle", "employmentStatus", "phone", "slackHandle"])
    );
  });

  it("projects nothing outside the tier-0 allowlist", async () => {
    await GET();
    const projection = asMock(db.select).mock.calls[0][0] as Record<string, unknown>;
    const leaked = Object.keys(projection).filter((k) => !TIER0_ALLOWLIST.has(k));
    expect(leaked).toEqual([]);
  });

  it("combines both filters into a single where() call", async () => {
    // Drizzle's .where() REPLACES rather than ANDs, so chaining a second call
    // would silently drop the email filter and expose the 1o8-era duplicates.
    await GET();
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy.mock.calls[0][0]).toBeDefined();
  });
});
```

Create (or append to) `src/app/api/admin/users/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** Exactly the fields the /admin/users page's `User` type consumes. */
const EXPECTED = [
  "id",
  "email",
  "name",
  "image",
  "role",
  "isSuperAdmin",
  "allowedSections",
  "clientIdCode",
  "asanaEmail",
  "countryCode",
  "residenceTimezone",
  "lastLoginAt",
  "createdAt",
];

beforeEach(() => {
  vi.clearAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "a1", role: "admin", email: "admin@marketfoundry.agency" },
  });
  asMock(db.select).mockReturnValue({ from: vi.fn().mockResolvedValue([]) });
});

describe("GET /api/admin/users projection", () => {
  it("projects exactly the 13 fields the page consumes and nothing more", async () => {
    // This route used to be an unprojected select().from(users). Migration
    // 0090 adds five columns to `users`, and an unprojected select would ship
    // every future column to the browser by default. Tier-0 fields are safe
    // here; the unprojected habit is what makes the NEXT field unsafe.
    await GET();
    const projection = asMock(db.select).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual([...EXPECTED].sort());
  });
});
```

Create (or append to) `src/app/api/holidays/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { VALID_COUNTRY_CODES } from "@/lib/constants";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function getReq(url: string) {
  const req = new Request(url);
  return Object.assign(req, {
    nextUrl: new URL(url),
  }) as unknown as import("next/server").NextRequest;
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/holidays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "a1", role: "admin", email: "admin@marketfoundry.agency" },
  });
});

describe("holiday 400 messages name every valid code", () => {
  it("GET names all six codes, not the stale three", async () => {
    const res = await GET(getReq("http://localhost/api/holidays?country=ZZ"));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    for (const code of VALID_COUNTRY_CODES) expect(error).toContain(code);
  });

  it("POST names all six codes, not the stale three", async () => {
    const res = await POST(postReq({ countryCode: "ZZ", holidayDate: "2026-01-01", name: "x" }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    for (const code of VALID_COUNTRY_CODES) expect(error).toContain(code);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/app/api/team/route.test.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.test.ts
```

Expected failures: the team projection tests fail on missing keys; the admin-users test fails because `db.select` is called with no argument (`mock.calls[0][0]` is `undefined`); both holiday tests fail because the message says `"US, PK, ES"` and does not contain `PT`.

- [ ] **Step 4: Extend `GET /api/team`**

In `src/app/api/team/route.ts`, change the import at `:2` to `import { and, eq, ilike } from "drizzle-orm";` and replace the query at `:26-37`:

```ts
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      asanaEmail: users.asanaEmail,
      image: users.image,
      role: users.role,
      clientIdCode: users.clientIdCode,
      jobTitle: users.jobTitle,
      employmentStatus: users.employmentStatus,
      phone: users.phone,
      slackHandle: users.slackHandle,
    })
    .from(users)
    // BOTH filters in ONE where(). Drizzle's .where() REPLACES the previous
    // predicate rather than ANDing with it, so chaining a second call would
    // silently drop the email filter and let the 1o8-era duplicates back into
    // every team picker.
    //
    // employment_status is the long-term filter, but the ilike STAYS until
    // every row has a status set by hand: 0090 defaults every existing row to
    // 'active', including the duplicates, so dropping the ilike today would
    // undo the rebrand cleanup. Removing it is a follow-up.
    .where(
      and(
        ilike(users.email, "%@marketfoundry.agency"),
        eq(users.employmentStatus, "active")
      )
    );
```

Extend the JSDoc at `:9-19` with one line, leaving the existing text intact:

```
 * Extended by migration 0090 with the tier-0 directory fields (job title,
 * employment status, phone, Slack handle) consumed by /team. Nothing above
 * tier 0 may be added here — see spec D3.
```

- [ ] **Step 5: Tighten `GET /api/admin/users`**

Replace `src/app/api/admin/users/route.ts:17`:

```ts
  // Explicit projection, not select(). Migration 0090 adds five columns to
  // `users`, and an unprojected select ships every future column to the
  // browser by default. These are exactly the 13 fields the page's `User` type
  // consumes — add nothing here (spec D10).
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
      allowedSections: users.allowedSections,
      clientIdCode: users.clientIdCode,
      asanaEmail: users.asanaEmail,
      countryCode: users.countryCode,
      residenceTimezone: users.residenceTimezone,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users);
```

- [ ] **Step 6: Fix both stale holiday messages**

`src/app/api/holidays/route.ts` — add `VALID_COUNTRY_CODES` to the existing import at `:6`:

```ts
import { isCountryCode, VALID_COUNTRY_CODES } from "@/lib/constants";
```

Replace the string at `:38`:

```ts
      { error: `country must be one of ${VALID_COUNTRY_CODES.join(", ")}` },
```

Replace the string at `:82`:

```ts
      { error: `countryCode must be one of ${VALID_COUNTRY_CODES.join(", ")}` },
```

Both are now derived from the constant, matching the pattern already used at `admin/users/route.ts:165`, so growing the calendar list can never leave a message lying about what is accepted.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/app/api/team/route.test.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.test.ts
```

**Predicted: 7 new tests passing** — 4 in `team/route.test.ts`, 1 in `admin/users/route.test.ts`, 2 in `holidays/route.test.ts`. If Step 1 found pre-existing tests in either shared file, add those counts and expect the total; **every pre-existing test must still pass.**

- [ ] **Step 8: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task4.txt 2>&1; wc -l /tmp/tsc-task4.txt
```

Background, ~2 min, UNFILTERED, judged by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/app/api/team/route.ts src/app/api/team/route.test.ts src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.ts src/app/api/holidays/route.test.ts
```

- [ ] **Step 9: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/app/api/team/route.ts src/app/api/team/route.test.ts src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.ts src/app/api/holidays/route.test.ts && \
git commit -m "feat(team): extend GET /api/team, project GET /api/admin/users, fix stale country 400s

/api/team gains the four tier-0 directory fields and an active-status filter
combined into the SAME where() call, because drizzle's .where() replaces
rather than ANDs. /api/admin/users drops its unprojected select() for the 13
fields the page actually consumes. Both holiday 400 messages now derive from
VALID_COUNTRY_CODES instead of naming a stale three.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/app/api/team/route.ts src/app/api/team/route.test.ts src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts src/app/api/holidays/route.ts src/app/api/holidays/route.test.ts
```

---

## Task 5: `GET` and `PATCH /api/team/[userId]`

**Files:**
- Create: `src/app/api/team/[userId]/route.ts`
- Test: `src/app/api/team/[userId]/route.test.ts`

**Interfaces:**
- Consumes: `resolveAccess`, `allowsTier`, `isKnownField`, `canWriteField`, `USERS_PATCH_FIELDS`, `PROFILE_PATCH_FIELDS` (Task 2); `readIsSuperAdmin` (Task 2); `userProfiles`, `userPayPeriods`, `userPaymentDetails` (Task 3); `isDateString` from `@/lib/time-off/working-days`.
- Produces the payload the detail page (Tasks 10–12) consumes:

```ts
type TeamUserPayload = {
  user: {
    id: string; name: string | null; email: string; image: string | null;
    role: string; clientIdCode: string | null;
    jobTitle: string | null; startDate: string | null;
    employmentStatus: "active" | "inactive" | "alumni";
    phone: string | null; slackHandle: string | null;
    countryCode: string | null; residenceTimezone: string | null;
    lastLoginAt: string | null; createdAt: string;
  };
  access: { isSelf: boolean; isAdmin: boolean; isSuperAdmin: boolean };
  profile?: UserProfile | null;          // only when isSelf || isSuperAdmin
  pay?: UserPayPeriod[];                 // only when isSuperAdmin
  payment?: MaskedPayment | null;        // only when isSuperAdmin
};

type MaskedPayment = {
  paymentMethod: string | null; paymentCadence: string | null;
  invoicesRequired: boolean; payeeName: string | null;
  bankName: string | null; bankCountry: string | null;
  accountIdentifierLast4: string | null; taxIdLast4: string | null;
  keyVersion: number;
  hasAccountIdentifier: boolean; hasTaxId: boolean;
};
```

- [ ] **Step 1: Write the failing test**

Create `src/app/api/team/[userId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  // after() needs a live request scope; the audit assertion targets
  // logEventAsync's arguments instead.
  return { ...actual, after: vi.fn() };
});

import { GET, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { logEventAsync } from "@/lib/event-logger";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const TARGET_ROW = {
  id: THEM,
  name: "Amir Zeb",
  email: "amir@marketfoundry.agency",
  image: null,
  role: "editor",
  clientIdCode: "1o8-marketplace",
  jobTitle: "PPC Specialist",
  startDate: "2024-03-01",
  employmentStatus: "active",
  phone: "+92 300 0000000",
  slackHandle: "@amir",
  countryCode: "PK",
  residenceTimezone: "Asia/Karachi",
  lastLoginAt: null,
  createdAt: "2024-03-01T00:00:00.000Z",
};

const PROFILE_ROW = { userId: THEM, personalEmail: "a@example.com", city: "Karachi" };
const PAY_ROWS = [
  { id: "p1", userId: THEM, effectiveFrom: "2025-01-01", effectiveTo: null, rateAmount: "40.00" },
];
const PAYMENT_ROW = {
  userId: THEM,
  paymentMethod: "wise",
  paymentCadence: "monthly",
  invoicesRequired: true,
  payeeName: "Amir Zeb",
  bankName: "Meezan",
  bankCountry: "PK",
  accountIdentifierCiphertext: "SUPER-SECRET-CIPHERTEXT",
  accountIdentifierLast4: "4821",
  taxIdCiphertext: "ANOTHER-SECRET",
  taxIdLast4: "9931",
  keyVersion: 1,
};

/**
 * Resolves each db.select() in call order. GET's order is:
 *   1. the target users row
 *   2. user_profiles   (only when isSelf || isSuperAdmin)
 *   3. user_pay_periods, 4. user_payment_details (only when isSuperAdmin)
 * readIsSuperAdmin is mocked separately and consumes no slot.
 */
function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function patchReq(body: unknown) {
  return new Request("http://localhost/api/team/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function getReq() {
  return new Request("http://localhost/api/team/x") as unknown as import("next/server").NextRequest;
}

/** Signs in as `id` with `role`; `isSuperAdmin` is what the DB will report. */
function signIn(id: string, role: string, isSuperAdmin = false) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id, role, email: `${id}@marketfoundry.agency`, name: "Viewer" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn(ME, "editor", false);
  queueSelects([TARGET_ROW]);
  asMock(db.update).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  });
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
});

describe("GET /api/team/[userId]", () => {
  it("401s without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(401);
  });

  it("404s for a user that does not exist", async () => {
    queueSelects([]);
    const res = await GET(getReq(), ctx(THEM));
    expect(res.status).toBe(404);
  });

  it("omits profile, pay and payment for a viewer who is neither self nor super-admin", async () => {
    signIn(ME, "admin", false); // a plain admin still cannot see tier 1
    queueSelects([TARGET_ROW]);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    // Omitted, NOT rendered locked — a greyed-out box tells an admin there is
    // something to go looking for (spec §5).
    expect(body).not.toHaveProperty("profile");
    expect(body).not.toHaveProperty("pay");
    expect(body).not.toHaveProperty("payment");
    expect(body.user.id).toBe(THEM);
  });

  it("includes profile for the target themselves", async () => {
    signIn(THEM, "editor", false);
    queueSelects([TARGET_ROW], [PROFILE_ROW]);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.profile).toMatchObject({ city: "Karachi" });
    expect(body).not.toHaveProperty("pay"); // you cannot read your own pay
  });

  it("includes pay and payment for a super-admin", async () => {
    signIn(ME, "viewer", true);
    queueSelects([TARGET_ROW], [PROFILE_ROW], PAY_ROWS, [PAYMENT_ROW]);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(body.pay).toHaveLength(1);
    expect(body.payment.accountIdentifierLast4).toBe("4821");
    expect(body.payment.hasAccountIdentifier).toBe(true);
  });

  it("never puts ciphertext in the response body", async () => {
    signIn(ME, "viewer", true);
    queueSelects([TARGET_ROW], [PROFILE_ROW], PAY_ROWS, [PAYMENT_ROW]);
    const raw = await (await GET(getReq(), ctx(THEM))).text();
    expect(raw).not.toContain("Ciphertext");
    expect(raw).not.toContain("SUPER-SECRET-CIPHERTEXT");
    expect(raw).not.toContain("ANOTHER-SECRET");
  });

  it("trusts the database over the session for isSuperAdmin (ruling F3)", async () => {
    // The session flag is JWT-sourced and never refreshed, so a revoked
    // super-admin would otherwise keep pay access until they signed out.
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "viewer", email: "me@marketfoundry.agency", isSuperAdmin: true },
    });
    asMock(readIsSuperAdmin).mockResolvedValue(false);
    queueSelects([TARGET_ROW]);
    const body = await (await GET(getReq(), ctx(THEM))).json();
    expect(readIsSuperAdmin).toHaveBeenCalledWith(ME);
    expect(body).not.toHaveProperty("pay");
    expect(body.access.isSuperAdmin).toBe(false);
  });
});

describe("PATCH /api/team/[userId]", () => {
  it("400s for fields absent from FIELD_TIERS, including inherited keys", async () => {
    for (const field of ["salary", "toString", "__proto__", "constructor"]) {
      queueSelects([TARGET_ROW]);
      signIn(ME, "admin", true);
      const res = await PATCH(patchReq({ [field]: "x" }), ctx(THEM));
      expect(res.status, `field ${field}`).toBe(400);
      expect(db.update).not.toHaveBeenCalled();
    }
  });

  it("400s for a known field carrying an invalid value", async () => {
    signIn(ME, "admin", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ employmentStatus: "retired" }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("403s when a plain admin edits someone ELSE'S self-tier field", async () => {
    signIn(ME, "admin", false);
    queueSelects([TARGET_ROW]);
    const res = await PATCH(patchReq({ phone: "+1 555 0000" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets a plain admin edit their OWN self-tier field", async () => {
    signIn(ME, "admin", false);
    queueSelects([{ ...TARGET_ROW, id: ME }]);
    const res = await PATCH(patchReq({ phone: "+1 555 0000" }), ctx(ME));
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("audits changed field NAMES only, never their values", async () => {
    signIn(ME, "admin", false);
    queueSelects([TARGET_ROW]);
    await PATCH(patchReq({ jobTitle: "Head of PPC" }), ctx(THEM));
    const logged = asMock(logEventAsync).mock.calls[0][0];
    expect(logged.action).toBe("user:profile:update");
    expect(logged.resourceId).toBe(THEM);
    expect(logged.detail).toEqual({ fields: ["jobTitle"] });
    expect(JSON.stringify(logged)).not.toContain("Head of PPC");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/route.test.ts"
```

Quote the path — the square brackets are a glob character in bash. Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/team/[userId]/route.ts`:

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  users,
  userProfiles,
  userPayPeriods,
  userPaymentDetails,
} from "@/lib/db/schema";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import {
  allowsTier,
  canWriteField,
  isKnownField,
  resolveAccess,
  PROFILE_PATCH_FIELDS,
  USERS_PATCH_FIELDS,
} from "@/lib/team/access";
import { isDateString } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tier-0 columns. Everything sensitive lives in the other three tables. */
const tier0 = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
  role: users.role,
  clientIdCode: users.clientIdCode,
  jobTitle: users.jobTitle,
  startDate: users.startDate,
  employmentStatus: users.employmentStatus,
  phone: users.phone,
  slackHandle: users.slackHandle,
  countryCode: users.countryCode,
  residenceTimezone: users.residenceTimezone,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

/**
 * Builds the payment block as an EXPLICIT allowlist rather than by destructuring
 * the ciphertext columns out. A rest-spread would silently ship any ciphertext
 * column added later; an allowlist fails closed instead.
 */
function maskPayment(row: typeof userPaymentDetails.$inferSelect) {
  return {
    paymentMethod: row.paymentMethod,
    paymentCadence: row.paymentCadence,
    invoicesRequired: row.invoicesRequired,
    payeeName: row.payeeName,
    bankName: row.bankName,
    bankCountry: row.bankCountry,
    accountIdentifierLast4: row.accountIdentifierLast4,
    taxIdLast4: row.taxIdLast4,
    keyVersion: row.keyVersion,
    // So the UI can show a Reveal button without ever seeing the ciphertext.
    hasAccountIdentifier: row.accountIdentifierCiphertext !== null,
    hasTaxId: row.taxIdCiphertext !== null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  const [target] = await db
    .select(tier0)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Ruling F3: the database, not the JWT. This route returns the pay and
  // payment blocks, so it is a tier-2/tier-3 read and gets the same treatment
  // as the write routes.
  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    userId,
    isSuperAdmin
  );

  const payload: Record<string, unknown> = { user: target, access };

  if (allowsTier("self", access)) {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    payload.profile = profile ?? null;
  }

  if (allowsTier("superadmin", access)) {
    payload.pay = await db
      .select()
      .from(userPayPeriods)
      .where(eq(userPayPeriods.userId, userId))
      .orderBy(desc(userPayPeriods.effectiveFrom));
    const [payment] = await db
      .select()
      .from(userPaymentDetails)
      .where(eq(userPaymentDetails.userId, userId))
      .limit(1);
    payload.payment = payment ? maskPayment(payment) : null;
  }

  return NextResponse.json(payload);
}

const EMPLOYMENT_STATUSES = new Set(["active", "inactive", "alumni"]);

/**
 * Returns an error message, or null when the value is acceptable.
 *
 * Without this a bad enum value reaches Postgres and surfaces as a 500, which
 * reads to the user as "the app is broken" rather than "that is not a status".
 */
function validateValue(field: string, value: unknown): string | null {
  if (field === "employmentStatus") {
    return typeof value === "string" && EMPLOYMENT_STATUSES.has(value)
      ? null
      : "employmentStatus must be one of active, inactive, alumni";
  }
  if (value === null) return null; // every other field is nullable
  if (field === "startDate" || field === "dateOfBirth") {
    return isDateString(value)
      ? null
      : `${field} must be a valid date in YYYY-MM-DD format`;
  }
  if (field === "addressCountry") {
    return typeof value === "string" && /^[A-Za-z]{2}$/.test(value)
      ? null
      : "addressCountry must be a two-letter country code";
  }
  return typeof value === "string" ? null : `${field} must be a string or null`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    userId,
    isSuperAdmin
  );

  // 400 before 403, and both before any write. An unknown key is a client bug;
  // a known key the caller may not write is an authorization answer. Nothing is
  // silently dropped — a silent drop looks exactly like a successful save.
  const unknown = keys.filter((k) => !isKnownField(k));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  const forbidden = keys.filter((k) => !canWriteField(k, access));
  if (forbidden.length > 0) {
    return NextResponse.json(
      { error: `Not permitted to edit: ${forbidden.join(", ")}` },
      { status: 403 }
    );
  }

  for (const k of keys) {
    const problem = validateValue(k, patch[k]);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const userUpdates: Record<string, unknown> = {};
  const profileUpdates: Record<string, unknown> = {};
  for (const k of keys) {
    if (USERS_PATCH_FIELDS.has(k)) userUpdates[k] = patch[k];
    else if (PROFILE_PATCH_FIELDS.has(k)) profileUpdates[k] = patch[k];
  }

  if (Object.keys(userUpdates).length > 0) {
    await db
      .update(users)
      .set({ ...userUpdates, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  if (Object.keys(profileUpdates).length > 0) {
    // Upsert: the row may not exist yet — user_profiles is populated lazily on
    // the first edit rather than backfilled for all 67 users by the migration.
    await db
      .insert(userProfiles)
      .values({ userId, ...profileUpdates })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { ...profileUpdates, updatedAt: new Date() },
      });
  }

  after(
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      section: "admin",
      action: "user:profile:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      resourceLabel: target.email,
      // Field NAMES only. Tier-1 values (home address, date of birth) must
      // never be copied into admin_event_log, which ordinary admins can read.
      detail: { fields: keys },
    })
  );

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/route.test.ts"
```

**Predicted: 12 tests, 12 passed, 1 file.**

- [ ] **Step 5: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task5.txt 2>&1; wc -l /tmp/tsc-task5.txt
```

Background, ~2 min, UNFILTERED, by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint "src/app/api/team/[userId]/route.ts" "src/app/api/team/[userId]/route.test.ts"
```

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add "src/app/api/team/[userId]/route.ts" "src/app/api/team/[userId]/route.test.ts" && \
git commit -m "feat(team): GET and PATCH /api/team/[userId] with tiered payload

Blocks the viewer's tier does not permit are OMITTED, not rendered locked.
isSuperAdmin is re-read from the database (ruling F3) because this GET returns
the pay and payment blocks. Unknown PATCH keys 400 and forbidden keys 403,
both before any write; the audit log records field names only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- "src/app/api/team/[userId]/route.ts" "src/app/api/team/[userId]/route.test.ts"
```

---

## Task 6: Pay-period CRUD

**Files:**
- Create: `src/lib/team/guards.ts`
- Create: `src/app/api/team/[userId]/pay-periods/route.ts` (`GET`, `POST`)
- Create: `src/app/api/team/[userId]/pay-periods/[periodId]/route.ts` (`PATCH`, `DELETE`)
- Test: `src/app/api/team/[userId]/pay-periods/route.test.ts`

**Interfaces:**
- Consumes: `allowsTier`, `resolveAccess`, `FieldTier` (Task 2); `readIsSuperAdmin` (Task 2); `userPayPeriods` (Task 3); `overlaps` and `isDateString` from `@/lib/time-off/working-days`.
- Produces:
  - `async function requireTier(tier: FieldTier, targetUserId: string): Promise<GuardResult>` from `src/lib/team/guards.ts`, reused by Task 7.
  - `GET` → `UserPayPeriod[]`, newest first. `POST` → the created row, 201.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/team/[userId]/pay-periods/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { GET, POST } from "./route";
import { DELETE } from "./[periodId]/route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

const EXISTING = [
  {
    id: "p1",
    userId: THEM,
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
    contractType: "hourly",
    rateAmount: "40.00",
    rateCurrency: "USD",
    ratePeriod: "hour",
    note: null,
  },
];

const VALID_BODY = {
  effectiveFrom: "2025-07-01",
  effectiveTo: null,
  contractType: "salaried",
  rateAmount: "5200.00",
  rateCurrency: "EUR",
  ratePeriod: "month",
  note: "Promotion",
};

function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function periodCtx(userId: string, periodId: string) {
  return { params: Promise.resolve({ userId, periodId }) };
}

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/team/x/pay-periods", {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

function signIn(role: string, isSuperAdmin: boolean) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: ME, role, email: "me@marketfoundry.agency", name: "Me" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

function mockInsertOk() {
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "p2", ...VALID_BODY, userId: THEM }]),
  });
}

/** Makes the INSERT reject with a real-shaped exclusion violation. */
function mockInsertExclusionViolation() {
  const err = Object.assign(new Error("conflicting key value violates exclusion constraint"), {
    code: "23P01",
  });
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockRejectedValue(err),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn("admin", true);
  queueSelects(EXISTING);
  mockInsertOk();
});

describe("pay-period access", () => {
  it("403s a plain admin who is not a super-admin", async () => {
    signIn("admin", false);
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("403s when the session claims super-admin but the database says no", async () => {
    // Ruling F3 — the JWT copy is written at sign-in and never refreshed.
    asMock(getAuthSession).mockResolvedValue({
      user: { id: ME, role: "admin", email: "me@marketfoundry.agency", isSuperAdmin: true },
    });
    asMock(readIsSuperAdmin).mockResolvedValue(false);
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("403s DELETE for a non-super-admin", async () => {
    signIn("admin", false);
    const res = await DELETE(req("DELETE"), periodCtx(THEM, "p1"));
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("GET pay periods", () => {
  it("returns the periods for a super-admin", async () => {
    const res = await GET(req("GET"), ctx(THEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("POST pay period", () => {
  it("400s a malformed date", async () => {
    const res = await POST(req("POST", { ...VALID_BODY, effectiveFrom: "01/07/2025" }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s when effectiveTo precedes effectiveFrom", async () => {
    const res = await POST(
      req("POST", { ...VALID_BODY, effectiveFrom: "2025-07-01", effectiveTo: "2025-06-01" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("409s on an overlap the pre-check can see, without touching the database", async () => {
    // 2025-06-30 is the inclusive end of the existing period, so a new period
    // starting that day overlaps by exactly one day.
    const res = await POST(req("POST", { ...VALID_BODY, effectiveFrom: "2025-06-30" }), ctx(THEM));
    expect(res.status).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("409s when Postgres raises SQLSTATE 23P01", async () => {
    // The race the pre-check cannot see: two concurrent POSTs both read an
    // empty conflict set before either writes. The EXCLUDE constraint is the
    // only thing that closes it, and its error must not surface as a 500.
    queueSelects([]);
    mockInsertExclusionViolation();
    const res = await POST(req("POST", VALID_BODY), ctx(THEM));
    expect(res.status).toBe(409);
  });

  it("201s on a clean insert", async () => {
    queueSelects([]);
    const res = await POST(req("POST", VALID_BODY), ctx(THEM));
    expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/pay-periods/route.test.ts"
```

Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the shared guard**

Create `src/lib/team/guards.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { readIsSuperAdmin } from "./access-db";
import { allowsTier, resolveAccess, type Access, type FieldTier } from "./access";

export type GuardResult =
  | {
      ok: true;
      session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
      access: Access;
    }
  | { ok: false; response: NextResponse };

/**
 * Session + tier gate for whole-route authorization, as opposed to the
 * per-field canWriteField used by PATCH /api/team/[userId].
 *
 * ALWAYS resolves isSuperAdmin from the database (ruling F3). Every caller of
 * this helper is a tier-2 or tier-3 route, which is exactly the set that must
 * not trust the never-refreshed JWT flag.
 */
export async function requireTier(
  tier: FieldTier,
  targetUserId: string
): Promise<GuardResult> {
  const session = await getAuthSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    targetUserId,
    isSuperAdmin
  );
  if (!allowsTier(tier, access)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session, access };
}
```

- [ ] **Step 4: Write the collection route**

Create `src/app/api/team/[userId]/pay-periods/route.ts`:

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPayPeriods } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { isDateString, overlaps } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_TYPES = new Set(["hourly", "salaried", "contractor"]);
const RATE_PERIODS = new Set(["hour", "month", "year"]);

/**
 * The sentinel used ONLY for the in-memory overlap pre-check. A NULL
 * effective_to means "in force indefinitely", and overlaps() needs two real
 * date strings. It is never written to the database — the column stays NULL.
 */
const OPEN_ENDED = "9999-12-31";

/**
 * Postgres `exclusion_violation`. The `postgres` driver copies the server's
 * SQLSTATE onto `err.code` as a string; drizzle may wrap the driver error, so
 * unwrap `cause` too — reading `.code` off the top level alone has silently
 * yielded undefined on this codebase before.
 */
function isExclusionViolation(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause;
  const src = (cause ?? err) as { code?: unknown };
  return src?.code === "23P01";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select()
    .from(userPayPeriods)
    .where(eq(userPayPeriods.userId, userId))
    .orderBy(desc(userPayPeriods.effectiveFrom));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const {
    effectiveFrom,
    effectiveTo,
    contractType,
    rateAmount,
    rateCurrency,
    ratePeriod,
    note,
  } = body as Record<string, unknown>;

  if (!isDateString(effectiveFrom)) {
    return NextResponse.json(
      { error: "effectiveFrom must be a valid date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }
  if (effectiveTo !== null && effectiveTo !== undefined && !isDateString(effectiveTo)) {
    return NextResponse.json(
      { error: "effectiveTo must be a valid date in YYYY-MM-DD format, or null" },
      { status: 400 }
    );
  }
  const to = (effectiveTo as string | null | undefined) ?? null;
  // Lexicographic comparison is valid: YYYY-MM-DD sorts chronologically.
  if (to !== null && to < effectiveFrom) {
    return NextResponse.json(
      { error: "effectiveTo must be on or after effectiveFrom" },
      { status: 400 }
    );
  }
  if (typeof contractType !== "string" || !CONTRACT_TYPES.has(contractType)) {
    return NextResponse.json(
      { error: "contractType must be one of hourly, salaried, contractor" },
      { status: 400 }
    );
  }
  if (typeof ratePeriod !== "string" || !RATE_PERIODS.has(ratePeriod)) {
    return NextResponse.json(
      { error: "ratePeriod must be one of hour, month, year" },
      { status: 400 }
    );
  }
  if (typeof rateCurrency !== "string" || !/^[A-Za-z]{3}$/.test(rateCurrency)) {
    return NextResponse.json(
      { error: "rateCurrency must be a three-letter ISO code" },
      { status: 400 }
    );
  }
  const amount = Number(rateAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "rateAmount must be a non-negative number" },
      { status: 400 }
    );
  }

  // Friendly fast path in front of the EXCLUDE constraint. Reuses overlaps()
  // from working-days.ts rather than reimplementing interval maths.
  const existing = await db
    .select({
      effectiveFrom: userPayPeriods.effectiveFrom,
      effectiveTo: userPayPeriods.effectiveTo,
    })
    .from(userPayPeriods)
    .where(eq(userPayPeriods.userId, userId));

  const clash = existing.find((r) =>
    overlaps(effectiveFrom, to ?? OPEN_ENDED, r.effectiveFrom, r.effectiveTo ?? OPEN_ENDED)
  );
  if (clash) {
    return NextResponse.json(
      {
        error: `That period overlaps an existing one (${clash.effectiveFrom} → ${
          clash.effectiveTo ?? "ongoing"
        }). Close the earlier period first.`,
      },
      { status: 409 }
    );
  }

  try {
    const [inserted] = await db
      .insert(userPayPeriods)
      .values({
        userId,
        effectiveFrom,
        effectiveTo: to,
        contractType: contractType as "hourly" | "salaried" | "contractor",
        // numeric(12,2) is a STRING at the driver boundary. toFixed(2) also
        // keeps a value like 5200 from storing as "5200" and reading back as
        // "5200.00", which would look like a silent edit in the history table.
        rateAmount: amount.toFixed(2),
        rateCurrency: rateCurrency.toUpperCase(),
        ratePeriod: ratePeriod as "hour" | "month" | "year",
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        createdBy: guard.session.user.id,
      })
      .returning();

    after(
      logEventAsync({
        userEmail: guard.session.user.email,
        userName: guard.session.user.name ?? null,
        section: "admin",
        action: "user:pay-period:create",
        status: "success",
        resourceType: "user",
        resourceId: userId,
        // Dates and the period id only — the RATE is the sensitive value and
        // must never be copied into admin_event_log, which admins can read.
        detail: {
          payPeriodId: inserted.id,
          effectiveFrom,
          effectiveTo: to,
        },
      })
    );

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    // The read-then-write race the pre-check above cannot see: two concurrent
    // POSTs both read an empty conflict set before either writes. Only the
    // EXCLUDE constraint closes it — and its error must read as a conflict,
    // not as a 500.
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "That period overlaps an existing one" },
        { status: 409 }
      );
    }
    console.error("[pay-periods] insert failed:", err);
    return NextResponse.json(
      { error: "Failed to create pay period" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Write the item route**

Create `src/app/api/team/[userId]/pay-periods/[periodId]/route.ts`. `PATCH` accepts the same field set as `POST` (all optional) and re-runs the same validation and overlap pre-check while excluding the row being edited; `DELETE` removes one row.

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPayPeriods } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { isDateString, overlaps } from "@/lib/time-off/working-days";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPEN_ENDED = "9999-12-31";

function isExclusionViolation(err: unknown): boolean {
  const cause = (err as { cause?: unknown })?.cause;
  const src = (cause ?? err) as { code?: unknown };
  return src?.code === "23P01";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; periodId: string }> }
) {
  const { userId, periodId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { effectiveFrom, effectiveTo, note } = body as Record<string, unknown>;

  const [current] = await db
    .select()
    .from(userPayPeriods)
    .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)))
    .limit(1);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextFrom = effectiveFrom === undefined ? current.effectiveFrom : effectiveFrom;
  const nextTo = effectiveTo === undefined ? current.effectiveTo : effectiveTo;

  if (!isDateString(nextFrom)) {
    return NextResponse.json(
      { error: "effectiveFrom must be a valid date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }
  if (nextTo !== null && !isDateString(nextTo)) {
    return NextResponse.json(
      { error: "effectiveTo must be a valid date in YYYY-MM-DD format, or null" },
      { status: 400 }
    );
  }
  if (nextTo !== null && (nextTo as string) < nextFrom) {
    return NextResponse.json(
      { error: "effectiveTo must be on or after effectiveFrom" },
      { status: 400 }
    );
  }

  // Same pre-check as POST, but excluding the row being edited — otherwise
  // every period would collide with itself.
  const others = await db
    .select({
      effectiveFrom: userPayPeriods.effectiveFrom,
      effectiveTo: userPayPeriods.effectiveTo,
    })
    .from(userPayPeriods)
    .where(and(eq(userPayPeriods.userId, userId), ne(userPayPeriods.id, periodId)));

  const clash = others.find((r) =>
    overlaps(
      nextFrom,
      (nextTo as string | null) ?? OPEN_ENDED,
      r.effectiveFrom,
      r.effectiveTo ?? OPEN_ENDED
    )
  );
  if (clash) {
    return NextResponse.json(
      {
        error: `That period overlaps an existing one (${clash.effectiveFrom} → ${
          clash.effectiveTo ?? "ongoing"
        }).`,
      },
      { status: 409 }
    );
  }

  try {
    await db
      .update(userPayPeriods)
      .set({
        effectiveFrom: nextFrom,
        effectiveTo: (nextTo as string | null) ?? null,
        ...(note === undefined
          ? {}
          : { note: typeof note === "string" && note.trim() ? note.trim() : null }),
      })
      .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)));
  } catch (err) {
    if (isExclusionViolation(err)) {
      return NextResponse.json(
        { error: "That period overlaps an existing one" },
        { status: 409 }
      );
    }
    console.error("[pay-periods] update failed:", err);
    return NextResponse.json(
      { error: "Failed to update pay period" },
      { status: 500 }
    );
  }

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:pay-period:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      detail: { payPeriodId: periodId, fields: Object.keys(body) },
    })
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; periodId: string }> }
) {
  const { userId, periodId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  await db
    .delete(userPayPeriods)
    .where(and(eq(userPayPeriods.id, periodId), eq(userPayPeriods.userId, userId)));

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:pay-period:delete",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      detail: { payPeriodId: periodId },
    })
  );

  return NextResponse.json({ success: true });
}
```

> **Note on the global "no row deletions" rule:** that rule governs *migrations* — no data-destroying DDL or backfill. A super-admin deleting a pay period they just mis-typed is ordinary CRUD the spec asks for (`GET/POST/PATCH/DELETE .../pay-periods`), and every deletion is audited. If Manu wants pay periods to be soft-deleted instead, that is a schema change and belongs in a follow-up, not a silent reinterpretation here.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/pay-periods/route.test.ts"
```

**Predicted: 9 tests, 9 passed, 1 file.**

- [ ] **Step 7: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task6.txt 2>&1; wc -l /tmp/tsc-task6.txt
```

Background, ~2 min, UNFILTERED, by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/lib/team/guards.ts "src/app/api/team/[userId]/pay-periods/route.ts" "src/app/api/team/[userId]/pay-periods/[periodId]/route.ts" "src/app/api/team/[userId]/pay-periods/route.test.ts"
```

- [ ] **Step 8: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/lib/team/guards.ts "src/app/api/team/[userId]/pay-periods/route.ts" "src/app/api/team/[userId]/pay-periods/[periodId]/route.ts" "src/app/api/team/[userId]/pay-periods/route.test.ts" && \
git commit -m "feat(team): effective-dated pay-period CRUD, super-admin only

overlaps() from working-days.ts is the friendly fast path; SQLSTATE 23P01 from
the EXCLUDE constraint maps to 409 as the backstop for the read-then-write
race the fast path cannot see. rateAmount crosses every boundary as a string.
The audit log records dates and ids, never the rate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/lib/team/guards.ts "src/app/api/team/[userId]/pay-periods/route.ts" "src/app/api/team/[userId]/pay-periods/[periodId]/route.ts" "src/app/api/team/[userId]/pay-periods/route.test.ts"
```

---

## Task 7: Payment details and the audited reveal

> **`USER_PII_ENCRYPTION_KEY` does not exist** — not in Vercel production, not in this worktree's `.env.local`. This task ships assuming absence. The routes must return **503** and **must never fall back to plaintext**. Every other block on the detail page works without the key. No code change is needed if Manu adds it later.

**Files:**
- Create: `src/app/api/team/[userId]/payment/route.ts` (`PUT`)
- Create: `src/app/api/team/[userId]/payment/reveal/route.ts` (`POST`)
- Test: `src/app/api/team/[userId]/payment/route.test.ts`

**Interfaces:**
- Consumes: `encryptPii`, `decryptPii`, `PiiKeyMissingError`, `PII_KEY_VERSION` (Task 1); `requireTier` (Task 6); `userPaymentDetails` (Task 3).
- Produces: `PUT` → `{ success: true }`. `POST .../reveal` with `{ field: "accountIdentifier" | "taxId" }` → `{ value: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/team/[userId]/payment/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { PUT } from "./route";
import { POST as REVEAL } from "./reveal/route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { logEventAsync } from "@/lib/event-logger";
// The real crypto module — the reveal round-trip is the point of test 8.
import { encryptPii } from "@/lib/crypto/pii";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 7).toString("base64");
const IBAN = "GB29NWBK60161331926819";

const originalKey = process.env.USER_PII_ENCRYPTION_KEY;

function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function jsonReq(method: string, body: unknown) {
  return new Request("http://localhost/api/team/x/payment", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function signIn(isSuperAdmin: boolean) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: ME, role: "admin", email: "me@marketfoundry.agency", name: "Me" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_PII_ENCRYPTION_KEY = KEY;
  signIn(true);
  queueSelects([]);
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.USER_PII_ENCRYPTION_KEY;
  else process.env.USER_PII_ENCRYPTION_KEY = originalKey;
});

describe("PUT /api/team/[userId]/payment", () => {
  it("403s a caller who is not a super-admin", async () => {
    signIn(false);
    const res = await PUT(jsonReq("PUT", { bankName: "Meezan" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("503s and writes NOTHING when the key is missing and an identifier is supplied", async () => {
    // Fail-closed. Storing a plaintext IBAN in a column named
    // `..._ciphertext` would be worse than refusing, because nothing
    // downstream would ever notice.
    delete process.env.USER_PII_ENCRYPTION_KEY;
    const res = await PUT(jsonReq("PUT", { accountIdentifier: IBAN }), ctx(THEM));
    expect(res.status).toBe(503);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("still saves the non-secret fields when the key is missing", async () => {
    // Absent the key, everything else on the page must keep working.
    delete process.env.USER_PII_ENCRYPTION_KEY;
    const res = await PUT(
      jsonReq("PUT", { bankName: "Meezan", paymentMethod: "wise" }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("stores ciphertext plus last4 and returns neither", async () => {
    const res = await PUT(jsonReq("PUT", { accountIdentifier: IBAN }), ctx(THEM));
    expect(res.status).toBe(200);
    const written = asMock(asMock(db.insert).mock.results[0].value.values).mock
      .calls[0][0] as Record<string, unknown>;
    expect(written.accountIdentifierLast4).toBe("6819");
    expect(typeof written.accountIdentifierCiphertext).toBe("string");
    expect(written.accountIdentifierCiphertext).not.toContain(IBAN);
    const raw = await res.text();
    expect(raw).not.toContain("Ciphertext");
    expect(raw).not.toContain(IBAN);
  });
});

describe("POST /api/team/[userId]/payment/reveal", () => {
  it("403s a caller who is not a super-admin", async () => {
    signIn(false);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("400s a field name that is not revealable", async () => {
    const res = await REVEAL(jsonReq("POST", { field: "payeeName" }), ctx(THEM));
    expect(res.status).toBe(400);
  });

  it("503s when the key is missing", async () => {
    const { ciphertext } = encryptPii(IBAN);
    delete process.env.USER_PII_ENCRYPTION_KEY;
    queueSelects([
      { accountIdentifierCiphertext: ciphertext, taxIdCiphertext: null, keyVersion: 1 },
    ]);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(503);
  });

  it("returns the decrypted value and writes an audit row naming the field", async () => {
    const { ciphertext } = encryptPii(IBAN);
    queueSelects([
      { accountIdentifierCiphertext: ciphertext, taxIdCiphertext: null, keyVersion: 1 },
    ]);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(200);
    expect((await res.json()).value).toBe(IBAN);

    const logged = asMock(logEventAsync).mock.calls[0][0];
    expect(logged.action).toBe("user:payment:reveal");
    expect(logged.resourceId).toBe(THEM);
    expect(logged.detail).toEqual({ field: "accountIdentifier" });
    // The revealed value must never land in the audit log.
    expect(JSON.stringify(logged)).not.toContain(IBAN);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/payment/route.test.ts"
```

Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the PUT route**

Create `src/app/api/team/[userId]/payment/route.ts`:

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { userPaymentDetails } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { encryptPii, PiiKeyMissingError } from "@/lib/crypto/pii";
import { logEventAsync } from "@/lib/event-logger";

// node:crypto has no edge equivalent.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = new Set(["bank_transfer", "wise", "payoneer", "paypal", "other"]);
const CADENCES = new Set(["monthly", "biweekly", "weekly", "per_invoice"]);

/** `undefined` = leave alone. `null` = clear. A string = set. */
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (b.paymentMethod !== undefined && b.paymentMethod !== null) {
    if (typeof b.paymentMethod !== "string" || !METHODS.has(b.paymentMethod)) {
      return NextResponse.json(
        { error: `paymentMethod must be one of ${[...METHODS].join(", ")}` },
        { status: 400 }
      );
    }
  }
  if (b.paymentCadence !== undefined && b.paymentCadence !== null) {
    if (typeof b.paymentCadence !== "string" || !CADENCES.has(b.paymentCadence)) {
      return NextResponse.json(
        { error: `paymentCadence must be one of ${[...CADENCES].join(", ")}` },
        { status: 400 }
      );
    }
  }

  const values: Record<string, unknown> = { userId };
  const changed: string[] = [];

  for (const field of [
    "paymentMethod",
    "paymentCadence",
    "payeeName",
    "bankName",
    "bankCountry",
  ] as const) {
    const v = optionalText(b[field]);
    if (v !== undefined) {
      values[field] = v;
      changed.push(field);
    }
  }
  if (typeof b.invoicesRequired === "boolean") {
    values.invoicesRequired = b.invoicesRequired;
    changed.push("invoicesRequired");
  }

  // Encryption happens BEFORE any write. A missing key must abort the whole
  // request, not half-save the non-secret fields and then fail.
  try {
    for (const [input, cipherCol, last4Col] of [
      ["accountIdentifier", "accountIdentifierCiphertext", "accountIdentifierLast4"],
      ["taxId", "taxIdCiphertext", "taxIdLast4"],
    ] as const) {
      const raw = b[input];
      if (raw === undefined) continue;
      if (raw === null || (typeof raw === "string" && !raw.trim())) {
        values[cipherCol] = null;
        values[last4Col] = null;
        changed.push(input);
        continue;
      }
      if (typeof raw !== "string") {
        return NextResponse.json(
          { error: `${input} must be a string or null` },
          { status: 400 }
        );
      }
      const enc = encryptPii(raw.trim());
      values[cipherCol] = enc.ciphertext;
      values[last4Col] = enc.last4;
      values.keyVersion = enc.keyVersion;
      changed.push(input);
    }
  } catch (err) {
    if (err instanceof PiiKeyMissingError) {
      // 503, not 500: the request is well-formed and the server is
      // misconfigured. There is deliberately NO plaintext fallback.
      return NextResponse.json(
        {
          error:
            "Payment identifiers are unavailable: USER_PII_ENCRYPTION_KEY is not configured.",
        },
        { status: 503 }
      );
    }
    throw err;
  }

  if (changed.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // The conflict target must not appear in the SET clause. Built by deletion
  // rather than by destructuring, so there is no unused binding for eslint's
  // no-unused-vars to reject.
  const setValues: Record<string, unknown> = { ...values };
  delete setValues.userId;

  await db
    .insert(userPaymentDetails)
    .values(values as typeof userPaymentDetails.$inferInsert)
    .onConflictDoUpdate({
      target: userPaymentDetails.userId,
      set: { ...setValues, updatedAt: new Date(), updatedBy: guard.session.user.id },
    });

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:payment:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      // Field names only — never a bank account number or a tax ID.
      detail: { fields: changed },
    })
  );

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Write the reveal route**

Create `src/app/api/team/[userId]/payment/reveal/route.ts`:

```ts
import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPaymentDetails } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { decryptPii, PiiKeyMissingError } from "@/lib/crypto/pii";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST, not GET, deliberately: a decrypted bank account number must never
 * reach a URL, a browser history entry, a proxy access log or a link prefetch.
 */
const REVEALABLE = {
  accountIdentifier: "accountIdentifierCiphertext",
  taxId: "taxIdCiphertext",
} as const;

type Revealable = keyof typeof REVEALABLE;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const field = (body as { field?: unknown } | null)?.field;
  if (typeof field !== "string" || !Object.hasOwn(REVEALABLE, field)) {
    return NextResponse.json(
      { error: `field must be one of ${Object.keys(REVEALABLE).join(", ")}` },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({
      accountIdentifierCiphertext: userPaymentDetails.accountIdentifierCiphertext,
      taxIdCiphertext: userPaymentDetails.taxIdCiphertext,
      keyVersion: userPaymentDetails.keyVersion,
    })
    .from(userPaymentDetails)
    .where(eq(userPaymentDetails.userId, userId))
    .limit(1);

  const ciphertext = row?.[REVEALABLE[field as Revealable]];
  if (!ciphertext) {
    return NextResponse.json({ error: "Nothing stored for that field" }, { status: 404 });
  }

  let value: string;
  try {
    value = decryptPii(ciphertext, row.keyVersion);
  } catch (err) {
    if (err instanceof PiiKeyMissingError) {
      return NextResponse.json(
        {
          error:
            "Payment identifiers are unavailable: USER_PII_ENCRYPTION_KEY is not configured.",
        },
        { status: 503 }
      );
    }
    // A GCM auth failure means the stored value was tampered with or was
    // written under a different key. Never leak which.
    console.error("[payment/reveal] decrypt failed:", err);
    return NextResponse.json({ error: "Could not decrypt that value" }, { status: 500 });
  }

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:payment:reveal",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      // The field NAME is the audit record. The value must never be logged.
      detail: { field },
    })
  );

  return NextResponse.json({ value });
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run "src/app/api/team/[userId]/payment/route.test.ts"
```

**Predicted: 8 tests, 8 passed, 1 file.**

- [ ] **Step 6: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task7.txt 2>&1; wc -l /tmp/tsc-task7.txt
```

Background, ~2 min, UNFILTERED, by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint "src/app/api/team/[userId]/payment/route.ts" "src/app/api/team/[userId]/payment/reveal/route.ts" "src/app/api/team/[userId]/payment/route.test.ts"
```

- [ ] **Step 7: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add "src/app/api/team/[userId]/payment/route.ts" "src/app/api/team/[userId]/payment/reveal/route.ts" "src/app/api/team/[userId]/payment/route.test.ts" && \
git commit -m "feat(team): encrypted payment details with an audited one-shot reveal

Fail-closed on a missing USER_PII_ENCRYPTION_KEY: 503 before any write, no
plaintext fallback, and the non-secret fields still save. Reveal is POST so a
decrypted identifier never reaches a URL or a prefetch, and it logs the field
name only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- "src/app/api/team/[userId]/payment/route.ts" "src/app/api/team/[userId]/payment/reveal/route.ts" "src/app/api/team/[userId]/payment/route.test.ts"
```

---

## Task 8: `team` section, `INTERNAL_TEAMS` lift, nav entry

**Files:**
- Modify: `src/lib/permissions.ts:116` (add next to the `calendar` standalone entry)
- Modify: `src/lib/constants.ts` (append after `isCountryCode` at `:235-240`)
- Modify: `src/app/admin/users/page.tsx:93-97` (delete the local const, import instead)
- Modify: `src/components/layout/top-nav.tsx:161-163`
- Test: `src/lib/permissions.test.ts` (append 2), `src/lib/constants.test.ts` (append or create, 1)

**Interfaces:**
- Produces: `INTERNAL_TEAMS` and `type InternalTeamValue` from `@/lib/constants`, consumed by `/admin/users` (existing call sites `:448` and `:944`) and by the directory in Task 9.

- [ ] **Step 1: Record the existing counts, then write the failing tests**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/permissions.test.ts src/lib/constants.test.ts 2>&1 | tail -15
```

`permissions.test.ts` must report **8 passing** before this task. Note whether `constants.test.ts` exists.

Append to `src/lib/permissions.test.ts`:

```ts
describe("team section", () => {
  it("is a standalone configurable section, like calendar", () => {
    const team = CONFIGURABLE_SECTIONS.find((s) => s.id === "team");
    expect(team).toBeDefined();
    expect(team?.type).toBe("standalone");
    expect(team?.dept).toBeNull();
  });

  it("is accepted by the API's section allowlist", () => {
    // VALID_SECTION_IDS derives from CONFIGURABLE_SECTIONS, so this proves the
    // derivation ran rather than needing a second hand-maintained list.
    expect(VALID_SECTION_IDS).toContain("team");
  });
});
```

Add `CONFIGURABLE_SECTIONS` and `VALID_SECTION_IDS` to that file's existing import from `./permissions` if they are not already there.

Create (or append to) `src/lib/constants.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { INTERNAL_TEAMS } from "./constants";

describe("INTERNAL_TEAMS", () => {
  it("holds the three internal team codes shared by /admin/users and /team", () => {
    // Lifted out of admin/users/page.tsx so the matrix and the directory can
    // never disagree about what a clientIdCode of "1o8-marketplace" is called.
    // The VALUES are legacy 1o8-era keys stored in users.client_id_code and
    // must not be renamed — only the labels are brand-current.
    expect(INTERNAL_TEAMS.map((t) => t.value)).toEqual([
      "1o8-agency",
      "1o8-marketplace",
      "external",
    ]);
    expect(INTERNAL_TEAMS.find((t) => t.value === "1o8-marketplace")?.label).toBe(
      "MarketFoundry Agency"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/permissions.test.ts src/lib/constants.test.ts
```

Expected: the two new permissions tests fail (`team` undefined); the constants test fails to resolve `INTERNAL_TEAMS`.

- [ ] **Step 3: Add the `team` section**

`src/lib/permissions.ts` — insert immediately after the `calendar` line at `:116`:

```ts
  { id: "team", label: "Team", type: "standalone" as const, dept: null },
```

`VALID_SECTION_IDS` at `:202` derives from `CONFIGURABLE_SECTIONS`, so no second edit is needed. `canAccess` at `:84` already bypasses everything for admins.

- [ ] **Step 4: Lift `INTERNAL_TEAMS` into constants**

Append to `src/lib/constants.ts` after `isCountryCode`:

```ts
// ── Internal teams ──────────────────────────────────────────────────

/**
 * The internal team a person belongs to, stored in `users.client_id_code`.
 *
 * There is deliberately NO separate `team` or `department` column (spec D7):
 * clientIdCode already doubles as this field for internal staff, and adding a
 * second one would create two sources of truth for the same fact.
 *
 * The VALUES are legacy 1o8-era keys that exist in production rows — renaming
 * them is a data migration, not a constant edit. Only the labels are
 * brand-current. Lifted out of src/app/admin/users/page.tsx so the permission
 * matrix and the /team directory share one definition.
 */
export const INTERNAL_TEAMS = [
  {
    value: "1o8-agency",
    label: "1o8 Agency",
    activeClass: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  },
  {
    value: "1o8-marketplace",
    label: "MarketFoundry Agency",
    activeClass: "border-brand/40 bg-brand/10 text-brand",
  },
  {
    value: "external",
    label: "External",
    activeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  },
] as const;

export type InternalTeamValue = (typeof INTERNAL_TEAMS)[number]["value"];

/** The display label for a clientIdCode, or null when it is not an internal team. */
export function internalTeamLabel(code: string | null): string | null {
  return INTERNAL_TEAMS.find((t) => t.value === code)?.label ?? null;
}
```

The `activeClass` strings use `bg-brand/10 text-brand` — an orange **tint** behind orange text, not a text-bearing `bg-brand` fill, so the WCAG rule is not engaged. Copied verbatim from the existing definition; do not change them.

- [ ] **Step 5: Point `/admin/users` at the import**

In `src/app/admin/users/page.tsx`, delete the local `const INTERNAL_TEAMS = [...]` block at `:93-97` and add `INTERNAL_TEAMS` to the existing import from `@/lib/constants` (create the import if the file does not already import from there). **The identifier keeps the same name, so the two call sites at `:448` and `:944` need no edit** — verify that with:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && grep -n "INTERNAL_TEAMS" src/app/admin/users/page.tsx
```

Expected after the edit: one import line plus the two existing usages, and no `const INTERNAL_TEAMS`.

- [ ] **Step 6: Add the nav entry**

First confirm the icon exists in the installed lucide version rather than assuming:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node -e "const l=require('lucide-react');console.log('Contact:',!!l.Contact,'UsersRound:',!!l.UsersRound)"
```

Use whichever prints `true` (prefer `Contact`; `Users` is already taken by the Clients section). Add it to the existing `lucide-react` import in `src/components/layout/top-nav.tsx`, then extend `topLevelItems` at `:161-163`:

```ts
  /* ---- top-level items ---- */
  const topLevelItems: NavItem[] = [
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
    { title: "Team", href: "/team", icon: Contact, visible: checkAccess("team") },
  ];
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run src/lib/permissions.test.ts src/lib/constants.test.ts
```

**Predicted: `permissions.test.ts` 10 passing (8 pre-existing + 2 new), `constants.test.ts` 1 new.** All 8 pre-existing permissions tests must still pass — a failure there means the `CONFIGURABLE_SECTIONS` insertion broke an index- or length-based assertion.

- [ ] **Step 8: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task8.txt 2>&1; wc -l /tmp/tsc-task8.txt
```

Background, ~2 min, UNFILTERED, by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/lib/permissions.ts src/lib/permissions.test.ts src/lib/constants.ts src/lib/constants.test.ts src/app/admin/users/page.tsx src/components/layout/top-nav.tsx
```

- [ ] **Step 9: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/lib/permissions.ts src/lib/permissions.test.ts src/lib/constants.ts src/lib/constants.test.ts src/app/admin/users/page.tsx src/components/layout/top-nav.tsx && \
git commit -m "feat(team): add the team section, lift INTERNAL_TEAMS to constants, add nav entry

INTERNAL_TEAMS moves out of admin/users/page.tsx so the permission matrix and
the directory share one definition. Its values stay the legacy 1o8-era keys
that live in users.client_id_code — renaming those is a data migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/lib/permissions.ts src/lib/permissions.test.ts src/lib/constants.ts src/lib/constants.test.ts src/app/admin/users/page.tsx src/components/layout/top-nav.tsx
```

---

## Verification for the UI tasks (9–13)

The repo has no component-test precedent for pages of this shape, so Tasks 9–13 predict **zero** new vitest tests. Inventing component tests that match nothing in the codebase would be worse than none. Each UI task instead ends with:

1. `node_modules/.bin/tsc --noEmit` — background, ~2 min, UNFILTERED, judged by filename against the one-error baseline.
2. `npx eslint <touched paths>` — clean exit 0.
3. A **manual dev-server check** with the exact URL and the exact things to observe.
4. A commit.

Start the dev server once, before Task 9, and leave it running:

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && PORT=3100 npm run dev
```

Run it in the background on port 3100 so it cannot collide with another thread's server on 3000.

---

## Task 9: `/team` directory page

**Files:**
- Create: `src/app/team/page.tsx`
- Create: `src/components/team/team-directory.tsx`

**Interfaces:**
- Consumes: `GET /api/team` (Task 4) and `INTERNAL_TEAMS` (Task 8).
- Produces: a card per person linking to `/team/<id>`, which Task 13 also links to from `/admin/users`.

- [ ] **Step 1: Write the page shell**

Create `src/app/team/page.tsx`:

```tsx
"use client";

import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { TeamDirectory } from "@/components/team/team-directory";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Team Directory"
        >
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Directory</span>
        </h1>
      </PageMetaSlot>
      <TeamDirectory />
    </div>
  );
}
```

This is the `PageMetaSlot` jammed-two-word pattern copied from `src/app/hours-log/page.tsx:24-33`. `/team` is a **hub** page, so the accent span is `text-brand` (`#FF751F`). `text-portal-accent` must never appear on this page.

- [ ] **Step 2: Write the directory component**

Create `src/components/team/team-directory.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { INTERNAL_TEAMS } from "@/lib/constants";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  clientIdCode: string | null;
  jobTitle: string | null;
  employmentStatus: "active" | "inactive" | "alumni";
  phone: string | null;
  slackHandle: string | null;
};

function initialsOf(member: TeamMember): string {
  const source = member.name ?? member.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Cards use the DESIGN.md card recipe verbatim. */
const CARD =
  "rounded-xl border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md " +
  "transition-all card-glow animate-card-enter dark:border-zinc-800 dark:hover:border-zinc-700";

export function TeamDirectory() {
  const { data, isLoading, isError } = useQuery<TeamMember[]>({
    queryKey: ["team-directory"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("Failed to load the team directory");
      return res.json();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the team…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        The team directory could not be loaded.
      </p>
    );
  }

  // Group by team, with anyone whose clientIdCode is not an internal team code
  // collected under "Unassigned" rather than dropped — a person missing from
  // the directory is worse than a person in the wrong group.
  // The explicit Group annotation is load-bearing: INTERNAL_TEAMS is `as
  // const`, so a bare .map() infers `label` as the literal union of the three
  // team names and the "Unassigned" push below would not typecheck.
  type Group = { label: string; activeClass: string; members: TeamMember[] };
  const groups: Group[] = INTERNAL_TEAMS.map((team) => ({
    label: team.label,
    activeClass: team.activeClass,
    members: data.filter((m) => m.clientIdCode === team.value),
  }));
  const known = new Set<string>(INTERNAL_TEAMS.map((t) => t.value));
  const unassigned = data.filter((m) => !m.clientIdCode || !known.has(m.clientIdCode));
  if (unassigned.length > 0) {
    groups.push({
      label: "Unassigned",
      activeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
      members: unassigned,
    });
  }

  return (
    <div className="space-y-6">
      {groups
        .filter((g) => g.members.length > 0)
        .map((group) => (
          <section key={group.label} className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
              {group.label}
              <span className="ml-2 font-normal text-muted-foreground">
                {group.members.length}
              </span>
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.members.map((member, index) => (
                <Link
                  key={member.id}
                  href={`/team/${member.id}`}
                  className={`${CARD} block p-5 focus:border-brand focus:outline-none`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage src={member.image ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {initialsOf(member)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {member.name ?? member.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.jobTitle ?? "—"}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[10px] font-bold text-muted-foreground">EMAIL</dt>
                      <dd className="truncate">{member.email}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[10px] font-bold text-muted-foreground">SLACK</dt>
                      <dd className="truncate">{member.slackHandle ?? "—"}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task9.txt 2>&1; wc -l /tmp/tsc-task9.txt
```

Background, ~2 min, UNFILTERED, by filename. Only `rename-1o8m-keys-to-mf.ts:46`.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/app/team/page.tsx src/components/team/team-directory.tsx
```

If `@/components/ui/avatar` does not export `Avatar`/`AvatarImage`/`AvatarFallback` under those names, take the import from `src/app/admin/users/page.tsx`, which already uses all three.

- [ ] **Step 4: Manual verification**

Open `http://localhost:3100/team` signed in as an internal user. Confirm:
- The heading renders as **Team**Directory with the second word in burnt orange, jammed with no space.
- Team groups appear with a person count, and every person in `/admin/users` with an active status and a `@marketfoundry.agency` email is present exactly once.
- A card click navigates to `/team/<uuid>` (a 404 at this point is expected — Task 10 builds it).
- Nothing on the page is Charcoal Blue.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/app/team/page.tsx src/components/team/team-directory.tsx && \
git commit -m "feat(team): /team directory grouped by internal team

Anyone whose clientIdCode is not a known internal team lands under
Unassigned rather than being dropped — missing from the directory is worse
than in the wrong group.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/app/team/page.tsx src/components/team/team-directory.tsx
```

---

## Task 10: `/team/[userId]` — identity, contact and employment

**Files:**
- Create: `src/app/team/[userId]/page.tsx`
- Create: `src/components/team/user-detail.tsx`
- Create: `src/components/team/editable-field.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/team/[userId]` (Task 5); `canWriteField`, `type Access` (Task 2).
- Produces: `<UserDetail userId={...} />` and `<EditableField ... />`, extended by Tasks 11 and 12.

> `src/lib/team/access.ts` is pure — no `db`, no `next/*`, no session import — so a **client** component can import `canWriteField` directly and the browser applies exactly the rule the server enforces. That is the point of keeping it pure; do not add a server import to it.

- [ ] **Step 1: Write the shared inline-edit control**

Create `src/components/team/editable-field.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";

/**
 * Inline edit-in-place, matching the EditableName / EditableAsanaEmail pattern
 * already in src/app/admin/users/page.tsx:139-248 rather than introducing a
 * second editing idiom.
 *
 * A field the viewer may not write renders as plain read-only text with no
 * pencil — never as a disabled input, which advertises that there is something
 * they cannot have.
 */
export function EditableField({
  label,
  value,
  canWrite,
  onSave,
  placeholder = "—",
  type = "text",
  options,
}: {
  label: string;
  value: string | null;
  canWrite: boolean;
  onSave: (next: string | null) => void;
  placeholder?: string;
  type?: "text" | "date" | "email";
  /**
   * When supplied the field edits through a <select> constrained to exactly
   * these values, and becomes NON-CLEARABLE. Use it for any column the route
   * validates as an enum. `employmentStatus` is the one on this page: the
   * route checks it against active/inactive/alumni BEFORE its
   * `value === null` early-return, so a free-text input's "select all +
   * Delete" sends null and 400s every time, and so does any casing slip.
   */
  options?: readonly string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) return;
    if (selectRef.current) {
      selectRef.current.focus();
      return;
    }
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (options) {
      // A constrained field is NOT nullable — see the `options` doc above.
      // A <select> offers no empty choice, so the emptiness test here only
      // guards a stray value; it never sends null.
      if (trimmed && trimmed !== value) onSave(trimmed);
      setEditing(false);
      return;
    }
    const next = trimmed || null;
    if (next !== (value ?? null)) onSave(next);
    setEditing(false);
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">
        {label}
      </span>
      {editing ? (
        <span className="flex items-center gap-1">
          {options ? (
            <select
              ref={selectRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className="rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(value ?? "");
                  setEditing(false);
                }
              }}
              className="rounded border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            />
          )}
          <button
            type="button"
            onClick={commit}
            aria-label={`Save ${label}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Check className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className="group flex items-center gap-1.5 text-sm">
          {value ?? placeholder}
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${label}`}
              className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the page shell**

Create `src/app/team/[userId]/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { UserDetail } from "@/components/team/user-detail";

export default function TeamUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  // Next 16 passes params as a Promise; `use` unwraps it in a client component.
  const { userId } = use(params);

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Team Member"
        >
          <span className="font-bold text-sidebar-foreground">Team</span>
          <span className="font-normal text-brand">Member</span>
        </h1>
      </PageMetaSlot>
      <UserDetail userId={userId} />
    </div>
  );
}
```

- [ ] **Step 3: Write the detail orchestrator**

Create `src/components/team/user-detail.tsx`:

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { canWriteField, type Access } from "@/lib/team/access";
import { internalTeamLabel } from "@/lib/constants";
import { EditableField } from "./editable-field";

export type TeamUserPayload = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    clientIdCode: string | null;
    jobTitle: string | null;
    startDate: string | null;
    employmentStatus: "active" | "inactive" | "alumni";
    phone: string | null;
    slackHandle: string | null;
    countryCode: string | null;
    residenceTimezone: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  access: Access;
  profile?: {
    personalEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    addressCountry: string | null;
    dateOfBirth: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
  } | null;
};

export const CARD =
  "rounded-xl border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md " +
  "transition-all card-glow animate-card-enter dark:border-zinc-800 dark:hover:border-zinc-700";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-brand">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The exact three values PATCH /api/team/[userId] accepts for
 * employmentStatus (route.ts EMPLOYMENT_STATUSES). The column is
 * `.notNull().default("active")`, and the route's enum branch runs BEFORE its
 * `value === null` early-return, so this field is edited through a <select>
 * and is never clearable.
 */
const EMPLOYMENT_STATUSES = ["active", "inactive", "alumni"] as const;

const STATUS_BADGE: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  inactive:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  alumni:
    "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800",
};

export function UserDetail({ userId }: { userId: string }) {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<TeamUserPayload>({
    queryKey: ["team-user", userId],
    queryFn: async () => {
      const res = await fetch(`/api/team/${userId}`);
      if (!res.ok) throw new Error("Failed to load this person");
      return res.json();
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, string | null>) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // The route distinguishes 400 (unknown/invalid) from 403 (forbidden)
        // and puts the reason in `error`. Surface it rather than a generic
        // "save failed", which hides an authorization answer.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      toast.success("Saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">This person could not be loaded.</p>;
  }

  const { user, access, profile } = data;
  const can = (field: string) => canWriteField(field, access);
  const save = (field: string) => (next: string | null) => patch.mutate({ [field]: next });

  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      {/* 1. Identity */}
      <section className={`${CARD} p-5 lg:col-span-2`}>
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] font-bold">
                {user.role}
              </Badge>
              {internalTeamLabel(user.clientIdCode) && (
                <Badge variant="outline" className="text-[9px] font-bold">
                  {internalTeamLabel(user.clientIdCode)}
                </Badge>
              )}
              <span
                className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${
                  STATUS_BADGE[user.employmentStatus]
                }`}
              >
                {user.employmentStatus}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Contact */}
      <Section title="Contact">
        <EditableField label="Phone" value={user.phone} canWrite={can("phone")} onSave={save("phone")} />
        <EditableField
          label="Slack"
          value={user.slackHandle}
          canWrite={can("slackHandle")}
          onSave={save("slackHandle")}
        />
        {/* The route encodes TWO different answers in two different values
            (route.ts: `payload.profile = profile ?? null`, set only under
            allowsTier("self", access)):

              key ABSENT  → `undefined` → the viewer's tier does not permit
                            this block, so it is OMITTED entirely, never
                            greyed out (spec §5);
              key present but NULL → permitted, but `user_profiles` has no row
                            for this person yet.

            Gate on PERMISSION ALONE. Migration 0090 creates user_profiles
            empty — there is no backfill — and the only writer of a row is the
            PATCH these very fields fire, so a `profile !== null` guard would
            hide the block from everyone, forever, including from a person
            looking at their own page. Read through optionally instead: the
            empty, editable fields are what create the row on first save. */}
        {profile !== undefined && (
          <>
            <EditableField
              label="Personal email"
              type="email"
              value={profile?.personalEmail ?? null}
              canWrite={can("personalEmail")}
              onSave={save("personalEmail")}
            />
            <EditableField
              label="Address"
              value={profile?.addressLine1 ?? null}
              canWrite={can("addressLine1")}
              onSave={save("addressLine1")}
            />
            <EditableField
              label="Address line 2"
              value={profile?.addressLine2 ?? null}
              canWrite={can("addressLine2")}
              onSave={save("addressLine2")}
            />
            <EditableField
              label="City"
              value={profile?.city ?? null}
              canWrite={can("city")}
              onSave={save("city")}
            />
            <EditableField
              label="Postcode"
              value={profile?.postcode ?? null}
              canWrite={can("postcode")}
              onSave={save("postcode")}
            />
            {/* NOT the holiday calendar. See the Time off & holidays card. */}
            <EditableField
              label="Country of residence"
              value={profile?.addressCountry ?? null}
              canWrite={can("addressCountry")}
              onSave={save("addressCountry")}
            />
            <EditableField
              label="Date of birth"
              type="date"
              value={profile?.dateOfBirth ?? null}
              canWrite={can("dateOfBirth")}
              onSave={save("dateOfBirth")}
            />
            <EditableField
              label="Emergency contact"
              value={profile?.emergencyContactName ?? null}
              canWrite={can("emergencyContactName")}
              onSave={save("emergencyContactName")}
            />
            <EditableField
              label="Emergency phone"
              value={profile?.emergencyContactPhone ?? null}
              canWrite={can("emergencyContactPhone")}
              onSave={save("emergencyContactPhone")}
            />
            <EditableField
              label="Emergency relation"
              value={profile?.emergencyContactRelation ?? null}
              canWrite={can("emergencyContactRelation")}
              onSave={save("emergencyContactRelation")}
            />
          </>
        )}
      </Section>

      {/* 3. Employment */}
      <Section title="Employment">
        <EditableField label="Job title" value={user.jobTitle} canWrite={can("jobTitle")} onSave={save("jobTitle")} />
        <EditableField
          label="Start date"
          type="date"
          value={user.startDate}
          canWrite={can("startDate")}
          onSave={save("startDate")}
        />
        <EditableField
          label="Status"
          value={user.employmentStatus}
          options={EMPLOYMENT_STATUSES}
          canWrite={can("employmentStatus")}
          onSave={save("employmentStatus")}
        />
      </Section>

      {/* Tasks 11 and 12 add the holiday, financial and payment cards here. */}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, manual check**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task10.txt 2>&1; wc -l /tmp/tsc-task10.txt
```

Background, ~2 min, UNFILTERED, by filename.

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint "src/app/team/[userId]/page.tsx" src/components/team/user-detail.tsx src/components/team/editable-field.tsx
```

If `sonner`'s `toast` or `@/components/ui/badge` resolve differently, copy the imports from `src/app/admin/users/page.tsx`, which uses both.

Manual, at `http://localhost:3100/team/<your own uuid>`:
- Contact shows the full personal block **for yourself**; open a colleague's page as a plain admin and confirm the personal block is **absent entirely**, not greyed out.
- The personal fields render **empty and editable** on a person with no `user_profiles` row — which is everyone until their first save, because migration 0090 backfilled nothing. Save one field, reload, and confirm the value persists: that first PATCH is what creates the row. If the block is missing on your own page, the `profile !== undefined` gate has been narrowed back to `!== null` — that is the bug, not the tier gate.
- The pencil appears on hover only for fields you may write. As a plain admin on a colleague's page, Phone has **no** pencil but Job title does.
- Editing Job title and pressing Enter saves and the value persists after a reload.
- Status edits through a `<select>` offering exactly `active`, `inactive`, `alumni` — there is no free-text input and no empty option, so it cannot be cleared. Sending a nonsense value **through the API** (devtools/curl, not the UI) still surfaces the route's own 400 message in the toast.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add "src/app/team/[userId]/page.tsx" src/components/team/user-detail.tsx src/components/team/editable-field.tsx && \
git commit -m "feat(team): user detail page — identity, contact and employment

The client imports canWriteField from the same pure module the server
enforces, so the pencil appears exactly where a write would succeed. Blocks
the viewer's tier does not permit are omitted, never rendered locked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- "src/app/team/[userId]/page.tsx" src/components/team/user-detail.tsx src/components/team/editable-field.tsx
```

---

## Task 11: Holiday block

**Files:**
- Create: `src/components/team/holiday-block.tsx`
- Modify: `src/components/team/user-detail.tsx` (render it after Employment)

**Interfaces:**
- Consumes: the existing `GET /api/holidays?country=XX&year=YYYY` (unchanged), `countWorkingDays` from `@/lib/time-off/working-days`, and `user.countryCode` / `user.residenceTimezone` from the Task 5 payload.
- Produces: `<HolidayBlock countryCode={...} residenceTimezone={...} />`.

> **The two country fields must never be conflated.** `users.country_code` is the **holiday calendar** — a policy assignment deciding which days are not deducted from this person's leave, so a Manila-based person working US hours is legitimately `US`. `user_profiles.address_country` is where they physically live and appears in the Contact card as "Country of residence". This card shows only the first, labelled **"Holiday calendar"**.

- [ ] **Step 1: Write the component**

Create `src/components/team/holiday-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { countWorkingDays } from "@/lib/time-off/working-days";

type Holiday = { id: string; countryCode: string; holidayDate: string; name: string };

/** Whole years around the current one. No Date.now() in a render path beyond this. */
function yearOptions(): number[] {
  const current = new Date().getUTCFullYear();
  return [current - 1, current, current + 1];
}

export function HolidayBlock({
  countryCode,
  residenceTimezone,
}: {
  countryCode: string | null;
  residenceTimezone: string | null;
}) {
  const [year, setYear] = useState(() => new Date().getUTCFullYear());

  const { data, isLoading, isError, error } = useQuery<Holiday[]>({
    queryKey: ["holidays", countryCode, year],
    enabled: Boolean(countryCode),
    queryFn: async () => {
      const res = await fetch(`/api/holidays?country=${countryCode}&year=${year}`);
      if (!res.ok) {
        // Surface the route's own message, as Tasks 10 and 12 both do. A
        // country outside the six-code allowlist returns
        // "country must be one of US, PK, ES, PT, PH, FI", which names the
        // fix; a generic string would hide it.
        const { error } = await res
          .json()
          .catch(() => ({ error: "Failed to load holidays" }));
        throw new Error(error ?? "Failed to load holidays");
      }
      return res.json();
    },
  });

  const holidays = data ?? [];

  /**
   * The weekday-effective count: how many of this year's holidays actually
   * cost or credit a day. countWorkingDays already skips Saturday and Sunday
   * (working-days.ts:77), so a holiday landing on a weekend is inert. Showing
   * the raw list without this number misrepresents what a person gets.
   *
   * Computed as "working days in the year, minus working days in the year once
   * the holidays are excluded" — which is exactly the number of holidays that
   * fell on a weekday, using the same function the time-off maths uses rather
   * than a second, drifting weekend rule.
   */
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const effective =
    countWorkingDays(from, to, new Set()) -
    countWorkingDays(from, to, new Set(holidays.map((h) => h.holidayDate)));

  return (
    <div>
      <div className="mb-3 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Holiday calendar
          </span>
          <span className="text-sm">{countryCode ?? "Not assigned"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Time zone
          </span>
          <span className="text-sm">{residenceTimezone ?? "UTC (default)"}</span>
        </div>
      </div>

      {!countryCode ? (
        <p className="text-sm text-muted-foreground">
          No holiday calendar is assigned, so time-off requests are refused until an
          admin sets one in /admin/users.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="holiday-year" className="text-[10px] font-bold uppercase text-muted-foreground">
              Year
            </label>
            <select
              id="holiday-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              <strong className="text-foreground">{effective}</strong> of {holidays.length}{" "}
              fall on a weekday
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading holidays…</p>
          ) : isError ? (
            /* A failed fetch and a genuinely empty year are DIFFERENT facts and
               must read differently. `data` is undefined after react-query
               exhausts its retries, so `holidays` is [] and the branch below
               would otherwise assert "No holidays are seeded" — an affirmative
               false statement — on a 400, a 401 or a 500. It is reachable with
               a real value: users.country_code is a bare char(2) with no CHECK
               and no FK, while /api/holidays 400s for anything outside its
               six-code allowlist. */
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not load the holiday list for {countryCode} in {year}:{" "}
              {error?.message ?? "unknown error"}. This does not mean the
              calendar is empty.
            </p>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays are seeded for {countryCode} in {year}.
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {holidays.map((h) => {
                // getUTCDay: the dates are YYYY-MM-DD strings parsed in UTC, so
                // the weekday never shifts under a server in another zone.
                const [y, m, d] = h.holidayDate.split("-").map(Number);
                const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
                const inert = weekday === 0 || weekday === 6;
                return (
                  <li key={h.id} className="flex justify-between gap-3">
                    <span className={inert ? "text-muted-foreground line-through" : ""}>
                      {h.name}
                    </span>
                    <span
                      className={`tabular-nums ${inert ? "text-muted-foreground" : ""}`}
                      title={inert ? "Falls on a weekend — already a non-working day" : undefined}
                    >
                      {h.holidayDate}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Read-only. Holiday dates are country-level reference data and are edited
            elsewhere.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in the detail page**

In `src/components/team/user-detail.tsx`, add the import and a card after the Employment section:

```tsx
import { HolidayBlock } from "./holiday-block";
```

```tsx
      <Section title="Time off & holidays">
        <HolidayBlock
          countryCode={user.countryCode}
          residenceTimezone={user.residenceTimezone}
        />
      </Section>
```

- [ ] **Step 3: Typecheck, lint, manual check**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task11.txt 2>&1; wc -l /tmp/tsc-task11.txt
```

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/components/team/holiday-block.tsx src/components/team/user-detail.tsx
```

Manual, on a person whose `countryCode` is `PK` or `ES` (both have seeded rows — all 144 prod holiday rows were loaded on 2026-08-05):
- Switching the year re-fetches and the list changes.
- The count reads "N of M fall on a weekday" and any weekend holiday is struck through.
- Cross-check one weekend date by hand: a holiday dated on a Saturday must be struck through and must **not** be inside the effective count.
- Force the fetch to fail — devtools → Network → block `/api/holidays`, then reload — and confirm the card shows the **red error line carrying the route's own message**, NOT "No holidays are seeded for …". The two must never be confusable: one is a fetch failure, the other is a real empty year.
- The card labels the field **"Holiday calendar"**, and "Country of residence" appears only in the Contact card. If both ever show the same label, stop — that is the bug this naming exists to prevent.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/components/team/holiday-block.tsx src/components/team/user-detail.tsx && \
git commit -m "feat(team): holiday block with the weekday-effective count

First place in the hub that shows which days a person actually gets. The
count reuses countWorkingDays rather than re-implementing the weekend rule,
so a holiday landing on a weekend reads as inert instead of as a day off.
Labelled 'Holiday calendar' — deliberately not the country of residence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/components/team/holiday-block.tsx src/components/team/user-detail.tsx
```

---

## Task 12: Financial and payment blocks

**Files:**
- Create: `src/components/team/financial-block.tsx`
- Create: `src/components/team/payment-block.tsx`
- Modify: `src/components/team/user-detail.tsx` (extend `TeamUserPayload`, render both when `access.isSuperAdmin`)

**Interfaces:**
- Consumes: `GET /api/team/[userId]` `pay` and `payment` blocks (Task 5); `POST pay-periods` and `DELETE pay-periods/[periodId]` (Task 6); `PUT payment` and `POST payment/reveal` (Task 7); `CARD` and `Section` from `user-detail.tsx` (Task 10).
- Produces: `<FinancialBlock userId pay />`, `<PaymentBlock userId payment canEdit />`.

> **Every route named above must actually be called.** A declared-but-uncalled write route is not a deferral, it is a dead end: without `PUT payment` no `user_payment_details` row is ever created, so the block renders "No payment details recorded." forever and the Reveal button is unreachable code; without `DELETE pay-periods/[periodId]` the first open-ended pay period can never be removed, so every later `Add pay period` 409s against `user_pay_periods_no_overlap` and the card is stuck at one row.
>
> **`PATCH pay-periods/[periodId]` is deliberately NOT consumed here.** Ruling: a mistyped or superseded period is corrected by DELETE + re-POST, which is fully audited. An edit dialog is out of scope for this task.

- [ ] **Step 1: Extend the payload type**

In `src/components/team/user-detail.tsx`, add to `TeamUserPayload`:

```tsx
  pay?: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    contractType: "hourly" | "salaried" | "contractor";
    // numeric(12,2) arrives as a STRING from the driver and stays one all the
    // way to the DOM. Never parseFloat it back into a value you then send.
    rateAmount: string;
    rateCurrency: string;
    ratePeriod: "hour" | "month" | "year";
    note: string | null;
  }[];
  payment?: {
    paymentMethod: string | null;
    paymentCadence: string | null;
    invoicesRequired: boolean;
    payeeName: string | null;
    bankName: string | null;
    bankCountry: string | null;
    accountIdentifierLast4: string | null;
    taxIdLast4: string | null;
    keyVersion: number;
    hasAccountIdentifier: boolean;
    hasTaxId: boolean;
  } | null;
```

- [ ] **Step 2: Write the financial block**

Create `src/components/team/financial-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TeamUserPayload } from "./user-detail";

type PayPeriod = NonNullable<TeamUserPayload["pay"]>[number];

const CONTRACT_TYPES = ["hourly", "salaried", "contractor"] as const;
const RATE_PERIODS = ["hour", "month", "year"] as const;

const EMPTY = {
  effectiveFrom: "",
  effectiveTo: "",
  contractType: "hourly" as (typeof CONTRACT_TYPES)[number],
  rateAmount: "",
  rateCurrency: "EUR",
  ratePeriod: "hour" as (typeof RATE_PERIODS)[number],
  note: "",
};

export function FinancialBlock({
  userId,
  pay,
}: {
  userId: string;
  pay: PayPeriod[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  // Which row is awaiting its "yes, really" confirmation. Deleting a financial
  // record is destructive, so it is never one click.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team/${userId}/pay-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // An empty end date means "currently in force", which is NULL.
          effectiveTo: form.effectiveTo || null,
          note: form.note || null,
        }),
      });
      if (!res.ok) {
        // 409 carries the readable overlap message from either the overlaps()
        // pre-check or SQLSTATE 23P01. Show it verbatim.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      setForm({ ...EMPTY });
      setOpen(false);
      toast.success("Pay period added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * DELETE, and deliberately NO edit dialog: a mistyped or superseded period is
   * corrected by deleting it and adding a replacement, and both halves are
   * audited (`user:pay-period:delete` then `user:pay-period:create`).
   *
   * This is also what unblocks the card. The create form defaults to a blank
   * end date, so the first row is open-ended, and every later "Add pay period"
   * then 409s against the in-memory overlap pre-check and the
   * `user_pay_periods_no_overlap` EXCLUDE constraint behind it. Without a way
   * to remove that row the card is permanently stuck at one period.
   *
   * The route takes NO body, so it cannot trip any writable-key gate. It
   * answers 200 `{success:true}` even when it deleted zero rows — no
   * `.returning()`, no 404 — so never infer "already gone" from a status code.
   * The invalidate below is what reconciles the table with the server.
   */
  const remove = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch(`/api/team/${userId}/pay-periods/${periodId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
        throw new Error(error ?? "Delete failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      setConfirmDelete(null);
      toast.success("Pay period deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // effectiveTo === null is the definition of "in force" (spec §3.3).
  const current = pay.find((p) => p.effectiveTo === null) ?? null;

  return (
    <div className="space-y-3">
      {current ? (
        <div className="rounded-lg border border-brand/40 bg-brand/10 p-3">
          <p className="text-[10px] font-bold uppercase text-brand">In force</p>
          <p className="text-sm font-bold tabular-nums">
            {current.rateAmount} {current.rateCurrency} / {current.ratePeriod}
          </p>
          <p className="text-xs text-muted-foreground">
            {current.contractType} · since {current.effectiveFrom}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No pay period is currently in force.</p>
      )}

      {pay.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase text-muted-foreground">
              <th className="py-1">From</th>
              <th className="py-1">To</th>
              <th className="py-1">Contract</th>
              <th className="py-1 text-right">Rate</th>
              <th className="py-1 text-right">Remove</th>
            </tr>
          </thead>
          <tbody>
            {pay.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-1 tabular-nums">{p.effectiveFrom}</td>
                <td className="py-1 tabular-nums">{p.effectiveTo ?? "ongoing"}</td>
                <td className="py-1">{p.contractType}</td>
                <td className="py-1 text-right tabular-nums">
                  {/* numeric(12,2) is a STRING all the way to the DOM. */}
                  {p.rateAmount} {p.rateCurrency}/{p.ratePeriod}
                </td>
                <td className="py-1 text-right">
                  {confirmDelete === p.id ? (
                    // Two-step confirm in place, rather than a second modal.
                    <span className="flex items-center justify-end gap-1">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        Delete?
                      </span>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(p.id)}
                        className="rounded-lg border border-red-300 px-2 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        {remove.isPending ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg border border-stone-300 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(p.id)}
                      aria-label={`Delete the pay period starting ${p.effectiveFrom}`}
                      className="text-muted-foreground transition-colors hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
      >
        Add pay period
      </button>

      {open && (
        // Multi-field, so a dialog rather than inline edit-in-place (spec §5).
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dark:bg-black/60">
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-bold">Add pay period</h3>
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Effective from
                </span>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Effective to (blank = ongoing)
                </span>
                <input
                  type="date"
                  value={form.effectiveTo}
                  onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Contract type
                </span>
                <select
                  value={form.contractType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contractType: e.target.value as (typeof CONTRACT_TYPES)[number],
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                >
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Rate
                  </span>
                  <input
                    inputMode="decimal"
                    value={form.rateAmount}
                    onChange={(e) => setForm({ ...form, rateAmount: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 tabular-nums focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block w-20">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Currency
                  </span>
                  <input
                    maxLength={3}
                    value={form.rateCurrency}
                    onChange={(e) =>
                      setForm({ ...form, rateCurrency: e.target.value.toUpperCase() })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 uppercase focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block w-24">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Per
                  </span>
                  <select
                    value={form.ratePeriod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ratePeriod: e.target.value as (typeof RATE_PERIODS)[number],
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                  >
                    {RATE_PERIODS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  Note
                </span>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate()}
                className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover disabled:opacity-60"
              >
                {create.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the payment block**

Create `src/components/team/payment-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TeamUserPayload } from "./user-detail";

type Payment = NonNullable<TeamUserPayload["payment"]>;

/**
 * The exact enum values PUT /api/team/[userId]/payment accepts. Anything else
 * is a 400 the route takes before it touches the database.
 */
const PAYMENT_METHODS = [
  "bank_transfer",
  "wise",
  "payoneer",
  "paypal",
  "other",
] as const;
const PAYMENT_CADENCES = ["monthly", "biweekly", "weekly", "per_invoice"] as const;

/**
 * The ONLY eight top-level keys PUT accepts (payment/route.ts WRITABLE_KEYS).
 * Any other key returns 400 `Unknown field: <key>` with ZERO database access —
 * so never PUT the GET payload back: `accountIdentifierLast4`, `taxIdLast4`,
 * `keyVersion`, `hasAccountIdentifier` and `hasTaxId` are all in the GET
 * payload, are all read-only, and are all rejected.
 *
 * Per key: `undefined` (i.e. absent from the JSON) means "leave alone", `null`
 * or an empty string means "clear", a string means "set". `invoicesRequired`
 * must be a REAL boolean — `"true"` is its own 400.
 */
type PaymentPut = {
  paymentMethod?: string | null;
  paymentCadence?: string | null;
  payeeName?: string | null;
  bankName?: string | null;
  bankCountry?: string | null;
  invoicesRequired?: boolean;
  accountIdentifier?: string | null;
  taxId?: string | null;
};

/**
 * Form state seeded from the MASKED payload. The two secret inputs always
 * start blank and are never seeded from a revealed value — a decrypted
 * identifier must not enter form state, a DOM value attribute, or a re-render.
 */
function formFrom(payment: Payment | null) {
  return {
    paymentMethod: payment?.paymentMethod ?? "",
    paymentCadence: payment?.paymentCadence ?? "",
    payeeName: payment?.payeeName ?? "",
    bankName: payment?.bankName ?? "",
    bankCountry: payment?.bankCountry ?? "",
    invoicesRequired: payment?.invoicesRequired ?? false,
    accountIdentifier: "",
    taxId: "",
    clearAccountIdentifier: false,
    clearTaxId: false,
  };
}

const FIELD =
  "w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none";
const MICRO = "text-[10px] font-bold uppercase text-muted-foreground";

export function PaymentBlock({
  userId,
  payment,
  canEdit,
}: {
  userId: string;
  payment: Payment | null;
  /**
   * `access.isSuperAdmin`, passed explicitly. Payment details are super-admin
   * only for BOTH read and write. The three capability flags are INDEPENDENT
   * (spec D2) — `isAdmin` never implies this one and neither does `isSelf`, so
   * this is never derived from "the payload arrived, therefore I may write".
   */
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  // Revealed values live in component state ONLY. They are never written into
  // the react-query cache, so they vanish on navigation and are never
  // persisted anywhere the next viewer could reach.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFrom(payment));

  const reveal = useMutation({
    mutationFn: async (field: "accountIdentifier" | "taxId") => {
      const res = await fetch(`/api/team/${userId}/payment/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Reveal failed" }));
        // 503 means USER_PII_ENCRYPTION_KEY is not configured. Surfacing the
        // route's own message tells the admin it is a configuration problem
        // rather than a permission one.
        throw new Error(error ?? "Reveal failed");
      }
      const { value } = (await res.json()) as { value: string };
      return { field, value };
    },
    onSuccess: ({ field, value }) => setRevealed((r) => ({ ...r, [field]: value })),
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * The ONLY writer of `user_payment_details`. Without it no row is ever
   * created, the card reads "No payment details recorded." forever, and
   * `hasAccountIdentifier`/`hasTaxId` stay false — which makes the Reveal
   * button below unreachable code.
   */
  const save = useMutation({
    mutationFn: async () => {
      const body: PaymentPut = {
        // "" is sent as null: optionalText() maps an empty string to null
        // anyway, and being explicit keeps "cleared" distinguishable from
        // "untouched" for the five non-secret fields.
        paymentMethod: form.paymentMethod || null,
        paymentCadence: form.paymentCadence || null,
        payeeName: form.payeeName || null,
        bankName: form.bankName || null,
        bankCountry: form.bankCountry || null,
        // A REAL boolean. `"true"` is a 400 taken before any write.
        invoicesRequired: form.invoicesRequired,
      };
      // The two secrets are OMITTED unless the admin acted. An absent key
      // disappears from JSON.stringify and the route reads it as "leave
      // alone"; sending "" instead would WIPE the stored ciphertext and its
      // last4 on every save of an unrelated field.
      if (form.clearAccountIdentifier) body.accountIdentifier = null;
      else if (form.accountIdentifier.trim()) {
        body.accountIdentifier = form.accountIdentifier.trim();
      }
      if (form.clearTaxId) body.taxId = null;
      else if (form.taxId.trim()) body.taxId = form.taxId.trim();

      const res = await fetch(`/api/team/${userId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Every branch the route emits carries its own `error` string: 400
        // (unknown key, bad enum, non-boolean, "Nothing to update"), 401, 403,
        // and 503. Surface the server's text rather than guessing the cause —
        // PUT's 503 is "USER_PII_ENCRYPTION_KEY is not configured" and aborts
        // the WHOLE request, so nothing is half-saved, while the reveal route
        // has a second, differently-worded 503 for a key_version mismatch.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      // A just-saved secret makes any value revealed a moment ago stale.
      setRevealed({});
      setEditing(false);
      toast.success("Payment details saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function detailRows(p: Payment): [string, string | null][] {
    return [
      ["Method", p.paymentMethod],
      ["Cadence", p.paymentCadence],
      // NOT NULL DEFAULT false, so this cannot conflate null with false.
      ["Invoices required", p.invoicesRequired ? "Yes" : "No"],
      ["Payee", p.payeeName],
      ["Bank", p.bankName],
      ["Bank country", p.bankCountry],
    ];
  }

  function secretRow(
    label: string,
    field: "accountIdentifier" | "taxId",
    last4: string | null,
    present: boolean
  ) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className={MICRO}>{label}</span>
        <span className="flex items-center gap-2 text-sm tabular-nums">
          {revealed[field] ?? (last4 ? `••••${last4}` : "—")}
          {present && !revealed[field] && (
            <button
              type="button"
              disabled={reveal.isPending}
              onClick={() => reveal.mutate(field)}
              className="rounded-lg border border-stone-300 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Reveal
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      {payment ? (
        <>
          {detailRows(payment).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-1">
              <span className={MICRO}>{label}</span>
              <span className="text-sm">{value ?? "—"}</span>
            </div>
          ))}
          {secretRow(
            "Account",
            "accountIdentifier",
            payment.accountIdentifierLast4,
            payment.hasAccountIdentifier
          )}
          {secretRow("Tax ID", "taxId", payment.taxIdLast4, payment.hasTaxId)}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Revealing an identifier is recorded in the event log.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No payment details recorded.</p>
      )}

      {canEdit && !editing && (
        <button
          type="button"
          onClick={() => {
            // Re-seed from the CURRENT payload each time it opens, not once at
            // mount: a successful save invalidates the parent query and this
            // component re-renders with fresh props.
            setForm(formFrom(payment));
            setEditing(true);
          }}
          className="mt-3 rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
        >
          {payment ? "Edit payment details" : "Add payment details"}
        </button>
      )}

      {canEdit && editing && (
        // Rendered INLINE rather than as a second modal: the card is already
        // super-admin gated, and the pay-period dialog's keyboard behaviour is
        // a known open item that should not be duplicated here.
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-sm">
          <label className="block">
            <span className={MICRO}>Method</span>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              className={FIELD}
            >
              <option value="">Not set</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={MICRO}>Cadence</span>
            <select
              value={form.paymentCadence}
              onChange={(e) => setForm({ ...form, paymentCadence: e.target.value })}
              className={FIELD}
            >
              <option value="">Not set</option>
              {PAYMENT_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={MICRO}>Payee name</span>
            <input
              maxLength={200}
              value={form.payeeName}
              onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
              className={FIELD}
            />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1">
              <span className={MICRO}>Bank</span>
              <input
                maxLength={120}
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className={FIELD}
              />
            </label>
            <label className="block w-28">
              {/* char(2). The route does NOT format-check this one, so without
                  maxLength an over-long value reaches Postgres as a 500. */}
              <span className={MICRO}>Bank country</span>
              <input
                maxLength={2}
                value={form.bankCountry}
                onChange={(e) =>
                  setForm({ ...form, bankCountry: e.target.value.toUpperCase() })
                }
                className={`${FIELD} uppercase`}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={form.invoicesRequired}
              onChange={(e) => setForm({ ...form, invoicesRequired: e.target.checked })}
            />
            <span className={MICRO}>Invoices required</span>
          </label>

          <p className="pt-1 text-[10px] text-muted-foreground">
            The two identifiers below are encrypted on save and are never
            returned in full by this page. Leave one blank to keep whatever is
            already stored.
          </p>
          <label className="block">
            <span className={MICRO}>
              Account identifier
              {payment?.accountIdentifierLast4
                ? ` — stored: ••••${payment.accountIdentifierLast4}`
                : ""}
            </span>
            <input
              value={form.accountIdentifier}
              onChange={(e) => setForm({ ...form, accountIdentifier: e.target.value })}
              disabled={form.clearAccountIdentifier}
              placeholder="Leave blank to keep the stored value"
              className={`${FIELD} disabled:opacity-50`}
            />
          </label>
          {payment?.hasAccountIdentifier && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.clearAccountIdentifier}
                onChange={(e) =>
                  setForm({ ...form, clearAccountIdentifier: e.target.checked })
                }
              />
              <span className={MICRO}>Remove the stored account identifier</span>
            </label>
          )}
          <label className="block">
            <span className={MICRO}>
              Tax ID{payment?.taxIdLast4 ? ` — stored: ••••${payment.taxIdLast4}` : ""}
            </span>
            <input
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              disabled={form.clearTaxId}
              placeholder="Leave blank to keep the stored value"
              className={`${FIELD} disabled:opacity-50`}
            />
          </label>
          {payment?.hasTaxId && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.clearTaxId}
                onChange={(e) => setForm({ ...form, clearTaxId: e.target.checked })}
              />
              <span className={MICRO}>Remove the stored tax ID</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render both in the detail page**

In `src/components/team/user-detail.tsx`, add the imports and, after the holiday card:

```tsx
import { FinancialBlock } from "./financial-block";
import { PaymentBlock } from "./payment-block";
```

```tsx
      {/* Present only when the API sent them, which is only for a super-admin
          whose flag was confirmed against the database (ruling F3). The client
          check is convenience; the server is the gate. */}
      {data.pay !== undefined && (
        <Section title="Financial">
          <FinancialBlock userId={userId} pay={data.pay} />
        </Section>
      )}
      {data.payment !== undefined && (
        <Section title="Payment">
          {/* canEdit is passed EXPLICITLY from the flag, not inferred from
              "the payload arrived". The three capabilities are independent. */}
          <PaymentBlock
            userId={userId}
            payment={data.payment}
            canEdit={access.isSuperAdmin}
          />
        </Section>
      )}
```

- [ ] **Step 5: Typecheck, lint, manual check**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task12.txt 2>&1; wc -l /tmp/tsc-task12.txt
```

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/components/team/financial-block.tsx src/components/team/payment-block.tsx src/components/team/user-detail.tsx
```

Manual:
- As a **plain admin**, the Financial and Payment cards must be **entirely absent** from the DOM. Check with view-source, not just by eye — `Ctrl-F` for "Financial" must find nothing.
- As a **super-admin**, add a pay period, then add a second one whose dates overlap the first. The second must fail with the readable overlap message, not a 500.
- Add a period with the end date left **blank** (the form's default, i.e. open-ended), attempt a second one and confirm it 409s with the route's overlap message. Then delete the first — the trash icon must require the second "Yes, delete" click before anything fires — and re-add the second successfully. The history table must end with exactly one row, and `/admin/events` must show `user:pay-period:delete` followed by `user:pay-period:create`.
- On a person with **no payment row**, the card reads "No payment details recorded." and offers **Add payment details**. Save method, cadence, payee, bank, bank country and the invoices checkbox with both identifier boxes left blank: the row is created, the values persist after a reload, and `/admin/events` gains one `user:payment:update` row listing **field names only**.
- Re-open the form and save again with the identifier boxes still blank. The masked `••••` display must be unchanged — a blank identifier box means "leave alone", never "clear".
- Now put anything in the Account identifier box and save. It returns **503** with `USER_PII_ENCRYPTION_KEY is not configured`, and **nothing at all is written** — not even the non-secret fields in the same request, because encryption runs before the insert. **That is the correct result today**: it proves the fail-closed path. Confirm `/admin/events` gained no `user:payment:update` row for that attempt.
- Consequently no ciphertext can exist yet, `hasAccountIdentifier` stays false, and **no Reveal button renders** — that is expected, not a bug. Once `USER_PII_ENCRYPTION_KEY` is configured, store an identifier, confirm Reveal shows the full value and that `/admin/events` records a `user:payment:reveal` row for the success and **none** for a failed attempt.

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/components/team/financial-block.tsx src/components/team/payment-block.tsx src/components/team/user-detail.tsx && \
git commit -m "feat(team): financial history and masked payment details

Pay periods use a dialog because they are multi-field; the 409 overlap
message from the route is surfaced verbatim. A period is corrected by
delete-then-re-add — both audited — which is also what stops the first
open-ended row locking the card at one period. Payment details are written
through PUT, sending only the eight keys the route accepts and a real
boolean for invoicesRequired; a blank identifier box means 'leave alone',
never 'clear'. Revealed identifiers live in component state only and never
enter the react-query cache.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/components/team/financial-block.tsx src/components/team/payment-block.tsx src/components/team/user-detail.tsx
```

---

## Task 13: `/profile` redirect and the `/admin/users` name link

**Files:**
- Create: `src/app/profile/page.tsx`
- Modify: `src/app/admin/users/page.tsx:342`

**Interfaces:**
- Consumes: `getAuthSession` from `@/lib/auth-db`; `/team/[userId]` (Task 10).

- [ ] **Step 1: Write the redirect**

Create `src/app/profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";

/**
 * Server component, not a client redirect: the target depends on the session's
 * user id, and rendering a page only to bounce it client-side would flash.
 *
 * /admin/* is admin-gated, so without this a viewer could never reach a page
 * that lets them fix their own phone number (spec D5).
 */
export default async function ProfilePage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  redirect(`/team/${session.user.id}`);
}
```

- [ ] **Step 2: Link the name cell**

In `src/app/admin/users/page.tsx`, wrap the `EditableName` at `:342` so the **name text** links to the detail page while the inline pencil keeps working. Add `import Link from "next/link";` if it is not already imported, then replace the `TableCell` body at `:336-344`:

```tsx
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            {/* Only the name cell changes on this page (spec D10). The role and
                section grid and Thread E's UserTimeOffCell at :458 are
                untouched. */}
            <Link
              href={`/team/${user.id}`}
              className="hover:text-brand hover:underline focus:text-brand focus:outline-none"
            >
              <EditableName user={user} isSelf={isSelf} onSave={(name) => nameMutation.mutate({ userId: user.id, name })} />
            </Link>
          </div>
        </TableCell>
```

If clicking the pencil navigates instead of entering edit mode, the pencil's `onClick` needs `e.preventDefault(); e.stopPropagation();` added inside `EditableName` at `:195`. Check this in Step 4 — do not assume either way.

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-task13.txt 2>&1; wc -l /tmp/tsc-task13.txt
```

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx eslint src/app/profile/page.tsx src/app/admin/users/page.tsx
```

- [ ] **Step 4: Manual check**

- `http://localhost:3100/profile` lands on your own `/team/<id>` with the URL rewritten.
- On `/admin/users`, clicking a name navigates to that person's detail page.
- On `/admin/users`, clicking the **pencil** next to a name still opens the inline editor and does **not** navigate. If it navigates, apply the `preventDefault`/`stopPropagation` fix from Step 2 and re-check.
- The role checkboxes, the section grid and the time-off cell all still work.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && \
git add src/app/profile/page.tsx src/app/admin/users/page.tsx && \
git commit -m "feat(team): /profile redirect and link the /admin/users name cell

/admin/* is admin-gated, so /profile is how a viewer reaches their own record
to fix their own phone number. Nothing else on the users matrix moves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" \
-- src/app/profile/page.tsx src/app/admin/users/page.tsx
```

---

## Final verification

- [ ] **Run every test file this plan created or touched, scoped — never the full suite**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && npx vitest run \
  src/lib/crypto/pii.test.ts \
  src/lib/team/access.test.ts \
  src/lib/db/migrations-0090.test.ts \
  src/lib/permissions.test.ts \
  src/lib/constants.test.ts \
  src/app/api/team/route.test.ts \
  src/app/api/admin/users/route.test.ts \
  src/app/api/holidays/route.test.ts \
  "src/app/api/team/[userId]/route.test.ts" \
  "src/app/api/team/[userId]/pay-periods/route.test.ts" \
  "src/app/api/team/[userId]/payment/route.test.ts"
```

**Predicted: 11 files, 84 tests** — 11 + 21 + 5 + 10 + 1 + 4 + 1 + 2 + 12 + 9 + 8 = 84, of which **76 are new** and 8 are the pre-existing `permissions.test.ts` tests that must still pass. Add any pre-existing counts Task 4 and Task 8 discovered in the three shared files (`admin/users/route.test.ts`, `holidays/route.test.ts`, `constants.test.ts`). A total other than that means a test was dropped, duplicated, or silently skipped.

- [ ] **Final typecheck**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && node_modules/.bin/tsc --noEmit > /tmp/tsc-final.txt 2>&1; wc -l /tmp/tsc-final.txt
```

Background, ~2 min. Read UNFILTERED after the notification. **Exactly one error, in `scripts/migrations/2026-08-03-team-role-suffix-rename/rename-1o8m-keys-to-mf.ts:46`.** Any second error is a regression this plan introduced.

- [ ] **Confirm the commit hygiene rules held**

```bash
cd /Users/manu/MFHub/.worktrees/team-user-detail && git log --oneline "feat/team-calendar-time-off"..HEAD && git status --porcelain
```

Expect 13 commits (Tasks 1–13), a clean tree, and **nothing** from `graphify-out/`, `.claude/`, `.superpowers/`, `redshift-client-exports/` or any `scripts/_diag*` / `_probe*` / `_verify*` / `_tmp-*` path in the log.

- [ ] **Do NOT merge.** This branch is based on `feat/team-calendar-time-off`, which is itself unmerged. Neither may be merged without Manu's explicit per-action OK, and this one cannot ship first.

---

## Self-review

Run against the spec with fresh eyes after writing. Findings, and what was done about them.

**1. Spec coverage.** Every section maps to a task: §3.1→T3, §3.2→T3, §3.3→T3, §3.4→T3, §4 access→T2, §4 route table→T4/T5/T6/T7, §4 audit→T5/T6/T7, §4 "tighten `/api/admin/users`"→T4, §5 routes and nav→T8/T9/T13, §5 six card sections→T10/T11/T12, §5 "omitted, not rendered locked"→T10 test 3 and T12 step 5, §5 pay dialog→T12, §6 encryption→T1, §7 testing→the counts table, §8 risks→Global Constraints. No spec requirement is unclaimed.

**Two named gaps, deliberate:**
- **`PATCH /api/team/[userId]/pay-periods/[periodId]` is implemented but not directly tested.** The agreed count for Task 6 is 9 and all nine are spent on the access matrix, validation, both 409 paths and the happy path. PATCH shares the same `overlaps()` pre-check and the same `isExclusionViolation` mapping as POST, so the logic is covered; the *route wiring* is not. Cheapest fix if wanted: two more tests in the same file, which moves Task 6 to 11.
- **Tasks 9–13 add no automated tests.** The repo has no component-test precedent for pages of this shape and inventing one would be worse than the manual checks specified. Each UI task's manual step names exactly what to observe.

**2. Placeholder scan.** No `TBD`, no "implement later", no "similar to Task N", no "add appropriate error handling". Every code step carries the actual code. Three steps are deliberately conditional rather than placeholder, each with a command that resolves the condition: Task 4 step 1 (do the shared test files exist), Task 8 step 6 (does `Contact` exist in the installed lucide), Task 13 step 2 (does the pencil need `preventDefault`).

**3. Type consistency.** Checked across tasks: `resolveAccess(viewer, targetUserId, isSuperAdmin)`, `canWriteField(field, access)`, `allowsTier(tier, access)`, `requireTier(tier, targetUserId)`, `readIsSuperAdmin(userId)`, `encryptPii → {ciphertext,last4,keyVersion}`, `decryptPii(ciphertext, keyVersion)`, `overlaps(aStart,aEnd,bStart,bEnd)`, `countWorkingDays(start,end,holidays)`, `internalTeamLabel(code)`, and `CARD`/`Section`/`TeamUserPayload` exported from `user-detail.tsx` and consumed by Tasks 11 and 12. Two errors found and fixed inline while reviewing:
- Task 9's `groups` array inferred literal types from `INTERNAL_TEAMS as const`, so the `"Unassigned"` push would not have compiled. Now explicitly annotated `Group[]`.
- Task 7 built the upsert `SET` clause by destructuring out `userId`, leaving an unused binding for eslint. Now built by `delete`.

**4. One accepted duplication.** The `CARD` class string appears in both `team-directory.tsx` and `user-detail.tsx`. Extracting it to a shared module for two call sites is not worth a fifth component file; if a third consumer appears, extract then.

**5. One trade-off worth naming.** Putting the `ALTER TABLE users` first means holding `ACCESS EXCLUSIVE` on `users` for the few milliseconds it takes to create three empty tables, rather than grabbing it last and holding it for microseconds. The recorded reason for "first" was fail-fast on retry; the stronger reason, found while writing the SQL, is that the new tables' foreign keys to `users(id)` take `SHARE ROW EXCLUSIVE`, so arriving at them first would force a **lock upgrade** to `ACCESS EXCLUSIVE` — a deadlock path against any concurrent reader. Taking the strongest lock once, first, removes it. Both the migration comment and the guard test record this.
