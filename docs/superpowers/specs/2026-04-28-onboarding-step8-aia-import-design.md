# Onboarding Step 8 — AIA Catalog & Attribute Import

**Status:** Draft (brainstorm complete, awaiting user review)
**Date:** 2026-04-28
**Branch target:** new branch off `main` (e.g. `feat/onboarding-aia-import`)

## Goal

Add two new sub-steps to onboarding step 8, visible **only when `client.clientType === "AIA"`**:

- **8.2 Import Product Catalog (ALR)** — upload an Amazon All Listings Report (TSV), import every listing into `master`, surface a confirmation dialog for products that already exist on the hub from a prior manual addition.
- **8.3 Import Attribute Templates (CLR)** — wrap the existing CLR upload backend ([/api/category-definitions](../../src/app/api/category-definitions/route.ts)) in an onboarding-step shell so it's discoverable as part of step 8 and re-runnable later when attributes change.

Step 8 today: **8.0 Request Amazon Access** + **8.1 Provide Team Access**. After this change for AIA clients only: **8.0**, **8.1**, **8.2**, **8.3**.

## Decisions (locked in brainstorm)

| # | Question | Choice |
|---|---|---|
| 1 | Duplicate match key | ASIN + SKU + marketplace strict; fall back to ASIN-only when the existing master row has no SKU. Catches partial manual entries. |
| 2 | Roster source | ALR is the roster; CLR enriches attribute *schema* (not row data). Every ALR row becomes a `master` row. |
| 3 | Dialog UX for duplicates | Hybrid: global default at top (`Skip` / `Overwrite` / `Merge`, default `Merge`), expandable list with per-row override. |
| 4 | Architecture | Two sequential AIA-only substeps (Approach 2). Each independently re-runnable. CLR backend reused as-is. |

## ALR file structure (confirmed from sample)

Tab-separated, first row is header. Key columns:

| Column | Master mapping |
|---|---|
| `seller-sku` | `master.sku` |
| `asin1` | `master.asin` |
| `item-name` | `master.title` |
| `item-description` | `master.description` (raw blob) |
| `price` | `master.price` |
| `quantity` | `master.quantity` |
| `fulfillment-channel` (`AMAZON_NA` = FBA, `DEFAULT` = FBM) | `master.fulfillmentChannel` |
| `status` (`Active` / `Inactive` / `Incomplete`) | `master.status` |
| `listing-id` | raw blob only |
| `open-date` | `master.openDate` |
| `image-url` | `master.imageUrl` |

**Marketplace:** ALR has no marketplace column. Default to `"US"`. (Fulfillment channel `AMAZON_NA` confirms US locale.) For non-US AIA clients later, expose a marketplace dropdown in the upload UI.

**Status filter:** import every row (Active + Inactive + Incomplete). `Incomplete` rows are parent variations with placeholder SKUs (`APOLLO-HAT`, `STRUCTUREDVISOR`, etc.) — they're real catalog entries used for variation grouping.

## 8.2 — Import Product Catalog (ALR)

### UI

- New onboarding sub-step card, visible only when `client.clientType === "AIA"`.
- Drag-and-drop zone accepting `.txt` / `.tsv` files.
- After parse: summary card → "ALR contains 312 listings (185 Active, 47 Inactive, 80 Incomplete). 23 of these already exist in 1o8Hub."
- "Review duplicates →" button opens the confirmation dialog.

### Confirmation dialog (duplicate handling)

- Header: global action selector — `Merge fields (default)` / `Overwrite all` / `Skip duplicates`.
- Below: collapsed accordion *"23 existing products — review individually"*.
- Expanded list: one row per duplicate showing SKU, ASIN, current title (from master), incoming title (from ALR), per-row override dropdown (`Use global` / `Skip` / `Overwrite` / `Merge`).
- Footer: "Import 312 listings (Y new + Z updated)" primary action.

### Match algorithm

For each ALR row with `clientIdCode = currentClient`:

1. Strict match: `WHERE asin = :asin1 AND sku = :sellerSku AND marketplace = "US" AND clientIdCode = :code`
2. If no strict hit, fallback: `WHERE asin = :asin1 AND (sku IS NULL OR sku = '') AND clientIdCode = :code`
3. If either matches → flag as duplicate.
4. Else → insert as new row.

### Conflict modes (existing semantics from [/api/import/execute](../../src/app/api/import/execute/route.ts))

- **Skip** — leave master row untouched.
- **Overwrite** — replace all mapped fields, set `isDirty = true`.
- **Merge** — only fill master fields that are currently empty; preserve manual edits.

### Backend

- New endpoint: `POST /api/onboarding/aia-import-catalog` (multipart: file + clientIdCode + dialogConfig).
- Parser: new lib `src/lib/alr-parser.ts` — tab-delimited, header row, returns typed `AlrRow[]`.
- Two-phase API:
  - **Phase 1** (`?phase=preview`): parse + run match algorithm + return `{ totalRows, newCount, duplicates: [{ rowIndex, sku, asin, masterTitle, incomingTitle }] }`.
  - **Phase 2** (`?phase=execute`): receives parsed rows + per-row decisions, writes to master, returns `{ inserted, updated, skipped, failed, errors }`.
