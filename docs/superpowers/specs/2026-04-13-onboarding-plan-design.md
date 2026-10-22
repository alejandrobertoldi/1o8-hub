# Client Onboarding Plan — Design Spec

**Date:** 2026-04-13
**Approach:** Refactor in-place (Approach A)
**Scope:** Define canonical onboarding process + align code to match

## Overview

Restructure the existing onboarding system from a 22-step service-grouped layout to an 11-step chronologically-ordered checklist. Both AIA (Already In Amazon — import existing products) and NTA (New To Amazon — upload products later) share the same onboarding steps. The difference between AIA and NTA manifests in the Gantt timeline work (content creation, listing uploads), not in the onboarding checklist.

## Canonical Onboarding Steps

| #   | Step                          | Sub-steps            | Automation                                                    | Parent Key       |
|-----|-------------------------------|----------------------|---------------------------------------------------------------|------------------|
| 1   | Create Client                 | —                    | Auto-completed on client creation                             | —                |
| 2   | Assign Team                   | —                    | Manual                                                        | —                |
| 3   | Setup Asana Project           | —                    | Automated (creates Asana project)                             | —                |
| 4   | Setup Starting Day & Timeline | —                    | Combined: saves date + auto-inits Gantt from AIA/NTA template | —                |
| 5   | Add Client Users              | 4 sub-steps          | Parent auto-completes when all sub-steps done                 | `client_users`   |
| 5a  | — Add Contact Emails          | —                    | Manual (auto-completes if AAC has contacts)                   | —                |
| 5b  | — Add User to 1o8Hub          | —                    | Manual                                                        | —                |
| 5c  | — Assign Client Role          | —                    | Manual                                                        | —                |
| 5d  | — Assign Client Project       | —                    | Manual                                                        | —                |
| 6   | Create Drive Folders          | —                    | Automated (creates folder tree in Drive)                      | —                |
| 7   | Send Onboarding Email         | —                    | Automated (sends via Resend)                                  | —                |
| 8   | Amazon Access                 | 2 sub-steps          | Parent auto-completes when all sub-steps done                 | `amazon_access`  |
| 8a  | — Request Amazon Access       | —                    | Manual (automation planned later)                             | —                |
| 8b  | — Provide Team Access         | —                    | Manual (automation planned later)                             | —                |
| 9   | Setup Intentwise              | 4 sub-steps (+1 VC-only) | Parent auto-completes when all applicable sub-steps done  | `intentwise`     |
| 9a  | — Add Sponsored Ads           | —                    | Manual (automation planned later)                             | —                |
| 9b  | — Add Seller Central          | —                    | Manual (automation planned later)                             | —                |
| 9c  | — Add Vendor Central          | —                    | Manual; VC clients only (`marketplaceFilter: "VC"`)           | —                |
| 9d  | — Get ID                      | —                    | Auto-completes if AAC has IntentwiseID                        | —                |
| 9e  | — Request Enable              | —                    | Manual (automation planned later)                             | —                |
| 10  | Setup Intentwise AMC          | 3 sub-steps          | Parent auto-completes when all sub-steps done                 | `intentwise_amc` |
| 10a | — Add Account                 | —                    | Manual (automation planned later)                             | —                |
| 10b | — Get ID                      | —                    | Auto-completes if AAC has IntentwiseIDAMC                     | —                |
| 10c | — Request Enable              | —                    | Manual (automation planned later)                             | —                |
| 11  | Setup FeedbackWhiz            | —                    | Manual (automation planned later)                             | —                |

## Rules

- **No strict ordering**: Steps are numbered chronologically as a suggested sequence, but AMs can complete them in any order.
- **Parent auto-complete**: When all applicable sub-steps under a parent are `completed`, the parent is automatically marked `completed`. Filtered-out sub-steps (e.g., Vendor Central for non-VC clients) are excluded from the count.
- **Expandable**: New steps can be added by appending to the `ONBOARDING_STEPS` array with a new `order` value. The system supports `marketplaceFilter` for conditional steps.

## Step Key Remapping

Only one key changes: `set_starting_day` → `setup_timeline`.

All other keys remain identical — the change is in ordering (`order` field) and grouping (`parent` field), not in key names.

**Migration SQL:**
```sql
UPDATE client_onboarding_steps
SET step_key = 'setup_timeline'
WHERE step_key = 'set_starting_day';
```

## Combined "Setup Timeline" Step (Step 4)

When the AM completes step 4:

1. **Set the starting day** — saves `onboardingDate` on the AAC record (existing behavior)
2. **Auto-initialize Gantt** — creates `client_gantt_tasks` from the AIA/NTA template (currently a separate "Initialize Timeline" button)

API behavior:
- The `PATCH /api/clients/[clientIdCode]/onboarding/setup_timeline` handler saves the date AND calls Gantt initialization.
- If Gantt tasks already exist for this client, skip re-initialization (only update the date).
- The step auto-completes once the date is set and Gantt tasks exist.

## Parent Auto-Complete Logic

Lives in the API layer (not DB). After marking a sub-step complete:

1. Look up the sub-step's `parent` group from `ONBOARDING_STEPS`.
2. Find all sibling steps with the same `parent`.
3. Filter out steps excluded by `marketplaceFilter`.
4. If all remaining siblings have status `completed`, return the parent group as `completed`.

