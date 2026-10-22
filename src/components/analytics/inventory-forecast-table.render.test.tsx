import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DEFAULT_REC_SETTINGS } from "@/lib/inventory/rec-settings";

const hook = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./inventory-final/use-inventory-final", () => ({ useInventoryFinal: () => hook.value }));
const xlsx = vi.hoisted(() => ({ download: vi.fn(async (): Promise<void> => undefined) }));
vi.mock("@/lib/inventory/export-xlsx", () => ({ downloadSnapshotXlsx: xlsx.download }));

// The capacity panel loads its own data (react-query); it has its own test file.
vi.mock("./inventory-final/capacity-panel", () => ({ CapacityPanel: () => null }));

import { InventoryForecastTable } from "./inventory-forecast-table";

const product = (sku: string, units_90d: number, available: number) => ({
  asin: `B0${sku}`, sku, product_name: `Product ${sku}`, main_image_url: "", listing_status: "Active",
  variation_id: "", parent_asin: "", color: "", size: "", flavor: "", style: "", health: null,
  q1_quantity: 0, q1_sales: 0, units_30d: 0, sales_30d: 0, units_90d, sales_90d: 0,
  current: {
    product_sales: 0, units_sold: 0, ad_spend: 0, ad_revenue: 0, available,
    inbound_quantity: 0, reserved_quantity: 0, reserved_customerorders: 0,
    reserved_fc_transfers: 0, reserved_fc_processing: 0, unfulfillable_quantity: 0,
  },
});

// SEND needs 110, OVER has 200 against a 110 target ⇒ −90.
const products = [product("SEND", 100, 0), product("OVER", 100, 200)];

function hubHook(over: Record<string, unknown> = {}) {
  return {
    settings: DEFAULT_REC_SETTINGS, settingsReady: true, saveSettings: vi.fn(async () => null),
    windows: undefined, windowsStatus: "ready", overrides: new Map(), overridesStatus: "ready",
    saveOverride: vi.fn(async () => null), clearOverride: vi.fn(async () => null),
    buffers: new Map(), saveBuffer: vi.fn(async () => null), clearBuffer: vi.fn(async () => null),
    snapshots: [], createSnapshot: vi.fn(), loadSnapshotRows: vi.fn(), canEdit: true, ...over,
  };
}

