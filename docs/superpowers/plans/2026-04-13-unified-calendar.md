# Unified Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `/calendar` page with a database-driven unified calendar that aggregates events from 5 domain layers (Holidays, SEO, Design, PPC, Onboarding) into Month/Week/Agenda views, serving both internal team and portal clients.

**Architecture:** Single API endpoint (`GET /api/calendar/events`) accepts layer + date-range query params and runs parallel Drizzle queries per layer, normalizing results into a `CalendarEvent[]`. The `CalendarView` client component manages view toggle, layer filters, and renders one of three view sub-components. Portal reuses the same component with scope filtering.

**Tech Stack:** Next.js App Router, Drizzle ORM (PostgreSQL), React 19, Tailwind CSS 4, shadcn/ui (Radix), lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-13-unified-calendar-design.md`

---

## File Map

| Action  | File                                           | Responsibility                                                       |
|---------|------------------------------------------------|----------------------------------------------------------------------|
| Create  | `src/app/api/calendar/events/route.ts`         | Single API endpoint — layer handlers, date filtering, scope filtering |
| Create  | `src/components/calendar/calendar-view.tsx`     | Main client component — view toggle, layer pills, data fetching      |
| Create  | `src/components/calendar/month-grid.tsx`        | Month grid with colored event chips                                  |
| Create  | `src/components/calendar/week-grid.tsx`         | 7-column week layout with event cards                                |
| Create  | `src/components/calendar/agenda-list.tsx`       | Flat chronological list grouped by date                              |
| Create  | `src/components/calendar/event-popover.tsx`     | Click-to-expand event detail popover                                 |
| Replace | `src/app/calendar/page.tsx`                    | Server shell → renders CalendarView (internal)                       |
| Create  | `src/app/portal/calendar/page.tsx`             | Server shell → renders CalendarView (client-scoped)                  |
| Modify  | `src/components/layout/app-sidebar.tsx`        | Add portal calendar nav item                                         |

---

### Task 1: CalendarEvent Type + Layer Config

**Files:**
- Create: `src/components/calendar/calendar-types.ts`

- [ ] **Step 1: Create the shared types and layer config**

```ts
// src/components/calendar/calendar-types.ts

export type LayerKey = "holiday" | "seo" | "design" | "ppc" | "onboarding";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  layer: LayerKey;
  clientName?: string;
  clientIdCode?: string;
  description?: string;
  linkTo?: string;
}

export type ViewMode = "month" | "week" | "agenda";

export const LAYER_CONFIG: Record<
  LayerKey,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  holiday: {
    label: "Holidays",
    bg: "bg-amber-500/12",
    text: "text-amber-500",
    border: "border-amber-500/25",
    dot: "bg-amber-500",
  },
  seo: {
    label: "SEO",
    bg: "bg-blue-500/12",
    text: "text-blue-500",
    border: "border-blue-500/25",
    dot: "bg-blue-500",
  },
  design: {
    label: "Design",
    bg: "bg-purple-500/12",
    text: "text-purple-500",
    border: "border-purple-500/25",
    dot: "bg-purple-500",
  },
  ppc: {
    label: "PPC",
    bg: "bg-orange-500/12",
    text: "text-orange-500",
    border: "border-orange-500/25",
    dot: "bg-orange-500",
  },
  onboarding: {
    label: "Onboarding",
    bg: "bg-brand/12",
    text: "text-brand",
    border: "border-brand/25",
    dot: "bg-brand",
  },
};

export const ALL_LAYERS: LayerKey[] = ["holiday", "seo", "design", "ppc", "onboarding"];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/calendar-types.ts
git commit -m "feat(calendar): add CalendarEvent type and layer config"
```

---

### Task 2: API Endpoint — Holidays Layer

**Files:**
- Create: `src/app/api/calendar/events/route.ts`

This task creates the API route with param parsing and the holidays layer. Subsequent tasks add the remaining layer handlers to this same file.

- [ ] **Step 1: Create the API route with holidays layer**

```ts
// src/app/api/calendar/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aac,
  seoProjects,
  aplusModules,
  designStatus,
  brandStory,
  master,
  ppcApprovals,
  ppcSnapshots,
  clientGanttTasks,
} from "@/lib/db/schema";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import type { CalendarEvent, LayerKey } from "@/components/calendar/calendar-types";
import { ALL_LAYERS } from "@/components/calendar/calendar-types";

// ── Static holidays + Amazon milestones (migrated from old /calendar page) ──

