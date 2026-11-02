import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SendControls, sendDisabledReason } from "./send-controls";

const totals = { skuCount: 42, unitsToSend: 3180, overstockSkus: 2, overstockUnits: 19 };

describe("SendControls", () => {
  it("is disabled with a reason", () => {
    render(<SendControls clientName="Poochie" snapshots={[]} canSend={false} disabledReason="Sales data failed to load" totals={totals} onSend={vi.fn()} onDownload={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Mark as sent" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("Sales data failed to load");
  });
  it("confirms with counts, then sends", async () => {
    const onSend = vi.fn(async () => ({ error: "nope" }));
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} onSend={onSend} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(screen.getByText(/Send 42 SKUs, 3,180 units to Poochie\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
  it("re-enables Confirm send and shows an error when onSend throws", async () => {
    const onSend = vi.fn(async () => { throw new Error("network"); });
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} onSend={onSend} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    const confirm = screen.getByRole("button", { name: "Confirm send" }) as HTMLButtonElement;
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(confirm.disabled).toBe(false);
  });
});

describe("SendControls (excluded rows and download notice)", () => {
  const header = { id: "s1", clientIdCode: "POO_SC_US", sentBy: "a@b.c", sentAt: "2026-10-07T00:00:00.000Z", method: "recent" as const, recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0, ...totals };
  it("names the rows that will be excluded", () => {
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} excludedCount={3} onSend={vi.fn()} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(screen.getByText("3 products without an ASIN/SKU will be excluded.")).toBeTruthy();
  });
  it("says nothing about exclusions when there are none", () => {
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} excludedCount={0} onSend={vi.fn()} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(screen.queryByText(/without an ASIN\/SKU/)).toBeNull();
  });
  it("keeps the send but shows a notice when the download failed", async () => {
    const onSend = vi.fn(async () => ({ snapshot: header, rows: [], downloadFailed: true as const }));
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} onSend={onSend} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    expect(await screen.findByText("Sent — the download failed; re-download it from the history menu.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows no notice when the download succeeded", async () => {
    const onSend = vi.fn(async () => ({ snapshot: header, rows: [] }));
    render(<SendControls clientName="Poochie" snapshots={[]} canSend disabledReason={null} totals={totals} onSend={onSend} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as sent" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(/the download failed/)).toBeNull();
  });
});

describe("sendDisabledReason", () => {
  const ok = { editable: true, hasAccounts: true, windowsStatus: "ready" as const, settingsReady: true, overridesStatus: "ready" as const, rowCount: 3 };
  it("is null when everything is ready", () => {
    expect(sendDisabledReason(ok)).toBeNull();
  });
  it("checks in the ruled order", () => {
    expect(sendDisabledReason({ ...ok, editable: false, hasAccounts: false, windowsStatus: "error" })).toBe("Editors only");
    expect(sendDisabledReason({ ...ok, hasAccounts: false, windowsStatus: "loading" })).toBe("No Amazon accounts linked");
    expect(sendDisabledReason({ ...ok, windowsStatus: "error", settingsReady: false, overridesStatus: "error" })).toBe("Sales data failed to load");
    expect(sendDisabledReason({ ...ok, overridesStatus: "error", settingsReady: false, rowCount: 0 })).toBe("Overrides failed to load");
    expect(sendDisabledReason({ ...ok, overridesStatus: "loading" })).toBe("Loading sales data…");
    expect(sendDisabledReason({ ...ok, overridesStatus: "idle" })).toBe("Loading sales data…");
    expect(sendDisabledReason({ ...ok, windowsStatus: "loading" })).toBe("Loading sales data…");
    expect(sendDisabledReason({ ...ok, settingsReady: false })).toBe("Loading sales data…");
    expect(sendDisabledReason({ ...ok, rowCount: 0 })).toBe("No SKUs to send");
  });
});
