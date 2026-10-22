# Variety Pack Builder

## Overview

The Variety Pack Builder (`/variety-packs`) allows defining which individual child products are included inside a multi-pack or variety pack listing on Amazon. A variety pack is a single ASIN that bundles several child products together (e.g., a hot sauce duo containing Habanero + Jalapeno).

## Key Concepts

### What qualifies as a variety pack product?

A product is eligible for variety pack definition when **all** of these are true:

- **`is_vp` (IsVP) is true** — toggled on the product detail page
- It is not a **Parent** ASIN
- It does not already have a variety pack definition (those appear in the existing-packs list instead)

Flavor/Size/Color/Style no longer need to contain the text "Variety Pack". Listings such as a mixed 24-pack whose flavor is "Lemon Lime, Grapefruit, Wild Berry" appear here as soon as IsVP is on.

Examples:
- `B0HDGD612K` — IsVP on, Flavor: "Lemon Lime, Grapefruit, Wild Berry" → eligible
- `B0DCV742PT` — IsVP on (backfilled from Flavor: "Variety Pack") → eligible
- Regular child with IsVP off → not eligible
- `B0DHV157QN` — parentageLevel: "Parent" → not eligible

### Pack items

Each variety pack contains one or more **pack items**. Each item can be:

1. **Linked to a catalog product** — An existing product in the `master` table. When linked, the item inherits the product's ASIN, SKU, title, and image. Attributes (flavor, size, color, style) can be overridden.
2. **Custom item** — A manually defined item with a custom label and attributes, not linked to any catalog product.

Each item has a **units** count (how many of that item are in the pack).

## Database Schema

### `variety_pack_items` table

| Column                | Type                            | Description                                                    |
|-----------------------|---------------------------------|----------------------------------------------------------------|
| `id`                  | UUID (PK)                       | Auto-generated                                                 |
| `pack_product_id`     | UUID (FK → master.id)           | The variety pack product                                       |
| `included_product_id` | UUID (FK → master.id, nullable) | The child product included in the pack (null for custom items) |
| `flavor`              | varchar(200)                    | Flavor attribute                                               |
| `size`                | varchar(200)                    | Size attribute                                                 |
| `color`               | varchar(200)                    | Color attribute                                                |
| `style`               | varchar(200)                    | Style attribute                                                |
| `custom_label`        | varchar(255)                    | Label for custom items                                         |
| `units`               | integer                         | Number of units of this item in the pack (default: 1)          |
| `sort_order`          | integer                         | Display order within the pack                                  |

Indexes: `idx_variety_pack_items_pack` (pack_product_id), `idx_variety_pack_items_included` (included_product_id).

Cascade behavior: deleting the pack product cascades to delete all items; deleting an included product sets `included_product_id` to null.

## UI Flow

### Page: `/variety-packs`

#### 1. Select a client

The client dropdown filters IsVP listings and existing packs by `client_id_code`. Default is **All clients**.

#### 2. Product picker (top section)

The picker lists every listing with **IsVP** on that does not already have a pack definition. Click **+** to open the Pack Composer. Parent ASINs are excluded.

`GET /api/products?isVp=true` is the source — eligibility is the `master.is_vp` flag, not variation-attribute text.

#### 3. Pack Composer (new pack)

When creating a new variety pack:

- Shows a table of pack items with editable Flavor, Size, Color, Style, and Units fields
- **Add item from product list** — Shows all same-client products (excluding parents and self). Click to add a product as a pack item with its attributes pre-filled.
- **Custom item** — Adds a blank row for manual entry
- **Save** — Persists the pack definition via PUT to the API

The product list in the composer shows ALL client products (not just siblings of the same parent), because variety packs can include products from different product families.

#### 4. Existing packs (bottom section)

All defined variety packs are listed, grouped by client when no specific client is selected. Each pack card shows:

- Pack ASIN, SKU, client code, unit count badge
- Expandable item list with flavor/size badges
- **Edit** mode — Same item editor as the composer, with sibling picker
- **Delete** — Removes the entire pack definition
- **External link** — Opens the product detail page

#### 5. Sibling picker (edit mode)

When editing an existing pack, the "Add Sibling" button opens a picker showing all same-client child products. This returns products via `GET /api/products/[id]/siblings`, which queries by `client_id_code` (not by `parent_asin`) to ensure cross-family products are available.

### Product Detail Page

The `VarietyPackSection` component (`src/components/products/variety-pack-section.tsx`) is embedded in the product detail page for products that are variety packs. It provides the same edit/view functionality as the main page but scoped to a single product.

## API Endpoints

### `GET /api/variety-packs`

Lists every listing with `master.is_vp = true`, including packs that have no items yet (`itemCount: 0`).

- Query params: `?client=CLIENTCODE` (optional). With no `client`, only products whose `client_id_code` belongs to an Active AAC client are returned.
- Returns: Array of products with their items and unit counts. Empty packs sort first.

### `GET /api/products?isVp=true`

Lists catalog products. The variety pack builder uses `isVp=true` so only listings with `master.is_vp` are returned (indexed via `idx_master_is_vp`).

- Query params: `?client=CLIENTCODE` (optional), `?isVp=true|false`, `?pageSize=N`
- Returns: `{ data: Product[], pagination }`

### `GET /api/products/[id]/variety-pack`

Returns the pack composition for a specific product.

- Returns: Array of pack items with joined included product info (ASIN, SKU, title, image)

### `PUT /api/products/[id]/variety-pack`

Replaces the entire pack composition (delete-and-reinsert in a transaction).

- Body: `{ items: [{ includedProductId?, flavor?, size?, color?, style?, customLabel?, units? }] }`
- Returns: `{ ok: true, count: N }`

### `DELETE /api/products/[id]/variety-pack`

Removes all pack items for a product.

- Returns: `{ ok: true }`

### `GET /api/products/[id]/siblings`

Returns candidate products for the sibling picker.

- Logic: Fetches all child products from the same client (by `client_id_code`), excluding parents and the product itself
- Extracts Flavor/Size/Color/Style from the `variations` JSONB column
- Limit: 200 products

## File Map

| File                                                | Purpose                          |
|-----------------------------------------------------|----------------------------------|
| `src/app/variety-packs/page.tsx`                    | Main Variety Pack Builder page   |
| `src/components/products/variety-pack-section.tsx`  | Product detail page VP section   |
| `src/app/api/variety-packs/route.ts`                | List all variety packs           |
| `src/app/api/products/[id]/variety-pack/route.ts`   | CRUD for a single pack's items   |
| `src/app/api/products/[id]/siblings/route.ts`       | Sibling picker candidates        |
| `src/lib/db/schema.ts` (line ~1466)                | `varietyPackItems` table schema  |
