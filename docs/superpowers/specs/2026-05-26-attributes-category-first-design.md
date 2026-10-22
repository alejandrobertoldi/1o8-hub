# Attributes Category-First Redesign

**Date:** 2026-05-26
**Status:** Design — awaiting plan
**Related prior specs:**
- `2026-04-21-attribute-section-rethink-design.md` (earlier client-first iteration)
- `2026-05-01-attributes-table-unification-design.md` (legacy `attributes` table unification)

## Problem

`/admin/attributes` today is **client-first**: one row per `(client × productType × marketplace)`, with attribute definitions duplicated per upload. This made sense when each client was siloed, but now:

- Multiple clients share product types (SAUCE, BABY_PRODUCT, DIETARY_SUPPLEMENT, …) and we want one canonical attribute set per `(product_type × marketplace)` instead of N copies.
- A newly uploaded `attributes_master` Supabase table (1,179 rows, 94 columns) is intended to be the canonical registry but is not wired to anything.
- Re-uploads from new clients silently overwrite or drop attribute differences with no provenance — we don't know which client contributed which fields, or which clients diverge from canonical.

## Goal

Pivot the Attributes section to **category-first**:
- Top-level entity = `(product_type, marketplace_id)` pair
- Inside each: list of clients that use this category + canonical attribute set
- Canonical lives in `attributes_master`; per-client divergences live in a new junction
- Upload pipeline never blindly overwrites canonical — admin curates promotions

## Locked decisions

1. Canonical attributes are DERIVED from uploads, not manually curated (admin curation = post-upload promotion of overrides).
2. Granularity = per `(product_type × marketplace)` — one canonical per pair.
3. Upload flow stays CLR.xlsm. On upload: detect overlap with existing canonical, diff, track per-client provenance, never blindly overwrite.
4. Per-client deltas live in a junction layer, not duplicated schema copies.
5. "Canonical vs raw" — raw = XLSM columns per upload (kept in `category_definitions.baseline_snapshot`); canonical = deduped, marketplace-aware master in `attributes_master`.
6. DEV DB IS PROD. Migrations land via manual SQL files + `scripts/run-migration-XXXX-*.ts` (pattern of 0061).
7. **Conflict resolution = first-wins canonical + per-client deltas.** `attributes_master` rows are immutable after seed via normal uploads; admin can promote a client override to canonical (only mutation path post-seed).

## Current state (verified 2026-05-26)

### `attributes_master` table (NEW, not wired)

1,179 rows, 94 columns, PK on `UUID`, no other indexes, no FKs. Quoted CamelCase column names.

**Column groups:**
1. **Catalog metadata (~18):** `Attributes_HubLabel`, `Attributes_ReferenceGroup`, `Attributes_ReferenceSubgroup`, `Attributes_Description`, `Attributes_CLRLabel`, `Attributes_ALRLabel`, `Attributes_Requirement`, `Attibutes_source` *(typo preserved live)*, `Attributes_format`, `PG_Attributes_Type`, `BQ_Attributes_Type`, `Attributes_ValidValues` (JSON-as-text, keyed by category, currently only `"ALL"`)
2. **UI layout metadata (6):** `Attributes_PDPCardName`, `Attributes_PDPSubcardName`, `Attributes_PDPCardOrder`, `Attributes_PDPSubcardOrder`, `Attributes_ClientSummaryCardName`, `Attributes_ClientSummaryCardOrder`
3. **Table-presence pivot (~80):** one text column per Hub table (`master`, `aac`, …, `variety_pack_items`) + `BQ_Master`, `BQ_AAC`

**Notable quirks:**
- No `product_type` column — category dimension lives only inside `Attributes_ValidValues` JSON.
- Marketplace encoded inside `Attributes_CLRLabel` (e.g., `[marketplace_id=ATVPDKIKX0DER]`), not a separate column.
- No unique constraint on `Attributes_HubLabel` — needed for dedupe matching.
- 80+ table-pivot columns is a normalization candidate — flagged, OUT OF SCOPE for this phase.

### Legacy `attributes` table

Still wired to `/admin/attributes` today. One row per `general_label` (unique), with `category_meta` JSONB keyed by `productType`. Untouched in this phase. Switchover to `attributes_master` happens in a later phase.

### Supporting tables (kept as-is)

- `category_definitions` — per-upload audit row + baseline snapshot of product values at upload
- `clr_unmatched_fields` — audit log of CLR columns that didn't match any attribute on upload
- `staged_clr_products`, `staged_alr_links` — onboarding step 8 staging

## Design

### Data model — additions only

#### New table: `attribute_category_index`

Drives the category-first UI. Answers "what attributes exist for SAUCE/US?"

