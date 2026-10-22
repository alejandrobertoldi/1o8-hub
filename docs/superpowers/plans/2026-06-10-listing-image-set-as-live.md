# Listing Image "Set as Live" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `status='live'` (not the newest upload) decide which listing-image version is displayed in the hub grid and the client portal, and add a one-click "Set as Live" button so an editor can rotate/revert versions (e.g. a holiday image) with zero deletions.

**Architecture:** No schema change. The write side already enforces one Live version per slot (`slot-status/route.ts` → `discontinueOtherLiveVersions`). This plan only changes the **read/selection** logic in two GET routes to "live-first, else newest" (`DISTINCT ON (product_id, slot) ORDER BY (status='live') DESC, version_number DESC`) and adds a "Set as Live" button that calls the existing PATCH endpoint.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (`postgres` driver, raw `db.execute(sql\`…\`)`), PostgreSQL/Supabase, React 19, TanStack Query, shadcn/ui Popover.

**Spec:** `docs/superpowers/specs/2026-06-10-listing-image-set-as-live.md`

**Validation (deviation from TDD):** These routes depend on PROD Supabase + Google Drive + NextAuth with no test harness (consistent with the two prior listing-image plans). Each task validates via `npm run build` + `npm run lint`; the feature is proven end-to-end by the scripted authed browser QA in Task 4.

**Hard rules in force:** never `git push` without explicit per-push confirmation (Vercel auto-deploys `main`); stage explicit files only (working tree is parallel-session polluted — re-verify `git diff --cached --name-only` before each commit); PORT=3000; `.env.local DATABASE_URL` = PROD Supabase; verify RENDER not just BUILD; Hub gold (`text-brand`), portal blue — never mix; commit trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

---

## File Map

| File | Change |
|------|--------|
| `src/app/api/design/listing-images/route.ts` | GET: full rewrite — live-first selection (replaces `MAX(version_number)`) |
| `src/app/api/portal/design/route.ts` | Listing-images block (lines ~132-179): live-first selection from version table, mapped via `productById` |
| `src/app/design/listing-images/[clientIdCode]/page.client.tsx` | `VersionBadge`: "Set as Live" button + green Live badge (replaces "current"); optimistic discontinue-others; verify cell dropdown already passes `versionNumber` |

---

## Task 1: Hub GET — live-first selection

**Files:**
- Modify (full rewrite): `src/app/api/design/listing-images/route.ts`

- [ ] **Step 1: Replace the entire file**

