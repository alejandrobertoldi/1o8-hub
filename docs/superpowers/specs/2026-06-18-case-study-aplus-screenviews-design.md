# Case Study Page 9 — A+ Content screenviews (design)

Date: 2026-06-18
Status: Approved (design); implementation pending via /writing-plans in a fresh session.

## Problem

Page 9 ("A+ Content") of the generated case study shows an empty image box. Unlike
brand_story, **A+ has no screenview file in Drive** and the app has **no
screenshot/export capability**. The in-app A+ preview (`/aplus2/[clientIdCode]`)
is composed by stacking per-module images vertically, each served via
`/api/aplus2/image?driveFileId={id}`.

`generate.ts` currently treats `aplus` as a Drive-folder section
(`SECTION_FOLDER_MAP.aplus = { folderType: "aplus", slots: 1 }`) and calls
`resolveScreenviews(clientIdCode, "aplus", 1)`, which finds nothing → empty box.

## Decisions (locked)

1. **A+ screenview = stacked desktop module images (CSS), not a composite file.**
   A "screenview" is one A+ set's ordered desktop module images, stacked
   vertically and scaled in page 9 (mirrors the in-app preview). Reuses
   `aplus2Assets` + the existing `/api/aplus2/image` proxy. No new infra; works in
   the existing puppeteer HTML→PDF export.
2. **Feature up to 3 sets**, ranked: **live/approved first, PA+ before BA+, then by
   ASIN**. In-review (and other unfinished) sets DO appear, ranked after
   live/approved, to fill up to 3.
3. **Most-finished version per set:** `live` > `approved` > newest `versionNumber`.
4. **Card visibility:** hide the Basic A+ card when the client has zero `BA+` sets;
   hide Premium A+ when zero `PA+` sets. Presence = ≥1 set of that `contentType`,
   any status.
5. **No brand-level concept.** Schema scope is only `ASIN` and `PARENT` (variation).
   "Brand-level" in the request = featuring multiple sets together (the up-to-3). A
   PARENT-scope set already represents a variation family. Do not invent brand level.

## Data model (existing — for reference)

- `aplus2Sets` (schema.ts:1849-1877): `clientIdCode`, `productId`, `scopeType`
  (`ASIN`|`PARENT`), `scopeIdentifier` (the ASIN/parent), `marketplace`,
  `contentType` (`PA+`|`BA+`), `coveredAsins`.
- `aplus2Versions` (1879-1898): `setId`, `versionNumber`, `status`
  (`not_started`|`in_progress`|`in_review`|`approved`|`live`).
- `aplus2Modules` (1901-1936): `versionId`, `position`, `moduleType`.
- `aplus2Assets` (1956-1986): `versionId`/`moduleId`, `kind` (`image`|`video`),
  `slotKey`, `variant` (`desktop`|`mobile`), `driveFileId` (FK → `driveFiles.id`).
- Display proxy: `/api/aplus2/image?driveFileId={id}` (api/aplus2/image/route.ts:5-28).

## Components to build / change

### 1. New resolver — `src/lib/case-study/aplus-screenviews.ts`
`resolveAplusScreenviews(clientIdCode: string): Promise<AplusScreenviewResult>`
- Query `aplus2Sets` for the client.
- For each set: pick most-finished version (live > approved > newest), load its
  `aplus2Modules` ordered by `position`, and for each module its `aplus2Assets`
  where `kind='image'` and `variant='desktop'` (fallback: any variant), mapping
  `driveFileId` → `/api/aplus2/image?driveFileId={driveFileId}`.
  - Note: `aplus2Assets.driveFileId` is FK to `driveFiles.id`; confirm whether the
    proxy expects `driveFiles.id` or the Google `driveFileId` and join if needed.
- Rank sets (live/approved first → PA+ before BA+ → ASIN asc), take top 3.
- Compute `hasBasic` / `hasPremium` from existence of any set per `contentType`.
- Return `{ screenviews: AplusScreenview[], hasBasic, hasPremium }`.
- Skip sets whose chosen version has zero resolvable images.

### 2. Types — `src/lib/case-study/types.ts`
Replace `AplusContent.imageUrl?: string` with:
```ts
interface AplusScreenview { asin: string; contentType: "PA+" | "BA+"; images: string[] }
// in AplusContent:
screenviews: AplusScreenview[];   // up to 3, each images[] = stacked desktop module URLs
hasBasic: boolean;
hasPremium: boolean;
```
Keep `basic` / `premium` (`AplusTier`) stat-cards.

### 3. Wiring — `src/lib/case-study/generate.ts`
- Remove `aplus` from `SECTION_FOLDER_MAP` (no longer Drive-folder driven).
- Populate the `aplus` section via `resolveAplusScreenviews` in BOTH generate and
  the **refresh image-update path** (so Refresh updates A+, consistent with the
  brand_story fix). Update `emptyAplus()` to the new shape.
- Coverage: report aplus as covered when ≥1 screenview resolved; otherwise
  surface in the amber "needs image" banner.

### 4. Renderer — `src/components/case-study/sections/aplus.tsx`
- Render up to 3 screenviews as vertically stacked image columns in the main area.
- Hide Basic A+ card when `!hasBasic`; hide Premium A+ card when `!hasPremium`.
- Editor `src/components/case-study/section-editor/section-aplus.tsx` updated to the
  new shape (prose/tier fields editable; screenviews are data-derived, not edited).

## Testing
- Unit test `resolveAplusScreenviews`: ranking (live/approved first, PA+ before BA+,
  ASIN order), version selection, desktop-variant preference, ≤3 cap,
  hasBasic/hasPremium, image-URL mapping. Mock db + assets.
- Renderer test: Basic card hidden when `hasBasic=false`; up to 3 stacks render.
- Regression: existing case-study tests stay green; `npm run build` (lint misses
  SectionContent union-cast TS errors).

## Acceptance (verify against DRC_SC_US — Active, 2 PA+ ASIN sets, 0 BA+)
- Page 9 shows the A+ module stacks for `B0DCLWMB4Y` (Live) first, then
  `B0CLMBGMS6` (In Review).
- Basic A+ card is hidden (no BA+).
- Refresh on an existing study updates the A+ screenviews.
- No PSD/broken images; images load via `/api/aplus2/image`.

## Non-goals
- No server-side composite PNG / screenshot pipeline.
- No brand-level A+ concept.
- No sales-based ranking.
