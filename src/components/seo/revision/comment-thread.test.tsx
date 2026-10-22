import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CommentThread } from "./comment-thread";
import { editNote } from "@/lib/seo/revision-edit";

const base = { id: "C1", authorName: "Manu", createdAt: "2026-10-02T09:32:05Z", resolved: false, audience: "internal" };

describe("CommentThread edit notes", () => {
  it("shows an edit note as a diff: removed struck out, added highlighted", () => {
    render(<CommentThread comments={[{ ...base, body: editNote("Bullet 5", "so the 3-pack covers", "so the pack covers", "Manu") }]} onAdd={async () => {}} allowAudience readOnly />);
    expect(screen.getByText(/Edited by Manu/)).toBeTruthy();
    expect(screen.getByText("3-pack", { exact: false, selector: "del" })).toBeTruthy();
    expect(screen.getByText("pack", { exact: false, selector: "ins" })).toBeTruthy();
    expect(screen.queryByText(/^Before:/)).toBeNull();
  });
  it("a resolved edit note is not faded; a resolved ordinary comment is", () => {
    const { container } = render(<CommentThread comments={[
      { ...base, id: "E", resolved: true, body: editNote("Bullet 5", "a", "b", "Manu") },
      { ...base, id: "O", resolved: true, body: "done" },
    ]} onAdd={async () => {}} allowAudience readOnly />);
    const cards = [...container.querySelectorAll(".rounded-lg.border")];
    expect(cards[0].className).not.toContain("opacity-60");
    expect(cards[1].className).toContain("opacity-60");
  });
  it("ordinary comments render as plain text", () => {
    render(<CommentThread comments={[{ ...base, body: "Please shorten" }]} onAdd={async () => {}} allowAudience readOnly />);
    expect(screen.getByText("Please shorten")).toBeTruthy();
  });
});

import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { suggestionNote } from "@/lib/seo/revision-edit";

describe("CommentThread client suggestions", () => {
  const sugg = { ...base, id: "S1", authorName: "Maria", audience: "client", body: suggestionNote("so the 3-pack covers", "so the pack covers") };
  it("Hub: shows the diff with Accept / Decline while open", async () => {
    const onAccept = vi.fn(async () => {}); const onDecline = vi.fn(async () => {});
    render(<CommentThread comments={[sugg]} currentText="so the 3-pack covers" onAcceptSuggestion={onAccept} onDeclineSuggestion={onDecline} onAdd={async () => {}} allowAudience readOnly={false} />);
    expect(screen.getByText(/Suggested edit/)).toBeTruthy();
    expect(screen.getByText("3-pack", { exact: false, selector: "del" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("S1");
    // Both buttons stay disabled while the first action runs
    await waitFor(() => expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onDecline).toHaveBeenCalledWith("S1");
  });
  it("client view: no buttons, shows Pending / Accepted / Declined", () => {
    const { rerender } = render(<CommentThread comments={[sugg]} currentText="so the 3-pack covers" onAdd={async () => {}} allowAudience={false} readOnly={false} />);
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByText(/Pending review/)).toBeTruthy();
    rerender(<CommentThread comments={[{ ...sugg, resolved: true }]} currentText="so the pack covers" onAdd={async () => {}} allowAudience={false} readOnly={false} />);
    expect(screen.getByText(/Accepted/)).toBeTruthy();
    rerender(<CommentThread comments={[{ ...sugg, resolved: true }]} currentText="other" onAdd={async () => {}} allowAudience={false} readOnly={false} />);
    expect(screen.getByText(/Declined/)).toBeTruthy();
  });
});
