import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionBar } from "./decision-bar";

describe("DecisionBar", () => {
  it("nobody may act → shows who it's waiting for, no buttons", () => {
    render(<DecisionBar actions={[]} actedAs={null} waitingFor="Pat Smith (PM)" onDecide={vi.fn()} />);
    expect(screen.getByText(/Waiting for Pat Smith \(PM\)/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("override buttons are labelled; request changes needs a note", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionBar actions={["approve", "request_changes"]} actedAs="override" waitingFor={null} onDecide={onDecide} />);
    expect(screen.getByRole("button", { name: "Approve (override)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Request changes (override)" }));
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/What should change/), { target: { value: "Bullet 3 too long" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes (override)" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("request_changes", "Bullet 3 too long"));
  });
  it("shows the error when onDecide rejects", async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error("Already decided — reload"));
    render(<DecisionBar actions={["approve"]} actedAs="assigned" waitingFor={null} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText("Already decided — reload")).toBeTruthy());
  });
  it("requireNoteFor makes Approve demand a note", () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionBar actions={["approve", "request_changes"]} actedAs="override" waitingFor={null} requireNoteFor={["approve"]} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve (override)" }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByText("Add a note first.")).toBeTruthy();
  });
});
