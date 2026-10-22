import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FieldEditor } from "./field-editor";

describe("FieldEditor", () => {
  it("prefills the text, counts characters against the limit, saves only a real change", async () => {
    const onSave = vi.fn(async () => {});
    render(<FieldEditor value="old" max={5} onSave={onSave} />);
    const box = screen.getByRole("textbox", { name: "Edit text" }) as HTMLTextAreaElement;
    expect(box.value).toBe("old");
    const save = screen.getByRole("button", { name: "Save edit" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "too long" } });
    expect(screen.getByText("8 / 5")).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("too long"));
  });
  it("Reset puts the original text back", () => {
    render(<FieldEditor value="old" onSave={async () => {}} />);
    const box = screen.getByRole("textbox", { name: "Edit text" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(box.value).toBe("old");
  });
});

describe("FieldEditor suggest mode", () => {
  it("is labelled as a suggestion for the client", async () => {
    const onSave = vi.fn(async () => {});
    render(<FieldEditor value="old" mode="suggest" onSave={onSave} />);
    expect(screen.getByText("Suggest an edit")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Edit text" }), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("new"));
  });
});

describe("FieldEditor byte limit (backend search terms)", () => {
  it("can't save over a byte limit; shows why; saves once back under", async () => {
    const onSave = vi.fn(async () => {});
    render(<FieldEditor value="dog" max={10} bytes onSave={onSave} />);
    const box = screen.getByRole("textbox", { name: "Edit text" });
    const save = screen.getByRole("button", { name: "Save edit" }) as HTMLButtonElement;
    fireEvent.change(box, { target: { value: "dog charcoal toxin" } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Over the 10-byte limit/)).toBeTruthy();
    fireEvent.change(box, { target: { value: "dog vial" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("dog vial"));
  });
});

describe("FieldEditor hard character limit (bullets)", () => {
  it("can't save or send a bullet over 200 characters; warns only when not hard", async () => {
    const onSave = vi.fn(async () => {});
    const { unmount } = render(<FieldEditor value="old" max={5} hard mode="suggest" onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit text" }), { target: { value: "too long" } });
    expect((screen.getByRole("button", { name: "Send suggestion" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Over the 5-character limit/)).toBeTruthy();
    unmount();
    render(<FieldEditor value="old" max={5} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit text" }), { target: { value: "too long" } });
    expect((screen.getByRole("button", { name: "Save edit" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