Parent status is computed, not stored — no DB rows for parent groups.

## Asana Task Structure

The `buildSections()` function in `create-asana-project.ts` creates Onboarding tasks with numbered prefixes:

```
{CIC} | Onboarding | 01. Create Client
{CIC} | Onboarding | 02. Assign Team
{CIC} | Onboarding | 03. Setup Asana Project
{CIC} | Onboarding | 04. Setup Starting Day & Timeline
{CIC} | Onboarding | 05. Client Users | Add Contact Emails
{CIC} | Onboarding | 05. Client Users | Add User to 1o8Hub
{CIC} | Onboarding | 05. Client Users | Assign Client Role
{CIC} | Onboarding | 05. Client Users | Assign Client Project
{CIC} | Onboarding | 06. Create Drive Folders
{CIC} | Onboarding | 07. Send Onboarding Email
{CIC} | Onboarding | 08. Amazon Access | Request Amazon Access
{CIC} | Onboarding | 08. Amazon Access | Provide Team Access
{CIC} | Onboarding | 09. Intentwise | Add Sponsored Ads
{CIC} | Onboarding | 09. Intentwise | Add Seller Central
{CIC} | Onboarding | 09. Intentwise | Get ID
{CIC} | Onboarding | 09. Intentwise | Request Enable
{CIC} | Onboarding | 10. Intentwise (AMC) | Add Account
{CIC} | Onboarding | 10. Intentwise (AMC) | Get ID
{CIC} | Onboarding | 10. Intentwise (AMC) | Request Enable
{CIC} | Onboarding | 11. FeedbackWhiz | Setup FeedbackWhiz
```

SEO, PPC, Design, Recurring Tasks, Others sections remain unchanged.

`STEP_TO_ASANA_TASK` mapping updated to match the numbered naming.

## Files to Modify

| File                                                               | Change                                                                                                                                                                      |
|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/lib/onboarding/steps.ts`                                      | Rewrite `ONBOARDING_STEPS` to 11-step structure with new `order` values and `parent` assignments. Rename `set_starting_day` → `setup_timeline`. Update `STEP_TO_GANTT` mapping. |
| `src/lib/onboarding/create-asana-project.ts`                       | Update `buildSections()` Onboarding tasks to numbered 11-step format. Update `STEP_TO_ASANA_TASK` mapping.                                                                  |
| `src/app/api/clients/[clientIdCode]/onboarding/[stepKey]/route.ts` | Add parent auto-complete logic. In `setup_timeline` handler, add Gantt auto-initialization after saving the date.                                                           |
| `src/app/api/clients/[clientIdCode]/onboarding/route.ts`           | Update step merging to compute parent group status from sub-steps.                                                                                                          |
| `src/app/clients/[clientIdCode]/onboarding/page.tsx`               | Update UI grouping to reflect new chronological order and numbered sections.                                                                                                |
| `src/lib/onboarding/sync-gantt.ts`                                 | Update key reference from `set_starting_day` to `setup_timeline`.                                                                                                           |
| Migration SQL file                                                 | `UPDATE client_onboarding_steps SET step_key = 'setup_timeline' WHERE step_key = 'set_starting_day'`                                                                        |

## What Stays Unchanged

- DB schema (`client_onboarding_steps`, `client_gantt_tasks`, `gantt_templates`)
- Gantt chart component and templates (`client-gantt.tsx`, `gantt-templates.ts`)
- Drive folder creation logic (`create-drive-folders.ts`, `folder-tree.ts`)
- Onboarding email template and send logic
- Portal timeline view
- Asana webhook/sync logic (`asana-sync.ts`)
- Onboarding overview page (`/onboarding`)

## SOP: Account Manager Onboarding Process

### For both AIA and NTA clients:

1. **Create Client** — Go to `/onboarding`, click "New Client". Enter client ID code, name, and type (AIA/NTA).
2. **Assign Team** — On the client onboarding page, assign team members (Account Manager, Executive Strategist, etc.). Remaining tasks auto-assign to the AM.
3. **Setup Asana Project** — Click "Setup Asana". Creates the project in Asana with all sections and tasks.
4. **Setup Starting Day & Timeline** — Pick the onboarding start date. This saves the date AND initializes the 13-week Gantt timeline from the AIA/NTA template. The AM should then go to the Timeline tab to refine task dates/assignments.
5. **Add Client Users** — Complete all 4 sub-steps:
   - Add the client's contact email(s) to their AAC record
   - Add their Gmail account(s) in Admin → Users
   - Set their role to "client"
   - Link them to their client project (assign clientIdCode)
6. **Create Drive Folders** — Click "Create Folders". Auto-creates the full folder structure in Google Drive.
7. **Send Onboarding Email** — Click "Send Email". Sends the welcome email with portal overview and asset requirements.
8. **Amazon Access** — Request Seller Central access from the client, then distribute access to the 1o8 team.
9. **Setup Intentwise** — Add Sponsored Ads account, add Seller Central account, get the advertiser ID, and request Enable status.
10. **Setup Intentwise AMC** — Add AMC account, get the AMC ID, and request Enable status.
11. **Setup FeedbackWhiz** — Configure review monitoring for the client's products.

### AIA-specific (after onboarding):
- Import existing products from Amazon into 1o8Hub

### NTA-specific (after onboarding):
- Upload products to Amazon (handled in later phases via the Gantt timeline)
