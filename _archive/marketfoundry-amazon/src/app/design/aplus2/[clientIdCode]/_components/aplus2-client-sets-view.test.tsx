import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Aplus2ClientSetsView } from "./aplus2-client-sets-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./new-set-dialog", () => ({
  NewSetDialog: () => null,
}));

vi.mock("./aplus-set-delete-button", () => ({
  AplusSetDeleteButton: () => <button type="button">Delete set</button>,
  aplusSetDisplayLabel: () => "Hot Sauce",
}));

vi.mock("./aplus2-content-preview", () => ({
  Aplus2ContentPreview: ({ modules }: { modules: { id: string }[] }) => (
    <div>preview:{modules.length}</div>
  ),
  ScaledAplusPreview: ({ modules }: { modules: { id: string }[] }) => (
    <div>preview:{modules.length}</div>
  ),
}));

const SET = {
  id: "set-1",
  contentType: "PA+",
  scopeType: "ASIN",
  scopeIdentifier: "B06XP296LV",
  marketplace: "US",
  parentAsin: null,
  coveredAsins: null,
  productId: "p1",
  asin: "B06XP296LV",
  sku: "SKU-1",
  itemName: "Hot Sauce",
  summarizedTitle: "Hot Sauce",
  variationId: null,
  variationName: null,
  versionCount: 1,
  latestStatus: "live",
  latestVersionNumber: 1,
  latestContentType: "PA+",
};

function renderView(mode: "hub" | "portal") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Aplus2ClientSetsView
        clientIdCode="TRT_SC_US"
        mode={mode}
        backHref={mode === "hub" ? "/design/aplus2" : "/portal/design"}
        backLabel={mode === "hub" ? "Back to A+ Content v2" : "Back to Design Hub"}
      />
    </QueryClientProvider>,
  );
}

describe("Aplus2ClientSetsView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/api/aplus2/sets?") && !href.includes("/versions")) {
          return {
            ok: true,
            json: async () => ({ clientName: "Trejo's Tacos", sets: [SET] }),
          };
        }
        if (href.includes("/versions")) {
          return {
            ok: true,
            json: async () => ({
              versions: [{
                id: "v1",
                versionNumber: 1,
                status: "live",
                contentType: "PA+",
                modules: [
                  { id: "m1", position: 1 },
                  { id: "m2", position: 2 },
                  { id: "m3", position: 3 },
                ],
              }],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  it("shows hub editor controls", async () => {
    renderView("hub");
    await waitFor(() => expect(screen.getByText("Open editor")).toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Version status" })).toBeInTheDocument();
    expect(screen.getByText("Delete set")).toBeInTheDocument();
    expect(screen.getByText("preview:2")).toBeInTheDocument();
  });

  it("copies the hub layout in portal mode without mutating controls", async () => {
    renderView("portal");
    await waitFor(() => expect(screen.getByText("Hot Sauce")).toBeInTheDocument());
    expect(screen.queryByText("New A+ Set")).toBeNull();
    expect(screen.queryByText("Open editor")).toBeNull();
    expect(screen.queryByText("Delete set")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "desktop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mobile" })).toBeInTheDocument();
    expect(screen.getByText("preview:2")).toBeInTheDocument();
  });
});
