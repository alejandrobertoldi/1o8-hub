import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AplusSetDeleteButton,
  aplusSetDisplayLabel,
} from "./aplus-set-delete-button";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderButton(onDeleted?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AplusSetDeleteButton
        setId="set-1"
        label="TRT_SC_US_08 T-Shirt"
        clientIdCode="TRT_SC_US"
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
}

describe("aplusSetDisplayLabel", () => {
  it("uses variation id and name for PARENT sets", () => {
    expect(
      aplusSetDisplayLabel({
        scopeType: "PARENT",
        variationId: "TRT_SC_US_08",
        variationName: "T-Shirt",
        scopeIdentifier: "B08DL9YZPS",
      }),
    ).toBe("TRT_SC_US_08 T-Shirt");
  });

  it("uses the ASIN for ASIN-scope sets", () => {
    expect(
      aplusSetDisplayLabel({
        scopeType: "ASIN",
        asin: "B06XP296LV",
        scopeIdentifier: "B06XP296LV",
      }),
    ).toBe("B06XP296LV");
  });

  it("uses the group number, filter label, and member count for GROUP sets", () => {
    expect(
      aplusSetDisplayLabel({
        scopeType: "GROUP",
        variationId: "TRT_SC_US_08",
        scopeIdentifier: "G01_Nordic_Dreams",
        coveredAsins: ["B01", "B02", "B03"],
      }),
    ).toBe("G01 Nordic Dreams · 3 ASINs");
  });
});

describe("AplusSetDeleteButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a type-to-confirm dialog and does not delete until delete is typed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();
    renderButton(onDeleted);

    const trigger = screen.getByRole("button", { name: "Delete A+ set" });
    expect(trigger).toHaveClass("bg-brand-red");
    fireEvent.click(trigger);
    expect(screen.getByText("Delete A+ set?")).toBeInTheDocument();
    expect(screen.getByText("TRT_SC_US_08 T-Shirt")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /Delete set/ });
    expect(confirm).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("delete"), { target: { value: "delete" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/aplus2/sets/set-1", { method: "DELETE" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});
