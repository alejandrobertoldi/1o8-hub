# SEO Manager (Project list + pipeline) — SOP

> Standard Operating Procedure for creating and managing SEO projects and moving them through the S1–S6 pipeline.

---

## 1. Overview

The **SEO Manager** is a project-based workflow for Amazon listing optimization. Each project moves through phases:

- **S1** Intake
- **S2** Keywords
- **S3** Reviews
- **S4** Rufus
- **S5** COSMO
- **S6** SEO Content

Projects can also be:

- Assigned to a **client**
- Assigned to a **team member** (assignee)
- Renamed, duplicated, or deleted

---

## 2. Who can do this

- **viewer/editor**: if they have the `seo` section enabled
- **admin**: always has access, plus config access

---

## 3. Where to find it (Navigation)

- **Sidebar path**: SEO → SEO Manager
- **URL**: `/seo`

Admin-only:

- **SEO Config**: `/seo/config`

---

## 4. Inputs

To create a project you typically need:

- **Project name** (example: “Brand — Product Line”)
- **Brand name**
- Optional: **Client**
- Optional: **Assignee** (admins can assign anyone; non-admins are typically self-assigned)

---

## 5. Outputs

### Helium 10 acquisition in S2

After approving S1, open **Keywords** from SEO Manager. The shared amazon@marketfoundry.agency connection is managed at **Admin → Helium 10**; operators do not connect individual accounts. Select the Amazon marketplace, optionally enter up to 10 competitor ASINs, and click **Fetch keywords**. The Hub researches saved child ASINs (or parents when no children exist) directly through Helium 10 MCP.

Review the fetched keywords, apply the existing filters, run tiering, then approve as usual. Acquisition alone does not approve or replace approved keywords. Fetched inputs are saved for resuming the review; failed batches preserve prior inputs. Missing metrics display as dashes. All operators use the shared account; direct fetching requires SEO editing access and consumes the account's Helium 10 allowance. The initial manual CSV upload card has been removed; use direct fetching for project research.

Deployment prerequisite: apply `drizzle/migrations/0102_helium10_connections.sql`, configure the canonical `NEXTAUTH_URL` a stable `NEXTAUTH_SECRET`, and server-only `HELIUM10_CONNECTION_OWNER_ID`, then authorize amazon@marketfoundry.agency from the deployed administrator page. Disconnect removes the Hub's saved credentials; revoke the connected app in Helium 10 to revoke provider-side consent.

- A new SEO project that starts at **S1 Intake**
- Saved pipeline outputs per step (keywords, review analysis, Rufus Q&A, COSMO, final SEO copy)

---

## 6. Step-by-step procedure

### A) Create a new SEO project

1. Go to `/seo`.
2. Click **+ New Project**.
3. Fill out:
   - **Project Name**
   - **Brand Name**
   - (Optional) **Client**
   - (Optional) **Assignee**
4. Click **Create**.
5. You will be taken to `/seo/{projectId}/intake`.

### B) Understand project status indicators

On each project card you’ll see:

- **Current phase** (S1–S6)
- A **dot grid** indicating completion/approval per phase
- **Status** label (e.g., `in_progress`, `completed`)

### C) Rename / duplicate / delete a project

1. Open the project menu (3-dot button) on the project row.
2. Choose:
   - **Rename**
   - **Duplicate**
   - **Change Client**
   - **Delete SEO** (requires confirmation and is permanent)

### D) Change assignee

- If the project is assigned:
  - Admins (and sometimes assignees) can click the assignee chip/avatar and pick a new assignee.
- If unassigned:
  - Non-admins can usually **Claim** the project.
  - Admins can **Assign** to anyone.

---

## 7. Common issues / troubleshooting

- **I don’t see the SEO section in the sidebar**
  - **Cause**: `seo` not enabled in your allowed sections
  - **Fix**: ask an admin to add `seo`

- **Project creation sends me to Intake but I can’t progress**
  - **Cause**: missing required inputs for the next step (ASINs/docs/etc.)
  - **Fix**: follow the S1 SOP and ensure required fields are complete

Production encryption: HELIUM10_ENCRYPTION_KEY stores the Helium-only derived encryption key separately from the Hub login secret. HELIUM10_CONNECTION_OWNER_ID selects the shared credentials row.

Reconnection: every internal user with SEO section access, including viewers, can click Reconnect in S2 when disconnected. The button starts OAuth directly and returns to the originating project. Use only amazon@marketfoundry.agency. Explicit disconnection remains administrator-only.
