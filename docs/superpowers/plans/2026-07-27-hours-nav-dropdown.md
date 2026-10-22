# Hours Nav Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the top-nav "Hours" item into a dropdown of Log hours / Admin hours / Hour categories, hide the two admin items from non-super-admins across nav surfaces, and enforce super-admin on the hour-categories API.

**Architecture:** Reuse the existing top-nav section-dropdown renderer by adding a `Hours` `NavSection` (with a `linkWhenSingle` escape hatch so team users still get a one-click direct link). Add `?view=hours` deep-link support to the existing `/admin/users` page via `useSearchParams` (Suspense-wrapped). Flip the shared hour-categories API guard from `role==='admin'` to `isSuperAdmin`. Propagate super-admin gating to the other role-gated nav surface (command palette).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, NextAuth v5 (session carries `isSuperAdmin`), Vitest 4, Tailwind v4 + shadcn/ui (`NavigationMenu`).

## Global Constraints

- Typecheck with `npx tsc --noEmit` only. NEVER run `next build` (port 3000 is the live dev server). [Source: primer hard rules]
- Tests: `npx vitest run <path>`. React nav components are verified by `tsc` + in-browser dogfood, NOT jsdom unit tests. [Source: primer]
- Stage explicit file paths only — NEVER `git add .` (the commit hook regenerates `graphify-out/*` churn that must never be staged). [Source: primer]
- Never `git stash/checkout/restore/reset` — a concurrent design-token terminal shares this branch. [Source: task brief]
- One task = one commit; commit ONLY on the user's explicit per-action OK. [Source: primer hard rules]
- Commit trailer (last line of every commit message): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Brand tokens: `text-brand`/`--brand` for the orange active state; reuse existing nav classes verbatim. Read DESIGN.md before any new color. [Source: primer]
- Super-admin flag: `session?.user?.isSuperAdmin` (populated from JWT in `src/lib/auth.ts`). Its JWT-staleness (revocation lags until token refresh) is pre-existing and out of scope.

---

## File map

| File | Responsibility | Task |
|------|----------------|------|
| `src/app/api/admin/hour-categories/route.ts` + `route.test.ts` | Enforce super-admin on category CRUD | 1 |
| `src/app/admin/users/page.tsx` | `?view=hours` deep link → HoursDashboard | 2 |
| `src/components/layout/top-nav.tsx` | The Hours dropdown (core) | 3 |
| `src/components/layout/command-palette.tsx` | Super-admin gating + Admin hours entry | 4 |
| `src/components/layout/app-sidebar.tsx` | Cosmetic parity (DEAD CODE — optional) | 5 |
| `src/lib/help/registry.ts` | NO CHANGE — ungated help catalog (documented) | — |
| `docs/superpowers/specs/2026-07-27-hours-nav-dropdown-design.md`, `docs/superpowers/plans/2026-07-27-hours-nav-dropdown.md` | Planning docs | 0 |

---

### Task 0: Commit planning docs

**Files:**
- Add: `docs/superpowers/specs/2026-07-27-hours-nav-dropdown-design.md` (already written)
- Add: `docs/superpowers/plans/2026-07-27-hours-nav-dropdown.md` (this file)

- [ ] **Step 1: Stage and commit the spec + plan** (on explicit OK)

