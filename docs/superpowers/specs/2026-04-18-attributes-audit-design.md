# Attributes Audit & Template System — Design Spec

## Problem

Products on Amazon are assigned to categories by Amazon itself — the same product in different colors can land in different categories. Each category defines which attributes are Required, Conditionally Required, Recommended, or Optional. Beyond Amazon's classification, the team needs to flag certain attributes as "Key" (e.g. fat % for grocery) that should be treated as mandatory even when Amazon marks them Optional.

Currently the system can upload category definitions (XLSM) and display attribute groups per product, but there is no cross-client audit view, no gap detection, no template generation for client data collection, and no way to tag key attributes.

## Goals

1. **Audit**: Scan all products against their category's required/conditional/key attributes, surface gaps at client → category → product level
2. **Key Attributes**: Let admins tag attributes as "key" per category, and let editors override per product
3. **Templates**: Generate XLSX or portal forms with minimum required/key fields for clients to fill in (both for existing product gaps and new product launches)

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Key attribute source | Manual tagging per category + per-product override | Team knows which attributes matter beyond Amazon's levels |
| Category-to-product mapping | One category per product via `productType` from XLSM | Matches existing data model; siblings may differ and that's fine |
| Template format | Both XLSX download + portal form | Spreadsheet for offline clients, portal for direct DB entry |
| Audit scope | Client-level dashboard + product-level detail | Need the bird's-eye view AND the fix-in-place flow |
| Architecture | Audit dashboard + enhanced detail (Approach C) | Dashboard for macro view, product detail for micro fixes, admin for category management |

## Data Model Changes

### 1. New column: `category_attributes.is_key`

```sql
ALTER TABLE category_attributes ADD COLUMN is_key boolean NOT NULL DEFAULT false;
```

Admin toggles this per attribute within a category definition. When `is_key = true`, the attribute is treated as effectively required in the audit regardless of Amazon's requirement level.

### 2. New table: `product_key_overrides`

```sql
CREATE TABLE product_key_overrides (
  id serial PRIMARY KEY,
  product_id text NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  attribute_name text NOT NULL,        -- the bibleFieldMatch / generalLabel
  category_definition_id integer REFERENCES category_definitions(id) ON DELETE CASCADE,
  is_key boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, attribute_name)
);
```

Per-product override: editors can flag/unflag specific attributes as key for individual products. Overrides the category-level `is_key` for that product.

### 3. Effective requirement logic

For audit purposes, an attribute's effective requirement for a given product is:

1. Check `product_key_overrides` for this product + attribute → if exists, use its `is_key`
2. Else check `category_attributes.is_key` → if true, treat as "Key"
3. Else use Amazon's `requirement` level from `category_attributes`

Audit flags an attribute as **missing** when:
- Effective requirement is Required, Conditionally Required, or Key
- AND the product's corresponding field value is null or empty string

## Surface 1: Audit Dashboard (`/attributes`)

### Page layout

- **Header**: "AttributeAudit" in 1o8Hub heading style
- **Toolbar**: Client filter dropdown, "Has gaps" / "All" filter, "Generate Template" button
- **Client cards**: One card per client, showing:
  - Client name, category count, product count
  - Gap count badge (red if gaps, green checkmark if complete)
  - Health bar: % of required/conditional/key attributes filled across all products
  - Expandable to show category rows

### Category rows (expanded client)

Each category row shows:
- Product type badge (monospace, brand color)
- Product count in that category
- Gap breakdown: `4R 2C 3K` (Required/Conditional/Key gap counts)
- "X missing" badge or "Complete" badge
- Click to drill down to product list

### Product drill-down (category → products)

- Breadcrumb: Audit → Client → Category
- Summary bar: "N products, X missing fields across Y products"
- "Export gaps XLSX" button for quick single-category export
- Product rows showing:
  - Product name + ASIN
  - Missing field pills (color-coded: red=Required, orange=Conditional, purple=Key)
  - Click → navigates to product detail page
- Complete products collapsed into summary line: "N products complete"

### API endpoint

```
GET /api/attributes/audit?clientIdCode=XXX
```

Returns per-client, per-category gap counts. Computes by:
1. For each client, get their category definitions
2. For each definition, get attributes where requirement is Required/Conditionally Required OR `is_key = true`
3. For each product with that `productType`, check if the matched Hub field has a value
4. Return aggregated counts

