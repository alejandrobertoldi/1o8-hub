# Product Detail Editor — SOP

> Standard Operating Procedure for viewing and editing a single product, including grouped fields, comments, and change tracking.

---

## 1. Overview

The Product Detail page is where you:

- Edit product fields (often organized into grouped sections)
- Review the product’s change history / “dirty” state
- Add or review field comments (when enabled)
- Preview how content may appear on the Amazon PDP (when enabled)

---

## 2. Who can do this

- **viewer**: view product details (no edits)
- **editor**: edit allowed fields and workflows
- **admin**: edit all fields and run admin workflows

---

## 3. Where to find it (Navigation)

- From Product Catalog: open a product
- **URL pattern**: `/products/{productId}`

---

## 4. Inputs

- Product selection (from a table or deep link)
- Optional: required assets/data depending on the field (images, copy, attributes)

---

## 5. Outputs

- Updates to product fields (saved into the app database)
- Change tracking flags (products marked as “dirty” until publish)

---

## 6. Step-by-step procedure

### A) Make a standard edit

1. Open the product detail page.
2. Navigate to the relevant field group/section.
3. Update the field value.
4. Confirm it saves successfully (look for any save indicator/toast, if shown).

### B) Review what changed (change tracking)

1. Look for the “dirty” or “pending changes” indicators in the product UI.
2. Use the change log view (if shown) to review old vs new values.
3. If the change is wrong, revert the field (if the UI provides a revert action).

### C) Hand off for publish

1. Ensure the product’s required fields are complete for the target status.
2. Leave the product marked “dirty” (that’s what publish uses to pick up incremental changes).
3. Proceed to the Sync Dashboard (`/publish`) to publish changes.

---

## 7. Common issues / troubleshooting

- **I edited a field but publish didn’t include it**
  - **Cause**: the change may not have saved, or the product wasn’t marked dirty
  - **Fix**: re-open the product, confirm the value persisted, then publish again

- **A value “snaps back” after editing**
  - **Cause**: another field group may hold the same key (JSON overlay behavior)
  - **Fix**: re-edit using the canonical field location; if it persists, escalate to admin/dev