```sql
CREATE TABLE attribute_category_index (
  product_type     text  NOT NULL,
  marketplace_id   text  NOT NULL,
  attribute_uuid   uuid  NOT NULL REFERENCES attributes_master("UUID") ON DELETE CASCADE,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  first_seen_client_id_code text NOT NULL,
  PRIMARY KEY (product_type, marketplace_id, attribute_uuid)
);
CREATE INDEX idx_aci_attr ON attribute_category_index (attribute_uuid);
CREATE INDEX idx_aci_category ON attribute_category_index (product_type, marketplace_id);
```

#### New table: `attribute_client_provenance`

Tracks which clients use each attribute + per-client divergences.

```sql
CREATE TABLE attribute_client_provenance (
  attribute_uuid    uuid  NOT NULL REFERENCES attributes_master("UUID") ON DELETE CASCADE,
  client_id_code    text  NOT NULL,
  product_type      text  NOT NULL,
  marketplace_id    text  NOT NULL,
  source_upload_id  integer NOT NULL REFERENCES category_definitions(id) ON DELETE CASCADE,
  first_uploaded_at timestamptz NOT NULL DEFAULT now(),
  last_uploaded_at  timestamptz NOT NULL DEFAULT now(),
  -- diverged values (NULL means matches canonical)
  client_requirement  text  NULL,
  client_valid_values jsonb NULL,
  client_description  text  NULL,
  PRIMARY KEY (attribute_uuid, client_id_code, product_type, marketplace_id)
);
CREATE INDEX idx_acp_client ON attribute_client_provenance (client_id_code);
CREATE INDEX idx_acp_category ON attribute_client_provenance (product_type, marketplace_id);
CREATE INDEX idx_acp_diverged ON attribute_client_provenance (attribute_uuid)
  WHERE client_requirement IS NOT NULL OR client_valid_values IS NOT NULL OR client_description IS NOT NULL;
```

#### New index on `attributes_master`

```sql
CREATE UNIQUE INDEX idx_am_hub_label_ci
  ON attributes_master (LOWER("Attributes_HubLabel"))
  WHERE "Attributes_HubLabel" IS NOT NULL;
```

Case-insensitive unique on `Attributes_HubLabel` for upload-time dedupe matching. Partial index excludes the NULL case.

#### Drizzle schema additions

Append to `src/lib/db/schema.ts`:
- `attributesMaster` (pgTable with quoted CamelCase columns — Drizzle supports via the `name` arg)
- `attributeCategoryIndex`
- `attributeClientProvenance`
- Exported types `AttributeMaster`, `NewAttributeMaster`, `AttributeCategoryIndex`, `NewAttributeCategoryIndex`, `AttributeClientProvenance`, `NewAttributeClientProvenance`

### Upload pipeline (CLR.xlsm)

Rewrite `POST /api/category-definitions`:

1. **Parse XLSM** → array of `{ productType, marketplaceId, attributes: [{ hubLabel, clrLabel, requirement, validValues, description }] }`. Existing parser logic preserved.
2. **Create upload audit row** in `category_definitions` (existing behavior).
3. **For each attribute** in the upload:
   - **Match**: lookup in `attributes_master` by `LOWER("Attributes_HubLabel")` = `LOWER(parsed.hubLabel)`.
   - **No match (new canonical attribute):**
     - INSERT into `attributes_master` with parsed values. Fill `Attributes_HubLabel`, `Attributes_CLRLabel`, `Attributes_Requirement`, `Attributes_ValidValues = {"<productType>": <values>}`, `Attributes_Description`, `Attibutes_source = "CLR upload <upload_id>"`. Leave UI layout cols NULL.
     - INSERT into `attribute_category_index` with `first_seen_client_id_code = uploading client`.
     - INSERT into `attribute_client_provenance` with NULL divergence cols (matches canonical because it IS canonical now).
   - **Match found (existing canonical):**
     - UPSERT into `attribute_category_index` (no-op if pair already indexed).
     - UPSERT into `attribute_client_provenance`:
       - If row doesn't exist → INSERT with `first_uploaded_at = now()`.
       - If row exists → UPDATE `last_uploaded_at = now()`, `source_upload_id = current`.
     - **Compute divergences:** compare parsed `requirement`, `validValues`, `description` vs canonical row.
       - If different → set the corresponding `client_*` column on the provenance row.
       - If same → set to NULL (clear any prior divergence).
4. **Log unmatched CLR columns** to `clr_unmatched_fields` (existing behavior, FK → `category_definitions.id`).
5. **No mutation of `attributes_master` for existing rows.** Only inserts.

Idempotent on re-upload. Same client re-uploading: provenance row's `last_uploaded_at` bumps; divergence cols recomputed.

### UI rewrite — `/admin/attributes`

Replace `src/components/admin/category-attributes.tsx` with a category-first component.

