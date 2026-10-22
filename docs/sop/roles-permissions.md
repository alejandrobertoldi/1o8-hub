# Roles & Permissions — SOP

> Standard Operating Procedure for understanding **who can access what** in 1o8Hub, and what to do when access is missing.

---

## 1. Overview

1o8Hub access is controlled by:

- **Role** (`admin`, `editor`, `viewer`, `client`, `pending`)
- **Allowed sections** (`allowedSections[]`) which toggles which sidebar areas a user can see/use

Admins can access everything. Non-admin users only see sections included in their `allowedSections`.

---

## 2. Role definitions (what they mean)

- **admin**
  - Full access to all sections
  - Can manage users (Team), system health, credentials, logs, attributes
- **editor**
  - Can access assigned sections
  - Intended for users who edit catalog content and run workflows (depending on what sections are granted)
- **viewer**
  - Can access assigned sections
  - Intended for read-only usage (depending on what sections are granted)
- **client**
  - Restricted to the **Client Portal** experience (`/portal/*`)
  - If a client user navigates to an internal page, they are redirected back to `/portal`
- **pending**
  - Newly created user awaiting approval
  - Restricted to the registration flow (`/auth/register`) until approved

---

## 3. Allowed sections (what appears in the sidebar)

Non-admin users only see sidebar items if the section is allowed.

Common section keys used by the app:

- `calendar`
- `reports`
- `sync`
- `sales`
- `seo`
- `aplus`
- `files`
- `activity`
- `import`
- `publish`

If a user is missing something in the sidebar, it’s usually because the section key is not included in their `allowedSections`.

---

## 4. What happens on first sign-in (pending flow)

When a user signs in with Google for the first time:

- They are auto-created in the database as **`pending`**
- They are redirected to **`/auth/register`** to request access
- After they submit the form, they see **“Pending Approval”** until an admin approves them

---

## 5. Troubleshooting access

- **User can sign in but keeps getting sent to registration**
  - **Likely cause**: user role is still `pending`
  - **Fix**: admin must approve the user and set a non-pending role

- **User can’t see a section in the sidebar**
  - **Likely cause**: section key missing from `allowedSections`
  - **Fix**: admin updates user’s allowed sections

- **User gets redirected to `/portal` unexpectedly**
  - **Likely cause**: role is `client`
  - **Fix**: admin should change role to `viewer`/`editor` (or keep as client if intended)

