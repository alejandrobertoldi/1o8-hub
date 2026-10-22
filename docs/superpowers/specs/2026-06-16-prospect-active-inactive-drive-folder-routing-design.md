# Design Spec — Status-based Drive folder routing (Prospect / Active / Inactive)

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete) — ready for `/writing-plans`
**Author:** Manu + Claude

## Problem

A client's Google Drive folder must live in a different parent folder depending on the
client's status:

| Status     | Folder lives in                                          | Drive folder ID                     |
| ---------- | -------------------------------------------------------- | ----------------------------------- |
| `Prospect` | Prospect clients folder                                  | `1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7` |
| `Active`   | 1o8Hub shared-drive root (`GOOGLE_SHARED_DRIVE_ID`)      | env var (unchanged)                 |
| `Inactive` | Inactive/archive clients folder                          | `1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT` |

Two requirements:

1. **Creation placement** — when the folder tree is *created* while the client is a
   Prospect, the tree must be built **inside the Prospect folder**, not at the root.
2. **Transition movement** — when status changes, the client's existing root folder must
   **move** to the folder that matches the new status, in every direction
   (Prospect↔Active↔Inactive).

## What already exists (do not rebuild)

Verified in code on 2026-06-16:

- [`src/app/api/clients/[clientIdCode]/route.ts`](../../../src/app/api/clients/[clientIdCode]/route.ts)
  - `INACTIVE_CLIENTS_FOLDER_ID = "1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT"` (line 14) — already the exact inactive folder.
  - `ACTIVE_CLIENTS_FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_ID` (line 16).
  - `PUT` handler (lines 214-220) and `PATCH` handler (lines 459-465) already move the
    client folder on status change to `Inactive` (→ inactive folder) or `Active` (→ root),
    fire-and-forget.
  - `moveClientFolder(clientIdCode, targetFolderId, label)` (lines 245-275): fetches the
    client's root folder from `driveFolders`, reads the **live** Drive parent via
    `getFile`, and calls `driveClient.moveFile(...)`. Idempotent — skips if already in the
    target. **Unchanged by this design.**
- [`src/lib/onboarding/create-drive-folders.ts`](../../../src/lib/onboarding/create-drive-folders.ts)
  - `createClientDriveFolders(clientIdCode, sharedDriveId, clientName?)` builds the root
    client folder under `sharedDriveId` (line 64), then recurses children under the root
    folder. The `sharedDriveId` param is used **only** as the root folder's parent.
- [`src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts`](../../../src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts)
  - The manual "Create Drive Folders" onboarding step. Reads `GOOGLE_SHARED_DRIVE_ID`
    (line 50), looks up `clientName` (lines 59-64), calls `createClientDriveFolders`
    (line 80).

**The only missing leg is `Prospect`**: it is absent from the move map, and folder
creation ignores status (always roots at the shared-drive root).

## Locked decisions

- **Creation trigger:** keep the existing **manual** "Create Drive Folders" onboarding
  step. No auto-create on client creation. POST `/api/clients` is **untouched**.
- **Active = shared-drive root** (`GOOGLE_SHARED_DRIVE_ID`). No change to the Active leg's
  target.
- **Prospect folder ID is hardcoded** (`1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7`), mirroring the
  existing hardcoded `INACTIVE_CLIENTS_FOLDER_ID`. (Moving all three to env vars is a
  possible future cleanup — out of scope.)
- **Unknown/blank status defaults to root.** Any status string other than `Prospect` /
  `Inactive` routes to the shared-drive root. Comparison is case-sensitive on the exact
  strings `"Prospect"`, `"Active"`, `"Inactive"` (consistent with existing code).
- **Transitions into Prospect re-home the folder.** `Active → Prospect` and
  `Inactive → Prospect` move the folder into the Prospect folder. Status is the single
  source of truth for placement.
- **No backfill.** Existing prospects whose folders already sit at root are left in place
  until their status is re-flipped or the create step is re-triggered. No cross-project
  sweep.
- **No schema change, no migration, no BigQuery change.**

## Architecture (Approach A — single shared mapping)

Centralize the `status → parent folder` mapping in one module so creation and
transition-movement can never drift.

### New module — `src/lib/onboarding/client-folder-routing.ts`

Single source of truth for status-based Drive folder placement.

- `export const PROSPECT_CLIENTS_FOLDER_ID = "1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7";`
- `export const INACTIVE_CLIENTS_FOLDER_ID = "1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT";`
  (move the constant here; re-import in `route.ts`).
- `export function resolveClientFolderParent(status: string | null | undefined, sharedDriveRootId: string): string`
  - `"Prospect"` → `PROSPECT_CLIENTS_FOLDER_ID`
  - `"Inactive"` → `INACTIVE_CLIENTS_FOLDER_ID`
  - `"Active"` and everything else → `sharedDriveRootId`

