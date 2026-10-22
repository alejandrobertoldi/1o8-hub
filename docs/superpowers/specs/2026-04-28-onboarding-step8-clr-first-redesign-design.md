# Onboarding Step 8 — CLR-First Catalog Import Redesign

Date: 2026-04-28
Supersedes (in part): `2026-04-28-onboarding-step8-aia-import-design.md` (the original ALR-driven flow)
Supersedes: `2026-04-28-alr-import-status-filter-design.md` (the status filter still exists but moves; see below)

## Problem

The current step 8 flow imports products into `master` from the ALR alone. The ALR carries minimal attributes (sku, asin, item-name, price, status) but has no per-SKU attribute values. As a result, AIA clients onboarded so far have products in `master` with most attribute fields empty.

The CLR (Amazon Category Listing Report, `.xlsm`) carries the *full* set of per-SKU attribute values across every category the client sells in — except it does not contain ASIN. The ALR is the only source of SKU↔ASIN linkage.

Today's substeps misuse both reports:
- 8.2 ALR import writes products to `master` from the attribute-poor ALR.
- 8.3 CLR upload only registers schema (which fields exist per product type) into `category_definitions`. It never reads the per-SKU values.

The existing master rows for AIA clients onboarded under the old flow are partially broken (attribute columns mostly null).

## Solution

Reorder and re-purpose the two substeps so the CLR drives attributes and the ALR contributes only the ASIN linkage.

### New flow

| Substep | Was | Becomes |
|---|---|---|
| 8.2 | Import Product Catalog (ALR) | **Import Product Attributes (CLR)** |
| 8.3 | Import Attribute Templates (CLR) | **Link SKU ↔ ASIN (ALR) and merge to master** |

### 8.2 — CLR import (new behavior)

- Single `.xlsm` upload. The file may contain multiple categories (multiple sheets or a category column).
- Parse every product row across every category sheet. Each row = one SKU with all attribute values populated.
- Continue to register schemas in `category_definitions` (existing behavior of `/api/category-definitions` is preserved as a side effect of parsing).
- Stage the per-SKU rows in a new table `staged_clr_products`:
  ```
  client_id_code  text
  sku             text         -- primary join key
  product_type    text         -- category from the sheet
  attributes      jsonb        -- all attribute key→value pairs from the row
  required_complete  boolean   -- false if any required attribute is blank
  uploaded_at     timestamptz
  PRIMARY KEY (client_id_code, sku)
  ```
- Preview UI:
  - "12 product types parsed, 287 SKUs, 14 with missing required attributes."
  - Per-product-type breakdown (collapsible).
  - Confirm button writes to `staged_clr_products` (replaces any prior staged rows for the client).

### 8.3 — ALR link + merge to master

Two-phase UI in one card.

**Phase A — ALR upload**

- Single `.txt`/`.tsv` upload (existing parser is reused, simplified to extract only `sku`, `asin1`, `status`).
- Stage in `staged_alr_links`:
  ```
  client_id_code  text
  sku             text
  asin            text
  status          text         -- "Active" | "Inactive" | "Incomplete" | other
  uploaded_at     timestamptz
  PRIMARY KEY (client_id_code, sku)
  ```
- Preview shows: total ALR rows, status breakdown, **and the join report** computed against `staged_clr_products`:
  - matched (in both): N
  - CLR-only (no ASIN): M (will be skipped)
  - ALR-only (no attributes): K (will be skipped)
- Confirm button writes to `staged_alr_links` (replaces prior staged rows for the client).

**Phase B — Merge to master**

- Visible only when both `staged_clr_products` and `staged_alr_links` exist for this client.
- Status checkboxes (the filter we just built — moved here): Active / Inactive / Incomplete. Default: Active only.
  Status comes from `staged_alr_links.status`.
