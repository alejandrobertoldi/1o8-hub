# Testing Patterns

**Analysis Date:** 2026-03-21

## Test Framework

**Runner:**
- Vitest 4.1.0 - Fast unit test runner with Jest-like API
- Config: `vitest.config.ts` in project root
- Environment: jsdom (DOM + browser APIs for component testing)
- Setup file: `src/test/setup.ts` (loads Testing Library jest-dom matchers)

**Assertion Library:**
- Testing Library `@testing-library/react@16.3.2` for component assertions
- Jest DOM matchers via `@testing-library/jest-dom@6.9.1`
- Vitest `expect()` API for custom assertions

**Run Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode (reruns on file changes)
```

Note: No coverage reporting configured in package.json, but vitest supports `--coverage` flag if needed.

## Test File Organization

**Location:**
- Co-located with source: test file sits next to the code it tests
- Examples: `src/app/api/seo/projects/route.test.ts` next to `route.ts`
- Examples: `src/components/seo/quality-sparkline.test.tsx` next to `quality-sparkline.tsx`

**Naming:**
- Pattern: `{source-name}.test.ts` or `{source-name}.test.tsx`
- Vitest config matches: `include: ['src/**/*.test.{ts,tsx}']`

**Structure:**
```
src/
├── app/
│   ├── api/
│   │   └── seo/
│   │       ├── projects/
│   │       │   ├── route.ts
│   │       │   └── route.test.ts          ← Co-located test
│   │       └── quality/
│   │           ├── route.ts
│   │           └── route.test.ts          ← Co-located test
│   └── seo/
│       └── [id]/
│           └── intake/
│               └── page.tsx
├── components/
│   └── seo/
│       ├── quality-sparkline.tsx
│       ├── quality-sparkline.test.tsx     ← Co-located test
│       └── manager/
│           ├── diff-modal.tsx
│           └── diff-modal.test.tsx        ← Co-located test
├── hooks/
│   ├── use-outside-click.ts
│   └── use-outside-click.test.ts          ← Co-located test
└── lib/
    └── db/
        ├── schema.ts
        └── __tests__/
            └── normalize-variations.test.ts  ← Exception: helper logic
```

## Test Structure

**Suite Organization:**

```typescript
// src/app/api/seo/projects/route.test.ts (full example)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 1. Setup mocks using vi.hoisted() at top (before imports)
const { mockDb, mockedGetAuthSession } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "insert", "update", "set", "values", "returning", "execute", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue([]);
  return { mockDb, mockedGetAuthSession: vi.fn() };
});

// 2. Mock modules BEFORE importing the code under test
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", name: "name", /* ... */ },
  seoAsins: { /* ... */ },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));

// 3. Import code under test (after mocks)
import { GET, POST } from "./route";

// 4. Setup constants
const mockSession = { user: { email: "test@1o8.agency", role: "admin" } };

// 5. Setup/teardown
beforeEach(() => vi.clearAllMocks());

// 6. Describe blocks with tests
describe("GET /api/seo/projects", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 500 when database query fails", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb.orderBy.mockRejectedValueOnce(new Error("DB connection lost"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("DB connection lost");
  });
});

