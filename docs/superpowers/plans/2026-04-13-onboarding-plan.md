# Client Onboarding Plan Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the onboarding system from 22 service-grouped steps to 11 chronologically-ordered steps with parent auto-complete logic.

**Architecture:** Refactor in-place — rewrite step definitions, update API endpoints to handle combined setup_timeline step and parent auto-complete, update Asana task naming, and migrate one DB key.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, PostgreSQL, Asana API, React/TanStack Query

---

## File Structure

| File                                                               | Action | Responsibility                                |
|--------------------------------------------------------------------|--------|-----------------------------------------------|
| `src/lib/onboarding/steps.ts`                                      | Modify | Step definitions, STEP_TO_GANTT mapping       |
| `src/lib/onboarding/sync-gantt.ts`                                 | Modify | Key reference rename                          |
| `src/lib/onboarding/create-asana-project.ts`                       | Modify | Asana task naming, STEP_TO_ASANA_TASK         |
| `src/app/api/clients/[clientIdCode]/onboarding/[stepKey]/route.ts` | Modify | setup_timeline handler + parent auto-complete |
| `src/app/api/clients/[clientIdCode]/onboarding/route.ts`           | Modify | Parent group status computation in GET        |
| `src/app/clients/[clientIdCode]/onboarding/page.tsx`               | Modify | UI reorder + numbered section headers         |
| `drizzle/migrations/0035_rename_starting_day.sql`                  | Create | step_key rename migration                     |

---

### Task 1: Migration SQL — rename step key

**Files:**
- Create: `drizzle/migrations/0035_rename_starting_day.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Rename set_starting_day → setup_timeline in existing onboarding data
UPDATE client_onboarding_steps
SET step_key = 'setup_timeline'
WHERE step_key = 'set_starting_day';
```

- [ ] **Step 2: Run the migration**

Run: `npx drizzle-kit push` or apply manually via Supabase SQL editor.
Expected: Rows with `set_starting_day` now have `setup_timeline`.

- [ ] **Step 3: Commit**

```bash
git add drizzle/migrations/0035_rename_starting_day.sql
git commit -m "chore: migration to rename set_starting_day → setup_timeline"
```

---

### Task 2: Rewrite step definitions in steps.ts

**Files:**
- Modify: `src/lib/onboarding/steps.ts`

- [ ] **Step 1: Replace ONBOARDING_STEPS array**

Replace the entire `ONBOARDING_STEPS` array with this new 11-step structure. The key changes: reordered chronologically, `set_starting_day` renamed to `setup_timeline`, `add_contact_emails` moved under `client_users` parent, all `order` values renumbered.

