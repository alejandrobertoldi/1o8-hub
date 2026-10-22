import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("presses on pointer-down with a 100ms ease-out", () => {
    const classes = buttonVariants();
    expect(classes).toContain("active:scale-[0.97]");
    expect(classes).toContain("duration-100");
    expect(classes).toContain("ease-out");
    expect(classes).toContain("motion-reduce:active:scale-100");
  });

  it("uses the DESIGN.md pill layout", () => {
    const classes = buttonVariants();
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("h-9");
    expect(classes).toContain("px-3");
    expect(classes).toContain("text-[13px]");
    expect(classes).toContain("leading-none");
    expect(classes).toContain("gap-1.5");
    expect(classes).toContain("bg-black");
  });

  it("does not squash text links", () => {
    expect(buttonVariants({ variant: "link" })).toContain(
      "data-[variant=link]:active:scale-100",
    );
  });
});
