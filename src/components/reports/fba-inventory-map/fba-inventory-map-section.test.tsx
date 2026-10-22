import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FbaInventoryMapSection } from "./fba-inventory-map-section";
import { US_STATE_PATHS } from "@/lib/us-map-paths";
import { gapTone } from "./division-callout";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";

function payload(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  return {
    accountId: "1", month: "2026-08", availableMonths: ["2026-08", "2026-07"], asin: null, asins: [],
    dots: [
      { key: "PHX", label: "Phoenix, AZ", state: "AZ", x: 150, y: 400, units: 60, share: 0.6, approximate: false, fcs: [{ code: "PHX7", units: 60, fee: 6 }] },
      { key: "state:FL", label: "Florida (approx.)", state: "FL", x: 562, y: 501, units: 20, share: 0.2, approximate: true, fcs: [{ code: "SFL4", units: 20, fee: 2 }] },
    ],
    unplaced: { units: 20, share: 0.2, fcs: [{ code: "ZZZ1", units: 20, fee: 1 }] },
    totals: { units: 100, placedUnits: 80, fee: 9 },
    demand: { status: "ok", byState: { AZ: 5, FL: 15 }, totalUnits: 20, note: "includes_fbm" },
    divisions: [
      { division: "South Atlantic", demandShare: 0.75, stockShare: 0.25, gapPts: -50 },
      { division: "Mountain", demandShare: 0.25, stockShare: 0.75, gapPts: 50 },
    ],
    ...o,
  };
}

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });
const ok = (p: FbaMapResponse) => ({ ok: true, status: 200, json: async () => p });

describe("helpers", () => {
  it("gapTone thresholds at ±5 points", () => {
    expect(gapTone(-5.1)).toBe("red");
    expect(gapTone(-5)).toBe("amber");
    expect(gapTone(5)).toBe("amber");
    expect(gapTone(5.1)).toBe("green");
  });
});

