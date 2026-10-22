# Activity Log — SOP

> Standard Operating Procedure for reviewing user activity, imports, and system changes recorded by the app.

---

## 1. Overview

The Activity Log is an audit-style feed intended to help you:

- See what changed, when, and by whom
- Track imports and bulk operations
- Investigate unexpected catalog changes

---

## 2. Who can do this

- **viewer/editor**: if they have the `activity` section enabled
- **admin**: always has access

---

## 3. Where to find it (Navigation)

- **Sidebar path**: Admin → Activity
- **URL**: `/activity`

---

## 4. Step-by-step procedure

1. Open `/activity`.
2. Scroll to review recent events.
3. If you need to investigate a specific change, cross-reference:
   - The product detail page for the product involved
   - Publish history (if the timing aligns with a publish)

---

## 5. Common issues / troubleshooting

- **I can’t access Activity**
  - **Cause**: `activity` not included in your allowed sections
  - **Fix**: ask an admin to grant the `activity` section