The new selection uses `DISTINCT ON` so each `(product_id, slot)` returns its Live version, or the newest when none is Live. Column aliases are double-quoted to preserve the exact camelCase keys the client already reads (`id, driveFileId, displayName, folderId, driveFolderId, versionNumber, status, productId, slot`).

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientIdCode = searchParams.get("clientIdCode");

    if (!clientIdCode) {
      return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
    }

    // Per (product_id, slot): show the LIVE version if one exists, else the
    // newest (highest version_number). The write side (slot-status PATCH)
    // enforces at most one 'live' row per slot, so this is deterministic.
    const images = await db.execute(sql`
      SELECT DISTINCT ON (v.product_id, v.slot)
        df.id               AS "id",
        df.drive_file_id    AS "driveFileId",
        df.display_name     AS "displayName",
        df.folder_id        AS "folderId",
        fol.drive_folder_id AS "driveFolderId",
        v.version_number    AS "versionNumber",
        v.status            AS "status",
        v.product_id        AS "productId",
        v.slot              AS "slot"
      FROM listing_image_slot_versions v
      JOIN drive_files df ON df.id = v.drive_file_id
      LEFT JOIN drive_folders fol ON fol.id = df.folder_id
      WHERE v.client_id_code = ${clientIdCode}
      ORDER BY v.product_id, v.slot, (v.status = 'live') DESC, v.version_number DESC
    `);

    return NextResponse.json(images);
  } catch (err) {
    console.error("[listing-images] error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
```

> `db.execute(sql\`…\`)` returns the rows array directly (same pattern as `src/app/api/portal/design/route.ts:104-130`, which `.map()`s the result). `NextResponse.json(images)` serializes it as the array the client expects.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles; no unused-import errors (the old `driveFiles, driveFolders, listingImageSlotVersions` Drizzle-table imports and `eq, and, max` are gone — only `sql` remains).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/design/listing-images/route.ts
git diff --cached --name-only   # confirm ONLY this file is staged
git commit -m "feat(listing-images): grid shows the Live version, not just newest

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Portal GET — live-first selection

**Files:**
- Modify: `src/app/api/portal/design/route.ts` (the listing-images block, lines ~137-179)

- [ ] **Step 1: Replace the listing-images block**

Find the block that starts at `let listingImages: ListingImage[] = [];` (line ~137) and ends at the closing `}` of the `if (prodByAsin.size > 0) { … }` (line ~179). Replace the WHOLE block with the following. It keeps the existing `products` query (it provides asin/title/variationName) but selects images live-first from the version table, scoped by `client_id_code`, and maps by `product_id`.

```ts
  let listingImages: ListingImage[] = [];
  const products = await db
    .select({
      id: master.id,
      asin: master.asin,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
      variationName: variations.name,
    })
    .from(master)
    .leftJoin(variations, eq(master.variationRef, variations.id))
    .where(eq(master.clientIdCode, clientCode));
  // Variation members only (mirrors the Hub listing-images card): a product
  // qualifies iff master.variationRef joined a variations row (name truthy).
  const productById = new Map(
    products.filter((p) => p.variationName).map((p) => [p.id, p])
  );
  // Live-first selection per (product_id, slot): the version whose status='live',
  // else the newest. Mirrors GET /api/design/listing-images so hub and portal agree.
  const liveRows = await db.execute<{
    gid: string | null;
    productId: string;
    slot: string;
  }>(sql`
    SELECT DISTINCT ON (v.product_id, v.slot)
      df.drive_file_id AS gid,
      v.product_id     AS "productId",
      v.slot           AS slot
    FROM listing_image_slot_versions v
    JOIN drive_files df ON df.id = v.drive_file_id
    WHERE v.client_id_code = ${clientCode}
    ORDER BY v.product_id, v.slot, (v.status = 'live') DESC, v.version_number DESC
  `);
  listingImages = liveRows
    .map((r): ListingImage | null => {
      const p = productById.get(r.productId);
      if (!p || !r.gid) return null;
      return {
        url: `/api/drive/file/${r.gid}`,
        slot: r.slot ?? "MAIN",
        productId: p.id,
        asin: p.asin,
        title: p.summarizedTitle ?? p.itemName ?? null,
        variationName: p.variationName,
      };
    })
    .filter((x): x is ListingImage => !!x);
```

> The old block matched by ASIN filename prefix and returned EVERY version. This swaps to the version table (`client_id_code`-scoped) so clients see exactly one image per slot = the Live one. `sql`, `master`, `variations`, `driveFiles` are already imported; no import changes. `driveFiles` stays imported (still used by the A+2 thumbnail query at line ~124). The `ListingImage` portal type (`route.ts:32-39`) and `src/app/portal/design/page.tsx` are unchanged — same output shape.

> **Verify the join key:** `listing_image_slot_versions.product_id` (text) must equal `master.id`. The hub page passes `product.id` (= `master.id`) as the version `productId`, so `productById.get(r.productId)` should hit. Spot-check in QA Step 5 that portal images appear (an empty `listingImages` would mean the key types/values diverge — fall back to logging one `r.productId` vs one `p.id`).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles; no unused-variable warnings (the old `imgs`/`prodByAsin` locals are gone; `prodByAsin` is replaced by `productById`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/design/route.ts
git diff --cached --name-only   # confirm ONLY this file is staged
git commit -m "feat(portal): show only the Live listing-image version to clients

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: "Set as Live" button in the version-history popover

**Files:**
- Modify: `src/app/design/listing-images/[clientIdCode]/page.client.tsx` (`VersionBadge` ~883-966; `slotStatusMutation` onMutate ~193-200; verify `UploadCell` cell dropdown ~1067-1073)

- [ ] **Step 1: Replace the version-row right-hand column in `VersionBadge`**

In the `history.map((v) => ( … ))` row (lines ~935-958), replace the `<div className="min-w-0 flex-1">…</div>` block. This swaps the "current" badge (keyed off version number) for a green **Live** badge (keyed off `v.status === 'live'`) and adds a full-width **Set as Live** button under the status dropdown for every non-Live version.

Replace lines ~935-958 (`<div className="min-w-0 flex-1">` … its closing `</div>`) with:

```tsx
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold font-mono text-brand">
                      {`V${v.versionNumber.toString().padStart(2, "0")}`}
                    </span>
                    {v.status === "live" && (
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-500 rounded px-1 font-bold">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {new Date(v.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                  <div onClick={(e) => e.stopPropagation()} className="mt-1 flex flex-col gap-1">
                    <SlotStatusSelect
                      value={v.status}
                      compact
                      onChange={(status) => onStatusChange(status, v.versionNumber)}
                    />
                    {v.status !== "live" && (
                      <button
                        type="button"
                        onClick={() => onStatusChange("live", v.versionNumber)}
                        className="w-full rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 transition-colors"
                      >
                        Set as Live
                      </button>
                    )}
                  </div>
                </div>
```

> `onStatusChange("live", v.versionNumber)` routes through the existing `slotStatusMutation` → PATCH `{ status: "live", versionNumber }` → backend `discontinueOtherLiveVersions`. No backend change. `SlotStatusSelect` already supports the `compact` prop (used here today).

- [ ] **Step 2: Make the optimistic update discontinue the prior Live row (avoid a two-Live flash)**

In `slotStatusMutation.onMutate`, the history-cache update (lines ~193-200) currently only patches the targeted version. When promoting to Live, also flip any *other* Live row to `discontinued`, mirroring the backend. Replace the `if (prevHist) { … }` block (lines ~193-200) with:

```ts
      if (prevHist) {
        queryClient.setQueryData<VersionHistory[]>(
          histKey,
          prevHist.map((v) => {
            if (versionNumber === undefined || v.versionNumber === versionNumber) {
              return { ...v, status };
            }
            // Promoting one version to Live discontinues the others (matches backend).
            if (status === "live" && v.status === "live") {
              return { ...v, status: "discontinued" };
            }
            return v;
          })
        );
      }
```

> The grid image *swap* (V02 → V01) is not optimistically applied — `onSettled` already invalidates `["listing-images", clientIdCode]` (line ~209), so the grid refetches and shows the new Live image. One refetch round-trip of latency is acceptable.

- [ ] **Step 3: Verify the cell dropdown already targets the shown version (no edit expected)**

Confirm `UploadCell`'s bottom `SlotStatusSelect` (lines ~1067-1073) passes `existingImage?.versionNumber`:

```tsx
        <SlotStatusSelect
          value={existingImage?.status ?? "not_started"}
          disabled={!existingImage}
          fitContent
          onChange={(status) => onSlotStatusChange(status, existingImage?.versionNumber)}
        />
```

Since `existingImage` is now the Live version (from Task 1's GET), this dropdown already edits the shown version. If it passes `existingImage?.versionNumber` (it does as of this writing), make NO change. If a parallel session changed it to omit the version, add `existingImage?.versionNumber` back.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compiles clean; no unused-variable warnings.

- [ ] **Step 5: Commit**

```bash
git add "src/app/design/listing-images/[clientIdCode]/page.client.tsx"
git diff --cached --name-only   # confirm ONLY this file is staged
git commit -m "feat(listing-images): Set-as-Live button in version popover

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: End-to-end manual verification (proof required)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `PORT=3000 npm run dev`
Pick a client + slot with TWO versions where the newest (V02) is the one currently shown. Open `http://localhost:3000/design/listing-images/<clientIdCode>`.

Authed browse (ALL in ONE Bash call — the browse server resets between calls): `goto localhost FIRST → cookie-import-browser chrome --domain localhost → read cookies to settle → re-goto → reload`.

- [ ] **Step 2: Set an older version Live**

Open the V## popover for that slot. Click **Set as Live** on V01.
Expected: V01 row shows the green **Live** badge; V02 row flips to **Discontinued**; after the brief refetch the grid thumbnail + V## badge switch to **V01**.

- [ ] **Step 3: Round-trip back**

Click **Set as Live** on V02.
Expected: grid switches back to V02, V01 → Discontinued, both versions still present in history (no deletions).

- [ ] **Step 4: Slot with no Live version**

Find a slot whose versions are all non-Live (e.g. in_review).
Expected: grid shows the newest version (unchanged fallback behavior). No errors.

- [ ] **Step 5: Portal parity**

Open `http://localhost:3000/portal/design?client=<clientIdCode>` (admin preview).
Expected: exactly ONE image per slot = the Live one (not every version). Flip Live in the hub, reload portal → the portal image follows. If `listingImages` is empty, check the Task 2 join-key note.

- [ ] **Step 6: Cell dropdown edits the shown version**

Under a Live-V01 card, change the bottom status dropdown to e.g. "approved".
Expected: V01's status changes (re-open popover / DB to confirm), NOT V02's. With no Live version the grid falls back to newest.

- [ ] **Step 7: Final gate**

Run: `npm run build && npm run lint`
Expected: both pass. Report results. **Do NOT push** — await explicit per-push confirmation (Vercel auto-deploys `main`). After any deploy, remind the user to hard-refresh (Cmd+Shift+R).

---

## Self-Review

**Spec coverage:**
- Live-first selection rule (hub) → Task 1 ✔
- Live-first selection rule (portal, in scope) → Task 2 ✔
- "Set as Live" button + Live badge → Task 3 Step 1 ✔
- Cell dropdown targets shown version → Task 3 Step 3 (already satisfied; verify-only) ✔
- Fallback to newest when no Live → Task 1/Task 2 `ORDER BY (status='live') DESC, version_number DESC` ✔
- Bulk dropdown unchanged → not touched (explicit decision) ✔
- No schema/migration → confirmed; only read paths + one button ✔

**Placeholder scan:** none — every code step shows full code; QA steps give exact expected outcomes.

**Type consistency:** GET aliases (`id, driveFileId, displayName, folderId, driveFolderId, versionNumber, status, productId, slot`) match the `ListingImage` type in `page.client.tsx:93-103`. Portal output (`url, slot, productId, asin, title, variationName`) matches the portal `ListingImage` type (`route.ts:32-39`). `onStatusChange(status, versionNumber)` signature matches `VersionBadge` props (`page.client.tsx:892`) and the `slotStatusMutation` shape (`page.client.tsx:164`).

**Known risk:** portal join key `version.product_id` ↔ `master.id` — verified-by-QA (Task 2 note + Task 4 Step 5).
