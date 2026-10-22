# Avatar Capture / Store / Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy every active `@marketfoundry.agency` user's Google Workspace profile photo into the Supabase Storage `avatars` bucket and point `users.image` at it, so the photo stays put after the next login.

**Architecture:** Three small server modules under `src/lib/avatars/`: `directory.ts` fetches the photo through the Admin SDK with domain-wide delegation, `storage.ts` uploads it through the Supabase Storage REST API, and `capture.ts` ties the two together. A pure `url.ts` module decides whether a URL is one of our stored avatars. Both login paths use it so they never overwrite a stored avatar with Google's hotlink. `scripts/backfill-avatars.ts` snapshots `users.image`, runs a capture for each user, and writes the column. It has `--dry-run` and `--restore=<file>` modes.

**Tech Stack:** Next.js 16, NextAuth v5, Drizzle + postgres.js, `googleapis@172` (already installed), Supabase Storage REST via `fetch` (**no new dependency**), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-22-avatar-capture-store-display-design.md`

## Global Constraints

- Additive only. No schema change and no column drop. Users we can't find a photo for keep their current `users.image`, whether that's a Google URL or NULL.
- Bucket `avatars` (public read, already exists). Object path `{userId}.{ext}`. Public URL form `${SUPABASE_URL}/storage/v1/object/public/avatars/{userId}.{ext}?v={hash10}`.
- Env read at CALL time, never at module init: `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY`, `GOOGLE_WORKSPACE_ADMIN_EMAIL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. All five were verified as present in the local env on 2026-09-22, and the DWD token plus one `photos.get` succeeded.
- Directory scope, verbatim: `https://www.googleapis.com/auth/admin.directory.user.readonly`.
- Org domain, verbatim: `@marketfoundry.agency`. Compare case-insensitively.
- The name/image sync in `src/lib/auth-db.ts` MUST keep calling `patchAuthIdentity` whenever it writes. Otherwise the 235,900-no-op-UPDATE storm comes back.
- NO prod DB write, storage upload, push, deploy, or live backfill without a separate explicit per-action OK from Manu. `--dry-run` is read-only.
- Work in the worktree `/Users/manu/MFHub/.worktrees/avatars` on branch `feat/avatar-capture`. Never commit in the main checkout, which has another session's dirty files.
- Run `vitest` and then `node_modules/.bin/tsc --noEmit`, and judge tsc by FILENAME. Pre-existing errors in files this plan doesn't touch are not ours.
- Use an explicit pathspec on every `git add` AND `git commit`, with `-m` BEFORE `--`. One task per commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Scripts: call `config()` at module top, then `await import()` the db INSIDE `main()`. A static import is hoisted above `config()` and silently connects to localhost.
- Server-side test files start with `// @vitest-environment node`, because the default is jsdom.

## Known limits (accepted, surface to Manu)

- `photos.get` returns a **96×96** thumbnail. That's sharp for every current avatar size (the largest is `size-14`, 56px, which needs 112px at 2x) apart from a slight softness at that largest size on retina screens.
- The client-side user menu and the portal shell read the JWT's `token.picture`, which is set only at sign-in. They show the stored avatar after the user's **next sign-in**, not straight after the backfill.
- These sites show initials only and are NOT changed by this plan: the admin support reporter and assignee (`src/app/admin/support/page.tsx:357,776,789`) and the A+ @mention picker (`src/components/aplus/aplus-comment-thread.tsx:515`).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/avatars/url.ts` (new) | Pure, client-safe helpers: `isStoredAvatarUrl`, `resolveSignInImage` |
| `src/lib/avatars/directory.ts` (new) | Admin SDK Directory photo fetch using DWD |
| `src/lib/avatars/storage.ts` (new) | Supabase Storage upsert plus the public URL |
| `src/lib/avatars/capture.ts` (new) | Per-user orchestration (org filter, dry-run) |
| `src/lib/auth.ts` (modify, jwt callback ~L53-61) | Don't overwrite a stored avatar at sign-in; prefer it for `token.picture` |
| `src/lib/auth-db.ts` (modify, ~L86-88) | Don't overwrite a stored avatar during the per-request sync |
| `scripts/backfill-avatars.ts` (new) | Snapshot, dry-run, live, and restore |

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree and branch**

```bash
cd /Users/manu/MFHub && git worktree add -b feat/avatar-capture .worktrees/avatars main && ln -s /Users/manu/MFHub/node_modules /Users/manu/MFHub/.worktrees/avatars/node_modules && cd .worktrees/avatars && git log -1 --oneline
```
Expected: HEAD is `c5d788461` or whatever `main` is now. The spec is committed on `main`, but the plan is untracked in the main checkout. Copy it into the worktree and commit it as the branch's first commit, with an explicit pathspec. Never commit in the main checkout.

All later commands run with cwd `/Users/manu/MFHub/.worktrees/avatars`.

---

### Task 1: `url.ts` — stored-avatar predicate + sign-in image resolver

**Files:**
- Create: `src/lib/avatars/url.ts`
- Test: `src/lib/avatars/url.test.ts`

**Interfaces:**
- Produces: `STORED_AVATAR_PATH_MARKER: string`, `isStoredAvatarUrl(url: string | null | undefined): boolean`, `resolveSignInImage(args: { dbImage: string | null; profilePicture: string | null }): { write: string | null; tokenPicture: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isStoredAvatarUrl, resolveSignInImage } from "./url";

