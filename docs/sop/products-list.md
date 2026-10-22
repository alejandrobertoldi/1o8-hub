# Products (Product Catalog table) — SOP

> Standard Operating Procedure for finding products, filtering the catalog, and opening the product detail editor.

---

## 1. Overview

The **Product Catalog** page is the main table for browsing and managing products across clients. It is designed for:

- Searching and filtering large product sets
- Reviewing status/readiness indicators
- Jumping into the product detail editor for edits and QA

---

## 2. Who can do this

- **viewer**: view and filter, open product detail read-only
- **editor**: view + edit (where editing is enabled)
- **admin**: all capabilities, plus access to admin tooling

---

## 3. Where to find it (Navigation)

- **URL**: `/products`

Common entry points:

- From the dashboard client card: **Products** button (routes to `/products?client=...`)
- From client views: links that route into `/products` with filters

---

## 4. Inputs

- Optional query filters (client, status, search terms, etc.)

---

## 5. Outputs

- Opens a product detail editor at:
  - `/products/{productId}`

---

## 6. Step-by-step procedure

### A) Find products for a specific client

1. Start at `/products`.
2. Apply the **client** filter (or use a deep link like `/products?client=DRC`).
3. Use search and any additional filters to narrow results.

### B) Open a product

1. Click the product row (or the “open” action if present).
2. You’ll land on the product detail editor (`/products/{id}`).

---

## 7. Common issues / troubleshooting

- **I can’t edit fields**
  - **Cause**: your role is `viewer`, or the field is restricted/locked
  - **Fix**: request `editor` role (or ask an admin to make the edit)

- **My table looks like it’s missing data**
  - **Cause**: filters are still applied, or the client filter is set
  - **Fix**: clear filters and try again

