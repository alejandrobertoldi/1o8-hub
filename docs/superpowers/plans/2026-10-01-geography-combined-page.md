# Geography Combined Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Hub `/reports/order-geography` and `/reports/fba-inventory-map` pages into one "Geography" page with an Orders / Inventory / Both switch.

**Architecture:** The page owns `view`, the orders range and the stock month (mirrored to the URL) and composes the two EXISTING sections: `OrderGeographySection` (Orders, and Both with the stock layer) or `FbaInventoryMapSection` (Inventory). Both sections become *controlled* for the stock month and report the available months back up through a callback, so the month picker lives in the header bar. The FBA page becomes a redirect.

**Tech Stack:** Next.js 16 App Router (client pages), React 19, Tailwind 4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-geography-combined-page-design.md`

## Global Constraints

- Work ONLY in `/Users/manu/MFHub/.worktrees/fba-design-tweaks`, branch `thread-z2/fba-design-tweaks`. Never the `/Users/manu/MFHub` main checkout.
- Whole page is fixed-light `.mf-paper` in dark AND light. **No `dark:` variants** in any file under `src/components/reports/fba-inventory-map/`.
- Portal Order Geography (`src/app/portal/reports/order-geography/page.tsx`) is NOT edited and must render no view switch, no stock UI, and never "No orders shipped here in this window."
- **No API changes.** Never run any `scripts/_apply-*`. Never `next build`.
- Dates cross module boundaries as `YYYY-MM-DD` / `YYYY-MM` strings, never `Date`.
- Commits: explicit pathspec on add AND commit, `-m` before `--`, NEVER `git add .`; never commit `src/generated/data-map.json`, `scripts/_tmp-*`, `.superpowers/*`. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Ask Manu before every commit** (per-action OK).
- tsc: `node_modules/.bin/tsc --noEmit`, judge BY FILENAME. Inherited baseline = 8 files, none under `src/components/reports/`, `src/app/reports/`, `src/lib/reports/`, `src/components/layout/`.
- Vitest baseline before this plan: `npx vitest run src/components/reports/fba-inventory-map src/components/reports/v2/order-geography-section.test.tsx` = 5 files / 60 pass.
- Copy: view labels exactly `Orders`, `Inventory`, `Both`; nav tab `Geography`; page title `Order <span class="text-brand">Geography</span>`; Both caption exactly `Orders: <prettyDate(start)> – <prettyDate(end)> · Stock: <Mon YYYY> snapshot`; Inventory caption `Stock: <Mon YYYY> snapshot`.

## Review Focus

1. **Callback loops** — `onStockMonths`/`onMonths` fire from an effect on a state-held object; if the page passes a non-stable callback or the section re-derives a new object each render, the page re-renders forever. Expect exactly one callback per settled fetch (pinned in Tasks 3 and 4).
2. **Account switch with a picked month** — the new account may not have that month. Expect the pick to drop to newest in the same render (keyed state), not a fetch for the stale month (section side pinned in Task 4's "account change" test; the page's keyed `monthPick` has no unit test — the page needs the report-controls provider — so Task 6 Step 2 must switch account with a month picked and confirm one fetch without `month=`).
3. **URL params from other controls** — `router.replace` must preserve params it does not own (e.g. anything `useReportControls` puts there). Expect only `view`/`start`/`end`/`month` to be set/deleted (pinned in Task 5 `buildGeographyQuery` test).
4. **Invalid `?view=` / `?month=`** — `?view=foo` → Orders; `?month=2026-13` → ignored (newest) (pinned in Task 1 + Task 5).
5. **Account with no storage-fee reports in Both** — the stock picker must not render an empty select; the map still shows orders with a "No FBA storage-fee reports" status line (pinned in Task 2 + Task 3).

---

### Task 1: View parsing + view switch

**Files:**
- Create: `src/lib/reports/geography-view.ts`
- Create: `src/lib/reports/geography-view.test.ts`
- Create: `src/components/reports/v2/geography-view-switch.tsx`
- Create: `src/components/reports/v2/geography-view-switch.test.tsx`

**Interfaces:**
- Produces: `type GeographyView = "orders" | "inventory" | "both"`; `GEOGRAPHY_VIEWS: readonly GeographyView[]`; `parseGeographyView(v: string | null): GeographyView`; `buildGeographyQuery(current: string, s: { view: GeographyView; start: string | null; end: string | null; month: string | null }): string`; `<GeographyViewSwitch value={GeographyView} onChange={(v: GeographyView) => void} />`.

- [ ] **Step 1: Write the failing tests**

`src/lib/reports/geography-view.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildGeographyQuery, parseGeographyView } from "./geography-view";

describe("parseGeographyView", () => {
  it("accepts the three views", () => {
    expect(parseGeographyView("orders")).toBe("orders");
    expect(parseGeographyView("inventory")).toBe("inventory");
    expect(parseGeographyView("both")).toBe("both");
  });
  it("missing or invalid → orders", () => {
    expect(parseGeographyView(null)).toBe("orders");
    expect(parseGeographyView("foo")).toBe("orders");
    expect(parseGeographyView("")).toBe("orders");
  });
});

describe("buildGeographyQuery", () => {
  it("orders view with a preset range writes nothing", () => {
    expect(buildGeographyQuery("", { view: "orders", start: null, end: null, month: null })).toBe("");
  });
  it("writes view, custom range and month", () => {
    expect(buildGeographyQuery("", { view: "both", start: "2026-07-01", end: "2026-09-30", month: "2026-08" }))
      .toBe("view=both&start=2026-07-01&end=2026-09-30&month=2026-08");
  });
  it("preserves params it does not own and deletes its own when cleared", () => {
    expect(buildGeographyQuery("accountId=42&view=both&month=2026-08", { view: "orders", start: null, end: null, month: null }))
      .toBe("accountId=42");
  });
  it("orders view never writes month", () => {
    expect(buildGeographyQuery("", { view: "orders", start: null, end: null, month: "2026-08" })).toBe("");
  });
});
```

`src/components/reports/v2/geography-view-switch.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeographyViewSwitch } from "./geography-view-switch";

describe("GeographyViewSwitch", () => {
  it("renders the three views, marks the active one, reports clicks", () => {
    const onChange = vi.fn();
    render(<GeographyViewSwitch value="both" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Orders" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(onChange).toHaveBeenCalledWith("inventory");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/reports/geography-view.test.ts src/components/reports/v2/geography-view-switch.test.tsx`
Expected: FAIL — cannot resolve `./geography-view` / `./geography-view-switch`.

- [ ] **Step 3: Implement**

`src/lib/reports/geography-view.ts`:
```ts
export const GEOGRAPHY_VIEWS = ["orders", "inventory", "both"] as const;
export type GeographyView = (typeof GEOGRAPHY_VIEWS)[number];

export function parseGeographyView(v: string | null): GeographyView {
  return (GEOGRAPHY_VIEWS as readonly string[]).includes(v ?? "") ? (v as GeographyView) : "orders";
}

/**
 * Next query string for the Geography page. Only view/start/end/month are
 * owned here; every other param in `current` is preserved untouched.
 * start/end are passed only for a custom range (presets stay out of the URL).
 */
