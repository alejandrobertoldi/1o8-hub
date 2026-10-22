# Unified Calendar — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Replaces:** Current static `/calendar` page (hardcoded holidays + localStorage events)

## Overview

Replace the existing static `/calendar` page with a database-driven unified calendar that aggregates date-related events from all major 1o8Hub domains. Internal team sees all clients' events; portal clients see only their own.

## Decisions

- **Option C: Replace AND absorb** — holidays/Amazon milestones stay as a static layer, combined with live DB events
- **Both audiences** — internal (`/calendar`) + portal (`/portal/calendar`)
- **Single API + layer query params** — one endpoint, selective server-side querying
- **5 layers** — Holidays, SEO, Design (A+, brand story, listing images, storefront), PPC, Onboarding
- **3 views** — Month, Week, Agenda list
- **Global view** — all clients mixed, distinguished by color/label (no client dropdown filter)

## Data Model

### CalendarEvent Interface

```ts
interface CalendarEvent {
  id: string;             // e.g. "seo-proj123-s3"
  title: string;          // e.g. "NTA — S3 Approved"
  date: string;           // YYYY-MM-DD
  layer: "holiday" | "seo" | "design" | "ppc" | "onboarding";
  clientName?: string;    // null for holidays
  clientIdCode?: string;
  description?: string;
  linkTo?: string;        // deep link into the relevant section
}
```

### Layers

| Layer      | Color            | Source Tables                                                        | Date Fields                                              |
|------------|------------------|----------------------------------------------------------------------|----------------------------------------------------------|
| Holidays   | `amber-500`      | Static array                                                         | `date`                                                   |
| SEO        | `blue-500`       | `seoProjects` + `aac`                                                | `s1ApprovedAt` .. `s6ApprovedAt`                         |
| Design     | `purple-500`     | `aplusModules` + `designStatus` + `brandStory` + `driveFiles` + `aac` | `createdAt`, `updatedAt`, `importedAt`                   |
| PPC        | `orange-500`     | `ppcApprovals` + `ppcSnapshots` + `aac`                              | `requestedAt`, `approvedAt`, `rejectedAt`, `snapshotDate` |
| Onboarding | `brand (#E8A700)` | `clientGanttTasks` + `aac`                                           | `startedAt`, `completedAt`                               |

## API

### `GET /api/calendar/events`

| Param      | Type                   | Required         | Default    | Description               |
|------------|------------------------|------------------|------------|---------------------------|
| `from`     | date (YYYY-MM-DD)      | yes              | —          | Start of date range       |
| `to`       | date (YYYY-MM-DD)      | yes              | —          | End of date range         |
| `layers`   | string                 | no               | all        | Comma-separated layer names |
| `scope`    | `internal` \| `client` | no               | `internal` | Portal uses `client`      |
| `clientId` | string                 | when scope=client | —          | Client ID code            |

**Server logic:**
1. Parse `layers` param into array (default: all 5)
2. Build a query function per requested layer
3. Run all layer queries in parallel via `Promise.all`
4. Each query joins with `aac` to get `clientName`/`clientIdCode`
5. When `scope=client`, each query adds `WHERE clientIdCode = ?`
6. Flatten, normalize to `CalendarEvent[]`, sort by date ascending
7. Return JSON array

**Response:** `CalendarEvent[]`

## Frontend

### Routes

| Route              | Audience                         | Behavior                                       |
|--------------------|----------------------------------|-------------------------------------------------|
| `/calendar`        | Internal (admin, editor, viewer) | All layers, all clients, layer toggles          |
| `/portal/calendar` | Client-role users                | All layers filtered to their client, no toggles |

### Components

| Component            | File                                              | Responsibility                                                                |
|----------------------|---------------------------------------------------|-------------------------------------------------------------------------------|
| `CalendarPage`       | `src/app/calendar/page.tsx`                       | Server component shell, replaces existing page                                |
| `PortalCalendarPage` | `src/app/portal/calendar/page.tsx`                | Client-scoped server shell                                                    |
| `CalendarView`       | `src/components/calendar/calendar-view.tsx`       | Client component: view toggle, layer filters, data fetching, event rendering  |
| `MonthGrid`          | `src/components/calendar/month-grid.tsx`          | Classic calendar grid with colored event chips                                |
| `WeekGrid`           | `src/components/calendar/week-grid.tsx`           | 7-column layout with stacked event cards                                      |
| `AgendaList`         | `src/components/calendar/agenda-list.tsx`         | Flat chronological list grouped by date                                       |
| `EventPopover`       | `src/components/calendar/event-popover.tsx`       | Click-to-expand detail with deep link                                         |

### Layout

```
┌─────────────────────────────────────────────────┐
│  Header: "Calendar"    [Month] [Week] [Agenda]  │
│  ◀ April 2026 ▶                                 │
├─────────────────────────────────────────────────┤
│  Layer toggles (pill buttons):                   │
│  [Holidays] [SEO] [Design] [PPC] [Onboarding]  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Active view renders here                        │
│                                                  │
├─────────────────────────────────────────────────┤
│  Event detail popover on click:                  │
│  Title, client, layer, description,              │
│  "Go to [section] →" deep link                   │
└─────────────────────────────────────────────────┘
```

### Layer Styling

| Layer      | Background       | Text          | Border           |
|------------|------------------|---------------|------------------|
| Holiday    | `amber-500/12`   | `amber-500`   | `amber-500/25`   |
| SEO        | `blue-500/12`    | `blue-500`    | `blue-500/25`    |
| Design     | `purple-500/12`  | `purple-500`  | `purple-500/25`  |
| PPC        | `orange-500/12`  | `orange-500`  | `orange-500/25`  |
| Onboarding | `brand/12`       | `brand`       | `brand/25`       |

### Deep Links

| Layer          | Internal Link              | Portal Link       |
|----------------|----------------------------|--------------------|
| SEO            | `/seo/clients/{clientId}`  | `/portal/seo`      |
| Design (A+)    | `/aplus?client={clientId}` | `/portal/aplus`    |
| Design (other) | `/clients/aac`             | —                  |
| PPC            | `/ppc`                     | `/portal/ppc`      |
| Onboarding     | `/timeline`                | `/portal/timeline` |

### View Behavior

**Month view:** Classic 7-column grid. Days with events show colored dots (max 3 visible, "+N more" overflow). Click a day to expand its events below.

**Week view:** 7-column layout showing the full week. Each day column displays stacked event cards with title, client name, and layer badge. More room for detail than month.

**Agenda view:** Flat list grouped by date headers. Each row: colored layer dot, event title, client name (gray), layer badge, deep link arrow. Best for scanning upcoming work.

## Portal Variant

`/portal/calendar` reuses `CalendarView` with props:
- `scope="client"` — API auto-filters to session user's client
- `showLayerToggles={false}` — all layers shown, no toggles
- `showClientName={false}` — redundant since filtered to one client
- Deep links point to `/portal/*` equivalents

## Migration from Existing Calendar

The current `/calendar` page has a hardcoded `HOLIDAYS` array (2025-2027 US holidays + Amazon milestones). This array moves into the API route as the `holiday` layer handler — it stays as static data, not in the database. The existing localStorage custom events feature is dropped entirely (no migration needed — it was client-side only with no persistence).

## Out of Scope

- Custom event creation (removed — the old localStorage approach is dropped)
- Client dropdown filter (global view only for v1)
- Day view (month + week + agenda is sufficient)
- Real-time updates / WebSocket (standard page refresh is fine)
- Drag-and-drop event rescheduling