const HOLIDAYS: CalendarEvent[] = [
  // 2025
  { id: "h-2025-01", title: "New Year's Day", date: "2025-01-01", layer: "holiday" },
  { id: "h-2025-02", title: "MLK Day", date: "2025-01-20", layer: "holiday" },
  { id: "h-2025-03", title: "Valentine's Day", date: "2025-02-14", layer: "holiday" },
  { id: "h-2025-04", title: "Presidents' Day", date: "2025-02-17", layer: "holiday" },
  { id: "h-2025-05", title: "St. Patrick's Day", date: "2025-03-17", layer: "holiday" },
  { id: "h-2025-06", title: "Easter", date: "2025-04-20", layer: "holiday" },
  { id: "h-2025-07", title: "Mother's Day", date: "2025-05-11", layer: "holiday" },
  { id: "h-2025-08", title: "Memorial Day", date: "2025-05-26", layer: "holiday" },
  { id: "h-2025-09", title: "Father's Day", date: "2025-06-15", layer: "holiday" },
  { id: "h-2025-10", title: "Independence Day", date: "2025-07-04", layer: "holiday" },
  { id: "h-2025-prime", title: "Prime Day (Est.)", date: "2025-07-15", layer: "holiday", description: "Amazon Prime Day" },
  { id: "h-2025-bts", title: "Back to School", date: "2025-08-01", layer: "holiday", description: "Back to School season" },
  { id: "h-2025-11", title: "Labor Day", date: "2025-09-01", layer: "holiday" },
  { id: "h-2025-12", title: "Halloween", date: "2025-10-31", layer: "holiday" },
  { id: "h-2025-13", title: "Veterans Day", date: "2025-11-11", layer: "holiday" },
  { id: "h-2025-14", title: "Thanksgiving", date: "2025-11-27", layer: "holiday" },
  { id: "h-2025-bf", title: "Black Friday", date: "2025-11-28", layer: "holiday", description: "Amazon Black Friday" },
  { id: "h-2025-cm", title: "Cyber Monday", date: "2025-12-01", layer: "holiday", description: "Amazon Cyber Monday" },
  { id: "h-2025-15", title: "Christmas", date: "2025-12-25", layer: "holiday" },
  { id: "h-2025-16", title: "New Year's Eve", date: "2025-12-31", layer: "holiday" },
  // 2026
  { id: "h-2026-01", title: "New Year's Day", date: "2026-01-01", layer: "holiday" },
  { id: "h-2026-02", title: "MLK Day", date: "2026-01-19", layer: "holiday" },
  { id: "h-2026-03", title: "Valentine's Day", date: "2026-02-14", layer: "holiday" },
  { id: "h-2026-04", title: "Presidents' Day", date: "2026-02-16", layer: "holiday" },
  { id: "h-2026-05", title: "St. Patrick's Day", date: "2026-03-17", layer: "holiday" },
  { id: "h-2026-06", title: "Easter", date: "2026-04-05", layer: "holiday" },
  { id: "h-2026-07", title: "Mother's Day", date: "2026-05-10", layer: "holiday" },
  { id: "h-2026-08", title: "Memorial Day", date: "2026-05-25", layer: "holiday" },
  { id: "h-2026-09", title: "Father's Day", date: "2026-06-21", layer: "holiday" },
  { id: "h-2026-10", title: "Independence Day", date: "2026-07-04", layer: "holiday" },
  { id: "h-2026-prime", title: "Prime Day (Est.)", date: "2026-07-14", layer: "holiday", description: "Amazon Prime Day" },
  { id: "h-2026-bts", title: "Back to School", date: "2026-08-01", layer: "holiday", description: "Back to School season" },
  { id: "h-2026-11", title: "Labor Day", date: "2026-09-07", layer: "holiday" },
  { id: "h-2026-12", title: "Halloween", date: "2026-10-31", layer: "holiday" },
  { id: "h-2026-13", title: "Veterans Day", date: "2026-11-11", layer: "holiday" },
  { id: "h-2026-14", title: "Thanksgiving", date: "2026-11-26", layer: "holiday" },
  { id: "h-2026-bf", title: "Black Friday", date: "2026-11-27", layer: "holiday", description: "Amazon Black Friday" },
  { id: "h-2026-cm", title: "Cyber Monday", date: "2026-11-30", layer: "holiday", description: "Amazon Cyber Monday" },
  { id: "h-2026-15", title: "Christmas", date: "2026-12-25", layer: "holiday" },
  { id: "h-2026-16", title: "New Year's Eve", date: "2026-12-31", layer: "holiday" },
  // 2027
  { id: "h-2027-01", title: "New Year's Day", date: "2027-01-01", layer: "holiday" },
  { id: "h-2027-02", title: "MLK Day", date: "2027-01-18", layer: "holiday" },
  { id: "h-2027-03", title: "Valentine's Day", date: "2027-02-14", layer: "holiday" },
  { id: "h-2027-04", title: "Presidents' Day", date: "2027-02-15", layer: "holiday" },
  { id: "h-2027-05", title: "St. Patrick's Day", date: "2027-03-17", layer: "holiday" },
  { id: "h-2027-06", title: "Easter", date: "2027-03-28", layer: "holiday" },
  { id: "h-2027-07", title: "Mother's Day", date: "2027-05-09", layer: "holiday" },
  { id: "h-2027-08", title: "Memorial Day", date: "2027-05-31", layer: "holiday" },
  { id: "h-2027-09", title: "Father's Day", date: "2027-06-20", layer: "holiday" },
  { id: "h-2027-10", title: "Independence Day", date: "2027-07-04", layer: "holiday" },
  { id: "h-2027-prime", title: "Prime Day (Est.)", date: "2027-07-13", layer: "holiday", description: "Amazon Prime Day" },
  { id: "h-2027-bts", title: "Back to School", date: "2027-08-01", layer: "holiday", description: "Back to School season" },
  { id: "h-2027-11", title: "Labor Day", date: "2027-09-06", layer: "holiday" },
  { id: "h-2027-12", title: "Halloween", date: "2027-10-31", layer: "holiday" },
  { id: "h-2027-13", title: "Veterans Day", date: "2027-11-11", layer: "holiday" },
  { id: "h-2027-14", title: "Thanksgiving", date: "2027-11-25", layer: "holiday" },
  { id: "h-2027-bf", title: "Black Friday", date: "2027-11-26", layer: "holiday", description: "Amazon Black Friday" },
  { id: "h-2027-cm", title: "Cyber Monday", date: "2027-11-29", layer: "holiday", description: "Amazon Cyber Monday" },
  { id: "h-2027-15", title: "Christmas", date: "2027-12-25", layer: "holiday" },
  { id: "h-2027-16", title: "New Year's Eve", date: "2027-12-31", layer: "holiday" },
];