## Surface 2: Product Detail Enhancement

### Attribute Health Card

New card at the top of the product detail page (below header, above existing sections). Only shows when there are missing required/conditional/key attributes.

- Red border/background tint
- Title: "N Missing Attributes" with category name
- List of missing fields, each showing:
  - Requirement badge (R/C/K)
  - Field label
  - "Jump to field" link that scrolls to and highlights the field in the sections below
- Footer: "+ Mark another field as Key for this product" → opens a popover/dialog to select from the category's attributes and toggle key status

### Per-product key override

When a user marks a field as Key via the product detail page, it creates/updates a row in `product_key_overrides`. This override:
- Takes precedence over the category-level `is_key`
- Is shown in the attribute health card
- Can be removed (un-keyed) from the same UI

### Section card badges

Existing `ProductSection` cards gain R/C/K gap badges (already partially implemented with requirement summary). The badges should now also account for Key attributes.

## Surface 3: Admin Key-Attribute Tagging

### Enhancement to `/admin/attributes`

When an admin expands a category definition to browse its attribute groups, each attribute row gains a **Key toggle** (purple switch).

- Toggle ON: sets `category_attributes.is_key = true`, row gets purple tint
- Toggle OFF: sets `is_key = false`
- Filter chips: All / Required / Key / Unmatched
- Counter in toolbar: "N marked as Key"

### API endpoint

```
PATCH /api/category-definitions/:productType/attributes/:id
Body: { isKey: boolean }
```

## Surface 4: Template Generation

### Generate Template Dialog

Accessible from:
- Audit dashboard toolbar ("Generate Template" button)
- Category drill-down ("Export gaps XLSX" for single-category quick export)

Dialog fields:
- **Client**: dropdown
- **Category**: dropdown (filtered to client's categories)
- **Products scope**:
  - "With gaps only" — only products that have missing required/conditional/key fields
  - "All products" — every product in the category, pre-filled with existing data
  - "New (empty)" — blank template with no product rows, just column headers. For new product launches where products haven't been created in the DB yet. Client fills in product name + ASIN + attribute values, team imports via existing import flow.
- **Attribute levels**: Checkboxes — Required (always on), Conditionally Required, Key, Recommended, Optional
- **Actions**: "Download XLSX" / "Create Portal Link" (portal link not available for "New (empty)" scope since products must exist in DB)

### XLSX Output

Generated server-side. Structure:
- Rows = products (product name + ASIN in first two columns)
- Columns = selected attributes, grouped by requirement level
- Column headers color-coded: red=Required, orange=Conditional, purple=Key
- Pre-filled with existing data from DB
- Empty cells highlighted (light tint matching requirement color)
- Sheet name = category product type

### API endpoint

```
POST /api/attributes/template
Body: { clientIdCode, productType, scope, levels }
Response: XLSX file download
```

### Portal Form (`/portal/attributes`)

When "Create Portal Link" is clicked:
- System creates a `attribute_template_requests` record with the template config
- Returns a URL like `/portal/attributes?request=<id>`
- Client (portal user) opens the link

Portal form UI:
- Wizard-style: one product at a time
- Shows only missing fields for that product
- Each field shows: requirement badge, label, input, example text, Amazon field name
- Auto-saves on blur (writes directly to the product's fields in DB)
- "Next Product" button advances through the list
- Progress indicator: "1 of 5 products"

### Data model for template requests

```sql
CREATE TABLE attribute_template_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id_code text NOT NULL,
  product_type text NOT NULL,
  scope text NOT NULL,           -- 'gaps' | 'all' | 'new'
  levels text[] NOT NULL,        -- ['Required', 'Conditionally Required', 'Key']
  product_ids text[],            -- null for 'new' scope
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

## Navigation

- New sidebar item: "Attributes" under the existing products area (icon: `ClipboardCheck` or similar)
- Links to `/attributes` (audit dashboard)
- Admin attributes page stays at `/admin/attributes`
- Portal form at `/portal/attributes`

## Out of Scope

- Automatic category detection from Amazon SP-API (uses manually uploaded XLSM)
- AI-powered attribute value suggestions
- Bulk editing of attribute values from the audit dashboard (fix happens on product detail)
- Historical audit tracking / trend over time
