import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { outlookMonths } from "@/lib/inventory/capacity";
import { todayIso } from "@/lib/inventory/rec-settings";
// next/font only runs in the Next build; stub the Oswald loader the flap tiles use.
vi.mock("next/font/google", () => ({ Oswald: () => ({ className: "font-oswald" }) }));

import { CapacityPanel } from "./capacity-panel";

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const usage = {
  asOf: "2026-10-08",
  types: [{ type: "Standard-size", onhandUnits: 13817, onhandFt3: 3576.74, openUnits: 7440, openFt3: 1925 }],
  skus: { A: { ft3PerUnit: 0.25, type: "Standard-size" }, B: { ft3PerUnit: 0.25, type: "Standard-size" } },
};
const [m0, m1, m2] = outlookMonths(todayIso());

function stubFetch(limits: unknown[] = []) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/inventory-capacity-limits")) {
      return new Response(JSON.stringify(init?.method === "PUT" ? { ok: true } : { limits }));
    }
    return new Response(JSON.stringify(usage));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("CapacityPanel", () => {
  it("shows usage, what the recommendation adds, and asks for a limit when none is set", async () => {
    stubFetch();
    wrap(<CapacityPanel accountIds="4470600" clientIdCode="HAL_SC_US" sends={[{ sku: "A", qty: 400 }, { sku: "B", qty: -50 }]} />);
    expect(await screen.findByRole("heading", { name: "Capacity Monitor" })).toBeTruthy();
    expect(screen.getByText("Standard-size")).toBeTruthy();
    // One card per month (this + next two), each with its own usage table.
    for (const m of [m0, m1, m2]) expect(screen.getByTestId(`capacity-month-${m}`)).toBeTruthy();
    const usage = screen.getByRole("table", { name: `Capacity usage ${m0}` });
    const rowsOf = () => Array.from(usage.querySelectorAll("tbody tr")).map((r) => Array.from(r.querySelectorAll("td")).map((c) => c.textContent));
    expect(Array.from(usage.querySelectorAll("th")).map((h) => h.textContent)).toEqual(["Usage", "Volume (ft³)", "Volume %", "Units"]);
    expect(rowsOf()).toEqual([
      ["Open shipments", "1,925", "—", "7,440"], // no limit entered ⇒ no %
      ["On-hand", "3,577", "—", "13,817"],
      ["Total used space", "5,502", "—", "21,257"],
      ["This recommendation", "+100", "—", "+400"], // overstock (−50) adds nothing
      ["After sending", "5,602", "—", "21,657"],
    ]);
    // The column stacks base → top in the same order (flex-col-reverse: first child is the base).
    const col = document.querySelector('[role="img"][aria-label*="open shipments"]')!; // the column, not the month tile
    expect(Array.from(col.children).map((c) => (c as HTMLElement).title.split(":")[0])).toEqual(["Open shipments", "On-hand", "This recommendation"]);
    // Values sit inside the segments that are tall enough (the +100 ft³ slice is too thin here).
    expect(Array.from(col.children).map((c) => c.textContent)).toEqual(["1,925 ft³", "3,577 ft³", ""]);
    expect(screen.getByText(/Enter this month's limit/)).toBeTruthy();
    expect(screen.queryByTestId(`capacity-limit-line-${m0}`)).toBeNull();
    expect(screen.getAllByText("no limit")).toHaveLength(3); // one callout per month
  });

  it("with limits: % used, maximum shipment, limit line, and fits / over by per month", async () => {
    stubFetch([
      { storageType: "Standard-size", month: m0, limitFt3: 6706.57, status: "confirmed", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" },
      { storageType: "Standard-size", month: m1, limitFt3: 5897.15, status: "estimate", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" },
      { storageType: "Standard-size", month: m2, limitFt3: 5331.92, status: "estimate", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" },
    ]);
    wrap(<CapacityPanel accountIds="4470600" clientIdCode="HAL_SC_US" sends={[{ sku: "A", qty: 400 }]} />);
    expect(await screen.findByText("82.0% used")).toBeTruthy(); // 5,501.74 / 6,706.57
    const pctOf = (m: string) => Array.from(screen.getByRole("table", { name: `Capacity usage ${m}` }).querySelectorAll("tbody tr")).map((r) => r.querySelectorAll("td")[2].textContent);
    expect(pctOf(m0)).toEqual(["28.7%", "53.3%", "82.0%", "+1.5%", "83.5%"]); // of this month's limit
    expect(pctOf(m2)[4]).toBe("105.1%"); // Dec: 5,601.74 / 5,331.92 — over
    const afterPct = (m: string) => screen.getByRole("table", { name: `Capacity usage ${m}` }).querySelectorAll("tbody tr")[4].querySelectorAll("td")[2];
    expect(afterPct(m0).className).toMatch(/text-brand-green/); // ≤ 100% ⇒ green
    expect(afterPct(m2).className).toMatch(/text-red-600/); // > 100% ⇒ red
    expect(screen.getByText("1,205 ft³")).toBeTruthy(); // maximum shipment = limit − on-hand − open
    // one column per month, each with its own limit line; Dec is over
    for (const m of [m0, m1, m2]) expect(screen.getByTestId(`capacity-limit-line-${m}`)).toBeTruthy();
    expect(screen.getByTestId(`capacity-limit-line-${m2}`).className).toMatch(/border-red-500/);
    // Month label on top with its limit field beside it.
    const dec = screen.getByTestId(`capacity-month-${m2}`);
    // Header: split-flap tiles copied from the /me dashboard, month then year.
    const tiles = Array.from(dec.querySelector('[data-testid="capacity-month-label"]')!.children).map((t) => t.textContent);
    expect(tiles).toEqual(["DEC", "2026"]); // dashboard FlapClock style: big month, half-height year
    // Limit card above Usage: label, value (no "ft³"), Confirmed / Estimate pill.
    expect(screen.getByTestId(`capacity-limit-${m2}`).textContent).toMatch(/^Total FBA capacity limit \(cubic feet\)[\d,.]*(Confirmed|Estimate)$/);
    expect(screen.getByTestId(`capacity-limit-${m0}`).nextElementSibling).toBe(screen.getByTestId(`capacity-usage-${m0}`));
    // Callout beside each chart: room left (green ▼) or how far over (red ▲).
    const callout = (m: string) => screen.getByTestId(`capacity-callout-${m}`);
    expect(callout(m0).textContent).toBe("1,105 ft³left under the limit"); // 6,706.57 − 5,601.74
    expect(callout(m0).className).toMatch(/text-brand-green/);
    expect(callout(m1).textContent).toBe("295 ft³left under the limit");
    expect(screen.getByTestId(`capacity-limit-line-${m0}`).className).toMatch(/border-brand-green/); // fits ⇒ green line
    expect(callout(m2).textContent).toBe("270 ft³over the limit"); // 5,601.74 − 5,331.92
    // Usage card: before / after sending, ft³ and % of that month's limit.
    const usageRows = (m: string) => Array.from(screen.getByTestId(`capacity-usage-${m}`).querySelectorAll("tr")).map((r) => Array.from(r.querySelectorAll("td")).map((c) => c.textContent));
    expect(usageRows(m0)).toEqual([["Before sending", "5,502 ft³", "82.0%"], ["After sending", "5,602 ft³", "83.5%"]]);
    expect(usageRows(m2)[1][2]).toBe("105.1%");
    // The green/red callout sits below the Usage card.
    const usageCard = screen.getByTestId(`capacity-usage-${m0}`);
    expect(usageCard.nextElementSibling).toBe(callout(m0));
    expect(callout(m2).className).toMatch(/text-red-600/);
    // Status comes from the saved limit (the team sets it): confirmed = solid line, estimate = dashed.
    expect(screen.getByTestId(`capacity-status-${m0}`).textContent).toBe("Confirmed");
    expect(screen.getByTestId(`capacity-status-${m2}`).textContent).toBe("Estimate");
    expect(screen.getByTestId(`capacity-status-${m0}`).className).toMatch(/text-brand-green/); // confirmed = green
    expect(screen.getByTestId(`capacity-status-${m2}`).className).toMatch(/amber/); // estimate = yellow
    expect(screen.getByTestId(`capacity-limit-line-${m0}`).className).toMatch(/border-solid/);
    expect(screen.getByTestId(`capacity-limit-line-${m2}`).className).toMatch(/border-dashed/);
    // Each line carries its value as a label left of the column.
    expect(screen.getByTestId(`capacity-limit-label-${m0}`).textContent).toBe("Limit6,707 ft³");
    expect(screen.getByTestId(`capacity-limit-label-${m0}`).className).toMatch(/right-full/);
  });

  it("editors save a month's limit from the outlook", async () => {
    const f = stubFetch();
    wrap(<CapacityPanel accountIds="4470600" clientIdCode="HAL_SC_US" editable sends={[]} />);
    const input = await screen.findByLabelText(`Standard-size limit ${m0}`);
    fireEvent.change(input, { target: { value: "6,706.57" } });
    fireEvent.blur(input);
    await waitFor(() => expect(f.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = f.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ clientIdCode: "HAL_SC_US", storageType: "Standard-size", month: m0, limitFt3: 6706.57 });
  });

  it("editors set Confirmed / Estimate from the pill's dropdown; the current limit goes with it", async () => {
    const f = stubFetch([{ storageType: "Standard-size", month: m1, limitFt3: 5897.15, status: "estimate", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" }]);
    wrap(<CapacityPanel accountIds="4470600" clientIdCode="HAL_SC_US" editable sends={[]} />);
    const select = await screen.findByLabelText(`Limit status ${m1}`);
    expect((select as HTMLSelectElement).value).toBe("estimate");
    fireEvent.change(select, { target: { value: "confirmed" } });
    await waitFor(() => expect(f.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = f.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ clientIdCode: "HAL_SC_US", storageType: "Standard-size", month: m1, limitFt3: 5897.15, status: "confirmed" });
    // A month without a limit has nothing to confirm yet: plain pill, no dropdown.
    expect(screen.queryByLabelText(`Limit status ${m0}`)).toBeNull();
  });

  it("saves a comma-decimal typed on an EU numpad as the right number", async () => {
    const f = stubFetch();
    wrap(<CapacityPanel accountIds="4470600" clientIdCode="HAL_SC_US" editable sends={[]} />);
    const input = await screen.findByLabelText(`Standard-size limit ${m0}`);
    fireEvent.change(input, { target: { value: "6706,57" } });
    fireEvent.blur(input);
    await waitFor(() => expect(f.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = f.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body)).limitFt3).toBe(6706.57); // not 670657
  });

  it("one card for all storage types: pills in the header switch between them", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("/api/inventory-capacity-limits")) return new Response(JSON.stringify({ limits: [] }));
      return new Response(JSON.stringify({
        asOf: "2026-10-08",
        types: [
          { type: "Standard-size", onhandUnits: 155, onhandFt3: 13, openUnits: 144, openFt3: 67 },
          { type: "Oversize", onhandUnits: 10, onhandFt3: 13, openUnits: 0, openFt3: 0 },
        ],
        skus: {},
      }));
    }));
    wrap(<CapacityPanel accountIds="1" clientIdCode="HAL_SC_US" sends={[]} />);
    expect(await screen.findAllByRole("heading", { name: "Capacity Monitor" })).toHaveLength(1); // one card, not one per type
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Standard-size", "Oversize"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const totalUsed = () => screen.getByRole("table", { name: `Capacity usage ${m0}` }).querySelectorAll("tbody tr")[2].querySelectorAll("td")[1].textContent;
    expect(totalUsed()).toBe("80"); // 13 + 67
    fireEvent.click(tabs[1]);
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(totalUsed()).toBe("13"); // oversize only
  });

  it("renders nothing when the capacity request fails", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 502 }));
    vi.stubGlobal("fetch", f);
    const { container } = wrap(<CapacityPanel accountIds="1" sends={[]} />);
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
