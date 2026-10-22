# Case Study Page 4 Marketplace Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make case-study page 4 show only the Amazon channel or channels identified by the client's AAC `Marketplace` value, using a full-width card for single-channel clients.

**Architecture:** Read `rawData.Marketplace` through both case-study GET endpoints and pass it as `clientMarketplace` through `CaseStudyData` and `CaseStudyGlobals`. A small pure classifier converts the loose AAC string into `seller`, `vendor`, `both`, or `unknown`; the channels renderer uses that classification to choose card visibility and one- versus two-column layout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Drizzle ORM, Vitest 4, Testing Library

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-06-23-case-study-page4-marketplace-visibility-design.md`.
- SC-only clients render Seller Central only; VC-only clients render Vendor Central only; combined clients render both.
- Missing or unrecognized marketplace values render both cards as the safe fallback.
- A single visible card spans the full page width; two visible cards retain the existing two-column layout.
- Do not infer marketplace from `clientIdCode`.
- Keep both channel configurations editable.
- Do not regenerate case-study sections or add a database migration.
- Do not rewrite page-4 narrative, KPI content, colors, or channel order.
- The current main worktree contains unrelated changes. At execution time, use `superpowers:using-git-worktrees` to create an isolated `codex/` worktree from commit `75b84713` or the then-current main HEAD.
- Stage explicit files only. Never use `git add .`.
- After code changes, run `graphify update .`; do not stage unrelated pre-existing graph changes.

---

## File Structure

- Create `src/lib/case-study/marketplace.ts`: pure parsing and classification of AAC Marketplace values.
- Create `src/lib/case-study/marketplace.test.ts`: classifier contract and edge cases.
- Modify `src/lib/case-study/types.ts`: add `clientMarketplace` to shared case-study data/globals.
- Modify `src/components/case-study/sections/_index.tsx`: add the field to renderer globals.
- Modify `src/components/case-study/case-study-view.tsx`: copy API data into renderer globals.
- Modify `src/app/api/case-studies/route.ts`: include Marketplace in the internal/list payload.
- Modify `src/app/api/case-studies/[id]/route.ts`: include Marketplace and client name in the detail/portal payload.
- Create `src/app/api/case-studies/route.test.ts`: verify list GET returns `clientMarketplace`.
- Create `src/app/api/case-studies/[id]/route.test.ts`: verify detail GET returns `clientMarketplace`.
- Modify `src/components/case-study/sections/channels.tsx`: filter cards and select grid width.
- Create `src/components/case-study/sections/channels.test.tsx`: verify SC, VC, both, fallback, ordering, and width.

---

### Task 1: Classify AAC Marketplace values

**Files:**
- Create: `src/lib/case-study/marketplace.ts`
- Create: `src/lib/case-study/marketplace.test.ts`

**Interfaces:**
- Consumes: `string | null | undefined` from AAC `rawData.Marketplace`.
- Produces: `classifyClientMarketplace(value): "seller" | "vendor" | "both" | "unknown"`.

- [ ] **Step 1: Write the failing classifier tests**

Create `src/lib/case-study/marketplace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyClientMarketplace } from "./marketplace";