function getHolidayEvents(from: string, to: string): CalendarEvent[] {
  return HOLIDAYS.filter((h) => h.date >= from && h.date <= to);
}

// ── Layer handlers (SEO, Design, PPC, Onboarding added in Tasks 3-6) ──

type LayerHandler = (from: string, to: string, clientIdCode?: string) => Promise<CalendarEvent[]>;

const layerHandlers: Record<LayerKey, LayerHandler> = {
  holiday: async (from, to) => getHolidayEvents(from, to),
  seo: async () => [], // Task 3
  design: async () => [], // Task 4
  ppc: async () => [], // Task 5
  onboarding: async () => [], // Task 6
};

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to params required" }, { status: 400 });
  }

  const scope = searchParams.get("scope") ?? "internal";
  const layersParam = searchParams.get("layers");
  const requestedLayers: LayerKey[] = layersParam
    ? (layersParam.split(",").filter((l) => ALL_LAYERS.includes(l as LayerKey)) as LayerKey[])
    : ALL_LAYERS;

  // For client scope, resolve clientIdCode from session
  let clientIdCode: string | undefined;
  if (scope === "client") {
    clientIdCode = session.user.clientIdCode?.split(",")[0]?.trim() || undefined;
    if (!clientIdCode) {
      return NextResponse.json({ error: "No client associated" }, { status: 403 });
    }
  }

  const results = await Promise.all(
    requestedLayers.map((layer) => layerHandlers[layer](from, to, clientIdCode))
  );

  const events = results.flat().sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json(events);
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx tsc --noEmit src/app/api/calendar/events/route.ts 2>&1 | head -20`

If there are import issues, fix them. The route should compile clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(calendar): API endpoint with holidays layer and param parsing"
```

---

### Task 3: API — SEO Layer Handler

**Files:**
- Modify: `src/app/api/calendar/events/route.ts`

- [ ] **Step 1: Implement the SEO layer handler**

Replace the `seo: async () => [],` placeholder in `layerHandlers` with:

```ts
  seo: async (from, to, clientFilter) => {
    const rows = await db
      .select({
        id: seoProjects.id,
        clientIdCode: seoProjects.clientIdCode,
        clientName: seoProjects.clientName,
        brandName: seoProjects.brandName,
        s1: seoProjects.s1ApprovedAt,
        s2: seoProjects.s2ApprovedAt,
        s3: seoProjects.s3ApprovedAt,
        s4: seoProjects.s4ApprovedAt,
        s5: seoProjects.s5ApprovedAt,
        s6: seoProjects.s6ApprovedAt,
      })
      .from(seoProjects)
      .where(
        clientFilter
          ? eq(seoProjects.clientIdCode, clientFilter)
          : undefined
      );

    const events: CalendarEvent[] = [];
    const phases = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

    for (const row of rows) {
      const label = row.clientName || row.brandName || row.clientIdCode || "Unknown";
      for (const phase of phases) {
        const ts = row[phase];
        if (!ts) continue;
        const d = ts.toISOString().slice(0, 10);
        if (d < from || d > to) continue;
        events.push({
          id: `seo-${row.id}-${phase}`,
          title: `${label} — ${phase.toUpperCase()} Approved`,
          date: d,
          layer: "seo",
          clientName: row.clientName ?? undefined,
          clientIdCode: row.clientIdCode ?? undefined,
          description: `SEO phase ${phase.toUpperCase()} approved`,
          linkTo: row.clientIdCode ? `/seo/clients/${row.clientIdCode}` : undefined,
        });
      }
    }
    return events;
  },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/app/api/calendar/events/route.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(calendar): SEO layer handler — S1-S6 approval dates"
```

---

### Task 4: API — Design Layer Handler

