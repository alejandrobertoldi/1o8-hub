# Listing Image "Set as Live" — Design Spec

**Date:** 2026-06-10
**Status:** Approved (design), pending implementation plan
**Route(s) touched:** `/design/listing-images/[clientIdCode]` (hub), `/portal/design` (client portal)

## Problem

Each listing-image slot (MAIN, PT01–PT08) already supports multiple versions (V01, V02…) via `listing_image_slot_versions`, each carrying a per-version `status` (`not_started | in_progress | in_review | approved | live | discontinued`). The version-history popover already lets an editor set any version's status, and the backend already enforces **one Live version per slot** (`discontinueOtherLiveVersions` in `slot-status/route.ts`).

**The gap:** which image is *displayed* (in the hub grid, the thumbnail badge, and the client portal) is chosen by `MAX(version_number)` — the newest upload — and ignores status entirely (`GET /api/design/listing-images`, `route.ts:21-56`). So the holiday workflow breaks:

- V01 = normal image (Live), V02 = holiday image uploaded later (now Live).
- After the holiday, marking V01 Live again does **not** bring the V01 image back — the grid still shows V02 because V02 has the higher version number. The only way back today is deleting V02.

## Goal

Make `status='live'` the single source of truth for which image is shown, with a one-click way to switch. After the change:

