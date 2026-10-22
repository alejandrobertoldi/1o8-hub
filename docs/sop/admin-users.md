# Admin: Team Management (Users) — SOP

> Standard Operating Procedure for admins to approve users, assign roles, and control section access.

---

## 1. Overview

The **Team Management** page is where admins manage internal users:

- Approve new sign-ins (move users from `pending` to `viewer` / `editor` / `admin`)
- Assign role
- Assign **section permissions** (what appears in the sidebar)
- Remove users when needed

Client users are handled via the Client Portal flows; this screen focuses on internal users.

---

## 2. Who can do this

- **admin only**

---

## 3. Where to find it (Navigation)

- **Sidebar path**: Admin → Team
- **URL**: `/admin/users`

---

## 4. Inputs

- A signed-in user’s record (users are auto-created on first sign-in)
- Desired role and allowed section toggles

---

## 5. Outputs

- Updated user access (role + allowed sections)
- Immediate effect after the user’s next session sync (or reload)

---

## 6. Step-by-step procedure

### A) Approve a new user (pending → viewer/editor)

1. Open `/admin/users`.
2. Find the user with role **pending**.
3. Select the new role:
   - **viewer** for read-only access
   - **editor** for editing workflows
4. Toggle the sections they should see (SEO, Publish, A+ Content, etc.).

### B) Grant access to a missing section

1. Find the user row.
2. Toggle the checkbox for the section (or use **All** for broad access).
3. Ask the user to refresh. Their sidebar should update after session sync.

### C) Remove a user

1. Click **Remove** on the user row.
2. Confirm the prompt.

---

## 7. Common issues / troubleshooting

- **User says “I still don’t see the section” after you enabled it**
  - **Cause**: their browser session may not have synced yet
  - **Fix**: ask them to refresh; if needed, sign out and sign back in

- **You can’t edit an admin’s section toggles**
  - **Cause**: admins always have access (toggles are effectively overridden)
  - **Fix**: change role first if you truly want restricted access

