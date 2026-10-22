# Amazon Category Listings Report — Workbook Reference

**File:** `Category+Listings+Report_03-30-2026 (1).xlsm`
**Marketplace:** `ATVPDKIKX0DER` (Amazon US)
**Language tag:** `en_US`
**Format:** Macro-enabled Excel workbook (`.xlsm`) issued by Amazon Seller Central. It is both an **inventory upload template** (you fill it and upload back to Amazon) and a **report** (Amazon pre-populates it with the seller's existing catalog for the chosen category).

---

## 1. Purpose of the Workbook

This is Amazon's bulk listing spreadsheet for the **Apparel / Clothing** category (product types include `SHIRT`, `DRESS`, `PAJAMAS`, `UNDERPANTS`, `LEOTARD`, `COORDINATED_OUTFIT`, `BLANKET`, `ONE_PIECE_OUTFIT`, `APPAREL`, etc.).

A seller uses it to:
- **Create** new SKUs in their Amazon catalog
- **Update** existing SKUs (price, inventory, attributes, images)
- **Delete** SKUs
- **Manage parent/child variations** (size, color, etc.)

The seller fills in the `Template` tab, saves the tab as tab-delimited `.txt`, and uploads it at `https://sellercentral.amazon.com/listing/upload`.

---

## 2. Sheet Inventory

| # | Sheet Name | Rows × Cols | Role |
|---|---|---|---|
| 1 | `Changes to the template` | 22 × 1 | Release notes / changelog for the template version |
| 2 | `Instructions` | 39 × 1 | Human-readable how-to guide |
| 3 | `Images` | 29 × 1 | Amazon image standards (size, background, naming) |
| 4 | `Data Definitions` | 340 × 6 | **Field dictionary** — one row per attribute |
| 5 | `Template` | 459 × **473** | **The data-entry sheet** — where listings actually go |
| 6 | `Conditions List` | 82 × 218 | Conditional-requirement lookup (which variation themes require which attribute combos) |
| 7 | `Valid Values` | 2001 × 909 | Per-product-type enumerated valid values for each attribute |
| 8 | `Dropdown Lists` | 910 × 1559 | Source ranges for the data-validation dropdowns used in `Template` |
| 9 | `AttributePTDMAP` | 251 × 9 | Product-Type → Attribute applicability map (which attributes apply to which product type) |

Three sheets are documentation (`Changes to the template`, `Instructions`, `Images`). The rest are machine-oriented.

---

## 3. The `Template` Sheet — How It's Structured

This is the only sheet the user edits. It has **6 frozen header rows** and listing rows begin at **row 7**.

### 3.1 Header rows (rows 1–6)

| Row | Contents | Machine or human? |
|---|---|---|
| **1** | `settings=...&attributeRow=5&attributeSettings=...` — a single giant **base64-encoded JSON blob** in `A1` (continues into `B1` as `settings2=...`). This carries Amazon's per-column metadata: display-value ↔ API-value aliases for every dropdown (e.g. `"Yes" → "true"`, `"No Sign Of Use" → "no_sign_of_use"`). **Do not modify.** | Machine |
| **2** | Help text banner: *"Use ENGLISH to fill this template. DO NOT modify or delete the colored header rows…"* | Human |
| **3** | **Group Name** — logical attribute group (`Reference Group`, `Listing Identity`, `Variations`, `Product Identity`, `Offer`, `Images`, etc.). Only the first column of each group is populated; visually merged across the group's columns. | Human |
| **4** | **Local Label Name** — friendly attribute name (`Status`, `Title`, `SKU`, `Product Type`, `Item Name`, `Brand Name`, …) | Human |
| **5** | **Internal API field name** — the actual key Amazon's system reads. Format: `attribute_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#N.value` (the `#N` is the instance number — e.g. `collar_style#1`, `collar_style#2`). This is the row `attributeRow=5` in the settings blob refers to. **Never change this row.** | Machine |
| **6** | **Example values** (same as `Example` column in `Data Definitions`) | Human |

### 3.2 Data rows (row 7 onward)

One row per SKU. Example from row 7 of this file:

| Status | Title | SKU | Product Type | Listing Action | Parentage Level | Parent SKU | Variation Theme | Item Name | Brand | Product Id Type | Product Id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `Active` | `Amazon Essentials Men's Full-Zip…` | `ABC123` | `SHIRT` | `(Default) Create or Replace` | `Parent` | `ABC123` | `Size/Color` | `Robert Graham Men's Maya Bay…` | `Calvin Klein, …` | `UPC` | `714532191586` |

### 3.3 Column structure — **473 columns** grouped into attribute families

Main groups (order and approximate location):

1. **Reference Group** — `Status`, `Title` (reference only, not uploaded)
2. **Listing Identity** — `SKU`, `Product Type`, `Listing Action`
3. **Variations** — `Parentage Level`, `Parent SKU`, `Variation Theme Name`
4. **Product Identity** — `Item Name`, `Brand Name`, `Product Id Type/Value`, `Item Type Keyword`, `Model Number/Name`, `UNSPSC Code`, `Manufacturer`, etc.
5. **Product Details** — category-specific attributes (`Collar Style`, `Bottom Style`, `Age Gender Category`, `Material`, `Size`, `Color`, fabric composition, …)
6. **Discovery / Description** — keywords, bullet points, product description
7. **Safety & Compliance** — hazmat, battery, country-of-origin, CPSIA
8. **Dimensions** — item/package weight and dimensions with unit columns
9. **Offer (Sell on Amazon)** — price, quantity, condition, SKU condition notes
10. **Offer (Amazon Business / B2B)** — business price, quantity discounts
11. **Fulfillment** — FBA vs merchant-fulfilled, shipping template, handling time
12. **Images** — main image URL + up to 8 other image URLs + swatch
13. **Tax & Legal** — tax code, CE marking, warranty

Many attributes support **multiple instances** (`#1`, `#2`, `#3` …) for repeated values — e.g. two `Collar Style` columns (`#1.value` and `#2.value`) or two `Bottom Style` columns, visible in columns N–O and U–V.

### 3.4 Per-row highlight behavior (documented in `Instructions` A24)

After the user picks a `Product Type` for a row:
- **RED cells** = required attributes (must be filled or upload fails)
- **ORANGE cells** = conditionally-required or recommended (based on other inputs)
- **Grayed-out cells** = not applicable to that product type
- Columns are grouped with `+/-` outline toggles; top-left **"1"** button collapses optional attrs, **"2"** expands all

---

## 4. The `Listing Action` Column (`::record_action`)

| UI value | Meaning |
|---|---|
| `(Default) Create or Replace` / `Create or Replace (Full Update)` | Full overwrite of the SKU |
| `Edit (Partial Update)` | Only the filled cells are updated; blanks are ignored |
| `Delete` | Remove the SKU from the catalog |

Default behavior (from settings blob) is `full_update`.

---

## 5. The `Data Definitions` Sheet — Field Dictionary

340 rows × 6 columns. One row per template attribute.

| Col | Header | Content |
|---|---|---|
| A | Group Name | e.g. `Listing Identity`, `Variations`, `Product Identity` |
| B | **Field Name** | Internal API name (matches `Template` row 5) |
| C | Local Label Name | Friendly name (matches `Template` row 4) |
| D | Accepted Values | Free-text description of the rule |
| E | Example | Example value (matches `Template` row 6) |
| F | **Required?** | `Required` / `Conditionally Required` / `Recommended` / `Optional` |

This is the canonical reference for every field. Example entries:

- `contribution_sku#1.value` → Label `SKU`, Required, example `ABC123`
- `product_type#1.value` → Label `Product Type`, Required, example `SHIRT`
- `parentage_level[marketplace_id=ATVPDKIKX0DER]#1.value` → Label `Parentage Level`, Optional, example `Parent`
- `variation_theme#1.name` → Label `Variation Theme Name`, Conditionally Required, example `Size/Color`
- `amzn1.volt.ca.product_id_type` → Label `Product Id Type`, Required, example `UPC`

---

## 6. The `Valid Values` Sheet — Enumerated Values per Product Type

2001 rows × 909 columns. A matrix keyed by **product type** (column) × **attribute** (set of rows).

- Row 1: group labels (e.g. `Listing Identity`)
- Rows 2+: attribute values valid for that (product_type, attribute) pair
- Columns C onward are product-type-scoped (`DRESS`, `ONE_PIECE_OUTFIT`, `BLANKET`, `APPAREL`, `PAJAMAS`, `UNDERPANTS`, `COORDINATED_OUTFIT`, `LEOTARD`, …)

The sheet backs the dropdowns: when a user picks `Product Type = SHIRT` in a row, the validation for the category-specific columns (e.g. `Collar Style`, `Fit Type`) narrows to the list for `SHIRT`.

---

## 7. The `Dropdown Lists` Sheet

910 × 1559. Raw, localized dropdown source data used by Excel's Data Validation. Each column holds one dropdown list; the first cells are often **internationalized labels** (Arabic, Dutch, Portuguese, etc.) — e.g. the `Variation Theme` dropdown has localized header names in row 1 and the enum values (`COLLECTION_ITEM`, `COLOR`, `COLOR/FILL_MATERIAL/SIZE`, `COLOR/NUMBER_OF_ITEMS`, …) from row 4 down.

Typical column pattern seen:
```
Row 1: "كرة القدم الألمانية"         (display / localized name)
Row 2: "IndianSuperLeague"          (normalized)
Row 3: "::record_action"            (attribute key)
Row 4: "Create or Replace..."       (enum value 1)
Row 5: "Edit (Partial Update)"      (enum value 2)
...
```

This sheet is **large and largely opaque** — treat it as a read-only resource powering dropdowns. Don't edit.

---

## 8. The `Conditions List` Sheet

82 × 218. Defines conditional-requirement sets. Each column is a `CONDITION_LIST_N` (N = 0..~217).

- Row 1: identifier (`CONDITION_LIST_0`, `CONDITION_LIST_1`, …)
- Row 2+: attribute combinations that trigger requirement rules, e.g.:
  - `CONDITION_LIST_3` contains entries like `MODEL_NUMBER/SIZE`, `STYLE_NAME/MODEL/NUMBER_OF_ITEMS/PART_NUMBER`, `MODEL`, `STYLE_NAME/MODEL/MATERIAL_TYPE/SIZE_NAME/NUMBER_OF_ITEMS/PART_NUMBER`

Many entries are tagged `(Deprecated: Do Not Use)` — legacy combos Amazon no longer accepts but keeps for backward compatibility (see changelog entry "Changes to Variation Theme options").

Used internally by Amazon's validator to decide which set of attributes must be co-populated when a given variation theme is chosen.

---

## 9. The `AttributePTDMAP` Sheet — Product-Type × Attribute Applicability

251 × 9. A binary matrix.

- Column A: attribute API name (e.g. `merchant_shipping_group[...]#1.value`, `fulfillment_availability#1.fulfillment_channel_code`)
- Columns B–I: each column = a product type (`DRESS`, `ONE_PIECE_OUTFIT`, `BLANKET`, `APPAREL`, `PAJAMAS`, `UNDERPANTS`, `COORDINATED_OUTFIT`, `LEOTARD`)
- Cell value `1` = that attribute applies to that product type; blank = does not

PTD = **P**roduct **T**ype **D**efinition. This is the map Amazon uses to decide which template columns to light up (and require) for a given product type.

---

## 10. Key Internal Field Naming Conventions

All column-5 internal names follow a pattern:

```
<attribute>[marketplace_id=<MKT>][language_tag=<LANG>]#<instance>.<subfield>
```

- `marketplace_id=ATVPDKIKX0DER` → US marketplace
- `language_tag=en_US` → US English
- `#1`, `#2`, … → instance number when multiple values are allowed
- `.value` → the actual value (most attributes)
- `.unit` → for dimensional fields (e.g. `shoulder_to_bottom_hem_length#1.unit`)
- `.name` / `.parent_sku` / `.quantity` / `.sku` → subfields on structured attributes

Two exception namespaces:
- `::listing_status`, `::title`, `::record_action` — reference / action columns, no marketplace scoping
- `amzn1.volt.ca.*` — newer "Volt CA" namespace for product identifiers

---

## 11. Workflow Summary

1. **Pick category** in Seller Central → download this file.
2. Open `Template` tab. Click **"2"** (top-left) to expand all columns.
3. For each SKU row:
   - Enter `SKU`, `Product Type`, `Listing Action`.
   - Fill all **RED** (required) cells.
   - Fill **ORANGE** (recommended/conditionally required) cells.
   - Leave grayed/blank cells alone unless relevant.
4. For variations: create one `Parent` row (no price/qty) and multiple `Child` rows all pointing at the parent's SKU via `Parent SKU`; set `Variation Theme Name` consistently (e.g. `Size/Color`).
5. Save a copy of the `Template` tab only as **Tab-delimited Text (`.txt`)**.
6. Upload at https://sellercentral.amazon.com/listing/upload.
7. Check the processing report for errors; fix and re-upload.

---

## 12. Things to Be Careful About (Gotchas)

- **Never edit rows 1–6** of `Template`. Row 1 holds the encoded settings Amazon uses to parse the file; row 5 holds the API field names.
- **Row 5 is the schema.** If you rename anything in row 5, the upload breaks.
- Images tab says: high-ASCII characters (`®`, `©`) and HTML tags are **not allowed** in any text field.
- For the Chinese marketplace, save as **Unicode Text** (`.txt`), not ANSI.
- `Business Price` was renamed — in this new template version, B2B discounted price is now called `Your Price` inside the **Amazon Business (B2B)** offer group.
- Several variation themes are marked `Deprecated: Do Not Use`. To migrate existing parents off a deprecated theme: delete the parent SKU (children auto-orphan), then re-parent using a non-deprecated theme. Both steps can be done via this same report.
- Main image background **must** be pure white `#FFFFFF`; image must be ≥1000 px on the long side for zoom; ≥500 px minimum or upload is rejected.
- `Product Id Type` = `GTIN Exempt` is allowed for exempt catalogs; otherwise supply a valid UPC/EAN/GTIN/ASIN.

---

## 13. Quick Sheet Roles Cheat-Sheet

| If you need to… | Look at |
|---|---|
| Fill out listings | `Template` (rows 7+) |
| Find what a column means | `Data Definitions` (match on column C "Local Label Name" or B "Field Name") |
| Find legal values for a dropdown | `Valid Values` (intersect product type × attribute) |
| Understand requirement triggers | `Conditions List` + `AttributePTDMAP` |
| See what changed in this template version | `Changes to the template` |
| Image specs | `Images` |
| General how-to | `Instructions` |

---

*Generated as a reference for downstream tooling. The workbook itself is Amazon's standard bulk-listing artifact; schema row is `Template!5:5`, data starts at `Template!7:7`.*