```typescript
export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  // ── Step 1: Create Client ──
  {
    key: "create_client",
    label: "Create Client",
    description: "Create the client record in the app with ID code, name, and status.",
    order: 1,
    parent: "create_client",
  },
  // ── Step 2: Assign Team ──
  {
    key: "assign_team",
    label: "Assign Team",
    description: "Assign team roles for this client. Once assigned, remaining onboarding tasks are auto-assigned to the Account Manager (1o8M), except FeedbackWhiz which goes to the Executive Strategist.",
    order: 2,
    parent: "assign_team",
  },
  // ── Step 3: Setup Asana Project ──
  {
    key: "setup_asana",
    label: "Setup Asana Project",
    description: "Create a project in Asana under 1o8 Marketplace with onboarding, content, and PPC sections.",
    order: 3,
    parent: "setup_asana",
  },
  // ── Step 4: Setup Starting Day & Timeline ──
  {
    key: "setup_timeline",
    label: "Setup Starting Day & Timeline",
    description: "Set the onboarding start date and initialize the 13-week Gantt timeline from the AIA/NTA template.",
    order: 4,
    parent: "setup_timeline",
  },
  // ── Step 5: Add Client Users (4 sub-steps) ──
  {
    key: "add_contact_emails",
    label: "Add Contact Email(s)",
    description: "Enter the client's contact email address(es) for portal access and communication.",
    order: 5,
    parent: "client_users",
  },
  {
    key: "hub_add_user",
    label: "Add Client Account(s)",
    description: "Add client's Gmail account(s) to 1o8Hub Users section (Admin → Users).",
    order: 5.1,
    parent: "client_users",
  },
  {
    key: "hub_assign_role",
    label: "Assign Client Role",
    description: "Set user role to 'client' in Admin → Users.",
    order: 5.2,
    parent: "client_users",
  },
  {
    key: "hub_assign_client",
    label: "Assign Client Project",
    description: "Link the user to their client account (assign clientIdCode).",
    order: 5.3,
    parent: "client_users",
  },
  // ── Step 6: Create Drive Folders ──
  {
    key: "drive_folders",
    label: "Create Drive Folders",
    description: "Create the full folder tree in Google Drive for client assets, graphics, SEO, PPC, and documentation.",
    order: 6,
    parent: "drive_folders",
  },
  // ── Step 7: Send Onboarding Email ──
  {
    key: "send_onboarding_email",
    label: "Send Onboarding Email",
    description: "Send the welcome email to the client with portal info, strategy overview, and onboarding requirements.",
    order: 7,
    parent: "send_onboarding_email",
  },
  // ── Step 8: Amazon Access (2 sub-steps) ──
  {
    key: "amazon_access_request",
    label: "Request Amazon Access",
    description: "Request access to Amazon Seller Central from the client.",
    order: 8,
    parent: "amazon_access",
  },
  {
    key: "amazon_access_team",
    label: "Provide Team Access",
    description: "Provide team members access to Amazon Seller Central.",
    order: 8.1,
    parent: "amazon_access",
  },
  // ── Step 9: Setup Intentwise (4-5 sub-steps) ──
  {
    key: "iw_add_sponsored_ads",
    label: "Add Sponsored Ads",
    description: "Add client's Amazon Sponsored Ads account in Intentwise.",
    order: 9,
    parent: "intentwise",
  },
  {
    key: "iw_add_seller_central",
    label: "Add Seller Central",
    description: "Add client's Amazon Seller Central account in Intentwise.",
    order: 9.1,
    parent: "intentwise",
  },
  {
    key: "iw_add_vendor_central",
    label: "Add Vendor Central",
    description: "Add client's Amazon Vendor Central account in Intentwise (VC clients only).",
    order: 9.2,
    parent: "intentwise",
    marketplaceFilter: "VC",
  },
  {
    key: "intentwise_id_provided",
    label: "Get ID",
    description: "Enter the Intentwise advertiser ID after account is added.",
    order: 9.3,
    parent: "intentwise",
  },
  {
    key: "iw_enabled",
    label: "Request Enable",
    description: "Request account status set to Enabled in Intentwise.",
    order: 9.4,
    parent: "intentwise",
  },
  // ── Step 10: Setup Intentwise AMC (3 sub-steps) ──
  {
    key: "iw_amc_add_account",
    label: "Add Account",
    description: "Add client's Amazon Marketing Cloud account in Intentwise AMC.",
    order: 10,
    parent: "intentwise_amc",
  },
  {
    key: "intentwise_amc_id_provided",
    label: "Get ID",
    description: "Enter the Intentwise AMC ID after account is added.",
    order: 10.1,
    parent: "intentwise_amc",
  },
  {
    key: "iw_amc_enabled",
    label: "Request Enable",
    description: "Request AMC account status set to Enabled in Intentwise.",
    order: 10.2,
    parent: "intentwise_amc",
  },
  // ── Step 11: Setup FeedbackWhiz ──
  {
    key: "feedbackwhiz",
    label: "Setup FeedbackWhiz",
    description: "Set up FeedbackWhiz review monitoring for the client's products.",
    order: 11,
    parent: "feedbackwhiz_group",
  },
];
```

- [ ] **Step 2: Update STEP_TO_GANTT mapping**

Replace the `STEP_TO_GANTT` record. The only key change is `set_starting_day` → `setup_timeline`:

```typescript
export const STEP_TO_GANTT: Record<string, { taskName: string; subtaskTitle?: string }> = {
  create_client:         { taskName: "Create Client" },
  assign_team:           { taskName: "Assign Team" },
  add_contact_emails:    { taskName: "Client Users", subtaskTitle: "Add Contact Emails" },
  setup_timeline:        { taskName: "Setup Starting Day" },
  drive_folders:         { taskName: "Create Drive Folders" },
  send_onboarding_email: { taskName: "Send Onboarding Email" },
  hub_add_user:          { taskName: "Client Users", subtaskTitle: "Add Users to 1o8Hub" },
  hub_assign_role:       { taskName: "Client Users", subtaskTitle: "Assign Client Role" },
  hub_assign_client:     { taskName: "Client Users", subtaskTitle: "Assign Client Project" },
  setup_asana:           { taskName: "Setup Asana Project" },
  amazon_access_request: { taskName: "Amazon Access", subtaskTitle: "Request Amazon Access" },
  amazon_access_team:    { taskName: "Amazon Access", subtaskTitle: "Provide Team Access" },
  iw_add_sponsored_ads:  { taskName: "Intentwise", subtaskTitle: "Add Sponsored Ads" },
  iw_add_seller_central: { taskName: "Intentwise", subtaskTitle: "Add Seller Central" },
  iw_add_vendor_central: { taskName: "Intentwise", subtaskTitle: "Add Vendor Central" },
  intentwise_id_provided:{ taskName: "Intentwise", subtaskTitle: "Get ID" },
  iw_enabled:            { taskName: "Intentwise", subtaskTitle: "Request Enable" },
  iw_amc_add_account:    { taskName: "Intentwise (AMC)", subtaskTitle: "Add Account" },
  intentwise_amc_id_provided: { taskName: "Intentwise (AMC)", subtaskTitle: "Get ID" },
  iw_amc_enabled:        { taskName: "Intentwise (AMC)", subtaskTitle: "Request Enable" },
  feedbackwhiz:          { taskName: "FeedbackWhiz", subtaskTitle: "Setup FeedbackWhiz" },
};
```

- [ ] **Step 3: Add parent group helpers**

Add these exports after `STEP_TO_GANTT`:

```typescript
/** Parent groups that have sub-steps — used for auto-complete logic */
export const PARENT_GROUPS = ["client_users", "amazon_access", "intentwise", "intentwise_amc"] as const;

/** Display labels for parent groups (shown in UI as section headers) */
export const PARENT_GROUP_LABELS: Record<string, { order: number; label: string }> = {
  create_client:     { order: 1, label: "1. Create Client" },
  assign_team:       { order: 2, label: "2. Assign Team" },
  setup_asana:       { order: 3, label: "3. Setup Asana Project" },
  setup_timeline:    { order: 4, label: "4. Setup Starting Day & Timeline" },
  client_users:      { order: 5, label: "5. Add Client Users" },
  drive_folders:     { order: 6, label: "6. Create Drive Folders" },
  send_onboarding_email: { order: 7, label: "7. Send Onboarding Email" },
  amazon_access:     { order: 8, label: "8. Amazon Access" },
  intentwise:        { order: 9, label: "9. Setup Intentwise" },
  intentwise_amc:    { order: 10, label: "10. Setup Intentwise AMC" },
  feedbackwhiz_group:{ order: 11, label: "11. Setup FeedbackWhiz" },
};

/** Get all steps belonging to a parent group */
export function getStepsForParent(parentKey: string): OnboardingStepDef[] {
  return ONBOARDING_STEPS.filter((s) => s.parent === parentKey);
}

/** Check if a parent group is a multi-step group (has >1 sub-steps) */
export function isMultiStepParent(parentKey: string): boolean {
  return (PARENT_GROUPS as readonly string[]).includes(parentKey);
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/steps.ts
git commit -m "feat(onboarding): rewrite step definitions to 11-step chronological structure"
```

---

### Task 3: Update sync-gantt.ts key reference

**Files:**
- Modify: `src/lib/onboarding/sync-gantt.ts`

- [ ] **Step 1: No code changes needed**

`sync-gantt.ts` imports `STEP_TO_GANTT` from `steps.ts` and uses the step key as a lookup key. Since the mapping was already updated in Task 2 (the `setup_timeline` key is in the new `STEP_TO_GANTT`), no changes needed in this file. The old `set_starting_day` key no longer exists in `STEP_TO_GANTT`, and the DB was migrated in Task 1.

- [ ] **Step 2: Verify no hardcoded references**

Run: `grep -r "set_starting_day" src/`
Expected: Zero matches (all references should now use `setup_timeline`).

---

### Task 4: Update the step API — rename handler + add Gantt init

**Files:**
- Modify: `src/app/api/clients/[clientIdCode]/onboarding/[stepKey]/route.ts`

- [ ] **Step 1: Add Gantt initialization imports**

At the top of the file, add these imports alongside the existing ones:

```typescript
import { clientGanttTasks, ganttTemplates } from "@/lib/db/schema";
import { AIA_TASKS, NTA_TASKS } from "@/lib/gantt-templates";
```

Note: `clientGanttTasks` is already imported, but `ganttTemplates`, `AIA_TASKS`, and `NTA_TASKS` are new.

