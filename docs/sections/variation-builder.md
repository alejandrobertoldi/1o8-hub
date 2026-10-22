# Variation Builder

## Overview

The Variation Builder (`/variations`) manages Amazon product variation families — groups of related ASINs that share a single listing (e.g., a T-shirt in multiple sizes and colors). Each variation defines a theme, groups products by dimension, and supports cross-cutting tags.

## Key Concepts

### Variation

A variation (`variations` table) represents one Amazon variation family. Core fields:

| Field              | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `code`             | Unique identifier (e.g., `POO_SC_US_01`). Auto-generated.     |
| `clientId`         | Client this variation belongs to (`client_id_code`).           |
| `primaryDimension` | The main grouping axis (e.g., "Flavor", "Size", "Color").     |
| `themeAttributes`  | Parsed dimensions from the theme (e.g., `["Flavor", "Size"]`).|
| `status`           | `draft` or `locked`. Locked = finalized.                       |

### Variation Theme

The theme defines which Amazon attributes differentiate child products. Examples:

- `SIZE` — children vary by size only
- `FLAVOR/SIZE` — children vary by both flavor and size
- `COLOR_NAME` — children vary by color

Theme values are pulled from the `category_attributes` table (parsed from Amazon Category Listing Report XLSM files). The `valid_values` JSON column on rows where `local_label` matches "Variation Theme" contains the allowed options per product type.

When a theme is selected from the global dropdown:

1. The variation's `primaryDimension` and `themeAttributes` are updated.
2. All included products' `VariationThemeName` field in `master.variations` JSONB is synced.
3. The theme cell in the product table is read-only — it reflects the global setting.

### Product Inclusion

Products are included in a variation by checking the checkbox in the Client Products table. This sets two fields on the `master` row:

- `variationRef` — FK pointing to the variation UUID.
- `variations.VariationID` — The variation code stored in the JSONB blob.
- `variations.VariationThemeName` — The raw theme string (synced from the variation).

A product can only belong to one variation at a time.

**Locked mode**: Only included products are visible in the table.
**Unlocked mode**: All client products are shown; included products sort to top with parents first.

### Groups

Groups (`variation_groups` table) partition products within a variation along the primary dimension. For example, if the theme is `FLAVOR/SIZE` and the primary dimension is `Flavor`, groups might be "Chocolate", "Vanilla", "Strawberry".

Groups are created via:

1. **Add Group dialog** — Manual name entry or select from detected attribute values.
2. **Auto-detect from Amazon** — Scans product variation data and suggests groups.

Products can belong to multiple groups via the junction table `variation_group_assignments`.

### Tags

Tags (`variation_tags` table) are cross-cutting labels applied to products across all groups. For example, a "Limited Edition" tag could span multiple flavor groups.

## Data Flow

### Creating a Variation

1. User clicks "New Variation" on `/variations`, selects a client.
2. A code is auto-generated via `/api/variations/next-code` (e.g., `CLI_01`, `CLI_02`).
3. The variation is created in `draft` status.
4. User assigns products (checkbox), sets theme (dropdown), creates groups.

### Theme Assignment

```
User selects theme from dropdown (e.g., "FLAVOR/SIZE")
  → PATCH /api/variations/[id]
    → Updates variation: primaryDimension="Flavor", themeAttributes=["Flavor","Size"]
    → Syncs VariationThemeName on all products WHERE variationRef=id
      OR variations->>'VariationID' = variation.code
```

### Product Assignment

```
User checks product checkbox
  → PATCH /api/variations/[id]/assign
    → Sets master.variationRef = variation UUID
    → Sets master.variations.VariationID = variation code
    → Sets master.variations.VariationThemeName = variation theme
```

### Locking

Locking finalizes the variation. In locked mode:

- The product table shows only included products (parent first, then children).
- Lock/unlock toggles freely without leaving the page.

## Attribute Columns

The product table dynamically shows attribute columns based on the detected theme dimensions across all products. Column headers are normalized:

- `SIZE_NAME` → "Size"
- `FLAVOR_NAME` → "Flavor"
- `COLOR_NAME` → "Color"
- `PATTERN_NAME` → "Pattern"

This normalization strips `_name`/`_NAME` suffixes and title-cases the result.

## API Endpoints

| Method | Path                                   | Description                              |
| ------ | -------------------------------------- | ---------------------------------------- |
| GET    | `/api/variations`                      | List variations (optionally by client)   |
| POST   | `/api/variations`                      | Create a new variation                   |
| GET    | `/api/variations/next-code`            | Generate next sequential code            |
| GET    | `/api/variations/theme-options`        | Valid themes from category_attributes    |
| GET    | `/api/variations/[id]`                 | Full variation tree (groups + products)  |
| PATCH  | `/api/variations/[id]`                 | Update metadata, theme, status           |
| DELETE | `/api/variations/[id]`                 | Delete variation (cascades)              |
| PATCH  | `/api/variations/[id]/assign`          | Assign/unassign products                 |
| POST   | `/api/variations/[id]/groups`          | Create a group                           |
| PATCH  | `/api/variations/[id]/groups/[gId]`    | Update/delete a group                    |
| GET    | `/api/variations/[id]/suggest`         | Auto-detect groups from Amazon data      |
| POST   | `/api/variations/[id]/tags`            | Create a tag                             |

## Database Tables

| Table                          | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `variations`                   | Variation metadata                           |
| `variation_groups`             | Groups within a variation                    |
| `variation_group_assignments`  | Junction: product ↔ group (many-to-many)     |
| `variation_tags`               | Cross-cutting tags                           |
| `variation_tag_assignments`    | Junction: product ↔ tag (many-to-many)       |
| `category_definitions`         | Uploaded XLSM category definitions           |
| `category_attributes`          | Attributes per category (incl. valid_values) |

## Key Files

| File                                            | Purpose                          |
| ----------------------------------------------- | -------------------------------- |
| `src/app/variations/page.tsx`                   | Variations list page             |
| `src/app/variations/[id]/page.tsx`              | Variation detail / builder       |
| `src/app/api/variations/route.ts`               | List + create endpoints          |
| `src/app/api/variations/[id]/route.ts`          | Get + patch + delete             |
| `src/app/api/variations/[id]/assign/route.ts`   | Product assignment               |
| `src/app/api/variations/[id]/groups/route.ts`   | Group CRUD                       |
| `src/app/api/variations/[id]/suggest/route.ts`  | Auto-detect suggestions          |
| `src/app/api/variations/theme-options/route.ts`  | Category-based theme options     |
| `src/lib/category-report-parser.ts`             | XLSM parser for category data   |
