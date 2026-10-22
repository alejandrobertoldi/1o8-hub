# A+2 Per-Version A+ Content Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a lean, per-version, brand-story-style A+ content editor at `/aplus2` that supports all 19 Amazon Premium A+ module types, scoped per ASIN-or-parent and per marketplace, leaving the existing `/aplus` untouched.

**Architecture:** Five new tables (`aplus2_sets` → `aplus2_versions` → `aplus2_modules` → `aplus2_module_items` + `aplus2_assets`) mirror the brand-story 5-table model. One schema-driven `<Aplus2ModuleEditor>` renders all 19 module types by reading `src/lib/aplus2/module-specs.ts`. Repeatable items (Q&A, comparison rows, carousel slides, hotspots, regimen steps, tech-spec rows) store per-type fields as a JSONB `data` column with a TS discriminated union validated by Zod at the API boundary. Google Drive folder per version, lazy rename on reorder.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Drizzle ORM · PostgreSQL (Supabase) · NextAuth v5 · shadcn/ui · TanStack Query · `@dnd-kit/sortable` · Zod · Google Drive API (`src/lib/drive-client.ts`).

**Source-of-truth spec:** `docs/superpowers/specs/2026-05-29-aplus2-per-version-editor-design.md`.

**Reference patterns to mirror (read-only — do not modify):**
- Schema: `src/lib/db/schema.ts:1634-1786` (brand-story 5-table block).
- Migration: `drizzle/migrations/0066_brand_story_per_version.sql` (statement_timeout, partial unique indexes, CHECK enums).
- API routes: `src/app/api/design-status/brand-story-versions/route.ts`, `[versionId]/route.ts`, `[versionId]/assets/route.ts`, `upload-brand-story/route.ts`, `brand-story-image/route.ts`.
- UI: `src/app/design/brand-story/page.tsx` (client list), `src/app/design/brand-story/[clientIdCode]/page.tsx` (version cards), `src/app/design/brand-story/[clientIdCode]/_components/brand-story-editor.tsx` (per-version editor).
- Module spec model to copy + clean: `src/lib/aplus-module-specs.ts`.

---

## File Structure (target)

```
src/lib/db/schema.ts                                +5 table exports (after brandStoryAssets)
drizzle/migrations/0068_aplus2.sql                  CREATE TABLE + indexes + partial unique

src/lib/aplus2/
  module-specs.ts                                   19 Aplus2 module specs + Aplus2ItemData union
  zod-schemas.ts                                    Per-module validators (char limits live here)
  drive-naming.ts                                   slug/filename helpers + M## formatter + variant suffix
  marketplace.ts                                    master.country/marketplace → 2-letter normalisation

src/app/api/aplus2/
  clients/route.ts                                  GET — client list with set rollups
  sets/route.ts                                     GET (by client) + POST (create set + V01 + folder)
  sets/[setId]/route.ts                             DELETE (cascade trash all version subfolders)
  sets/[setId]/versions/route.ts                    GET (full nested) + POST (create version, optional copyFrom)
  versions/[versionId]/route.ts                     PATCH (status) + DELETE (cascade + trash folder)
  versions/[versionId]/modules/route.ts             POST (insert module, seed items)
  versions/[versionId]/assets/route.ts              POST (multipart upload, slot-aware filename)
  modules/[moduleId]/route.ts                       PATCH (text + status + layout) + DELETE
  modules/[moduleId]/reorder/route.ts               POST (bulk positions + lazy rename)
  items/[itemId]/route.ts                           PATCH (JSONB data, Zod against parent module type)
  assets/[assetId]/route.ts                         DELETE (trash + remove rows)
  image/route.ts                                    GET — Drive image proxy (mirrors brand-story-image)

src/app/aplus2/
  page.tsx                                          client list
  loading.tsx                                       skeleton
  error.tsx                                         error boundary
  [clientIdCode]/
    page.tsx                                        set list grouped by marketplace + "New A+ Set" dialog
    [marketplace]/
      [setIdentifier]/
        page.tsx                                    version cards (the brand-story analogue)
        _components/
          aplus2-set-page.tsx                       page-level state + dialogs
          aplus2-version-card.tsx                   one version card header + body
          aplus2-module-editor.tsx                  schema-driven module subcard
          aplus2-module-picker.tsx                  "Add module" dropdown (filterable)
          aplus2-image-slot.tsx                     upload / preview / alt-text for one slot
          aplus2-video-slot.tsx                     video upload + title/description
          aplus2-repeatable-items.tsx               renders N items from spec.repeatableGroup

src/lib/permissions.ts                              +1 subsection "aplus2" under "design"
```

---

## Operating Rules (non-negotiable — read before every commit)

1. **Stage explicit files only.** NEVER `git add .` or `git add -A`. The working tree has ~46 unrelated drift files; they must not be touched.
2. **Commit trailer is EXACT and passed via HEREDOC:**
   ```bash
   git commit -m "$(cat <<'EOF'
   <subject line>

   <body if any>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```
3. **Never `git push`** without explicit per-push confirmation from the user. Vercel auto-deploys main.
4. **DB = prod.** `.env.local` `DATABASE_URL` points at production Supabase. `pg_dump` before migration 0068.
5. **Migrations always start with** `SET statement_timeout = 0;`. No FK references to `aac` (lock contention). Self-referential FKs and partial unique indexes are declared in raw SQL, never via Drizzle.
6. **Fish-shell env loader:** `bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "..."'`. The plan uses this verbatim in every psql step.
7. **Dev server:** `PORT=3000 npm run dev`.
8. **Quote bracketed paths** in every shell command: `"src/app/aplus2/[clientIdCode]/page.tsx"`. Fish + bash both glob otherwise.
9. **Do NOT touch /aplus.** It stays untouched as reference. Touching shared utilities (`src/lib/drive-client.ts`, `src/lib/drive-upload.ts`) is allowed but must be additive — no behaviour changes to brand-story or /aplus.
10. **Char limits live in Zod (`src/lib/aplus2/zod-schemas.ts`), not in DB CHECKs.** The same column has different caps per module type.
11. **`drizzle-kit db:generate` is broken in this project.** Migration SQL is hand-written.

---

# Phase 1 — Schema, Types, Module Specs

**Goal:** Land 5 new tables in PostgreSQL, expose them in Drizzle, copy + adapt the module specs, write the Zod validators, write the Drive naming helpers. Phase ends with `npm run build` green and a verifiable schema in psql.

**Files touched this phase:**
- Create: `src/lib/aplus2/module-specs.ts`, `src/lib/aplus2/zod-schemas.ts`, `src/lib/aplus2/drive-naming.ts`, `src/lib/aplus2/marketplace.ts`, `drizzle/migrations/0068_aplus2.sql`, `src/lib/aplus2/drive-naming.test.ts`, `src/lib/aplus2/zod-schemas.test.ts`.
- Modify: `src/lib/db/schema.ts` (append exports only — do not edit anything above the brand-story block).

---

### Task 1.1: Pre-flight snapshot and Drive parent verification

**Files:**
- No code changes. Verification only.

- [ ] **Step 1: Confirm the working directory and current branch**

Run:
```bash
git -C /Users/manu/1o8Hub status --short | head -5
git -C /Users/manu/1o8Hub rev-parse --abbrev-ref HEAD
git -C /Users/manu/1o8Hub log --oneline -5
```
Expected: branch is `main`, HEAD points at commit `b42a961d` (spec) or later. Working tree shows the ~46 drift files listed in the primer — confirm none are inside `drizzle/migrations/`, `src/lib/aplus2/`, `src/app/aplus2/`, or `src/app/api/aplus2/`. If any are, STOP and flag to user.

- [ ] **Step 2: Take a pg_dump snapshot of the schema-relevant scope**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && mkdir -p .backups && pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" > ".backups/pre-0068-aplus2-$(date +%Y%m%d-%H%M%S).sql"'
ls -lh /Users/manu/1o8Hub/.backups/ | tail -3
```
Expected: a `pre-0068-aplus2-*.sql` file > 50 KB. This is the rollback artefact.

- [ ] **Step 3: Confirm `drive_folders` already has rows we can use as the A+2 parent**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "SELECT folder_type, COUNT(*) FROM drive_folders GROUP BY folder_type ORDER BY 1;"'
```
Expected: at least one of `aplus` or `content` rows exists per active client. Save the result mentally — Phase 2 Task 2.2 (`POST /api/aplus2/sets`) reads `drive_folders WHERE folder_type IN ('aplus','content')` to find the parent.

- [ ] **Step 4: Confirm `master.country` is populated with 2-letter codes**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "SELECT country, marketplace, COUNT(*) FROM master WHERE country IS NOT NULL GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20;"'
```
Expected: `country` column contains 2-letter codes like `US`, `UK`, `DE`, `MX`. If not, the marketplace-normalisation helper (Task 1.6) must derive from `marketplace` instead. Note the actual data shape in the next task's helper.

- [ ] **Step 5: No commit — verification only**

This task is read-only. Proceed to Task 1.2.

---

### Task 1.2: Write migration 0068 (5 tables + indexes + partial uniques)

**Files:**
- Create: `drizzle/migrations/0068_aplus2.sql`

- [ ] **Step 1: Write the migration file**

Create `drizzle/migrations/0068_aplus2.sql`:

```sql
-- Supabase pooler sets a short statement_timeout; CREATE TABLE under load can
-- exceed it. Override per-session. No FK references to aac (lock contention,
-- matches brand_story / drive_folders precedent).
SET statement_timeout = 0;
SET lock_timeout = '30s';

-- ─── aplus2_sets ─────────────────────────────────────────────────────
-- One set per (client_id_code, marketplace, scope_identifier).
-- scope_identifier is the raw ASIN string for ASIN scope, or the parent ASIN
-- for PARENT scope.
CREATE TABLE aplus2_sets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code     varchar(100) NOT NULL,
  product_id         uuid         NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  scope_type         varchar(8)   NOT NULL,
  scope_identifier   varchar(20)  NOT NULL,
  marketplace        varchar(5)   NOT NULL,
  parent_asin        varchar(20),
  covered_asins      jsonb,
  platform           varchar(2)   NOT NULL DEFAULT 'SC',
  content_type       varchar(3)   NOT NULL DEFAULT 'PA+',
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  CHECK (scope_type IN ('ASIN', 'PARENT')),
  CHECK (platform = 'SC'),
  CHECK (content_type = 'PA+'),
  UNIQUE (client_id_code, marketplace, scope_identifier)
);
CREATE INDEX idx_aplus2_sets_client   ON aplus2_sets(client_id_code);
CREATE INDEX idx_aplus2_sets_product  ON aplus2_sets(product_id);

-- ─── aplus2_versions ─────────────────────────────────────────────────
CREATE TABLE aplus2_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          uuid        NOT NULL REFERENCES aplus2_sets(id) ON DELETE CASCADE,
  version_number  int         NOT NULL,
  status          text        NOT NULL DEFAULT 'not_started',
  drive_folder_id uuid REFERENCES drive_folders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('not_started','in_progress','in_review','approved','live')),
  UNIQUE (set_id, version_number)
);
CREATE INDEX idx_aplus2_versions_set ON aplus2_versions(set_id);

-- ─── aplus2_modules ──────────────────────────────────────────────────
-- module_type is free text (validated by Zod against module-specs.ts at the
-- API boundary). Char limits per text column live in Zod, not DB CHECKs.
CREATE TABLE aplus2_modules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id           uuid        NOT NULL REFERENCES aplus2_versions(id) ON DELETE CASCADE,
  position             int         NOT NULL,
  module_type          text        NOT NULL,
  status               text        NOT NULL DEFAULT 'draft',
  headline_text        text,
  subheadline_text     text,
  body_text            text,
  overlay_text         text,
  alt_text             text,
  image_description    text,
  ai_image_prompt      text,
  cosmo_relation_type  varchar(100),
  video_drive_file_id  text,
  video_title          text,
  video_description    text,
  text_position        varchar(10),
  font_color           varchar(10),
  figma_url            text,
  markup_url           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','in_review','approved','uploaded','live')),
  CHECK (position BETWEEN 1 AND 7),
  UNIQUE (version_id, position)
);
CREATE INDEX idx_aplus2_modules_version ON aplus2_modules(version_id);
CREATE INDEX idx_aplus2_modules_status  ON aplus2_modules(status);

-- ─── aplus2_module_items ─────────────────────────────────────────────
-- Generic repeatable child. data JSONB stores a TS-discriminated-union shape
-- keyed by the parent module's type. Zod validates the shape at the API
-- boundary — there is no DB CHECK because the schema varies per module.
CREATE TABLE aplus2_module_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid        NOT NULL REFERENCES aplus2_modules(id) ON DELETE CASCADE,
  position    int         NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, position)
);
CREATE INDEX idx_aplus2_module_items_module ON aplus2_module_items(module_id);

-- ─── aplus2_assets ───────────────────────────────────────────────────
-- One row per filled image/video slot per variant (desktop|mobile).
-- Video slots only use the desktop variant.
CREATE TABLE aplus2_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid        NOT NULL REFERENCES aplus2_versions(id) ON DELETE CASCADE,
  module_id       uuid REFERENCES aplus2_modules(id) ON DELETE CASCADE,
  module_item_id  uuid REFERENCES aplus2_module_items(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  slot_key        text        NOT NULL,
  variant         text        NOT NULL DEFAULT 'desktop',
  drive_file_id   uuid        NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,
  filename        text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('image','video')),
  CHECK (variant IN ('desktop','mobile'))
);
CREATE INDEX idx_aplus2_assets_version       ON aplus2_assets(version_id);
CREATE INDEX idx_aplus2_assets_module        ON aplus2_assets(module_id);
CREATE INDEX idx_aplus2_assets_module_item   ON aplus2_assets(module_item_id);

-- Partial unique: one asset per (module slot key + variant) when not inside
-- a repeatable item.
CREATE UNIQUE INDEX uq_aplus2_assets_module_slot_variant
  ON aplus2_assets(module_id, slot_key, variant)
  WHERE module_item_id IS NULL AND module_id IS NOT NULL;

-- Partial unique: one asset per (module_item slot key + variant) when inside
-- a repeatable item.
CREATE UNIQUE INDEX uq_aplus2_assets_item_slot_variant
  ON aplus2_assets(module_item_id, slot_key, variant)
  WHERE module_item_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -f drizzle/migrations/0068_aplus2.sql'
```
Expected: 5 × `CREATE TABLE`, ~9 × `CREATE INDEX`, no errors. If any statement fails, restore from `.backups/pre-0068-aplus2-*.sql` and debug.

- [ ] **Step 3: Verify tables exist with expected columns**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "\d+ aplus2_sets" -c "\d+ aplus2_versions" -c "\d+ aplus2_modules" -c "\d+ aplus2_module_items" -c "\d+ aplus2_assets"'
```
Expected: all 5 tables present with the columns from the migration. Indexes including `uq_aplus2_assets_module_slot_variant` and `uq_aplus2_assets_item_slot_variant` listed.

- [ ] **Step 4: Verify the FKs cascade correctly with a smoke test**

Run:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" <<SQL
BEGIN;
WITH p AS (SELECT id FROM master LIMIT 1)
INSERT INTO aplus2_sets (client_id_code, product_id, scope_type, scope_identifier, marketplace)
SELECT '"'"'__TEST__'"'"', p.id, '"'"'ASIN'"'"', '"'"'B0TEST0001'"'"', '"'"'US'"'"' FROM p
RETURNING id;
SELECT COUNT(*) AS sets_inserted FROM aplus2_sets WHERE client_id_code = '"'"'__TEST__'"'"';
ROLLBACK;
SQL'
```
Expected: 1 row inserted, then rolled back. If the FK to `master` errors, the migration was applied incorrectly.

- [ ] **Step 5: Commit the migration**

Run:
```bash
cd /Users/manu/1o8Hub && git add drizzle/migrations/0068_aplus2.sql && git commit -m "$(cat <<'EOF'
feat(aplus2): migration 0068 — 5 tables for per-version A+ editor

Adds aplus2_sets, aplus2_versions, aplus2_modules, aplus2_module_items,
aplus2_assets. Partial unique indexes enforce one-asset-per-slot per
variant. No FK to aac (matches brand_story / drive_folders pattern).
Char limits enforced in Zod (API layer), not DB CHECKs.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Add the Drizzle table exports

**Files:**
- Modify: `src/lib/db/schema.ts` — append exports AFTER `brandStoryAssets` (line ~1786). Do NOT modify anything above.

- [ ] **Step 1: Append the Drizzle exports**

Open `src/lib/db/schema.ts`, scroll to the end of the `brandStoryAssets` definition (around line 1786, after the closing `);` and trailing comment). Insert the following block immediately after it:

```ts
// ─── A+ 2.0 (per-version A+ Content editor) ──────────────────────────
// 5 tables mirror the brand-story per-version model. Char limits live in
// Zod (src/lib/aplus2/zod-schemas.ts), not DB CHECKs — same column has
// different caps per module type. Partial unique indexes on aplus2_assets
// are declared in drizzle/migrations/0068_aplus2.sql (Drizzle can't express
// `WHERE`).

export const aplus2Sets = pgTable(
  "aplus2_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientIdCode: varchar("client_id_code", { length: 100 }).notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    scopeType: varchar("scope_type", { length: 8 }).notNull(),
    // values: 'ASIN' | 'PARENT'
    scopeIdentifier: varchar("scope_identifier", { length: 20 }).notNull(),
    marketplace: varchar("marketplace", { length: 5 }).notNull(),
    parentAsin: varchar("parent_asin", { length: 20 }),
    coveredAsins: jsonb("covered_asins").$type<string[]>(),
    platform: varchar("platform", { length: 2 }).notNull().default("SC"),
    contentType: varchar("content_type", { length: 3 }).notNull().default("PA+"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_sets_client_marketplace_scope_key").on(
      table.clientIdCode,
      table.marketplace,
      table.scopeIdentifier
    ),
    index("idx_aplus2_sets_client").on(table.clientIdCode),
    index("idx_aplus2_sets_product").on(table.productId),
  ]
);

export const aplus2Versions = pgTable(
  "aplus2_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setId: uuid("set_id")
      .notNull()
      .references(() => aplus2Sets.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("not_started"),
    // values: 'not_started' | 'in_progress' | 'in_review' | 'approved' | 'live'
    driveFolderId: uuid("drive_folder_id").references(() => driveFolders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_versions_set_version_key").on(table.setId, table.versionNumber),
    index("idx_aplus2_versions_set").on(table.setId),
  ]
);

export const aplus2Modules = pgTable(
  "aplus2_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => aplus2Versions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    moduleType: text("module_type").notNull(),
    status: text("status").notNull().default("draft"),
    // values: 'draft' | 'in_review' | 'approved' | 'uploaded' | 'live'
    headlineText: text("headline_text"),
    subheadlineText: text("subheadline_text"),
    bodyText: text("body_text"),
    overlayText: text("overlay_text"),
    altText: text("alt_text"),
    imageDescription: text("image_description"),
    aiImagePrompt: text("ai_image_prompt"),
    cosmoRelationType: varchar("cosmo_relation_type", { length: 100 }),
    videoDriveFileId: text("video_drive_file_id"),
    videoTitle: text("video_title"),
    videoDescription: text("video_description"),
    textPosition: varchar("text_position", { length: 10 }),
    fontColor: varchar("font_color", { length: 10 }),
    figmaUrl: text("figma_url"),
    markupUrl: text("markup_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_modules_version_position_key").on(table.versionId, table.position),
    index("idx_aplus2_modules_version").on(table.versionId),
    index("idx_aplus2_modules_status").on(table.status),
  ]
);

export const aplus2ModuleItems = pgTable(
  "aplus2_module_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => aplus2Modules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aplus2_module_items_module_position_key").on(table.moduleId, table.position),
    index("idx_aplus2_module_items_module").on(table.moduleId),
  ]
);

export const aplus2Assets = pgTable(
  "aplus2_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => aplus2Versions.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id").references(() => aplus2Modules.id, {
      onDelete: "cascade",
    }),
    moduleItemId: uuid("module_item_id").references(() => aplus2ModuleItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    // values: 'image' | 'video'
    slotKey: text("slot_key").notNull(),
    variant: text("variant").notNull().default("desktop"),
    // values: 'desktop' | 'mobile'
    driveFileId: uuid("drive_file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_aplus2_assets_version").on(table.versionId),
    index("idx_aplus2_assets_module").on(table.moduleId),
    index("idx_aplus2_assets_module_item").on(table.moduleItemId),
    // Partial unique indexes declared in SQL migration (Drizzle can't express WHERE).
  ]
);
```

- [ ] **Step 2: Run `npm run build` to confirm types resolve**

Run:
```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -40
```
Expected: build completes (warnings OK, errors NOT). If any TypeScript error in schema.ts, fix and re-run. Common pitfall: forgetting to import `unique` / `index` / `varchar` — they should already be imported at the top of `schema.ts` (used by every table above). Confirm by grepping the file header.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/manu/1o8Hub && git add src/lib/db/schema.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): drizzle exports for 5 new tables

Mirrors brand-story schema model. Partial unique indexes on aplus2_assets
remain in the SQL migration (Drizzle WHERE-clause unsupported).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

