import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestsList } from "./RequestsList";

const ROW = {
  id: "r1",
  userId: "u1",
  userName: "Jo Carticiano",
  userEmail: "jo@marketfoundry.agency",
  startDate: "2026-08-10",
  endDate: "2026-08-14",
  reason: "Family trip",
  status: "approved" as const,
  workingDays: 5,
  decidedAt: "2026-08-01T00:00:00.000Z",
  decisionNote: null,
  createdAt: "2026-07-30T00:00:00.000Z",
};

describe("RequestsList", () => {
  it("shows the own-days banner when ownDays is provided", () => {
    render(<RequestsList requests={[]} showRequester={false} ownDays={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("omits the banner when ownDays is undefined", () => {
    render(<RequestsList requests={[]} showRequester={false} />);
    expect(screen.queryByText(/taken/i)).not.toBeInTheDocument();
  });

  it("shows an empty state with no requests", () => {
    render(<RequestsList requests={[]} showRequester={false} />);
    expect(screen.getByText("No requests yet.")).toBeInTheDocument();
  });

  it("shows the requester name only when showRequester is true", () => {
    const { rerender } = render(<RequestsList requests={[ROW]} showRequester={false} />);
    expect(screen.queryByText("Jo Carticiano")).not.toBeInTheDocument();
    rerender(<RequestsList requests={[ROW]} showRequester />);
    expect(screen.getByText("Jo Carticiano")).toBeInTheDocument();
  });

  it("falls back to the requester email when userName is null", () => {
    render(<RequestsList requests={[{ ...ROW, userName: null }]} showRequester />);
    expect(screen.getByText("jo@marketfoundry.agency")).toBeInTheDocument();
    expect(screen.queryByText("Jo Carticiano")).not.toBeInTheDocument();
  });

  it("always shows the reason", () => {
    render(<RequestsList requests={[ROW]} showRequester={false} />);
    expect(screen.getByText("Family trip")).toBeInTheDocument();
  });

  it("shows a decision note only when present", () => {
    render(<RequestsList requests={[ROW]} showRequester={false} />);
    expect(screen.queryByText(/note:/i)).not.toBeInTheDocument();
    render(<RequestsList requests={[{ ...ROW, decisionNote: "Enjoy!" }]} showRequester={false} />);
    expect(screen.getByText(/enjoy!/i)).toBeInTheDocument();
  });

  it("renders the status badge text", () => {
    render(<RequestsList requests={[ROW]} showRequester={false} />);
    expect(screen.getByText("approved")).toBeInTheDocument();
  });

  it("shows Edit and Cancel for the owner's future approved request", () => {
    render(
      <RequestsList
        requests={[ROW]}
        showRequester={false}
        currentUserId="u1"
        today="2026-08-07"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel request" })
    ).toBeInTheDocument();
  });

  it("hides actions for someone else's request", () => {
    render(
      <RequestsList
        requests={[ROW]}
        showRequester
        currentUserId="other"
        today="2026-08-07"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("hides actions once an approved request has started", () => {
    render(
      <RequestsList
        requests={[ROW]}
        showRequester={false}
        currentUserId="u1"
        today="2026-08-10"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("opens the edit dialog from Edit", () => {
    render(
      <RequestsList
        requests={[ROW]}
        showRequester={false}
        currentUserId="u1"
        today="2026-08-07"
        onCancel={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit time off")).toBeInTheDocument();
    expect(
      screen.getByText(/move this request back to pending/i)
    ).toBeInTheDocument();
  });
});

describe("revoke control", () => {
  it("shows Revoke on an approved row when onRevoke is supplied", () => {
    render(
      <RequestsList requests={[ROW]} showRequester={false} onRevoke={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    // A revoke-only caller (no currentUserId/today/onCancel/onEdit) must not
    // also gain the owner's Edit/Cancel controls — canModify still gates them
    // individually inside the broadened canModify || showRevoke action row.
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel request" })
    ).not.toBeInTheDocument();
  });

  it("hides Revoke on a pending row", () => {
    render(
      <RequestsList
        requests={[{ ...ROW, status: "pending" }]}
        showRequester={false}
        onRevoke={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Revoke" })
    ).not.toBeInTheDocument();
  });

  it("keeps the revoke confirm disabled until a note is typed", () => {
    render(
      <RequestsList requests={[ROW]} showRequester={false} onRevoke={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const confirmButton = screen.getByRole("button", { name: "Revoke request" });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Needs coverage next week" },
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it("calls onRevoke with the row id and the trimmed note", async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    render(
      <RequestsList requests={[ROW]} showRequester={false} onRevoke={onRevoke} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  needs coverage  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke request" }));
    await waitFor(() =>
      expect(onRevoke).toHaveBeenCalledWith("r1", "needs coverage")
    );
  });

  it("surfaces the rejection message when onRevoke fails", async () => {
    const onRevoke = vi.fn().mockRejectedValue(new Error("Boom"));
    render(
      <RequestsList requests={[ROW]} showRequester={false} onRevoke={onRevoke} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "needs coverage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke request" }));
    await waitFor(() => expect(screen.getByText("Boom")).toBeInTheDocument());
  });
});

// Pins the shipped gate: e2842686 requires BOTH handlers before showing the
// owner action row, so a caller that passes neither gets a read-only list.
it("hides Cancel when no onCancel handler is supplied", () => {
  render(
    <RequestsList
      requests={[ROW]}
      showRequester={false}
      currentUserId="u1"
      today="2026-08-07"
    />
  );
  expect(
    screen.queryByRole("button", { name: "Cancel request" })
  ).not.toBeInTheDocument();
});