- Auth: editor or admin only (mirrors existing CLR endpoint).

### Gantt integration

Add to `STEP_TO_GANTT` in [src/lib/onboarding/steps.ts](../../src/lib/onboarding/steps.ts):

```ts
amazon_import_catalog: { taskName: "Amazon Access", subtaskTitle: "Import Product Catalog" },
```

## 8.3 — Import Attribute Templates (CLR)

### UI

- Onboarding sub-step card, AIA-only.
- Reuses existing [`<CategoryUpload>`](../../src/components/products/category-upload.tsx).
- After upload, displays toast + summary: "Uploaded GLOVES: 247 attributes parsed, 18 matched to Hub."

### Backend

No backend changes — calls existing [POST /api/category-definitions](../../src/app/api/category-definitions/route.ts) unchanged.

### Re-run path

Existing standalone CLR upload at [/admin/attributes](../../src/app/admin/attributes/page.tsx) stays as-is for ad-hoc re-runs without going through onboarding.

### Gantt integration

```ts
amazon_import_attributes: { taskName: "Amazon Access", subtaskTitle: "Import Attribute Templates" },
```

## Step definitions diff

In [src/lib/onboarding/steps.ts](../../src/lib/onboarding/steps.ts), add to `ONBOARDING_STEPS`:

```ts
{
  key: "amazon_import_catalog",
  label: "Import Product Catalog (ALR)",
  description: "Upload Amazon All Listings Report to import client products into 1o8Hub. AIA clients only.",
  order: 8.2,
  parent: "amazon_access",
  clientTypeFilter: "AIA",  // NEW field — see schema change below
},
{
  key: "amazon_import_attributes",
  label: "Import Attribute Templates (CLR)",
  description: "Upload Amazon Category Listing Report(s) to register attribute schemas for the client's product types. AIA clients only.",
  order: 8.3,
  parent: "amazon_access",
  clientTypeFilter: "AIA",
},
```

### New field on `OnboardingStepDef`

```ts
/** If set, only show when client.clientType matches (e.g. "AIA") */
clientTypeFilter?: "AIA" | "NTA";
```

The onboarding renderer (currently filters by `marketplaceFilter`) needs an analogous filter pass on `clientTypeFilter`.

## Out of scope

- Multi-marketplace ALR (will require a marketplace dropdown later — not needed for first AIA cohort).
- CLR data-row extraction (filling master attribute *values* per SKU). Today CLR upload only handles attribute schema. If we later want bulk-populate fields like material/dimensions per SKU from CLR, that's a separate spec.
- Auto-trigger of 8.3 from 8.2. Operator drives each substep manually.
- Background job / async progress UI. ALR sample is ~300 rows; sync request inside Vercel function timeout is fine. If we hit larger catalogs, we'll move to a job queue in a follow-up.

## Testing

- Unit: `alr-parser.ts` parsing fixtures (full file, missing columns, blank ASIN edge case, parent variations).
- Unit: match algorithm — strict hit, ASIN-only fallback, no match.
- Unit: merge logic preserves manual edits, overwrite replaces all.
- Route: `/api/onboarding/aia-import-catalog` preview phase + execute phase + 403 for non-editor.
- E2E (manual on dev): walk an AIA client through 8.2 + 8.3, confirm dialog appears for pre-existing manual rows, master rows updated correctly.

## Files touched (estimate)

New:
- `src/lib/alr-parser.ts`
- `src/app/api/onboarding/aia-import-catalog/route.ts`
- `src/components/onboarding/aia-catalog-import.tsx` (UI + duplicate dialog)
- `src/lib/alr-parser.test.ts`

Modified:
- `src/lib/onboarding/steps.ts` (2 step entries + `clientTypeFilter` field + 2 Gantt mappings)
- `src/app/clients/[clientIdCode]/onboarding/page.tsx` (render new substeps with `clientTypeFilter` gate)

Estimated total: ~600–800 LOC including tests. Single fresh session should fit; consider worktree isolation.

## Resume prompt for fresh session

```
Resume Onboarding Step 8 AIA import on a fresh branch off main.

Spec: docs/superpowers/specs/2026-04-28-onboarding-step8-aia-import-design.md

Status: brainstorm complete, spec written and committed. Awaiting user
review of the spec before writing the implementation plan.

Next steps:
1. Re-read the spec end-to-end. Verify decisions match what's documented.
2. Ask user if any spec changes needed; if not, invoke
   superpowers:writing-plans to create the implementation plan.
3. Plan target: 4 tasks (ALR parser + tests, API route preview/execute,
   UI step + dup dialog, steps.ts wiring + clientTypeFilter renderer
   update). TDD throughout.
```