Pure function, no DB/Drive access — trivially unit-testable.

### Change 1 — creation routing

[`onboarding/drive_folders/route.ts`](../../../src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts):

- Extend the existing client lookup (line 59) to also select `aac.clientStatus`.
- Compute `const rootParent = resolveClientFolderParent(client?.clientStatus, sharedDriveId);`
- Pass `rootParent` (instead of `sharedDriveId`) into `createClientDriveFolders`.

[`create-drive-folders.ts`](../../../src/lib/onboarding/create-drive-folders.ts):

- Rename the `sharedDriveId` parameter to `rootParentFolderId` for honesty (it is now the
  resolved parent, not necessarily the shared-drive root). Update the JSDoc. **No logic
  change** — line 64 already uses it as the root folder's `parentDriveId`; children hang
  off the created root folder so they follow automatically.

### Change 2 — transition routing

[`route.ts`](../../../src/app/api/clients/[clientIdCode]/route.ts):

- Import `resolveClientFolderParent` and `INACTIVE_CLIENTS_FOLDER_ID` from the new module;
  delete the local `INACTIVE_CLIENTS_FOLDER_ID` const (keep `ACTIVE_CLIENTS_FOLDER_ID` =
  `GOOGLE_SHARED_DRIVE_ID` as the root reference passed into the resolver).
- **PUT** (lines 214-220) and **PATCH** (lines 459-465): replace the
  `if Inactive / else if Active` branches with a single call:
  ```ts
  if (/* status field changed */) {
    const target = resolveClientFolderParent(value /* or clientStatus */, ACTIVE_CLIENTS_FOLDER_ID);
    moveClientFolder(clientIdCode, target, value).catch(() => {});
  }
  ```
  - PUT triggers on `field === "ClientStatus"` (value = new status).
  - PATCH triggers on `clientStatus !== undefined && clientStatus !== client.clientStatus`.
  - This adds the `Prospect` destination automatically and covers all directions.
- `moveClientFolder` is unchanged.

## Lifecycle walk-through

| Action                                            | Result                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Create client as `Prospect`, run create-folders   | Tree built **inside** Prospect folder.                        |
| `Prospect → Active`                                | Root folder moved to shared-drive root.                       |
| `Active → Inactive`                                | Root folder moved to Inactive folder.                         |
| `Inactive → Active`                                | Root folder moved back to shared-drive root.                  |
| `Active/Inactive → Prospect`                       | Root folder moved into Prospect folder.                       |
| Re-run create-folders after a status change        | No-op for placement (folders exist; `ensureFolder` returns them). Placement owned by the transition handler. |
| Status set to unknown/blank string                 | Routes to shared-drive root (safe default).                   |

## Edge cases

- **No folder yet at transition:** `moveClientFolder` logs "no client folder found" and
  returns — harmless (e.g. a prospect promoted before folders are created; the later
  create step will root at the then-current status).
- **DB/Drive parent drift:** move reads the **live** Drive parent via `getFile`, so it
  works off Drive truth, not the `driveFolders` cache.
- **Idempotent move:** if the folder is already in the target, the move is skipped.
- **Fire-and-forget:** Drive failures are logged, never block the status update (existing
  behavior, preserved).

## Out of scope

- Auto-creating folders on client creation.
- Backfilling/sweeping existing prospect folders.
- Moving folder IDs to env vars.
- Any schema, migration, BigQuery, or POST `/api/clients` change.

## Testing

- **Unit:** `resolveClientFolderParent` — `Prospect`, `Active`, `Inactive`, unknown/blank,
  null/undefined → assert correct folder ID. (Vitest, matches repo test setup.)
- **Manual (in-app):** create a client as Prospect → run Create Drive Folders → confirm the
  tree appears under the Prospect folder in Drive. Flip Prospect→Active→Inactive→Active and
  confirm the root folder moves each time. Verify render/behavior, not just build.

## File change list

| File                                                                          | Change                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/onboarding/client-folder-routing.ts`                                 | **NEW** — folder-ID constants + `resolveClientFolderParent`.           |
| `src/app/api/clients/[clientIdCode]/onboarding/drive_folders/route.ts`        | Select `clientStatus`; resolve parent; pass to `createClientDriveFolders`. |
| `src/lib/onboarding/create-drive-folders.ts`                                  | Rename `sharedDriveId` param → `rootParentFolderId` + JSDoc. No logic change. |
| `src/app/api/clients/[clientIdCode]/route.ts`                                 | Import resolver/const; collapse PUT + PATCH move blocks to use resolver (adds Prospect leg). |
| `src/lib/onboarding/client-folder-routing.test.ts`                            | **NEW** — unit tests for the resolver.                                 |

Net: 2 new files, 3 edited. ~40 lines of logic.
