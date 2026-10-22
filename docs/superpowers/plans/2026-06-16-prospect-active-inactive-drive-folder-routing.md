# Status-based Drive Folder Routing (Prospect / Active / Inactive) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a client's Google Drive folder by status — create the folder tree inside the Prospect folder when the client is a Prospect, and move the existing root folder to the matching folder (Prospect / shared-drive root / Inactive) on every status transition.

**Architecture:** Add one pure helper (`resolveClientFolderParent`) that owns the `status → parent folder ID` mapping. The manual "Create Drive Folders" onboarding step resolves the parent from the client's current status before building the tree. The status-change handlers (PUT + PATCH on the client route) call the same helper, so creation and movement can never disagree. Active↔Inactive movement already exists; this adds the Prospect leg. No schema, migration, or BigQuery change.

**Tech Stack:** Next.js 16 App Router (route handlers), Drizzle ORM, Google Drive API (`src/lib/drive-client.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-prospect-active-inactive-drive-folder-routing-design.md`

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `src/lib/onboarding/client-folder-routing.ts` | **NEW.** Folder-ID constants (`PROSPECT_CLIENTS_FOLDER_ID`, `INACTIVE_CLIENTS_FOLDER_ID`) + `resolveClientFolderParent(status, sharedDriveRootId)`. Single source of truth. |
| `src/lib/onboarding/client-folder-routing.test.ts` | **NEW.** Unit tests for the resolver (all status cases). |
| `src/lib/onboarding/create-drive-folders.ts` | **MODIFY.** Rename `sharedDriveId` param → `rootParentFolderId` (cosmetic, no logic change). |
| `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts` | **MODIFY.** Select `clientStatus`; resolve parent; pass it to `createClientDriveFolders`. |
| `src/app/api/clients/[clientIdCode]/route.ts` | **MODIFY.** Import resolver; remove local `INACTIVE_CLIENTS_FOLDER_ID`; collapse the PUT + PATCH move branches into a single resolver-driven call (adds Prospect leg). |

**Locked facts (from spec):**
- Prospect folder ID: `1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7`
- Inactive folder ID: `1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT` (already hardcoded today)
- Active = `process.env.GOOGLE_SHARED_DRIVE_ID` (shared-drive root) — unchanged
- Comparison is **case-sensitive**; unknown/blank/null status → shared-drive root
- `moveClientFolder` (route.ts:245-275) is **unchanged** — already idempotent and reads the live Drive parent

---

## Task 1: Routing helper + unit tests (TDD)

**Files:**
- Create: `src/lib/onboarding/client-folder-routing.ts`
- Test: `src/lib/onboarding/client-folder-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/onboarding/client-folder-routing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveClientFolderParent,
  PROSPECT_CLIENTS_FOLDER_ID,
  INACTIVE_CLIENTS_FOLDER_ID,
} from "./client-folder-routing";

const ROOT = "ROOT_DRIVE_ID";

describe("resolveClientFolderParent", () => {
  it("routes Prospect to the prospect folder", () => {
    expect(resolveClientFolderParent("Prospect", ROOT)).toBe(PROSPECT_CLIENTS_FOLDER_ID);
  });

  it("routes Inactive to the inactive folder", () => {
    expect(resolveClientFolderParent("Inactive", ROOT)).toBe(INACTIVE_CLIENTS_FOLDER_ID);
  });

  it("routes Active to the shared-drive root", () => {
    expect(resolveClientFolderParent("Active", ROOT)).toBe(ROOT);
  });

  it("routes unknown / blank / null / undefined to the shared-drive root", () => {
    expect(resolveClientFolderParent("Lead", ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent("", ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent(null, ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent(undefined, ROOT)).toBe(ROOT);
  });

  it("is case-sensitive (lowercase 'prospect' falls through to root)", () => {
    expect(resolveClientFolderParent("prospect", ROOT)).toBe(ROOT);
  });

  it("exposes the exact production folder IDs", () => {
    expect(PROSPECT_CLIENTS_FOLDER_ID).toBe("1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7");
    expect(INACTIVE_CLIENTS_FOLDER_ID).toBe("1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/onboarding/client-folder-routing.test.ts`
Expected: FAIL — `Failed to resolve import "./client-folder-routing"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/onboarding/client-folder-routing.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// Client Drive folder routing — single source of truth for which
// parent folder a client's root folder lives in, based on status.
// Used by BOTH folder creation (onboarding step) and folder movement
// (status-change handlers) so the two can never disagree.
// ═══════════════════════════════════════════════════════════════

/** Prospect clients: the folder tree is created here while status is "Prospect". */
export const PROSPECT_CLIENTS_FOLDER_ID = "1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7";

/** Inactive / archive clients: the folder moves here while status is "Inactive". */
export const INACTIVE_CLIENTS_FOLDER_ID = "1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT";

/**
 * Resolve the Drive parent folder a client's ROOT folder should live in.
 *
 * - "Prospect" → Prospect folder
 * - "Inactive" → Inactive folder
 * - "Active" and any other / blank / null value → shared-drive root
 *
 * Comparison is case-sensitive, matching the exact status strings used in
 * the app ("Prospect", "Active", "Inactive").
 *
 * @param status            The client's status (aac.client_status).
 * @param sharedDriveRootId The shared-drive root folder ID (GOOGLE_SHARED_DRIVE_ID).
 */
export function resolveClientFolderParent(
  status: string | null | undefined,
  sharedDriveRootId: string
): string {
  switch (status) {
    case "Prospect":
      return PROSPECT_CLIENTS_FOLDER_ID;
    case "Inactive":
      return INACTIVE_CLIENTS_FOLDER_ID;
    default:
      return sharedDriveRootId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/onboarding/client-folder-routing.test.ts`
Expected: PASS — 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/client-folder-routing.ts src/lib/onboarding/client-folder-routing.test.ts
git commit -m "feat(onboarding): status→Drive-folder routing helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Route folder CREATION by status

This makes the manual "Create Drive Folders" onboarding step build the tree inside the
folder that matches the client's current status (Prospect folder for prospects).

**Files:**
- Modify: `src/lib/onboarding/create-drive-folders.ts:43,48,64`
- Modify: `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts:8,58-64,80`

- [ ] **Step 1: Rename the param in `create-drive-folders.ts` (cosmetic, honesty)**

The param is used only as the root folder's parent — renaming clarifies it is now the
resolved parent, not necessarily the shared-drive root. Three edits:

In the JSDoc (line 43), change:
```ts
 * @param sharedDriveId - The Google Shared Drive ID (from env)
```
to:
```ts
 * @param rootParentFolderId - The Drive folder the client root folder is created under
 *   (resolved from client status: Prospect / shared-drive root / Inactive)
```

In the signature (line 47-49), change:
```ts
export async function createClientDriveFolders(
  clientIdCode: string,
  sharedDriveId: string,
  clientName?: string
```
to:
```ts
export async function createClientDriveFolders(
  clientIdCode: string,
  rootParentFolderId: string,
  clientName?: string
```

In `ensureFolder` call for the root folder (line 64), change:
```ts
    parentDriveId: sharedDriveId,
```
to:
```ts
    parentDriveId: rootParentFolderId,
```

- [ ] **Step 2: Verify no other references to the old param name remain**

Run: `grep -n "sharedDriveId" src/lib/onboarding/create-drive-folders.ts`
Expected: no output (zero matches).

- [ ] **Step 3: Resolve the parent in the onboarding route**

In `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts`:

Add the import after line 8 (`import { createClientDriveFolders } ...`):
```ts
import { resolveClientFolderParent } from "@/lib/onboarding/client-folder-routing";
```

Replace the client lookup block (currently lines 58-64):
```ts
  // Look up client name for folder naming
  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = client?.clientName ?? undefined;
```
with:
```ts
  // Look up client name + status: name drives folder naming, status drives placement
  const [client] = await db
    .select({ clientName: aac.clientName, clientStatus: aac.clientStatus })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = client?.clientName ?? undefined;
  const rootParent = resolveClientFolderParent(client?.clientStatus, sharedDriveId);
```
(`sharedDriveId` is guaranteed a non-empty string here — the guard at lines 51-56 returns 500 if it is missing.)

- [ ] **Step 4: Pass the resolved parent into creation**

Change the call (currently line 80):
```ts
    const result = await createClientDriveFolders(clientIdCode, sharedDriveId, clientName);
```
to:
```ts
    const result = await createClientDriveFolders(clientIdCode, rootParent, clientName);
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "create-drive-folders|drive_folders/route" || echo "no type errors in touched files"`
Expected: `no type errors in touched files`

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/create-drive-folders.ts src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts
git commit -m "feat(onboarding): create client folder tree inside the status folder (Prospect routing)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Route folder MOVEMENT by status (add Prospect leg)

Collapse the two near-duplicate Active/Inactive move blocks into one resolver-driven call
in both the PUT and PATCH handlers, so every status transition (including into/out of
Prospect) re-homes the folder.

**Files:**
- Modify: `src/app/api/clients/[clientIdCode]/route.ts:12-16,214-220,459-465`

- [ ] **Step 1: Update imports and constants**

After line 12 (`import { driveClient } from "@/lib/drive-client";`), add:
```ts
import { resolveClientFolderParent } from "@/lib/onboarding/client-folder-routing";
```

Replace the two constants (currently lines 14-16):
```ts
const INACTIVE_CLIENTS_FOLDER_ID = "1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT";
// Shared drive root — client folders live here when active
const ACTIVE_CLIENTS_FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_ID!;
```
with (drop the now-unused INACTIVE const — the resolver owns it):
```ts
// Shared drive root — client folders live here when active; passed to the
// status→folder resolver as the default/Active destination.
const ACTIVE_CLIENTS_FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_ID!;
```

- [ ] **Step 2: Update the PUT handler move block**

Replace the block (currently lines 213-220):
```ts
  // Move Drive folder when status changes to Inactive or Active (fire-and-forget)
  if (field === "ClientStatus") {
    if (value === "Inactive") {
      moveClientFolder(clientIdCode, INACTIVE_CLIENTS_FOLDER_ID, "inactive").catch(() => {});
    } else if (value === "Active") {
      moveClientFolder(clientIdCode, ACTIVE_CLIENTS_FOLDER_ID, "active").catch(() => {});
    }
  }
```
with:
```ts
  // Move the Drive folder to match the new status (fire-and-forget).
  // Prospect → Prospect folder, Inactive → Inactive folder, Active/other → root.
  if (field === "ClientStatus") {
    const target = resolveClientFolderParent(value, ACTIVE_CLIENTS_FOLDER_ID);
    moveClientFolder(clientIdCode, target, value).catch(() => {});
  }
```

- [ ] **Step 3: Update the PATCH handler move block**

Replace the block (currently lines 458-465):
```ts
  // Move Drive folder when status changes to Inactive or Active (fire-and-forget)
  if (clientStatus !== undefined && clientStatus !== client.clientStatus) {
    if (clientStatus === "Inactive") {
      moveClientFolder(clientIdCode, INACTIVE_CLIENTS_FOLDER_ID, "inactive").catch(() => {});
    } else if (clientStatus === "Active") {
      moveClientFolder(clientIdCode, ACTIVE_CLIENTS_FOLDER_ID, "active").catch(() => {});
    }
  }
```
with:
```ts
  // Move the Drive folder to match the new status (fire-and-forget).
  // Prospect → Prospect folder, Inactive → Inactive folder, Active/other → root.
  if (clientStatus !== undefined && clientStatus !== client.clientStatus) {
    const target = resolveClientFolderParent(clientStatus, ACTIVE_CLIENTS_FOLDER_ID);
    moveClientFolder(clientIdCode, target, clientStatus).catch(() => {});
  }
```

- [ ] **Step 4: Verify the old constant is fully gone and types compile**

Run: `grep -n "INACTIVE_CLIENTS_FOLDER_ID" src/app/api/clients/[clientIdCode]/route.ts || echo "INACTIVE const removed"`
Expected: `INACTIVE const removed` (the symbol now lives only in the routing module).

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "clients/\[clientIdCode\]/route" || echo "no type errors in route.ts"`
Expected: `no type errors in route.ts`

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[clientIdCode]/route.ts"
git commit -m "feat(clients): move client folder to match status on transition (adds Prospect leg)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm run test`
Expected: all tests pass, including `client-folder-routing.test.ts` (6 tests). No regressions.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual render/behavior check (against running dev server, PORT=3000)**

> Per project rule: VERIFY RENDER/BEHAVIOR, not just build. These touch live Drive +
> the PROD Supabase DB, so use a disposable test client.

1. Create (or pick) a client with status **Prospect**.
2. Run the **Create Drive Folders** onboarding step for it.
3. In Google Drive, confirm the `{clientIdCode}_{clientName}` root folder (and its tree)
   appears **inside the Prospect folder** (`1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7`), not at the
   shared-drive root.
4. Change status **Prospect → Active**; confirm the root folder moves to the shared-drive
   root.
5. Change **Active → Inactive**; confirm it moves into the Inactive folder
   (`1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT`).
6. Change **Inactive → Active**; confirm it moves back to the shared-drive root.
7. (Optional) Change **Active → Prospect**; confirm it moves back into the Prospect folder.

- [ ] **Step 4: Confirm no push without explicit OK**

All commits stay local. Do **not** `git push` — surface the branch state to the user and
wait for explicit push confirmation (Vercel auto-deploys `main`; this work is on a feature
branch).

---

## Self-Review (completed during planning)

- **Spec coverage:** Creation-in-Prospect (Task 2) ✓; transitions in all directions incl.
  Prospect (Task 3) ✓; Active=root unchanged (Task 3 keeps `ACTIVE_CLIENTS_FOLDER_ID`) ✓;
  unknown→root (Task 1 default branch + tests) ✓; no schema/migration/BQ change ✓;
  no backfill / no client-creation change (not touched) ✓.
- **Placeholder scan:** none — every code step shows full code.
- **Type consistency:** `resolveClientFolderParent(status, sharedDriveRootId)` signature is
  identical across Task 1 (def), Task 2 (onboarding route call), and Task 3 (PUT + PATCH
  calls). `createClientDriveFolders(clientIdCode, rootParentFolderId, clientName?)` matches
  between Task 2's rename and its call site.