NOTE: Later API tasks reference these schemas by name. If you rename any table/column, update the API tasks too.

---

### Task 1.4: Copy and adapt the module specs to `src/lib/aplus2/module-specs.ts`

**Files:**
- Create: `src/lib/aplus2/module-specs.ts`

The existing file `src/lib/aplus-module-specs.ts` already contains all 19 Premium A+ module specs. The A+2 version mirrors the data and adds a discriminated-union type for the repeatable-item JSONB payload, plus a per-item-data-type tag that is NOT present in the v1 file.

- [ ] **Step 1: Create the new file with the type definitions**

Create `src/lib/aplus2/module-specs.ts`:

```ts
// A+ 2.0 Module Specifications
//
// Schema-driven spec for all 19 Amazon Premium A+ module types. The editor
// component (<Aplus2ModuleEditor>) renders text fields, image slots, video
// slots, and repeatable items by reading this file — no per-type code.
//
// Repeatable items store their per-type fields in aplus2_module_items.data
// (JSONB). The Aplus2ItemData discriminated union below is the canonical
// shape; Zod validators in zod-schemas.ts enforce it at the API boundary.

export const APLUS2_MODULE_TYPES = [
  "background_image_text",
  "comparison_table_1",
  "comparison_table_2",
  "comparison_table_3",
  "dual_images_text",
  "four_images_text",
  "full_image",
  "full_video",
  "hotspots_1",
  "hotspots_2",
  "navigation_carousel",
  "qa",
  "regimen_carousel",
  "simple_image_carousel",
  "single_image_text",
  "technical_specifications",
  "text",
  "video_image_carousel",
  "video_text",
] as const;

export type Aplus2ModuleType = (typeof APLUS2_MODULE_TYPES)[number];

/** Item-data tag stored at module-spec time — Zod uses this to pick the
 * right shape validator for aplus2_module_items.data. */
export type Aplus2ItemDataType =
  | "qa"
  | "comparison_row_1"
  | "comparison_row_2"
  | "comparison_row_3"
  | "carousel_slide"
  | "hotspot"
  | "regimen_step"
  | "tech_spec_row"
  | "image_caption"
  | "panel";

/** Discriminated union for aplus2_module_items.data. */
export type Aplus2ItemData =
  | { type: "qa"; question: string; answer: string }
  | { type: "comparison_row_1"; metric: string; metric_type: string; value_hero: string; value_1: string; value_2: string; value_3: string; value_4: string; value_5: string; value_6: string }
  | { type: "comparison_row_2"; headline_1: string; body_1: string; headline_2: string; body_2: string; headline_3: string; body_3: string }
  | { type: "comparison_row_3"; feature: string; metric_type: string; value_hero: string; value_1: string; value_2: string; value_3: string; value_4: string }
  | { type: "carousel_slide"; headline: string; body: string; cta_text: string; asin: string }
  | { type: "hotspot"; title: string; description?: string }
  | { type: "regimen_step"; step_label: string; description: string; nav_text: string }
  | { type: "tech_spec_row"; spec_label: string; spec_value: string }
  | { type: "image_caption"; caption: string; body: string }
  | { type: "panel"; tab_title?: string; subheadline?: string; caption?: string; body: string; headline?: string };

// ─── Field spec types (mirror aplus-module-specs.ts) ────────────────

export interface Aplus2TextFieldSpec {
  /** DB column key — limited to the 4 shared text columns in v1. */
  key: "headlineText" | "subheadlineText" | "bodyText" | "overlayText";
  label: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

export interface Aplus2ImageSize {
  width: number;
  height: number;
}

export interface Aplus2ImageSlotSpec {
  /** Stored in aplus2_assets.slot_key. */
  key: string;
  label: string;
  desktopSize: Aplus2ImageSize;
  /** When present, the slot also accepts a mobile variant. */
  mobileSize?: Aplus2ImageSize;
}

export interface Aplus2RepeatableFieldSpec {
  /** Field key inside aplus2_module_items.data. */
  key: string;
  label: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
}

export interface Aplus2RepeatableImageSpec {
  key: string;
  label: string;
  desktopSize: Aplus2ImageSize;
  mobileSize?: Aplus2ImageSize;
}

export interface Aplus2RepeatableGroupSpec {
  label: string;
  itemLabel: string;
  minItems: number;
  maxItems: number;
  defaultCount: number;
  fields: Aplus2RepeatableFieldSpec[];
  image?: Aplus2RepeatableImageSpec;
  /** Discriminator written into data.type for every item of this group. */
  itemDataType: Aplus2ItemDataType;
}

export interface Aplus2VideoSpec {
  titleMaxLen: number;
  descriptionMaxLen: number;
}

export type Aplus2LayoutControl =
  | { key: "text_position"; options: Array<"left" | "right"> }
  | { key: "font_color"; options: Array<"light" | "dark"> };

export type Aplus2LayoutItem =
  | { type: "textField"; fieldKey: Aplus2TextFieldSpec["key"] }
  | { type: "imageSlot"; slotKey: string }
  | { type: "repeatableGroup" }
  | { type: "videoSlot" };

export interface Aplus2ModuleSpec {
  type: Aplus2ModuleType;
  label: string;
  description: string;
  textFields: Aplus2TextFieldSpec[];
  imageSlots: Aplus2ImageSlotSpec[];
  repeatableGroup?: Aplus2RepeatableGroupSpec;
  video?: Aplus2VideoSpec;
  layoutControls?: Aplus2LayoutControl[];
  layout?: Aplus2LayoutItem[];
}

/** Compute layout order — uses explicit `layout` if defined, else defaults
 * to: textFields → imageSlots → (videoSlot if video) → repeatableGroup. */
export function getAplus2ModuleLayout(spec: Aplus2ModuleSpec): Aplus2LayoutItem[] {
  if (spec.layout) return spec.layout;
  const items: Aplus2LayoutItem[] = [];
  for (const f of spec.textFields) items.push({ type: "textField", fieldKey: f.key });
  for (const s of spec.imageSlots) items.push({ type: "imageSlot", slotKey: s.key });
  if (spec.video) items.push({ type: "videoSlot" });
  if (spec.repeatableGroup) items.push({ type: "repeatableGroup" });
  return items;
}

// ─── 19 module specs ────────────────────────────────────────────────
// Data transcribed from src/lib/aplus-module-specs.ts with these deltas:
//   1. Every repeatableGroup gets `itemDataType` + `defaultCount`.
//   2. background_image_text gains `layoutControls` for text_position + font_color.
//   3. Video modules gain a `video` spec block (title 60, description 600).
// Image dimensions, char limits, min/max counts are byte-for-byte identical.

export const APLUS2_MODULE_SPECS: Record<Aplus2ModuleType, Aplus2ModuleSpec> = {
  background_image_text: {
    type: "background_image_text",
    label: "Premium Background Image with Text",
    description: "Full-width background image with subheadline, headline and body text overlay",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 60 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [
      { key: "background_image", label: "Background image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    ],
    layoutControls: [
      { key: "text_position", options: ["left", "right"] },
      { key: "font_color", options: ["light", "dark"] },
    ],
    layout: [
      { type: "textField", fieldKey: "subheadlineText" },
      { type: "textField", fieldKey: "headlineText" },
      { type: "textField", fieldKey: "bodyText" },
      { type: "imageSlot", slotKey: "background_image" },
    ],
  },

  comparison_table_1: {
    type: "comparison_table_1",
    label: "Premium Comparison Table 1",
    description: "Hero product + 3 to 6 comparison products with metrics",
    textFields: [{ key: "headlineText", label: "Title", maxLength: 25 }],
    imageSlots: [
      { key: "hero_product", label: "Hero Product", desktopSize: { width: 200, height: 225 } },
      { key: "product_1", label: "Product 1", desktopSize: { width: 200, height: 225 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 200, height: 225 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 200, height: 225 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 200, height: 225 } },
      { key: "product_5", label: "Product 5", desktopSize: { width: 200, height: 225 } },
      { key: "product_6", label: "Product 6", desktopSize: { width: 200, height: 225 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 5, maxItems: 12, defaultCount: 5,
      itemDataType: "comparison_row_1",
      fields: [
        { key: "metric", label: "Metric", maxLength: 30 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_hero", label: "Hero Value", maxLength: 30 },
        { key: "value_1", label: "Product 1 Value", maxLength: 30 },
        { key: "value_2", label: "Product 2 Value", maxLength: 30 },
        { key: "value_3", label: "Product 3 Value", maxLength: 30 },
        { key: "value_4", label: "Product 4 Value", maxLength: 30 },
        { key: "value_5", label: "Product 5 Value", maxLength: 30 },
        { key: "value_6", label: "Product 6 Value", maxLength: 30 },
      ],
    },
  },

  comparison_table_2: {
    type: "comparison_table_2",
    label: "Premium Comparison Table 2",
    description: "3 products with images, headlines, ASINs, and feature comparison rows",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [
      { key: "product_1", label: "Product 1", desktopSize: { width: 300, height: 225 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 300, height: 225 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Feature comparison", itemLabel: "Comparison", minItems: 2, maxItems: 5, defaultCount: 2,
      itemDataType: "comparison_row_2",
      fields: [
        { key: "headline_1", label: "Headline (Product 1)", maxLength: 30 },
        { key: "body_1", label: "Body text (Product 1)", maxLength: 80 },
        { key: "headline_2", label: "Headline (Product 2)", maxLength: 30 },
        { key: "body_2", label: "Body text (Product 2)", maxLength: 80 },
        { key: "headline_3", label: "Headline (Product 3)", maxLength: 30 },
        { key: "body_3", label: "Body text (Product 3)", maxLength: 80 },
      ],
    },
  },

  comparison_table_3: {
    type: "comparison_table_3",
    label: "Premium Comparison Table 3",
    description: "Hero plus 2 to 4 comparison products with toggle-style feature comparison",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 25 }],
    imageSlots: [
      { key: "hero_product", label: "Hero Product", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_1", label: "Product 1", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_2", label: "Product 2", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_3", label: "Product 3", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
      { key: "product_4", label: "Product 4", desktopSize: { width: 488, height: 700 }, mobileSize: { width: 600, height: 450 } },
    ],
    repeatableGroup: {
      label: "Comparison Metrics", itemLabel: "Metric", minItems: 3, maxItems: 7, defaultCount: 3,
      itemDataType: "comparison_row_3",
      fields: [
        { key: "feature", label: "Metric", maxLength: 20 },
        { key: "metric_type", label: "Type", hint: "checkbox or text" },
        { key: "value_hero", label: "Hero Value", maxLength: 30 },
        { key: "value_1", label: "Product 1", maxLength: 30 },
        { key: "value_2", label: "Product 2", maxLength: 30 },
        { key: "value_3", label: "Product 3", maxLength: 30 },
        { key: "value_4", label: "Product 4", maxLength: 30 },
      ],
    },
  },

  dual_images_text: {
    type: "dual_images_text",
    label: "Premium Dual Images with Text",
    description: "2 images side-by-side, each with its own headline and body text",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 50 }],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 650, height: 350 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 650, height: 350 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 2, maxItems: 2, defaultCount: 2,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 300 },
      ],
    },
  },

  four_images_text: {
    type: "four_images_text",
    label: "Premium Four Images and Text",
    description: "4 images in a row, each with headline and short body text",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [
      { key: "image_1", label: "Image 1", desktopSize: { width: 300, height: 225 } },
      { key: "image_2", label: "Image 2", desktopSize: { width: 300, height: 225 } },
      { key: "image_3", label: "Image 3", desktopSize: { width: 300, height: 225 } },
      { key: "image_4", label: "Image 4", desktopSize: { width: 300, height: 225 } },
    ],
    repeatableGroup: {
      label: "Image Captions", itemLabel: "Caption", minItems: 4, maxItems: 4, defaultCount: 4,
      itemDataType: "image_caption",
      fields: [
        { key: "caption", label: "Image Headline", maxLength: 30 },
        { key: "body", label: "Image Body Text", multiline: true, rows: 2, maxLength: 150 },
      ],
    },
  },

  full_image: {
    type: "full_image",
    label: "Premium Full Image",
    description: "Full-width image with optional headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [{ key: "main_image", label: "Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } }],
    layout: [
      { type: "textField", fieldKey: "headlineText" },
      { type: "imageSlot", slotKey: "main_image" },
      { type: "textField", fieldKey: "bodyText" },
    ],
  },

  full_video: {
    type: "full_video",
    label: "Premium Full Video",
    description: "Full-width video with thumbnail, headline and body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [{ key: "video_thumbnail", label: "Video thumbnail", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } }],
    video: { titleMaxLen: 60, descriptionMaxLen: 600 },
    layout: [
      { type: "textField", fieldKey: "headlineText" },
      { type: "imageSlot", slotKey: "video_thumbnail" },
      { type: "videoSlot" },
      { type: "textField", fieldKey: "bodyText" },
    ],
  },

  hotspots_1: {
    type: "hotspots_1",
    label: "Premium Hotspots 1",
    description: "Background image with clickable hotspots, each revealing headline + body + image",
    textFields: [],
    imageSlots: [{ key: "main_image", label: "Background Image", desktopSize: { width: 1464, height: 600 } }],
    repeatableGroup: {
      label: "Hotspots", itemLabel: "Hotspot", minItems: 1, maxItems: 6, defaultCount: 3,
      itemDataType: "hotspot",
      fields: [
        { key: "title", label: "Headline", maxLength: 50 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
      ],
      image: { key: "hotspot_image", label: "Hotspot Image", desktopSize: { width: 600, height: 450 } },
    },
  },

  hotspots_2: {
    type: "hotspots_2",
    label: "Premium Hotspots 2",
    description: "Headline + body text, background image with numbered hotspots",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 2, maxLength: 300 },
    ],
    imageSlots: [{ key: "main_image", label: "Background Image", desktopSize: { width: 1464, height: 600 } }],
    repeatableGroup: {
      label: "Hotspots", itemLabel: "Hotspot", minItems: 1, maxItems: 8, defaultCount: 3,
      itemDataType: "hotspot",
      fields: [{ key: "title", label: "Headline", maxLength: 50 }],
      image: { key: "hotspot_image", label: "Hotspot Image", desktopSize: { width: 600, height: 450 } },
    },
  },

  navigation_carousel: {
    type: "navigation_carousel",
    label: "Premium Navigation Carousel",
    description: "Tabbed navigation with image + text card per panel",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 5, defaultCount: 2,
      itemDataType: "panel",
      fields: [
        { key: "tab_title", label: "Navigation Text", maxLength: 25 },
        { key: "subheadline", label: "Subheadline", maxLength: 25 },
        { key: "caption", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
      ],
      image: { key: "tab_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  qa: {
    type: "qa",
    label: "Premium Q&A",
    description: "Accordion-style question and answer pairs",
    textFields: [],
    imageSlots: [],
    repeatableGroup: {
      label: "Q&A Pairs", itemLabel: "Q&A", minItems: 2, maxItems: 5, defaultCount: 3,
      itemDataType: "qa",
      fields: [
        { key: "question", label: "Question", maxLength: 120 },
        { key: "answer", label: "Answer", multiline: true, rows: 3, maxLength: 250 },
      ],
    },
  },

  regimen_carousel: {
    type: "regimen_carousel",
    label: "Premium Regimen Carousel",
    description: "Numbered step carousel with image, headline, body text, and navigation",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 100 }],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 5, defaultCount: 3,
      itemDataType: "regimen_step",
      fields: [
        { key: "step_label", label: "Headline", maxLength: 20 },
        { key: "description", label: "Body Text", multiline: true, rows: 2, maxLength: 100 },
        { key: "nav_text", label: "Navigation Text", maxLength: 20 },
      ],
      image: { key: "step_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  simple_image_carousel: {
    type: "simple_image_carousel",
    label: "Premium Simple Image Carousel",
    description: "Full-width image slides with headline, body text, and button",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body text", multiline: true, rows: 3, maxLength: 300 },
    ],
    imageSlots: [],
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 6, defaultCount: 3,
      itemDataType: "carousel_slide",
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "body", label: "Body Text", multiline: true, rows: 2, maxLength: 200 },
        { key: "cta_text", label: "Button Text", maxLength: 12, hint: "Button label (optional)" },
        { key: "asin", label: "ASIN", maxLength: 10, hint: "Linked ASIN for button" },
      ],
      image: { key: "slide_image", label: "Panel Image", desktopSize: { width: 1464, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  single_image_text: {
    type: "single_image_text",
    label: "Premium Single Image with Text",
    description: "Image on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [{ key: "main_image", label: "Image", desktopSize: { width: 800, height: 600 } }],
  },

  technical_specifications: {
    type: "technical_specifications",
    label: "Premium Technical Specifications",
    description: "Two-column spec table with label-value rows",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [],
    repeatableGroup: {
      label: "Specifications", itemLabel: "Spec", minItems: 4, maxItems: 16, defaultCount: 4,
      itemDataType: "tech_spec_row",
      fields: [
        { key: "spec_label", label: "Specification Name", maxLength: 30 },
        { key: "spec_value", label: "Definition", multiline: true, rows: 3, maxLength: 500 },
      ],
    },
  },

  text: {
    type: "text",
    label: "Premium Text",
    description: "Headline with long-form body text",
    textFields: [
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 6, maxLength: 5000 },
    ],
    imageSlots: [],
  },

  video_image_carousel: {
    type: "video_image_carousel",
    label: "Premium Video Image Carousel",
    description: "Video plus image carousel with headline, subheadline, and body text per panel",
    textFields: [{ key: "headlineText", label: "Headline", maxLength: 80 }],
    imageSlots: [],
    video: { titleMaxLen: 60, descriptionMaxLen: 600 },
    repeatableGroup: {
      label: "Panels", itemLabel: "Panel", minItems: 2, maxItems: 6, defaultCount: 3,
      itemDataType: "panel",
      fields: [
        { key: "headline", label: "Headline", maxLength: 50 },
        { key: "subheadline", label: "Subheadline", maxLength: 80 },
        { key: "body", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
      ],
      image: { key: "carousel_image", label: "Panel Image", desktopSize: { width: 800, height: 600 }, mobileSize: { width: 600, height: 450 } },
    },
  },

  video_text: {
    type: "video_text",
    label: "Premium Video with Text",
    description: "Video on one side with subheadline, headline, and body text",
    textFields: [
      { key: "subheadlineText", label: "Subheadline", maxLength: 40 },
      { key: "headlineText", label: "Headline", maxLength: 80 },
      { key: "bodyText", label: "Body Text", multiline: true, rows: 3, maxLength: 500 },
    ],
    imageSlots: [{ key: "video_thumbnail", label: "Video thumbnail", desktopSize: { width: 800, height: 600 } }],
    video: { titleMaxLen: 60, descriptionMaxLen: 600 },
  },
};
```

- [ ] **Step 2: Verify it builds**

Run:
```bash
cd /Users/manu/1o8Hub && npx tsc --noEmit src/lib/aplus2/module-specs.ts 2>&1 | head -20
```
Expected: no output (clean). If TS errors, fix them — most likely a typo in a key name.

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/manu/1o8Hub && git add src/lib/aplus2/module-specs.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): module specs for all 19 Premium A+ types

Schema-driven config consumed by <Aplus2ModuleEditor>. Adds itemDataType
discriminator on every repeatableGroup (drives the Zod validator dispatch
in zod-schemas.ts). Image dimensions, char limits, and item counts are
byte-identical to src/lib/aplus-module-specs.ts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Drive-naming helpers + unit tests

**Files:**
- Create: `src/lib/aplus2/drive-naming.ts`, `src/lib/aplus2/drive-naming.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/aplus2/drive-naming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aplus2VersionSlug,
  aplus2ModulePosition,
  aplus2AssetFilename,
} from "./drive-naming";

describe("aplus2VersionSlug", () => {
  it("formats client+marketplace+scope+version", () => {
    expect(
      aplus2VersionSlug({ clientIdCode: "CLIENT01", marketplace: "US", scopeIdentifier: "B0ABCD1234", versionNumber: 1 })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01");
  });
  it("pads version number to 2 digits", () => {
    expect(
      aplus2VersionSlug({ clientIdCode: "C", marketplace: "DE", scopeIdentifier: "B0X", versionNumber: 12 })
    ).toBe("C_DE_B0X_Aplus_V12");
  });
});

describe("aplus2ModulePosition", () => {
  it("pads to M##", () => {
    expect(aplus2ModulePosition(1)).toBe("M01");
    expect(aplus2ModulePosition(7)).toBe("M07");
    expect(aplus2ModulePosition(10)).toBe("M10");
  });
});

describe("aplus2AssetFilename", () => {
  const slug = "CLIENT01_US_B0ABCD1234_Aplus_V01";

  it("formats a module-level desktop asset", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 1, slotKey: "focus", variant: "desktop", ext: "png" })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01_M01_focus.png");
  });

  it("appends _mobile suffix on mobile variant", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 1, slotKey: "focus", variant: "mobile", ext: "png" })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01_M01_focus_mobile.png");
  });

  it("formats a repeatable-item desktop asset", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 3, slotKey: "image", itemPosition: 2, variant: "desktop", ext: "jpg" })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01_M03_item02_image.jpg");
  });

  it("formats a repeatable-item mobile asset", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 3, slotKey: "image", itemPosition: 2, variant: "mobile", ext: "jpg" })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01_M03_item02_image_mobile.jpg");
  });

  it("formats a video slot", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 7, slotKey: "video", variant: "desktop", ext: "mp4" })
    ).toBe("CLIENT01_US_B0ABCD1234_Aplus_V01_M07_video.mp4");
  });
});
```

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/drive-naming.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found. That confirms the test is wired up before the implementation exists.