describe("classifyClientMarketplace", () => {
  it.each(["SC", "Amazon SC", "Seller Central", "amazon seller central"])(
    "classifies %s as seller",
    (value) => expect(classifyClientMarketplace(value)).toBe("seller"),
  );

  it.each(["VC", "Amazon VC", "Vendor Central", "amazon vendor central"])(
    "classifies %s as vendor",
    (value) => expect(classifyClientMarketplace(value)).toBe("vendor"),
  );

  it.each(["SC + VC", "Amazon SC / VC", "Seller Central and Vendor Central"])(
    "classifies %s as both",
    (value) => expect(classifyClientMarketplace(value)).toBe("both"),
  );

  it.each([undefined, null, "", "Amazon US", "Marketplace"])(
    "classifies %s as unknown",
    (value) => expect(classifyClientMarketplace(value)).toBe("unknown"),
  );

  it("does not treat SC or VC inside another word as a channel token", () => {
    expect(classifyClientMarketplace("SCENTED")).toBe("unknown");
    expect(classifyClientMarketplace("VCR")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test -- src/lib/case-study/marketplace.test.ts
```

Expected: FAIL because `./marketplace` does not exist.

- [ ] **Step 3: Implement the minimal pure classifier**

Create `src/lib/case-study/marketplace.ts`:

```ts
export type ClientMarketplaceMode = "seller" | "vendor" | "both" | "unknown";

const SELLER_PHRASE = /\bSELLER\s+CENTRAL\b/;
const VENDOR_PHRASE = /\bVENDOR\s+CENTRAL\b/;
const SC_TOKEN = /(?:^|[^A-Z0-9])SC(?:[^A-Z0-9]|$)/;
const VC_TOKEN = /(?:^|[^A-Z0-9])VC(?:[^A-Z0-9]|$)/;

export function classifyClientMarketplace(
  value: string | null | undefined,
): ClientMarketplaceMode {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!normalized) return "unknown";

  const hasSeller = SELLER_PHRASE.test(normalized) || SC_TOKEN.test(normalized);
  const hasVendor = VENDOR_PHRASE.test(normalized) || VC_TOKEN.test(normalized);

  if (hasSeller && hasVendor) return "both";
  if (hasSeller) return "seller";
  if (hasVendor) return "vendor";
  return "unknown";
}
```

- [ ] **Step 4: Run the classifier test and verify it passes**

Run:

```bash
npm run test -- src/lib/case-study/marketplace.test.ts
```

Expected: all classifier tests PASS.

- [ ] **Step 5: Commit the classifier**

```bash
git add -- src/lib/case-study/marketplace.ts src/lib/case-study/marketplace.test.ts
git commit -m "feat(case-study): classify client marketplace"
```

---

### Task 2: Propagate Marketplace through both case-study APIs

**Files:**
- Modify: `src/lib/case-study/types.ts`
- Modify: `src/components/case-study/sections/_index.tsx`
- Modify: `src/components/case-study/case-study-view.tsx`
- Modify: `src/app/api/case-studies/route.ts`
- Modify: `src/app/api/case-studies/[id]/route.ts`
- Create: `src/app/api/case-studies/route.test.ts`
- Create: `src/app/api/case-studies/[id]/route.test.ts`

**Interfaces:**
- Consumes: `aac.rawData?.Marketplace`.
- Produces: `CaseStudyData.clientMarketplace?: string` and `CaseStudyGlobals.clientMarketplace?: string`.
- Produces API JSON field: `clientMarketplace`.

- [ ] **Step 1: Write the failing list-route test**

Create `src/app/api/case-studies/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockedGetAuthSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/db/schema", () => ({
  aac: { clientIdCode: "aac.client_id_code", clientName: "aac.client_name", rawData: "aac.raw_data" },
  caseStudies: { clientIdCode: "case_studies.client_id_code" },
  caseStudySections: { caseStudyId: "case_study_sections.case_study_id" },
}));
vi.mock("@/lib/case-study/generate", () => ({
  resolveAccountId: vi.fn(),
  generateCaseStudySections: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { GET } from "./route";

function selectWithLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
    })),
  };
}

function selectWithWhere(rows: unknown[]) {
  return {
    from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAuthSession.mockResolvedValue({ user: { role: "admin" } });
});

describe("GET /api/case-studies", () => {
  it("returns the AAC Marketplace value as clientMarketplace", async () => {
    mockDb.select
      .mockReturnValueOnce(selectWithLimit([{
        id: "cs-1",
        clientIdCode: "DRC_SC_US",
        status: "draft",
      }]))
      .mockReturnValueOnce(selectWithWhere([]))
      .mockReturnValueOnce(selectWithLimit([{
        clientName: "Doctor's Best",
        rawData: { Marketplace: "Amazon SC" },
      }]));

    const req = new NextRequest(
      "http://localhost/api/case-studies?clientIdCode=DRC_SC_US",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clientName).toBe("Doctor's Best");
    expect(body.clientMarketplace).toBe("Amazon SC");
  });
});
```

- [ ] **Step 2: Write the failing detail-route test**

Create `src/app/api/case-studies/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockedGetAuthSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/db/schema", () => ({
  aac: { clientIdCode: "aac.client_id_code", clientName: "aac.client_name", rawData: "aac.raw_data" },
  caseStudies: { id: "case_studies.id" },
  caseStudySections: { caseStudyId: "case_study_sections.case_study_id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { GET } from "./route";

function selectWithLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
    })),
  };
}

function selectWithWhere(rows: unknown[]) {
  return {
    from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(rows) })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAuthSession.mockResolvedValue({ user: { role: "admin" } });
});