export function buildGeographyQuery(
  current: string,
  s: { view: GeographyView; start: string | null; end: string | null; month: string | null },
): string {
  const qs = new URLSearchParams(current);
  const put = (k: string, v: string | null) => (v ? qs.set(k, v) : qs.delete(k));
  put("view", s.view === "orders" ? null : s.view);
  put("start", s.start);
  put("end", s.end);
  put("month", s.view === "orders" ? null : s.month);
  return qs.toString();
}
```

`src/components/reports/v2/geography-view-switch.tsx` (same compact segmented style as `TrailingRangePicker`):
```tsx
"use client";
import { accentFor } from "./primitives/chart-colors";
import type { GeographyView } from "@/lib/reports/geography-view";

const LABELS: Record<GeographyView, string> = { orders: "Orders", inventory: "Inventory", both: "Both" };

export function GeographyViewSwitch({ value, onChange }: { value: GeographyView; onChange: (v: GeographyView) => void }) {
  const accent = accentFor("hub");
  return (
    <div className="flex gap-0.5 rounded-lg border border-border/40 bg-muted/30 p-0.5">
      {(Object.keys(LABELS) as GeographyView[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2 py-0.5 text-xs font-bold transition-all ${
            value === v ? "text-white shadow-sm" : "text-foreground/70 hover:text-foreground"
          }`}
          style={value === v ? { background: accent } : undefined}
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/reports/geography-view.test.ts src/components/reports/v2/geography-view-switch.test.tsx`
Expected: PASS, 2 files / 7 tests.

- [ ] **Step 5: Commit (ask Manu first)**

```bash
git add -- src/lib/reports/geography-view.ts src/lib/reports/geography-view.test.ts src/components/reports/v2/geography-view-switch.tsx src/components/reports/v2/geography-view-switch.test.tsx
git commit -m "feat(geography): view parsing, URL query builder and view switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/reports/geography-view.ts src/lib/reports/geography-view.test.ts src/components/reports/v2/geography-view-switch.tsx src/components/reports/v2/geography-view-switch.test.tsx
```

---

### Task 2: Stock layer lists every month; status line + month select replace the toggle

**Files:**
- Modify: `src/components/reports/fba-inventory-map/use-stock-layer.ts` (whole file)
- Modify: `src/components/reports/fba-inventory-map/stock-layer-controls.tsx` (whole file)
- Create: `src/components/reports/fba-inventory-map/stock-month-select.tsx`
- Test: `src/components/reports/fba-inventory-map/stock-layer.test.tsx`

**Interfaces:**
- Produces:
  - `type StockMonths = { months: string[]; month: string | null }` (exported from `use-stock-layer.ts`)
  - `useStockLayer({ enabled, accountId, asin, month }: { enabled: boolean; accountId: string; asin: string | null; month: string | null }): StockLayerState` — **`start`/`end` removed**
  - `StockLayerState = off | loading | error{message} | no-reports | ok{month, months, data, bubbles}` — `no-month` renamed `no-reports`
  - `StockLayerStatus({ layer, ordersLabel }: { layer: StockLayerState; ordersLabel?: string })` — replaces `StockLayerControls`
  - `StockMonthSelect({ value, months, onChange }: { value: string; months: string[]; onChange: (m: string) => void })`
- Note: `order-geography-section.tsx` still imports the OLD names after this task → tsc errors there are EXPECTED until Task 3; vitest for this task's file must pass.

- [ ] **Step 1: Rewrite the tests**

In `stock-layer.test.tsx`: change `base` to `const base = { accountId: "1", asin: null, month: null };`, change the import line to
`import { StockLayerStatus } from "./stock-layer-controls";` plus `import { StockMonthSelect } from "./stock-month-select";`, and replace the whole `describe("useStockLayer", …)` and `describe("StockLayerControls", …)` blocks with:

```tsx
describe("useStockLayer", () => {
  it("off: no fetch", async () => {
    render(<Harness {...base} enabled={false} />);
    expect(screen.getByTestId("s")).toHaveTextContent("off:");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("no month: one fetch (asin appended), resolves to the API's month, lists ALL available months", async () => {
    fetchMock.mockResolvedValue(ok(stock()));
    function Months() {
      const s = useStockLayer({ ...base, enabled: true, asin: "B0TEST0001" });
      return <div data-testid="m">{s.status === "ok" ? `${s.month}|${s.months.join(",")}` : s.status}</div>;
    }
    render(<Months />);
    await waitFor(() => expect(screen.getByTestId("m")).toHaveTextContent("2026-08|2026-08,2026-07,2026-06"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001");
  });
  it("a picked month is fetched directly, with no range restriction", async () => {
    fetchMock.mockResolvedValue(ok(stock({ month: "2026-06" })));
    render(<Harness {...base} month="2026-06" enabled />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("ok:2026-06"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1&month=2026-06");
  });
  it("account with no storage-fee reports → no-reports", async () => {
    fetchMock.mockResolvedValue(ok(stock({ month: null, availableMonths: [] })));
    render(<Harness {...base} enabled />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("no-reports:"));
  });
});

describe("StockLayerStatus", () => {
  const ok2: StockLayerState = { status: "ok", month: "2026-08", months: ["2026-08", "2026-07"], data: stock(), bubbles: [] };
  it("Both caption names both periods, plus the unplaced note; no toggle button", () => {
    render(<StockLayerStatus layer={ok2} ordersLabel="Jul 1, 2026 – Sep 30, 2026" />);
    expect(screen.getByText("Orders: Jul 1, 2026 – Sep 30, 2026 · Stock: Aug 2026 snapshot")).toBeInTheDocument();
    expect(screen.getByText("40 units (40%) couldn't be placed on the map")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("without ordersLabel the caption is stock only", () => {
    render(<StockLayerStatus layer={ok2} />);
    expect(screen.getByText("Stock: Aug 2026 snapshot")).toBeInTheDocument();
  });
  it("no-reports and error states", () => {
    const { rerender } = render(<StockLayerStatus layer={{ status: "no-reports" }} />);
    expect(screen.getByText("No FBA storage-fee reports for this account")).toBeInTheDocument();
    rerender(<StockLayerStatus layer={{ status: "error", message: "boom" }} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});

describe("StockMonthSelect", () => {
  it("labels months and reports the pick", () => {
    const onChange = vi.fn();
    render(<StockMonthSelect value="2026-08" months={["2026-08", "2026-07"]} onChange={onChange} />);
    expect(screen.getByRole("option", { name: "Jul 2026" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stock month"), { target: { value: "2026-07" } });
    expect(onChange).toHaveBeenCalledWith("2026-07");
  });
});
```
Keep the `StateStockBlock` describe block unchanged.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/reports/fba-inventory-map/stock-layer.test.tsx`
Expected: FAIL — `StockLayerStatus` / `./stock-month-select` not found.

- [ ] **Step 3: Implement**

`use-stock-layer.ts` — replace the body from `export type StockLayerState` to the end of the file with:
```ts
export type StockLayerState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-reports" }
  | { status: "ok"; month: string; months: string[]; data: FbaMapResponse; bubbles: StateBubble[] };

/** What a section reports up to the page so the header can render the stock-month picker. */
export type StockMonths = { months: string[]; month: string | null };

type Got = { ok: true; data: FbaMapResponse } | { ok: false; message: string };

async function getStock(url: string): Promise<Got> {
  const res = await fetch(url);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: `HTTP ${res.status}` };
  }
  if (!res.ok) return { ok: false, message: (json as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
  return { ok: true, data: json as FbaMapResponse };
}

/** Stock for `month` (newest when null). Months are independent of the orders range. No fetch while disabled. */
export function useStockLayer({
  enabled, accountId, asin, month,
}: { enabled: boolean; accountId: string; asin: string | null; month: string | null }): StockLayerState {
  const key = enabled && accountId ? `${accountId}:${asin ?? ""}:${month ?? ""}` : "";
  const [settled, setSettled] = useState<{ key: string; state: StockLayerState } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const qs = new URLSearchParams({ accountId });
    if (month) qs.set("month", month);
    if (asin) qs.set("asin", asin);
    const settle = (state: StockLayerState) => live && setSettled({ key, state });
    getStock(`/api/reports/fba-inventory-map?${qs.toString()}`)
      .then((got) => {
        if (!got.ok) return settle({ status: "error", message: got.message });
        const months = [...got.data.availableMonths].sort().reverse();
        if (months.length === 0) return settle({ status: "no-reports" });
        const data = got.data;
        settle({ status: "ok", month: data.month ?? months[0], months, data, bubbles: groupByState(data.dots, data.totals.units) });
      })
      .catch((e) => settle({ status: "error", message: String(e) }));
    return () => {
      live = false;
    };
  }, [key, accountId, asin, month]);

  if (!key) return { status: "off" };
  if (!settled || settled.key !== key) return { status: "loading" };
  return settled.state;
}
```
and change the import line `import { monthsOverlapping } from "@/lib/fba-inventory-map/month";` → delete it (no longer used).

`stock-layer-controls.tsx` — whole file:
```tsx
"use client";
import { monthLabel } from "@/lib/fba-inventory-map/month";
import type { StockLayerState } from "./use-stock-layer";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Status line above the map. `ordersLabel` (Both mode) makes the caption name both periods. */
export function StockLayerStatus({ layer, ordersLabel }: { layer: StockLayerState; ordersLabel?: string }) {
  if (layer.status === "off") return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[12px]">
      {layer.status === "loading" && <span className="text-muted-foreground">Loading stock…</span>}
      {layer.status === "error" && <span className="text-red-600">{layer.message}</span>}
      {layer.status === "no-reports" && <span className="text-muted-foreground">No FBA storage-fee reports for this account</span>}
      {layer.status === "ok" && (
        <>
          {/* one text node, so the caption is findable as a single string */}
          <span className="font-bold">{`${ordersLabel ? `Orders: ${ordersLabel} · ` : ""}Stock: ${monthLabel(layer.month)} snapshot`}</span>
          {layer.data.unplaced.units > 0 && (
            <span className="text-muted-foreground">
              {`${nf.format(layer.data.unplaced.units)} units (${pct(layer.data.unplaced.share)}) couldn't be placed on the map`}
            </span>
          )}
        </>
      )}
    </div>
  );
}
```
`stock-month-select.tsx`:
```tsx
"use client";
import { monthLabel } from "@/lib/fba-inventory-map/month";

export function StockMonthSelect({ value, months, onChange }: { value: string; months: string[]; onChange: (m: string) => void }) {
  return (
    <select
      aria-label="Stock month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 rounded-md border border-border/40 bg-muted/30 px-2 text-xs font-bold"
    >
      {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/reports/fba-inventory-map/stock-layer.test.tsx`
Expected: PASS, 1 file / 10 tests (4 hook + 3 status + 1 select + 2 StateStockBlock).

- [ ] **Step 5: Commit (ask Manu first)** — commit together with Task 3 if Manu prefers a green tsc per commit; otherwise:

```bash
git add -- src/components/reports/fba-inventory-map/use-stock-layer.ts src/components/reports/fba-inventory-map/stock-layer-controls.tsx src/components/reports/fba-inventory-map/stock-month-select.tsx src/components/reports/fba-inventory-map/stock-layer.test.tsx
git commit -m "feat(geography): stock layer lists every month; status line + month select replace the toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/use-stock-layer.ts src/components/reports/fba-inventory-map/stock-layer-controls.tsx src/components/reports/fba-inventory-map/stock-month-select.tsx src/components/reports/fba-inventory-map/stock-layer.test.tsx
```

---

### Task 3: OrderGeographySection — controlled stock month + Both caption

**Files:**
- Modify: `src/components/reports/v2/order-geography-section.tsx` (imports ~13-14; props ~276-291; state ~307-313; `useStockLayer` call ~380-387; stock controls JSX ~541-545)
- Test: `src/components/reports/v2/order-geography-section.test.tsx` (the `describe("OrderGeographySection FBA stock layer")` block, ~228-320)

**Interfaces:**
- Consumes: `useStockLayer({ enabled, accountId, asin, month })`, `StockLayerStatus`, `type StockMonths` (Task 2).
- Produces: `OrderGeographySection` props — `stockLayer?: boolean` REMOVED; added `stockMonth?: string | null` (`undefined` = no stock layer, the portal default; `null` = newest) and `onStockMonths?: (m: StockMonths) => void`.

- [ ] **Step 1: Rewrite the stock-layer tests**

In the stock-layer describe block:
- `renderHub` becomes:
```tsx
  const renderHub = (props: { stockMonth?: string | null; onStockMonths?: (m: StockMonths) => void } = {}) =>
    render(<OrderGeographySection surface="hub" accountId="2706460" start="2025-09-16" end="2026-09-15" stockMonth={null} {...props} />);
```
  and add `import type { StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";` at the top of the file.
- Everywhere the block does `fireEvent.click(await screen.findByRole("button", { name: "FBA stock" }));` followed by `await screen.findByText("Stock: Aug 2026 snapshot");`, replace BOTH lines with:
```tsx
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
```
- Replace the test `"hub: toggle is off by default and makes no stock request until switched on"` with:
```tsx
  it("with stockMonth=null: fetches newest stock once, shows the two-period caption and bubbles, no toggle", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    expect(stockCalls()).toEqual(["/api/reports/fba-inventory-map?accountId=2706460"]);
    expect(screen.queryByRole("button", { name: "FBA stock" })).toBeNull();
    expect(document.querySelector('[data-bubble="CA"]')).not.toBeNull();
  });

  it("a picked stockMonth is fetched as-is", async () => {
    renderHub({ stockMonth: "2026-07" });
    await waitFor(() => expect(stockCalls()).toEqual(["/api/reports/fba-inventory-map?accountId=2706460&month=2026-07"]));
  });

  it("reports the available months up exactly once per settled fetch", async () => {
    const onStockMonths = vi.fn();
    renderHub({ onStockMonths });
    await screen.findByText(/Stock: Aug 2026 snapshot/);
    await waitFor(() => expect(onStockMonths).toHaveBeenCalledWith({ months: ["2026-08", "2026-07"], month: "2026-08" }));
    expect(onStockMonths).toHaveBeenCalledTimes(1);
  });
```
- In `"scopes the stock layer to the light paper theme…"`: delete the `const toggle = …` / `fireEvent.click(toggle)` lines and the two assertions on `toggle.closest` and `getByLabelText("Stock month")`; keep the bubble and block assertions.
- `"without stockLayer (portal/default) …"`: rename to `"without stockMonth (portal/default) there is no stock UI and no stock request"`; keep its body.
- Rename the two remaining `"without stockLayer …"` titles to `"without stockMonth …"` (bodies unchanged).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/reports/v2/order-geography-section.test.tsx`
Expected: FAIL — stock tests find no caption (component still has the toggle).

- [ ] **Step 3: Implement**

Imports: replace
`import { StockLayerControls } from "@/components/reports/fba-inventory-map/stock-layer-controls";` with
`import { StockLayerStatus } from "@/components/reports/fba-inventory-map/stock-layer-controls";` and change the `useStockLayer` import to
`import { useStockLayer, type StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";`.

Props: replace `stockLayer = false,` with `stockMonth,` and `onStockMonths,`; in the type replace the `stockLayer?: boolean;` line (and its doc comment) with:
```ts
  /** Hub only: undefined = no FBA stock layer (portal never sets it); null = newest month; "YYYY-MM" = that month. */
  stockMonth?: string | null;
  /** Hub only: receives the available stock months once per settled stock fetch (feeds the header picker). */
  onStockMonths?: (m: StockMonths) => void;
```
First line of the body, after `const accent = …`: `const stockLayer = stockMonth !== undefined;` (the rest of the component keeps using `stockLayer`).

State: delete the lines declaring `stockOn`, `stockKey`, `stockPick`, and the derived `stockMonth` (keep `stockHover`).

`useStockLayer` call → replace with:
```ts
  const layer = useStockLayer({
    enabled: stockLayer,
    accountId,
    asin: asinFilter === ALL_ASINS ? null : asinFilter,
    month: stockMonth ?? null,
  });

  // `layer` is the hook's state-held object, so this fires once per settled fetch.
  useEffect(() => {
    if (!onStockMonths) return;
    if (layer.status === "ok") onStockMonths({ months: layer.months, month: layer.month });
    else if (layer.status === "no-reports") onStockMonths({ months: [], month: null });
  }, [layer, onStockMonths]);
```

Stock controls JSX: replace
```tsx
                <StockLayerControls enabled={stockOn} onToggle={setStockOn} layer={layer} onMonth={(m) => setStockPick({ key: stockKey, month: m })} />
```
with
```tsx
                <StockLayerStatus layer={layer} ordersLabel={`${prettyDate(start)} – ${prettyDate(end)}`} />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/reports/v2/order-geography-section.test.tsx src/components/reports/fba-inventory-map/stock-layer.test.tsx`
Expected: PASS (all). Then `grep -rn "dark:" src/components/reports/fba-inventory-map/` → no output.

- [ ] **Step 5: Commit (ask Manu first)**

```bash
git add -- src/components/reports/v2/order-geography-section.tsx src/components/reports/v2/order-geography-section.test.tsx
git commit -m "feat(geography): Order Geography takes a controlled stock month and shows a two-period caption

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/v2/order-geography-section.tsx src/components/reports/v2/order-geography-section.test.tsx
```

---

### Task 4: FbaInventoryMapSection — controlled month, no demand

**Files:**
- Modify: `src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx`
- Modify: `src/components/reports/fba-inventory-map/state-panel.tsx`
- Test: `src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx`, `src/components/reports/fba-inventory-map/state-view.test.tsx`

**Interfaces:**
- Consumes: `type StockMonths` (Task 2).
- Produces: `FbaInventoryMapSection({ accountId, refreshKey, month = null, onMonths }: { accountId: string; refreshKey: number; month?: string | null; onMonths?: (m: StockMonths) => void })`; `StatePanel({ stateCode, bubble })` (props `demand`, `placedUnits` removed).

- [ ] **Step 1: Update the tests**

`state-view.test.tsx` `describe("StatePanel")`: remove the `demand` const; render as `<StatePanel stateCode="CA" bubble={CA} />` in both tests; delete the three `state-demand` assertions and the `// demand 10/40…` comment; add `expect(screen.queryByTestId("state-demand")).toBeNull();`; retitle the first test `"shows header and FC rows with an approx badge; no demand line"`.

`fba-inventory-map-section.test.tsx`:
- First test: replace `await screen.findByText("Demand includes FBM orders.");` with `await screen.findByText("Stock: Aug 2026 snapshot");`; replace the `division-callout` assertion with `expect(screen.queryByTestId("division-callout")).toBeNull(); expect(screen.queryByText(/Demand/)).toBeNull();`; retitle `"renders one circle per state, unplaced stat, stock caption; no demand, no division callout"`.
- Delete tests: `"hides the callout and shows the reason when demand is unavailable"`, `"links to Order Geography for the same month"`, `"clears the selected asin when the month changes"`.
- `"empty month lists available months as pills that refetch"` → replace with:
```tsx
  it("empty month points to the header picker instead of listing pills", async () => {
    fetchMock.mockResolvedValue(ok(payload({ month: "2026-09", dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} month="2026-09" />);
    await screen.findByText("No storage-fee report for 2026-09. Pick another month above.");
    expect(screen.queryByRole("button", { name: "2026-07" })).toBeNull();
  });

  it("a month prop is fetched and reported up once", async () => {
    fetchMock.mockResolvedValue(ok(payload({ month: "2026-07" })));
    const onMonths = vi.fn();
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} month="2026-07" onMonths={onMonths} />);
    await screen.findByText("Stock: Jul 2026 snapshot");
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1&month=2026-07");
    expect(onMonths).toHaveBeenCalledWith({ months: ["2026-08", "2026-07"], month: "2026-07" });
    expect(onMonths).toHaveBeenCalledTimes(1);
  });

  it("renders no internal Month select", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Stock: Aug 2026 snapshot");
    expect(screen.queryByRole("combobox", { name: "Month" })).toBeNull();
  });
```
- `"product select refetches with asin"`: expected URL becomes `/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001` (month is now the prop, null here).
- `"account change resets month and asin…"` → replace with:
```tsx
  it("account change resets the product pick in the same render (exactly one fetch, no stale pairing)", async () => {
    fetchMock.mockResolvedValue(ok(payload({ asins: [{ asin: "B0TEST0001", title: "Test" }] })));
    const { rerender } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Product" }), { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001"));
    fetchMock.mockClear();
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=2");
  });
```
  (If the `payload` asin shape differs, copy it from the existing `"product select refetches with asin"` test.)
- `"filtered-empty month…"`: drop any assertion on month pills; keep the product-select way-back assertions; if its final URL assertion includes `month=2026-08`, change it to the no-month URL `/api/reports/fba-inventory-map?accountId=1`.
- `"clicking a circle or a state shape swaps the panel…"`: remove the `demand:` override and the "demand-only state's shape" part (unshaded states still select; keep the circle-swap and no-refetch assertions).
- `"resets to the new top state on account change and on month change"`: drive the month change with `rerender(<FbaInventoryMapSection accountId="1" refreshKey={0} month="2026-07" />)` instead of the Month select.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/reports/fba-inventory-map`
Expected: FAIL (caption missing, internal Month select still present, StatePanel still renders demand).

- [ ] **Step 3: Implement**

`state-panel.tsx`: remove `demand` and `placedUnits` from the props and type; delete the `Demand` type import, the `GAP_TONE_CLASS, gapTone` import, `ratio`, `demandShare`, `stockShare`, `gapPts`, and the whole `{demandShare !== null && (…)}` block.

`fba-inventory-map-section.tsx`:
- Imports: delete `Link`, `monthLastDay`, `stateDisplayName`, `DemandUnavailableReason`, `ChoroplethDatum` (keep `UsChoropleth`), `DivisionCallout`; add `import { monthLabel } from "@/lib/fba-inventory-map/month";` and `import type { StockMonths } from "./use-stock-layer";`. Delete the `REASON` const.
- Signature and selection state (replace from `export function` through the `pickState` definition):
```tsx
export function FbaInventoryMapSection({
  accountId, refreshKey, month = null, onMonths,
}: { accountId: string; refreshKey: number; month?: string | null; onMonths?: (m: StockMonths) => void }) {
  // Keyed by account+month: a change of either drops the product/state pick in the SAME
  // render (not via a follow-up effect), so no stale pairing ever fires a wasted fetch.
  const pickKey = `${accountId}:${month ?? ""}`;
  const [selection, setSelection] = useState<{ key: string; asin: string | null; state: string | null }>({ key: pickKey, asin: null, state: null });
  const asin = selection.key === pickKey ? selection.asin : null;
  const pickedState = selection.key === pickKey ? selection.state : null;
  // us-choropleth sends null when the selected state is clicked again: ignore it, keep the state.
  const pickState = (code: string | null) => {
    if (code) setSelection({ key: pickKey, asin, state: code });
  };
```
- After the fetch `useEffect`, add:
```tsx
  // `settled` is state-held, so this fires once per settled fetch.
  useEffect(() => {
    if (!onMonths || settled?.result.status !== "ok") return;
    const d = settled.result.data;
    onMonths({ months: [...d.availableMonths].sort().reverse(), month: d.month });
  }, [settled, onMonths]);
```
- Delete `monthSelect`. `productSelect` `onChange` → `onChange={(e) => setSelection({ key: pickKey, asin: e.target.value || null, state: null })}`.
- Zero-units branch body:
```tsx
      <div className={`${CARD} space-y-3`}>
        {productSelect && <div className="flex items-center gap-2">{productSelect}</div>}
        <p className="text-[13px]">
          {data.asin ? `No stock for ${data.asin} in ${data.month}.` : `No storage-fee report for ${data.month}. Pick another month above.`}
        </p>
      </div>
```
- Delete the `choropleth` const. Controls row becomes:
```tsx
      <div className="flex items-center gap-2">
        {productSelect}
        {data.month && <span className="text-[12px] font-bold">{`Stock: ${monthLabel(data.month)} snapshot`}</span>}
      </div>
```
- Map section: delete the `data.demand.status === "unavailable"` notice; `data={choropleth}` → `data={{}}`; delete the `<span …>Demand includes FBM orders.</span>`.
- `<StatePanel stateCode={effectiveState} bubble={bubble} />`; delete `{data.divisions && <DivisionCallout rows={data.divisions} />}`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/reports/fba-inventory-map src/components/reports/v2/order-geography-section.test.tsx`
Expected: PASS, all files. `grep -rn "dark:" src/components/reports/fba-inventory-map/` → no output.

- [ ] **Step 5: Commit (ask Manu first)**

```bash
git add -- src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
git commit -m "feat(geography): inventory section takes a controlled month and drops mirror demand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/reports/fba-inventory-map/fba-inventory-map-section.tsx src/components/reports/fba-inventory-map/state-panel.tsx src/components/reports/fba-inventory-map/fba-inventory-map-section.test.tsx src/components/reports/fba-inventory-map/state-view.test.tsx
```

---

### Task 5: Geography page, redirect, nav tab

**Files:**
- Modify: `src/app/reports/order-geography/page.tsx` (whole file)
- Modify: `src/app/reports/fba-inventory-map/page.tsx` (whole file)
- Modify: `src/components/layout/top-nav.tsx` (`REPORT_TABS`, ~99-108)

**Interfaces:**
- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Page**

`src/app/reports/order-geography/page.tsx` — whole file:
```tsx
"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { OrderGeographySection } from "@/components/reports/v2/order-geography-section";
import { TrailingRangePicker, useTrailingRange } from "@/components/reports/v2/trailing-range-picker";
import { GeographyViewSwitch } from "@/components/reports/v2/geography-view-switch";
import { FbaInventoryMapSection } from "@/components/reports/fba-inventory-map/fba-inventory-map-section";
import { StockMonthSelect } from "@/components/reports/fba-inventory-map/stock-month-select";
import type { StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";
import { parseRangeParams } from "@/lib/reports/range-params";
import { buildGeographyQuery, parseGeographyView, type GeographyView } from "@/lib/reports/geography-view";
import { isMonth } from "@/lib/fba-inventory-map/month";

// Geography: Order Geography and the FBA Inventory Map on one page. Orders use a
// trailing lookback (page-local, surfaced through `extras` like before); stock
// uses its own monthly snapshot picker. The two periods are deliberately
// independent (Thread Z2 ruling) — the Both caption names each of them.
function GeographyReportContent() {
  const controls = useReportControls();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = useTrailingRange(parseRangeParams(searchParams.get("start"), searchParams.get("end")) ?? undefined);
  const { accountId, refreshKey } = controls;

  const [view, setView] = useState<GeographyView>(() => parseGeographyView(searchParams.get("view")));
  // Picked month and reported months are keyed by account so a switch drops both in the same render.
  const [monthPick, setMonthPick] = useState<{ accountId: string; month: string | null }>(() => {
    const m = searchParams.get("month");
    return { accountId, month: m && isMonth(m) ? m : null };
  });
  const month = monthPick.accountId === accountId ? monthPick.month : null;
  const [reported, setReported] = useState<{ accountId: string; value: StockMonths } | null>(null);
  // Keyed read: months reported for another account are discarded in the same render.
  const stockMonths = reported && reported.accountId === accountId ? reported.value : null;
  // Stable callback identity (so section effects fire once per settled fetch) that still tags
  // the CURRENT account, via a ref.
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const [onStockMonths] = useState(() => (value: StockMonths) => setReported({ accountId: accountRef.current, value }));

  const custom = range.preset === "custom";
  useEffect(() => {
    const next = buildGeographyQuery(searchParams.toString(), {
      view,
      start: custom ? range.start : null,
      end: custom ? range.end : null,
      month,
    });
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [view, custom, range.start, range.end, month, searchParams, router, pathname]);

  const showRange = view !== "inventory";
  const showStock = view !== "orders";

  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Geography"
          refreshSection="order-geography"
          showDates={false}
          showRefreshButton={view !== "inventory"}
          refreshRange={{ start: range.start, end: range.end }}
          extras={
            <div className="flex items-center gap-2">
              <GeographyViewSwitch value={view} onChange={setView} />
              {showRange && <TrailingRangePicker surface="hub" range={range} />}
              {showStock && stockMonths && stockMonths.months.length > 0 && stockMonths.month && (
                <StockMonthSelect
                  value={month ?? stockMonths.month}
                  months={stockMonths.months}
                  onChange={(m) => setMonthPick({ accountId, month: m })}
                />
              )}
            </div>
          }
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mf-paper mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">
              Order <span className="text-brand">Geography</span>
            </h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">
              Where orders land and where Amazon holds this account&rsquo;s FBA stock, by state. Switch between orders,
              inventory, or both on one map; click a state for its breakdown.
            </p>
          </div>
          {view === "inventory" ? (
            <FbaInventoryMapSection accountId={accountId} refreshKey={refreshKey} month={month} onMonths={onStockMonths} />
          ) : (
            <OrderGeographySection
              surface="hub"
              accountId={accountId}
              start={range.start}
              end={range.end}
              refreshKey={refreshKey}
              stockMonth={view === "both" ? month : undefined}
              onStockMonths={view === "both" ? onStockMonths : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function GeographyReportPage() {
  return (
    <Suspense fallback={null}>
      <GeographyReportContent />
    </Suspense>
  );
}
```
Note: `accountRef.current = accountId` during render trips the `react-hooks/refs` lint rule in React 19 setups. If `npm run lint -- src/app/reports/order-geography/page.tsx` flags it, move the assignment into `useEffect(() => { accountRef.current = accountId; }, [accountId]);` — behaviour is the same because the callback only runs after a fetch settles.

- [ ] **Step 2: Redirect**

`src/app/reports/fba-inventory-map/page.tsx` — whole file:
```tsx
import { redirect } from "next/navigation";

// Merged into the Geography page (Thread Z2): inventory is now a view there.
export default function FbaInventoryMapPage() {
  redirect("/reports/order-geography?view=inventory");
}
```

- [ ] **Step 3: Nav tab**

In `top-nav.tsx` `REPORT_TABS`, replace the two lines
```ts
  { label: "Order Geography", href: "/reports/order-geography" },
  { label: "FBA Inventory Map", href: "/reports/fba-inventory-map" },
```
with
```ts
  { label: "Geography", href: "/reports/order-geography" },
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/components/reports/fba-inventory-map src/components/reports/v2 src/lib/reports src/components/layout`
Expected: PASS (except any failure that also fails on `ce47faea6` — check by filename before blaming this branch; `v2/no-hub-orange` on `reports-controls-bar.tsx` is known pre-existing).
Run (background, ~2 min): `node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | sed -E 's/\(.*//' | sort | uniq -c`
Expected: only the 8 inherited files; zero in `src/app/reports/`, `src/components/reports/`, `src/lib/reports/`, `src/components/layout/`.

- [ ] **Step 5: Commit (ask Manu first)**

```bash
git add -- src/app/reports/order-geography/page.tsx src/app/reports/fba-inventory-map/page.tsx src/components/layout/top-nav.tsx
git commit -m "feat(geography): one Geography page with Orders / Inventory / Both; FBA map URL redirects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/app/reports/order-geography/page.tsx src/app/reports/fba-inventory-map/page.tsx src/components/layout/top-nav.tsx
```

---

### Task 6: Pane verification (dark AND light)

**Files:** none (verification only; any fix goes back to the owning task's files with its own commit OK).

- [ ] **Step 1:** `preview_start` `{ name: "fba-design-tweaks-3000" }`. Pick an Active account that has storage-fee reports.
- [ ] **Step 2 (light):** For each of `/reports/order-geography`, `?view=inventory`, `?view=both`: `read_page` confirms — Orders: no stock caption, no month select; Inventory: `Stock: <Mon YYYY> snapshot`, bubbles, FC table, NO "Demand", NO division callout, no range picker; Both: caption `Orders: … · Stock: … snapshot`, bubbles over shading, stock block in the side panel. Switch views with the switch and confirm the URL updates (`?view=`), and a stock-month pick adds `&month=` and refetches.
- [ ] **Step 3:** Navigate to `/reports/fba-inventory-map` → lands on `/reports/order-geography?view=inventory`. Nav row shows one "Geography" tab.
- [ ] **Step 4 (dark):** `resize_window { colorScheme: "dark" }`, repeat Step 2 visually — page stays the fixed-light paper look; `javascript_tool` check `getComputedStyle(document.querySelector("main")).backgroundColor` is the light paper value in both schemes.
- [ ] **Step 5:** `read_console_messages { onlyErrors: true }` — no new errors; confirm no request loop (`read_network_requests` shows one `fba-inventory-map` call per view/month change, not a stream).
- [ ] **Step 6:** Screenshot each mode (light + dark) and send to Manu; reset `resize_window { preset: "desktop" }`.
- [ ] **Step 7:** Portal spot check: `/portal/reports/order-geography` (admin preview) shows no view switch, no stock UI.