**Files:**
- Modify: `src/app/api/calendar/events/route.ts`

- [ ] **Step 1: Implement the Design layer handler**

Replace the `design: async () => [],` placeholder in `layerHandlers` with:

```ts
  design: async (from, to, clientFilter) => {
    const events: CalendarEvent[] = [];

    // 1. Design status changes (brand_story, aplus, listing_images, storefront)
    const statusRows = await db
      .select({
        id: designStatus.id,
        clientIdCode: designStatus.clientIdCode,
        category: designStatus.category,
        status: designStatus.status,
        updatedAt: designStatus.updatedAt,
        clientName: aac.clientName,
      })
      .from(designStatus)
      .innerJoin(aac, eq(designStatus.clientIdCode, aac.clientIdCode))
      .where(
        clientFilter
          ? eq(designStatus.clientIdCode, clientFilter)
          : undefined
      );

    for (const row of statusRows) {
      const d = row.updatedAt.toISOString().slice(0, 10);
      if (d < from || d > to) continue;
      const catLabel = row.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      events.push({
        id: `design-status-${row.id}`,
        title: `${row.clientName || row.clientIdCode} — ${catLabel}: ${row.status}`,
        date: d,
        layer: "design",
        clientName: row.clientName ?? undefined,
        clientIdCode: row.clientIdCode,
        description: `${catLabel} status updated to ${row.status}`,
        linkTo: row.category === "aplus" ? `/aplus?client=${row.clientIdCode}` : "/clients/aac",
      });
    }

    // 2. A+ module events (imported/updated)
    const moduleRows = await db
      .select({
        moduleId: aplusModules.id,
        moduleNumber: aplusModules.moduleNumber,
        moduleType: aplusModules.moduleType,
        importedAt: aplusModules.importedAt,
        updatedAt: aplusModules.updatedAt,
        productClientIdCode: master.clientIdCode,
        clientName: aac.clientName,
      })
      .from(aplusModules)
      .innerJoin(master, eq(aplusModules.productId, master.id))
      .innerJoin(aac, eq(master.clientIdCode, aac.clientIdCode))
      .where(
        clientFilter
          ? eq(master.clientIdCode, clientFilter)
          : undefined
      );

    for (const row of moduleRows) {
      if (row.importedAt) {
        const d = row.importedAt.toISOString().slice(0, 10);
        if (d >= from && d <= to) {
          events.push({
            id: `design-aplus-import-${row.moduleId}`,
            title: `${row.clientName || row.productClientIdCode} — A+ Module ${row.moduleNumber} Imported`,
            date: d,
            layer: "design",
            clientName: row.clientName ?? undefined,
            clientIdCode: row.productClientIdCode ?? undefined,
            description: `A+ ${row.moduleType} module imported`,
            linkTo: row.productClientIdCode ? `/aplus?client=${row.productClientIdCode}` : undefined,
          });
        }
      }
    }

    // 3. Brand story events
    const storyRows = await db
      .select({
        storyId: brandStory.id,
        importedAt: brandStory.importedAt,
        createdAt: brandStory.createdAt,
        productClientIdCode: master.clientIdCode,
        clientName: aac.clientName,
      })
      .from(brandStory)
      .innerJoin(master, eq(brandStory.productId, master.id))
      .innerJoin(aac, eq(master.clientIdCode, aac.clientIdCode))
      .where(
        clientFilter
          ? eq(master.clientIdCode, clientFilter)
          : undefined
      );

    for (const row of storyRows) {
      const ts = row.importedAt || row.createdAt;
      const d = ts.toISOString().slice(0, 10);
      if (d < from || d > to) continue;
      events.push({
        id: `design-brandstory-${row.storyId}`,
        title: `${row.clientName || row.productClientIdCode} — Brand Story ${row.importedAt ? "Imported" : "Created"}`,
        date: d,
        layer: "design",
        clientName: row.clientName ?? undefined,
        clientIdCode: row.productClientIdCode ?? undefined,
        description: "Brand story content",
        linkTo: "/clients/aac",
      });
    }

    return events;
  },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/app/api/calendar/events/route.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(calendar): Design layer handler — A+, brand story, design status"
```

---

### Task 5: API — PPC Layer Handler

**Files:**
- Modify: `src/app/api/calendar/events/route.ts`

- [ ] **Step 1: Implement the PPC layer handler**

Replace the `ppc: async () => [],` placeholder in `layerHandlers` with:

