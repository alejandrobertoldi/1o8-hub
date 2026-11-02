import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "client", clientIdCode: "POO_SC_US" } }, status: "authenticated" }),
}));
vi.mock("@/components/layout/page-header-slot", () => ({ PageMetaSlot: () => null }));
vi.mock("@/components/portal/portal-stacked-clients", () => ({
  PortalStackedClients: ({ children }: { children: (code: string) => ReactNode }) => <>{children("POO_SC_US")}</>,
}));

import PortalInventoryPage from "./page";

const SNAP_ID = "11111111-2222-3333-4444-555555555555";
const header = {
  id: SNAP_ID, clientIdCode: "POO_SC_US", sentBy: "", sentAt: "2026-10-07T14:00:00.000Z",
  method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0,
  skuCount: 1, unitsToSend: 200, overstockSkus: 0, overstockUnits: 0,
};
const snapRow = {
  asin: "B1", sku: "S1", productName: "Sent one", mainImageUrl: "", available: 1, inbound: 0, reserved: 0,
  stockPosition: 1, basisUnits: 100, final: 200,
};
const product = {
  asin: "B0LIVE", sku: "LIVE", product_name: "Live product", main_image_url: "", listing_status: "Active",
  variation_id: "", parent_asin: "", color: "", size: "", flavor: "", style: "", health: null,
  q1_quantity: 0, q1_sales: 0, units_30d: 0, sales_30d: 0, units_90d: 100, sales_90d: 0,
  current: {
    product_sales: 0, units_sold: 0, ad_spend: 0, ad_revenue: 0, available: 0, inbound_quantity: 0,
    reserved_quantity: 0, reserved_customerorders: 0, reserved_fc_transfers: 0, reserved_fc_processing: 0,
    unfulfillable_quantity: 0,
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// `snapshots` decides how the snapshot endpoints answer; everything else is the
// sales-summary data the fallback table needs.
function stubFetch(snapshots: "sent" | "forbidden") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/sales-summary/inventory?")) return json({ products: [product] });
    if (url.startsWith("/api/sales-summary?")) return json({ clients: [{ accountIds: "123" }] });
    if (url.includes("inventory-rec-snapshots")) {
      if (snapshots === "forbidden") return json({ error: "Forbidden" }, 403);
      if (url.includes(`/${SNAP_ID}`)) return json({ snapshot: header, rows: [snapRow] });
      return json({ snapshots: [header] });
    }
    return json({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}><PortalInventoryPage /></QueryClientProvider>);
}

const snapshotUrls = (m: ReturnType<typeof stubFetch>) =>
  m.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("inventory-rec-snapshots"));

describe("Portal inventory page", () => {
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { err = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); err.mockRestore(); });

  it("renders the latest sent recommendation", async () => {
    stubFetch("sent");
    renderPage();
    expect(await screen.findByText("Recommendation sent 2026-10-07")).toBeTruthy();
    expect(screen.getByText("Sent one")).toBeTruthy();
  });

  it("falls back to the read-only table on a 403, with no endless spinner", async () => {
    stubFetch("forbidden");
    renderPage();
    expect(await screen.findByText("Live product")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Recommendation" })).toBeTruthy();
    expect(screen.queryByText(/Recommendation sent/)).toBeNull();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("reads snapshots only through the client-allowlisted /api/portal/ prefix", async () => {
    const m = stubFetch("sent");
    renderPage();
    await screen.findByText("Recommendation sent 2026-10-07");
    const urls = snapshotUrls(m);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    for (const u of urls) expect(u.startsWith("/api/portal/")).toBe(true);
  });
});
