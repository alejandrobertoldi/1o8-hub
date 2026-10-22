import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentAnchor } from "./comment-anchor";

const setup = (over: Partial<Parameters<typeof CommentAnchor>[0]> = {}) => {
  const props = { label: "Bullet 2", count: 0, active: false, onOpen: vi.fn(), onClose: vi.fn(), thread: <p>THREAD</p>, ...over };
  render(<div><CommentAnchor {...props}><span>bullet text</span></CommentAnchor><p>outside</p></div>);
  return props;
};

describe("CommentAnchor", () => {
  it("clicking the text or the 💬 button opens it", () => {
    const p = setup();
    fireEvent.click(screen.getByText("bullet text"));
    fireEvent.click(screen.getByRole("button", { name: "Comment on Bullet 2" }));
    expect(p.onOpen).toHaveBeenCalledTimes(2);
  });
  it("shows the thread only while active", () => {
    setup();
    expect(screen.queryByText("THREAD")).toBeNull();
  });
  it("active: thread under the text; Esc, ✕ and a click outside close it; clicks inside don't", () => {
    const p = setup({ active: true });
    expect(screen.getByText("THREAD")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("THREAD"));
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(screen.getByText("outside"));
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });
  it("shows the open-comment count on the badge", () => {
    setup({ count: 2 });
    expect(screen.getByRole("button", { name: "Comment on Bullet 2" }).textContent).toContain("2");
  });
});
