import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestableTextInput } from "./suggestable-text-input";

describe("SuggestableTextInput", () => {
  it("stays a text input and lists category options on focus", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <SuggestableTextInput
        id="flavor"
        value=""
        options={["Vanilla", "Chocolate"]}
        onChange={onChange}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole("combobox");
    expect(input.tagName).toBe("INPUT");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Vanilla" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Chocolate" })).toBeInTheDocument();
  });

  it("allows typing a custom value that is not in the category list", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <SuggestableTextInput
        id="flavor"
        value=""
        options={["Vanilla"]}
        onChange={onChange}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Kids Berry Mix" } });
    expect(onChange).toHaveBeenCalledWith("Kids Berry Mix");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalled();
  });
});