- The displayed image per `(productId, slot)` = the **Live** version if one exists, else the **newest** (fallback preserves today's behavior for slots still in design).
- An editor can revert/rotate between any versions infinitely, with **zero deletions**, from the version-history popover.

## Non-goals

- No new schema/migration. The write side (`slot-status` PATCH + one-Live-per-slot enforcement) is already correct and stays untouched.
- No change to upload, delete, version-history GET, or the image-byte server.
- No change to BigQuery/publish (no listing-image integration exists there).
- The bulk "Images Status" dropdown keeps targeting the **latest** version (explicit decision — it's a fast workflow tool, not a display control).

## Locked decisions

- **Model:** reuse the existing `status='live'` as the display pointer (no separate "active" column).
- **Switch UX:** a **"Set as Live"** button per non-live row in the version-history popover.
- **Fallback:** when no version is Live, show the newest version.
- **Selection rule (used in both hub and portal):**
  `DISTINCT ON (product_id, slot) … ORDER BY product_id, slot, (status = 'live') DESC, version_number DESC`
- **Portal is in scope:** clients should see only the Live version per slot.
- **Bulk dropdown unchanged.**

## Architecture / data flow

`listing_image_slot_versions` (one row per version per slot) remains the only table. "Which version is Live" is already represented by `status='live'`, with at most one Live row per `(productId, slot)` guaranteed by `discontinueOtherLiveVersions`. This spec only changes **read/selection** logic (and adds one button that calls the existing write endpoint).

### The four edits

#### 1. Hub selection query — `src/app/api/design/listing-images/route.ts:21-56`

Replace the `maxVersions` subquery + inner-join (which selects `MAX(version_number)`) with a live-first pick per `(productId, slot)`. Recommended implementation: a raw SQL statement (consistent with `slot-status/route.ts`, which already uses `db.execute(sql\`…\`)`), or Drizzle `DISTINCT ON` if cleanly expressible.

```sql
SELECT DISTINCT ON (v.product_id, v.slot)
  df.id              AS id,
  df.drive_file_id   AS "driveFileId",
  df.display_name    AS "displayName",
  df.folder_id       AS "folderId",
  fol.drive_folder_id AS "driveFolderId",
  v.version_number   AS "versionNumber",
  v.status           AS status,
  v.product_id       AS "productId",
  v.slot             AS slot
FROM listing_image_slot_versions v
JOIN drive_files df ON df.id = v.drive_file_id
LEFT JOIN drive_folders fol ON fol.id = df.folder_id
WHERE v.client_id_code = ${clientIdCode}
ORDER BY v.product_id, v.slot, (v.status = 'live') DESC, v.version_number DESC;
```

The returned shape must stay identical to today's payload (`id, driveFileId, displayName, folderId, driveFolderId, versionNumber, status, productId, slot`) so the client needs no type change for this field set. Verify the JSON keys match the existing camelCase keys the client reads.

#### 2. "Set as Live" button — `src/app/design/listing-images/[clientIdCode]/page.client.tsx`, `VersionBadge` (~883-966)

In each version row of the history popover:

- If `v.status === 'live'`: render a small green **Live** badge (replaces the existing "current" badge logic, which should now key off `status === 'live'` rather than `versionNumber === existingImage.versionNumber`).
- Else: render a **"Set as Live"** button that calls the existing mutation:
  `slotStatusMutation.mutate({ productId: product.id, slot: columnName, status: "live", versionNumber: v.versionNumber })`.
- The per-version status dropdown stays (for non-Live workflow states); "Set as Live" is the explicit promote affordance.

On mutation success, the grid must reflect the new Live version. The existing `onSettled` already invalidates `["listing-images", clientIdCode]` and `["listing-image-history", productId, slot]` — confirm both fire. Because setting a version Live can change *which* version the grid shows (not just a status field on the same row), rely on the invalidation/refetch to swap the displayed image; a purely in-place optimistic status patch is not sufficient here. Optional: optimistically replace the grid row for that `(productId, slot)` with the now-Live version to avoid a flash, but refetch is the correctness guarantee.

#### 3. Cell status dropdown targets the shown version — `UploadCell` in `page.client.tsx`

The bottom-of-cell `SlotStatusSelect` currently calls `onSlotStatusChange(status, existingImage?.versionNumber)`. Confirm it passes `existingImage.versionNumber` (the **displayed** version, which is now the Live one or newest), **not** an undefined version (which the PATCH treats as "latest"). This keeps the dropdown editing the image the user actually sees. (If it already passes `existingImage?.versionNumber`, this edit is a no-op verification.)

#### 4. Portal selection — `src/app/api/portal/design/route.ts:132-179`

Replace the "fetch every `listing_image` drive file, match by ASIN filename prefix" block (which currently surfaces **all** versions to the client) with a live-first selection from the version table, scoped by `client_id_code`. Mirror the brand-story winner pattern already in this file (`route.ts:74-94`).

Keep the existing `products` query (it provides `asin`, `title`, `variationName`, and the "variation members only" filter). Build a `productById` map from it, then:

```sql
SELECT DISTINCT ON (v.product_id, v.slot)
  df.drive_file_id AS gid,
  v.product_id     AS "productId",
  v.slot           AS slot
FROM listing_image_slot_versions v
JOIN drive_files df ON df.id = v.drive_file_id
WHERE v.client_id_code = ${clientCode}
ORDER BY v.product_id, v.slot, (v.status = 'live') DESC, v.version_number DESC;
```

Map each row → `ListingImage` using `productById.get(productId)`; drop rows whose product isn't a variation member (`variationName` falsy), matching today's filter. URL stays `/api/drive/file/${gid}` (the only client-safe image proxy). Resulting `listingImages[]` shape is unchanged (`url, slot, productId, asin, title, variationName`), so `src/app/portal/design/page.tsx` needs no change.

> Implementation note: `listing_image_slot_versions.product_id` is `text`; confirm how it relates to `master.id` when building `productById` (map keyed by the same id type the version rows store). Prefer the in-JS map over a SQL join to avoid a type-cast mismatch.

## Edge cases

- **No Live version for a slot** → grid and portal show the newest version (unchanged behavior). No errors.
- **Holiday round-trip** → Set V02 Live (grid+portal show V02, V01 auto-discontinued); after holiday Set V01 Live (grid+portal show V01, V02 auto-discontinued, still in history). Repeatable, no deletions.
- **Slot with a newer non-Live version than the Live one** → grid shows the older Live image; the newer version remains visible in the popover. (Acceptable; it's the whole point.)
- **Dirty data with >1 Live row** (shouldn't happen) → `DISTINCT ON` with `(status='live') DESC, version_number DESC` deterministically picks the highest-version Live one. Safe.

## Validation approach

No TDD unit tests — these routes depend on PROD Supabase + Google Drive + NextAuth and have no test harness (consistent with the two prior listing-image plans). Each edit validates via `npm run build` (typecheck) + `npm run lint`. End-to-end proof via scripted authed browser QA on `localhost:3000`:

1. Pick a slot with V01 + V02 where V02 is newest. Set V01 "Set as Live" → grid thumbnail switches to V01, badge shows V01, V02 auto-flips to Discontinued in the popover.
2. Set V02 Live again → grid switches back to V02. Confirm round-trip, no deletions.
3. Slot with no Live version → grid shows newest (unchanged).
4. Cell status dropdown under a Live-V01 card edits V01 (verify via DB / re-open popover), not V02.
5. Portal (`/portal/design`, admin preview `?client=<code>`) shows exactly one image per slot = the Live one; switching Live in the hub changes the portal image after refetch.
6. `npm run build && npm run lint` both pass.

## Deploy / rollout notes

- On deploy, any slot where newest ≠ Live visibly switches to the Live image in **both** hub and portal — a one-time shift; QA across a few clients.
- Hard rules in force: never `git push` without explicit per-push confirmation (Vercel auto-deploys `main`); stage explicit files only; PORT=3000; `.env.local DATABASE_URL` = PROD Supabase; verify RENDER not just BUILD; Hub gold (`text-brand`), portal blue — never mix; commit trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

## File map

| File | Change |
|------|--------|
| `src/app/api/design/listing-images/route.ts` | GET: live-first selection (replaces MAX(version_number)) |
| `src/app/design/listing-images/[clientIdCode]/page.client.tsx` | `VersionBadge`: "Set as Live" button + Live badge; "current" keys off `status==='live'`; confirm cell dropdown passes `existingImage.versionNumber` |
| `src/app/api/portal/design/route.ts` | Listing-images block: live-first selection from version table, mapped via `productById` |
