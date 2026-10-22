# NTA Listing-Intake Sheet — Design

**Status:** Spec draft for review
**Date:** 2026-05-13
**Owner:** Manu
**Related specs:**
- `docs/superpowers/specs/2026-04-20-google-sheets-attribute-template-design.md` (existing template-requests pipeline)
- `docs/superpowers/specs/2026-04-28-onboarding-step8-clr-first-redesign-design.md` (CLR onboarding flow)
- `docs/superpowers/specs/2026-05-01-attributes-table-unification-design.md` (`attributes` table + `isEssential`)

---

## 1. Problem

NTA (New-to-Amazon) clients arrive without any live products on Amazon. After they register a seller account, the agency downloads a **blank Category Listing Report (.xlsm)** from Amazon for the relevant category and uploads it via the existing CLR-import flow at step 8.2. That populates `category_definitions` with the category schema but produces zero rows in `master`.

The agency then needs to:

1. **Bootstrap new listings** — share a Google Sheet with the client containing only the **minimum + necessary** attributes (Amazon-required + Hub-essential). The client fills in product data; the agency imports it as net-new `master` rows.
2. **Revise specific attributes** on existing products — same Sheet mechanism, smaller scope, ASIN-keyed UPDATE rather than INSERT.

The existing `attribute_template_requests` pipeline covers (2) for ASIN-keyed UPDATE but does not:

- Define or surface a Hub-curated "minimum + necessary" filter.
- INSERT new `master` rows when the sheet contains brand-new SKUs with no ASIN.

This spec extends that pipeline to cover both gaps.

## 2. Definitions

**Minimum + Necessary attributes** for a `(clientIdCode, productType, marketplaceId)` triple:

> `(attributes.categoryMeta[marketplace][productType].requirement === "Required")`
> `∪ (attributes.categoryMeta[marketplace][productType].requirement === "Conditionally Required")`
> `∪ (attributes.isEssential === true)`

Identity columns (`SKU`, `ASIN`, `ItemName`, `ProductType`) are always included regardless of flags.

**Hub editors maintain `attributes.isEssential` globally** (one boolean per attribute, already present at `src/lib/db/schema.ts:280`). Per-category Hub curation is **out of scope** for this spec — `isEssential` is a single global flag and applies to every NTA category. Per-category curation can be revisited later via `categoryMeta[*][*].isKey`, which already exists.

**Identity resolution priority** when importing a Sheet row into `master`:

1. If `row.ASIN` is non-empty AND matches an existing `master.asin` for `clientIdCode` → **UPDATE**.
2. Else if `row.SKU` is non-empty AND matches an existing `master.sku` for `clientIdCode` → **UPDATE** (back-fill `asin` from row if newly provided).
3. Else if `row.SKU` is non-empty → **INSERT** new `master` row.
4. Else → reject the row with a validation error.

## 3. Architecture (reuse-heavy)

```
NTA onboarding (8.4) ──┐
                       ├─► POST /api/attributes/template-requests
TemplateDialog preset ─┘    (existing endpoint, extended levels=["Essential"])
                              │
                              ├─► getMinimumNecessaryAttributes()  ◄── NEW helper
                              ├─► buildTemplateSheets()            ◄── existing
                              ├─► driveClient.copyFile() to InProgress
                              ├─► sheetsClient.batchUpdate()
                              └─► INSERT attribute_template_requests row

                       Client fills in Sheet (anyone-link editor)

Agent clicks "Mark imported" / "Finalize"
                              │
                              └─► PATCH /api/attributes/template-requests/[id]/finalize
                                    │
                                    ├─► read sheet values
                                    ├─► resolve identity per row (ASIN → SKU → INSERT)
                                    ├─► UPDATE branch: existing three-way diff       ◄── existing
                                    └─► INSERT branch: NEW                           ◄── NEW
```

No new tables. No new master template. No new Apps Script. The `levels` column on `attribute_template_requests` is already `text[]`, so adding the string `"Essential"` requires no migration.