```ts
  ppc: async (from, to, clientFilter) => {
    const events: CalendarEvent[] = [];

    // 1. PPC Approvals
    const approvalRows = await db
      .select({
        id: ppcApprovals.id,
        clientIdCode: ppcApprovals.clientIdCode,
        approvalType: ppcApprovals.approvalType,
        description: ppcApprovals.description,
        requestedAt: ppcApprovals.requestedAt,
        approvedAt: ppcApprovals.approvedAt,
        rejectedAt: ppcApprovals.rejectedAt,
        status: ppcApprovals.status,
        clientName: aac.clientName,
      })
      .from(ppcApprovals)
      .innerJoin(aac, eq(ppcApprovals.clientIdCode, aac.clientIdCode))
      .where(
        clientFilter
          ? eq(ppcApprovals.clientIdCode, clientFilter)
          : undefined
      );

    for (const row of approvalRows) {
      // Requested
      const reqDate = row.requestedAt.toISOString().slice(0, 10);
      if (reqDate >= from && reqDate <= to) {
        events.push({
          id: `ppc-req-${row.id}`,
          title: `${row.clientName || row.clientIdCode} — PPC ${row.approvalType} Requested`,
          date: reqDate,
          layer: "ppc",
          clientName: row.clientName ?? undefined,
          clientIdCode: row.clientIdCode,
          description: row.description,
          linkTo: "/ppc",
        });
      }
      // Approved
      if (row.approvedAt) {
        const appDate = row.approvedAt.toISOString().slice(0, 10);
        if (appDate >= from && appDate <= to) {
          events.push({
            id: `ppc-app-${row.id}`,
            title: `${row.clientName || row.clientIdCode} — PPC ${row.approvalType} Approved`,
            date: appDate,
            layer: "ppc",
            clientName: row.clientName ?? undefined,
            clientIdCode: row.clientIdCode,
            description: row.description,
            linkTo: "/ppc",
          });
        }
      }
      // Rejected
      if (row.rejectedAt) {
        const rejDate = row.rejectedAt.toISOString().slice(0, 10);
        if (rejDate >= from && rejDate <= to) {
          events.push({
            id: `ppc-rej-${row.id}`,
            title: `${row.clientName || row.clientIdCode} — PPC ${row.approvalType} Rejected`,
            date: rejDate,
            layer: "ppc",
            clientName: row.clientName ?? undefined,
            clientIdCode: row.clientIdCode,
            description: row.description,
            linkTo: "/ppc",
          });
        }
      }
    }

    return events;
  },
```

Note: We skip `ppcSnapshots` (daily reports) to avoid flooding the calendar — approvals are the actionable events.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/app/api/calendar/events/route.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(calendar): PPC layer handler — approval workflow events"
```

---

### Task 6: API — Onboarding Layer Handler

**Files:**
- Modify: `src/app/api/calendar/events/route.ts`

- [ ] **Step 1: Implement the Onboarding layer handler**

Replace the `onboarding: async () => [],` placeholder in `layerHandlers` with:

```ts
  onboarding: async (from, to, clientFilter) => {
    const events: CalendarEvent[] = [];

    const rows = await db
      .select({
        id: clientGanttTasks.id,
        clientIdCode: clientGanttTasks.clientIdCode,
        section: clientGanttTasks.section,
        taskName: clientGanttTasks.taskName,
        status: clientGanttTasks.status,
        startedAt: clientGanttTasks.startedAt,
        completedAt: clientGanttTasks.completedAt,
        clientName: aac.clientName,
      })
      .from(clientGanttTasks)
      .innerJoin(aac, eq(clientGanttTasks.clientIdCode, aac.clientIdCode))
      .where(
        clientFilter
          ? eq(clientGanttTasks.clientIdCode, clientFilter)
          : undefined
      );

    for (const row of rows) {
      if (row.startedAt) {
        const d = row.startedAt.toISOString().slice(0, 10);
        if (d >= from && d <= to) {
          events.push({
            id: `onboard-start-${row.id}`,
            title: `${row.clientName || row.clientIdCode} — ${row.taskName} Started`,
            date: d,
            layer: "onboarding",
            clientName: row.clientName ?? undefined,
            clientIdCode: row.clientIdCode,
            description: `${row.section}: ${row.taskName}`,
            linkTo: "/timeline",
          });
        }
      }
      if (row.completedAt) {
        const d = row.completedAt.toISOString().slice(0, 10);
        if (d >= from && d <= to) {
          events.push({
            id: `onboard-done-${row.id}`,
            title: `${row.clientName || row.clientIdCode} — ${row.taskName} Completed`,
            date: d,
            layer: "onboarding",
            clientName: row.clientName ?? undefined,
            clientIdCode: row.clientIdCode,
            description: `${row.section}: ${row.taskName}`,
            linkTo: "/timeline",
          });
        }
      }
    }

    return events;
  },
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit src/app/api/calendar/events/route.ts 2>&1 | head -20`

- [ ] **Step 3: Test the full API manually**

Run: `curl -s "http://localhost:3000/api/calendar/events?from=2026-01-01&to=2026-12-31" | head -50`

Expected: JSON array with holiday events at minimum, plus any SEO/Design/PPC/Onboarding events in the DB.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/calendar/events/route.ts
git commit -m "feat(calendar): Onboarding layer handler — Gantt task milestones"
```

---

### Task 7: EventPopover Component

**Files:**
- Create: `src/components/calendar/event-popover.tsx`

- [ ] **Step 1: Create the EventPopover component**