**Top-level list** — one row per `(product_type, marketplace_id)`, sorted by client count desc:

```
▸ SAUCE / US                          5 clients · 218 attrs · 12 divergent
▸ BABY_PRODUCT / US                   3 clients · 184 attrs · 4 divergent
▸ DIETARY_SUPPLEMENT / US             2 clients · 312 attrs · 0 divergent
```

Each row data sourced from `GET /api/attributes/categories`: aggregates `attribute_category_index` joined with `attribute_client_provenance`.

**Expanded row** shows two sections:

**Clients in this category** — table with: client name (from `aac`), last upload date (from `category_definitions.uploadedAt`), attribute count (count of provenance rows), divergence count, "View raw upload" link → existing `category_definitions` detail page.

**Canonical attributes** — grouped by `Attributes_ReferenceGroup` → `Attributes_ReferenceSubgroup`. Each attribute row:
- `Attributes_HubLabel`
- Requirement badge (color-coded as today)
- Contributing-client badges (small client-code chips)
- Divergence indicator: `⚠ 2 diverge` if any provenance row has non-NULL `client_*` cols

**Attribute side panel** — click attribute opens a slide-over:
- Full canonical metadata (all 18 catalog columns)
- Per-client diff table: for each provenance row with divergences, show canonical vs client value side-by-side
- Admin-only "Promote to canonical" button per divergence → overwrites the canonical column in `attributes_master`, clears the divergence flag, logs the action

### New API routes

- `GET /api/attributes/categories` — list of `(product_type, marketplace_id)` summaries
- `GET /api/attributes/categories/[productType]/[marketplaceId]` — full detail: client list, canonical attribute groups, divergence counts
- `POST /api/attributes/promote` — admin promote-to-canonical action (body: `{ attribute_uuid, client_id_code, product_type, marketplace_id, field }`)
- Existing `POST /api/category-definitions` — rewritten upload (see Upload pipeline above)
- Existing `GET /api/category-definitions` — left for backward compat with portal; new UI does not use it

### Toolbar in TopNav row 3

Reuse the existing PageMetaSlot pattern. Toolbar = filter by client (filters top-level rows to only those containing the client) + filter by reference group + Upload XLSM dropdown (unchanged).

### Migration story

**Phase A (this spec):**
1. Create the two new junction tables + the `attributes_master` unique index.
2. Wire the new UI + upload pipeline against `attributes_master`.
3. Legacy `attributes` table untouched; legacy `/admin/attributes` behavior preserved behind a feature flag flip or routed deprecation.

**Phase B (out of scope, later):**
- Backfill `attributes_master` from legacy `attributes` rows that don't yet exist in `attributes_master`.
- Migrate downstream consumers (SEO, A+, listings) off legacy `attributes`.
- Drop legacy `attributes` table.

**On upload with no overlap:** all attrs are NEW → INSERTs into all three tables (master + index + provenance with NULL divergences). Canonical grows.

**On upload with partial overlap:** overlapping attrs → no `attributes_master` mutation; `attribute_category_index` UPSERT (no-op if pair exists); `attribute_client_provenance` row with divergence cols populated if metadata differs. Non-overlapping attrs → full INSERT path.

**On upload with full overlap:** zero canonical mutations; only provenance rows touched.

## Testing

- Unit: upload pipeline given (a) all-new attrs, (b) all-overlap matching, (c) all-overlap diverging, (d) mix.
- Unit: promote-to-canonical mutates `attributes_master`, clears divergence, idempotent.
- Integration: re-upload from same client = idempotent (no duplicate rows, `last_uploaded_at` updates).
- UI: render with 0 clients, 1 client, N clients per category; render divergence badges correctly.

## Hard constraints

- DEV DB IS PROD on Supabase. Migrations land via manual SQL + runner script (pattern of `drizzle/migrations/0061_hub_features.sql` + `scripts/run-migration-0061-hub-features.ts`). User explicit per-run approval required for each migration.
- `drizzle-kit db:generate` is broken (snapshot out of sync) — Drizzle schema additions must be hand-written; no `db:generate` run.
- Commit trailer EXACT: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (HEREDOC).
- Stage explicit files only — NEVER `git add .` or `-A`.
- Push needs explicit per-push confirmation. Every push.

## Out of scope

- Normalizing the 80+ table-pivot columns in `attributes_master`.
- Fixing `Attibutes_source` typo (preserved live; can address in a separate rename migration if desired).
- Backfilling `attributes_master` from legacy `attributes` (Phase B).
- Migrating downstream consumers off legacy `attributes` (Phase B).
- Portal-side attribute views (the existing `/portal/attributes` page is not changed).
- Marketplace handling beyond US — schema supports multi-marketplace but UI initially shows US only.
