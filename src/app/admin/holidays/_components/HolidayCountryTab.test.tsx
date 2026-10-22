import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatHolidayDate, HolidayCountryTab } from "./HolidayCountryTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HolidayCountryTab country="PT" year={2026} />
    </QueryClientProvider>
  );
}

describe("formatHolidayDate", () => {
  it("prefixes the ISO date with a 3-letter weekday", () => {
    // 2026-01-01 is a Thursday
    expect(formatHolidayDate("2026-01-01")).toBe("Thu 2026-01-01");
    // 2026-04-25 is a Saturday
    expect(formatHolidayDate("2026-04-25")).toBe("Sat 2026-04-25");
  });
});

describe("HolidayCountryTab", () => {
  it("adds a holiday on the happy path", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Freedom Day" }),
      }) // POST
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Freedom Day" }],
      }) as unknown as typeof fetch; // refetch after invalidate

    renderTab();
    await waitFor(() => expect(screen.getByPlaceholderText(/holiday name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/holiday name/i), {
      target: { value: "Freedom Day" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Holiday added"));
  });

  it("shows the 409 duplicate message inline", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "That country already has a holiday on that date" }),
      }) as unknown as typeof fetch;

    renderTab();
    await waitFor(() => expect(screen.getByPlaceholderText(/holiday name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/holiday name/i), {
      target: { value: "Dup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() =>
      expect(screen.getByText(/already has a holiday on that date/i)).toBeInTheDocument()
    );
  });

  it("shows an error message when the initial load fails", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "boom" }),
      }) as unknown as typeof fetch;

    renderTab();
    await waitFor(() =>
      expect(screen.getByText(/could.*t load holidays/i)).toBeInTheDocument()
    );
  });

  it("deletes a holiday and shows success", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Freedom Day" }],
      }) // initial load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, id: "h1" }),
      }) // DELETE
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      }) as unknown as typeof fetch; // refetch after invalidate

    renderTab();
    await waitFor(() => expect(screen.getByText("Freedom Day")).toBeInTheDocument());
    expect(screen.getByText("Sat 2026-04-25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete freedom day/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Holiday deleted"));
  });

  it("edits a holiday on the happy path", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Freedom Day" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "h1",
          countryCode: "PT",
          holidayDate: "2026-04-25",
          name: "Dia da Liberdade",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Dia da Liberdade" },
        ],
      }) as unknown as typeof fetch;

    renderTab();
    await waitFor(() => expect(screen.getByText("Freedom Day")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /edit freedom day/i }));
    const nameInput = screen.getByLabelText(/holiday name/i);
    fireEvent.change(nameInput, { target: { value: "Dia da Liberdade" } });
    fireEvent.click(screen.getByRole("button", { name: /save holiday/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Holiday updated"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/holidays/h1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ holidayDate: "2026-04-25", name: "Dia da Liberdade" }),
      })
    );
  });

  it("shows a duplicate-date error when editing conflicts", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "h1", countryCode: "PT", holidayDate: "2026-04-25", name: "Freedom Day" },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: "That country already has a holiday on that date" }),
      }) as unknown as typeof fetch;

    renderTab();
    await waitFor(() => expect(screen.getByText("Freedom Day")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /edit freedom day/i }));
    fireEvent.click(screen.getByRole("button", { name: /save holiday/i }));

    await waitFor(() =>
      expect(screen.getByText(/already has a holiday on that date/i)).toBeInTheDocument()
    );
  });
});
