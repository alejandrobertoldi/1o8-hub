import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalClientPicker } from "./portal-client-picker";

const setClientEnabled = vi.fn();

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/portal/portal-visible-clients", () => ({
  usePortalVisibleClients: () => ({
    assigned: ["TRT_SC_US", "BNU_SC_US"],
    visible: ["TRT_SC_US", "BNU_SC_US"],
    setClientEnabled,
    showPicker: true,
    ready: true,
  }),
}));

function renderPicker() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalClientPicker />
    </QueryClientProvider>,
  );
}

describe("PortalClientPicker", () => {
  beforeEach(() => {
    setClientEnabled.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          clients: [
            { clientIdCode: "TRT_SC_US", clientName: "Trejo's Tacos", allowedSections: [] },
            { clientIdCode: "BNU_SC_US", clientName: "BNufty", allowedSections: [] },
          ],
        }),
      }),
    );
  });

  it("renders a compact dropdown instead of a client list", async () => {
    renderPicker();
    expect(screen.queryByRole("heading", { name: /your clients/i })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    const trigger = await screen.findByRole("button", {
      name: /visible clients: trejo's tacos · bnufty/i,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  });
});
