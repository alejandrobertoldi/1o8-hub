# App UI Shell (Sidebar + Header) — SOP

> Standard Operating Procedure for navigating 1o8Hub and understanding the global UI elements that appear on every page.

---

## 1. Overview

Most pages share the same layout:

- **Left sidebar**: grouped navigation (Clients, Catalog, Sales, SEO, Design, Admin)
- **Top header**: quick actions (issue report, theme toggle, sync status, user menu)

Visibility of sidebar items depends on your **role** and **allowed sections**.

---

## 2. Who can do this

- **viewer/editor**: Navigate only to sections they’re allowed to access
- **admin**: Navigate everywhere, including admin-only tools
- **client**: Uses the separate portal (`/portal/*`) and is redirected away from internal routes
- **pending**: Only registration flow until approved

---

## 3. Sidebar navigation (what users will see)

The sidebar is organized into labeled groups. Your account may show fewer items depending on access.

### Clients
- **Client Summary** (`/`) — the main dashboard
- **Reports** (`/reports`) — if enabled
- **Client Portal** (`/portal`) — admin-only preview

### Catalog
- **Amazon Sync** (`/amazon-sync`) — if enabled
- **Attributes** (`/admin/attributes`) — admin only

### Sales
- **Sales Summary** (`/sales-summary`) — if enabled

### SEO
- **SEO Manager** (`/seo`) — if enabled

### Design
- **A+ Content** (`/aplus`) — if enabled
- **Files** (`/files`) — if enabled

### Admin
- **Activity** (`/activity`) — if enabled
- **Import** (`/import`) — if enabled
- **Sync & Export** (`/publish`) — if enabled
- **Team** (`/admin/users`) — admin only
- **SP-API Credentials** (`/admin/sp-api`) — admin only
- **Event Logs** (`/admin/logs`) — admin only
- **Issue Reports** (`/admin/issues`) — visible to all logged-in users
- **System Health** (`/admin/health`) — admin only

---

## 4. Header actions (top right)

- **Report an issue**: opens `Issue Reports` (`/admin/issues`)
- **Theme toggle**: switches light/dark theme
- **Sync status**: shows current sync state
- **User menu**: account actions (typically includes sign out)

---

## 5. Session sync (why access can “update” after load)

On page load, the app calls `/api/auth/session-sync` to ensure the browser session has the **DB-resolved** role and allowed sections.

You may briefly see restricted UI that then updates once the session sync completes.

---

## 6. Common issues / troubleshooting

- **Sidebar looks empty or missing expected items**
  - **Cause**: your `allowedSections` does not include those areas (or you are `pending`)
  - **Fix**: ask an admin to update your access

- **You’re redirected away from internal pages**
  - **Cause**: your role is `client` or `pending`
  - **Fix**: complete registration (pending) or ask admin to change role (client)

