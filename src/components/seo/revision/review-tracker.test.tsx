import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewTracker, type TrackerEvent } from "./review-tracker";

const submit: TrackerEvent = { id: "E0", step: "submit", action: "submit", actorName: "Manu Lancharro", actedAs: "assigned", note: null, createdAt: "2026-10-01T23:30:00Z" };
const approvers = { pm: { name: "Sohail Asghar", email: "s@x.com" }, am: { name: "Ann Lee", email: "a@x.com" } };
const none = { step: null, actedAs: null, actions: [] as never[] };

describe("ReviewTracker", () => {
  it("three rows: SEO Manager ticked (submitted), PM waiting, AM not yet", () => {
    render(<ReviewTracker status="pm_review" events={[submit]} approvers={approvers} me={none} onDecide={async () => {}} />);
    expect(screen.getByRole("checkbox", { name: /SEO Manager · Manu Lancharro/ })).toHaveProperty("checked", true);
    const pm = screen.getByRole("checkbox", { name: /Project Manager · Sohail Asghar/ }) as HTMLInputElement;
    expect(pm.checked).toBe(false);
    expect(pm.disabled).toBe(true);
    expect(screen.getByText(/Waiting for Sohail Asghar/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Account Manager · Ann Lee/ })).toHaveProperty("checked", false);
    expect(screen.queryByText(/^Client$/)).toBeNull();
  });

  it("the assigned PM ticks → confirm → approve", async () => {
    const onDecide = vi.fn(async () => {});
    render(<ReviewTracker status="pm_review" events={[submit]} approvers={approvers} me={{ step: "pm", actedAs: "assigned", actions: ["approve", "request_changes"] }} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Project Manager/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("approve", null));
  });

  it("request changes needs a note", async () => {
    const onDecide = vi.fn(async () => {});
    render(<ReviewTracker status="pm_review" events={[submit]} approvers={approvers} me={{ step: "pm", actedAs: "assigned", actions: ["approve", "request_changes"] }} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const send = screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "BP5 too long" } });
    fireEvent.click(send);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("request_changes", "BP5 too long"));
  });

  it("PM approved → PM ticked with who; the AM's tick offers Send to client / Approve as final (final needs a reason)", async () => {
    const onDecide = vi.fn(async () => {});
    const pmOk: TrackerEvent = { ...submit, id: "E1", step: "pm", action: "approve", actorName: "Sohail Asghar", createdAt: "2026-10-02T10:00:00Z" };
    render(<ReviewTracker status="am_review" events={[submit, pmOk]} approvers={approvers} me={{ step: "am", actedAs: "assigned", actions: ["send_to_client", "approve_final", "request_changes"] }} onDecide={onDecide} />);
    expect(screen.getByRole("checkbox", { name: /Project Manager/ })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Account Manager/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send to client" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("send_to_client", null));
    fireEvent.click(screen.getByRole("checkbox", { name: /Account Manager/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve as final" }));
    const confirm = screen.getByRole("button", { name: "Confirm final approval" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "client signed off by email" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("approve_final", "client signed off by email"));
  });

  it("a higher-level member gets a separate Override box; the main box stays locked", async () => {
    const onDecide = vi.fn(async () => {});
    render(<ReviewTracker status="pm_review" events={[submit]} approvers={approvers} me={{ step: "pm", actedAs: "override", actions: ["approve", "request_changes"], overrideAs: "Account Manager" }} onDecide={onDecide} />);
    expect((screen.getByRole("checkbox", { name: /Project Manager · Sohail/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Override as Account Manager" }));
    expect(screen.getByText(/Override the Project Manager step as Account Manager/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("approve", null));
  });
  it("checked boxes are orange with a black tick (also when locked)", () => {
    render(<ReviewTracker status="pm_review" events={[submit]} approvers={approvers} me={none} onDecide={async () => {}} />);
    const seo = screen.getByRole("checkbox", { name: /SEO Manager/ });
    expect(seo.className).toContain("appearance-none");
    expect(seo.className).toContain("checked:bg-[#ff9900]");
    expect(seo.parentElement?.querySelector("svg.text-black")).toBeTruthy();
  });
  it("sent to client → a Client row appears", () => {
    const pmOk: TrackerEvent = { ...submit, id: "E1", step: "pm", action: "approve", actorName: "Sohail Asghar" };
    const sent: TrackerEvent = { ...submit, id: "E2", step: "am", action: "send_to_client", actorName: "Ann Lee" };
    render(<ReviewTracker status="client_review" events={[submit, pmOk, sent]} approvers={approvers} me={none} onDecide={async () => {}} />);
    expect(screen.getByRole("checkbox", { name: /Account Manager/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: /Client/ })).toHaveProperty("checked", false);
  });
});