- [ ] **Step 2: Rename the set_starting_day handler to setup_timeline**

In the POST function, find the block:

```typescript
  // ── Set Starting Day — save to aac.onboardingDate ──
  if (stepKey === "set_starting_day") {
```

Replace the entire block (from that comment to its closing `}`) with:

```typescript
  // ── Setup Timeline — save date + auto-init Gantt ──
  if (stepKey === "setup_timeline") {
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";

    if (!startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    const date = new Date(startDate);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Save onboarding date
    await db
      .update(aac)
      .set({ onboardingDate: date, updatedAt: new Date() })
      .where(eq(aac.clientIdCode, clientIdCode));

    // Auto-initialize Gantt if not already done
    const existingTasks = await db
      .select({ id: clientGanttTasks.id })
      .from(clientGanttTasks)
      .where(eq(clientGanttTasks.clientIdCode, clientIdCode))
      .limit(1);

    let ganttInitialized = existingTasks.length > 0;

    if (!ganttInitialized) {
      // Determine template type from AAC
      const [client] = await db
        .select({ clientType: aac.clientType })
        .from(aac)
        .where(eq(aac.clientIdCode, clientIdCode))
        .limit(1);

      const templateType = client?.clientType ?? "AIA";
      const seeds = templateType === "NTA" ? NTA_TASKS : AIA_TASKS;

      // Ensure templates are seeded
      const templateRows = await db.select().from(ganttTemplates).where(eq(ganttTemplates.templateType, templateType));
      let templateMap = new Map(templateRows.map((t) => [t.wbs, t.id]));
      if (templateRows.length === 0) {
        const inserted = await db.insert(ganttTemplates).values(seeds).returning();
        templateMap = new Map(inserted.map((t) => [t.wbs, t.id]));
      }

      // Create client tasks (snapshot from template)
      const taskValues = seeds.map((t) => ({
        clientIdCode,
        templateTaskId: templateMap.get(t.wbs) ?? null,
        wbs: t.wbs,
        section: t.section,
        taskName: t.taskName,
        subtaskTitle: t.subtaskTitle ?? null,
        weekStart: t.weekStart,
        weekEnd: t.weekEnd,
        startDay: t.startDay,
        durationDays: t.durationDays,
        status: "pending" as const,
        completionPct: 0,
      }));

      await db.insert(clientGanttTasks).values(taskValues);
      ganttInitialized = true;
    }

    // Mark step completed
    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: { startDate, ganttInitialized },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: { startDate, ganttInitialized },
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, stepKey);
    syncAsanaCompletion(clientIdCode, stepKey, true);
    return NextResponse.json({ success: true, status: "completed", startDate, ganttInitialized });
  }
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/[clientIdCode]/onboarding/[stepKey]/route.ts
git commit -m "feat(onboarding): combine setup_timeline step — date + Gantt init"
```

---

### Task 5: Add parent auto-complete logic to GET API

**Files:**
- Modify: `src/app/api/clients/[clientIdCode]/onboarding/route.ts`

- [ ] **Step 1: Import parent group helpers**

Add to the imports from `steps.ts`:

```typescript
import { ONBOARDING_STEPS, PARENT_GROUP_LABELS, isMultiStepParent, getStepsForParent } from "@/lib/onboarding/steps";
```

Remove the old import of just `ONBOARDING_STEPS`.

- [ ] **Step 2: Add parent status computation after the steps array is built**

After the existing `const steps = applicableSteps.map(...)` block (around line 97-163), and before the `return NextResponse.json(...)`, add:

```typescript
  // Compute parent group statuses
  const parentGroups = new Map<string, {
    label: string;
    order: number;
    isMultiStep: boolean;
    status: "pending" | "in_progress" | "completed";
  }>();

  for (const [parentKey, meta] of Object.entries(PARENT_GROUP_LABELS)) {
    const multiStep = isMultiStepParent(parentKey);
    const children = steps.filter((s) => s.parent === parentKey);

    let status: "pending" | "in_progress" | "completed" = "pending";
    if (children.length > 0) {
      const allCompleted = children.every((s) => s.status === "completed");
      const anyStarted = children.some((s) => s.status === "completed" || s.status === "in_progress");
      if (allCompleted) status = "completed";
      else if (anyStarted) status = "in_progress";
    }

    parentGroups.set(parentKey, {
      label: meta.label,
      order: meta.order,
      isMultiStep: multiStep,
      status,
    });
  }

  const groups = Object.fromEntries(parentGroups);
```