```bash
git add docs/superpowers/specs/2026-07-27-hours-nav-dropdown-design.md docs/superpowers/plans/2026-07-27-hours-nav-dropdown.md
git commit -m "docs(hours-nav): spec + plan for Hours nav dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Enforce super-admin on the hour-categories API (TDD)

**Files:**
- Modify: `src/app/api/admin/hour-categories/route.ts:5-11` (the shared guard + its call sites)
- Test: `src/app/api/admin/hour-categories/route.test.ts`

**Interfaces:**
- Consumes: `getAuthSession()` returning `{ user: { id, role, isSuperAdmin } } | null`.
- Produces: `GET`/`POST`/`PATCH` handlers that return 403 unless `session.user.isSuperAdmin === true`.

- [ ] **Step 1: Update the test fixtures and add the failing case**

Rewrite `src/app/api/admin/hour-categories/route.test.ts` to gate on super-admin. Full file:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  listAllCategories: vi.fn(), insertCategory: vi.fn(), updateCategory: vi.fn(),
}));
import { GET, POST, PATCH } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listAllCategories, insertCategory, updateCategory } from "@/lib/hours/queries";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const SUPER = { user: { id: "a1", role: "admin", isSuperAdmin: true } };
const req = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/admin/hour-categories", { method, body: JSON.stringify(body) });

describe("admin hour-categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 for a viewer", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "v1", role: "viewer", isSuperAdmin: false } });
    expect((await GET()).status).toBe(403);
  });

  it("403 for a plain admin without super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({ user: { id: "a1", role: "admin", isSuperAdmin: false } });
    expect((await GET()).status).toBe(403);
  });

  it("GET lists all categories for a super-admin", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(listAllCategories).mockResolvedValue([{ id: "1", name: "PPC", active: true, sortOrder: 0 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).categories).toHaveLength(1);
  });

  it("POST 400 on empty name", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    expect((await POST(req({ name: "  " }))).status).toBe(400);
  });

  it("POST adds a category", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(insertCategory).mockResolvedValue({ id: "9", name: "Legal", active: true, sortOrder: 9 });
    const res = await POST(req({ name: "Legal", sortOrder: 9 }));
    expect(res.status).toBe(201);
    expect(asMock(insertCategory).mock.calls[0][0]).toMatchObject({ name: "Legal" });
  });

  it("PATCH toggles active", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(updateCategory).mockResolvedValue({ id: "1", name: "PPC", active: false, sortOrder: 0 });
    const res = await PATCH(req({ id: "1", active: false }, "PATCH"));
    expect(res.status).toBe(200);
    expect(asMock(updateCategory).mock.calls[0][1]).toMatchObject({ active: false });
  });

  it("PATCH 400 without id", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    expect((await PATCH(req({ active: false }, "PATCH"))).status).toBe(400);
  });

  it("PATCH 400 when no updatable field is provided", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    const res = await PATCH(req({ id: "1" }, "PATCH"));
    expect(res.status).toBe(400);
    expect(asMock(updateCategory)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/admin/hour-categories/route.test.ts`
Expected: FAIL — "403 for a plain admin without super-admin" gets 200 (current guard allows any `role==='admin'`).

- [ ] **Step 3: Flip the guard in `route.ts`**

Replace lines 5-11 of `src/app/api/admin/hour-categories/route.ts`:

```typescript
async function requireSuperAdmin() {
  const session = await getAuthSession();
  if (!session || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
```

Then update the three call sites (`GET`, `POST`, `PATCH`): change each `await requireAdmin()` to `await requireSuperAdmin()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/admin/hour-categories/route.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors (only the pre-existing unrelated `sales-summary/not-connected-card.test.tsx` missing-module error may remain).

- [ ] **Step 6: Commit** (on explicit OK)

```bash
git add src/app/api/admin/hour-categories/route.ts src/app/api/admin/hour-categories/route.test.ts
git commit -m "feat(hours): enforce super-admin on hour-categories API

Change the shared route guard from role==='admin' to isSuperAdmin, matching
/api/hours/summary and /drill. Plain admins now 403 on category CRUD.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `?view=hours` deep link on /admin/users

**Files:**
- Modify: `src/app/admin/users/page.tsx:14` (imports), `:248` (default export → inner), `:264` (adminView init), end-of-file (Suspense wrapper)

**Interfaces:**
- Consumes: `useSearchParams()` from `next/navigation`; the existing `adminView` state and the existing render guard `adminView === "hours" && isSuperAdmin` (line ~776).
- Produces: navigating to `/admin/users?view=hours` opens the HoursDashboard for a super-admin; non-super-admins fall through to the users view (guard unchanged).

- [ ] **Step 1: Add imports**

