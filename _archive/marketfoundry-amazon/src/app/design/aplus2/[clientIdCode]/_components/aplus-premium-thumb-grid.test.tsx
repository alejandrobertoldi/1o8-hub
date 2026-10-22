import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AplusPremiumThumbGrid } from "./aplus-premium-thumb-grid";

vi.mock("./aplus2-content-preview", () => ({
  Aplus2ContentPreview: ({ modules }: { modules: { id: string }[] }) => (
    <div>{modules.map((m) => m.id).join("+")}</div>
  ),
  ScaledAplusPreview: ({ modules }: { modules: { id: string }[] }) => (
    <div>{modules.map((m) => m.id).join("+")}</div>
  ),
}));

const PA_MODULES = [
  { id: "m1", position: 1 },
  { id: "m2", position: 2 },
  { id: "m3", position: 3 },
];

function renderGrid() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AplusPremiumThumbGrid clientIdCode="TRT_SC_US" />
    </QueryClientProvider>,
  );
}

describe("AplusPremiumThumbGrid", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);
        if (href.includes("/api/aplus2/sets?") && !href.includes("/versions")) {
          return {
            ok: true,
            json: async () => ({
              sets: [
                { id: "set-pa" },
                { id: "set-ba" },
              ],
            }),
          };
        }
        if (href.includes("/sets/set-pa/versions")) {
          return {
            ok: true,
            json: async () => ({
              versions: [
                { versionNumber: 1, contentType: "PA+", modules: PA_MODULES },
              ],
            }),
          };
        }
        if (href.includes("/sets/set-ba/versions")) {
          return {
            ok: true,
            json: async () => ({
              versions: [
                { versionNumber: 1, contentType: "BA+", modules: PA_MODULES },
              ],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  it("renders a 3-column grid with the first two PA+ modules and skips BA+", async () => {
    const { container } = renderGrid();
    await waitFor(() => expect(screen.getByText("m1+m2")).toBeInTheDocument());
    expect(screen.queryByText("m1+m2+m3")).toBeNull();
    expect(container.querySelector(".grid-cols-3")).toBeTruthy();
  });
});
