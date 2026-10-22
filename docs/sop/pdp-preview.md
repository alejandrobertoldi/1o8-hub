# PDP Preview — SOP

> Standard Operating Procedure for previewing how product content may appear on the Amazon Product Detail Page (PDP).

---

## 1. Overview

The PDP preview is used as a QA step to:

- Spot formatting issues before publish
- Validate that key fields (title, bullets, description) read correctly
- Quickly review “what a customer would see”

---

## 2. Who can do this

- **viewer/editor/admin**: anyone who can open product detail pages and see the preview UI

---

## 3. Where to find it (Navigation)

- Typically accessed from within the **Product Detail Editor** (`/products/{productId}`)

---

## 4. Step-by-step procedure

1. Open `/products/{productId}`.
2. Find the PDP preview panel/component in the product UI.
3. Review:
   - Title
   - Bullets
   - Description
   - Images (if included in the preview)
4. Fix any issues in the appropriate fields.
5. Re-check the preview after edits.

---

## 5. Common issues / troubleshooting

- **Preview doesn’t match Amazon exactly**
  - **Cause**: PDP preview is a best-effort approximation
  - **Fix**: use it for formatting/content QA; confirm final rendering in Seller/Vendor Central when needed

