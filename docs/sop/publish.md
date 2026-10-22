# Sync & Export (Publish workflow) — SOP

> Standard Operating Procedure for monitoring sync, reviewing changes, and publishing updates to BigQuery.

---

## 1. Overview

The **Sync Dashboard** is the control center for data movement and export operations. It’s intended for:

- Monitoring auto-sync to BigQuery
- Reviewing pending changes
- Publishing changes (typically incremental)
- Browsing publish history

---

## 2. Who can do this

- **viewer/editor**: depends on whether your account has the `publish` section enabled
- **admin**: always has access

If you don’t see **Sync & Export** in the sidebar, you likely don’t have the `publish` section enabled.

---

## 3. Where to find it (Navigation)

- **Sidebar path**: Admin → Sync & Export
- **URL**: `/publish`

Note: `/export` currently redirects to `/publish`.

---

## 4. Inputs

- Products that have been changed in the app (“dirty” products)
- Optional: admin settings / workflows depending on your deployment

---

## 5. Outputs

- Updated BigQuery tables (incremental or full publish depending on what’s executed)
- Publish history records for audit and recovery

---

## 6. Step-by-step procedure

### A) Review what will publish

1. Open `/publish`.
2. In the dashboard, review any indicators of pending changes.
3. If needed, open product detail pages to validate edits before publishing.

### B) Publish changes

1. From `/publish`, start the publish action from the Sync Dashboard UI.
2. Wait for completion.
3. Confirm the publish is recorded in the **Publish History** section.

---

## 7. Common issues / troubleshooting

- **I don’t see `/publish` in the sidebar**
  - **Cause**: your account doesn’t have the `publish` section enabled
  - **Fix**: ask an admin to add `publish` to your allowed sections

- **Publishing takes too long or fails**
  - **Cause**: large publish job or serverless timeout constraints
  - **Fix**: try incremental publish first; if it persists, escalate to admin/dev to review logs