describe("GET /api/case-studies/[id]", () => {
  it("returns clientMarketplace for the portal detail payload", async () => {
    mockDb.select
      .mockReturnValueOnce(selectWithLimit([{
        id: "cs-1",
        clientIdCode: "DRC_SC_US",
        status: "published",
      }]))
      .mockReturnValueOnce(selectWithWhere([]))
      .mockReturnValueOnce(selectWithLimit([{
        clientName: "Doctor's Best",
        rawData: { Marketplace: "Amazon SC" },
      }]));

    const res = await GET(
      {} as never,
      { params: Promise.resolve({ id: "cs-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clientName).toBe("Doctor's Best");
    expect(body.clientMarketplace).toBe("Amazon SC");
  });
});
```

- [ ] **Step 3: Run both API tests and verify they fail**

Run:

```bash
npm run test -- \
  src/app/api/case-studies/route.test.ts \
  'src/app/api/case-studies/[id]/route.test.ts'
```

Expected: both tests FAIL because `clientMarketplace` is absent.

- [ ] **Step 4: Add marketplace to the shared data contracts**

In `src/lib/case-study/types.ts`, add the optional field to both interfaces:

```ts
export interface CaseStudyGlobals {
  clientName:        string;
  clientMarketplace?: string;
  clientSector:      string;
  contactEmail:      string;
  officeLocations:   string;
  reportingPeriod:   string;
}
```

```ts
export interface CaseStudyData {
  id:                 string;
  clientIdCode:       string;
  clientName:         string;
  clientMarketplace?: string;
  title:              string;
  dateRangeStart:     string;
  dateRangeEnd:       string;
  sectionsEnabled:    SectionType[];
  status:             "draft" | "published";
  generatedAt:        string | null;
  clientSector:       string;
  contactEmail:       string;
  officeLocations:    string;
  sections:           CaseStudySectionData[];
}
```

In `src/components/case-study/sections/_index.tsx`, add the same optional field:

```ts
export interface CaseStudyGlobals {
  clientName:         string;
  clientMarketplace?: string;
  clientSector:       string;
  contactEmail:       string;
  officeLocations:    string;
  reportingPeriod:    string;
}
```

In `src/components/case-study/case-study-view.tsx`, copy it into globals:

```ts
const globals: CaseStudyGlobals = {
  clientName:        data.clientName,
  clientMarketplace: data.clientMarketplace,
  clientSector:      data.clientSector ?? "",
  contactEmail:      data.contactEmail ?? "hello@1o8.agency",
  officeLocations:   data.officeLocations ?? "Chicago / Portland",
  reportingPeriod:   formatReportingPeriod(data.dateRangeStart, data.dateRangeEnd),
};
```

- [ ] **Step 5: Add Marketplace to the list GET payload**

In `src/app/api/case-studies/route.ts`, expand the AAC projection:

```ts
const clientRows = await db
  .select({ clientName: aac.clientName, rawData: aac.rawData })
  .from(aac)
  .where(eq(aac.clientIdCode, clientIdCode))
  .limit(1);

const client = clientRows[0];

return NextResponse.json({
  ...cs,
  clientName: client?.clientName ?? clientIdCode,
  clientMarketplace: client?.rawData?.Marketplace?.trim() || undefined,
  sections: sections.sort((a, b) => a.sortOrder - b.sortOrder),
});
```

- [ ] **Step 6: Add Marketplace to the detail GET payload**

In `src/app/api/case-studies/[id]/route.ts`, import `aac`:

```ts
import { aac, caseStudies, caseStudySections } from "@/lib/db/schema";
```

After loading sections, load AAC metadata:

```ts
const clientRows = await db
  .select({ clientName: aac.clientName, rawData: aac.rawData })
  .from(aac)
  .where(eq(aac.clientIdCode, cs.clientIdCode))
  .limit(1);

const client = clientRows[0];
```

Return the metadata with the detail payload:

```ts
return NextResponse.json({
  ...cs,
  clientName: client?.clientName ?? cs.clientIdCode,
  clientMarketplace: client?.rawData?.Marketplace?.trim() || undefined,
  sections: sections.sort((a, b) => a.sortOrder - b.sortOrder),
});
```

- [ ] **Step 7: Run the API and existing view tests**

Run:

```bash
npm run test -- \
  src/app/api/case-studies/route.test.ts \
  'src/app/api/case-studies/[id]/route.test.ts' \
  src/components/case-study/case-study-view.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 8: Commit API and type propagation**

```bash
git add -- \
  src/lib/case-study/types.ts \
  src/components/case-study/sections/_index.tsx \
  src/components/case-study/case-study-view.tsx \
  src/app/api/case-studies/route.ts \
  src/app/api/case-studies/route.test.ts \
  'src/app/api/case-studies/[id]/route.ts' \
  'src/app/api/case-studies/[id]/route.test.ts'
git commit -m "feat(case-study): expose client marketplace"
```

---

### Task 3: Filter page-4 cards and expand single-channel layout

**Files:**
- Modify: `src/components/case-study/sections/channels.tsx`
- Create: `src/components/case-study/sections/channels.test.tsx`

**Interfaces:**
- Consumes: `globals.clientMarketplace?: string`.
- Consumes: `classifyClientMarketplace(value)` from Task 1.
- Produces: channel-card DOM markers `data-channel="seller"` and `data-channel="vendor"`.
- Produces: grid marker `data-channel-columns="1" | "2"`.

- [ ] **Step 1: Write the failing renderer tests**

Create `src/components/case-study/sections/channels.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ChannelsSection } from "./channels";
import type { ChannelsContent } from "@/lib/case-study/types";

const content: ChannelsContent = {
  sectionLabel: "04 · Two Marketplaces",
  sectionRight: "",
  head1: "Channels in play",
  head2: "Owned content and paid media",
  body: "Body",
  sellerCentral: {
    title: "Seller Central",
    tagline: "Seller",
    share: "3P",
    kpis: [
      { label: "One", value: "1" },
      { label: "Two", value: "2" },
      { label: "Three", value: "3" },
      { label: "Four", value: "4" },
    ],
  },
  vendorCentral: {
    title: "Vendor Central",
    tagline: "Vendor",
    share: "1P",
    kpis: [
      { label: "One", value: "1" },
      { label: "Two", value: "2" },
      { label: "Three", value: "3" },
      { label: "Four", value: "4" },
    ],
  },
};

const baseGlobals = {
  clientName: "Client",
  clientSector: "",
  contactEmail: "hello@1o8.agency",
  officeLocations: "Chicago",
  reportingPeriod: "2026",
};

function renderChannels(clientMarketplace?: string) {
  return render(
    <ChannelsSection
      section={{ id: "channels", sortOrder: 3, content }}
      globals={{ ...baseGlobals, clientMarketplace }}
    />,
  );
}

describe("ChannelsSection marketplace visibility", () => {
  it("renders Seller Central only at full width for SC clients", () => {
    const { container } = renderChannels("Amazon SC");
    expect(container.querySelector('[data-channel="seller"]')).toBeTruthy();
    expect(container.querySelector('[data-channel="vendor"]')).toBeNull();
    expect(container.querySelector('[data-channel-columns="1"]')).toBeTruthy();
  });

  it("renders Vendor Central only at full width for VC clients", () => {
    const { container } = renderChannels("Vendor Central");
    expect(container.querySelector('[data-channel="seller"]')).toBeNull();
    expect(container.querySelector('[data-channel="vendor"]')).toBeTruthy();
    expect(container.querySelector('[data-channel-columns="1"]')).toBeTruthy();
  });

  it("renders both cards in seller-first order for combined clients", () => {
    const { container } = renderChannels("SC + VC");
    const cards = Array.from(container.querySelectorAll("[data-channel]"));
    expect(cards.map((card) => card.getAttribute("data-channel"))).toEqual([
      "seller",
      "vendor",
    ]);
    expect(container.querySelector('[data-channel-columns="2"]')).toBeTruthy();
  });

  it.each([undefined, "", "Amazon US"])(
    "renders both cards for fallback value %s",
    (value) => {
      const { container } = renderChannels(value);
      expect(container.querySelectorAll("[data-channel]")).toHaveLength(2);
      expect(container.querySelector('[data-channel-columns="2"]')).toBeTruthy();
    },
  );
});
```

- [ ] **Step 2: Run the renderer test and verify it fails**

Run:

```bash
npm run test -- src/components/case-study/sections/channels.test.tsx
```

Expected: FAIL because page 4 still always renders both cards and has no channel markers.

- [ ] **Step 3: Pass marketplace metadata into the channels renderer**

In `src/components/case-study/sections/channels.tsx`, import the classifier:

```ts
import { classifyClientMarketplace } from "@/lib/case-study/marketplace";
```

Add marketplace to the local globals shape:

```ts
interface Globals {
  clientName: string;
  clientMarketplace?: string;
  clientSector: string;
  contactEmail: string;
  officeLocations: string;
  reportingPeriod: string;
}
```

Accept and inspect globals:

```ts
export function ChannelsSection({ section, globals }: Props) {
  const c = section.content;
  const mode = classifyClientMarketplace(globals.clientMarketplace);
  const showSeller = mode !== "vendor";
  const showVendor = mode !== "seller";
  const columnCount = showSeller && showVendor ? 2 : 1;
```

- [ ] **Step 4: Render only applicable cards and select the grid width**

Add a `channelKey` prop to `ChannelStackCard` and expose it on the existing root
card element without adding a wrapper that could change equal-height grid
behavior. Apply this exact diff:

```diff
function ChannelStackCard({
  stack,
  channelLabel,
  topColor,
  shareColor,
+  channelKey,
}: {
  stack: ChannelStack;
  channelLabel: string;
  topColor: string;
  shareColor: string;
+  channelKey: "seller" | "vendor";
}) {
  return (
    <div
+      data-channel={channelKey}
      style={{
      }}
```

Do not change any other `ChannelStackCard` markup or styles.

Then replace the fixed card grid in `ChannelsSection` with:

```tsx
<div
  data-channel-columns={columnCount}
  style={{
    display: "grid",
    gridTemplateColumns: columnCount === 1 ? "1fr" : "1fr 1fr",
    gap: 24,
  }}
>
  {showSeller && (
    <ChannelStackCard
      stack={c.sellerCentral}
      channelKey="seller"
      channelLabel="Channel 01"
      topColor="var(--c-yellow)"
      shareColor="var(--c-yellow)"
    />
  )}
  {showVendor && (
    <ChannelStackCard
      stack={c.vendorCentral}
      channelKey="vendor"
      channelLabel={showSeller ? "Channel 02" : "Channel 01"}
      topColor="var(--c-white)"
      shareColor="var(--c-white)"
    />
  )}
</div>
```

The Vendor-only card becomes `Channel 01`; dual-channel ordering and labels remain unchanged.

- [ ] **Step 5: Run focused page-4 and classifier tests**

Run:

```bash
npm run test -- \
  src/lib/case-study/marketplace.test.ts \
  src/components/case-study/sections/channels.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 6: Run the full case-study test set**

Run:

```bash
npm run test -- src/lib/case-study src/components/case-study src/app/api/case-studies
```

Expected: all matching case-study tests PASS.

- [ ] **Step 7: Commit page-4 rendering**

```bash
git add -- \
  src/components/case-study/sections/channels.tsx \
  src/components/case-study/sections/channels.test.tsx
git commit -m "feat(case-study): filter page 4 by marketplace"
```

---

### Task 4: Build and verify the live page

**Files:**
- Modify only if verification exposes a defect in files already listed in Tasks 1-3.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: test, build, graph, and browser-render evidence.

- [ ] **Step 1: Run the complete focused test suite**

Run:

```bash
npm run test -- \
  src/lib/case-study/marketplace.test.ts \
  src/components/case-study/sections/channels.test.tsx \
  src/components/case-study/case-study-view.test.tsx \
  src/app/api/case-studies/route.test.ts \
  'src/app/api/case-studies/[id]/route.test.ts'
```

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully with no TypeScript errors.

- [ ] **Step 3: Refresh the knowledge graph**

Run:

```bash
graphify update .
```

Expected: graph update completes. Do not stage unrelated graph files if they were already dirty.

- [ ] **Step 4: Start the app for render verification**

Run:

```bash
PORT=3000 npm run dev
```

Expected: Next.js reports the app ready at `http://localhost:3000`.

- [ ] **Step 5: Verify an SC-only client**

Open:

```text
http://localhost:3000/clients/DRC_SC_US/case-study
```

Verify page 4:

- Seller Central is visible.
- Vendor Central is absent.
- The Seller Central card spans the full available grid width.
- Existing copy, KPI values, colors, and edit control still render.
- Browser console has no errors.

- [ ] **Step 6: Verify VC-only and dual-channel fixtures**

Use AAC records whose `Marketplace` values are VC-only and combined SC+VC. Open each client's case study and verify:

- VC-only: one full-width Vendor Central card labeled `Channel 01`.
- Combined: Seller Central then Vendor Central in the existing two-column layout.

If no generated case study exists for either category, verify the API value with a read-only AAC query and use the passing renderer tests as evidence. Do not create or regenerate production-backed case studies solely for verification.

- [ ] **Step 7: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git log --oneline -4
```

Expected:

- only intended implementation files are changed or committed in the isolated worktree;
- no whitespace errors;
- three implementation commits follow the design-spec commit.
