import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestTimeOffDialog } from "./RequestTimeOffDialog";

const NO_CALENDAR_MESSAGE =
  "Your holiday calendar isn't set. Ask an admin to set it on your profile before booking time off.";

function setup(overrides: Partial<React.ComponentProps<typeof RequestTimeOffDialog>> = {}) {
  const onSubmitted = vi.fn();
  render(
    <RequestTimeOffDialog
      countryCode="PK"
      todayKey="2026-08-05"
      onSubmitted={onSubmitted}
      {...overrides}
    />
  );
  return { onSubmitted };
}

describe("RequestTimeOffDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("disables the trigger and sets the API message as its title when countryCode is null", () => {
    setup({ countryCode: null });
    const button = screen.getByRole("button", { name: /request time off/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", NO_CALENDAR_MESSAGE);
  });

  it("enables the trigger with no title when countryCode is set", () => {
    setup({ countryCode: "PK" });
    const button = screen.getByRole("button", { name: /request time off/i });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("title");
  });

  it("opens the dialog and submits successfully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "r1" }),
    });
    const { onSubmitted } = setup();
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    fireEvent.change(screen.getByPlaceholderText(/why are you taking time off/i), {
      target: { value: "Family trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it("renders the conflict dates inline on a 409", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "You already have a request covering those dates",
        conflict: { startDate: "2026-08-10", endDate: "2026-08-12" },
      }),
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    fireEvent.change(screen.getByPlaceholderText(/why are you taking time off/i), {
      target: { value: "Trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/already have a request.*2026-08-10.*2026-08-12/i)
      ).toBeInTheDocument()
    );
  });

  it("renders a generic message on a 400", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "reason is required" }),
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    fireEvent.change(screen.getByPlaceholderText(/why are you taking time off/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() => expect(screen.getByText("reason is required")).toBeInTheDocument());
  });

  it("shows an error message instead of silently failing when fetch rejects", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    fireEvent.change(screen.getByPlaceholderText(/why are you taking time off/i), {
      target: { value: "Family trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() =>
      expect(screen.getByText(/failed to submit request/i)).toBeInTheDocument()
    );
  });

  it("resets form state when Cancel is clicked", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    const reasonTextarea = screen.getByPlaceholderText(/why are you taking time off/i);
    fireEvent.change(reasonTextarea, {
      target: { value: "Family trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /request time off/i }));
    await waitFor(() => {
      expect((screen.getByPlaceholderText(/why are you taking time off/i) as HTMLTextAreaElement).value).toBe("");
    });
  });
});
