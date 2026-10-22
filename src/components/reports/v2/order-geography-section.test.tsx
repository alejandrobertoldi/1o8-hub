import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderGeographySection } from "./order-geography-section";
import type { OrderGeographyReport } from "@/lib/reports/order-geography";
import type { FbaMapResponse } from "@/lib/fba-inventory-map/types";
import type { StockMonths } from "@/components/reports/fba-inventory-map/use-stock-layer";
import { statePoint } from "@/lib/fc-locations";

function report(overrides: Partial<OrderGeographyReport> = {}): OrderGeographyReport {
  return {
    states: {
      CA: {
        orders: 2,
        units: 3,
        revenue: 300,
        products: [{ asin: "B0TEST0001", name: "Soda | Cucumber & Lime", orders: 2, units: 3, revenue: 300 }],
        topAsin: "B0TEST0001",
        topAsinName: "Soda | Cucumber & Lime",
        topAsinRevenue: 300,
        cities: [{ city: "SAN DIEGO", orders: 2, units: 3, revenue: 300 }],
      },
    },
    asins: [
      {
        asin: "B0TEST0001",
        name: "Soda | Cucumber & Lime",
        productId: "prod-1",
        sku: "PURA-CL-24",
        orders: 2,
        units: 3,
        revenue: 300,
      },
      {
        asin: "B0UNCAT0002",
        name: "Uncatalogued Item",
        productId: null,
        sku: null,
        orders: 1,
        units: 1,
        revenue: 50,
      },
    ],
    byAsin: { B0TEST0001: { CA: { orders: 2, units: 3, revenue: 300 } } },
    account: { orders: 3, units: 4, revenue: 350, promo: 10 },
    military: {},
    unmapped: {},
    international: {},
    window: { start: "2025-09-16", end: "2026-09-15" },
    generatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

const ALL_PRODUCTS = "__all";

/** A different account whose catalog shares no ASIN with `report()`. */
function otherAccountReport(): OrderGeographyReport {
  return {
    ...report(),
    states: {
      TX: {
        orders: 1,
        units: 1,
        revenue: 100,
        products: [{ asin: "B0OTHER0003", name: "Other Thing", orders: 1, units: 1, revenue: 100 }],
        topAsin: "B0OTHER0003",
        topAsinName: "Other Thing",
        topAsinRevenue: 100,
        cities: [{ city: "AUSTIN", orders: 1, units: 1, revenue: 100 }],
      },
    },
    asins: [
      { asin: "B0OTHER0003", name: "Other Thing", productId: "prod-9", sku: "OT-1", orders: 1, units: 1, revenue: 100 },
    ],
    byAsin: { B0OTHER0003: { TX: { orders: 1, units: 1, revenue: 100 } } },
    account: { orders: 1, units: 1, revenue: 100, promo: 0 },
  };
}

function renderSection() {
  return render(
    <OrderGeographySection surface="hub" accountId="2706460" start="2025-09-16" end="2026-09-15" />,
  );
}

describe("OrderGeographySection product rows", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => report() }) as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links the ASIN to the Hub product page and the icon to the Amazon PDP", async () => {
    renderSection();

    const asinLink = await screen.findByRole("link", { name: "B0TEST0001" });
    expect(asinLink).toHaveAttribute("href", "/products/prod-1");

    const amazon = screen.getAllByRole("link", { name: "Open Amazon product page" })[0];
    expect(amazon).toHaveAttribute("href", "https://www.amazon.com/dp/B0TEST0001");
    expect(amazon).toHaveAttribute("target", "_blank");
    expect(amazon).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the SKU on the product row", async () => {
    renderSection();
    expect(await screen.findByText("PURA-CL-24")).toBeInTheDocument();
  });

  it("splits a pipe-delimited summarized title onto its own lines", async () => {
    renderSection();
    // "Soda | Cucumber & Lime" renders as two lines, not one wrapped string.
    expect(await screen.findByText("Soda")).toBeInTheDocument();
    expect(screen.getByText("Cucumber & Lime")).toBeInTheDocument();
  });

  it("still renders an uncatalogued ASIN, just without a product link", async () => {
    renderSection();

    await screen.findByRole("link", { name: "B0TEST0001" });
    expect(screen.queryByRole("link", { name: "B0UNCAT0002" })).toBeNull();
    expect(screen.getByText("B0UNCAT0002")).toBeInTheDocument();
  });

  it("drops an ASIN filter the newly loaded account does not sell", async () => {
    const { rerender } = renderSection();

    // Filter the map to a product from this account.
    fireEvent.click(await screen.findByText("Cucumber & Lime"));
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("B0TEST0001"));

    // Switch to an account whose catalog shares no ASIN with the first.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => otherAccountReport() }) as unknown as Response),
    );
    rerender(
      <OrderGeographySection surface="hub" accountId="9999999" start="2025-09-16" end="2026-09-15" />,
    );

    // The stale ASIN must not survive: the select and the map title agree.
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(ALL_PRODUCTS));
    expect(screen.queryByText(/B0TEST0001/)).toBeNull();
    expect(screen.getByText("Gross product sales by state")).toBeInTheDocument();
  });

  it("shows each state's share of all orders in the window", async () => {
    renderSection();
    // CA has 2 of the account's 3 distinct orders.
    expect((await screen.findAllByRole("columnheader", { name: "% of orders" })).length).toBeGreaterThan(0);
    const caRow = screen.getByRole("button", { name: "California" }).closest("tr");
    expect(caRow).toHaveTextContent("66.7%");
  });

  it("rebases the state share on the filtered product's own orders", async () => {
    renderSection();
    fireEvent.click(await screen.findByText("Cucumber & Lime"));
    // CA holds both of this product's 2 orders.
    await waitFor(() => expect(screen.getByText("100.0%")).toBeInTheDocument());
  });

  it("shows each product's share of all orders nationwide", async () => {
    renderSection();
    // The uncatalogued item is 1 of the account's 3 orders.
    expect(await screen.findByText("33.3%")).toBeInTheDocument();
  });

  it("shows each product's share of the selected state's orders", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "California" }));
    // CA has 2 orders, both containing the one product sold there: the
    // city row and the product row both read 100%.
    await waitFor(() => expect(screen.getAllByText("100.0%")).toHaveLength(2));
  });

  it("reports a failed query as an error rather than as 'no orders'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "boom" }) }) as unknown as Response),
    );
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Could not load order geography/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No Seller Central orders found/)).toBeNull();
  });

  it("distinguishes a genuinely empty account from a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () =>
              report({ states: {}, asins: [], byAsin: {}, account: { orders: 0, units: 0, revenue: 0, promo: 0 } }),
          }) as unknown as Response,
      ),
    );
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/No Seller Central orders found/)).toBeInTheDocument();
    });
  });
});