```tsx
// src/components/calendar/event-popover.tsx
"use client";

import { ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "./calendar-types";
import { LAYER_CONFIG } from "./calendar-types";

interface EventPopoverProps {
  event: CalendarEvent;
  children: React.ReactNode;
  portalLinks?: boolean;
}

const PORTAL_LINK_MAP: Record<string, string> = {
  "/timeline": "/portal/timeline",
  "/ppc": "/portal/ppc",
};

function resolveLink(linkTo: string | undefined, portal: boolean): string | undefined {
  if (!linkTo) return undefined;
  if (!portal) return linkTo;
  // /seo/clients/X → /portal/seo
  if (linkTo.startsWith("/seo/")) return "/portal/seo";
  // /aplus?client=X → /portal/aplus
  if (linkTo.startsWith("/aplus")) return "/portal/aplus";
  return PORTAL_LINK_MAP[linkTo] ?? undefined;
}

export function EventPopover({ event, children, portalLinks = false }: EventPopoverProps) {
  const config = LAYER_CONFIG[event.layer];
  const link = resolveLink(event.linkTo, portalLinks);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot}`} />
            <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{event.title}</p>
          {event.clientName && (
            <p className="text-xs text-muted-foreground">{event.clientName}</p>
          )}
          {event.description && (
            <p className="text-xs text-muted-foreground">{event.description}</p>
          )}
          {link && (
            <a
              href={link}
              className={`inline-flex items-center gap-1 text-xs font-medium ${config.text} hover:underline`}
            >
              Go to {config.label} <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/event-popover.tsx
git commit -m "feat(calendar): EventPopover component with deep links"
```

---

### Task 8: AgendaList Component

**Files:**
- Create: `src/components/calendar/agenda-list.tsx`

- [ ] **Step 1: Create the AgendaList component**

```tsx
// src/components/calendar/agenda-list.tsx
"use client";

import { ArrowRight } from "lucide-react";
import type { CalendarEvent } from "./calendar-types";
import { LAYER_CONFIG } from "./calendar-types";
import { EventPopover } from "./event-popover";

interface AgendaListProps {
  events: CalendarEvent[];
  showClientName?: boolean;
  portalLinks?: boolean;
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function AgendaList({ events, showClientName = true, portalLinks = false }: AgendaListProps) {
  // Group events by date
  const grouped = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const list = grouped.get(ev.date) ?? [];
    list.push(ev);
    grouped.set(ev.date, list);
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No events in this period
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([date, dayEvents]) => (
        <div key={date}>
          <h3 className="sticky top-0 z-10 bg-background/95 backdrop-blur px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            {formatDateHeader(date)}
          </h3>
          <div className="divide-y divide-border/30">
            {dayEvents.map((ev) => {
              const config = LAYER_CONFIG[ev.layer];
              return (
                <EventPopover key={ev.id} event={ev} portalLinks={portalLinks}>
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left cursor-pointer">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${config.dot}`} />
                    <span className="text-sm font-medium text-foreground truncate flex-1">{ev.title}</span>
                    {showClientName && ev.clientName && (
                      <span className="text-xs text-muted-foreground shrink-0">{ev.clientName}</span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.text} shrink-0`}>
                      {config.label}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                </EventPopover>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/agenda-list.tsx
git commit -m "feat(calendar): AgendaList component — flat chronological view"
```

---

### Task 9: MonthGrid Component

**Files:**
- Create: `src/components/calendar/month-grid.tsx`

- [ ] **Step 1: Create the MonthGrid component**

```tsx
// src/components/calendar/month-grid.tsx
"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "./calendar-types";
import { LAYER_CONFIG } from "./calendar-types";
import { EventPopover } from "./event-popover";

interface MonthGridProps {
  year: number;
  month: number; // 0-indexed
  events: CalendarEvent[];
  showClientName?: boolean;
  portalLinks?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function MonthGrid({ year, month, events, showClientName = true, portalLinks = false }: MonthGridProps) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().slice(0, 10);

  // Build calendar grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border/50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border/20 bg-muted/20" />;
          }
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const overflow = dayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={dateStr}
              className="min-h-[100px] border-b border-r border-border/20 p-1.5 hover:bg-muted/30 transition-colors"
            >
              <span
                className={`text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full ${
                  isToday ? "bg-brand text-white" : "text-muted-foreground"
                }`}
              >
                {day}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, MAX_VISIBLE).map((ev) => {
                  const config = LAYER_CONFIG[ev.layer];
                  return (
                    <EventPopover key={ev.id} event={ev} portalLinks={portalLinks}>
                      <button
                        className={`w-full text-left text-[10px] leading-tight font-medium px-1 py-0.5 rounded truncate ${config.bg} ${config.text} ${config.border} border cursor-pointer hover:opacity-80 transition-opacity`}
                      >
                        {ev.title}
                      </button>
                    </EventPopover>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/month-grid.tsx
git commit -m "feat(calendar): MonthGrid component — calendar grid with event chips"
```

---

### Task 10: WeekGrid Component

**Files:**
- Create: `src/components/calendar/week-grid.tsx`

- [ ] **Step 1: Create the WeekGrid component**

```tsx
// src/components/calendar/week-grid.tsx
"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "./calendar-types";
import { LAYER_CONFIG } from "./calendar-types";
import { EventPopover } from "./event-popover";

interface WeekGridProps {
  weekStart: Date; // Sunday of the target week
  events: CalendarEvent[];
  showClientName?: boolean;
  portalLinks?: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeekGrid({ weekStart, events, showClientName = true, portalLinks = false }: WeekGridProps) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-7 divide-x divide-border/30">
      {days.map((day, i) => {
        const dateStr = toDateStr(day);
        const dayEvents = eventsByDate.get(dateStr) ?? [];
        const isToday = dateStr === today;

        return (
          <div key={dateStr} className="min-h-[400px]">
            {/* Day header */}
            <div className={`p-2 border-b border-border/30 text-center ${isToday ? "bg-brand/8" : ""}`}>
              <div className="text-[10px] text-muted-foreground uppercase">{DAY_LABELS[i]}</div>
              <div
                className={`text-lg font-semibold inline-flex items-center justify-center h-8 w-8 rounded-full ${
                  isToday ? "bg-brand text-white" : "text-foreground"
                }`}
              >
                {day.getDate()}
              </div>
            </div>

            {/* Event cards */}
            <div className="p-1.5 space-y-1.5">
              {dayEvents.length === 0 && (
                <div className="text-[10px] text-muted-foreground/50 text-center py-4">—</div>
              )}
              {dayEvents.map((ev) => {
                const config = LAYER_CONFIG[ev.layer];
                return (
                  <EventPopover key={ev.id} event={ev} portalLinks={portalLinks}>
                    <button
                      className={`w-full text-left p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${config.bg} ${config.border}`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />
                        <span className={`text-[10px] font-medium ${config.text}`}>{config.label}</span>
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">{ev.title}</p>
                      {showClientName && ev.clientName && (
                        <p className="text-[10px] text-muted-foreground truncate">{ev.clientName}</p>
                      )}
                    </button>
                  </EventPopover>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/week-grid.tsx
git commit -m "feat(calendar): WeekGrid component — 7-column layout with event cards"
```

---

### Task 11: CalendarView Main Component

**Files:**
- Create: `src/components/calendar/calendar-view.tsx`

- [ ] **Step 1: Create the CalendarView component**

```tsx
// src/components/calendar/calendar-view.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarEvent, LayerKey, ViewMode } from "./calendar-types";
import { LAYER_CONFIG, ALL_LAYERS } from "./calendar-types";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";
import { AgendaList } from "./agenda-list";

interface CalendarViewProps {
  scope?: "internal" | "client";
  clientId?: string;
  showLayerToggles?: boolean;
  showClientName?: boolean;
  portalLinks?: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { from, to };
}

function getWeekRange(weekStart: Date) {
  const from = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { from, to };
}

const VIEW_ICONS: Record<ViewMode, typeof CalendarDays> = {
  month: LayoutGrid,
  week: CalendarDays,
  agenda: List,
};

export function CalendarView({
  scope = "internal",
  clientId,
  showLayerToggles = true,
  showClientName = true,
  portalLinks = false,
}: CalendarViewProps) {
  const now = new Date();
  const [view, setView] = useState<ViewMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(now));
  const [activeLayers, setActiveLayers] = useState<Set<LayerKey>>(new Set(ALL_LAYERS));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const dateRange = useMemo(() => {
    if (view === "week") return getWeekRange(weekStart);
    // For month and agenda, use the month range
    return getMonthRange(year, month);
  }, [view, year, month, weekStart]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
      layers: [...activeLayers].join(","),
      scope,
    });
    if (clientId) params.set("clientId", clientId);

    try {
      const res = await fetch(`/api/calendar/events?${params}`);
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        setEvents(data);
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange, activeLayers, scope, clientId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const toggleLayer = (layer: LayerKey) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const navigatePrev = () => {
    if (view === "week") {
      const prev = new Date(weekStart);
      prev.setDate(prev.getDate() - 7);
      setWeekStart(prev);
    } else {
      if (month === 0) { setMonth(11); setYear(year - 1); }
      else setMonth(month - 1);
    }
  };

  const navigateNext = () => {
    if (view === "week") {
      const next = new Date(weekStart);
      next.setDate(next.getDate() + 7);
      setWeekStart(next);
    } else {
      if (month === 11) { setMonth(0); setYear(year + 1); }
      else setMonth(month + 1);
    }
  };

  const goToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekStart(getWeekStart(today));
  };

  const headerLabel = view === "week"
    ? `Week of ${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
    : new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* Top bar: navigation + view toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center">{headerLabel}</h2>
          <Button variant="outline" size="icon" onClick={navigateNext} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="text-xs ml-2">
            Today
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-0.5">
          {(["month", "week", "agenda"] as ViewMode[]).map((v) => {
            const Icon = VIEW_ICONS[v];
            return (
              <Button
                key={v}
                variant={view === v ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(v)}
                className="h-7 gap-1.5 text-xs capitalize"
              >
                <Icon className="h-3.5 w-3.5" />
                {v}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Layer toggles */}
      {showLayerToggles && (
        <div className="flex items-center gap-2 flex-wrap">
          {ALL_LAYERS.map((layer) => {
            const config = LAYER_CONFIG[layer];
            const active = activeLayers.has(layer);
            return (
              <button
                key={layer}
                onClick={() => toggleLayer(layer)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                  active
                    ? `${config.bg} ${config.text} ${config.border}`
                    : "bg-muted/30 text-muted-foreground border-border/30 opacity-50"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${active ? config.dot : "bg-muted-foreground/30"}`} />
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="text-center text-xs text-muted-foreground py-2">Loading events...</div>
      )}

      {/* Active view */}
      <div className="rounded-lg border border-border/50 overflow-hidden bg-background">
        {view === "month" && (
          <MonthGrid year={year} month={month} events={events} showClientName={showClientName} portalLinks={portalLinks} />
        )}
        {view === "week" && (
          <WeekGrid weekStart={weekStart} events={events} showClientName={showClientName} portalLinks={portalLinks} />
        )}
        {view === "agenda" && (
          <AgendaList events={events} showClientName={showClientName} portalLinks={portalLinks} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/calendar-view.tsx
git commit -m "feat(calendar): CalendarView main component — view toggle, layer filters, data fetching"
```

---

### Task 12: Replace /calendar Page

**Files:**
- Replace: `src/app/calendar/page.tsx`

- [ ] **Step 1: Replace the existing calendar page**

Replace the entire contents of `src/app/calendar/page.tsx` with:

```tsx
// src/app/calendar/page.tsx
import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">
        <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          Calendar
        </span>
      </h1>
      <CalendarView scope="internal" showLayerToggles showClientName />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/calendar`. Confirm:
- Month grid renders with today highlighted
- Layer toggle pills appear (Holidays, SEO, Design, PPC, Onboarding)
- View toggle works (Month / Week / Agenda)
- Navigation arrows change months/weeks
- Holiday events appear as amber chips
- Clicking an event shows the popover with details

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/page.tsx
git commit -m "feat(calendar): replace static calendar with unified CalendarView"
```

---

### Task 13: Create /portal/calendar Page

**Files:**
- Create: `src/app/portal/calendar/page.tsx`

- [ ] **Step 1: Create the portal calendar page**

```tsx
// src/app/portal/calendar/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { CalendarView } from "@/components/calendar/calendar-view";

export default function PortalCalendarPage() {
  const { data: session } = useSession();
  const clientId = session?.user?.clientIdCode?.split(",")[0]?.trim();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">
        <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          Calendar
        </span>
      </h1>
      <CalendarView
        scope="client"
        clientId={clientId}
        showLayerToggles={false}
        showClientName={false}
        portalLinks
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/portal/calendar/page.tsx
git commit -m "feat(calendar): portal calendar page — client-scoped view"
```

---

### Task 14: Add Portal Calendar to Sidebar Nav

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Read the sidebar file**

Read `src/components/layout/app-sidebar.tsx` to find the portal section cards or nav items for client users. Look for:
- The existing "Client Timelines" nav item at `/timeline`
- Any portal-specific nav sections

- [ ] **Step 2: Add portal calendar nav item**

Add a calendar nav item near the existing "Client Timelines" entry. The exact location depends on the sidebar structure found in step 1. Add after the timeline entry:

```ts
{ title: "Calendar", href: "/portal/calendar", icon: CalendarDays, visible: isClient },
```

Where `isClient` matches the pattern used by the existing portal nav items (e.g., `session?.user?.role === "client"` or the `checkAccess` helper).

- [ ] **Step 3: Verify the sidebar in browser**

Navigate to `/portal/calendar` and confirm the nav item appears for client-role users.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(calendar): add portal calendar to sidebar navigation"
```

---

### Task 15: Manual QA + Final Commit

- [ ] **Step 1: Test the internal calendar**

Navigate to `http://localhost:3000/calendar`:
- Toggle each layer on/off — verify events filter correctly
- Switch between Month / Week / Agenda views
- Navigate forward/backward months/weeks
- Click "Today" to return to current date
- Click an event chip/row — verify popover shows title, client, description, deep link
- Click a deep link — verify it navigates to the correct section

- [ ] **Step 2: Test the portal calendar**

Navigate to `http://localhost:3000/portal/calendar` (as a client user or using admin preview):
- Verify no layer toggles are shown
- Verify no client name column in agenda view
- Verify events are filtered to the client's data only
- Verify deep links point to `/portal/*` routes

- [ ] **Step 3: Test edge cases**

- Empty month (no events) — verify "No events" message in agenda, empty grid in month
- Month with many events on one day — verify "+N more" overflow in month grid
- API with invalid params — verify proper error responses (`/api/calendar/events` without `from`/`to` returns 400)

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(calendar): QA fixes from manual testing"
```
