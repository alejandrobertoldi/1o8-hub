# Storefront Design Module Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub staff build a client's Amazon Storefront homepage (and later, more pages) by adding ordered single-asset modules (Header / Video / Cover Image / Image) uploaded to Google Drive.

**Architecture:** Mirror the aplus2 pattern but radically simplified — no versions, no sets-per-ASIN, no repeatable items, desktop-only, single asset stored directly on each module row. Two new tables (`storefront_pages`, `storefront_modules`), ~9 API routes under `/api/storefront`, a per-client Hub editor page, plus tests for the two pure helpers.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (postgres/Supabase), react-query, shadcn/ui, Google Drive (`src/lib/drive-client.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-storefront-design-module-editor.md`

## Global Constraints

- PORT=3000 for dev. Local DB = **prod Supabase** — migration is additive only (new enum + 2 tables); apply via a `scripts/_apply-00NN.ts` script, NOT `drizzle-kit migrate` (blocks on TTY).
- Stage explicit files only; never `git add .`. Never push without explicit OK.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Hub accent is gold `text-brand`. Reuse `@/lib/design-status` for any status UI; never re-add a local STATUS_CONFIG.
- All `/api/storefront/*` routes guarded like `/api/design-status` (staff/admin auth). Verify auth pattern by reading `src/app/api/design-status/route.ts` first.
- Dimension/format rules are **soft warnings**, never hard upload blocks.
- Reference implementation to mirror (read before coding the analog):
  - Upload: `src/app/api/aplus2/versions/[versionId]/assets/route.ts`
  - Image proxy: `src/app/api/aplus2/image/route.ts`
  - Drive naming: `src/lib/aplus2/drive-naming.ts`
  - Editor components: `src/components/aplus/aplus-image-slot.tsx`, `module-card-video.tsx`
  - Schema patterns: `src/lib/db/schema.ts` aplus2 tables (~1849–1986), `driveFolders` (~1588), `driveFiles` (~1616)

---

### Task 1: Pure helpers — module specs + drive naming (TDD)

**Files:**
- Create: `src/lib/storefront/module-specs.ts`
- Create: `src/lib/storefront/drive-naming.ts`
- Test: `src/lib/storefront/module-specs.test.ts`
- Test: `src/lib/storefront/drive-naming.test.ts`

**Interfaces produced:**
- `STOREFRONT_MODULE_TYPES: readonly ["header","video","cover_image","image"]`
- `type StorefrontModuleType = (typeof STOREFRONT_MODULE_TYPES)[number]`
- `interface StorefrontModuleSpec { key: StorefrontModuleType; label: string; kind: "image"|"video"; minWidth?: number; minHeight?: number; maxBytes?: number; mimes: string[] }`
- `STOREFRONT_MODULE_SPECS: Record<StorefrontModuleType, StorefrontModuleSpec>`
- `validateAsset(spec, { width, height, bytes, mime }): { ok: boolean; warnings: string[] }` — `ok` is false ONLY on wrong mime/kind; size violations are warnings.
- `storefrontAssetFilename({ clientIdCode, slug, position, moduleType, ext }): string` → `${clientIdCode}_storefront_${slug}_M${pad2(position)}_${moduleType}.${ext}`

- [ ] **Step 1: Write `module-specs.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { STOREFRONT_MODULE_SPECS, validateAsset } from "./module-specs";

describe("validateAsset", () => {
  it("accepts a header at min size with no warnings", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.header, { width: 3000, height: 600, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
  it("warns (but ok) when below min size", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.header, { width: 2000, height: 400, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("rejects wrong mime kind (image file in video module)", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.video, { width: 1280, height: 640, bytes: 1000, mime: "image/png" });
    expect(r.ok).toBe(false);
  });
  it("warns when video exceeds 500MB", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.video, { width: 1280, height: 640, bytes: 600 * 1024 * 1024, mime: "video/mp4" });
    expect(r.warnings.some((w) => /500/.test(w))).toBe(true);
  });
  it("image module only constrains width", () => {
    const r = validateAsset(STOREFRONT_MODULE_SPECS.image, { width: 1500, height: 200, bytes: 1, mime: "image/jpeg" });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm run test -- src/lib/storefront/module-specs.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `module-specs.ts`**

```ts
export const STOREFRONT_MODULE_TYPES = ["header", "video", "cover_image", "image"] as const;
export type StorefrontModuleType = (typeof STOREFRONT_MODULE_TYPES)[number];

export interface StorefrontModuleSpec {
  key: StorefrontModuleType;
  label: string;
  kind: "image" | "video";
  minWidth?: number;
  minHeight?: number;
  maxBytes?: number;
  mimes: string[];
}

const IMG = ["image/png", "image/jpeg", "image/webp"];
const VID = ["video/x-msvideo", "video/quicktime", "video/mpeg", "video/mp4", "audio/mp4", "video/x-m4v"];
// avi, mov, mpg/mpeg, mp4, m4a, m4v, m4p — browsers report these mimes; accept generously.

export const STOREFRONT_MODULE_SPECS: Record<StorefrontModuleType, StorefrontModuleSpec> = {
  header:      { key: "header",      label: "Header",      kind: "image", minWidth: 3000, minHeight: 600,  mimes: IMG },
  video:       { key: "video",       label: "Video",       kind: "video", minWidth: 1280, minHeight: 640, maxBytes: 500 * 1024 * 1024, mimes: VID },
  cover_image: { key: "cover_image", label: "Cover Image", kind: "image", minWidth: 3000, minHeight: 1500, mimes: IMG },
  image:       { key: "image",       label: "Image",       kind: "image", minWidth: 1500, mimes: IMG },
};

export function validateAsset(
  spec: StorefrontModuleSpec,
  asset: { width?: number; height?: number; bytes: number; mime: string }
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const mimeOk = spec.mimes.includes(asset.mime) || (spec.kind === "video" && asset.mime.startsWith("video/"));
  if (!mimeOk) return { ok: false, warnings: [`Unsupported file type for ${spec.label}`] };
  if (spec.minWidth && asset.width !== undefined && asset.width < spec.minWidth)
    warnings.push(`Width ${asset.width}px is below the recommended ${spec.minWidth}px`);
  if (spec.minHeight && asset.height !== undefined && asset.height < spec.minHeight)
    warnings.push(`Height ${asset.height}px is below the recommended ${spec.minHeight}px`);
  if (spec.maxBytes && asset.bytes > spec.maxBytes)
    warnings.push(`File exceeds the 500MB limit`);
  return { ok: true, warnings };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Write `drive-naming.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { storefrontAssetFilename } from "./drive-naming";

it("builds padded filename", () => {
  expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 1, moduleType: "header", ext: "png" }))
    .toBe("ZNG_SC_US_storefront_homepage_M01_header.png");
});
```

- [ ] **Step 6: Run, verify fail. Implement `drive-naming.ts`:**

```ts
import type { StorefrontModuleType } from "./module-specs";
const pad2 = (n: number) => String(n).padStart(2, "0");
export function storefrontAssetFilename(a: {
  clientIdCode: string; slug: string; position: number; moduleType: StorefrontModuleType; ext: string;
}): string {
  return `${a.clientIdCode}_storefront_${a.slug}_M${pad2(a.position)}_${a.moduleType}.${a.ext}`;
}
```

- [ ] **Step 7: Run both test files, verify pass.**

- [ ] **Step 8: Commit** — `git add src/lib/storefront && git commit -m "feat(storefront): module specs + drive naming helpers"`

---

### Task 2: DB schema + migration (additive)

**Files:**
- Modify: `src/lib/db/schema.ts` (append near aplus2 tables)
- Create: `drizzle/migrations/00NN_storefront.sql` (use next free number; check `drizzle/migrations/`)
- Create: `scripts/_apply-00NN.ts` (one-off apply script; mirror an existing `scripts/_apply-*.ts`)

**Interfaces produced:** Drizzle tables `storefrontPages`, `storefrontModules`; enum `storefrontModuleTypeEnum`.

- [ ] **Step 1: Add to `schema.ts`** (follow existing pgTable/enum style):

```ts
export const storefrontModuleTypeEnum = pgEnum("storefront_module_type", [
  "header", "video", "cover_image", "image",
]);

export const storefrontPages = pgTable("storefront_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientIdCode: text("client_id_code").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isHomepage: boolean("is_homepage").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqClientSlug: unique().on(t.clientIdCode, t.slug) }));

export const storefrontModules = pgTable("storefront_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").notNull().references(() => storefrontPages.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  moduleType: storefrontModuleTypeEnum("module_type").notNull(),
  title: text("title"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  driveFileId: text("drive_file_id"),
  assetMimeType: text("asset_mime_type"),
  assetFilename: text("asset_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uqPagePos: unique().on(t.pageId, t.position) }));
```
(Confirm `boolean`, `integer`, `unique` are already imported at top of schema.ts; add if missing.)

- [ ] **Step 2: Write the raw SQL migration** `drizzle/migrations/00NN_storefront.sql`:

```sql
CREATE TYPE "storefront_module_type" AS ENUM ('header','video','cover_image','image');
CREATE TABLE "storefront_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id_code" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_homepage" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storefront_pages_client_slug_uq" UNIQUE ("client_id_code","slug")
);
CREATE TABLE "storefront_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "storefront_pages"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "module_type" "storefront_module_type" NOT NULL,
  "title" text, "link_url" text, "link_label" text,
  "drive_file_id" text, "asset_mime_type" text, "asset_filename" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storefront_modules_page_pos_uq" UNIQUE ("page_id","position")
);
```

- [ ] **Step 3: Apply via script** — copy an existing `scripts/_apply-*.ts`, point it at the new SQL file, run `npx tsx scripts/_apply-00NN.ts`. Expected: `CREATE TYPE` + 2 `CREATE TABLE` succeed.

- [ ] **Step 4: Verify** — `npm run db:studio` or a read-only `SELECT` confirms both tables exist. `npm run build` passes (schema typechecks).

- [ ] **Step 5: Commit** — `git add src/lib/db/schema.ts drizzle/migrations/00NN_storefront.sql scripts/_apply-00NN.ts && git commit -m "feat(storefront): pages + modules schema and migration"`

---

### Task 3: Drive folder helper + image proxy route

**Files:**
- Create: `src/lib/storefront/drive.ts` — `getOrCreateStorefrontFolder(clientIdCode): Promise<string>` (gid). Mirror how aplus2 ensures a `driveFolders` row with `folderType`; here `folderType="storefront"`.
- Create: `src/app/api/storefront/image/route.ts` — GET proxy. Copy `src/app/api/aplus2/image/route.ts` verbatim, swap nothing but the comment; it just downloads `driveFileId` from Drive with immutable cache.

- [ ] **Step 1:** Read `src/app/api/aplus2/image/route.ts` and the aplus2 folder-ensure logic; replicate.
- [ ] **Step 2:** Implement `drive.ts` folder helper (query `driveFolders` for clientIdCode+`storefront`; if absent, `driveClient.createFolder` under the client's root and insert the row).
- [ ] **Step 3:** Implement the image proxy route.
- [ ] **Step 4: Verify** `npm run build` passes.
- [ ] **Step 5: Commit** — `git add src/lib/storefront/drive.ts src/app/api/storefront/image && git commit -m "feat(storefront): drive folder helper + image proxy"`

---

### Task 4: Pages API

**Files:**
- Create: `src/app/api/storefront/[clientIdCode]/pages/route.ts` — GET (pages + nested modules ordered by position), POST (create page `{ name }`; if client has no pages, also create the Homepage row `{ name:"Homepage", slug:"homepage", isHomepage:true, position:0 }`).
- Create: `src/app/api/storefront/pages/[pageId]/route.ts` — PATCH (`{ name }`), DELETE (cascade deletes modules; trash each module's Drive file best-effort).

**Interfaces produced (response shape consumed by Task 7):**
```ts
type StorefrontModuleDTO = { id: string; position: number; moduleType: StorefrontModuleType;
  title: string|null; linkUrl: string|null; linkLabel: string|null;
  driveFileId: string|null; assetMimeType: string|null; assetFilename: string|null };
type StorefrontPageDTO = { id: string; name: string; slug: string; isHomepage: boolean;
  position: number; modules: StorefrontModuleDTO[] };
```

- [ ] **Step 1:** Read `src/app/api/design-status/route.ts` for the auth guard; apply same guard.
- [ ] **Step 2:** Implement GET (slugify helper: lowercase, non-alnum→`-`; ensure Homepage exists on GET too so the editor always has it).
- [ ] **Step 3:** Implement POST + PATCH + DELETE.
- [ ] **Step 4: Verify** build passes; manual `curl`/browser GET returns Homepage for a test client.
- [ ] **Step 5: Commit** — `git add src/app/api/storefront/[clientIdCode] src/app/api/storefront/pages && git commit -m "feat(storefront): pages API"`

---

### Task 5: Modules API (add / edit / reorder / delete)

**Files:**
- Create: `src/app/api/storefront/pages/[pageId]/modules/route.ts` — POST `{ moduleType }` → insert at `max(position)+1`.
- Create: `src/app/api/storefront/modules/[moduleId]/route.ts` — PATCH (`title|linkUrl|linkLabel|position`; reorder = swap/renumber), DELETE (trash Drive file if present, then delete row).

- [ ] **Step 1:** Implement POST module (validate `moduleType` ∈ STOREFRONT_MODULE_TYPES).
- [ ] **Step 2:** Implement PATCH (partial update; on `position` change, renumber siblings to keep the `(pageId,position)` unique constraint satisfied — do it in a transaction).
- [ ] **Step 3:** Implement DELETE (best-effort `driveClient.trashFile(driveFileId)` then delete row).
- [ ] **Step 4: Verify** build passes.
- [ ] **Step 5: Commit** — `git add src/app/api/storefront/pages/[pageId]/modules src/app/api/storefront/modules && git commit -m "feat(storefront): modules API"`

---

### Task 6: Asset upload / delete API

**Files:**
- Create: `src/app/api/storefront/modules/[moduleId]/asset/route.ts` — POST (multipart) + DELETE.

**Behavior (mirror `aplus2/versions/[versionId]/assets/route.ts`):**
1. Parse multipart `file`. Load module → page → clientIdCode + slug + position + moduleType.
2. Look up spec; check mime via `validateAsset` — reject (400) only on mime/kind mismatch; collect size warnings.
3. `getOrCreateStorefrontFolder(clientIdCode)`; build filename via `storefrontAssetFilename`.
4. If module already has a `driveFileId`, remember it to trash after success.
5. `driveClient.uploadFile(filename, folderGid, buffer, mime)` → gid.
6. Update module row: `driveFileId`, `assetMimeType`, `assetFilename`, `updatedAt`.
7. Best-effort trash the old gid. Return `{ driveFileId, warnings }`.
- DELETE: trash gid, null out the three asset columns.

Note: image dimensions aren't read server-side here (no sharp dependency assumed) — pass width/height from the client in the multipart body when available, else skip dimension warnings. ponytail: don't add an image-processing dep for soft warnings.

- [ ] **Step 1:** Implement POST.
- [ ] **Step 2:** Implement DELETE.
- [ ] **Step 3: Verify** build passes.
- [ ] **Step 4: Commit** — `git add src/app/api/storefront/modules/[moduleId]/asset && git commit -m "feat(storefront): asset upload + delete API"`

---

### Task 7: Hub editor page + components

**Files:**
- Create: `src/app/design/storefront/[clientIdCode]/page.tsx` (server: resolve client name; render client component)
- Create: `src/app/design/storefront/[clientIdCode]/page.client.tsx` (the editor)
- Create: `src/components/storefront/storefront-page-editor.tsx`
- Create: `src/components/storefront/storefront-module-card.tsx`
- Create: `src/components/storefront/storefront-asset-upload.tsx`

**Editor behavior:**
- react-query: `useQuery(["storefront", clientIdCode])` → GET pages; mutations for add/edit/delete page + module + asset, each `invalidateQueries` on settle, `toast.error` on error.
- Page selector: tabs/segmented control over pages (Homepage first); "+ Add page" prompts for a name.
- For the selected page: ordered module cards + an "Add module" menu listing the 4 specs' labels.
- `storefront-module-card.tsx`: shows the module type label; `storefront-asset-upload.tsx` dropzone (image → `<img src={/api/storefront/image?driveFileId=...}>`, video → `<video controls>`); dimension/format hint from the spec; renders `warnings` returned by upload as amber helper text; optional Title `<Input>`; optional link (url + label `<Input>`s); reorder up/down buttons (PATCH position); delete button (confirm). Mirror interaction/markup from `src/components/aplus/aplus-image-slot.tsx`.
- Header: client name (gold `text-brand` StoreFront title via `PageMetaSlot`) + the design-status `<Select>` for `category:"storefront"` (reuse the PUT from `/api/design-status`, copy the Select block from `src/app/design/storefront/page.tsx`).

- [ ] **Step 1:** Build the server `page.tsx` (look up client name like the aplus2 `[clientIdCode]/page.tsx` does).
- [ ] **Step 2:** Build `storefront-asset-upload.tsx`.
- [ ] **Step 3:** Build `storefront-module-card.tsx`.
- [ ] **Step 4:** Build `storefront-page-editor.tsx` (compose; wire all mutations).
- [ ] **Step 5:** Build `page.client.tsx` (query + render editor).
- [ ] **Step 6: Verify** `npm run build` passes; **render-verify** at `PORT=3000` `/design/storefront/<aTestClient>` — Homepage shows, add each of the 4 module types, upload an image and a video, set title/link, reorder, delete; no console errors.
- [ ] **Step 7: Commit** — `git add src/app/design/storefront/[clientIdCode] src/components/storefront && git commit -m "feat(storefront): Hub per-client module editor"`

---

### Task 8: Make storefront list tiles navigate to the editor

**Files:**
- Modify: `src/app/design/storefront/page.tsx` (`StorefrontTile`)

The tile is currently non-clickable (placeholder layout). Wrap it so clicking routes to `/design/storefront/${client.clientIdCode}` (use `useRouter().push`, keep the status `<Select>` footer's `onClick` stopping propagation — copy that guard from the brand-story `StoryTile`).

- [ ] **Step 1:** Add `useRouter`; add `onClick` to the tile root; add `e.stopPropagation()` wrapper around the status Select footer; restore `cursor-pointer` + hover.
- [ ] **Step 2: Verify** build passes; clicking a tile opens the editor.
- [ ] **Step 3: Commit** — `git add src/app/design/storefront/page.tsx && git commit -m "feat(storefront): list tiles open the per-client editor"`

---

## Self-Review

**Spec coverage:** storage/Drive (T3,T6) ✓ · no versioning (schema has none) ✓ · desktop-only (no variant column) ✓ · pages table + Homepage seed (T2,T4) ✓ · per-module asset+title+link (T2,T5,T7) ✓ · 4 module specs + soft warnings (T1) ✓ · Drive naming (T1) ✓ · API surface (T3–T6) ✓ · Hub editor + entry tile (T7,T8) ✓ · status integration (T7) ✓ · tests for the two pure helpers (T1) ✓. Portal render correctly deferred (out of scope).

**Placeholder scan:** Tasks 3 and 7 reference existing aplus2 files to mirror rather than inlining all UI code — intentional (the patterns are large and already in-repo; the Explore map + Global Constraints give exact paths). Foundational/tricky tasks (1,2,6) carry full code.

**Type consistency:** `StorefrontModuleType` / `STOREFRONT_MODULE_SPECS` / `storefrontAssetFilename` (T1) used consistently in T5/T6/T7. DTO shapes (T4) consumed by T7. Drive helper name `getOrCreateStorefrontFolder` consistent T3↔T6.
