import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FinalCell } from "./final-cell";

const base = { basis: 100, floorUnits: 0, liveCalc: 80, final: 80, overridden: false, isOverstock: false, drifted: false };

describe("FinalCell", () => {
  it("shows the number", () => {
    render(<FinalCell rec={base} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("80")).toBeTruthy();
  });
  it("shows overstock badge instead of a dash", () => {
    render(<FinalCell rec={{ ...base, liveCalc: -14, final: -14, isOverstock: true }} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("Overstock")).toBeTruthy(); // chip holds only the word
    expect(screen.getByText("−14").className).toMatch(/text-red-600/); // number in red beside it
  });
  it("shows the override badge with provenance, and no drift badge", () => {
    render(<FinalCell rec={{ ...base, final: 200, overridden: true, drifted: true }}
      override={{ asin: "B0", sku: "S", qty: 200, note: "client ask", setBy: "ana@x.com", setAt: "2026-10-01T09:00:00.000Z" }}
      editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("override")).toBeTruthy();
    expect(screen.queryByText("drift")).toBeNull();
    expect(screen.getByTitle(/Set by ana@x\.com on 2026-10-01 · live calc 80 · client ask/)).toBeTruthy();
  });
  it("editors can save a new value", async () => {
    const onSave = vi.fn(async () => null);
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "promo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(150, "promo"));
  });
  it("rejects a non-integer without calling onSave", () => {
    const onSave = vi.fn(async () => null);
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Whole number required")).toBeTruthy();
  });
  it("recovers when onSave rejects", async () => {
    const onSave = vi.fn(async () => { throw new Error("net"); });
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "promo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Could not save/);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("requires a reason to save an override, and shows the calculated result while editing", () => {
    const onSave = vi.fn(async () => null);
    render(<FinalCell rec={base} override={undefined} editable onSave={onSave} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit final/i }));
    expect(screen.getByText("Calculated result")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Final quantity"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Add a reason for the override")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an override shows the calculated result struck through, the definitive number, and the reason", () => {
    const rec = { ...base, final: 22, overridden: true };
    const override = { asin: "B0", sku: "S", qty: 22, note: "Launch push", setBy: "a@b.c", setAt: "2026-10-08T00:00:00.000Z" };
    render(<FinalCell rec={rec} override={override} editable onSave={vi.fn()} onClear={vi.fn()} />);
    const calc = screen.getByText(String(base.liveCalc));
    expect(calc.className).toMatch(/line-through/);
    expect(calc.className).toMatch(/font-bold/); // same weight as the result, no muted "calculated" label
    expect(screen.queryByText(/calculated/)).toBeNull();
    // line 1 is the calculated number; line 2 is the chips then the override
    expect(calc.parentElement?.firstElementChild).toBe(calc);
    const line2 = calc.nextElementSibling as HTMLElement;
    expect(Array.from(line2.children).map((e) => e.textContent)).toEqual(["", "override", "22"]); // "" = pencil
    expect(screen.getByText("22")).toBeTruthy();
    expect(screen.getByText("“Launch push”")).toBeTruthy();
  });

  it("the struck calculated number is red when negative", () => {
    const rec = { ...base, liveCalc: -21, final: 22, overridden: true };
    const override = { asin: "B0", sku: "S", qty: 22, note: "x", setBy: "a@b.c", setAt: "2026-10-08T00:00:00.000Z" };
    render(<FinalCell rec={rec} override={override} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("-21").className).toMatch(/text-red-600/);
  });

  it("result number: green when positive, red when negative, plain at 0", () => {
    const { unmount } = render(<FinalCell rec={base} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("80").className).toMatch(/text-brand-green/);
    unmount();
    const r2 = render(<FinalCell rec={{ ...base, liveCalc: -14, final: -14, isOverstock: true }} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("−14").className).toMatch(/text-red-600/);
    r2.unmount();
    render(<FinalCell rec={{ ...base, liveCalc: 0, final: 0 }} override={undefined} editable={false} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText("0").className).not.toMatch(/green|red/);
  });
});

