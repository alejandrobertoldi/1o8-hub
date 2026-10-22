# Attribute Template Workbook Redesign — Design Spec

## Problem

The current template generator produces a raw flat table (attributes as rows, products as columns) using SheetJS community edition. This is unusable as a client-facing data collection tool because:

1. No visual grouping by Amazon attribute category
2. No requirement-level indicators
3. No dropdown validation for constrained fields
4. No styling (SheetJS CE has no styling support)
5. Transposed orientation is unfamiliar to clients used to Amazon's XLSM format

## Goals

1. Generate a **styled, client-friendly XLSX workbook** that clients can fill in to provide attribute data for product launches or updates
2. Group attributes by Amazon category group, sub-sorted by requirement level
3. Add Excel dropdown validation for attributes with predetermined valid values
4. Support multi-category workbooks (AIA clients) and single-category (NTA clients)
5. Allow admins to hide irrelevant attributes from templates
6. Bridge the gap while setting up direct SP-API connection

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sheet architecture | One sheet per category | Each category has different attributes; merging creates confusion |
| Layout orientation | Products as rows, attributes as columns | Matches Amazon's own XLSM format; clients are familiar |
| Attribute filtering | Natural filtering (levels + bibleFieldMatch) + hideFromTemplate toggle | Automatic relevance with admin override control |
| Hide control location | Persistent `hideFromTemplate` on category definition | Set once, applies to all future generations |
| Excel library | ExcelJS for generation, keep SheetJS for XLSM parsing | ExcelJS supports styling + dropdowns; no risk to existing parser |
| Visual format | Traditional with merged group headers + requirement badges | Amazon-like orientation, clear hierarchy |
| Re-import | Deferred | Portal form covers direct entry; XLSX import is a future cycle |

## Workbook Structure

One `.xlsx` file per generation request containing:

| Sheet | Position | Visibility | Purpose |
|-------|----------|------------|---------|
| Instructions | 0 | Visible | Color legend, how-to-fill guide, do's/don'ts |
| \<ProductType\> (one per category) | 1+ | Visible | Data entry — products as rows, attributes as columns |
| Valid Values | Last | Hidden | Source data for dropdown validations |

### Multi-category handling

- **AIA clients** (products across categories): one workbook with multiple category sheets (e.g. "SHIRT", "DRESS", "PAJAMAS"). Generate dialog offers "All categories" option.
- **NTA clients** (single category): one workbook with one category sheet.

### File naming

`attribute-template-{clientIdCode}-{date}.xlsx`

## Category Sheet Layout

### Header rows (frozen at row 5, non-editable)