function stockPayload(o: Partial<FbaMapResponse> = {}): FbaMapResponse {
  const [tx, ty] = statePoint("TX");
  const [cx, cy] = statePoint("CA");
  return {
    accountId: "2706460", month: "2026-08", availableMonths: ["2026-08", "2026-07"], asin: null, asins: [],
    dots: [
      { key: "LGB", label: "Long Beach, CA", state: "CA", x: cx, y: cy, units: 70, share: 0.7, approximate: false, fcs: [{ code: "LGB8", units: 70, fee: 7 }] },
      { key: "DFW", label: "Dallas–Fort Worth, TX", state: "TX", x: tx, y: ty, units: 30, share: 0.3, approximate: false, fcs: [{ code: "DFW7", units: 30, fee: 3 }] },
    ],
    unplaced: { units: 0, share: 0, fcs: [] },
    totals: { units: 100, placedUnits: 100, fee: 10 },
    demand: { status: "unavailable", reason: "no_orders" }, divisions: null, ...o,
  };
}

describe("OrderGeographySection FBA stock layer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const stockCalls = () => fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/reports/fba-inventory-map"));
  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string) =>
      (url.startsWith("/api/reports/fba-inventory-map")
        ? { ok: true, status: 200, json: async () => stockPayload() }
        : { ok: true, json: async () => report() }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());
  const renderHub = (props: { stockMonth?: string | null; onStockMonths?: (m: StockMonths) => void } = {}) =>
    render(<OrderGeographySection surface="hub" accountId="2706460" start="2025-09-16" end="2026-09-15" stockMonth={null} {...props} />);

  it("without stockMonth (portal/default) there is no stock UI and no stock request", async () => {
    renderSection();
    await screen.findByText("State detail");
    expect(screen.queryByRole("button", { name: "FBA stock" })).toBeNull();
    expect(stockCalls()).toHaveLength(0);
  });

  it("with stockMonth=null: fetches newest stock once, shows the two-period caption and bubbles, no toggle", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    expect(stockCalls()).toEqual(["/api/reports/fba-inventory-map?accountId=2706460"]);
    expect(screen.queryByRole("button", { name: "FBA stock" })).toBeNull();
    expect(document.querySelector('[data-bubble="CA"]')).not.toBeNull();
  });

  it("Both (stock layer on): the map comes before the Nationwide Products table", async () => {
    renderHub();
    await screen.findByText(/Stock: Aug 2026 snapshot/);
    const map = screen.getByText("Gross product sales by state");
    const products = screen.getByText("Nationwide Products");
    expect(map.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("without stockMonth (orders/portal) the products table stays above the map", async () => {
    renderSection();
    await screen.findByText("State detail");
    const map = screen.getByText("Gross product sales by state");
    const products = screen.getByText("Nationwide Products");
    expect(products.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("clicking a circle selects the state; the detail shows the stock block with its mini-map and FC rows", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    fireEvent.click(document.querySelector('[data-bubble="CA"]')!);
    const block = await screen.findByTestId("state-stock-block");
    expect(block).toHaveTextContent("LGB8");
    expect(screen.getByTestId("state-mini-map")).toBeInTheDocument();
  });

  it("scopes the stock layer to the light paper theme so it stays legible in dark mode", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    fireEvent.click(document.querySelector('[data-bubble="CA"]')!);
    const block = await screen.findByTestId("state-stock-block");
    expect(document.querySelector('[data-bubble="CA"]')!.closest(".mf-paper")).not.toBeNull();
    expect(block.closest(".mf-paper")).not.toBeNull();
  });

  it("without stockMonth nothing is scoped to mf-paper", async () => {
    renderSection();
    await screen.findByText("State detail");
    expect(document.querySelector(".mf-paper")).toBeNull();
  });

  it("a stocked state with no orders shows its name, a no-orders line and the stock block", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    fireEvent.click(document.querySelector('[data-bubble="TX"]')!);
    expect(await screen.findByText("No orders shipped here in this window.")).toBeInTheDocument();
    expect(screen.getByText("Texas")).toBeInTheDocument();
    expect(screen.getByTestId("state-stock-block")).toHaveTextContent("DFW7");
  });

  it("without stockMonth a selected state with no orders keeps the pre-branch hint, not the no-orders line", async () => {
    const { rerender } = renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "California" }));
    await screen.findByText("CA · ship-to state · all products");
    // Switch to an account with no California orders: the selection persists, the detail is gone.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => otherAccountReport() }) as unknown as Response),
    );
    rerender(<OrderGeographySection surface="hub" accountId="9999999" start="2025-09-16" end="2026-09-15" />);
    expect(await screen.findByText("Select a state on the map to see its order breakdown.")).toBeInTheDocument();
    expect(screen.queryByText("No orders shipped here in this window.")).toBeNull();
  });

  it("the product filter is passed to the stock request", async () => {
    renderHub();
    await screen.findByText("Orders: Sep 16, 2025 – Sep 15, 2026 · Stock: Aug 2026 snapshot");
    fireEvent.change(screen.getByDisplayValue("All products"), { target: { value: "B0TEST0001" } });
    await waitFor(() => expect(stockCalls().at(-1)).toBe("/api/reports/fba-inventory-map?accountId=2706460&asin=B0TEST0001"));
  });
});
