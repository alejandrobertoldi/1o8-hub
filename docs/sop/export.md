# Export (CSV) — SOP

> Standard Operating Procedure for exporting data to CSV.

---

## 1. Overview

Export tooling is currently accessed through the **Sync Dashboard** area.

Important behavior:

- The `/export` route redirects to `/publish`.

---

## 2. Who can do this

- **viewer/editor**: depends on access (`publish` section enabled; some exports may require admin)
- **admin**: always has access

---

## 3. Where to find it (Navigation)

- **Sidebar path**: Admin → Sync & Export
- **URL**: `/publish`

---

## 4. Step-by-step procedure

1. Open `/publish`.
2. Locate the export controls inside the Sync Dashboard UI.
3. Configure the export (filters/scope) if prompted.
4. Run the export and download the CSV output.

---

## 5. Common issues / troubleshooting

- **I visited `/export` and it “changed pages”**
  - **Cause**: `/export` redirects to `/publish`
  - **Fix**: use `/publish` for export workflows