- [ ] **Step 2: Implement the helpers**

Create `src/lib/aplus2/drive-naming.ts`:

```ts
// A+ 2.0 Drive naming helpers.
//
// Folder convention:   {CLIENTCODE}_{MARKETPLACE}_{SCOPE_ID}_Aplus_V##
// Filename convention:
//   Module-level     {slug}_M##_{slot_key}.{ext}
//   Module mobile    {slug}_M##_{slot_key}_mobile.{ext}
//   Item-level       {slug}_M##_item##_{slot_key}.{ext}
//   Item mobile      {slug}_M##_item##_{slot_key}_mobile.{ext}
//   Video            {slug}_M##_video.{ext}      (slotKey === "video")

export type Aplus2Variant = "desktop" | "mobile";

export interface Aplus2VersionSlugArgs {
  clientIdCode: string;
  marketplace: string;
  scopeIdentifier: string;
  versionNumber: number;
}

export function aplus2VersionSlug(args: Aplus2VersionSlugArgs): string {
  const v = String(args.versionNumber).padStart(2, "0");
  return `${args.clientIdCode}_${args.marketplace}_${args.scopeIdentifier}_Aplus_V${v}`;
}

export function aplus2ModulePosition(position: number): string {
  return `M${String(position).padStart(2, "0")}`;
}

export function aplus2ItemPosition(position: number): string {
  return `item${String(position).padStart(2, "0")}`;
}

export interface Aplus2AssetFilenameArgs {
  slug: string;
  modulePosition: number;
  slotKey: string;
  /** Set when the asset is inside a repeatable item. */
  itemPosition?: number;
  variant: Aplus2Variant;
  ext: string;
}

export function aplus2AssetFilename(args: Aplus2AssetFilenameArgs): string {
  const m = aplus2ModulePosition(args.modulePosition);
  const variantSuffix = args.variant === "mobile" ? "_mobile" : "";
  if (typeof args.itemPosition === "number") {
    const it = aplus2ItemPosition(args.itemPosition);
    return `${args.slug}_${m}_${it}_${args.slotKey}${variantSuffix}.${args.ext}`;
  }
  return `${args.slug}_${m}_${args.slotKey}${variantSuffix}.${args.ext}`;
}

/** Allowed mime types and their canonical extensions. */
export const APLUS2_IMAGE_MIME: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export const APLUS2_VIDEO_MIME: Record<string, "mp4"> = {
  "video/mp4": "mp4",
};
```

- [ ] **Step 3: Tests pass**

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/drive-naming.test.ts 2>&1 | tail -10
```
Expected: PASS, 5 tests.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/manu/1o8Hub && git add src/lib/aplus2/drive-naming.ts src/lib/aplus2/drive-naming.test.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): drive naming helpers with mobile-variant suffix

Folder slug = {CLIENT}_{MKT}_{SCOPE}_Aplus_V##. Filenames append _mobile
before the extension for mobile variant. Item-level slots insert item##
between M## and slot_key. Video slots use slotKey="video".

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: Marketplace normaliser (`master.country|marketplace` → 2-letter)

**Files:**
- Create: `src/lib/aplus2/marketplace.ts`, `src/lib/aplus2/marketplace.test.ts`

- [ ] **Step 1: Confirm the data shape**

Re-run the query from Task 1.1 Step 4 and write down which column carries the canonical 2-letter code. If `country` is consistently 2-letter, use it as the primary source. If only `marketplace` has data, parse the trailing 2-letter code.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/aplus2/marketplace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeMarketplace, isValidMarketplaceCode } from "./marketplace";

describe("normalizeMarketplace", () => {
  it("returns 2-letter country when populated", () => {
    expect(normalizeMarketplace({ country: "US", marketplace: "AmazonUS" })).toBe("US");
    expect(normalizeMarketplace({ country: "uk", marketplace: null })).toBe("UK");
  });
  it("falls back to last 2 letters of marketplace string", () => {
    expect(normalizeMarketplace({ country: null, marketplace: "AmazonDE" })).toBe("DE");
    expect(normalizeMarketplace({ country: null, marketplace: "Amazon.com.mx" })).toBe("MX");
  });
  it("returns null when neither column is parseable", () => {
    expect(normalizeMarketplace({ country: null, marketplace: null })).toBeNull();
    expect(normalizeMarketplace({ country: "", marketplace: "" })).toBeNull();
    expect(normalizeMarketplace({ country: "USA", marketplace: "Amazon" })).toBeNull();
  });
});

describe("isValidMarketplaceCode", () => {
  it("accepts 2-letter uppercase ISO codes", () => {
    expect(isValidMarketplaceCode("US")).toBe(true);
    expect(isValidMarketplaceCode("DE")).toBe(true);
  });
  it("rejects non-2-letter or non-alpha", () => {
    expect(isValidMarketplaceCode("USA")).toBe(false);
    expect(isValidMarketplaceCode("u1")).toBe(false);
    expect(isValidMarketplaceCode("")).toBe(false);
    expect(isValidMarketplaceCode("us")).toBe(false);
  });
});
```

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/marketplace.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/aplus2/marketplace.ts`:

```ts
// Resolve master.country / master.marketplace into the canonical 2-letter
// ISO country code stored in aplus2_sets.marketplace.

const TWO_LETTER_RE = /^[A-Z]{2}$/;

/** Accepts the 2-letter uppercase form (the canonical aplus2 marketplace). */
export function isValidMarketplaceCode(code: string): boolean {
  return TWO_LETTER_RE.test(code);
}

export interface MarketplaceSource {
  country: string | null;
  marketplace: string | null;
}

export function normalizeMarketplace(src: MarketplaceSource): string | null {
  const c = (src.country ?? "").trim().toUpperCase();
  if (TWO_LETTER_RE.test(c)) return c;
  const m = (src.marketplace ?? "").trim().toUpperCase();
  if (!m) return null;
  // Take the trailing 2-letter run; e.g. "AMAZONDE" → "DE",
  // "AMAZON.COM.MX" → "MX".
  const match = m.match(/([A-Z]{2})$/);
  return match ? match[1] : null;
}
```

- [ ] **Step 4: Tests pass**

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/marketplace.test.ts 2>&1 | tail -10
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/manu/1o8Hub && git add src/lib/aplus2/marketplace.ts src/lib/aplus2/marketplace.test.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): marketplace normaliser → 2-letter ISO code

Resolves master.country (preferred) → master.marketplace (fallback) into
the canonical aplus2_sets.marketplace value. Pure; unit-tested.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.7: Zod validators keyed by module type

**Files:**
- Create: `src/lib/aplus2/zod-schemas.ts`, `src/lib/aplus2/zod-schemas.test.ts`

- [ ] **Step 1: Write the tests first**

Create `src/lib/aplus2/zod-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  validateModulePatch,
  validateItemData,
  defaultItemDataFor,
} from "./zod-schemas";