const STORED = "https://lmm.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abcdef0123";
const GOOGLE = "https://lh3.googleusercontent.com/a/xyz=s96-c";

describe("isStoredAvatarUrl", () => {
  it("is true for our bucket's public URL, with or without ?v=", () => {
    expect(isStoredAvatarUrl(STORED)).toBe(true);
    expect(isStoredAvatarUrl(STORED.split("?")[0])).toBe(true);
  });
  it("is false for Google hotlinks, other buckets, null and undefined", () => {
    expect(isStoredAvatarUrl(GOOGLE)).toBe(false);
    expect(isStoredAvatarUrl("https://x.supabase.co/storage/v1/object/public/other/u.png")).toBe(false);
    expect(isStoredAvatarUrl(null)).toBe(false);
    expect(isStoredAvatarUrl(undefined)).toBe(false);
  });
});

describe("resolveSignInImage", () => {
  it("never overwrites a stored avatar, and puts it in the token", () => {
    expect(resolveSignInImage({ dbImage: STORED, profilePicture: GOOGLE })).toEqual({ write: null, tokenPicture: STORED });
  });
  it("writes a new Google picture over a NULL or different non-stored image", () => {
    expect(resolveSignInImage({ dbImage: null, profilePicture: GOOGLE })).toEqual({ write: GOOGLE, tokenPicture: GOOGLE });
    expect(resolveSignInImage({ dbImage: "https://old", profilePicture: GOOGLE })).toEqual({ write: GOOGLE, tokenPicture: GOOGLE });
  });
  it("does not write when the picture is unchanged", () => {
    expect(resolveSignInImage({ dbImage: GOOGLE, profilePicture: GOOGLE })).toEqual({ write: null, tokenPicture: GOOGLE });
  });
  it("falls back to the DB image for the token when Google sends no picture", () => {
    expect(resolveSignInImage({ dbImage: "https://old", profilePicture: null })).toEqual({ write: null, tokenPicture: "https://old" });
    expect(resolveSignInImage({ dbImage: null, profilePicture: null })).toEqual({ write: null, tokenPicture: null });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run src/lib/avatars/url.test.ts`
Expected: FAIL, cannot resolve `./url`.

- [ ] **Step 3: Implement**

```ts
/**
 * Pure, client-safe helpers for avatars stored in our Supabase `avatars` bucket.
 * Both login paths (auth.ts jwt callback, auth-db.ts per-request sync) use these
 * so a Google `picture` hotlink never overwrites an avatar we captured.
 */
export const STORED_AVATAR_PATH_MARKER = "/storage/v1/object/public/avatars/";

export function isStoredAvatarUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes(STORED_AVATAR_PATH_MARKER);
}

/**
 * Decide what to do with Google's `picture` at sign-in.
 * - write: value to persist to users.image, or null for "no write".
 * - tokenPicture: what the JWT (and so the client-side session) should carry.
 */
export function resolveSignInImage(args: {
  dbImage: string | null;
  profilePicture: string | null;
}): { write: string | null; tokenPicture: string | null } {
  const { dbImage, profilePicture } = args;
  if (isStoredAvatarUrl(dbImage)) return { write: null, tokenPicture: dbImage };
  if (profilePicture && profilePicture !== dbImage) {
    return { write: profilePicture, tokenPicture: profilePicture };
  }
  return { write: null, tokenPicture: profilePicture ?? dbImage };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `node_modules/.bin/vitest run src/lib/avatars/url.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars/url.ts src/lib/avatars/url.test.ts
git commit -m "feat(avatars): stored-avatar URL predicate and sign-in image resolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/avatars/url.ts src/lib/avatars/url.test.ts
```

---

### Task 2: `directory.ts` — Workspace photo via DWD

**Files:**
- Create: `src/lib/avatars/directory.ts`
- Test: `src/lib/avatars/directory.test.ts`

**Interfaces:**
- Produces: `DIRECTORY_PHOTO_SCOPE: string`, `decodeWebSafeBase64(s: string): Buffer`, `type DirectoryPhoto = { bytes: Buffer; contentType: string }`, `getDirectoryPhoto(email: string): Promise<DirectoryPhoto | null>`

Notes: Google returns `photoData` in a web-safe base64 variant: `-` stands for `+` and `_` stands for `/`, and `*` or `.` can appear as padding. A 404 means the user has no custom photo or isn't in the directory, and returns `null`. Any other error is rethrown. The private key is stored with literal `\n` sequences, which must be replaced with real newlines. That's the same transform the verified probe used.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { photosGet, JWT } = vi.hoisted(() => ({
  photosGet: vi.fn(),
  JWT: vi.fn(function (this: Record<string, unknown>, opts: unknown) {
    this.opts = opts;
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT },
    admin: vi.fn(() => ({ users: { photos: { get: photosGet } } })),
  },
}));

import { getDirectoryPhoto, decodeWebSafeBase64, DIRECTORY_PHOTO_SCOPE } from "./directory";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GCP_CLIENT_EMAIL = "sa@proj.iam.gserviceaccount.com";
  process.env.GCP_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
  process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@marketfoundry.agency";
});

describe("decodeWebSafeBase64", () => {
  it("decodes Google's web-safe variant (- _ and * padding)", () => {
    // standard base64 of bytes [0xfb, 0xff] is "+/8=" → web-safe "-_8*"
    expect([...decodeWebSafeBase64("-_8*")]).toEqual([0xfb, 0xff]);
  });
});

describe("getDirectoryPhoto", () => {
  it("impersonates the admin with the directory scope and returns decoded bytes", async () => {
    photosGet.mockResolvedValue({ data: { photoData: "-_8*", mimeType: "image/png" } });
    const r = await getDirectoryPhoto("jane@marketfoundry.agency");
    expect(r).toEqual({ bytes: Buffer.from([0xfb, 0xff]), contentType: "image/png" });
    expect(photosGet).toHaveBeenCalledWith({ userKey: "jane@marketfoundry.agency" });
    const opts = JWT.mock.calls[0][0] as { subject: string; scopes: string[]; key: string };
    expect(opts.subject).toBe("admin@marketfoundry.agency");
    expect(opts.scopes).toEqual([DIRECTORY_PHOTO_SCOPE]);
    expect(opts.key).toContain("\nabc\n");
  });

  it("returns null on 404 (no photo / not in directory)", async () => {
    photosGet.mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    expect(await getDirectoryPhoto("x@marketfoundry.agency")).toBeNull();
  });

  it("returns null when the response has no photoData", async () => {
    photosGet.mockResolvedValue({ data: {} });
    expect(await getDirectoryPhoto("x@marketfoundry.agency")).toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    photosGet.mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 }));
    await expect(getDirectoryPhoto("x@marketfoundry.agency")).rejects.toThrow("Forbidden");
  });

  it("throws a clear error when env is missing", async () => {
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    await expect(getDirectoryPhoto("x@marketfoundry.agency")).rejects.toThrow(/GOOGLE_WORKSPACE_ADMIN_EMAIL/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run src/lib/avatars/directory.test.ts`
Expected: FAIL, cannot resolve `./directory`.

- [ ] **Step 3: Implement**

```ts
import { google } from "googleapis";

/** Admin SDK scope granted to the service account via domain-wide delegation. */
export const DIRECTORY_PHOTO_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user.readonly";

export type DirectoryPhoto = { bytes: Buffer; contentType: string };

/** Google's photoData uses a web-safe base64 variant: - → +, _ → /, * or . → = */
export function decodeWebSafeBase64(s: string): Buffer {
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/").replace(/[*.]/g, "="),
    "base64"
  );
}

function directoryClient() {
  // Read env at call time — never at module init.
  const email = process.env.GCP_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GCP_PRIVATE_KEY?.trim();
  const subject = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim();
  const missing = [
    !email && "GCP_CLIENT_EMAIL",
    !rawKey && "GCP_PRIVATE_KEY",
    !subject && "GOOGLE_WORKSPACE_ADMIN_EMAIL",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Directory photo source not configured. Missing: ${missing.join(", ")}`);
  }
  const auth = new google.auth.JWT({
    email,
    key: rawKey!.replace(/\\n/g, "\n"),
    scopes: [DIRECTORY_PHOTO_SCOPE],
    subject,
  });
  return google.admin({ version: "directory_v1", auth });
}

/**
 * The Workspace profile photo for an org account, or null when the user has no
 * custom photo or is not in the directory (the API answers 404 for both).
 * Note: the API serves a 96×96 thumbnail.
 */
export async function getDirectoryPhoto(email: string): Promise<DirectoryPhoto | null> {
  const dir = directoryClient();
  try {
    const res = await dir.users.photos.get({ userKey: email });
    const { photoData, mimeType } = res.data;
    if (!photoData) return null;
    return { bytes: decodeWebSafeBase64(photoData), contentType: mimeType || "image/jpeg" };
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `node_modules/.bin/vitest run src/lib/avatars/directory.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars/directory.ts src/lib/avatars/directory.test.ts
git commit -m "feat(avatars): Workspace Directory photo source via domain-wide delegation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/avatars/directory.ts src/lib/avatars/directory.test.ts
```

---

### Task 3: `storage.ts` — Supabase Storage upsert

**Files:**
- Create: `src/lib/avatars/storage.ts`
- Test: `src/lib/avatars/storage.test.ts`

**Interfaces:**
- Consumes: `STORED_AVATAR_PATH_MARKER` from `./url`
- Produces: `AVATAR_BUCKET = "avatars"`, `avatarExtension(contentType: string): string`, `uploadAvatar(userId: string, bytes: Buffer, contentType: string): Promise<string>` returns a public URL with `?v=<first 10 hex of sha256(bytes)>`

Notes: this uses the REST endpoint `POST {SUPABASE_URL}/storage/v1/object/avatars/{path}` with `x-upsert: true`, which avoids adding `@supabase/supabase-js`. The `?v=` content hash busts the CDN cache when a photo changes, and keeps re-runs idempotent: the same bytes produce the same URL, so the column doesn't change.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { uploadAvatar, avatarExtension } from "./storage";
import { isStoredAvatarUrl } from "./url";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.SUPABASE_URL = "https://proj.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});
afterEach(() => vi.unstubAllGlobals());

describe("avatarExtension", () => {
  it("maps known image types and rejects others", () => {
    expect(avatarExtension("image/jpeg")).toBe("jpg");
    expect(avatarExtension("image/png")).toBe("png");
    expect(avatarExtension("image/webp")).toBe("webp");
    expect(() => avatarExtension("text/html")).toThrow(/Unsupported avatar content type/);
  });
});

describe("uploadAvatar", () => {
  it("upserts {userId}.{ext} with the service key and returns the versioned public URL", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const bytes = Buffer.from([1, 2, 3]);
    const v = createHash("sha256").update(bytes).digest("hex").slice(0, 10);

    const url = await uploadAvatar("u-1", bytes, "image/png");

    expect(url).toBe(`https://proj.supabase.co/storage/v1/object/public/avatars/u-1.png?v=${v}`);
    expect(isStoredAvatarUrl(url)).toBe(true);
    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe("https://proj.supabase.co/storage/v1/object/avatars/u-1.png");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer service-key");
    expect(h["x-upsert"]).toBe("true");
    expect(h["Content-Type"]).toBe("image/png");
  });

  it("throws with status on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("bucket not found", { status: 404 }));
    await expect(uploadAvatar("u-1", Buffer.from([1]), "image/jpeg")).rejects.toThrow(/404.*bucket not found/);
  });

  it("throws a clear error when env is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(uploadAvatar("u-1", Buffer.from([1]), "image/jpeg")).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run src/lib/avatars/storage.test.ts`
Expected: FAIL, cannot resolve `./storage`.

- [ ] **Step 3: Implement**

```ts
import { createHash } from "node:crypto";
import { STORED_AVATAR_PATH_MARKER } from "./url";

export const AVATAR_BUCKET = "avatars";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function avatarExtension(contentType: string): string {
  const ext = EXT_BY_TYPE[contentType.toLowerCase()];
  if (!ext) throw new Error(`Unsupported avatar content type: ${contentType}`);
  return ext;
}

/**
 * Upsert the avatar at avatars/{userId}.{ext} and return its public URL.
 * Server-only: uses the service_role key. The ?v= content hash busts the CDN
 * cache when the photo changes and is stable when it does not.
 */
export async function uploadAvatar(userId: string, bytes: Buffer, contentType: string): Promise<string> {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing = [!base && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) {
    throw new Error(`Avatar storage not configured. Missing: ${missing.join(", ")}`);
  }
  const path = `${userId}.${avatarExtension(contentType)}`;
  const res = await fetch(`${base}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key!,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Avatar upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const v = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return `${base}${STORED_AVATAR_PATH_MARKER}${path}?v=${v}`;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `node_modules/.bin/vitest run src/lib/avatars/storage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars/storage.ts src/lib/avatars/storage.test.ts
git commit -m "feat(avatars): Supabase Storage upsert with content-hashed public URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/avatars/storage.ts src/lib/avatars/storage.test.ts
```

---

### Task 4: `capture.ts` — per-user orchestration

**Files:**
- Create: `src/lib/avatars/capture.ts`
- Test: `src/lib/avatars/capture.test.ts`

**Interfaces:**
- Consumes: `getDirectoryPhoto(email): Promise<DirectoryPhoto | null>` from `./directory`, and `uploadAvatar(userId, bytes, contentType): Promise<string>` from `./storage`
- Produces: `ORG_EMAIL_DOMAIN = "@marketfoundry.agency"`, `isOrgEmail(email: string): boolean`, `type CaptureResult = { status: "stored"; url: string } | { status: "would-store"; contentType: string; byteLength: number } | { status: "no-photo" } | { status: "skipped"; reason: "non-org-email" }`, `captureUserAvatar(user: { id: string; email: string }, opts?: { dryRun?: boolean }, deps?: CaptureDeps): Promise<CaptureResult>`, `interface CaptureDeps { getDirectoryPhoto: typeof getDirectoryPhoto; uploadAvatar: typeof uploadAvatar }`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { captureUserAvatar, isOrgEmail, type CaptureDeps } from "./capture";

function deps(photo: { bytes: Buffer; contentType: string } | null): CaptureDeps {
  return {
    getDirectoryPhoto: vi.fn().mockResolvedValue(photo),
    uploadAvatar: vi.fn().mockResolvedValue("https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=1"),
  };
}
const PHOTO = { bytes: Buffer.from([1, 2, 3]), contentType: "image/png" };

describe("isOrgEmail", () => {
  it("matches the org domain case-insensitively and nothing else", () => {
    expect(isOrgEmail("Jane@MarketFoundry.Agency")).toBe(true);
    expect(isOrgEmail("jane@1o8.agency")).toBe(false);
    expect(isOrgEmail("jane@marketfoundry.agency.evil.com")).toBe(false);
  });
});

describe("captureUserAvatar", () => {
  it("skips non-org emails without calling the directory", async () => {
    const d = deps(PHOTO);
    expect(await captureUserAvatar({ id: "u-1", email: "c@client.com" }, {}, d)).toEqual({ status: "skipped", reason: "non-org-email" });
    expect(d.getDirectoryPhoto).not.toHaveBeenCalled();
  });

  it("returns no-photo when the directory has none, without uploading", async () => {
    const d = deps(null);
    expect(await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, {}, d)).toEqual({ status: "no-photo" });
    expect(d.uploadAvatar).not.toHaveBeenCalled();
  });

  it("uploads and returns the stored URL", async () => {
    const d = deps(PHOTO);
    const r = await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, {}, d);
    expect(r).toEqual({ status: "stored", url: "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=1" });
    expect(d.uploadAvatar).toHaveBeenCalledWith("u-1", PHOTO.bytes, "image/png");
  });

  it("dry-run fetches the photo but never uploads", async () => {
    const d = deps(PHOTO);
    const r = await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, { dryRun: true }, d);
    expect(r).toEqual({ status: "would-store", contentType: "image/png", byteLength: 3 });
    expect(d.uploadAvatar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run src/lib/avatars/capture.test.ts`
Expected: FAIL, cannot resolve `./capture`.

- [ ] **Step 3: Implement**

```ts
import { getDirectoryPhoto } from "./directory";
import { uploadAvatar } from "./storage";

export const ORG_EMAIL_DOMAIN = "@marketfoundry.agency";

export function isOrgEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(ORG_EMAIL_DOMAIN);
}

export type CaptureResult =
  | { status: "stored"; url: string }
  | { status: "would-store"; contentType: string; byteLength: number }
  | { status: "no-photo" }
  | { status: "skipped"; reason: "non-org-email" };

export interface CaptureDeps {
  getDirectoryPhoto: typeof getDirectoryPhoto;
  uploadAvatar: typeof uploadAvatar;
}

/**
 * Fetch an org member's Workspace photo and store it. Does NOT touch the DB —
 * the caller decides whether to write users.image. Errors propagate.
 */
export async function captureUserAvatar(
  user: { id: string; email: string },
  opts: { dryRun?: boolean } = {},
  deps: CaptureDeps = { getDirectoryPhoto, uploadAvatar }
): Promise<CaptureResult> {
  if (!isOrgEmail(user.email)) return { status: "skipped", reason: "non-org-email" };
  const photo = await deps.getDirectoryPhoto(user.email);
  if (!photo) return { status: "no-photo" };
  if (opts.dryRun) {
    return { status: "would-store", contentType: photo.contentType, byteLength: photo.bytes.length };
  }
  const url = await deps.uploadAvatar(user.id, photo.bytes, photo.contentType);
  return { status: "stored", url };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `node_modules/.bin/vitest run src/lib/avatars/`
Expected: PASS, 21 tests in total across url (6), directory (6), storage (4) and capture (5). If the count is off, recount before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatars/capture.ts src/lib/avatars/capture.test.ts
git commit -m "feat(avatars): per-user capture orchestration with dry-run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/avatars/capture.ts src/lib/avatars/capture.test.ts
```

---

### Task 5: Login paths must not overwrite a stored avatar

**Why:** today both login paths write Google's `picture` into `users.image` whenever it differs from the stored value: `src/lib/auth.ts` in the jwt callback at sign-in, and `src/lib/auth-db.ts` on every request. After the backfill, every user whose Google token carries a `picture` would get their stored avatar silently replaced by the hotlink again. Separately, the client-side user menu and portal shell read `token.picture`, which is never taken from the DB.

**Files:**
- Modify: `src/lib/auth.ts`, the jwt callback block starting at the comment `// Persist Google's picture onto users.image`
- Modify: `src/lib/auth-db.ts`, the `const nextImage = session.user.image ?? null;` line in the profile-sync `else` branch
- Test: `src/lib/auth-db.test.ts`, adding two tests inside `describe("name/image profile sync")`

**Interfaces:**
- Consumes: `isStoredAvatarUrl`, `resolveSignInImage` from `@/lib/avatars/url`

- [ ] **Step 1: Write the failing tests.** Append them inside `describe("name/image profile sync", ...)` in `src/lib/auth-db.test.ts`, after the last `it(...)` in that block. Use unique emails so the auth-identity memo can't serve a row from an earlier test.

```ts
    it("does NOT overwrite a stored avatar with the provider's Google picture", async () => {
      const stored = "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abc";
      authMock.mockResolvedValue({
        user: { email: "stored-a@example.com", name: "Existing Name", image: "https://lh3.googleusercontent.com/a/x" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: stored }];

      await getAuthSession();

      expect(db.update).not.toHaveBeenCalled();
    });

    it("still writes a changed name but keeps the stored avatar", async () => {
      const stored = "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abc";
      authMock.mockResolvedValue({
        user: { email: "stored-b@example.com", name: "New Name", image: "https://lh3.googleusercontent.com/a/x" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: stored }];

      await getAuthSession();

      expect(db.update).toHaveBeenCalledTimes(1);
      const setFn = vi.mocked(db.update).mock.results[0].value.set as ReturnType<typeof vi.fn>;
      expect(setFn.mock.calls[0][0]).toEqual({ name: "New Name", image: stored });
    });
```

- [ ] **Step 2: Run the tests and confirm the first one fails**

Run: `node_modules/.bin/vitest run src/lib/auth-db.test.ts`
Expected: "does NOT overwrite a stored avatar" FAILS because update was called once. "still writes a changed name" FAILS because `image` is the Google URL. All previously existing tests still pass.

- [ ] **Step 3: Change `auth-db.ts`.** Add the import next to the other `@/lib` imports:

```ts
import { isStoredAvatarUrl } from "@/lib/avatars/url";
```

Replace the single line `const nextImage = session.user.image ?? null;` with:

```ts
    // An avatar we captured into our own storage is authoritative: treat the
    // provider's picture as "told us nothing" so it can never overwrite it.
    const nextImage = isStoredAvatarUrl(dbUser.image)
      ? null
      : (session.user.image ?? null);
```

Leave everything else in that block unchanged, **including the `patchAuthIdentity(email, written)` call.**

- [ ] **Step 4: Run and confirm it passes**

Run: `node_modules/.bin/vitest run src/lib/auth-db.test.ts`
Expected: all PASS, with the previous count + 2.

- [ ] **Step 5: Change `auth.ts`.** Add the import:

```ts
import { resolveSignInImage } from "@/lib/avatars/url";
```

Replace this block:

```ts
          // Persist Google's picture onto users.image so /team and directory
          // cards can show it for everyone, not only the signed-in session.
          const picture =
            typeof profile.picture === "string" ? profile.picture : null;
          if (picture && picture !== dbUser.image) {
            await db
              .update(users)
              .set({ image: picture })
              .where(eq(users.id, dbUser.id));
          }
```

with:

```ts
          // Persist Google's picture onto users.image so /team and directory
          // cards can show it for everyone — unless we already captured the
          // user's avatar into our own storage, which always wins. The token
          // carries the stored avatar (or the DB image when Google sends none)
          // so the client-side user menu / portal shell show it too.
          const picture =
            typeof profile.picture === "string" ? profile.picture : null;
          const img = resolveSignInImage({ dbImage: dbUser.image, profilePicture: picture });
          if (img.write) {
            await db
              .update(users)
              .set({ image: img.write })
              .where(eq(users.id, dbUser.id));
          }
          token.picture = img.tokenPicture;
```

The jwt callback's decision logic is exactly `resolveSignInImage`, which Task 1 already covers. There's no NextAuth-callback harness in `auth.test.ts` and this plan doesn't add one.

- [ ] **Step 6: Run the auth tests and tsc**

Run: `node_modules/.bin/vitest run src/lib/auth-db.test.ts src/lib/auth.test.ts src/lib/auth-identity-cache.test.ts src/lib/avatars/`
Expected: all PASS.
Run: `node_modules/.bin/tsc --noEmit 2>&1 | tail -30` in the background, which takes about 2 minutes.
Expected: zero errors in `src/lib/auth.ts`, `src/lib/auth-db.ts`, `src/lib/auth-db.test.ts`, or `src/lib/avatars/*`. Record any other errors by filename as the pre-existing baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-db.ts src/lib/auth-db.test.ts
git commit -m "fix(auth): never overwrite a stored avatar with Google's picture; token prefers it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/auth.ts src/lib/auth-db.ts src/lib/auth-db.test.ts
```

---

### Task 6: Backfill script (snapshot, dry-run, live, restore)

**Files:**
- Create: `scripts/backfill-avatars.ts`

**Interfaces:**
- Consumes: `captureUserAvatar`, `isOrgEmail` from `../src/lib/avatars/capture`, and `isStoredAvatarUrl` from `../src/lib/avatars/url`

Behaviour:
- `--dry-run`: writes the snapshot, selects targets, and calls the Directory API (read-only). No upload and no DB write. Prints counts.
- no flag (LIVE): writes the snapshot (and aborts if that fails), uploads, then `UPDATE users SET image = url WHERE id = …`, but only when the URL differs from the current value.
- `--restore=<snapshot.json>`: for every snapshot row, sets `users.image` back to the snapshotted value. This is a prod write too.
- Targets: `employment_status = 'active'` AND the email ends with `@marketfoundry.agency`, compared case-insensitively.
- Snapshot: every user's `{ id, email, image }` goes to `~/mfhub-backups/avatars-snapshot-<ISO>.json`. That's outside the repo, so it can never be committed.

- [ ] **Step 1: Write the script**

```ts
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Backfill users.image from Google Workspace profile photos stored in Supabase.
 *
 *   npx tsx scripts/backfill-avatars.ts --dry-run          # read-only: counts only
 *   npx tsx scripts/backfill-avatars.ts                    # LIVE: uploads + prod UPDATEs
 *   npx tsx scripts/backfill-avatars.ts --restore=<file>   # LIVE: roll users.image back
 *
 * Every mode first snapshots SELECT id,email,image FROM users to
 * ~/mfhub-backups/avatars-snapshot-<ISO>.json. LIVE aborts if that fails.
 * Idempotent: the stored URL carries a content hash, so unchanged photos
 * produce no UPDATE on re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Row = { id: string; email: string; image: string | null };

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const restoreArg = args.find((a) => a.startsWith("--restore="));

  // Import AFTER config(): a static import is hoisted above it and the db
  // would silently connect to localhost.
  const { db } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { captureUserAvatar, isOrgEmail } = await import("../src/lib/avatars/capture");
  const { isStoredAvatarUrl } = await import("../src/lib/avatars/url");

  // ── Snapshot (every mode) ────────────────────────────────────────────
  const all: Row[] = await db.select({ id: users.id, email: users.email, image: users.image }).from(users);
  const dir = join(homedir(), "mfhub-backups");
  mkdirSync(dir, { recursive: true });
  const snapPath = join(dir, `avatars-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(snapPath, JSON.stringify(all, null, 2));
  console.log(`snapshot: ${all.length} users → ${snapPath}`);

  // ── Restore ──────────────────────────────────────────────────────────
  if (restoreArg) {
    const file = restoreArg.slice("--restore=".length);
    const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];
    let restored = 0;
    for (const r of rows) {
      await db.update(users).set({ image: r.image }).where(eq(users.id, r.id));
      restored++;
    }
    console.log(`restored users.image for ${restored} users from ${file}`);
    return 0;
  }

  // ── Capture ──────────────────────────────────────────────────────────
  const targets: Row[] = await db
    .select({ id: users.id, email: users.email, image: users.image })
    .from(users)
    .where(sql`${users.employmentStatus} = 'active' and lower(${users.email}) like '%@marketfoundry.agency'`);
  console.log(`mode: ${dryRun ? "DRY-RUN (no uploads, no DB writes)" : "LIVE"}`);
  console.log(`targets: ${targets.length} active org users (of ${all.length} total, ${all.filter((u) => isOrgEmail(u.email)).length} org of any status)`);

  const c = { stored: 0, wouldStore: 0, unchanged: 0, noPhoto: 0, skipped: 0, errors: 0 };
  const replacing = { fromNull: 0, fromGoogleOrOther: 0, fromStored: 0 };
  const noPhoto: string[] = [];
  const errors: string[] = [];

  for (const u of targets) {
    try {
      const r = await captureUserAvatar({ id: u.id, email: u.email }, { dryRun });
      if (r.status === "skipped") { c.skipped++; continue; }
      if (r.status === "no-photo") { c.noPhoto++; noPhoto.push(u.email); continue; }
      if (u.image === null) replacing.fromNull++;
      else if (isStoredAvatarUrl(u.image)) replacing.fromStored++;
      else replacing.fromGoogleOrOther++;
      if (r.status === "would-store") { c.wouldStore++; continue; }
      if (r.url === u.image) { c.unchanged++; continue; }
      await db.update(users).set({ image: r.url }).where(eq(users.id, u.id));
      c.stored++;
    } catch (e) {
      c.errors++;
      errors.push(`${u.email}: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  console.log("\n── summary ──");
  console.log(dryRun ? `would store: ${c.wouldStore}` : `stored (users.image updated): ${c.stored}   unchanged: ${c.unchanged}`);
  console.log(`  of which currently NULL: ${replacing.fromNull} | Google/other URL: ${replacing.fromGoogleOrOther} | already stored: ${replacing.fromStored}`);
  console.log(`no photo in directory (keep current value): ${c.noPhoto}`);
  console.log(`skipped (non-org): ${c.skipped}`);
  console.log(`errors: ${c.errors}`);
  if (noPhoto.length) console.log(`\nno-photo users:\n  ${noPhoto.join("\n  ")}`);
  if (errors.length) console.log(`\nerrors:\n  ${errors.join("\n  ")}`);
  return c.errors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Typecheck.** Run `node_modules/.bin/tsc --noEmit 2>&1 | grep -E "backfill-avatars|avatars/" || echo "no errors in our files"` in the background.
Expected: `no errors in our files`. `scripts/` might be excluded from tsconfig. If so, check with `grep -n '"scripts' tsconfig.json`, then typecheck the script via `node_modules/.bin/tsc --noEmit --skipLibCheck --esModuleInterop --module esnext --moduleResolution bundler --target es2022 --resolveJsonModule --allowImportingTsExtensions --baseUrl . --paths null scripts/backfill-avatars.ts` or simply rely on the dry-run in Step 4 to prove it runs.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-avatars.ts
git commit -m "feat(avatars): backfill script with snapshot, dry-run and restore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/backfill-avatars.ts
```

- [ ] **Step 4: DRY-RUN (read-only; the controller runs this, not a subagent).** It has to run with cwd = the main checkout so dotenv finds the env file. Imports resolve relative to the script file in the worktree.

```bash
cd /Users/manu/MFHub && npx tsx .worktrees/avatars/scripts/backfill-avatars.ts --dry-run
```
Expected: a snapshot path, a target count of about 60 to 80, and `would store` + `no photo` + `errors` adding up to targets. Show Manu the full summary.

- [ ] **Step 5: STOP.** A LIVE run, merge, push, and deploy each need Manu's separate explicit OK. Order of operations once approved:
  1. Deploy Task 5 (the login guard) to prod **before** the LIVE backfill. Otherwise an old-code login between the backfill and the deploy reverts that user's avatar. (It's recoverable: re-running the backfill is idempotent and fixes it.)
  2. LIVE backfill from the main checkout. Keep the printed snapshot path.
  3. Rollback, if needed: `npx tsx scripts/backfill-avatars.ts --restore=<snapshot path>`.

---

## Display verification (done during planning, 2026-09-22)

The spec's "~82 files" figure was wrong. 14 files render person avatars:
- **17 sites / 10 files read `users.image` from the DB.** These light up automatically: portal home, admin users, shared-logins, team org tree, user detail, client onboarding, client gantt, and the SEO team/manager/client views via `AvatarCircle`. Every API route that feeds them selects `users.image`.
- **2 sites read the JWT's `session.user.image`:** `user-menu.tsx` and `portal-shell.tsx`. Task 5 fixes these, and it takes effect at the user's next sign-in.
- **4 sites show initials only.** They are out of scope and listed above under Known limits.
- `next.config` `images.remotePatterns` doesn't list `*.supabase.co`. That's fine, because no person avatar uses `next/image`. They all use Radix `AvatarImage` or a raw `<img>`.