| Row | Content | Styling |
|-----|---------|---------|
| 1 | `"{ProductType} — Attribute Template"` merged across all columns | 1o8 brand gold (#E8A700) background, bold, 14pt font |
| 2 | `"Client: {name} \| Generated: {date} \| Fill the highlighted cells"` | Light grey background (#F5F5F5), 10pt font |
| 3 | **Group names** — merged cells spanning each group's attribute columns | Purple (#4A3D8F) background, white bold text |
| 4 | **Requirement badges** — one per attribute column: `REQ`, `COND`, `KEY`, `REC` | Color-coded background tints (see color system below) |
| 5 | **Attribute names** — local label for each column | Dark grey (#333333) background, white bold text, freeze pane |

### Column layout

| Column | Content | Editable | Width |
|--------|---------|----------|-------|
| A | Product name | Read-only (grey bg) | 30 |
| B | ASIN | Read-only (grey bg) | 15 |
| C+ | Attributes, grouped by category group then sorted by requirement | Editable | 20 |

### Column ordering

Within each Amazon group (e.g. "Product Identity", "Product Details"), attributes are sorted by requirement priority:

1. Required
2. Conditionally Required
3. Key
4. Recommended (if selected in generate dialog)

Groups themselves maintain their original Amazon sort order.

### Data rows (row 6+)

One row per product. Cell styling:

| Cell state | Background | Purpose |
|------------|------------|---------|
| Pre-filled value | Light grey (#F0F0F0) | Existing data from DB — client can verify/update |
| Empty Required cell | Light red (#FFF0F0) | Must fill |
| Empty Cond. Required cell | Light orange (#FFF8F0) | Should fill if applicable |
| Empty Key cell | Light purple (#F5F0FF) | Team-flagged important — should fill |
| Empty Recommended cell | Light blue (#F0F5FF) | Nice to have |
| Product name / ASIN columns | Grey (#E8E8E8) | Read-only identifier columns |

### "New" scope (product launches)

10 blank product rows with empty name/ASIN. All attribute cells use Required/Cond/Key/Rec tinting. Client fills in product identifiers + attribute values.

## Color System

| Element | Color | Hex |
|---------|-------|-----|
| Title bar | 1o8 brand gold | #E8A700 |
| Group header | Purple | #4A3D8F |
| Required badge/tint | Red | #DC3545 / #FFF0F0 |
| Cond. Required badge/tint | Orange | #FF8C00 / #FFF8F0 |
| Key badge/tint | Purple | #7C3AED / #F5F0FF |
| Recommended badge/tint | Blue | #3B82F6 / #F0F5FF |
| Read-only cells | Grey | #E8E8E8 |
| Pre-filled data cells | Light grey | #F0F0F0 |

## Data Validation (Dropdowns)

For every attribute where `category_attributes.validValues` is a non-empty array:

### Hidden "Valid Values" sheet

- One column per constrained attribute
- Row 1: attribute local label (header)
- Rows 2+: valid values from the JSONB array
- Sheet state: hidden (client doesn't see it, but Excel uses it for validation)

### Validation rules on category sheets

Each data cell in a constrained attribute column gets:

```
type: 'list'
formulae: ['Valid Values'!$X$2:$X$N]  (column range for that attribute)
allowBlank: true
showErrorMessage: true
errorTitle: 'Invalid Value'
error: 'Please select from the dropdown list. If your value isn\'t listed, type it and highlight the cell in yellow.'
errorStyle: 'warning'  (not 'stop')
```

**Why `warning` not `stop`:** Amazon's valid values can be incomplete or outdated. Blocking the client on a value we don't have in our list would be frustrating. Warning lets them proceed while flagging for review.

**Long value lists:** Some attributes (e.g. "Color") have 200+ values. ExcelJS handles this — the hidden sheet column grows, Excel's dropdown becomes scrollable.

## Instructions Sheet

Static sheet at position 0. Content:

### Color Legend

| Color | Meaning |
|-------|---------|
| Red-tinted cell | Required — must be filled for Amazon listing |
| Orange-tinted cell | Conditionally Required — fill if applicable to your product |
| Purple-tinted cell | Key — our team flagged this as important for your category |
| Blue-tinted cell | Recommended — improves listing quality |
| Grey cell | Pre-filled — verify but don't delete |

### How to Fill

- Type values in highlighted (colored) cells
- Use dropdown menus where available (click the cell, then the arrow)
- If a dropdown doesn't have your value, type it manually and highlight the cell yellow
- Grey cells contain data from your current catalog — verify but don't remove

### Do's and Don'ts

- Don't modify or delete the header rows (rows 1-5)
- Don't add or remove columns
- You may add product rows at the bottom for additional products
- Don't change the sheet names

### Return Instructions

- When done, save the file and send it back to your 1o8 account manager

## DB Schema Change

### New column: `category_attributes.hide_from_template`

```sql
ALTER TABLE category_attributes
  ADD COLUMN hide_from_template boolean NOT NULL DEFAULT false;
```

When `true`, the attribute is excluded from template generation regardless of its requirement level. Applied after the natural filtering (levels + `bibleFieldMatch`).

## Admin UI Changes

### `/admin/attributes` — attribute row enhancement

Each attribute row in the category browser gains a second toggle alongside the existing "Key" toggle:

- **Eye/EyeOff icon** — toggles `hide_from_template`
- Tooltip: "Hide from client template"
- When hidden: row gets dimmed/strikethrough appearance
- Filter chip addition: existing "All / Required / Key / Unmatched" gains "+ Hidden" chip

### API change

Existing `PATCH /api/category-definitions/:productType/attributes/:id`:

```ts
// Body gains:
{ isKey?: boolean, hideFromTemplate?: boolean }
```

## Generate Template Dialog Changes

Existing dialog fields remain:

- **Client**: dropdown
- **Category**: dropdown — gains **"All categories"** option for multi-category workbooks
- **Products scope**: "With gaps only" / "All products" / "New (empty)"
- **Attribute levels**: checkboxes — Required (always on), Conditionally Required, Key, Recommended

### "All categories" behavior

When selected, the API fetches all category definitions for the client and generates one sheet per category in the workbook. Products are scoped per-category (each sheet only shows products with that `productType`).

## API Changes

### `POST /api/attributes/template`

**Request body:**

```ts
{
  clientIdCode: string;
  productType: string | 'all';  // 'all' for multi-category
  scope: 'gaps' | 'all' | 'new';
  levels: string[];  // ['Required', 'Conditionally Required', 'Key', 'Recommended']
}
```

**Response:** XLSX file download (ExcelJS-generated)

**Changes from current implementation:**

1. Replace `xlsx` (SheetJS) with `exceljs` for generation
2. Support `productType: 'all'` — fetch all definitions for client, generate multi-sheet workbook
3. Add cell styling (fills, fonts, borders, merged cells)
4. Add data validation (dropdown lists) from `validValues`
5. Add Instructions sheet
6. Add hidden Valid Values sheet
7. Filter out attributes where `hideFromTemplate = true`
8. Group columns by `groupName`, sort within group by requirement priority
9. Traditional orientation: products as rows, attributes as columns

## Technical Notes

### Library split

- **SheetJS (`xlsx`)** — continues to handle XLSM upload parsing in `category-report-parser.ts`. No changes.
- **ExcelJS (`exceljs`)** — new dependency, used only for template generation in `POST /api/attributes/template`.

### ExcelJS dependency

```bash
npm install exceljs
```

MIT license, actively maintained, ~700KB. Supports all required features: styling, merged cells, data validation, freeze panes, hidden sheets.

## Out of Scope

- Automated re-import of completed XLSX templates (deferred — portal form covers direct entry)
- Conditional formatting that reacts to `Product Type` changes (Amazon does this in their XLSM with macros — we keep it static)
- Sheet protection / cell locking (ExcelJS supports it but adds complexity; defer until clients actually modify header rows)
- Print layout / page setup optimization
