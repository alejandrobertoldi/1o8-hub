# Attribute Audit Process

## Overview

Amazon assigns products to categories, and each category defines which attributes are required. The same product in different colors can land in different categories — this is controlled by Amazon, not by us. The Attribute Audit system ensures every product has its required, conditionally required, and team-tagged "Key" attributes filled in.

## Concepts

### Requirement Levels

| Level | Source | Meaning |
|-------|--------|---------|
| **Required** | Amazon XLSM | Amazon mandates this field for the category |
| **Conditionally Required** | Amazon XLSM | Amazon requires this under certain conditions (e.g. if product has batteries) |
| **Key** | Team-tagged | Our team flagged this as important even if Amazon marks it Optional (e.g. fat % for grocery) |
| **Recommended** | Amazon XLSM | Amazon suggests filling this but won't block listing |
| **Optional** | Amazon XLSM | Nice to have, no impact on listing |

The audit checks **Required + Conditionally Required + Key** attributes. If any of these are empty for a product, it's flagged as a gap.

### Category Definitions

- Uploaded as XLSM files (Amazon Category Listing Reports) per client
- One XLSM can contain multiple product types (categories)
- Each category definition lists all attributes with their requirement level, group, description, examples, and valid values
- Attributes are matched to Hub fields via `bibleFieldMatch`

### Key Attribute Tagging

Two levels of control:

1. **Category-level** (admin): Toggle `is_key` on any attribute within a category definition. Applies to all products in that category.
2. **Product-level** (editor): Override key status for a specific product. Takes precedence over category-level.

## Workflow

### 1. Upload Category Definition

1. Admin goes to `/admin/attributes`
2. Selects client, uploads XLSM from Amazon Seller Central
3. System parses all product types in the file, creates one definition per product type
4. Attributes are auto-matched to Hub fields where possible

### 2. Tag Key Attributes

1. Admin expands a category definition in `/admin/attributes`
2. Browses attribute groups, toggles "Key" on attributes that matter beyond Amazon's requirements
3. Example: For GROCERY, admin marks `fat_percentage`, `protein_per_serving`, `calories_per_serving` as Key

### 3. Run Audit

1. Go to `/attributes` (Audit Dashboard)
2. See all clients with their health scores
3. Expand a client to see categories and gap counts
4. Click a category to drill down to products with missing fields
5. Each product shows exactly which fields are missing, color-coded by level (R/C/K)

### 4. Fix Gaps — Internal

1. From the audit drill-down, click a product to go to its detail page
2. The "Missing Attributes" alert card at the top lists all gaps
3. Click "Jump to field" to scroll to the field and edit it inline
4. Optionally mark additional fields as Key for this specific product

### 5. Fix Gaps — Client Template (XLSX)

1. From the audit dashboard, click "Generate Template"
2. Select client, category, scope ("With gaps only" for existing products, "New (empty)" for launches)
3. Choose attribute levels to include
4. Download XLSX — pre-filled with existing data, empty cells highlighted
5. Send to client, they fill in the gaps
6. Re-import the completed spreadsheet

### 6. Fix Gaps — Client Portal Form

1. From the template dialog, click "Create Portal Link"
2. System generates a URL for the client portal
3. Client opens the link, sees a wizard-style form — one product at a time
4. Only missing fields are shown, with examples and descriptions
5. Data auto-saves directly to the database — no import step needed

## Health Score Calculation

```
health_score = filled_count / total_auditable_count × 100

where:
  total_auditable_count = count of attributes where:
    - requirement is Required or Conditionally Required
    - OR is_key = true (category or product override)
    - AND bibleFieldMatch is not null (attribute maps to a Hub field)
  
  filled_count = count of auditable attributes where:
    - product field value is not null and not empty string
```

## Key Files

| File | Purpose |
|------|---------|
| `/admin/attributes` | Upload XLSM, browse categories, tag Key attributes |
| `/attributes` | Audit dashboard — client → category → product drill-down |
| `/portal/attributes` | Client-facing form for filling attribute gaps |
| `category_definitions` table | One row per client × product type |
| `category_attributes` table | One row per attribute in a definition (+ `is_key` flag) |
| `product_key_overrides` table | Per-product key overrides |
| `attribute_template_requests` table | Template generation records for portal links |

## Design Spec

Full technical spec: `docs/superpowers/specs/2026-04-18-attributes-audit-design.md`
