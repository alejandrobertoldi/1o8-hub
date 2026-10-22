import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApproverQueue } from "./ApproverQueue";

const PENDING = [
  {
    id: "r1",
    userId: "u1",
    userName: "Jo Carticiano",
    userEmail: "jo@marketfoundry.agency",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    reason: "Family trip",
    status: "pending" as const,
    workingDays: 5,
    decidedAt: null,
    decisionNote: null,
    createdAt: "2026-07-30T00:00:00.000Z",
  },
];

describe("ApproverQueue", () => {
  it("shows an empty state with nothing pending", () => {
    render(<ApproverQueue pending={[]} breakdown={[]} onDecide={vi.fn()} />);
    expect(screen.getByText("Nothing waiting on you.")).toBeInTheDocument();
    expect(screen.getByText("Pending (0)")).toBeInTheDocument();
  });

  it("shows the pending count and each request's reason", () => {
    render(<ApproverQueue pending={PENDING} breakdown={[]} onDecide={vi.fn()} />);
    expect(screen.getByText("Pending (1)")).toBeInTheDocument();
    expect(screen.getByText("Family trip")).toBeInTheDocument();
  });

  it("falls back to the requester email when a pending row's userName is null", () => {
    render(
      <ApproverQueue
        pending={[{ ...PENDING[0], userName: null }]}
        breakdown={[]}
        onDecide={vi.fn()}
      />
    );
    expect(screen.getByText("jo@marketfoundry.agency")).toBeInTheDocument();
    expect(screen.queryByText("Jo Carticiano")).not.toBeInTheDocument();
  });

  it("calls onDecide with 'approved' and the typed note", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ApproverQueue pending={PENDING} breakdown={[]} onDecide={onDecide} />);
    fireEvent.change(screen.getByPlaceholderText(/optional note/i), {
      target: { value: "Enjoy!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("r1", "approved", "Enjoy!"));
  });

  it("calls onDecide with 'denied' and a null note when none typed", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ApproverQueue pending={PENDING} breakdown={[]} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("r1", "denied", null));
  });

  it("shows the breakdown table rows", () => {
    render(
      <ApproverQueue
        pending={[]}
        breakdown={[{ userId: "u1", userName: "Jo", days: 5 }]}
        onDecide={vi.fn()}
      />
    );
    expect(screen.getByText("Jo")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("falls back to the userId when a breakdown row's userName is null", () => {
    render(
      <ApproverQueue
        pending={[]}
        breakdown={[{ userId: "u1", userName: null, days: 5 }]}
        onDecide={vi.fn()}
      />
    );
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

  it("shows a fallback message with an empty breakdown", () => {
    render(<ApproverQueue pending={[]} breakdown={[]} onDecide={vi.fn()} />);
    expect(screen.getByText("No approved time off yet.")).toBeInTheDocument();
  });

  it("logs an error and still resets the busy state when onDecide rejects", async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error("network down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ApproverQueue pending={PENDING} breakdown={[]} onDecide={onDecide} />);
    const approveButton = screen.getByRole("button", { name: /approve/i });

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("[time-off] decision failed", expect.any(Error));
    });

    expect(approveButton).not.toBeDisabled();

    consoleErrorSpy.mockRestore();
  });
});