describe("validateModulePatch", () => {
  it("accepts a background_image_text patch within limits", () => {
    const r = validateModulePatch("background_image_text", {
      subheadlineText: "x".repeat(40),
      headlineText: "h".repeat(60),
      bodyText: "b".repeat(300),
      status: "draft",
      textPosition: "left",
      fontColor: "dark",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects subheadline over 40 chars", () => {
    const r = validateModulePatch("background_image_text", { subheadlineText: "x".repeat(41) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/subheadline/i);
  });
  it("rejects font_color for modules that don't declare it", () => {
    expect(validateModulePatch("text", { fontColor: "light" }).ok).toBe(false);
  });
  it("accepts the 5 module status values", () => {
    for (const s of ["draft", "in_review", "approved", "uploaded", "live"] as const) {
      expect(validateModulePatch("text", { status: s }).ok).toBe(true);
    }
  });
  it("rejects an unknown status", () => {
    expect(validateModulePatch("text", { status: "bogus" as never }).ok).toBe(false);
  });
  it("accepts video fields on full_video", () => {
    expect(validateModulePatch("full_video", { videoTitle: "t", videoDescription: "d" }).ok).toBe(true);
  });
  it("rejects videoTitle on text module (no video spec)", () => {
    expect(validateModulePatch("text", { videoTitle: "t" }).ok).toBe(false);
  });
});

describe("validateItemData", () => {
  it("accepts a Q&A item shape on qa modules", () => {
    expect(validateItemData("qa", { type: "qa", question: "Q", answer: "A" }).ok).toBe(true);
  });
  it("rejects a Q&A shape on a tech_spec module", () => {
    expect(validateItemData("technical_specifications", { type: "qa", question: "Q", answer: "A" }).ok).toBe(false);
  });
  it("accepts a tech_spec_row shape on technical_specifications", () => {
    expect(validateItemData("technical_specifications", { type: "tech_spec_row", spec_label: "L", spec_value: "V" }).ok).toBe(true);
  });
  it("enforces char limits on Q&A items", () => {
    expect(validateItemData("qa", { type: "qa", question: "x".repeat(121), answer: "A" }).ok).toBe(false);
  });
});

describe("defaultItemDataFor", () => {
  it("returns a Q&A skeleton for qa modules", () => {
    expect(defaultItemDataFor("qa")).toEqual({ type: "qa", question: "", answer: "" });
  });
  it("returns null for modules without repeatable groups", () => {
    expect(defaultItemDataFor("text")).toBeNull();
    expect(defaultItemDataFor("single_image_text")).toBeNull();
  });
});
```

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/zod-schemas.test.ts 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the validators**

Create `src/lib/aplus2/zod-schemas.ts`:

```ts
import { z } from "zod";

import {
  APLUS2_MODULE_SPECS,
  type Aplus2ItemData,
  type Aplus2ModuleType,
} from "./module-specs";

// ─── Module status ──────────────────────────────────────────────────

export const APLUS2_MODULE_STATUSES = [
  "draft", "in_review", "approved", "uploaded", "live",
] as const;
export type Aplus2ModuleStatus = (typeof APLUS2_MODULE_STATUSES)[number];

export const APLUS2_VERSION_STATUSES = [
  "not_started", "in_progress", "in_review", "approved", "live",
] as const;
export type Aplus2VersionStatus = (typeof APLUS2_VERSION_STATUSES)[number];

// ─── Module patch validator ─────────────────────────────────────────

export interface ModulePatchInput {
  headlineText?: string | null;
  subheadlineText?: string | null;
  bodyText?: string | null;
  overlayText?: string | null;
  altText?: string | null;
  imageDescription?: string | null;
  aiImagePrompt?: string | null;
  cosmoRelationType?: string | null;
  videoTitle?: string | null;
  videoDescription?: string | null;
  videoDriveFileId?: string | null;
  textPosition?: "left" | "right" | null;
  fontColor?: "light" | "dark" | null;
  figmaUrl?: string | null;
  markupUrl?: string | null;
  status?: Aplus2ModuleStatus;
}

export type ValidateResult<T> = { ok: true; value: T } | { ok: false; error: string };

const textFieldKeys = ["headlineText", "subheadlineText", "bodyText", "overlayText"] as const;
type TextFieldKey = (typeof textFieldKeys)[number];

export function validateModulePatch(
  moduleType: Aplus2ModuleType,
  input: ModulePatchInput
): ValidateResult<ModulePatchInput> {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  if (!spec) return { ok: false, error: `unknown moduleType: ${moduleType}` };

  // Status
  if (input.status !== undefined && !APLUS2_MODULE_STATUSES.includes(input.status)) {
    return { ok: false, error: `invalid status: ${input.status}` };
  }

  // Text fields — reject keys not declared by the spec, then enforce maxLength.
  const allowed = new Set<TextFieldKey>(spec.textFields.map((f) => f.key));
  for (const key of textFieldKeys) {
    const v = input[key];
    if (v === undefined || v === null || v === "") continue;
    if (!allowed.has(key)) {
      return { ok: false, error: `field ${key} not allowed on ${moduleType}` };
    }
    const field = spec.textFields.find((f) => f.key === key)!;
    if (field.maxLength && v.length > field.maxLength) {
      return { ok: false, error: `${field.label} exceeds ${field.maxLength} characters` };
    }
  }

  // Video fields — only allowed when spec.video is set.
  if (input.videoTitle != null) {
    if (!spec.video) return { ok: false, error: `videoTitle not allowed on ${moduleType}` };
    if (input.videoTitle.length > spec.video.titleMaxLen) {
      return { ok: false, error: `videoTitle exceeds ${spec.video.titleMaxLen} characters` };
    }
  }
  if (input.videoDescription != null) {
    if (!spec.video) return { ok: false, error: `videoDescription not allowed on ${moduleType}` };
    if (input.videoDescription.length > spec.video.descriptionMaxLen) {
      return { ok: false, error: `videoDescription exceeds ${spec.video.descriptionMaxLen} characters` };
    }
  }
  if (input.videoDriveFileId != null && !spec.video) {
    return { ok: false, error: `videoDriveFileId not allowed on ${moduleType}` };
  }

  // Layout controls
  const layoutKeys = new Set((spec.layoutControls ?? []).map((c) => c.key));
  if (input.textPosition != null) {
    if (!layoutKeys.has("text_position")) {
      return { ok: false, error: `text_position not allowed on ${moduleType}` };
    }
    const c = spec.layoutControls!.find((lc) => lc.key === "text_position")!;
    if (!c.options.includes(input.textPosition)) {
      return { ok: false, error: `text_position must be one of ${c.options.join(", ")}` };
    }
  }
  if (input.fontColor != null) {
    if (!layoutKeys.has("font_color")) {
      return { ok: false, error: `font_color not allowed on ${moduleType}` };
    }
    const c = spec.layoutControls!.find((lc) => lc.key === "font_color")!;
    if (!c.options.includes(input.fontColor)) {
      return { ok: false, error: `font_color must be one of ${c.options.join(", ")}` };
    }
  }

  // Generic 1000-char caps on remaining strings.
  for (const k of ["figmaUrl", "markupUrl", "altText", "imageDescription", "aiImagePrompt", "cosmoRelationType"] as const) {
    const v = input[k];
    if (typeof v === "string" && v.length > 1000) {
      return { ok: false, error: `${k} exceeds 1000 characters` };
    }
  }

  return { ok: true, value: input };
}

// ─── Item data validators (dispatch by parent module type) ──────────

function itemFieldSchema(maxLen: number | undefined): z.ZodString {
  return maxLen ? z.string().max(maxLen) : z.string();
}

function buildItemDataSchema(moduleType: Aplus2ModuleType): z.ZodTypeAny {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  const group = spec.repeatableGroup;
  if (!group) return z.never();
  const shape: Record<string, z.ZodTypeAny> = { type: z.literal(group.itemDataType) };
  for (const f of group.fields) {
    shape[f.key] = itemFieldSchema(f.maxLength).optional().default("");
  }
  return z.object(shape).strict();
}

const ITEM_SCHEMAS_CACHE = new Map<Aplus2ModuleType, z.ZodTypeAny>();
function getItemDataSchema(moduleType: Aplus2ModuleType): z.ZodTypeAny {
  let s = ITEM_SCHEMAS_CACHE.get(moduleType);
  if (!s) {
    s = buildItemDataSchema(moduleType);
    ITEM_SCHEMAS_CACHE.set(moduleType, s);
  }
  return s;
}

export function validateItemData(
  moduleType: Aplus2ModuleType,
  data: unknown
): ValidateResult<Aplus2ItemData> {
  const schema = getItemDataSchema(moduleType);
  if (schema instanceof z.ZodNever) {
    return { ok: false, error: `module type ${moduleType} has no repeatable items` };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: parsed.data as Aplus2ItemData };
}

/** Default item shape for pre-seeding new modules. Returns null when the
 * module type has no repeatableGroup. */
export function defaultItemDataFor(moduleType: Aplus2ModuleType): Aplus2ItemData | null {
  const spec = APLUS2_MODULE_SPECS[moduleType];
  const group = spec.repeatableGroup;
  if (!group) return null;
  const out: Record<string, string> = { type: group.itemDataType };
  for (const f of group.fields) out[f.key] = "";
  return out as Aplus2ItemData;
}

export function validateVersionStatus(value: string): value is Aplus2VersionStatus {
  return (APLUS2_VERSION_STATUSES as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Tests pass**

Run:
```bash
cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2/zod-schemas.test.ts 2>&1 | tail -20
```
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/manu/1o8Hub && git add src/lib/aplus2/zod-schemas.ts src/lib/aplus2/zod-schemas.test.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): Zod validators driven by module specs

validateModulePatch dispatches on moduleType, applies per-field char limits
from APLUS2_MODULE_SPECS, rejects fields not declared by the spec.
validateItemData dispatches by parent module type to validate
aplus2_module_items.data JSONB.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.8: Phase 1 validation — build + lint + vitest

**Files:** no code changes.

- [ ] **Step 1: Build the whole project**

Run: `cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -50`
Expected: build completes. Errors here mean a Phase 1 task broke types — go back and fix.

- [ ] **Step 2: Lint**

Run: `cd /Users/manu/1o8Hub && npm run lint 2>&1 | tail -30`
Expected: zero new errors in Phase 1 files. Pre-existing warnings on the ~46 drift files are unrelated — leave them.

- [ ] **Step 3: Run the Phase 1 vitest tests**

Run: `cd /Users/manu/1o8Hub && npx vitest run src/lib/aplus2 2>&1 | tail -20`
Expected: 3 test files pass.

- [ ] **Step 4: No commit — verification only**

End of Phase 1. The DB has the 5 tables, Drizzle exports them, the module-specs file is the canonical source for the editor, the Zod and drive-naming helpers are unit-tested.

---

# Phase 2 — Backend API routes

**Goal:** Implement all 13 `/api/aplus2/*` routes. Each writes through `db.transaction()` with best-effort Drive cleanup outside the transaction. Each verified via `curl` + `psql` after implementation.

**Files touched this phase:** all under `src/app/api/aplus2/` (created).

**Common patterns to reuse across every route:**
- `getAuthSession()` from `@/lib/auth-db` for auth check.
- Role gating: `admin` and `editor` can write; `viewer` and `client` get read-only on GETs; reject `pending`.
- `db.transaction()` wraps related inserts/updates/deletes that must be atomic.
- Drive ops happen OUTSIDE the transaction (best-effort; log + continue on cleanup failure — exactly like brand-story).
- Response shape: `{ ok: true, ... }` on success; `{ error: "<msg>" }` with appropriate HTTP code on failure.

Section-level gating (the `aplus2` allowedSections entry) is added in Phase 6.

---

### Task 2.1: GET `/api/aplus2/clients` — client list with rollups

**Files:**
- Create: `src/app/api/aplus2/clients/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/clients/route.ts`:

```ts
/**
 * GET /api/aplus2/clients
 *
 * Returns every aac client plus rollups from aplus2_sets + aplus2_versions.
 * Drives the /aplus2 landing page.
 *
 * Shape:
 *   [{
 *     clientIdCode, clientName,
 *     setCount,
 *     marketplaceCounts: { US: 3, UK: 1 },
 *     latestStatus: "in_progress" | "approved" | ... | null
 *   }]
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, aplus2Sets, aplus2Versions } from "@/lib/db/schema";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setRows = await db
    .select({
      clientIdCode: aplus2Sets.clientIdCode,
      marketplace: aplus2Sets.marketplace,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(aplus2Sets)
    .groupBy(aplus2Sets.clientIdCode, aplus2Sets.marketplace);

  const latestStatusRows = await db.execute<{ client_id_code: string; status: string }>(sql`
    SELECT DISTINCT ON (s.client_id_code)
      s.client_id_code, v.status
    FROM ${aplus2Versions} v
    JOIN ${aplus2Sets} s ON s.id = v.set_id
    ORDER BY s.client_id_code, v.updated_at DESC
  `);
  const latestByClient = new Map<string, string>();
  for (const r of latestStatusRows) latestByClient.set(r.client_id_code, r.status);

  const clientRows = await db
    .select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName })
    .from(aac);

  const setsByClient = new Map<string, { mkt: string; count: number }[]>();
  for (const r of setRows) {
    const arr = setsByClient.get(r.clientIdCode) ?? [];
    arr.push({ mkt: r.marketplace, count: r.count });
    setsByClient.set(r.clientIdCode, arr);
  }

  const out = clientRows.map((c) => {
    const buckets = setsByClient.get(c.clientIdCode) ?? [];
    const marketplaceCounts: Record<string, number> = {};
    let setCount = 0;
    for (const b of buckets) {
      marketplaceCounts[b.mkt] = (marketplaceCounts[b.mkt] ?? 0) + b.count;
      setCount += b.count;
    }
    return {
      clientIdCode: c.clientIdCode,
      clientName: c.clientName,
      setCount,
      marketplaceCounts,
      latestStatus: latestByClient.get(c.clientIdCode) ?? null,
    };
  });

  out.sort((a, b) => {
    if (a.setCount !== b.setCount) return b.setCount - a.setCount;
    return (a.clientName ?? "").localeCompare(b.clientName ?? "");
  });

  return NextResponse.json(out);
}
```

- [ ] **Step 2: Smoke test**

In one terminal: `cd /Users/manu/1o8Hub && PORT=3000 npm run dev`. In a logged-in browser pointed at `http://localhost:3000`, open DevTools and run:
```js
await (await fetch("/api/aplus2/clients")).json()
```
Expected: an array of `{clientIdCode, clientName, setCount: 0, marketplaceCounts: {}, latestStatus: null}` (all zero — no sets exist yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/app/api/aplus2/clients/route.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): GET /api/aplus2/clients with rollups

Lists every aac client with set count, per-marketplace counts, and the
latest-version status. Empty clients included so the landing page can
show them as "no sets yet".

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: GET + POST `/api/aplus2/sets` — list by client + create with auto V01 and Drive folder

**Files:**
- Create: `src/app/api/aplus2/sets/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/sets/route.ts`:

```ts
/**
 * GET  /api/aplus2/sets?clientIdCode=XYZ
 *   Lists every A+2 set for the client with the latest-version status and
 *   version count per set.
 *
 * POST /api/aplus2/sets
 *   Body: { clientIdCode, productId, scopeType: "ASIN"|"PARENT", marketplace }
 *   Creates the set, V01, the Drive subfolder, and the drive_folders row.
 *   Drive folder ops happen first; we roll them back best-effort if the DB
 *   transaction fails afterward.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aac,
  aplus2Sets,
  aplus2Versions,
  driveFolders,
  master,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { aplus2VersionSlug } from "@/lib/aplus2/drive-naming";
import { isValidMarketplaceCode } from "@/lib/aplus2/marketplace";

// ─── GET ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });
  }

  const [client] = await db
    .select({ clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const rows = await db.execute<{
    set_id: string;
    scope_type: string;
    scope_identifier: string;
    marketplace: string;
    parent_asin: string | null;
    covered_asins: string[] | null;
    product_id: string;
    asin: string | null;
    sku: string | null;
    item_name: string | null;
    version_count: number;
    latest_status: string | null;
    latest_version_number: number | null;
  }>(sql`
    SELECT
      s.id AS set_id, s.scope_type, s.scope_identifier, s.marketplace,
      s.parent_asin, s.covered_asins, s.product_id,
      m.asin, m.sku, m.item_name,
      COALESCE(vc.cnt, 0)::int AS version_count,
      lv.status AS latest_status,
      lv.version_number AS latest_version_number
    FROM ${aplus2Sets} s
    JOIN ${master} m ON m.id = s.product_id
    LEFT JOIN (
      SELECT set_id, COUNT(*)::int AS cnt
      FROM ${aplus2Versions} GROUP BY set_id
    ) vc ON vc.set_id = s.id
    LEFT JOIN LATERAL (
      SELECT status, version_number FROM ${aplus2Versions}
      WHERE set_id = s.id ORDER BY version_number DESC LIMIT 1
    ) lv ON true
    WHERE s.client_id_code = ${clientIdCode}
    ORDER BY s.marketplace ASC, s.scope_identifier ASC
  `);

  return NextResponse.json({
    clientName: client.clientName,
    sets: rows.map((r) => ({
      id: r.set_id,
      scopeType: r.scope_type,
      scopeIdentifier: r.scope_identifier,
      marketplace: r.marketplace,
      parentAsin: r.parent_asin,
      coveredAsins: r.covered_asins,
      productId: r.product_id,
      asin: r.asin,
      sku: r.sku,
      itemName: r.item_name,
      versionCount: r.version_count,
      latestStatus: r.latest_status,
      latestVersionNumber: r.latest_version_number,
    })),
  });
}

// ─── POST ────────────────────────────────────────────────────────────

const createSchema = z.object({
  clientIdCode: z.string().min(1).max(100),
  productId: z.string().uuid(),
  scopeType: z.enum(["ASIN", "PARENT"]),
  marketplace: z.string().min(2).max(5),
}).strict();

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const marketplace = body.marketplace.toUpperCase();
  if (!isValidMarketplaceCode(marketplace)) {
    return NextResponse.json({ error: "marketplace must be a 2-letter ISO code" }, { status: 400 });
  }

  const [product] = await db
    .select({
      id: master.id, asin: master.asin, parentAsin: master.parentAsin,
      clientIdCode: master.clientIdCode,
    })
    .from(master)
    .where(eq(master.id, body.productId))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.clientIdCode !== body.clientIdCode) {
    return NextResponse.json({ error: "Product does not belong to clientIdCode" }, { status: 400 });
  }

  let scopeIdentifier: string;
  let parentAsin: string | null = null;
  let coveredAsins: string[] | null = null;
  if (body.scopeType === "ASIN") {
    if (!product.asin) return NextResponse.json({ error: "Product has no ASIN" }, { status: 400 });
    scopeIdentifier = product.asin;
  } else {
    const parent = product.parentAsin ?? product.asin;
    if (!parent) return NextResponse.json({ error: "Product has no parent ASIN" }, { status: 400 });
    scopeIdentifier = parent;
    parentAsin = parent;
    const siblings = await db
      .select({ asin: master.asin })
      .from(master)
      .where(and(eq(master.clientIdCode, body.clientIdCode), eq(master.parentAsin, parent)));
    coveredAsins = siblings.map((s) => s.asin).filter((a): a is string => !!a);
    if (product.asin && !coveredAsins.includes(product.asin)) coveredAsins.push(product.asin);
  }

  // Uniqueness check (the DB also enforces this; nicer error here).
  const [dup] = await db
    .select({ id: aplus2Sets.id })
    .from(aplus2Sets)
    .where(and(
      eq(aplus2Sets.clientIdCode, body.clientIdCode),
      eq(aplus2Sets.marketplace, marketplace),
      eq(aplus2Sets.scopeIdentifier, scopeIdentifier),
    ))
    .limit(1);
  if (dup) {
    return NextResponse.json({ error: "A set already exists for this client + marketplace + scope" }, { status: 409 });
  }

  // Drive parent folder: prefer 'aplus', fall back to 'content'.
  const parentFolders = await db
    .select({
      id: driveFolders.id,
      driveFolderId: driveFolders.driveFolderId,
      folderType: driveFolders.folderType,
      path: driveFolders.path,
    })
    .from(driveFolders)
    .where(eq(driveFolders.clientIdCode, body.clientIdCode));
  const parent =
    parentFolders.find((f) => f.folderType === "aplus") ??
    parentFolders.find((f) => f.folderType === "content");
  if (!parent) {
    return NextResponse.json(
      { error: `No 'aplus' or 'content' Drive folder registered for ${body.clientIdCode}` },
      { status: 404 }
    );
  }

  const slug = aplus2VersionSlug({
    clientIdCode: body.clientIdCode,
    marketplace,
    scopeIdentifier,
    versionNumber: 1,
  });

  let createdDriveFolderId: string | null = null;
  try {
    const f = await driveClient.createFolder(slug, parent.driveFolderId);
    createdDriveFolderId = f.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive folder create failed: ${msg}` }, { status: 502 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [setRow] = await tx
        .insert(aplus2Sets)
        .values({
          clientIdCode: body.clientIdCode,
          productId: body.productId,
          scopeType: body.scopeType,
          scopeIdentifier,
          marketplace,
          parentAsin,
          coveredAsins,
        })
        .returning({ id: aplus2Sets.id });

      const [folderRow] = await tx
        .insert(driveFolders)
        .values({
          clientIdCode: body.clientIdCode,
          driveFolderId: createdDriveFolderId!,
          folderType: "aplus2_version",
          path: `${parent.path}/${slug}`,
          parentFolderId: parent.id,
          name: slug,
        })
        .returning({ id: driveFolders.id });

      const [versionRow] = await tx
        .insert(aplus2Versions)
        .values({ setId: setRow.id, versionNumber: 1, driveFolderId: folderRow.id, status: "not_started" })
        .returning({ id: aplus2Versions.id, versionNumber: aplus2Versions.versionNumber });

      return { setId: setRow.id, versionId: versionRow.id, versionNumber: versionRow.versionNumber };
    });

    return NextResponse.json({ ok: true, ...result, scopeIdentifier, marketplace, slug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /sets] folder cleanup failed:", cleanupErr); }
    }
    return NextResponse.json({ error: `Failed to create set: ${msg}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: Pick a test product**

```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "SELECT id, client_id_code, asin, country FROM master WHERE client_id_code IS NOT NULL AND asin IS NOT NULL AND country IS NOT NULL LIMIT 3;"'
```

- [ ] **Step 3: Test POST in browser DevTools (logged in)**

```js
await (await fetch("/api/aplus2/sets", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({clientIdCode:"<paste>",productId:"<paste>",scopeType:"ASIN",marketplace:"<paste 2-letter>"})
})).json()
```
Expected: `{ok:true,setId,versionId,versionNumber:1,...}`. In Drive, confirm the new subfolder.

- [ ] **Step 4: Test GET**

```js
await (await fetch("/api/aplus2/sets?clientIdCode=<paste>")).json()
```
Expected: `{clientName, sets:[{...just created...}]}`.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/app/api/aplus2/sets/route.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): GET + POST /api/aplus2/sets

GET groups sets by marketplace with version count + latest status.
POST validates uniqueness, resolves scope_identifier + covered_asins
from master, creates Drive folder, then transactionally inserts the
set + V01 + drive_folders row.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: DELETE `/api/aplus2/sets/[setId]` — cascade + trash every version folder

**Files:**
- Create: `src/app/api/aplus2/sets/[setId]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/sets/[setId]/route.ts`:

```ts
/**
 * DELETE /api/aplus2/sets/[setId]
 *
 * Cascade-deletes the set (versions/modules/items/assets via FK) and
 * trashes every version's Drive subfolder. drive_folders rows for those
 * subfolders are removed in the same transaction.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Sets, aplus2Versions, driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId } = await params;

  const versionRows = await db
    .select({
      versionId: aplus2Versions.id,
      folderRowId: aplus2Versions.driveFolderId,
      folderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.setId, setId));

  const [setRow] = await db
    .select({ id: aplus2Sets.id })
    .from(aplus2Sets)
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Sets).where(eq(aplus2Sets.id, setId));
    const folderRowIds = versionRows.map((r) => r.folderRowId).filter((id): id is string => !!id);
    if (folderRowIds.length > 0) {
      await tx.delete(driveFolders).where(inArray(driveFolders.id, folderRowIds));
    }
  });

  for (const r of versionRows) {
    if (!r.folderGid) continue;
    try { await driveClient.deleteFile(r.folderGid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE set] folder ${r.folderGid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, versionsDeleted: versionRows.length });
}
```

- [ ] **Step 2: Smoke test** — create a throwaway set (Task 2.2), then delete it via:
```js
await (await fetch("/api/aplus2/sets/<setId>", { method: "DELETE" })).json()
```
Verify `psql` shows no rows for that set's ID across all 5 tables; verify Drive has it in Trash.

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/sets/[setId]/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): DELETE /api/aplus2/sets/[setId]

Cascade-removes set + versions + modules + items + assets, deletes the
drive_folders rows, trashes every Drive subfolder best-effort.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: GET `/api/aplus2/sets/[setId]/versions` — full nested payload

**Files:**
- Create: `src/app/api/aplus2/sets/[setId]/versions/route.ts`

This is the largest GET — it returns versions → modules → items → assets in one round trip, mirroring the brand-story GET at `src/app/api/design-status/brand-story-versions/route.ts`.

- [ ] **Step 1: Implement (GET only — POST is added in Task 2.5)**

Create `src/app/api/aplus2/sets/[setId]/versions/route.ts`:

```ts
/**
 * GET /api/aplus2/sets/[setId]/versions
 *
 * Returns the entire set's editor payload in one round trip:
 *   { set: {...}, versions: [{ ..., modules: [{ ..., items, assets }] }] }
 *
 * POST is defined further down (Task 2.5).
 */
import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets,
  aplus2ModuleItems,
  aplus2Modules,
  aplus2Sets,
  aplus2Versions,
  driveFiles,
  driveFolders,
  master,
} from "@/lib/db/schema";

interface AssetDto {
  id: string;
  kind: string;
  slotKey: string;
  variant: "desktop" | "mobile";
  driveFileId: string;
  filename: string;
  moduleId: string | null;
  moduleItemId: string | null;
}

interface ItemDto {
  id: string;
  position: number;
  data: Record<string, unknown>;
}

interface ModuleDto {
  id: string;
  position: number;
  moduleType: string;
  status: string;
  headlineText: string | null;
  subheadlineText: string | null;
  bodyText: string | null;
  overlayText: string | null;
  altText: string | null;
  imageDescription: string | null;
  aiImagePrompt: string | null;
  cosmoRelationType: string | null;
  videoDriveFileId: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  textPosition: string | null;
  fontColor: string | null;
  figmaUrl: string | null;
  markupUrl: string | null;
  items: ItemDto[];
  assets: AssetDto[];
}

interface VersionDto {
  id: string;
  versionNumber: number;
  status: string;
  driveFolderUrl: string | null;
  createdAt: string;
  updatedAt: string;
  modules: ModuleDto[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setId } = await params;

  const [setRow] = await db
    .select({
      id: aplus2Sets.id,
      clientIdCode: aplus2Sets.clientIdCode,
      scopeType: aplus2Sets.scopeType,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
      marketplace: aplus2Sets.marketplace,
      parentAsin: aplus2Sets.parentAsin,
      coveredAsins: aplus2Sets.coveredAsins,
      productId: aplus2Sets.productId,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      createdAt: aplus2Sets.createdAt,
      updatedAt: aplus2Sets.updatedAt,
    })
    .from(aplus2Sets)
    .innerJoin(master, eq(master.id, aplus2Sets.productId))
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  const versionRows = await db
    .select({
      id: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      status: aplus2Versions.status,
      createdAt: aplus2Versions.createdAt,
      updatedAt: aplus2Versions.updatedAt,
      driveFolderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.setId, setId))
    .orderBy(asc(aplus2Versions.versionNumber));

  if (versionRows.length === 0) {
    return NextResponse.json({ set: setRow, versions: [] });
  }

  const versionIds = versionRows.map((v) => v.id);

  const moduleRows = await db
    .select()
    .from(aplus2Modules)
    .where(inArray(aplus2Modules.versionId, versionIds))
    .orderBy(asc(aplus2Modules.position));

  const moduleIds = moduleRows.map((m) => m.id);

  const [itemRows, assetRows] = await Promise.all([
    moduleIds.length
      ? db.select().from(aplus2ModuleItems).where(inArray(aplus2ModuleItems.moduleId, moduleIds)).orderBy(asc(aplus2ModuleItems.position))
      : Promise.resolve([] as (typeof aplus2ModuleItems.$inferSelect)[]),
    db
      .select({
        id: aplus2Assets.id,
        versionId: aplus2Assets.versionId,
        moduleId: aplus2Assets.moduleId,
        moduleItemId: aplus2Assets.moduleItemId,
        kind: aplus2Assets.kind,
        slotKey: aplus2Assets.slotKey,
        variant: aplus2Assets.variant,
        filename: aplus2Assets.filename,
        driveFileGid: driveFiles.driveFileId,
      })
      .from(aplus2Assets)
      .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
      .where(inArray(aplus2Assets.versionId, versionIds)),
  ]);

  const itemsByModule = new Map<string, ItemDto[]>();
  for (const it of itemRows) {
    const arr = itemsByModule.get(it.moduleId) ?? [];
    arr.push({ id: it.id, position: it.position, data: (it.data ?? {}) as Record<string, unknown> });
    itemsByModule.set(it.moduleId, arr);
  }

  const assetsByModule = new Map<string, AssetDto[]>();
  for (const a of assetRows) {
    const dto: AssetDto = {
      id: a.id,
      kind: a.kind,
      slotKey: a.slotKey,
      variant: a.variant as "desktop" | "mobile",
      driveFileId: a.driveFileGid,
      filename: a.filename,
      moduleId: a.moduleId,
      moduleItemId: a.moduleItemId,
    };
    const key = a.moduleId ?? "__no_module__";
    const arr = assetsByModule.get(key) ?? [];
    arr.push(dto);
    assetsByModule.set(key, arr);
  }

  const modulesByVersion = new Map<string, ModuleDto[]>();
  for (const m of moduleRows) {
    const dto: ModuleDto = {
      id: m.id,
      position: m.position,
      moduleType: m.moduleType,
      status: m.status,
      headlineText: m.headlineText,
      subheadlineText: m.subheadlineText,
      bodyText: m.bodyText,
      overlayText: m.overlayText,
      altText: m.altText,
      imageDescription: m.imageDescription,
      aiImagePrompt: m.aiImagePrompt,
      cosmoRelationType: m.cosmoRelationType,
      videoDriveFileId: m.videoDriveFileId,
      videoTitle: m.videoTitle,
      videoDescription: m.videoDescription,
      textPosition: m.textPosition,
      fontColor: m.fontColor,
      figmaUrl: m.figmaUrl,
      markupUrl: m.markupUrl,
      items: itemsByModule.get(m.id) ?? [],
      assets: assetsByModule.get(m.id) ?? [],
    };
    const arr = modulesByVersion.get(m.versionId) ?? [];
    arr.push(dto);
    modulesByVersion.set(m.versionId, arr);
  }

  const versions: VersionDto[] = versionRows.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    driveFolderUrl: v.driveFolderGid ? `https://drive.google.com/drive/folders/${v.driveFolderGid}` : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    modules: modulesByVersion.get(v.id) ?? [],
  }));

  return NextResponse.json({ set: setRow, versions });
}
```

- [ ] **Step 2: Test against the set you created in Task 2.2**

```js
const r = await (await fetch("/api/aplus2/sets/<setId>/versions")).json(); console.log(r)
```
Expected: `{set:{...}, versions:[{id, versionNumber:1, status:"not_started", driveFolderUrl, modules:[]}]}`.

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/sets/[setId]/versions/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): GET /api/aplus2/sets/[setId]/versions full nested payload

Returns set metadata + every version + every module + every repeatable
item + every asset in one round trip. Asset rows are joined to drive_files
so the editor can build image-proxy URLs without further fetches.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5: POST `/api/aplus2/sets/[setId]/versions` — create version with optional copyFrom

**Files:**
- Modify: `src/app/api/aplus2/sets/[setId]/versions/route.ts` (append `POST`)

- [ ] **Step 1: Append the POST handler**

Open `src/app/api/aplus2/sets/[setId]/versions/route.ts` and add at the end:

```ts
import { z } from "zod";
import { sql } from "drizzle-orm";
import { driveClient } from "@/lib/drive-client";
import { aplus2VersionSlug } from "@/lib/aplus2/drive-naming";