// Every body row must have as many cells as the column-header row has columns.
function expectAligned() {
  const table = screen.getByRole("table");
  const headerRows = within(table).getAllByRole("row").slice(0, 2);
  const width = (cells: HTMLElement[]) => cells.reduce((n, c) => n + Number(c.getAttribute("colspan") ?? 1), 0);
  const groupWidth = width(within(headerRows[0]).getAllByRole("columnheader"));
  const colWidth = width(within(headerRows[1]).getAllByRole("columnheader"));
  expect(groupWidth).toBe(colWidth);
  for (const row of within(table).getAllByRole("row").slice(2)) {
    expect(width(within(row).getAllByRole("cell"))).toBe(colWidth);
  }
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe("InventoryForecastTable (hub)", () => {
  it("puts Final on the Result line (no Live calc / Final columns), with controls and aligned columns", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" clientName="Poochie" />);
    expect(screen.queryByRole("columnheader", { name: "Final" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Live calc" })).toBeNull();
    expect(screen.getAllByText("Result")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Mark as sent" })).toBeTruthy();
    expect(screen.queryByText(/MF Rec/)).toBeNull();
    expectAligned();
  });

  it("filters to overstock rows", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    fireEvent.click(screen.getByRole("tab", { name: "Overstock" }));
    expect(screen.queryByText("Product SEND")).toBeNull();
    expect(screen.getByText("Product OVER")).toBeTruthy();
  });

  it("keeps columns aligned when a group is expanded", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    fireEvent.click(screen.getByRole("button", { name: /Stock detail/ }));
    expect(screen.getByRole("columnheader", { name: "Stock" })).toBeTruthy();
    expectAligned();
  });

  it("disables send when no accounts are linked", () => {
    hook.value = hubHook({ windowsStatus: "loading" });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" />);
    expect((screen.getByRole("button", { name: "Mark as sent" }) as HTMLButtonElement).title).toBe("No Amazon accounts linked");
  });
});

describe("InventoryForecastTable (overrides gate)", () => {
  it("blocks send when overrides failed to load", () => {
    hook.value = hubHook({ overridesStatus: "error" });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const btn = screen.getByRole("button", { name: "Mark as sent" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("Overrides failed to load");
  });
});

describe("InventoryForecastTable (send)", () => {
  const header = { id: "s1", clientIdCode: "POO_SC_US", sentBy: "a@b.c", sentAt: "2026-10-07T00:00:00.000Z", method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0, skuCount: 2, unitsToSend: 110, overstockSkus: 1, overstockUnits: 90 };

  it("counts only sendable rows and names the excluded ones", () => {
    hook.value = hubHook();
    const withBlank = [...products, { ...product("NOASIN", 100, 0), asin: "" }];
    render(<InventoryForecastTable products={withBlank} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" clientName="Poochie" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(screen.getByText(/Send 2 SKUs, 100 units to Poochie\?/)).toBeTruthy(); // default buffer 0%
    expect(screen.getByText("1 product without an ASIN/SKU will be excluded.")).toBeTruthy();
  });

  it("never posts a row without an ASIN/SKU", async () => {
    const createSnapshot = vi.fn(async () => ({ snapshot: header }));
    hook.value = hubHook({ createSnapshot });
    const withBlank = [...products, { ...product("NOSKU", 100, 0), sku: " " }];
    render(<InventoryForecastTable products={withBlank} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" clientName="Poochie" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() => expect(createSnapshot).toHaveBeenCalled());
    const sent = (createSnapshot.mock.calls[0] as unknown as [{ sku: string }[]])[0];
    expect(sent.map((r) => r.sku)).toEqual(["SEND", "OVER"]);
  });

  it("keeps the send and shows a notice when the download fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    xlsx.download.mockImplementationOnce(async () => { throw new Error("blocked"); });
    hook.value = hubHook({ createSnapshot: vi.fn(async () => ({ snapshot: header })) });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" clientName="Poochie" />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    expect(await screen.findByText("Sent — the download failed; re-download it from the history menu.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    err.mockRestore();
  });
});

describe("InventoryForecastTable (readOnly)", () => {
  it("portal before a send: the breakdown only — no Result, no buffer, no ship-in columns, no All methods", () => {
    try { window.localStorage.setItem("mfhub.inventory.openGroups", JSON.stringify(["methods"])); } catch { /* no storage in this env */ }
    hook.value = hubHook({ windowsStatus: "idle" });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" readOnly />);
    expect(screen.queryByRole("button", { name: /All methods/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Ship-in/ })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Recommendation" })).toBeTruthy();
    expect(screen.queryByText("Result")).toBeNull(); // nothing unsent reaches the client
    expect(screen.queryByLabelText("Buffer %")).toBeNull();
    expect(screen.queryByText(/^Buffer/)).toBeNull();
    expectAligned();
  });

  it("stays aligned with a group expanded", () => {
    hook.value = hubHook({ windowsStatus: "idle" });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" readOnly />);
    fireEvent.click(screen.getByRole("button", { name: /Sales/ }));
    expectAligned();
  });

  it("hides Final, Live calc and the hub controls but keeps groups", () => {
    hook.value = hubHook({ windowsStatus: "idle" });
    render(<InventoryForecastTable products={products} periodLabel="x" clientIdCode="POO_SC_US" readOnly />);
    expect(screen.queryByRole("columnheader", { name: "Final" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Live calc" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as sent" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: /Stock detail/ })).toBeTruthy();
    expectAligned();
  });
});

describe("InventoryForecastTable product identity", () => {
  const identified = {
    ...product("SEND", 100, 0),
    product_id: "11111111-1111-1111-1111-111111111111",
    parentage_level: "Child",
    summarized_title: "Fishing Belt | Black | Large",
  };

  it("links the ASIN to the Hub PDP, shows Parentage, and splits the title into lines", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[identified]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const asin = screen.getByRole("link", { name: "B0SEND" });
    expect(asin.getAttribute("href")).toBe("/products/11111111-1111-1111-1111-111111111111?from=inventory");
    expect(screen.getByRole("link", { name: "Open Amazon product page" })).toBeTruthy();
    expect(screen.getByText("Child")).toBeTruthy();
    expect(screen.getByText("Fishing Belt")).toBeTruthy();
    expect(screen.getByText("Black")).toBeTruthy();
    expect(screen.getByText("Large")).toBeTruthy();
  });

  it("does not link the ASIN to /products on the portal", () => {
    hook.value = hubHook({ canEdit: false });
    render(<InventoryForecastTable products={[identified]} periodLabel="x" clientIdCode="POO_SC_US" readOnly />);
    expect(screen.queryByRole("link", { name: "B0SEND" })).toBeNull();
    expect(screen.getByText("B0SEND")).toBeTruthy();
  });

  it("falls back to the Amazon item name when there is no summarized title", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[product("SEND", 100, 0)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    expect(screen.getByText("Product SEND")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "B0SEND" })).toBeNull();
  });

  it("adds the size as a title line when the summarized title lacks it", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[{ ...identified, summarized_title: "Iced Tea | Lemon", flavor: "Lemon", size: "12 fl oz (12 Pack)" }]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    expect(screen.getByText("Lemon")).toBeTruthy();
    expect(screen.getAllByText("12 fl oz (12 Pack)")).toHaveLength(1); // title line only — no Size column
    expect(screen.queryByRole("columnheader", { name: "Size" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Flavor" })).toBeNull();
  });

  it("groups rows under a header per variation, ordered by each group's best seller", () => {
    hook.value = hubHook();
    const rows = [
      { ...product("A1", 10, 0), variation_name: "Alpha", variation_id: "POO_SC_US_01" },
      { ...product("B1", 50, 0), variation_name: "Beta" },
      { ...product("A2", 40, 0), variation_name: "Alpha" },
    ];
    render(<InventoryForecastTable products={rows} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const body = screen.getAllByRole("row").slice(2).map((r) => r.textContent ?? "");
    const order = body.map((t) => (t.startsWith("Beta") ? "Beta" : t.startsWith("Alpha") ? "Alpha" : (t.match(/B0(A1|A2|B1)/)?.[1] ?? "?")));
    expect(order).toEqual(["Beta", "B1", "Alpha", "A2", "A1"]);
    expect(screen.getByText(/2 SKUs/)).toBeTruthy();
    expect(screen.getByText("POO_SC_US_01")).toBeTruthy();
    expectAligned();
  });

  it("marks variety packs with the VP icon in the title cell", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[{ ...product("VP1", 10, 0), flavor: "Variety Pack" }, product("ONE", 5, 0)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    expect(screen.getAllByLabelText("Variety pack")).toHaveLength(1);
  });

  it("shows the VP icon in red when the pack has no items set", async () => {
    hook.value = hubHook();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { asin: "B0EMPTY", sku: "EMPTY", itemCount: 0, items: [] },
      { asin: "B0FULL", sku: "FULL", itemCount: 12, items: [{ flavor: "Lemon", units: 12 }] },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<InventoryForecastTable products={[product("EMPTY", 10, 0), product("FULL", 5, 0)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
      await waitFor(() => expect(screen.getByLabelText("Variety pack needs items")).toBeTruthy());
      expect(screen.getByRole("link", { name: "Variety pack needs items" }).getAttribute("href")).toBe("/variety-packs?client=POO_SC_US");
      expect(screen.getByLabelText("Variety pack").getAttribute("title")).toBe("Variety pack — 12× Lemon");
      expect(fetchMock).toHaveBeenCalledWith("/api/variety-packs?client=POO_SC_US");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Stock detail is one stacked cell starting with AWD, and both AWD figures count in Stock position", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[{ ...product("AWD", 100, 40), awd_onhand: 500, awd_inbound: 70 }]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    fireEvent.click(screen.getByRole("button", { name: /Stock detail/ }));
    expect(screen.getByRole("columnheader", { name: "Stock" })).toBeTruthy();
    const stock = screen.getByText("FC transfer").closest("td") as HTMLElement;
    const labels = Array.from(stock.querySelectorAll(".\\[writing-mode\\:vertical-rl\\]")).map((e) => e.textContent);
    expect(labels).toEqual(["AWD", "FBA", "On-hand", "Reserved"]);
    // On-hand and Reserved sit inside the FBA box.
    const fbaBox = Array.from(stock.querySelectorAll("div.rounded-sm")).find((b) => b.querySelector(".\\[writing-mode\\:vertical-rl\\]")?.textContent === "FBA") as HTMLElement;
    expect(fbaBox.querySelectorAll("div.rounded-sm")).toHaveLength(2);
    const lines = Array.from(stock.querySelectorAll("div.justify-between")).map((d) => d.textContent);
    expect(lines.slice(0, 4)).toEqual(["Total570", "Available500", "Inbound70", "Total40"]);
    expect(screen.getAllByText("500")).toHaveLength(2); // Recommendation cell + Stock cell
    expect(screen.getAllByText("70")).toHaveLength(2);
    // stock position = 40 available + 500 AWD + 70 AWD inbound
    expect(screen.getByTitle(/Stock position 610 =/)).toBeTruthy();
    expectAligned();
  });

  it("stacks basis, AWD inbound, AWD avail, FBA inbound, FBA avail, reserved in one Recommendation cell", () => {
    hook.value = hubHook();
    const p = { ...product("STK", 100, 40), awd_onhand: 500, awd_inbound: 70, color: "Black", style: "Cap" };
    p.current = { ...p.current, inbound_quantity: 9, reserved_quantity: 6 };
    render(<InventoryForecastTable products={[p]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const cell = screen.getByTitle(/^Basis 100 /);
    expect(Array.from(cell.querySelectorAll(".\\[writing-mode\\:vertical-rl\\]")).map((e) => e.textContent)).toEqual(["AWD", "FBA"]);
    expect(Array.from(cell.querySelectorAll("div.justify-between")).map((d) => d.textContent)).toEqual([
      "Last 90d100", "Buffer%+0", "Inbound70", "Available500", "Inbound9", "On-hand40", "Reserved6",
      "ResultOverstock−525", // 0% buffer: 100 − (70 + 500 + 9 + 40 + 6) = 100 − 625
    ]);
    expect(screen.queryByRole("columnheader", { name: /Stock position/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Color" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Style" })).toBeNull();
    expectAligned();
  });

  it("Sales shows only the two Basis inputs: units last 90d and units next 90d last year", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[{ ...product("SAL", 100, 0), q1_quantity: 345 }]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Sales/ }));
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    const i = headers.indexOf("Unitslast 90d");
    expect(i).toBeGreaterThan(-1);
    expect(headers[i + 1]).toMatch(/^Units next90d \d{4}$/);
    expect(headers.some((h) => /7d|30d|Same qtr/.test(h))).toBe(false);
    expect(screen.getAllByText("345").length).toBeGreaterThanOrEqual(2); // Sales column + Basis (the greater of 100 and 345)
    expectAligned();
  });

  it("Health is one stacked cell: sales rank, then boxed Cover and Age, with 365+ in red", () => {
    hook.value = hubHook();
    const health = {
      age_0_90: 30, age_91_180: 0, age_181_270: 0, age_271_365: 0, age_365_plus: 4,
      shipped_7d: 0, shipped_30d: 0, shipped_90d: 0, weeks_of_cover: 1.5, sales_rank: 1234,
      total_quantity: 40, sellable_quantity: 40, recommend_ship_in: 12,
    };
    render(<InventoryForecastTable products={[{ ...product("HLT", 100, 40), health }]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    fireEvent.click(screen.getByRole("button", { name: /Health/ }));
    expect(screen.getByRole("columnheader", { name: "Health" })).toBeTruthy();
    const cell = screen.getByText("Weeks of cover").closest("td") as HTMLElement;
    expect(Array.from(cell.querySelectorAll(".\\[writing-mode\\:vertical-rl\\]")).map((e) => e.textContent)).toEqual(["Cover", "Age"]);
    const lines = Array.from(cell.querySelectorAll("div.justify-between")).map((d) => d.textContent);
    expect(lines).toEqual([
      "Sales rank1,234", "Weeks of cover1.5", "Days of supply36d", "Amazon rec. ship-in12",
      "0–90 days30", "91–180 days—", "181–270 days—", "271–365 days—", "365+ days4",
    ]);
    expect(screen.getByText("1.5").className).toMatch(/FF5C5F/);
    expect(screen.getByText("4").className).toMatch(/FF5C5F/);
    expectAligned();
  });

  it("groups same-ASIN SKUs: send-here first with pooled stock, the twin sells down", () => {
    hook.value = hubHook();
    const twin = (sku: string, units: number, available: number, inbound: number) => {
      const x = { ...product(sku, units, available), asin: "B0SHARED" };
      x.current = { ...x.current, inbound_quantity: inbound };
      return x;
    };
    render(<InventoryForecastTable products={[twin("DUP", 200, 50, 0), twin("MAIN", 100, 10, 30)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    expect(screen.getByText(/2 SKUs on one ASIN/)).toBeTruthy();
    const order = screen.getAllByRole("row").map((r) => r.textContent ?? "").filter((t) => /Send here|Sell down/.test(t)).map((t) => (t.includes("Send here") ? "MAIN" : "DUP"));
    expect(order).toEqual(["MAIN", "DUP"]);
    // Pooled: units 300 (no windows ⇒ units_90d summed), stock 50 + 10 + 30 = 90, 0% buffer ⇒ 300 − 90 = 210.
    const mainRow = screen.getByText("Send here").closest("tr") as HTMLElement;
    expect((mainRow.querySelector('div[title^="Basis"]')?.lastElementChild as HTMLElement).textContent).toMatch(/^Result210/);
    expect(screen.getByText(/pooled into/)).toBeTruthy();
    expectAligned();
  });

  it("buffer % is per product: a stepper (±5) that changes the Result and saves debounced", async () => {
    const saveBuffer = vi.fn(async () => null);
    const clearBuffer = vi.fn(async () => null);
    hook.value = hubHook({ buffers: new Map([["BUF", 25]]), saveBuffer, clearBuffer });
    render(<InventoryForecastTable products={[product("BUF", 100, 40)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const cell = screen.getByTitle(/^Basis 100 /);
    const input = screen.getByLabelText("Buffer %") as HTMLInputElement;
    expect(input.value).toBe("25");
    expect((cell.lastElementChild as HTMLElement).textContent).toMatch(/^Result85/); // ceil(100 × 1.25) − 40
    fireEvent.click(screen.getByRole("button", { name: "Increase buffer" }));
    expect(input.value).toBe("30");
    expect((cell.lastElementChild as HTMLElement).textContent).toMatch(/^Result90/); // applied at once
    await waitFor(() => expect(saveBuffer).toHaveBeenCalledWith("BUF", 30), { timeout: 2000 });
    expect(screen.queryByRole("button", { name: /Edit buffer/ })).toBeNull(); // no pencil
  });

  it("typing the default (0) removes the product's buffer instead of storing 0", async () => {
    const clearBuffer = vi.fn(async () => null);
    hook.value = hubHook({ buffers: new Map([["BUF", 10]]), clearBuffer });
    render(<InventoryForecastTable products={[product("BUF", 100, 40)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const input = screen.getByLabelText("Buffer %");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    await waitFor(() => expect(clearBuffer).toHaveBeenCalledWith("BUF"), { timeout: 2000 });
  });

  it("shows the minimum-stock line when the floor raises the target", () => {
    hook.value = hubHook();
    render(<InventoryForecastTable products={[product("SLOW", 10, 20)]} periodLabel="x" clientIdCode="POO_SC_US" accountIds="1" />);
    const cell = screen.getByTitle(/^Basis 10 /);
    const lines = Array.from(cell.querySelectorAll("div.justify-between")).map((d) => d.textContent);
    expect(lines).toContain("Min stock 100+90"); // max(10, 100) − 10 basis
    expect((cell.lastElementChild as HTMLElement).textContent).toMatch(/^Result80/); // 100 − 20 stock
  });
});

