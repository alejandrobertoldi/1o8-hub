# Dashboard (Client Summary) — SOP

> Standard Operating Procedure for using the main dashboard to understand the overall catalog health and jump into a client’s products.

---

## 1. Overview

The dashboard (labeled **Client Summary**) is the home screen. It shows:

- **Global Catalog** totals (Total ASINs and status breakdown)
- **Client cards** with per-client catalog counts and readiness indicators
- (Admin-only) actions like creating a new client and batch compare

---

## 2. Who can do this

- **viewer/editor**: View client cards and open product lists
- **admin**: All of the above plus create clients and run batch compare

---

## 3. Where to find it (Navigation)

- **Sidebar path**: Clients → Client Summary
- **URL**: `/`

---

## 4. Inputs

- No manual inputs required to view the dashboard

Optional actions may require:

- Admin role (for **New Client** and **Batch Compare**)

---

## 5. Outputs

- Fast navigation into:
  - A client’s overview (`/clients/{clientIdCode}`)
  - Product list filtered to a client (`/products?client={clientIdCode}`)

---

## 6. Step-by-step procedure

### A) Open a client’s product list

1. From the dashboard, find the client card.
2. Click **Products** on the card.
3. You’ll land on the Product Catalog filtered to that client.

### B) (Admin) Create a new client

1. Click **New Client** in the top header area.
2. Complete the client info in the dialog.
3. Save. The client should appear in the grid.

### C) (Admin) Run Batch Compare

1. On a client card, click **Batch Compare**.
2. Wait for completion.
3. The client card metrics update after processing.

---

## 7. Common issues / troubleshooting

- **I don’t see the “New Client” button**
  - **Cause**: only admins can create clients
  - **Fix**: request admin access or ask an admin to create it

- **A client shows “Not compared” for Amazon Match**
  - **Cause**: the comparison hasn’t been run yet
  - **Fix**: an admin can run **Batch Compare** for that client