Line 14 — add `Suspense`:
```typescript
import { Suspense, useRef, useState, useCallback, useEffect } from "react";
```
Add a new import line directly below the `react` import:
```typescript
import { useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Rename the default export to an inner component**

Line 248: change
```typescript
export default function UsersPage() {
```
to
```typescript
function UsersPageInner() {
```

- [ ] **Step 3: Read the search param and seed adminView**

Immediately after the opening of `UsersPageInner` (near the other hooks, e.g. after the `useSession()` line), add:
```typescript
  const searchParams = useSearchParams();
```
Change line 264 from:
```typescript
  const [adminView, setAdminView] = useState<"users" | "hours">("users");
```
to:
```typescript
  const [adminView, setAdminView] = useState<"users" | "hours">(
    searchParams.get("view") === "hours" ? "hours" : "users",
  );
```
(The `&& isSuperAdmin` guard is intentionally NOT in the initializer — session may be unresolved at mount. The existing render condition `adminView === "hours" && isSuperAdmin` already blocks non-super-admins from seeing the dashboard.)

- [ ] **Step 4: Add the Suspense-wrapped default export**

At the very end of the file, append:
```typescript
export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 6: Commit** (on explicit OK)

```bash
git add src/app/admin/users/page.tsx
git commit -m "feat(hours): deep-link /admin/users?view=hours to the hours dashboard

Seed adminView from the view search param (Suspense-wrapped for Next 16
useSearchParams). Super-admin render guard unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Top-nav Hours dropdown (core)

**Files:**
- Modify: `src/components/layout/top-nav.tsx` — `:72` (NavSection type), `:98` (add isSuperAdmin), `:150-153` (topLevelItems), `:158` (prepend Hours section), `:242` (remove Hour Categories from Admin), `:440-467` (mobile render), `:514-550` (desktop render)

**Interfaces:**
- Consumes: existing `NavItem`/`NavSection` types, `visibleSections`, `isSectionActive`, the `NavigationMenu*` primitives, `Clock`/`BarChart3`/`Tags` icons (all already imported at lines 51-58).
- Produces: a `Hours` section with `linkWhenSingle: true`; when it has exactly one visible child it renders as a direct link, otherwise as a dropdown.

- [ ] **Step 1: Add `linkWhenSingle` to the NavSection type**

Line 72:
```typescript
type NavSection = { label: string; icon: LucideIcon; items: NavItem[]; defaultOpen?: boolean; linkWhenSingle?: boolean };
```

- [ ] **Step 2: Add the super-admin flag**

After line 98 (`const isAdmin = role === "admin";`):
```typescript
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
```

- [ ] **Step 3: Remove standalone Hours from topLevelItems**

Lines 150-153 become:
```typescript
  const topLevelItems: NavItem[] = [
    { title: "Calendar", href: "/calendar", icon: CalendarDays, visible: checkAccess("calendar") },
  ];
```

- [ ] **Step 4: Prepend the Hours section**

Insert as the FIRST element of the `sections` array (immediately after `const sections: NavSection[] = [` at line 158):
```typescript
    {
      label: "Hours", icon: Clock, linkWhenSingle: true,
      items: [
        { title: "Log hours", href: "/hours", icon: Clock, visible: role === "admin" || role === "editor" || role === "viewer" },
        { title: "Admin hours", href: "/admin/users?view=hours", icon: BarChart3, visible: isSuperAdmin },
        { title: "Hour categories", href: "/admin/hour-categories", icon: Tags, visible: isSuperAdmin },
      ],
    },
```

- [ ] **Step 5: Remove Hour Categories from the Admin section**

Delete line 242:
```typescript
        { title: "Hour Categories", href: "/admin/hour-categories", icon: Tags, visible: isAdmin },
```

- [ ] **Step 6: Desktop render — one-child branch**

In the desktop `visibleSections.map((sec) => {` block (starts line 514), insert the branch right after `const sectionActive = isSectionActive(sec);`:
```tsx
              if (sec.linkWhenSingle && sec.items.length === 1) {
                const only = sec.items[0];
                const isActive = pathname.startsWith(only.href);
                return (
                  <NavigationMenuItem key={sec.label}>
                    <NavigationMenuLink asChild
                      className={`inline-flex h-10 items-center justify-center px-4 py-2 text-sm font-medium transition-colors
                        ${isActive
                          ? "text-brand border-b-2 border-brand"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                        }`}
                    >
                      <Link href={only.href}>{only.title}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              }
```
(The existing `return ( <NavigationMenuItem ...> ...trigger+content... )` stays as the else path.)

- [ ] **Step 7: Mobile render — one-child branch**

In the mobile `visibleSections.map((sec) => {` block (starts line 440), insert right after `const sectionActive = isSectionActive(sec);`:
```tsx
                  if (sec.linkWhenSingle && sec.items.length === 1) {
                    const only = sec.items[0];
                    const isActive = pathname.startsWith(only.href);
                    return (
                      <Link
                        key={sec.label}
                        href={only.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${isActive ? "bg-brand/15 text-brand" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                      >
                        <only.icon className="size-4" />
                        {only.title}
                      </Link>
                    );
                  }
```
(The existing `return ( <Collapsible ...> ... )` stays as the else path.)

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 9: Commit** (on explicit OK)

```bash
git add src/components/layout/top-nav.tsx
git commit -m "feat(hours): top-nav Hours dropdown (Log/Admin/Categories)

Hours becomes a section dropdown; the two admin items are super-admin-gated.
linkWhenSingle renders a direct /hours link for team users (one visible child)
instead of a one-item dropdown. Hour Categories moved out of the Admin section.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Dogfood** (manual, after commit — see final Verification section)

**Note (accepted, cosmetic):** the "Admin hours" href carries a query string (`/admin/users?view=hours`), so `pathname.startsWith(href)` never matches — that item won't show the active underline. Navigation works correctly; only the highlight is skipped.

---

### Task 4: Command palette super-admin gating + Admin hours

**Files:**
- Modify: `src/components/layout/command-palette.tsx` — icon import (add `type LucideIcon` if absent), `:62-75` (NAV_ITEMS + type), `:84` (add isSuperAdmin), `:246` (filter)

**Interfaces:**
- Consumes: `session.user.isSuperAdmin`, existing `NAV_ITEMS` filter.
- Produces: `Admin hours` and `Hour categories` entries visible only to super-admins.

- [ ] **Step 1: Type NAV_ITEMS explicitly and update entries**

Ensure `type LucideIcon` is imported from `lucide-react` (add it to the existing lucide-react import if missing). Then replace the `NAV_ITEMS` declaration (lines 62-75) with:
```typescript
type NavCmd = { label: string; href: string; icon: LucideIcon; admin?: boolean; superAdmin?: boolean };

const NAV_ITEMS: NavCmd[] = [
  { label: "Client Summary", href: "/", icon: Users },
  { label: "Sales Summary", href: "/sales-summary", icon: DollarSign },
  { label: "A+ Content", href: "/aplus2", icon: LayoutTemplate },
  { label: "SEO Manager", href: "/seo", icon: Search },
  { label: "Amazon Sync", href: "/amazon-sync", icon: GitCompare },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Log hours", href: "/hours", icon: Clock },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "AI Config", href: "/admin/ai", icon: Sparkles, admin: true },
  { label: "Team Management", href: "/admin/users", icon: Shield, admin: true },
  { label: "Admin hours", href: "/admin/users?view=hours", icon: BarChart3, superAdmin: true },
  { label: "Hour categories", href: "/admin/hour-categories", icon: Tags, superAdmin: true },
];
```

- [ ] **Step 2: Add the super-admin flag**

After line 84 (`const isAdmin = session?.user?.role === "admin";`):
```typescript
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
```

- [ ] **Step 3: Update the filter**

Line 246:
```typescript
              {NAV_ITEMS.filter((item) => (!item.admin || isAdmin) && (!item.superAdmin || isSuperAdmin)).map(
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 5: Commit** (on explicit OK)

```bash
git add src/components/layout/command-palette.tsx
git commit -m "feat(hours): super-admin gate command-palette hours entries

Rename Hours -> Log hours, add super-admin-only Admin hours + Hour categories.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: App-sidebar parity (OPTIONAL — dead code)

**Skip unless the user wants it.** `AppSidebar` has no importers (verified: `grep -rn AppSidebar src` finds only the definition), so these changes are cosmetic hygiene with zero user-facing effect.

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx` — `:39` (add isSuperAdmin), `:59` (relabel), Admin section (gate + add Admin hours)

- [ ] **Step 1: Add the super-admin flag**

After line 39 (`const isAdmin = role === "admin";`):
```typescript
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
```

- [ ] **Step 2: Relabel the top-level Hours item**

Line 59: change `title: "Hours"` to `title: "Log hours"`.

- [ ] **Step 3: Gate Hour Categories and add Admin hours in the Admin section**

Change line 160 from `visible: isAdmin` to `visible: isSuperAdmin`, and add directly above it:
```typescript
        { title: "Admin hours", href: "/admin/users?view=hours", icon: BarChart3, visible: isSuperAdmin },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 5: Commit** (on explicit OK)

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "chore(hours): mirror super-admin hours gating in (unused) app-sidebar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (after all committed tasks)

- [ ] `npx tsc --noEmit` — no NEW errors beyond the known pre-existing `sales-summary/not-connected-card.test.tsx` missing-module error.
- [ ] `npx vitest run src/app/api/admin/hour-categories` — all pass.
- [ ] Dogfood in the live dev app (port 3000) with the `browse` skill or manually:
  - As a super-admin: top-nav shows a "Hours ▾" dropdown with Log hours / Admin hours / Hour categories; "Admin hours" navigates to `/admin/users?view=hours` and lands on the HoursDashboard.
  - As a team user (editor/viewer): top-nav shows "Hours" as a direct link to `/hours` (no dropdown); `/admin/hour-categories` API returns 403.
  - Command palette (⌘K) as each role: admin items appear only for super-admins.

## Self-review notes

- **Spec coverage:** every "Changes by file" item in the spec maps to a task (top-nav→T3, server gate→T1, deep-link→T2, command-palette→T4, sidebar→T5). Registry is explicitly no-change (ungated) — this refines spec §4-6, which said "match the file's existing idiom": the registry's idiom is *no gating*, so the faithful action is to leave it.
- **Placeholder scan:** none — every code step shows full code.
- **Type consistency:** `requireSuperAdmin` (T1), `UsersPageInner`/`UsersPage` (T2), `linkWhenSingle` on `NavSection` and `only` local (T3), `NavCmd`/`superAdmin` (T4) are each defined where first used and referenced consistently.