describe("POST /api/seo/projects", () => {
  // More tests...
});
```

**Patterns:**

**Setup (beforeEach):**
```typescript
beforeEach(() => vi.clearAllMocks());
```
Clears all mock call history and implementation before each test to prevent cross-test pollution.

**Mock Setup (vi.hoisted):**
- Create chainable mock objects BEFORE importing code
- Drizzle query chains need all methods to return the chain object for fluent API
- Terminal methods (`orderBy`, `returning`, `execute`) resolve to mocked results
- Place mocks in `vi.hoisted()` callback to run before imports

**Async Testing (async/await):**
```typescript
it("creates a project and returns it", async () => {
  mockedGetAuthSession.mockResolvedValue(mockSession);
  const created = { id: "new-1", name: "New Project", /* ... */ };
  mockDb.returning.mockResolvedValueOnce([created]);
  const res = await POST(new NextRequest("http://localhost/api/seo/projects", {
    method: "POST",
    body: JSON.stringify({ name: "New Project" }),
  }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBe("new-1");
});
```
All async calls awaited; mocks set up with `.mockResolvedValue()` for promises.

## Mocking

**Framework:** Vitest `vi` object (imported from `vitest`)

**Mock Patterns:**

**Mocking modules:**
```typescript
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
```
Must occur before importing the code that uses these modules.

**Mocking function calls:**
```typescript
const handler = vi.fn();
const onClose = vi.fn();
// Usage:
fireEvent.click(screen.getByText("Close"));
expect(onClose).toHaveBeenCalledTimes(1);
```

**Mocking resolved/rejected values:**
```typescript
mockedGetAuthSession.mockResolvedValue(mockSession);     // Returns a promise that resolves
mockDb.orderBy.mockRejectedValueOnce(new Error("DB error"));  // Returns a rejected promise
```

**Mocking return values:**
```typescript
mockDb.returning.mockResolvedValueOnce([{ id: "1", name: "Test" }]);
```

**What to Mock:**
- External/infrastructure code: database (`db`), authentication (`getAuthSession`), APIs
- Dependencies that are slow: external APIs, file I/O, network calls
- Modules that need control: mocking specific implementations

**What NOT to Mock:**
- Pure utility functions in the same directory
- DOM utilities from Testing Library
- React hooks (use `renderHook` instead)
- The code under test itself

## Fixtures and Factories

**Test Data:**

**Factory function pattern (from codebase):**
```typescript
// src/components/seo/manager/diff-modal.test.tsx
function makeVersion(num: string, fields: Record<string, string>): SeoVersion {
  return {
    seoVersionNumber: num,
    seoCategory: "Standard",
    seoStatus: "Current",
    seoDocUrl: null,
    fields,
    populatedCount: Object.keys(fields).length,
  };
}

// Usage in tests:
const v1 = makeVersion("1", { Title: "Same" });
const v2 = makeVersion("2", { Title: "Same" });
render(<DiffModal v1={v1} v2={v2} onClose={vi.fn()} />);
```

**Inline test data:**
```typescript
const mockSession = { user: { email: "test@1o8.agency", role: "admin" } };
const fakeScores = [{ id: "1", projectId: "abc", overallScore: 85 }];
```

**Location:**
- Test data defined in the test file itself, not in separate fixtures
- Factory functions as helper functions at top of test file
- No centralized fixture directory observed

## Coverage

**Requirements:** Not enforced (no coverage thresholds in config)

**View Coverage:**
```bash
npm run test -- --coverage
```
(Vitest supports coverage via `--coverage` flag, backed by c8)

## Test Types

**Unit Tests:**
- Scope: Single function or component in isolation
- Approach: Mock all dependencies; test only the function's logic
- Examples:
  - `src/lib/db/__tests__/normalize-variations.test.ts` — Pure function logic (no DB)
  - `src/components/seo/quality-sparkline.test.tsx` — React component props → DOM output

**Integration Tests:**
- Scope: Multiple components or functions working together
- Approach: Mock external services (DB, auth) but test the integration
- Examples:
  - `src/app/api/seo/projects/route.test.ts` — Mock DB + auth, test full route handler
  - `src/components/seo/manager/diff-modal.test.tsx` — Modal + child components + user interactions

**E2E Tests:**
- Framework: Not used (no Cypress, Playwright, or end-to-end runner detected)
- Note: Manual testing via dev server or production instance
- Vitest is limited to unit + integration; full E2E would require separate framework

## Common Patterns

**Async Testing:**

```typescript
// src/app/api/seo/projects/route.test.ts
it("creates a project and returns it", async () => {
  mockedGetAuthSession.mockResolvedValue(mockSession);
  const created = { id: "new-1", name: "New Project", status: "draft" };
  mockDb.returning.mockResolvedValueOnce([created]);
  const res = await POST(new NextRequest("http://localhost/api/seo/projects", {
    method: "POST",
    body: JSON.stringify({ name: "New Project", brand_name: "Brand" }),
  }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBe("new-1");
});
```

All `await` statements used for promises. Mock `.mockResolvedValueOnce()` for single-use returns.

**Error Testing:**

```typescript
// src/app/api/seo/quality/route.test.ts
it("returns 500 when database query fails", async () => {
  mockedGetAuthSession.mockResolvedValue(mockSession);
  mockDb.orderBy.mockRejectedValueOnce(new Error("DB connection lost"));
  const res = await GET(new NextRequest("http://localhost/api/seo/quality?projectId=abc"));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toBe("DB connection lost");
});
```

Mocks configured to reject; test verifies the error is caught and returned correctly.

**Component Props Testing:**

```typescript
// src/components/seo/quality-sparkline.test.tsx
it("accepts custom width and height", () => {
  const { container } = render(
    <QualitySparkline scores={[60, 80]} width={100} height={30} />
  );
  const svg = container.querySelector("svg");
  expect(svg?.getAttribute("width")).toBe("100");
  expect(svg?.getAttribute("height")).toBe("30");
});
```

Props passed directly to `render()`; assertions check DOM output.

**User Interaction Testing:**

```typescript
// src/components/seo/manager/diff-modal.test.tsx
it("calls onClose when close button is clicked", () => {
  const onClose = vi.fn();
  const v1 = makeVersion("1", { Title: "A" });
  const v2 = makeVersion("2", { Title: "B" });
  render(<DiffModal v1={v1} v2={v2} onClose={onClose} />);
  fireEvent.click(screen.getByText("Close"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

Uses `fireEvent` for simulating clicks; callback mocks verify handler was called.

**Hook Testing:**

```typescript
// src/hooks/use-outside-click.test.ts
it("calls handler when clicking outside the ref element", () => {
  const handler = vi.fn();
  const { result } = renderHook(() => useOutsideClick(handler));

  const inside = document.createElement("div");
  document.body.appendChild(inside);
  Object.defineProperty(result.current, "current", {
    value: inside,
    writable: true,
  });

  act(() => {
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(handler).toHaveBeenCalledTimes(1);

  document.body.removeChild(inside);
});
```

Uses `renderHook()` from Testing Library; `act()` wrapper for DOM events; cleanup with `removeChild()`.

## Assertion Patterns

**Status code assertions:**
```typescript
expect(res.status).toBe(401);
expect(res.status).toBe(400);
expect(res.status).toBe(200);
```

**JSON body assertions:**
```typescript
const body = await res.json();
expect(body.id).toBe("new-1");
expect(body.error).toBe("Not authenticated");
expect(body).toEqual(expectedObject);
```

**DOM assertions:**
```typescript
expect(container.innerHTML).toBe("");                              // Empty DOM
expect(svg).toBeInTheDocument();                                  // Exists in DOM
expect(polyline?.getAttribute("points")).toBeTruthy();            // Has attribute
expect(screen.getByText("No differences found...")).toBeInTheDocument();  // Text visible
expect(screen.getByLabelText(/Quality trend:/)).toBeInTheDocument();      // ARIA label
```

**Mock call assertions:**
```typescript
expect(handler).toHaveBeenCalledTimes(1);       // Called once
expect(onClose).not.toHaveBeenCalled();          // Never called
expect(mockDb.orderBy).toHaveBeenCalled();       // Called at least once
```

---

*Testing analysis: 2026-03-21*
