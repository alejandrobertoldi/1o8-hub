import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MethodSettingsButton } from "./method-settings-modal";
import { DEFAULT_REC_SETTINGS } from "@/lib/inventory/rec-settings";

describe("MethodSettingsButton", () => {
  it("blocks an invalid seasonal window client-side", async () => {
    const onSave = vi.fn(async () => null);
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Greater of 90d/ }));
    fireEvent.click(screen.getByLabelText("Seasonal window"));
    fireEvent.change(screen.getByLabelText("Seasonal start"), { target: { value: "2025-02-01" } });
    fireEvent.change(screen.getByLabelText("Seasonal end"), { target: { value: "2024-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/before/i);
  });
  it("saves a valid config", async () => {
    const onSave = vi.fn(async () => null);
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Greater of 90d/ }));
    fireEvent.change(screen.getByLabelText("Recent window (days)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_REC_SETTINGS, recentDays: 120 }));
  });
  it("viewers see the chip but cannot open the editor", () => {
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable={false} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Greater of 90d/ })).toBeNull();
    expect(screen.getByText(/^Greater of 90d/)).toBeTruthy();
  });
  it("recovers when onSave rejects", async () => {
    const onSave = vi.fn(async () => { throw new Error("net"); });
    render(<MethodSettingsButton settings={DEFAULT_REC_SETTINGS} editable onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Greater of 90d/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not save/);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
