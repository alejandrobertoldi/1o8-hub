import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateDeckDialog } from "./create-deck-dialog";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("CreateDeckDialog", () => {
  it("keeps the dialog open and shows the no-account notice instead of closing immediately", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "x", noAccount: true, failed: [] }),
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CreateDeckDialog clientIdCode="A" format="detailed" open onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(screen.getByText(/no intentwise account linked/i)).toBeTruthy());
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: /continue to deck/i }));
    expect(onCreated).toHaveBeenCalledWith("x");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets noAccount/createdId state when reopened, so a stale create result doesn't linger", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "x", noAccount: true, failed: [] }),
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CreateDeckDialog clientIdCode="A" format="detailed" open onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /continue to deck/i })).toBeTruthy());

    // Close (as the parent would on the Sheet/Dialog's onOpenChange(false)) then reopen.
    rerender(<CreateDeckDialog clientIdCode="A" format="detailed" open={false} onOpenChange={onOpenChange} onCreated={onCreated} />);
    rerender(<CreateDeckDialog clientIdCode="A" format="detailed" open onOpenChange={onOpenChange} onCreated={onCreated} />);

    expect(screen.queryByRole("button", { name: /continue to deck/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeTruthy();
    expect(screen.queryByText(/no intentwise account linked/i)).toBeNull();
    expect(screen.getByLabelText("Date from")).not.toBeDisabled();
    expect(screen.getByLabelText("Date to")).not.toBeDisabled();
  });

  it("closes immediately and calls onCreated when an account is linked", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "y", noAccount: false, failed: [] }),
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CreateDeckDialog clientIdCode="A" format="detailed" open onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("y"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/no intentwise account linked/i)).toBeNull();
  });
});