const createVersionSchema = z.object({
  copyFrom: z.string().uuid().optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId } = await params;
  const body = createVersionSchema.parse(await req.json().catch(() => ({})));

  const [setRow] = await db
    .select({
      id: aplus2Sets.id,
      clientIdCode: aplus2Sets.clientIdCode,
      marketplace: aplus2Sets.marketplace,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
    })
    .from(aplus2Sets)
    .where(eq(aplus2Sets.id, setId))
    .limit(1);
  if (!setRow) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  // Next version number for this set.
  const [maxRow] = await db
    .select({ maxV: sql<number>`COALESCE(MAX(${aplus2Versions.versionNumber}), 0)::int` })
    .from(aplus2Versions)
    .where(eq(aplus2Versions.setId, setId));
  const versionNumber = (maxRow?.maxV ?? 0) + 1;
  const slug = aplus2VersionSlug({
    clientIdCode: setRow.clientIdCode,
    marketplace: setRow.marketplace,
    scopeIdentifier: setRow.scopeIdentifier,
    versionNumber,
  });

  // Find parent Drive folder via the OWN set's existing version (V01) — its
  // drive_folders.parent_folder_id points at the canonical parent.
  const [anchor] = await db
    .select({
      parentFolderRowId: driveFolders.parentFolderId,
      parentPath: sql<string>`(SELECT path FROM ${driveFolders} pf WHERE pf.id = ${driveFolders.parentFolderId})`,
      parentGid: sql<string>`(SELECT drive_folder_id FROM ${driveFolders} pf WHERE pf.id = ${driveFolders.parentFolderId})`,
    })
    .from(driveFolders)
    .innerJoin(aplus2Versions, eq(aplus2Versions.driveFolderId, driveFolders.id))
    .where(eq(aplus2Versions.setId, setId))
    .limit(1);
  if (!anchor?.parentFolderRowId || !anchor.parentGid) {
    return NextResponse.json(
      { error: "Set has no anchor Drive folder — cannot derive parent for the new version" },
      { status: 409 }
    );
  }

  let createdDriveFolderId: string | null = null;
  try {
    const f = await driveClient.createFolder(slug, anchor.parentGid);
    createdDriveFolderId = f.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive folder create failed: ${msg}` }, { status: 502 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [folderRow] = await tx
        .insert(driveFolders)
        .values({
          clientIdCode: setRow.clientIdCode,
          driveFolderId: createdDriveFolderId!,
          folderType: "aplus2_version",
          path: `${anchor.parentPath}/${slug}`,
          parentFolderId: anchor.parentFolderRowId!,
          name: slug,
        })
        .returning({ id: driveFolders.id });

      const [versionRow] = await tx
        .insert(aplus2Versions)
        .values({ setId, versionNumber, driveFolderId: folderRow.id, status: "not_started" })
        .returning({ id: aplus2Versions.id, versionNumber: aplus2Versions.versionNumber });

      // copyFrom — clone modules + items (no assets) from the source version.
      if (body.copyFrom) {
        const sourceModules = await tx
          .select()
          .from(aplus2Modules)
          .where(eq(aplus2Modules.versionId, body.copyFrom))
          .orderBy(asc(aplus2Modules.position));

        for (const m of sourceModules) {
          const [newModule] = await tx
            .insert(aplus2Modules)
            .values({
              versionId: versionRow.id,
              position: m.position,
              moduleType: m.moduleType,
              status: "draft",
              headlineText: m.headlineText,
              subheadlineText: m.subheadlineText,
              bodyText: m.bodyText,
              overlayText: m.overlayText,
              altText: m.altText,
              imageDescription: m.imageDescription,
              aiImagePrompt: m.aiImagePrompt,
              cosmoRelationType: m.cosmoRelationType,
              videoTitle: m.videoTitle,
              videoDescription: m.videoDescription,
              textPosition: m.textPosition,
              fontColor: m.fontColor,
              // videoDriveFileId intentionally NOT copied — user re-uploads.
            })
            .returning({ id: aplus2Modules.id });

          const sourceItems = await tx
            .select()
            .from(aplus2ModuleItems)
            .where(eq(aplus2ModuleItems.moduleId, m.id))
            .orderBy(asc(aplus2ModuleItems.position));
          if (sourceItems.length > 0) {
            await tx.insert(aplus2ModuleItems).values(
              sourceItems.map((it) => ({
                moduleId: newModule.id,
                position: it.position,
                data: it.data ?? {},
              }))
            );
          }
        }
      }

      return { versionId: versionRow.id, versionNumber: versionRow.versionNumber };
    });

    return NextResponse.json({ ok: true, ...result, slug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (createdDriveFolderId) {
      try { await driveClient.deleteFile(createdDriveFolderId); }
      catch (cleanupErr) { console.error("[aplus2 POST /versions] folder cleanup failed:", cleanupErr); }
    }
    return NextResponse.json({ error: `Failed to create version: ${msg}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test (no copyFrom)**

```js
await (await fetch("/api/aplus2/sets/<setId>/versions", { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" })).json()
```
Expected: `{ok:true, versionId, versionNumber:2, slug:"<...V02>"}`. Drive folder is created.

- [ ] **Step 3: Test (with copyFrom)**

Add a module to V01 via Task 2.8 once that lands. For now skip the copyFrom branch.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/sets/[setId]/versions/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): POST /api/aplus2/sets/[setId]/versions

Creates the next V## with its own Drive subfolder. When copyFrom is
provided, clones modules + items (assets NOT copied — user re-uploads).
Module statuses reset to 'draft' on copy.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.6: PATCH + DELETE `/api/aplus2/versions/[versionId]` — status + cascade delete

**Files:**
- Create: `src/app/api/aplus2/versions/[versionId]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/versions/[versionId]/route.ts`:

```ts
/**
 * PATCH  /api/aplus2/versions/[versionId]
 *   Body: { status: "not_started"|"in_progress"|"in_review"|"approved"|"live" }
 *   Updates the version-level status only. (Modules are patched via
 *   /api/aplus2/modules/[moduleId].)
 *
 * DELETE /api/aplus2/versions/[versionId]
 *   Cascade-deletes the version + its modules + items + assets, deletes the
 *   drive_folders row, trashes the Drive subfolder best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Versions, driveFolders } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { APLUS2_VERSION_STATUSES } from "@/lib/aplus2/zod-schemas";

const patchSchema = z.object({
  status: z.enum(APLUS2_VERSION_STATUSES),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  const result = await db
    .update(aplus2Versions)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(aplus2Versions.id, versionId))
    .returning({ id: aplus2Versions.id });

  if (result.length === 0) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;

  const [versionRow] = await db
    .select({
      id: aplus2Versions.id,
      folderRowId: aplus2Versions.driveFolderId,
      folderGid: driveFolders.driveFolderId,
    })
    .from(aplus2Versions)
    .leftJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!versionRow) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Versions).where(eq(aplus2Versions.id, versionId));
    if (versionRow.folderRowId) {
      await tx.delete(driveFolders).where(eq(driveFolders.id, versionRow.folderRowId));
    }
  });

  if (versionRow.folderGid) {
    try { await driveClient.deleteFile(versionRow.folderGid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE version] folder ${versionRow.folderGid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Test PATCH**

```js
await (await fetch("/api/aplus2/versions/<versionId>", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:"in_progress"})})).json()
```
Expected: `{ok:true}`. Verify in psql.

- [ ] **Step 3: Test DELETE** on a throwaway V02 created in Task 2.5.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/versions/[versionId]/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): PATCH + DELETE /api/aplus2/versions/[versionId]

PATCH updates version-level status only (modules patched separately).
DELETE cascades modules/items/assets, removes the drive_folders row,
trashes the subfolder best-effort.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.7: POST `/api/aplus2/versions/[versionId]/modules` — insert module + seed items

**Files:**
- Create: `src/app/api/aplus2/versions/[versionId]/modules/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/versions/[versionId]/modules/route.ts`:

```ts
/**
 * POST /api/aplus2/versions/[versionId]/modules
 *   Body: { moduleType: Aplus2ModuleType }
 *   Inserts a new module at the next position (rejects if 7 already exist).
 *   Pre-seeds aplus2_module_items with `defaultCount` empty rows per the
 *   spec's repeatableGroup.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2ModuleItems, aplus2Modules, aplus2Versions } from "@/lib/db/schema";
import { APLUS2_MODULE_SPECS, APLUS2_MODULE_TYPES, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";
import { defaultItemDataFor } from "@/lib/aplus2/zod-schemas";

const schema = z.object({
  moduleType: z.enum(APLUS2_MODULE_TYPES),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }

  const moduleType = body.data.moduleType as Aplus2ModuleType;
  const spec = APLUS2_MODULE_SPECS[moduleType];

  const [version] = await db
    .select({ id: aplus2Versions.id })
    .from(aplus2Versions)
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({ maxPos: sql<number>`COALESCE(MAX(${aplus2Modules.position}), 0)::int` })
      .from(aplus2Modules)
      .where(eq(aplus2Modules.versionId, versionId));
    const nextPos = (maxRow?.maxPos ?? 0) + 1;
    if (nextPos > 7) {
      throw new Error("Amazon limits a version to 7 modules");
    }

    const [moduleRow] = await tx
      .insert(aplus2Modules)
      .values({
        versionId,
        position: nextPos,
        moduleType,
        status: "draft",
      })
      .returning({ id: aplus2Modules.id, position: aplus2Modules.position });

    if (spec.repeatableGroup) {
      const seed = defaultItemDataFor(moduleType);
      const count = spec.repeatableGroup.defaultCount;
      await tx.insert(aplus2ModuleItems).values(
        Array.from({ length: count }, (_, i) => ({
          moduleId: moduleRow.id,
          position: i + 1,
          data: seed ?? {},
        }))
      );
    }

    await tx
      .update(aplus2Versions)
      .set({ updatedAt: new Date() })
      .where(eq(aplus2Versions.id, versionId));

    return { moduleId: moduleRow.id, position: moduleRow.position };
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg } as const;
  });

  if ("error" in result) {
    const code = result.error.includes("7 modules") ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  return NextResponse.json({ ok: true, ...result, moduleType });
}
```

- [ ] **Step 2: Test**

```js
await (await fetch("/api/aplus2/versions/<versionId>/modules", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({moduleType:"qa"}) })).json()
```
Expected: `{ok:true, moduleId, position:1, moduleType:"qa"}`. Verify in psql:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "SELECT m.module_type, m.position, COUNT(i.id) AS items FROM aplus2_modules m LEFT JOIN aplus2_module_items i ON i.module_id = m.id GROUP BY m.id ORDER BY m.created_at DESC LIMIT 5;"'
```
For `qa`, expect 3 items pre-seeded (defaultCount=3).

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/versions/[versionId]/modules/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): POST /api/aplus2/versions/[versionId]/modules

Inserts a module at the next position (max 7). Pre-seeds the repeatable
items per spec.defaultCount with default item-data shapes from
defaultItemDataFor().

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.8: PATCH + DELETE `/api/aplus2/modules/[moduleId]` — text/status/layout + cascade delete

**Files:**
- Create: `src/app/api/aplus2/modules/[moduleId]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/modules/[moduleId]/route.ts`:

```ts
/**
 * PATCH  /api/aplus2/modules/[moduleId]
 *   Partial update of shared text columns, status, layout knobs.
 *   Validated via validateModulePatch() — caps + allowed-fields per
 *   module type.
 *
 * DELETE /api/aplus2/modules/[moduleId]
 *   Cascade-deletes items + assets, trashes the module's Drive files
 *   best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Modules, aplus2Versions, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { validateModulePatch, type ModulePatchInput } from "@/lib/aplus2/zod-schemas";
import type { Aplus2ModuleType } from "@/lib/aplus2/module-specs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = (await req.json().catch(() => null)) as ModulePatchInput | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [moduleRow] = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId, moduleType: aplus2Modules.moduleType })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!moduleRow) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const check = validateModulePatch(moduleRow.moduleType as Aplus2ModuleType, body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "headlineText", "subheadlineText", "bodyText", "overlayText",
    "altText", "imageDescription", "aiImagePrompt", "cosmoRelationType",
    "videoTitle", "videoDescription", "videoDriveFileId",
    "textPosition", "fontColor", "figmaUrl", "markupUrl", "status",
  ] as const) {
    const v = body[key];
    if (v !== undefined) updates[key] = v;
  }

  await db.transaction(async (tx) => {
    await tx.update(aplus2Modules).set(updates).where(eq(aplus2Modules.id, moduleId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, moduleRow.versionId));
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  // Collect drive_files attached to this module's assets before cascade.
  const assets = await db
    .select({ driveFileRowId: aplus2Assets.driveFileId, driveFileGid: driveFiles.driveFileId })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(eq(aplus2Assets.moduleId, moduleId));

  const [moduleRow] = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!moduleRow) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const driveFileRowIds = assets.map((a) => a.driveFileRowId);
  const driveGids = assets.map((a) => a.driveFileGid);

  await db.transaction(async (tx) => {
    if (driveFileRowIds.length > 0) {
      await tx.delete(driveFiles).where(inArray(driveFiles.id, driveFileRowIds));
    }
    await tx.delete(aplus2Modules).where(eq(aplus2Modules.id, moduleId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, moduleRow.versionId));
  });

  for (const gid of driveGids) {
    try { await driveClient.deleteFile(gid); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 DELETE module] file ${gid} trash failed: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Test PATCH happy path**

```js
await (await fetch("/api/aplus2/modules/<moduleId>", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({headlineText:"Hello",status:"in_review"}) })).json()
```
Expected: `{ok:true}`.

- [ ] **Step 3: Test PATCH validator rejection**

```js
await (await fetch("/api/aplus2/modules/<qaModuleId>", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({subheadlineText:"x".repeat(50)}) })).json()
```
Expected: `{error:"field subheadlineText not allowed on qa"}` (status 400). qa has no subheadline.

- [ ] **Step 4: Test DELETE** on a throwaway module.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/modules/[moduleId]/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): PATCH + DELETE /api/aplus2/modules/[moduleId]

PATCH applies validateModulePatch then writes through. DELETE collects
drive_file rows, removes them, then deletes the module (cascade clears
items + assets), then trashes the Drive files best-effort.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.9: POST `/api/aplus2/modules/[moduleId]/reorder` — bulk positions + lazy Drive rename

**Files:**
- Create: `src/app/api/aplus2/modules/[moduleId]/reorder/route.ts`

The `[moduleId]` in the URL is a holder — the body carries the FULL list of `{moduleId, position}` pairs for the version. The route fixes positions for the whole version and renames every Drive file affected by a position change.

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/modules/[moduleId]/reorder/route.ts`:

```ts
/**
 * POST /api/aplus2/modules/[moduleId]/reorder
 *
 * Body: { positions: [{ moduleId, position }, ...] }
 *
 * Bulk-updates positions for every module on the version. Renames every
 * Drive file whose M## position changed. The URL [moduleId] is a holder
 * (Next.js route grouping) — the body carries the canonical ordering.
 *
 * Locking strategy: positions update happens in a single DB transaction
 * using a two-phase swap (set positions to negative first to avoid the
 * UNIQUE(version_id, position) constraint, then to the target values).
 *
 * Rename strategy: lazy — only renamed when this endpoint is called.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets, aplus2ModuleItems, aplus2Modules, aplus2Sets, aplus2Versions,
  driveFiles, driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import { aplus2AssetFilename, aplus2VersionSlug } from "@/lib/aplus2/drive-naming";

const schema = z.object({
  positions: z.array(z.object({
    moduleId: z.string().uuid(),
    position: z.number().int().min(1).max(7),
  })).min(1),
}).strict();

export async function POST(
  req: NextRequest,
  { params: _params }: { params: Promise<{ moduleId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body", details: body.error.flatten() }, { status: 400 });
  }
  const { positions } = body.data;

  // Confirm all modules belong to the same version.
  const ids = positions.map((p) => p.moduleId);
  const existing = await db
    .select({ id: aplus2Modules.id, versionId: aplus2Modules.versionId, position: aplus2Modules.position, moduleType: aplus2Modules.moduleType })
    .from(aplus2Modules)
    .where(inArray(aplus2Modules.id, ids));
  if (existing.length !== positions.length) {
    return NextResponse.json({ error: "Some moduleIds not found" }, { status: 400 });
  }
  const versionIds = [...new Set(existing.map((m) => m.versionId))];
  if (versionIds.length !== 1) {
    return NextResponse.json({ error: "All modules must belong to the same version" }, { status: 400 });
  }
  const versionId = versionIds[0];

  // Detect which positions actually changed (rename only those).
  const newPosByModule = new Map(positions.map((p) => [p.moduleId, p.position] as const));
  const oldPosByModule = new Map(existing.map((m) => [m.id, m.position] as const));
  const changed = existing.filter((m) => newPosByModule.get(m.id) !== oldPosByModule.get(m.id));

  // Two-phase swap inside one transaction.
  await db.transaction(async (tx) => {
    // Phase A: shift each affected module to a negative slot (out of the way).
    for (const m of changed) {
      await tx
        .update(aplus2Modules)
        .set({ position: -1 - existing.indexOf(m), updatedAt: new Date() })
        .where(eq(aplus2Modules.id, m.id));
    }
    // Phase B: set to the target positions.
    for (const p of positions) {
      await tx
        .update(aplus2Modules)
        .set({ position: p.position, updatedAt: new Date() })
        .where(eq(aplus2Modules.id, p.moduleId));
    }
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, versionId));
  });

  if (changed.length === 0) {
    return NextResponse.json({ ok: true, renamed: 0 });
  }

  // ─── Drive rename for assets whose modulePosition changed ───────────
  const [versionRow] = await db
    .select({
      versionId: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      clientIdCode: aplus2Sets.clientIdCode,
      marketplace: aplus2Sets.marketplace,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
    })
    .from(aplus2Versions)
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!versionRow) return NextResponse.json({ error: "Version disappeared" }, { status: 500 });

  const slug = aplus2VersionSlug({
    clientIdCode: versionRow.clientIdCode,
    marketplace: versionRow.marketplace,
    scopeIdentifier: versionRow.scopeIdentifier,
    versionNumber: versionRow.versionNumber,
  });

  const changedIds = new Set(changed.map((m) => m.id));
  const assets = await db
    .select({
      assetId: aplus2Assets.id,
      moduleId: aplus2Assets.moduleId,
      moduleItemId: aplus2Assets.moduleItemId,
      slotKey: aplus2Assets.slotKey,
      variant: aplus2Assets.variant,
      filename: aplus2Assets.filename,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
      itemPosition: aplus2ModuleItems.position,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .leftJoin(aplus2ModuleItems, eq(aplus2ModuleItems.id, aplus2Assets.moduleItemId))
    .where(and(
      eq(aplus2Assets.versionId, versionId),
      inArray(aplus2Assets.moduleId, [...changedIds]),
    ));

  let renamed = 0;
  for (const a of assets) {
    const newPosition = newPosByModule.get(a.moduleId!);
    if (!newPosition) continue;
    const ext = a.filename.split(".").pop() ?? "png";
    const newFilename = aplus2AssetFilename({
      slug,
      modulePosition: newPosition,
      slotKey: a.slotKey,
      itemPosition: a.itemPosition ?? undefined,
      variant: a.variant as "desktop" | "mobile",
      ext,
    });
    if (newFilename === a.filename) continue;
    try {
      await driveClient.renameFile(a.driveFileGid, newFilename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aplus2 reorder] rename of ${a.driveFileGid} → ${newFilename} failed: ${msg}`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.update(aplus2Assets).set({ filename: newFilename }).where(eq(aplus2Assets.id, a.assetId));
      await tx.update(driveFiles).set({ displayName: newFilename }).where(eq(driveFiles.id, a.driveFileRowId));
    });
    renamed++;
  }

  return NextResponse.json({ ok: true, renamed });
}
```

- [ ] **Step 2: Verify `driveClient.renameFile` exists**

Run:
```bash
grep -n "renameFile" /Users/manu/1o8Hub/src/lib/drive-client.ts | head -5
```
If it does not exist, add it (Drive API supports `files.update({fileId, requestBody:{name}})`):

```ts
async renameFile(fileId: string, newName: string): Promise<void> {
  await this.drive.files.update({ fileId, requestBody: { name: newName }, supportsAllDrives: true });
}
```
Insert near the other `files.update` calls in `drive-client.ts`. If you add it, commit that file too in step 4.

- [ ] **Step 3: Smoke test** — add 2 modules to a version (Task 2.7), upload one image to each (Task 2.10 below), then call reorder swapping them. Verify the files in Drive have swapped names.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/modules/[moduleId]/reorder/route.ts" $(if grep -q "renameFile" src/lib/drive-client.ts; then echo "src/lib/drive-client.ts"; fi) && git commit -m "$(cat <<'EOF'
feat(aplus2): POST /api/aplus2/modules/[moduleId]/reorder with lazy rename

Two-phase swap avoids UNIQUE(version_id, position) collisions. After the
DB commit, every Drive asset attached to a moved module is renamed to
reflect its new M## position. Item-level slots inherit their parent's
position change.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.10: PATCH `/api/aplus2/items/[itemId]` — repeatable item JSONB update

**Files:**
- Create: `src/app/api/aplus2/items/[itemId]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/items/[itemId]/route.ts`:

```ts
/**
 * PATCH /api/aplus2/items/[itemId]
 *   Body: { data: Aplus2ItemData }
 *   Validates the data shape against the parent module's type. Replaces
 *   the JSONB column atomically.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2ModuleItems, aplus2Modules, aplus2Versions } from "@/lib/db/schema";
import { validateItemData } from "@/lib/aplus2/zod-schemas";
import type { Aplus2ModuleType } from "@/lib/aplus2/module-specs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const body = await req.json().catch(() => null) as { data?: unknown } | null;
  if (!body || !("data" in body)) {
    return NextResponse.json({ error: "Body must contain 'data'" }, { status: 400 });
  }

  const [itemRow] = await db
    .select({
      itemId: aplus2ModuleItems.id,
      moduleId: aplus2ModuleItems.moduleId,
      moduleType: aplus2Modules.moduleType,
      versionId: aplus2Modules.versionId,
    })
    .from(aplus2ModuleItems)
    .innerJoin(aplus2Modules, eq(aplus2Modules.id, aplus2ModuleItems.moduleId))
    .where(eq(aplus2ModuleItems.id, itemId))
    .limit(1);
  if (!itemRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const check = validateItemData(itemRow.moduleType as Aplus2ModuleType, body.data);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  await db.transaction(async (tx) => {
    await tx
      .update(aplus2ModuleItems)
      .set({ data: check.value as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(aplus2ModuleItems.id, itemId));
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, itemRow.versionId));
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Test happy path on a qa item**

Find a qa item ID:
```bash
cd /Users/manu/1o8Hub && bash -c 'set -a && . .env.local && set +a && psql "$DATABASE_URL" -c "SELECT i.id FROM aplus2_module_items i JOIN aplus2_modules m ON m.id = i.module_id WHERE m.module_type = '"'"'qa'"'"' LIMIT 1;"'
```
```js
await (await fetch("/api/aplus2/items/<itemId>", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({data:{type:"qa", question:"Q1?", answer:"A1."}}) })).json()
```
Expected: `{ok:true}`. Verify via SELECT that `data` JSONB matches.

- [ ] **Step 3: Test validator rejection**

```js
await (await fetch("/api/aplus2/items/<qaItemId>", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({data:{type:"tech_spec_row", spec_label:"x", spec_value:"y"}}) })).json()
```
Expected: `{error: ...}` 400 — wrong discriminator.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/items/[itemId]/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): PATCH /api/aplus2/items/[itemId]

Replaces the JSONB data atomically after validateItemData() confirms
the shape matches the parent module's repeatableGroup spec.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.11: POST `/api/aplus2/versions/[versionId]/assets` — upload image/video to slot

**Files:**
- Create: `src/app/api/aplus2/versions/[versionId]/assets/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/versions/[versionId]/assets/route.ts`:

```ts
/**
 * POST /api/aplus2/versions/[versionId]/assets
 *
 * multipart/form-data:
 *   file          — the binary
 *   kind          — "image" | "video"
 *   slotKey       — spec key (e.g. "focus", "image_left", "video", "hotspot_image")
 *   variant       — "desktop" | "mobile" (default "desktop")
 *   moduleId      — required when the slot is on a module
 *   moduleItemId  — set when the slot is inside a repeatable item
 *
 * If a row already exists at the slot+variant, we delete it first (releasing
 * the partial unique index), then insert the new row. The replaced Drive
 * file is trashed best-effort after the DB transaction commits.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aplus2Assets, aplus2ModuleItems, aplus2Modules, aplus2Sets, aplus2Versions,
  driveFiles, driveFolders,
} from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";
import {
  APLUS2_IMAGE_MIME, APLUS2_VIDEO_MIME, aplus2AssetFilename, aplus2VersionSlug,
  type Aplus2Variant,
} from "@/lib/aplus2/drive-naming";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { versionId } = await params;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const kind = formData.get("kind");
  const slotKey = formData.get("slotKey");
  const moduleIdRaw = formData.get("moduleId");
  const moduleItemIdRaw = formData.get("moduleItemId");
  const variantRaw = formData.get("variant") ?? "desktop";
  const file = formData.get("file");

  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "kind must be 'image' or 'video'" }, { status: 400 });
  }
  if (typeof slotKey !== "string" || !slotKey) {
    return NextResponse.json({ error: "slotKey is required" }, { status: 400 });
  }
  if (variantRaw !== "desktop" && variantRaw !== "mobile") {
    return NextResponse.json({ error: "variant must be 'desktop' or 'mobile'" }, { status: 400 });
  }
  if (kind === "video" && variantRaw === "mobile") {
    return NextResponse.json({ error: "video slots have no mobile variant" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const variant = variantRaw as Aplus2Variant;

  const mimeMap = kind === "image" ? APLUS2_IMAGE_MIME : APLUS2_VIDEO_MIME;
  const ext = mimeMap[file.type.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported mime type "${file.type}" for kind=${kind}` },
      { status: 415 }
    );
  }

  const moduleId = typeof moduleIdRaw === "string" && moduleIdRaw ? moduleIdRaw : null;
  const moduleItemId = typeof moduleItemIdRaw === "string" && moduleItemIdRaw ? moduleItemIdRaw : null;
  if (!moduleId) return NextResponse.json({ error: "moduleId is required" }, { status: 400 });

  // Look up version + its Drive subfolder + slug fields.
  const [v] = await db
    .select({
      versionId: aplus2Versions.id,
      versionNumber: aplus2Versions.versionNumber,
      folderRowId: driveFolders.id,
      driveFolderGid: driveFolders.driveFolderId,
      folderName: driveFolders.name,
      clientIdCode: aplus2Sets.clientIdCode,
      marketplace: aplus2Sets.marketplace,
      scopeIdentifier: aplus2Sets.scopeIdentifier,
    })
    .from(aplus2Versions)
    .innerJoin(driveFolders, eq(driveFolders.id, aplus2Versions.driveFolderId))
    .innerJoin(aplus2Sets, eq(aplus2Sets.id, aplus2Versions.setId))
    .where(eq(aplus2Versions.id, versionId))
    .limit(1);
  if (!v) return NextResponse.json({ error: "Version or Drive folder not found" }, { status: 404 });

  // Look up module position.
  const [mod] = await db
    .select({ position: aplus2Modules.position, versionId: aplus2Modules.versionId })
    .from(aplus2Modules)
    .where(eq(aplus2Modules.id, moduleId))
    .limit(1);
  if (!mod || mod.versionId !== versionId) {
    return NextResponse.json({ error: "moduleId does not belong to this version" }, { status: 400 });
  }

  // Look up item position (if any).
  let itemPosition: number | undefined;
  if (moduleItemId) {
    const [it] = await db
      .select({ position: aplus2ModuleItems.position, moduleId: aplus2ModuleItems.moduleId })
      .from(aplus2ModuleItems)
      .where(eq(aplus2ModuleItems.id, moduleItemId))
      .limit(1);
    if (!it || it.moduleId !== moduleId) {
      return NextResponse.json({ error: "moduleItemId does not belong to this module" }, { status: 400 });
    }
    itemPosition = it.position;
  }

  const slug = aplus2VersionSlug({
    clientIdCode: v.clientIdCode,
    marketplace: v.marketplace,
    scopeIdentifier: v.scopeIdentifier,
    versionNumber: v.versionNumber,
  });

  const filename = aplus2AssetFilename({
    slug,
    modulePosition: mod.position,
    slotKey,
    itemPosition,
    variant,
    ext,
  });

  // Existing asset at this slot+variant (replace flow).
  const existingWhere = moduleItemId
    ? and(eq(aplus2Assets.moduleItemId, moduleItemId), eq(aplus2Assets.slotKey, slotKey), eq(aplus2Assets.variant, variant))
    : and(eq(aplus2Assets.moduleId, moduleId), eq(aplus2Assets.slotKey, slotKey), eq(aplus2Assets.variant, variant));
  const [existing] = await db
    .select({
      assetId: aplus2Assets.id,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(existingWhere)
    .limit(1);

  // Upload to Drive first.
  const buffer = Buffer.from(await file.arrayBuffer());
  let uploadedGid: string;
  try {
    const u = await driveClient.uploadFile(filename, v.driveFolderGid, buffer, file.type);
    uploadedGid = u.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Drive upload failed: ${msg}` }, { status: 502 });
  }

  try {
    const inserted = await db.transaction(async (tx) => {
      if (existing) {
        await tx.delete(aplus2Assets).where(eq(aplus2Assets.id, existing.assetId));
        await tx.delete(driveFiles).where(eq(driveFiles.id, existing.driveFileRowId));
      }
      const [fileRow] = await tx
        .insert(driveFiles)
        .values({
          driveFileId: uploadedGid,
          folderId: v.folderRowId,
          originalName: file.name,
          displayName: filename,
          mimeType: file.type,
          sizeBytes: file.size,
          entityType: "aplus2_version",
          entityId: v.versionId,
          uploadedBy: session.user.email ?? session.user.name ?? "unknown",
        })
        .returning({ id: driveFiles.id });
      const [assetRow] = await tx
        .insert(aplus2Assets)
        .values({
          versionId, moduleId, moduleItemId, kind, slotKey, variant,
          driveFileId: fileRow.id, filename,
        })
        .returning({ id: aplus2Assets.id });
      // If video, also stamp video_drive_file_id on the module for fast lookup.
      if (kind === "video") {
        await tx.update(aplus2Modules).set({ videoDriveFileId: uploadedGid, updatedAt: new Date() }).where(eq(aplus2Modules.id, moduleId));
      }
      await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, versionId));
      return { assetId: assetRow.id, driveFileId: uploadedGid, filename };
    });

    if (existing) {
      try { await driveClient.deleteFile(existing.driveFileGid); }
      catch (cleanupErr) {
        const m = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[aplus2 POST asset] old file ${existing.driveFileGid} trash failed: ${m}`);
      }
    }
    return NextResponse.json({ ok: true, asset: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aplus2 POST asset] DB insert failed:", msg);
    try { await driveClient.deleteFile(uploadedGid); }
    catch (cleanupErr) { console.error("[aplus2 POST asset] orphan cleanup failed:", cleanupErr); }
    return NextResponse.json({ error: `DB insert failed: ${msg}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke test with a sample image**

Drop a 200×225 PNG at `/tmp/test.png`. In a logged-in browser:
```js
const fd = new FormData();
fd.append("file", new File([await (await fetch("/path/to/test.png")).blob()], "test.png", {type:"image/png"}));
fd.append("kind", "image");
fd.append("slotKey", "focus");
fd.append("moduleId", "<moduleId>");
await (await fetch("/api/aplus2/versions/<versionId>/assets", {method:"POST", body: fd})).json()
```
Easier: use the UI page (Phase 4). For now, just verify the endpoint compiles + returns 400 for an empty form.

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/versions/[versionId]/assets/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): POST /api/aplus2/versions/[versionId]/assets

Multipart upload to a (slotKey, variant) tuple. Replace-flow deletes the
existing row + drive_files row before insert so the partial unique index
fires correctly. Trashes the replaced Drive file best-effort. For video
uploads, stamps aplus2_modules.video_drive_file_id with the new gid.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.12: DELETE `/api/aplus2/assets/[assetId]` — remove asset

**Files:**
- Create: `src/app/api/aplus2/assets/[assetId]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/aplus2/assets/[assetId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aplus2Assets, aplus2Modules, aplus2Versions, driveFiles } from "@/lib/db/schema";
import { driveClient } from "@/lib/drive-client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { assetId } = await params;
  const [asset] = await db
    .select({
      assetId: aplus2Assets.id,
      versionId: aplus2Assets.versionId,
      moduleId: aplus2Assets.moduleId,
      kind: aplus2Assets.kind,
      driveFileRowId: aplus2Assets.driveFileId,
      driveFileGid: driveFiles.driveFileId,
    })
    .from(aplus2Assets)
    .innerJoin(driveFiles, eq(driveFiles.id, aplus2Assets.driveFileId))
    .where(eq(aplus2Assets.id, assetId))
    .limit(1);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.delete(aplus2Assets).where(eq(aplus2Assets.id, asset.assetId));
    await tx.delete(driveFiles).where(eq(driveFiles.id, asset.driveFileRowId));
    if (asset.kind === "video" && asset.moduleId) {
      await tx.update(aplus2Modules).set({ videoDriveFileId: null, updatedAt: new Date() }).where(eq(aplus2Modules.id, asset.moduleId));
    }
    await tx.update(aplus2Versions).set({ updatedAt: new Date() }).where(eq(aplus2Versions.id, asset.versionId));
  });

  try { await driveClient.deleteFile(asset.driveFileGid); }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[aplus2 DELETE asset] file ${asset.driveFileGid} trash failed: ${msg}`);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/api/aplus2/assets/[assetId]/route.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): DELETE /api/aplus2/assets/[assetId]

Removes the asset row + drive_files row, clears module.video_drive_file_id
for video kinds, trashes the Drive file best-effort.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.13: GET `/api/aplus2/image` — Drive image proxy

**Files:**
- Create: `src/app/api/aplus2/image/route.ts`

- [ ] **Step 1: Implement (mirrors `brand-story-image/route.ts`)**

Create `src/app/api/aplus2/image/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { driveClient } from "@/lib/drive-client";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveFileId = searchParams.get("driveFileId");
  if (!driveFileId) return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });

  try {
    const bytes = await driveClient.downloadFileContent(driveFileId);
    const metadata = await driveClient.getFile(driveFileId);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": metadata.mimeType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/app/api/aplus2/image/route.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): GET /api/aplus2/image Drive proxy

Authenticated proxy mirrors /api/design-status/brand-story-image. Used
by the editor's image slots to render previews without exposing Drive
file IDs to the page HTML cache.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.14: Phase 2 validation — full build + curl walk-through

**Files:** no code.

- [ ] **Step 1: Build**

`cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -50` — must succeed.

- [ ] **Step 2: End-to-end smoke flow (via dev server + DevTools)**

In a logged-in browser, walk through (write down each ID returned):

```js
// 1. Create a set
const set = await (await fetch("/api/aplus2/sets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientIdCode:"<C>",productId:"<P>",scopeType:"ASIN",marketplace:"US"})})).json();
// 2. Add a qa module
const mod = await (await fetch(`/api/aplus2/versions/${set.versionId}/modules`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({moduleType:"qa"})})).json();
// 3. Patch the module
await (await fetch(`/api/aplus2/modules/${mod.moduleId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"in_review"})})).json();
// 4. Fetch nested payload
const r = await (await fetch(`/api/aplus2/sets/${set.setId}/versions`)).json();
console.log("Modules:", r.versions[0].modules.length, "Items:", r.versions[0].modules[0].items.length);
// 5. Create V02 with copyFrom
const v2 = await (await fetch(`/api/aplus2/sets/${set.setId}/versions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({copyFrom: set.versionId})})).json();
const r2 = await (await fetch(`/api/aplus2/sets/${set.setId}/versions`)).json();
console.log("V02 modules:", r2.versions.find(v=>v.versionNumber===2).modules.length);
// 6. Clean up
await fetch(`/api/aplus2/sets/${set.setId}`, {method:"DELETE"});
```

Expected: modules=1, items=3, V02 modules=1, all DELETEs succeed.

- [ ] **Step 3: No commit — verification only**

End of Phase 2. All 13 backend routes exist, validated, and clean up after themselves.

---

# Phase 3 — UI shells

**Goal:** Ship the three page routes (`/aplus2`, `/aplus2/[clientIdCode]`, `/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]`) with enough functionality to:
- See every client and which marketplaces have sets.
- See every set for a client.
- Create a new set via the product + scope + marketplace dialog.
- See version cards with status pill + drive link + remove. Module editing arrives in Phase 4.

**Reference patterns (copy + adapt — do NOT modify):**
- `src/app/design/brand-story/page.tsx` — client list with status dots.
- `src/app/design/brand-story/[clientIdCode]/page.tsx` — version-cards page shell.
- `src/components/layout/page-header-slot.tsx` (`PageMetaSlot`) — the nav row 3 heading slot. Per memory `feedback_page_meta_slot_pattern`, the heading lives ONLY in row 3, and controls go in a card in the main content area.

---

### Task 3.1: `/aplus2` client list page

**Files:**
- Create: `src/app/aplus2/page.tsx`, `src/app/aplus2/loading.tsx`, `src/app/aplus2/error.tsx`.

- [ ] **Step 1: Loading + error stubs**

Create `src/app/aplus2/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

Create `src/app/aplus2/error.tsx`:

```tsx
"use client";
export default function Error({ error }: { error: Error }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-6">
      <p className="text-sm font-bold text-red-700 dark:text-red-300">A+2 failed to load</p>
      <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">{error.message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/aplus2/page.tsx`:

```tsx
"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Search, X, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientRow = {
  clientIdCode: string;
  clientName: string;
  setCount: number;
  marketplaceCounts: Record<string, number>;
  latestStatus: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  not_started: { label: "Not Started", dot: "bg-stone-400", badge: "border-stone-300 bg-stone-100 text-stone-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-500" },
  in_progress: { label: "In Progress", dot: "bg-amber-500", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400" },
  in_review:   { label: "In Review",   dot: "bg-blue-500",  badge: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400" },
  approved:    { label: "Approved",    dot: "bg-emerald-500", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400" },
  live:        { label: "Live",        dot: "bg-emerald-500", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400" },
};

async function fetchClients(): Promise<ClientRow[]> {
  const r = await fetch("/api/aplus2/clients");
  if (!r.ok) throw new Error("Failed to load clients");
  return r.json();
}

export default function Aplus2ClientListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery({ queryKey: ["aplus2-clients"], queryFn: fetchClients });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.clientName?.toLowerCase().includes(q) || r.clientIdCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-geist-sans)] tracking-tighter leading-none" aria-label="A+ Content v2">
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Content v2</span>
          </h1>
        </div>
      </PageMetaSlot>

      <div className="mb-4 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="pl-9 pr-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : isError ? (
        <p className="text-sm text-red-600">Failed to load clients.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const cfg = STATUS_CONFIG[c.latestStatus ?? "not_started"] ?? STATUS_CONFIG.not_started;
            return (
              <div
                key={c.clientIdCode}
                onClick={() => router.push(`/aplus2/${c.clientIdCode}`)}
                className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-5 py-3 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{c.clientName}</p>
                  <p className="text-[10px] font-bold text-muted-foreground font-mono">{c.clientIdCode}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LayoutTemplate className="size-3" />
                    {c.setCount} {c.setCount === 1 ? "set" : "sets"}
                  </div>
                  <div className="flex items-center gap-1">
                    {Object.entries(c.marketplaceCounts).map(([m, n]) => (
                      <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand font-bold">
                        {m}·{n}
                      </span>
                    ))}
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium", cfg.badge)}>
                    <span className={cn("inline-block size-1.5 rounded-full", cfg.dot)} /> {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run `PORT=3000 npm run dev`, visit `http://localhost:3000/aplus2`. Expected: every aac client appears, the one set you created earlier shows `US·1` and `Not Started`.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/app/aplus2/page.tsx src/app/aplus2/loading.tsx src/app/aplus2/error.tsx && git commit -m "$(cat <<'EOF'
feat(aplus2): /aplus2 client list page

Lists every aac client with set count, per-marketplace counts, latest
status pill. Mirrors /design/brand-story landing page structure.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: `/aplus2/[clientIdCode]` set list + "New A+ Set" dialog

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/page.tsx`, `src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx`.

- [ ] **Step 1: Build the New-Set dialog**

Create `src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { normalizeMarketplace } from "@/lib/aplus2/marketplace";

type Product = {
  id: string;
  asin: string;
  sku: string | null;
  itemName: string | null;
  parentAsin: string | null;
  country: string | null;
  marketplace: string | null;
};

export function NewSetDialog({
  open, onOpenChange, clientIdCode,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  clientIdCode: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<"ASIN" | "PARENT">("ASIN");
  const [marketplace, setMarketplace] = useState<string>("");

  const productsQ = useQuery({
    queryKey: ["aplus2-products", clientIdCode, search],
    queryFn: async (): Promise<Product[]> => {
      const r = await fetch(`/api/aplus2/products?clientIdCode=${encodeURIComponent(clientIdCode)}&q=${encodeURIComponent(search)}`);
      if (!r.ok) throw new Error("Failed to load products");
      return r.json();
    },
    enabled: open,
  });

  const products = productsQ.data ?? [];
  const selected = products.find((p) => p.id === productId);
  // When the user picks a product, auto-default marketplace.
  if (selected && !marketplace) {
    const m = normalizeMarketplace({ country: selected.country, marketplace: selected.marketplace });
    if (m) setMarketplace(m);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/aplus2/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, productId, scopeType, marketplace }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Create failed");
      return d as { setId: string; versionId: string; scopeIdentifier: string; marketplace: string };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aplus2-sets", clientIdCode] });
      onOpenChange(false);
      router.push(`/aplus2/${clientIdCode}/${d.marketplace}/${d.scopeIdentifier}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New A+ Set</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Search products</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ASIN, SKU, title…" />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={`w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-zinc-800/50 ${productId === p.id ? "bg-brand/10" : ""}`}
              >
                <div className="text-xs font-mono">{p.asin} · {p.sku ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p.itemName ?? ""}</div>
              </button>
            ))}
            {products.length === 0 && <p className="text-xs text-muted-foreground p-3">No products match.</p>}
          </div>

          <div>
            <Label className="text-xs">Scope</Label>
            <RadioGroup value={scopeType} onValueChange={(v) => setScopeType(v as "ASIN" | "PARENT")} className="flex gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="ASIN" id="r-asin" /><Label htmlFor="r-asin" className="text-xs">ASIN ({selected?.asin ?? "?"})</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="PARENT" id="r-parent" /><Label htmlFor="r-parent" className="text-xs">PARENT ({selected?.parentAsin ?? selected?.asin ?? "?"})</Label></div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs">Marketplace</Label>
            <Select value={marketplace} onValueChange={setMarketplace}>
              <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {["US","UK","DE","FR","IT","ES","JP","CA","MX","AU","IN","NL","SE","PL","TR","AE","SA","SG","BR","EG"].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!productId || !marketplace || createMut.isPending}
          >
            {createMut.isPending ? "Creating…" : "Create set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the product search API**

Create `src/app/api/aplus2/products/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  const q = (searchParams.get("q") ?? "").trim();
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode is required" }, { status: 400 });

  const where = q
    ? and(
        eq(master.clientIdCode, clientIdCode),
        or(ilike(master.asin, `%${q}%`), ilike(master.sku, `%${q}%`), ilike(master.itemName, `%${q}%`)),
      )
    : eq(master.clientIdCode, clientIdCode);

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      parentAsin: master.parentAsin,
      country: master.country,
      marketplace: master.marketplace,
    })
    .from(master)
    .where(where)
    .orderBy(sql`${master.asin} ASC NULLS LAST`)
    .limit(50);

  return NextResponse.json(rows);
}
```

- [ ] **Step 3: Build the set-list page**

Create `src/app/aplus2/[clientIdCode]/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus } from "lucide-react";
import { NewSetDialog } from "./_components/new-set-dialog";

type SetRow = {
  id: string;
  scopeType: "ASIN" | "PARENT";
  scopeIdentifier: string;
  marketplace: string;
  parentAsin: string | null;
  coveredAsins: string[] | null;
  asin: string | null;
  sku: string | null;
  itemName: string | null;
  versionCount: number;
  latestStatus: string | null;
  latestVersionNumber: number | null;
};

export default function Aplus2ClientSetsPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode = typeof params.clientIdCode === "string" ? params.clientIdCode : "";
  const [dialog, setDialog] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["aplus2-sets", clientIdCode],
    queryFn: async (): Promise<{ clientName: string; sets: SetRow[] }> => {
      const r = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
      if (!r.ok) throw new Error("Failed to load sets");
      return r.json();
    },
    enabled: !!clientIdCode,
  });

  const sets = data?.sets ?? [];
  const groupedByMarket = sets.reduce<Record<string, SetRow[]>>((acc, s) => {
    (acc[s.marketplace] ??= []).push(s); return acc;
  }, {});

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-geist-sans)] tracking-tighter leading-none">
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Sets</span>
          </h1>
          <span className="text-brand font-bold text-xs">{data?.clientName ?? clientIdCode}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{clientIdCode}</span>
        </div>
      </PageMetaSlot>

      <button
        onClick={() => router.push("/aplus2")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="size-4" /> Back to A+ Content v2
      </button>

      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setDialog(true)}>
          <Plus className="size-3 mr-1" /> New A+ Set
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : isError ? (
        <p className="text-sm text-red-600">Failed to load sets.</p>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sets yet — create one to get started.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByMarket).map(([mkt, list]) => (
            <div key={mkt}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{mkt}</h2>
              <div className="space-y-2">
                {list.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/aplus2/${clientIdCode}/${s.marketplace}/${s.scopeIdentifier}`)}
                    className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-5 py-3 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand font-bold">
                        {s.scopeType === "PARENT" ? `PARENT ${s.scopeIdentifier} · covers ${s.coveredAsins?.length ?? 0}` : `ASIN ${s.scopeIdentifier}`}
                      </span>
                      <span className="text-xs truncate">{s.itemName ?? s.sku ?? ""}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <span className="text-muted-foreground">v{s.latestVersionNumber ?? 1} · {s.versionCount} version{s.versionCount === 1 ? "" : "s"}</span>
                      <span className="text-[10px] uppercase font-bold">{s.latestStatus ?? "not_started"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewSetDialog open={dialog} onOpenChange={setDialog} clientIdCode={clientIdCode} />
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Visit `/aplus2/<clientCode>`. Click "New A+ Set", search for an ASIN, pick scope+marketplace, submit. Confirm redirect to `/aplus2/<client>/<marketplace>/<asin>`.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/page.tsx" "src/app/aplus2/[clientIdCode]/_components/new-set-dialog.tsx" src/app/api/aplus2/products/route.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): /aplus2/[clientIdCode] set list + new-set dialog

Groups sets by marketplace. New-set dialog searches the client's products,
defaults marketplace via normalizeMarketplace(), submits to POST /sets and
navigates to the new set's version-cards page.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3: `/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]` shell

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx`.

- [ ] **Step 1: Implement the shell**

The shell fetches the nested payload, resolves the set ID from the URL triple (`client + marketplace + scope_identifier`), and renders version cards. Drag-reorder + module editing arrive in Phase 4/5.

Create `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx`:

```tsx
"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { ArrowLeft, ExternalLink, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";

type ItemDto = { id: string; position: number; data: Record<string, unknown> };
type AssetDto = { id: string; kind: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };
type ModuleDto = {
  id: string; position: number; moduleType: string; status: string;
  headlineText: string | null; subheadlineText: string | null; bodyText: string | null; overlayText: string | null;
  altText: string | null; imageDescription: string | null; aiImagePrompt: string | null; cosmoRelationType: string | null;
  videoDriveFileId: string | null; videoTitle: string | null; videoDescription: string | null;
  textPosition: string | null; fontColor: string | null; figmaUrl: string | null; markupUrl: string | null;
  items: ItemDto[]; assets: AssetDto[];
};
type VersionDto = { id: string; versionNumber: number; status: string; driveFolderUrl: string | null; createdAt: string; updatedAt: string; modules: ModuleDto[] };
type SetDto = {
  id: string; clientIdCode: string; scopeType: "ASIN" | "PARENT"; scopeIdentifier: string;
  marketplace: string; parentAsin: string | null; coveredAsins: string[] | null;
  productId: string; asin: string | null; sku: string | null; itemName: string | null;
};

const VERSION_STATUSES: { value: string; label: string; dot: string }[] = [
  { value: "not_started", label: "Not Started", dot: "bg-zinc-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-amber-500" },
  { value: "in_review",   label: "In Review",   dot: "bg-sky-500" },
  { value: "approved",    label: "Approved",    dot: "bg-emerald-500" },
  { value: "live",        label: "Live",        dot: "bg-emerald-600" },
];

async function fetchSetSnapshot(setId: string) {
  const r = await fetch(`/api/aplus2/sets/${setId}/versions`);
  if (!r.ok) throw new Error("Failed to load set");
  return r.json() as Promise<{ set: SetDto; versions: VersionDto[] }>;
}

async function fetchSetIdByTriple(clientIdCode: string, marketplace: string, scopeIdentifier: string): Promise<string | null> {
  const r = await fetch(`/api/aplus2/sets?clientIdCode=${encodeURIComponent(clientIdCode)}`);
  if (!r.ok) return null;
  const d = await r.json() as { sets: { id: string; marketplace: string; scopeIdentifier: string }[] };
  return d.sets.find((s) => s.marketplace === marketplace && s.scopeIdentifier === scopeIdentifier)?.id ?? null;
}

function VersionStatusSelect({ versionId, value }: { versionId: string; value: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (next: string) => {
      const r = await fetch(`/api/aplus2/versions/${versionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });
  const current = VERSION_STATUSES.find((s) => s.value === value) ?? VERSION_STATUSES[0];
  return (
    <Select value={value} onValueChange={(v) => mut.mutate(v)} disabled={mut.isPending}>
      <SelectTrigger className="h-7 text-xs gap-2 px-2 w-[140px]">
        <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${current.dot}`} /><SelectValue /></span>
      </SelectTrigger>
      <SelectContent>
        {VERSION_STATUSES.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${o.dot}`} />{o.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Aplus2SetPage() {
  const params = useParams();
  const router = useRouter();
  const clientIdCode = String(params.clientIdCode);
  const marketplace = String(params.marketplace);
  const setIdentifier = String(params.setIdentifier);

  const idQ = useQuery({
    queryKey: ["aplus2-set-id", clientIdCode, marketplace, setIdentifier],
    queryFn: () => fetchSetIdByTriple(clientIdCode, marketplace, setIdentifier),
  });
  const setId = idQ.data ?? null;

  const dataQ = useQuery({
    queryKey: ["aplus2-set", setId],
    queryFn: () => fetchSetSnapshot(setId!),
    enabled: !!setId,
  });

  const qc = useQueryClient();
  const newVersionMut = useMutation({
    mutationFn: async (copyFrom: string | undefined) => {
      const r = await fetch(`/api/aplus2/sets/${setId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ copyFrom }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set", setId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });
  const deleteVersionMut = useMutation({
    mutationFn: async (versionId: string) => {
      const r = await fetch(`/api/aplus2/versions/${versionId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set", setId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const set = dataQ.data?.set;
  const versions = useMemo(() => (dataQ.data?.versions ?? []).slice().sort((a, b) => b.versionNumber - a.versionNumber), [dataQ.data]);

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-geist-sans)] tracking-tighter leading-none">
            <span className="font-bold text-sidebar-foreground">A+</span>
            <span className="font-normal text-brand">Set</span>
          </h1>
          {set && (
            <div className="flex items-baseline gap-2 text-xs min-w-0">
              <span className="text-brand font-bold truncate">{set.itemName ?? set.sku ?? clientIdCode}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {set.scopeType === "PARENT" ? `PARENT ${set.scopeIdentifier} · ${marketplace} · covers ${set.coveredAsins?.length ?? 0}` : `ASIN ${set.scopeIdentifier} · ${marketplace}`}
              </span>
            </div>
          )}
        </div>
      </PageMetaSlot>

      <button onClick={() => router.push(`/aplus2/${clientIdCode}`)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> Back to {clientIdCode}
      </button>

      {idQ.isLoading || dataQ.isLoading ? (
        <div className="space-y-4">{Array.from({length:2}).map((_,i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}</div>
      ) : !setId ? (
        <p className="text-sm text-red-600">Set not found.</p>
      ) : versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/30 p-12 text-center text-sm text-muted-foreground">
          No versions yet — this should not happen (V01 is auto-created).
        </div>
      ) : (
        <div className="space-y-6">
          {versions.map((v) => (
            <div key={v.id} className="rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-6 py-3 bg-stone-50 dark:bg-zinc-800/30">
                <div className="flex items-center gap-3 truncate">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand font-bold">v{v.versionNumber}</span>
                  <span className="text-xs font-mono font-bold text-brand-orange truncate">
                    {clientIdCode}_{marketplace}_{setIdentifier}_Aplus_V{String(v.versionNumber).padStart(2,"0")}
                  </span>
                  <VersionStatusSelect versionId={v.id} value={v.status} />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {v.driveFolderUrl && (
                    <a href={v.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand-orange hover:underline">
                      <ExternalLink className="size-3" /> Drive folder
                    </a>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => newVersionMut.mutate(v.id)} disabled={newVersionMut.isPending}>
                    <Copy className="size-3 mr-1" /> Copy to new version
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    if (confirm(`Remove V${String(v.versionNumber).padStart(2,"0")}? This deletes the version + Drive subfolder.`)) deleteVersionMut.mutate(v.id);
                  }} disabled={deleteVersionMut.isPending}>
                    <Trash2 className="size-3 mr-1" /> Remove version
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {v.modules.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No modules yet — the &quot;Add module&quot; control arrives in Phase 5.
                  </p>
                ) : (
                  v.modules.map((m) => (
                    <div key={m.id} className="rounded-md border border-stone-200 dark:border-zinc-800 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">M{String(m.position).padStart(2,"0")} · {m.moduleType} · {m.status}</div>
                      <p className="text-xs text-muted-foreground mt-1">Module editor arrives in Phase 4.</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Click into your test set. Expect: page renders, status pill works (try changing status — verify in psql), "Copy to new version" creates V02, "Remove version" deletes it.

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): set page shell with version cards + status + copy/remove

Stacked version cards (newest first), version status select, Drive
folder link, Copy-to-new-version, Remove-version. Module subcards are
placeholders — full editor lands in Phase 4.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.4: Phase 3 validation

**Files:** no code.

- [ ] **Step 1: Click through:** `/aplus2` → pick a client → create a set → open it → change status → copy version → remove version → remove set.
- [ ] **Step 2: Verify build:** `cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -40` — must succeed.

End of Phase 3. The page tree is navigable; module editing is the next phase.

---

# Phase 4 — Generic module editor

**Goal:** Ship `<Aplus2ModuleEditor>` — one component that renders every module type by reading `APLUS2_MODULE_SPECS[moduleType]`. Text fields debounce-PATCH the module. Image slots upload to `/api/aplus2/versions/[versionId]/assets`. Repeatable items PATCH their JSONB `data`. Video slot uploads + sets video title/description.

**Files (all under `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/`):**
- Create: `aplus2-module-editor.tsx`, `aplus2-image-slot.tsx`, `aplus2-video-slot.tsx`, `aplus2-repeatable-items.tsx`, `use-debounced-patch.ts`.
- Modify: the set page (Task 3.3) — replace the placeholder module subcard with `<Aplus2ModuleEditor>`.

---

### Task 4.1: Debounced-PATCH helper hook

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/use-debounced-patch.ts`.

- [ ] **Step 1: Implement**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Returns a `setField` that locally buffers a value, then PATCHes it via the
 * provided endpoint after `delay` ms of inactivity. Pending writes are
 * coalesced into one PATCH per field. */