## 4. Components

### 4.1 New: `getMinimumNecessaryAttributes()`

**Location:** `src/lib/category-meta-queries.ts` (sibling to existing `getAttributesForCategory`).

**Signature:**
```ts
export async function getMinimumNecessaryAttributes(
  marketplaceId: string,
  productType: string,
): Promise<AttributeCategoryRow[]>
```

**Behavior:**
- Loads all attributes via existing `getAttributesForCategory(marketplaceId, productType)`.
- Filters down to: `requirement in ("Required", "Conditionally Required") OR isEssential = true`.
- Orders results: Required bucket → Conditionally Required bucket → Essential-only bucket. Within each bucket, alphabetical by `generalLabel`.
- Always prepends identity attributes (`SKU`, `ASIN`, `ItemName`, `ProductType`) in that order, regardless of flags. If any are missing from the attributes table the function logs a warning and skips them.

### 4.2 Extended: filter in `buildTemplateSheets()`

**Location:** `src/app/api/attributes/template-requests/route.ts:265-269`.

Current:
```ts
const filtered = attrs.filter((a) => {
  if (a.requirement && levels.includes(a.requirement)) return true;
  if (levels.includes("Key") && a.isKey) return true;
  return false;
});
```

Extended (add one line):
```ts
const filtered = attrs.filter((a) => {
  if (a.requirement && levels.includes(a.requirement)) return true;
  if (levels.includes("Key") && a.isKey) return true;
  if (levels.includes("Essential") && a.isEssential) return true;   // NEW
  return false;
});
```

The matching change is mirrored in `finalize/route.ts` where the same filter is applied to compute which fields to import.

### 4.3 Extended: finalize endpoint — INSERT branch

**Location:** `src/app/api/attributes/template-requests/[id]/finalize/route.ts`.

Current behavior keyed on `asin`; rows with no ASIN match are silently dropped from `asinToProductId`.

New behavior per row:
1. Build `rowIdentity = { sku: row.SKU?.trim(), asin: row.ASIN?.trim() || null }`.
2. Look up existing master row via `findExistingMasterRow(clientIdCode, rowIdentity)`:
   - First: `eq(master.clientIdCode, X) AND eq(master.asin, rowIdentity.asin)` (when asin is non-null).
   - Else: `eq(master.clientIdCode, X) AND eq(master.sku, rowIdentity.sku)` (when sku is non-empty).