- Live tally: "Will write N products to master (X Active, Y Inactive, Z Incomplete after filter)."
- Default merge rule: only SKUs present in both staging tables AND whose ALR status is selected.
- "Merge to master" button:
  1. Wipe existing `master` rows for `client_id_code` (per Q4 = option a).
  2. Insert one row per matched SKU: `sku`, `asin` from ALR, `status` from ALR, attributes JSONB from CLR mapped to the master schema columns (existing CLR→master mapper is reused; remaining unmapped attributes go to `raw_column_values`).
  3. Drop the two staging tables' rows for this client on success (cleanup).
  4. Mark substep complete.

### What happens to the work just shipped

Already in working tree on `main` (uncommitted, in [src/components/onboarding/](src/components/onboarding/)):
- `alr-status-filter.ts` + tests → keep, reuse in 8.3 Phase B.
- `aia-catalog-import.tsx` checkbox UI → relocate to 8.3 Phase B; the existing component is gutted because 8.2 is now CLR.

### Default behaviors confirmed with user

1. Single CLR file with multiple categories inside (not multi-file).
2. CLR is the complete attribute source of truth except for ASIN.
3. ALR is solely a SKU→ASIN link.
4. **Existing master rows for the client are wiped and rebuilt** from CLR+ALR on merge (option a).
5. Inferred (state to user before implementation): SKUs that aren't in *both* staging tables are excluded from master by default. No toggle to relax this — keep the rule simple unless the operator hits a real case.

## Out of scope

- Multi-file CLR uploads.
- Persistent per-SKU staging history (staging is wiped on successful merge).
- Differential / incremental merge (we wipe-and-rebuild master per onboarding).
- Re-running 8.3 without re-running 8.2 (operator must re-upload CLR if the staged rows have been wiped).
- ASINless products (CLR-only SKUs).

## Implementation outline

This is a multi-file, multi-day change. Recommend executing in a worktree with a dedicated branch, e.g. `feat/onboarding-step8-clr-first`.

1. **Schema migration** — add `staged_clr_products` and `staged_alr_links`. Hand-write the SQL because drizzle-kit hangs on Supabase pooler when snapshot drifts (per primer.md).
2. **Backend**
   - New `/api/onboarding/clr-import` (preview + execute, replaces the schema-only behavior of `/api/category-definitions` for this onboarding context — keep the existing route for non-onboarding uses).
   - Refactor `/api/onboarding/aia-import-catalog` into `/api/onboarding/alr-link` (preview + execute, stages SKU↔ASIN only).
   - New `/api/onboarding/merge-master` (computes join report + executes the wipe-and-rebuild merge).
3. **Frontend**
   - New `<ClrAttributeImport>` component for 8.2 preview/execute.
   - Rework `<AiaCatalogImport>` → `<AlrLinkAndMerge>` for 8.3 (Phase A + Phase B with status checkboxes).
   - Wire both into [src/app/clients/[clientIdCode]/onboarding/page.tsx](src/app/clients/[clientIdCode]/onboarding/page.tsx) at the existing step-key branches; update step labels in [src/lib/onboarding/steps.ts](src/lib/onboarding/steps.ts).
4. **Tests**
   - CLR XLSX parser unit tests (multi-sheet, required-field detection).
   - ALR parser tests already exist; trim down to the link-only path.
   - Merge-engine unit tests with fixtures: matched / CLR-only / ALR-only / status-filtered.
   - Component tests for the join-report UI.
5. **Manual verification** — run the full flow against a real client with the actual CLR + ALR pair.

## Validation criteria

- Uploading a CLR with N product types and M total SKUs creates M rows in `staged_clr_products` and registers N rows in `category_definitions` (or updates).
- Uploading an ALR creates rows in `staged_alr_links`; the join report shows correct matched/CLR-only/ALR-only counts.
- Status checkboxes reduce the "will write to master" count live.
- Clicking "Merge to master" wipes all prior rows for the client_id_code, inserts only matched SKUs whose status passes the filter, and populates attributes from the CLR JSONB into the proper master columns + `raw_column_values`.
- Re-running with a different status selection produces the expected delta.
- Re-running 8.2 alone replaces staged CLR rows without affecting master.