export function useDebouncedPatch<T extends Record<string, unknown>>({
  endpoint, initial, delay = 600,
}: {
  endpoint: string;
  initial: T;
  delay?: number;
}) {
  const [values, setValues] = useState<T>(initial);
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    const payload = pending.current;
    pending.current = {};
    if (Object.keys(payload).length === 0) return;
    try {
      const r = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Save failed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }, [endpoint]);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush, delay]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); flush(); }, [flush]);

  return { values, setField, flush };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/use-debounced-patch.ts" && git commit -m "$(cat <<'EOF'
feat(aplus2): useDebouncedPatch hook

Coalesces field-level edits into one PATCH per inactivity window. Used
by every text field in <Aplus2ModuleEditor>.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.2: `<Aplus2ImageSlot>` component

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-image-slot.tsx`.

The component shows the desktop and (when the spec allows it) mobile preview, with an upload button per variant and a delete button. Renders the dimension hint above each variant.

- [ ] **Step 1: Implement**

```tsx
/* eslint-disable @next/next/no-img-element */
"use client";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Aplus2ImageSlotSpec } from "@/lib/aplus2/module-specs";

type AssetDto = { id: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };

const proxyUrl = (gid: string) => `/api/aplus2/image?driveFileId=${encodeURIComponent(gid)}`;