3. If found → UPDATE path (existing three-way diff applies, with `asin` back-filled from the row if previously null).
4. If not found AND `rowIdentity.sku` is non-empty → INSERT path:
   - Construct a new `master` row: `clientIdCode`, `sku`, `asin` (nullable), `productType` from the tab title, plus every filtered attribute mapped through the inverse of `getProductFieldValue` (a new `setProductFieldValue` helper in `src/lib/product-mapper.ts`, or a JSONB merge into `productAttributes`/`otherAttributes` based on the attribute's storage class).
   - `id` defaults via `defaultRandom()` on the existing `master.id` UUID column.
   - INSERT rows skip the three-way diff (no baseline exists; client value is authoritative).
5. If not found AND `rowIdentity.sku` is empty → push to `errors[]`, do not import.

**Validation gate (before any DB write):**
- SKUs within the sheet must be unique. Duplicates → reject the entire submission with row-level error report.
- For INSERT rows, the `(clientIdCode, sku)` pair must not already exist (covered by step 2 — if it exists, that row routes to UPDATE).
- All Amazon-`Required` columns must be non-empty for INSERT rows. Conditionally Required and Essential are warnings, not blockers.

**Response shape:** existing diff response gains a new `inserted: Array<{ sku, productType }>` field listing the brand-new master rows.

### 4.4 New: `setProductFieldValue()` helper

**Location:** `src/lib/product-mapper.ts` (sibling to existing `getProductFieldValue`).

**Signature:**
```ts
export function setProductFieldValue(
  product: Partial<NewMaster>,
  generalLabel: string,
  value: string | null,
): Partial<NewMaster>
```

**Behavior:** the inverse of `getProductFieldValue`. Routes the value into the correct field on `master` based on whether it's a core column, a categorized JSONB bucket (`productAttributes` / `otherAttributes`), or `rawColumnValues`. Returns the mutated product object so callers can chain.

### 4.5 UI A — `TemplateDialog` preset button

**Location:** `src/components/attributes/template-dialog.tsx`.

Changes:
- Add `{ value: "Essential", label: "Essential (Hub)" }` to `LEVEL_OPTIONS`.
- Add a `<Button>` above the level checkboxes:
  > **Minimum + Necessary** (one-click preset — sets `scope=new`, `levels=[Required, Conditionally Required, Essential]`).
- Clicking the preset overwrites the current `levels` state and `scope` state; user can still tweak afterwards.
- Optional: pre-select this preset automatically when `defaultClient` is an NTA client (read from the client list query).

### 4.6 UI B — Onboarding step 8.4

**Schema changes (onboarding step registry):** `src/lib/onboarding/steps.ts`.

Add:
```ts
{
  key: "generate_listing_sheet",
  label: "Generate Listings Sheet",
  description: "Create a Google Sheet with minimum + necessary attributes for the client to fill in. Imported back as new master listings.",
  order: 8.4,
  parent: "amazon_access",
  clientTypeFilter: "NTA",
}
```

Plus an entry in `STEP_TO_GANTT`:
```ts
generate_listing_sheet: { taskName: "Amazon Access", subtaskTitle: "Generate Listings Sheet" }
```

**UI:** `src/app/clients/[clientIdCode]/onboarding/page.tsx` (or its current sub-component for step 8). For step `generate_listing_sheet` render a card with:
- A single button **"Generate Listings Sheet (Minimum + Necessary)"** — disabled if step 8.2 (CLR upload) is incomplete OR `category_definitions` is empty for this client.
- After Sheet creation, render:
  - Link to the Sheet (opens in new tab).
  - Copy-link button.
  - Status badge (`in_progress` / `finalized`).
  - **"Mark Imported"** button — calls the finalize endpoint and on success completes the onboarding step.
- Read state by querying `attribute_template_requests where clientIdCode=X AND scope="new" AND levels @> ["Essential"]` (most recent).

### 4.7 Shared backend — no fork

Both UI entry points POST to the **same** `/api/attributes/template-requests` endpoint with identical bodies. The onboarding step has a fixed body (`scope=new`, `productType=all`, `levels=["Required","Conditionally Required","Essential"]`). The dialog lets the editor override anything. There is one backend, one set of tests, one ApiClient.

## 5. Data flow

```
Hub editor uploads blank CLR (step 8.2)
   ▼
category_definitions rows created for each productType
   ▼
Hub editor / AM clicks "Generate Listings Sheet" (step 8.4)
   ▼
POST /api/attributes/template-requests { scope:"new", levels:["Required","Conditionally Required","Essential"], productType:"all" }
   ▼
For each category_definition:
   ├─ getMinimumNecessaryAttributes(marketplaceId, productType)
   ├─ Pre-seed 10 empty product rows
   └─ Build sheet tab
   ▼
driveClient.copyFile(master_template) → InProgress folder
sheetsClient.batchUpdate(buildCreateRequests(config))
   ▼
attribute_template_requests row inserted (status=in_progress)
   ▼
Sheet URL surfaced in UI (onboarding step card + Attributes page list)
   ▼
Client fills sheet (anyone-link editor access)
   ▼
Hub editor clicks "Mark Imported"
   ▼
PATCH /api/attributes/template-requests/[id]/finalize
   ├─ Read sheet values via sheetsClient.getValues
   ├─ For each row: resolve identity → UPDATE | INSERT | reject
   ├─ Run validation gate (SKU uniqueness, Required completeness)
   ├─ Apply diffs / inserts to master in a single transaction
   ├─ Move sheet from InProgress → Archive
   └─ attribute_template_requests.status = finalized
   ▼
Onboarding step 8.4 marked complete
```

## 6. Error handling

- **Sheet creation** — existing error pathways (missing `GCP_CLIENT_EMAIL`, missing `ATTRIBUTE_TEMPLATE_MASTER_ID`, missing Drive folder, no `category_definitions`) all kept as-is.
- **Empty SKU on import** — row rejected; error returned to UI; entire submission still proceeds for valid rows. Editor sees a per-row report.
- **Duplicate SKU within sheet** — entire submission rejected; nothing written.
- **SKU collision across rows in master** — handled in step 2 of resolution (it routes to UPDATE, not INSERT).
- **Required column blank on INSERT row** — row rejected with field-level error.
- **All other validation failures (data type, valid-value set)** — match existing CLR import behavior: best-effort write with warnings.

## 7. Testing

**Unit (Vitest):**
- `getMinimumNecessaryAttributes`:
  - returns empty when no category schema exists.
  - includes Required-only attribute.
  - includes Conditionally-Required-only attribute.
  - includes isEssential-only attribute (no requirement set).
  - de-duplicates an attribute that is both Required and isEssential.
  - always prepends SKU/ASIN/ItemName/ProductType in order.
  - excludes Recommended/Optional/Not-Required/Preferred attributes that lack `isEssential`.
- `setProductFieldValue`:
  - round-trips with `getProductFieldValue` for core columns, JSONB bucket columns, and rawColumnValues.
- Identity resolver helper:
  - ASIN match → returns existing row.
  - SKU match within same client → returns existing row.
  - No match → returns null (caller routes to INSERT).
  - SKU match in DIFFERENT client → returns null (cross-client isolation).

**Integration (Vitest with real DB, per existing convention):**
- POST `/api/attributes/template-requests` with NTA-bootstrap body produces a Sheet with the expected columns and the `attribute_template_requests` row carries `levels: ["Required","Conditionally Required","Essential"]`.
- PATCH `/finalize` with a mixed sheet (existing ASIN row, existing SKU row, brand-new SKU row, no-key row) yields exactly one UPDATE, one UPDATE+ASIN-backfill, one INSERT, one rejection.
- Onboarding step 8.4 completion gate: button disabled until 8.2 complete; button enabled after CLR upload; click → row created → step marked.

## 8. Out of scope

- Multi-marketplace listings in a single Sheet (NTA is single-marketplace at onboarding time).
- Image / variation theme assignment from the Sheet (handled later in `/variations`).
- Automatic publish to Amazon (manual via existing `/publish` flow).
- Per-category Hub curation of "essential" (use global `attributes.isEssential` for now; revisit `categoryMeta[*][*].isKey` later if granularity is needed).
- AIA clients (they already have a working flow — CLR populates master directly via merge-master).
- Auto-detection of "NTA-with-no-CLR" — step 8.2 (CLR upload) remains a hard prerequisite for step 8.4.

## 9. Migration / rollout

- No DB migration.
- Deployment is a single Next.js push.
- Backward compatibility: existing `levels` values (`Required`, `Conditionally Required`, `Key`, `Recommended`, `Optional`) keep working untouched. `Essential` is an additive new value.

## 10. Hard rules (carry forward)

- DEV DB IS PROD on Supabase `lmmbeswipsjygogwksol` — no schema changes are safe to assume unless migration is explicit.
- Stage explicit files only — never `git add .` or `-A`.
- Push requires explicit per-push confirmation.
- Commit trailer EXACT: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## 11. Open questions (none blocking)

- Should the onboarding step auto-share the Sheet to the client's contact email (existing flow uses anyone-with-link)? Default: no — agent copies the link manually, matching current template-requests behavior.
- Should INSERT rows trigger Asana subtasks for QC review? Default: no for V1.
