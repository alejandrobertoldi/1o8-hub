import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStockLayer, type StockLayerState } from "./use-stock-layer";
import { StockLayerStatus } from "./stock-layer-controls";
import { StockMonthSelect } from "./stock-month-select";
import { StateStockBlock } from "./state-stock-block";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import type { StateBubble } from "@/lib/fba-inventory-map/state-grouping";

function stock(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  return {
    accountId: "1", month: "2026-08", availableMonths: ["2026-08", "2026-07", "2026-06"], asin: null, asins: [],
    dots: [{ key: "PHX", label: "Phoenix, AZ", state: "AZ", x: 148, y: 402, units: 60, share: 0.6, approximate: false, fcs: [{ code: "PHX7", units: 60, fee: 6 }] }],
    unplaced: { units: 40, share: 0.4, fcs: [{ code: "ZZZ1", units: 40, fee: 1 }] },
    totals: { units: 100, placedUnits: 60, fee: 7 },
    demand: { status: "unavailable", reason: "no_orders" }, divisions: null, ...o,
  };
}
const fetchMock = vi.fn();
const ok = (p: FbaMapResponse) => ({ ok: true, status: 200, json: async () => p });
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

function Harness(p: Parameters<typeof useStockLayer>[0]) {
  const s: StockLayerState = useStockLayer(p);
  return <div data-testid="s">{s.status}:{s.status === "ok" ? s.month : ""}</div>;
}
const base = { accountId: "1", asin: null, month: null };

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

describe("StateStockBlock", () => {
  const AZ: StateBubble = {
    state: "AZ", name: "Arizona", x: 148, y: 402, units: 60, fee: 6, share: 0.6, metros: [],
    fcs: [{ code: "PHX7", units: 60, fee: 6, place: "Phoenix, AZ", approximate: false, shareOfState: 1 }],
  };
  it("figures, stock-vs-orders gap and FC rows", () => {
    render(<StateStockBlock stateCode="AZ" bubble={AZ} month="2026-08" placedUnits={60} orderShare={0.25} filtered={false} />);
    const block = screen.getByTestId("state-stock-block");
    expect(block).toHaveTextContent("FBA stock · Aug 2026");
    expect(block).toHaveTextContent("60");
    // stock 60/60 = 100%, orders 25% → +75.0%
    expect(block).toHaveTextContent("+75.0%");
    expect(screen.getAllByTestId("state-fc-row")).toHaveLength(1);
  });
  it("shares use one decimal and the gap is the difference of the DISPLAYED shares", () => {
    const b = { ...AZ, units: 3.351, share: 0.03351 };
    render(<StateStockBlock stateCode="AZ" bubble={b} month="2026-08" placedUnits={100} orderShare={0.16449} filtered={false} />);
    const block = screen.getByTestId("state-stock-block");
    // orders 16.449% → 16.4, stock 3.351% → 3.4; raw gap is -13.098 (would print -13.1%), displayed gap -13.0%
    expect(block).toHaveTextContent("Units ordered 16.4%");
    expect(block).toHaveTextContent("Stock 3.4%");
    expect(block).toHaveTextContent("-13.0%");
    // one stock share only (the placed-units base); "Of all stock" could disagree with it
    expect(block).not.toHaveTextContent("Of all stock");
  });
  it("no stock for the filtered product says so", () => {
    render(<StateStockBlock stateCode="TX" bubble={null} month="2026-08" placedUnits={60} orderShare={null} filtered />);
    expect(screen.getByTestId("state-stock-block")).toHaveTextContent("No FBA stock for this product in Texas in Aug 2026.");
  });
});