describe("FbaInventoryMapSection", () => {
  it("renders one circle per state, unplaced stat, stock caption; no demand, no division callout", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Stock: Aug 2026 snapshot");
    expect([...container.querySelectorAll("[data-bubble]")].map((c) => c.getAttribute("data-bubble")).sort()).toEqual(["AZ", "FL"]);
    expect(container.querySelector('[data-dot="hollow"]')).toBeNull();
    expect(screen.getByTestId("stat-unplaced")).toHaveTextContent("20 units · 20%");
    expect(screen.queryByTestId("division-callout")).toBeNull();
    expect(screen.queryByText(/Demand/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=1");
  });

  it("renders 100% unplaced without NaN", async () => {
    fetchMock.mockResolvedValue(ok(payload({ dots: [], unplaced: { units: 10, share: 1, fcs: [{ code: "ZZZ1", units: 10, fee: 1 }] }, totals: { units: 10, placedUnits: 0, fee: 1 } })));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("stat-unplaced");
    expect(container.textContent).not.toContain("NaN");
    expect(screen.getByTestId("stat-unplaced")).toHaveTextContent("100%");
  });

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
    // the report is a passive effect after the render that shows the caption — wait for it
    await waitFor(() => expect(onMonths).toHaveBeenCalledWith({ months: ["2026-08", "2026-07"], month: "2026-07" }));
    expect(onMonths).toHaveBeenCalledTimes(1);
  });

  it("renders no internal Month select", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Stock: Aug 2026 snapshot");
    expect(screen.queryByRole("combobox", { name: "Month" })).toBeNull();
  });

  it("account change resets the product pick in the same render (exactly one fetch, no stale pairing)", async () => {
    fetchMock.mockResolvedValue(ok(payload({ asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }] })));
    const { rerender } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Product" }), { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001"));
    fetchMock.mockClear();
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/reports/fba-inventory-map?accountId=2");
  });

  it("account with no reports at all shows the empty state", async () => {
    fetchMock.mockResolvedValue(ok(payload({ month: null, availableMonths: [], dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 } })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("No FBA storage-fee reports for this account");
  });

  it("table sorts by units desc by default and tags unplaced/approx rows", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("PHX7");
    expect(within(table).getByText("unplaced")).toBeTruthy();
    expect(within(table).getByText("approx.")).toBeTruthy();
    fireEvent.click(within(table).getByRole("button", { name: /FC/ }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("PHX7"); // asc by code: PHX7 < SFL4 < ZZZ1
  });

  it("error → retry card; retry refetches", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "statement timeout" }) });
    fetchMock.mockResolvedValueOnce(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText("Stock: Aug 2026 snapshot");
  });

  it("ignores a stale response after account change", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    fetchMock.mockResolvedValueOnce(ok(payload({ accountId: "2", dots: [] })));
    const { rerender, container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveFirst(ok(payload()));
    await waitFor(() => expect(container.querySelectorAll('[data-dot]')).toHaveLength(0));
  });

  it("product select refetches with asin", async () => {
    fetchMock.mockResolvedValue(ok(payload({ asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }] })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const select = await screen.findByRole("combobox", { name: "Product" });
    fireEvent.change(select, { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1&asin=B0TEST0001"));
  });

  it("no product select when asins is empty", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Stock: Aug 2026 snapshot");
    expect(screen.queryByRole("combobox", { name: "Product" })).toBeNull();
  });

  it("filtered-empty month shows a way back to All products instead of a dead-end 'no report' message", async () => {
    fetchMock.mockResolvedValueOnce(ok(payload({ asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }] })));
    fetchMock.mockResolvedValueOnce(ok(payload({
      asin: "B0TEST0001",
      asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }],
      dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 0, placedUnits: 0, fee: 0 },
    })));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const productSelect = await screen.findByRole("combobox", { name: "Product" }) as HTMLSelectElement;
    fireEvent.change(productSelect, { target: { value: "B0TEST0001" } });
    await screen.findByText("No stock for B0TEST0001 in 2026-08.");
    expect(screen.queryByText(/No storage-fee report/)).toBeNull();

    const stillThere = screen.getByRole("combobox", { name: "Product" }) as HTMLSelectElement;
    expect(stillThere.value).toBe("B0TEST0001");
    fetchMock.mockResolvedValueOnce(ok(payload({ asins: [{ asin: "B0TEST0001", units: 60, title: "Soda" }] })));
    fireEvent.change(stillThere, { target: { value: "" } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/reports/fba-inventory-map?accountId=1"));
  });

  it("shows a readable message when the response body isn't JSON (e.g. a platform HTML error page)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 504, json: async () => { throw new SyntaxError("Unexpected token '<'"); } });
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByText("Couldn't load the storage-fee report: HTTP 504");
  });
  it("preselects the state with the most units", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const panel = await screen.findByTestId("state-panel");
    expect(panel).toHaveTextContent("Arizona");
    expect(panel).toHaveTextContent("PHX7");
  });

  it("clicking a circle or a state shape swaps the panel without refetching; re-click keeps it", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("state-panel");
    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");
    expect(screen.getByTestId("state-panel")).toHaveTextContent("SFL4");
    // re-click the selected state's shape: us-choropleth sends null, the panel must keep Florida
    fireEvent.click(container.querySelector(`path[d="${US_STATE_PATHS.FL}"]`)!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resets to the new top state on account change and on month change", async () => {
    fetchMock.mockResolvedValue(ok(payload()));
    const { container, rerender } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    await screen.findByTestId("state-panel");
    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    expect(screen.getByTestId("state-panel")).toHaveTextContent("Florida");

    fetchMock.mockResolvedValue(ok(payload({ month: "2026-07" })));
    rerender(<FbaInventoryMapSection accountId="1" refreshKey={0} month="2026-07" />);
    await waitFor(() => expect(screen.getByTestId("state-panel")).toHaveTextContent("Arizona"));

    fireEvent.click(container.querySelector('[data-bubble="FL"]')!);
    fetchMock.mockResolvedValue(ok(payload({
      accountId: "2",
      dots: [{ key: "EWR", label: "Newark, NJ", state: "NJ", x: 800, y: 200, units: 10, share: 1, approximate: false, fcs: [{ code: "EWR4", units: 10, fee: 1 }] }],
      totals: { units: 10, placedUnits: 10, fee: 1 }, unplaced: { units: 0, share: 0, fcs: [] },
    })));
    rerender(<FbaInventoryMapSection accountId="2" refreshKey={0} />);
    await waitFor(() => expect(screen.getByTestId("state-panel")).toHaveTextContent("New Jersey"));
  });

  it("all stock unplaced: panel explains, no circles, no NaN", async () => {
    fetchMock.mockResolvedValue(ok(payload({ dots: [], unplaced: { units: 10, share: 1, fcs: [{ code: "ZZZ1", units: 10, fee: 1 }] }, totals: { units: 10, placedUnits: 0, fee: 1 } })));
    const { container } = render(<FbaInventoryMapSection accountId="1" refreshKey={0} />);
    const panel = await screen.findByTestId("state-panel");
    expect(panel).toHaveTextContent("No FC in this month could be placed on the map.");
    expect(container.querySelectorAll("[data-bubble]")).toHaveLength(0);
    expect(container.textContent).not.toContain("NaN");
  });
});