- [ ] **Step 3: Update the return to include groups**

Change the return statement from:

```typescript
  return NextResponse.json({ clientIdCode, steps });
```

to:

```typescript
  return NextResponse.json({ clientIdCode, steps, groups });
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clients/[clientIdCode]/onboarding/route.ts
git commit -m "feat(onboarding): add parent group status computation to GET API"
```

---

### Task 6: Update Asana task structure

**Files:**
- Modify: `src/lib/onboarding/create-asana-project.ts`

- [ ] **Step 1: Update buildSections() Onboarding tasks**

Replace the `tasks` array inside the first section object (the Onboarding section) in the `buildSections` function. Change from the current unnumbered format to numbered:

```typescript
  return [
    {
      name: `${cic} | Onboarding`,
      tasks: [
        { name: p3("Onboarding", "01. Create Client"), notes: "Create client record in 1o8Hub with ID code, name, and status" },
        { name: p3("Onboarding", "02. Assign Team"), notes: "Assign team roles — auto-assigns remaining onboarding tasks to Account Manager (1o8M)" },
        { name: p3("Onboarding", "03. Setup Asana Project"), notes: "Create Asana project under 1o8 Marketplace" },
        { name: p3("Onboarding", "04. Setup Starting Day & Timeline"), notes: "Set onboarding start date and initialize 13-week Gantt timeline" },
        { name: p4("Onboarding", "05. Client Users", "Add Contact Emails"), notes: "Enter client contact email(s) for portal access and communication" },
        { name: p4("Onboarding", "05. Client Users", "Add User to 1o8Hub"), notes: "Add client Gmail account(s) to 1o8Hub Users" },
        { name: p4("Onboarding", "05. Client Users", "Assign Client Role"), notes: "Set user role to 'client' in Admin → Users" },
        { name: p4("Onboarding", "05. Client Users", "Assign Client Project"), notes: "Link user to their client account (assign clientIdCode)" },
        { name: p3("Onboarding", "06. Create Drive Folders"), notes: "Create full folder tree in Google Drive for assets, SEO, PPC, docs" },
        { name: p3("Onboarding", "07. Send Onboarding Email"), notes: "Send welcome email with portal info, strategy overview, requirements" },
        { name: p4("Onboarding", "08. Amazon Access", "Request Amazon Access"), notes: "Request access to Amazon Seller Central from client" },
        { name: p4("Onboarding", "08. Amazon Access", "Provide Team Access"), notes: "Provide team members access to Amazon Seller Central" },
        { name: p4("Onboarding", "09. Intentwise", "Add Sponsored Ads"), notes: "Add Sponsored Ads account in Intentwise" },
        { name: p4("Onboarding", "09. Intentwise", "Add Seller Central"), notes: "Add Seller Central account in Intentwise" },
        { name: p4("Onboarding", "09. Intentwise", "Get ID"), notes: "Get Intentwise advertiser ID" },
        { name: p4("Onboarding", "09. Intentwise", "Request Enable"), notes: "Request Enable status in Intentwise" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Add Account"), notes: "Add AMC account in Intentwise" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Get ID"), notes: "Get Intentwise AMC ID" },
        { name: p4("Onboarding", "10. Intentwise (AMC)", "Request Enable"), notes: "Request Enable status for AMC" },
        { name: p4("Onboarding", "11. FeedbackWhiz", "Setup FeedbackWhiz"), notes: "Set up FeedbackWhiz review monitoring" },
      ],
    },
    // ... SEO, PPC, Design, Recurring, Others sections stay unchanged
```

- [ ] **Step 2: Update STEP_TO_ASANA_TASK mapping**

Replace the entire `STEP_TO_ASANA_TASK` record:

```typescript
export const STEP_TO_ASANA_TASK: Record<string, string> = {
  create_client: "01. Create Client",
  assign_team: "02. Assign Team",
  setup_timeline: "04. Setup Starting Day & Timeline",
  add_contact_emails: "05. Client Users | Add Contact Emails",
  drive_folders: "06. Create Drive Folders",
  send_onboarding_email: "07. Send Onboarding Email",
  hub_add_user: "05. Client Users | Add User to 1o8Hub",
  hub_assign_role: "05. Client Users | Assign Client Role",
  hub_assign_client: "05. Client Users | Assign Client Project",
  setup_asana: "03. Setup Asana Project",
  amazon_access_request: "08. Amazon Access | Request Amazon Access",
  amazon_access_team: "08. Amazon Access | Provide Team Access",
  iw_add_sponsored_ads: "09. Intentwise | Add Sponsored Ads",
  iw_add_seller_central: "09. Intentwise | Add Seller Central",
  iw_add_vendor_central: "09. Intentwise | Add Seller Central",
  intentwise_id_provided: "09. Intentwise | Get ID",
  iw_enabled: "09. Intentwise | Request Enable",
  iw_amc_add_account: "10. Intentwise (AMC) | Add Account",
  intentwise_amc_id_provided: "10. Intentwise (AMC) | Get ID",
  iw_amc_enabled: "10. Intentwise (AMC) | Request Enable",
  feedbackwhiz: "11. FeedbackWhiz | Setup FeedbackWhiz",
};
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/onboarding/create-asana-project.ts
git commit -m "feat(onboarding): update Asana task structure to numbered 11-step format"
```

---

### Task 7: Update onboarding page UI

**Files:**
- Modify: `src/app/clients/[clientIdCode]/onboarding/page.tsx`

This is the largest change. The page currently renders steps grouped by service (1o8hub, asana, amazon_access, etc.). It needs to render them grouped by the new `PARENT_GROUP_LABELS` order, with numbered section headers and parent auto-complete indicators.

- [ ] **Step 1: Import the new parent group data**

Add imports at the top:

```typescript
import { PARENT_GROUP_LABELS, isMultiStepParent } from "@/lib/onboarding/steps";
```

- [ ] **Step 2: Add groups to the OnboardingResponse type**

Update the type:

```typescript
interface OnboardingResponse {
  clientIdCode: string;
  steps: OnboardingStep[];
  groups: Record<string, {
    label: string;
    order: number;
    isMultiStep: boolean;
    status: "pending" | "in_progress" | "completed";
  }>;
}
```

- [ ] **Step 3: Update the rendering logic**

The existing page groups steps by `parent` field and renders each group. Update the grouping to use `PARENT_GROUP_LABELS` ordering. The core change is:

1. Sort groups by `order` field from `PARENT_GROUP_LABELS`
2. For each group, render a section header with the numbered label (e.g., "5. Add Client Users")
3. For multi-step parents, show a parent status badge (computed from `groups` response)
4. Render sub-steps indented under the parent header

The specific rendering code depends on the existing page structure (which is ~700+ lines). The key principle: replace the current `parent` grouping keys (e.g., `"1o8hub"`, `"asana"`, `"amazon_access"`) with the new keys from `PARENT_GROUP_LABELS`, and use the `groups` data from the API for parent status.

- [ ] **Step 4: Test in browser**

Run: `PORT=3000 npm run dev`
Navigate to: `http://localhost:3000/clients/{any-client}/onboarding`
Expected: Steps appear in numbered chronological order (1-11), with sub-steps grouped under parent headers. Parent groups show auto-complete status.

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/[clientIdCode]/onboarding/page.tsx
git commit -m "feat(onboarding): update UI to numbered 11-step chronological layout"
```

---

### Task 8: Update Gantt auto-assign to use new step key

**Files:**
- Modify: `src/app/api/clients/[clientIdCode]/gantt/route.ts`

- [ ] **Step 1: Verify no hardcoded `set_starting_day` references**

The `autoAssignAfterInit` function iterates `ONBOARDING_STEPS` (imported from steps.ts), so it picks up the new step definitions automatically. No code changes needed.

Run: `grep -r "set_starting_day" src/app/api/clients/`
Expected: Zero matches.

- [ ] **Step 2: Commit (if any changes were needed)**

No commit needed if grep is clean.

---

### Task 9: Final verification

- [ ] **Step 1: Build check**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Grep for stale references**

Run: `grep -r "set_starting_day" src/`
Expected: Zero matches.

- [ ] **Step 3: Test onboarding flow in browser**

Run: `PORT=3000 npm run dev`

Test checklist:
1. Go to `/onboarding` — client list loads with progress bars
2. Click a client — steps appear in 1-11 order with numbered headers
3. Steps with sub-steps (5, 8, 9, 10) show collapsible groups
4. Complete all sub-steps of a group — parent auto-completes
5. Setup Timeline step (4) — pick a date, verify Gantt initializes
6. Verify Gantt chart (Timeline tab) shows tasks after step 4 completion

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(onboarding): complete 11-step restructure with parent auto-complete"
```