export function Aplus2ImageSlot({
  spec, assets, versionId, moduleId, moduleItemId,
}: {
  spec: Aplus2ImageSlotSpec;
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
  moduleItemId?: string;
}) {
  const variants: Array<"desktop" | "mobile"> = spec.mobileSize ? ["desktop", "mobile"] : ["desktop"];
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{spec.label}</div>
      <div className={spec.mobileSize ? "grid grid-cols-2 gap-3" : ""}>
        {variants.map((variant) => {
          const size = variant === "desktop" ? spec.desktopSize : spec.mobileSize!;
          const asset = assets.find((a) => a.slotKey === spec.key && a.variant === variant
            && (moduleItemId ? a.moduleItemId === moduleItemId : a.moduleId === moduleId && !a.moduleItemId)) ?? null;
          return (
            <Aplus2ImageVariant
              key={variant}
              size={size}
              variant={variant}
              slotKey={spec.key}
              versionId={versionId}
              moduleId={moduleId}
              moduleItemId={moduleItemId}
              asset={asset}
            />
          );
        })}
      </div>
    </div>
  );
}

function Aplus2ImageVariant({
  size, variant, slotKey, versionId, moduleId, moduleItemId, asset,
}: {
  size: { width: number; height: number };
  variant: "desktop" | "mobile";
  slotKey: string;
  versionId: string;
  moduleId: string;
  moduleItemId?: string;
  asset: AssetDto | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "image");
      fd.append("slotKey", slotKey);
      fd.append("variant", variant);
      fd.append("moduleId", moduleId);
      if (moduleItemId) fd.append("moduleItemId", moduleItemId);
      const r = await fetch(`/api/aplus2/versions/${versionId}/assets`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upload failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      const r = await fetch(`/api/aplus2/assets/${asset.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground mb-1">{variant} · {size.width}×{size.height}</div>
      <div className="relative rounded-md border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 overflow-hidden aspect-[4/3]">
        {asset ? (
          <img src={proxyUrl(asset.driveFileId)} alt={asset.filename} className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          ref={inputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }}
        />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => inputRef.current?.click()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Upload className="size-3 mr-1" />}
          {asset ? "Replace" : "Upload"}
        </Button>
        {asset && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
            <Trash2 className="size-3 mr-1" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-image-slot.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): <Aplus2ImageSlot> with desktop + mobile variants

Renders one variant per declared size in the spec. Each variant has its
own upload + replace + remove button. Image preview via /api/aplus2/image
proxy. Invalidates the aplus2-set query on any change.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.3: `<Aplus2RepeatableItems>` component

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-repeatable-items.tsx`.

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Aplus2ImageSlot } from "./aplus2-image-slot";
import type { Aplus2ModuleSpec } from "@/lib/aplus2/module-specs";

type ItemDto = { id: string; position: number; data: Record<string, unknown> };
type AssetDto = { id: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };

export function Aplus2RepeatableItems({
  spec, items, assets, versionId, moduleId,
}: {
  spec: Aplus2ModuleSpec;
  items: ItemDto[];
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
}) {
  const group = spec.repeatableGroup;
  if (!group) return null;
  const qc = useQueryClient();

  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-3 mt-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {group.label} ({sorted.length}/{group.maxItems})
      </div>
      {sorted.map((item) => (
        <RepeatableItemCard
          key={item.id}
          spec={spec}
          item={item}
          assets={assets.filter((a) => a.moduleItemId === item.id)}
          versionId={versionId}
          moduleId={moduleId}
        />
      ))}
    </div>
  );
}

function RepeatableItemCard({
  spec, item, assets, versionId, moduleId,
}: {
  spec: Aplus2ModuleSpec;
  item: ItemDto;
  assets: AssetDto[];
  versionId: string;
  moduleId: string;
}) {
  const group = spec.repeatableGroup!;
  const [local, setLocal] = useState<Record<string, unknown>>(item.data);
  const qc = useQueryClient();

  const patchMut = useMutation({
    mutationFn: async (next: Record<string, unknown>) => {
      const payload = { type: group.itemDataType, ...next };
      const r = await fetch(`/api/aplus2/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: payload }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
  });

  const onBlur = (key: string, value: string) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    patchMut.mutate(next);
  };

  return (
    <div className="rounded-md border border-stone-200 dark:border-zinc-800 p-3">
      <div className="text-[10px] font-bold text-muted-foreground mb-2">{group.itemLabel} {item.position}</div>
      <div className="space-y-3">
        {group.fields.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}{f.maxLength ? ` (${(local[f.key] as string | undefined)?.length ?? 0}/${f.maxLength})` : ""}</Label>
            {f.multiline ? (
              <Textarea
                rows={f.rows ?? 2}
                maxLength={f.maxLength}
                defaultValue={(local[f.key] as string | undefined) ?? ""}
                onBlur={(e) => onBlur(f.key, e.target.value)}
                placeholder={f.hint}
              />
            ) : (
              <Input
                maxLength={f.maxLength}
                defaultValue={(local[f.key] as string | undefined) ?? ""}
                onBlur={(e) => onBlur(f.key, e.target.value)}
                placeholder={f.hint}
              />
            )}
          </div>
        ))}
        {group.image && (
          <Aplus2ImageSlot
            spec={{ key: group.image.key, label: group.image.label, desktopSize: group.image.desktopSize, mobileSize: group.image.mobileSize }}
            assets={assets}
            versionId={versionId}
            moduleId={moduleId}
            moduleItemId={item.id}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-repeatable-items.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): <Aplus2RepeatableItems> renderer

Renders N item cards (one per spec.repeatableGroup row). Each card has
the spec's text fields and (optionally) a per-item image slot. Fields
PATCH the JSONB data on blur with the correct discriminator stamped.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.4: `<Aplus2VideoSlot>` component

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-video-slot.tsx`.

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Aplus2VideoSpec } from "@/lib/aplus2/module-specs";

type AssetDto = { id: string; kind: string; slotKey: string; driveFileId: string; filename: string; moduleId: string | null };

export function Aplus2VideoSlot({
  spec, versionId, moduleId, asset,
  videoTitle, videoDescription, onMetaChange,
}: {
  spec: Aplus2VideoSpec;
  versionId: string;
  moduleId: string;
  asset: AssetDto | null;
  videoTitle: string;
  videoDescription: string;
  onMetaChange: (field: "videoTitle" | "videoDescription", value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file); fd.append("kind", "video"); fd.append("slotKey", "video"); fd.append("variant", "desktop"); fd.append("moduleId", moduleId);
      const r = await fetch(`/api/aplus2/versions/${versionId}/assets`, { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upload failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      const r = await fetch(`/api/aplus2/assets/${asset.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Video</div>
      <div className="flex items-center gap-3 rounded-md border border-stone-200 dark:border-zinc-800 p-3">
        <Film className="size-6 text-muted-foreground" />
        {asset ? (
          <span className="text-xs font-mono truncate">{asset.filename}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No video uploaded</span>
        )}
        <input ref={inputRef} type="file" className="hidden" accept="video/mp4" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => inputRef.current?.click()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Upload className="size-3 mr-1" />}
          {asset ? "Replace" : "Upload"}
        </Button>
        {asset && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
            <Trash2 className="size-3 mr-1" />
          </Button>
        )}
      </div>
      <div>
        <Label className="text-xs">Video title ({videoTitle.length}/{spec.titleMaxLen})</Label>
        <Input maxLength={spec.titleMaxLen} defaultValue={videoTitle} onBlur={(e) => onMetaChange("videoTitle", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Video description ({videoDescription.length}/{spec.descriptionMaxLen})</Label>
        <Textarea rows={3} maxLength={spec.descriptionMaxLen} defaultValue={videoDescription} onBlur={(e) => onMetaChange("videoDescription", e.target.value)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-video-slot.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): <Aplus2VideoSlot>

video/mp4 upload + replace + remove + title + description with char
counters. Updates the module video meta via the parent's onMetaChange
callback (which routes through the debounced PATCH).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.5: `<Aplus2ModuleEditor>` — the orchestrator

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx`.
- Modify: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx` — replace the module-subcard placeholder with `<Aplus2ModuleEditor>`.

- [ ] **Step 1: Implement the editor**

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  APLUS2_MODULE_SPECS, getAplus2ModuleLayout,
  type Aplus2ModuleType, type Aplus2LayoutItem,
} from "@/lib/aplus2/module-specs";
import { useDebouncedPatch } from "./use-debounced-patch";
import { Aplus2ImageSlot } from "./aplus2-image-slot";
import { Aplus2RepeatableItems } from "./aplus2-repeatable-items";
import { Aplus2VideoSlot } from "./aplus2-video-slot";

type ItemDto = { id: string; position: number; data: Record<string, unknown> };
type AssetDto = { id: string; kind: string; slotKey: string; variant: "desktop" | "mobile"; driveFileId: string; filename: string; moduleId: string | null; moduleItemId: string | null };
export type ModuleDto = {
  id: string; position: number; moduleType: string; status: string;
  headlineText: string | null; subheadlineText: string | null; bodyText: string | null; overlayText: string | null;
  altText: string | null; imageDescription: string | null; aiImagePrompt: string | null; cosmoRelationType: string | null;
  videoDriveFileId: string | null; videoTitle: string | null; videoDescription: string | null;
  textPosition: string | null; fontColor: string | null; figmaUrl: string | null; markupUrl: string | null;
  items: ItemDto[]; assets: AssetDto[];
};

const MODULE_STATUSES = ["draft", "in_review", "approved", "uploaded", "live"] as const;

export function Aplus2ModuleEditor({
  module, versionId,
}: {
  module: ModuleDto;
  versionId: string;
}) {
  const spec = APLUS2_MODULE_SPECS[module.moduleType as Aplus2ModuleType];
  const qc = useQueryClient();

  const { values, setField } = useDebouncedPatch({
    endpoint: `/api/aplus2/modules/${module.id}`,
    initial: {
      headlineText: module.headlineText ?? "",
      subheadlineText: module.subheadlineText ?? "",
      bodyText: module.bodyText ?? "",
      overlayText: module.overlayText ?? "",
      videoTitle: module.videoTitle ?? "",
      videoDescription: module.videoDescription ?? "",
      textPosition: module.textPosition ?? "",
      fontColor: module.fontColor ?? "",
    },
  });

  const statusMut = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`/api/aplus2/modules/${module.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });
  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/aplus2/modules/${module.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aplus2-set"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  if (!spec) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
        Unknown module type: {module.moduleType}
      </div>
    );
  }

  const layout = getAplus2ModuleLayout(spec);

  return (
    <div className="rounded-md border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-stone-50 dark:bg-zinc-800/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand font-bold">M{String(module.position).padStart(2,"0")}</span>
          <span className="text-xs font-semibold">{spec.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={module.status} onValueChange={(s) => statusMut.mutate(s)}>
            <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODULE_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (confirm("Delete module?")) deleteMut.mutate(); }}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {layout.map((item, i) => renderItem(item, i, spec, values, setField, module, versionId))}

        {/* Layout controls (text_position / font_color) */}
        {spec.layoutControls?.map((c) => (
          <div key={c.key}>
            <Label className="text-xs">{c.key === "text_position" ? "Text position" : "Font color"}</Label>
            <Select
              value={(values[c.key === "text_position" ? "textPosition" : "fontColor"] as string) || ""}
              onValueChange={(v) => setField(c.key === "text_position" ? "textPosition" : "fontColor", v as never)}
            >
              <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {c.options.map((opt) => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderItem(
  item: Aplus2LayoutItem,
  i: number,
  spec: ReturnType<typeof getSpec>,
  values: Record<string, unknown>,
  setField: <K extends string>(k: K, v: unknown) => void,
  module: ModuleDto,
  versionId: string,
): React.ReactNode {
  if (item.type === "textField") {
    const f = spec.textFields.find((t) => t.key === item.fieldKey);
    if (!f) return null;
    const current = (values[f.key] as string | undefined) ?? "";
    return (
      <div key={`tf-${i}`}>
        <Label className="text-xs">{f.label}{f.maxLength ? ` (${current.length}/${f.maxLength})` : ""}</Label>
        {f.multiline ? (
          <Textarea rows={f.rows ?? 2} maxLength={f.maxLength} defaultValue={current} onBlur={(e) => setField(f.key, e.target.value)} placeholder={f.hint} />
        ) : (
          <Input maxLength={f.maxLength} defaultValue={current} onBlur={(e) => setField(f.key, e.target.value)} placeholder={f.hint} />
        )}
      </div>
    );
  }
  if (item.type === "imageSlot") {
    const s = spec.imageSlots.find((x) => x.key === item.slotKey);
    if (!s) return null;
    return <Aplus2ImageSlot key={`is-${i}`} spec={s} assets={module.assets} versionId={versionId} moduleId={module.id} />;
  }
  if (item.type === "videoSlot" && spec.video) {
    const videoAsset = module.assets.find((a) => a.kind === "video" && !a.moduleItemId);
    return (
      <Aplus2VideoSlot
        key={`v-${i}`}
        spec={spec.video}
        versionId={versionId}
        moduleId={module.id}
        asset={videoAsset ?? null}
        videoTitle={(values.videoTitle as string) ?? ""}
        videoDescription={(values.videoDescription as string) ?? ""}
        onMetaChange={(field, value) => setField(field, value)}
      />
    );
  }
  if (item.type === "repeatableGroup" && spec.repeatableGroup) {
    return <Aplus2RepeatableItems key={`rg-${i}`} spec={spec} items={module.items} assets={module.assets} versionId={versionId} moduleId={module.id} />;
  }
  return null;
}

function getSpec(t: Aplus2ModuleType) { return APLUS2_MODULE_SPECS[t]; }
```

- [ ] **Step 2: Wire it into the set page**

Open `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx`. Find the block:

```tsx
v.modules.map((m) => (
  <div key={m.id} className="rounded-md border border-stone-200 dark:border-zinc-800 p-3">
    <div className="text-[10px] font-mono text-muted-foreground">M{String(m.position).padStart(2,"0")} · {m.moduleType} · {m.status}</div>
    <p className="text-xs text-muted-foreground mt-1">Module editor arrives in Phase 4.</p>
  </div>
))
```

Replace with:

```tsx
v.modules.map((m) => <Aplus2ModuleEditor key={m.id} module={m} versionId={v.id} />)
```

And add the import near the other component imports at the top:

```tsx
import { Aplus2ModuleEditor } from "./_components/aplus2-module-editor";
```

- [ ] **Step 3: Verify in browser**

Add a `qa` module via DevTools (Task 2.7 curl). Refresh the set page — the QA editor renders with 3 Q&A items. Edit a question, blur — verify in psql that `aplus2_module_items.data` updated. Upload an image to a `single_image_text` module's `main_image` slot — verify the file appears in Drive with the correct slug and re-renders inline.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-module-editor.tsx" "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): <Aplus2ModuleEditor> schema-driven module subcard

Reads APLUS2_MODULE_SPECS[moduleType] and renders text fields, image
slots, video slot, and repeatable items in the spec's explicit layout
order. Text edits debounce-PATCH; status pill PATCHes immediately.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4.6: Phase 4 validation

**Files:** no code.

- [ ] **Step 1: Walk through every module type**

Create one of each of the 19 module types in a throwaway version. For each, verify:
- All declared text fields render with the right max-length counter.
- All declared image slots render with desktop (+ mobile when declared).
- Repeatable items show the right field set.
- Video slot renders for `full_video`, `video_text`, `video_image_carousel`.
- `background_image_text` shows the text_position + font_color selects.

- [ ] **Step 2: Build + lint**

`cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -40`
`cd /Users/manu/1o8Hub && npm run lint 2>&1 | tail -30`

End of Phase 4. Users can edit every module type end-to-end.

---

# Phase 5 — Interactions: drag-reorder, copy, add-module

**Goal:** Wire the missing UX bits: drag-and-drop module reordering with a deferred "Save reorder" button (lazy Drive rename), the "Add module" dropdown that picks from the 19 types, and the per-module status pill (already done in Task 4.5 — confirm it works).

---

### Task 5.1: "Add module" dropdown

**Files:**
- Create: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx`.
- Modify: the set page — render it below each version's module list when the module count < 7.

- [ ] **Step 1: Build the dropdown**

```tsx
"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { APLUS2_MODULE_SPECS, APLUS2_MODULE_TYPES, type Aplus2ModuleType } from "@/lib/aplus2/module-specs";

export function Aplus2AddModule({ versionId, disabled }: { versionId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (moduleType: Aplus2ModuleType) => {
      const r = await fetch(`/api/aplus2/versions/${versionId}/modules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleType }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      return d;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aplus2-set"] }); setOpen(false); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs" disabled={disabled || mut.isPending}>
          <Plus className="size-3 mr-1" /> Add module
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        <Command>
          <CommandInput placeholder="Search modules…" />
          <CommandList>
            <CommandEmpty>No module matches.</CommandEmpty>
            <CommandGroup>
              {APLUS2_MODULE_TYPES.map((t) => (
                <CommandItem key={t} value={t} onSelect={() => mut.mutate(t)}>
                  <div>
                    <div className="text-xs font-semibold">{APLUS2_MODULE_SPECS[t].label}</div>
                    <div className="text-[10px] text-muted-foreground">{APLUS2_MODULE_SPECS[t].description}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Wire it into the set page**

In `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx`, inside the `<div className="p-6 space-y-4">` block (the version-card body), after the `v.modules.map(...)` loop, add:

```tsx
<Aplus2AddModule versionId={v.id} disabled={v.modules.length >= 7} />
```

And the import: `import { Aplus2AddModule } from "./_components/aplus2-add-module";`.

- [ ] **Step 3: Verify**

In the browser, click "Add module" → search for "qa" → click. New module appears with 3 pre-seeded items.

- [ ] **Step 4: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-add-module.tsx" "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx" && git commit -m "$(cat <<'EOF'
feat(aplus2): "Add module" popover with filterable picker

Lists all 19 module types with label + description. POSTs to
/versions/[id]/modules. Disabled when version already has 7 modules.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.2: Drag-reorder with deferred "Save reorder" button

**Files:**
- Modify: `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx` and `_components/aplus2-module-editor.tsx`.
- The DnD context wraps each version's module list. Reorder is local only until the user clicks "Save reorder", which calls the lazy-rename API.

- [ ] **Step 1: Add `@dnd-kit/sortable` if not already installed**

```bash
cd /Users/manu/1o8Hub && grep '"@dnd-kit/sortable"' package.json || npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Build the reorderable list component**

Create `src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-version-modules.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Save, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Aplus2ModuleEditor, type ModuleDto } from "./aplus2-module-editor";

export function Aplus2VersionModules({ versionId, modules }: { versionId: string; modules: ModuleDto[] }) {
  const [order, setOrder] = useState<ModuleDto[]>(modules);
  // Re-sync when the underlying data refetches.
  useEffect(() => { setOrder(modules); }, [modules]);

  const qc = useQueryClient();
  const dirty = order.some((m, i) => modules[i]?.id !== m.id);

  const saveMut = useMutation({
    mutationFn: async () => {
      const positions = order.map((m, i) => ({ moduleId: m.id, position: i + 1 }));
      const anchor = positions[0]?.moduleId ?? "00000000-0000-0000-0000-000000000000";
      const r = await fetch(`/api/aplus2/modules/${anchor}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Reorder failed");
      return d as { renamed: number };
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["aplus2-set"] }); toast.success(`Saved · ${d.renamed} Drive files renamed`); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Reorder failed"),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.over.id === e.active.id) return;
    const oldIdx = order.findIndex((m) => m.id === e.active.id);
    const newIdx = order.findIndex((m) => m.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setOrder(arrayMove(order, oldIdx, newIdx));
  };

  return (
    <div className="space-y-4">
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="size-3 mr-1" />
            {saveMut.isPending ? "Saving…" : "Save reorder (renames Drive files)"}
          </Button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {order.map((m) => <SortableRow key={m.id} module={m} versionId={versionId} />)}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({ module, versionId }: { module: ModuleDto; versionId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-stretch">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing px-1 text-muted-foreground hover:text-foreground self-start mt-3">
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1"><Aplus2ModuleEditor module={module} versionId={versionId} /></div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the set page**

In `page.tsx`, replace the `v.modules.map((m) => <Aplus2ModuleEditor ... />)` block with:

```tsx
<Aplus2VersionModules versionId={v.id} modules={v.modules} />
```

Add `import { Aplus2VersionModules } from "./_components/aplus2-version-modules";` at the top.

- [ ] **Step 4: Verify**

Add 3 modules to a version. Drag the second to the top. "Save reorder" button appears. Click it. Verify in psql that positions are 1,2,3 again with the new order. Upload an image to one of them first to verify the Drive rename actually fires.

- [ ] **Step 5: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/_components/aplus2-version-modules.tsx" "src/app/aplus2/[clientIdCode]/[marketplace]/[setIdentifier]/page.tsx" $(if ! grep -q '"@dnd-kit/sortable"' package.json.bak 2>/dev/null; then echo "package.json package-lock.json"; fi) && git commit -m "$(cat <<'EOF'
feat(aplus2): drag-reorder modules with lazy Drive rename

@dnd-kit-based sortable list. Reorder is local-only until the user
clicks "Save reorder", which calls the bulk-positions endpoint and
renames Drive files in one batch.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.3: Phase 5 validation

**Files:** no code.

- [ ] Click through: add module → edit text → upload image → drag-reorder → save reorder → confirm Drive rename → delete module → copy version → delete version → delete set. Every step must succeed without error toasts.

End of Phase 5. The editor is fully functional.

---

# Phase 6 — Auth, nav, client-role gating

**Goal:** Add `aplus2` to the permissions registry, wire client-role read-only gating on every page route, surface "A+ Content (v2)" in the sidebar nav, and label the legacy `/aplus` route as "Legacy".

---

### Task 6.1: Add `aplus2` to `permissions.ts`

**Files:**
- Modify: `src/lib/permissions.ts`.

- [ ] **Step 1: Edit `DEPARTMENTS.design.subsections`**

Add `aplus2: { label: "A+ Content (v2)" },` right after the `aplus` entry:

```ts
design: {
  label: "Design",
  subsections: {
    brandstory: { label: "Brand Story" },
    aplus: { label: "A+ Content" },
    aplus2: { label: "A+ Content (v2)" },
    "listing-images": { label: "Listing Images" },
    storefront: { label: "Storefront" },
    files: { label: "Files" },
  },
},
```

In `CONFIGURABLE_SECTIONS`, insert (after the `aplus` row):
```ts
{ id: "aplus2", label: "A+ Content (v2)", type: "subsection" as const, dept: "design" as DepartmentId },
```

In `DEFAULT_CLIENT_SECTIONS`, insert `"aplus2",` after `"aplus",`.

In `CROSS_DEPARTMENT_LINKS`, mirror the aplus entry:
```ts
aplus2: [{ dept: "catalog", label: "Catalog" }],
```

- [ ] **Step 2: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/lib/permissions.ts && git commit -m "$(cat <<'EOF'
feat(aplus2): add aplus2 to permissions registry

New design subsection. Client default sections include aplus2 alongside
aplus, so existing client users see both labels.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.2: Gate `/aplus2` pages by section + client-role scope

**Files:**
- Modify: `src/proxy.ts` (the renamed middleware) OR add a server-side check to each page.

The brand-story routes rely on the proxy for top-level gating + an `getAuthSession()` check in API routes. We mirror that.

- [ ] **Step 1: Confirm proxy already gates `/aplus2`**

```bash
grep -n "aplus\|brand_story\|brandstory\|allowedSections" /Users/manu/1o8Hub/src/proxy.ts | head -20
```

If `/aplus` is gated by section-name lookup against the URL, `/aplus2` will need the same — extend the relevant case. Implementation depends on the existing pattern; do not refactor unrelated routes.

- [ ] **Step 2: Server-side client-role scope check**

If client users can hit `/aplus2/<otherClient>/...`, add this at the top of each page server-side render (or in a layout). Since these pages are `"use client"`, do the check in a server component layout instead:

Create `src/app/aplus2/[clientIdCode]/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";

export default async function Aplus2ClientScopeLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientIdCode: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;
  if (session.user.role === "client" && session.user.clientIdCode !== clientIdCode) {
    redirect("/aplus2");
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add "src/app/aplus2/[clientIdCode]/layout.tsx" $(if git diff --name-only | grep -q 'src/proxy.ts'; then echo "src/proxy.ts"; fi) && git commit -m "$(cat <<'EOF'
feat(aplus2): client-role scope guard on /aplus2/[clientIdCode]/*

Server layout redirects client users who try to access another client's
A+2 pages. Editor/admin/viewer roles unaffected.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.3: Nav entries — add "A+ Content (v2)" + label `/aplus` as "Legacy"

**Files:**
- Modify: whichever component renders the design subsection links (likely `src/components/layout/sidebar*.tsx` — find with grep).

- [ ] **Step 1: Find the nav source**

```bash
grep -rln "brandstory\|brand-story\|aplus" /Users/manu/1o8Hub/src/components/layout/ /Users/manu/1o8Hub/src/components/sidebar*/ 2>/dev/null | head -10
```

Identify the file(s) that list the Design subsection links. Add a new entry for `aplus2` pointing at `/aplus2` with label "A+ Content (v2)". Update the existing `/aplus` entry's label to `"A+ Content (Legacy)"`.

- [ ] **Step 2: Verify in browser**

Reload. The sidebar's Design section now shows both "A+ Content (Legacy)" and "A+ Content (v2)".

- [ ] **Step 3: Commit**

```bash
cd /Users/manu/1o8Hub && git add <the modified nav files> && git commit -m "$(cat <<'EOF'
feat(aplus2): nav entries — "A+ Content (v2)" + "Legacy" on /aplus

Side-by-side surfacing in the Design section. Existing /aplus link is
re-labeled so users know it's the older flow.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.4: Phase 6 validation

**Files:** no code.

- [ ] **Step 1: Log in as an editor — confirm both /aplus and /aplus2 visible in nav.**
- [ ] **Step 2: Log in as a client user — confirm /aplus2 nav entry only renders pages scoped to that user's client.** Visiting `/aplus2/<other>` redirects to `/aplus2`.
- [ ] **Step 3: Build + lint:** `npm run build && npm run lint`.

End of Phase 6. A+2 is feature-complete per the spec's acceptance criteria.

---

# Self-Review Checklist (run before declaring the feature complete)

After implementing every phase, walk through this list. If anything fails, fix inline.

## 1. Spec coverage

Acceptance criteria from `docs/superpowers/specs/2026-05-29-aplus2-per-version-editor-design.md` §14:

- [ ] (1) Nav shows "A+ Content (v2)" — Phase 6 Task 6.3.
- [ ] (2) `/aplus2` shows client list, click navigates to `/aplus2/[client]` — Phase 3 Tasks 3.1, 3.2.
- [ ] (3) New-set dialog creates set + V01 + Drive folder — Phase 3 Task 3.2 + Phase 2 Task 2.2.
- [ ] (4) Every module type renders with correct fields — Phase 4 Task 4.5 + Phase 4 Task 4.6 validation.
- [ ] (5) Text fields with counters, image uploads with dimension hints, video uploads, repeatable items — Phase 4 Tasks 4.2, 4.3, 4.4, 4.5.
- [ ] (6) Drag-reorder + "Save reorder" renames Drive files — Phase 5 Task 5.2 + Phase 2 Task 2.9.
- [ ] (7) Module status + version status independent — Phase 2 Tasks 2.6, 2.8 + Phase 4 Task 4.5.
- [ ] (8) Copy-to-new-version clones modules + items (no assets) — Phase 2 Task 2.5 + Phase 3 Task 3.3.
- [ ] (9) Delete module removes DB rows + trashes Drive files — Phase 2 Task 2.8.
- [ ] (10) Delete version removes everything + Drive subfolder — Phase 2 Task 2.6.
- [ ] (11) Delete set removes all versions + subfolders — Phase 2 Task 2.3.
- [ ] (12) Client role read-only scoped to own client — Phase 6 Task 6.2.
- [ ] (13) `/aplus` still works (untouched) — never modified through the plan.

## 2. Drift / placeholder scan

- [ ] No "TODO" or "implement later" comments in any new file.
- [ ] Every char limit referenced in module-specs.ts matches the source `aplus-module-specs.ts`.
- [ ] Every Zod default value matches the spec section 5 discriminated union.
- [ ] All commit messages use the EXACT trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

## 3. Type / API consistency

- [ ] `aplus2VersionSlug` is the only place that builds the folder name; no other file hand-rolls the slug.
- [ ] `aplus2AssetFilename` is the only place that builds the filename; the reorder endpoint and the upload endpoint both use it.
- [ ] `validateModulePatch` and `validateItemData` are the only validators for those payloads; no inline Zod in routes.
- [ ] `APLUS2_MODULE_SPECS` is the only source of char limits and dimension hints; the UI never hardcodes a number.

## 4. Working-tree hygiene

- [ ] `git status --short` shows only files this plan created/modified. The ~46 drift files in the primer are untouched.
- [ ] No `git add .` or `git add -A` was used.
- [ ] No `git push` happened without explicit user confirmation.

## 5. DB hygiene

- [ ] `pg_dump` snapshot exists in `.backups/pre-0068-aplus2-*.sql`.
- [ ] `aplus2_*` tables exist and the partial unique indexes are present (`\d aplus2_assets` shows them).
- [ ] No orphan rows: `SELECT COUNT(*) FROM aplus2_modules WHERE version_id NOT IN (SELECT id FROM aplus2_versions)` returns 0.

---

# Execution handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Spawn via `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session via `superpowers:executing-plans` with checkpoint reviews after each phase.

**Recommend approach: Subagent-Driven.** Each task is self-contained with explicit file paths, code, and verification steps — ideal for fresh-context subagent execution. After each phase commits, this session can review the diff before the next phase starts.



