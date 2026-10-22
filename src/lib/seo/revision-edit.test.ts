import { describe, it, expect } from "vitest";
import { canEditRevision, editNote, withEditedField } from "./revision-edit";

describe("revision-edit", () => {
  it("only PM and AM review allow editing", () => {
    expect(canEditRevision("pm_review")).toBe(true);
    expect(canEditRevision("am_review")).toBe(true);
    for (const s of ["client_review", "approved", "changes_requested"]) expect(canEditRevision(s)).toBe(false);
  });
  it("updates the field and keeps its char/byte counts in sync, leaving other keys alone", () => {
    const gc = { DetailedBulletPoint_5: "old", DetailedBulletPoint_5_CharLength: 3, BackendSearchTerms: "a", BackendSearchTerms_ByteLength: 1, Title: "T" };
    expect(withEditedField(gc, "DetailedBulletPoint_5", "new text")).toEqual({ ...gc, DetailedBulletPoint_5: "new text", DetailedBulletPoint_5_CharLength: 8 });
    expect(withEditedField(gc, "BackendSearchTerms", "é")).toMatchObject({ BackendSearchTerms: "é", BackendSearchTerms_ByteLength: 2 });
    expect(withEditedField(null, "Title", "x")).toEqual({ Title: "x" });
  });
  it("the logged note names the editor and shows before → after", () => {
    expect(editNote("Bullet 5", "old", "new", "Manu")).toBe('✎ Edited by Manu\nBefore: "old"\nAfter: "new"');
  });
});

import { parseEditNote, wordDiff } from "./revision-edit";

describe("parseEditNote", () => {
  it("reads back who, before and after from an edit note", () => {
    expect(parseEditNote(editNote("Bullet 5", 'say "hi"', "new", "Manu L"))).toEqual({ by: "Manu L", before: 'say "hi"', after: "new" });
  });
  it("ordinary comments are not edit notes", () => {
    expect(parseEditNote("Too long, please shorten")).toBeNull();
  });
});

describe("wordDiff", () => {
  it("marks removed and added words, keeps the rest", () => {
    const d = wordDiff("so the 3-pack covers repeat scares", "so the pack covers scares");
    expect(d.filter((p) => p.op === "del").map((p) => p.text.trim())).toEqual(["3-pack", "repeat"]);
    expect(d.filter((p) => p.op === "add").map((p) => p.text.trim())).toEqual(["pack"]);
    expect(d.filter((p) => p.op !== "add").map((p) => p.text).join("")).toBe("so the 3-pack covers repeat scares");
    expect(d.filter((p) => p.op !== "del").map((p) => p.text).join("")).toBe("so the pack covers scares");
  });
});

import { parseSuggestion, suggestionNote, suggestionStatus } from "./revision-edit";

describe("client suggestions", () => {
  it("round-trips, and is never mistaken for a staff edit note (or vice versa)", () => {
    const body = suggestionNote('a "b"', "c");
    expect(parseSuggestion(body)).toEqual({ before: 'a "b"', after: "c" });
    expect(parseEditNote(body)).toBeNull();
    expect(parseSuggestion(editNote("x", "a", "b", "Manu"))).toBeNull();
    expect(parseSuggestion("plain comment")).toBeNull();
  });
  it("status: open until resolved; then accepted if the text now matches, else declined", () => {
    expect(suggestionStatus(false, "new", "old")).toBe("open");
    expect(suggestionStatus(true, "new", "new")).toBe("accepted");
    expect(suggestionStatus(true, "new", "old")).toBe("declined");
  });
});

import { sameContent } from "./revision-edit";

describe("sameContent", () => {
  it("equal regardless of key order and surrounding spaces", () => {
    expect(sameContent({ A1: { Title: "t ", BP: "b" } }, { A1: { BP: "b", Title: "t" } })).toBe(true);
  });
  it("any changed field, missing field or missing ASIN differs", () => {
    expect(sameContent({ A1: { Title: "t" } }, { A1: { Title: "u" } })).toBe(false);
    expect(sameContent({ A1: { Title: "t", BP: "b" } }, { A1: { Title: "t" } })).toBe(false);
    expect(sameContent({ A1: { Title: "t" }, B2: { Title: "x" } }, { A1: { Title: "t" } })).toBe(false);
  });
});

import { displayRevisionId } from "./revision-edit";

describe("displayRevisionId", () => {
  const r1 = { id: "r1", status: "approved", isCurrent: true, content: { A1: { Title: "t" } } };
  it("newest normally", () => {
    const r2 = { id: "r2", status: "pm_review", isCurrent: false, content: { A1: { Title: "t" } } };
    expect(displayRevisionId([r2, r1])).toBe("r2");
  });
  it("a closed duplicate of the approved revision → the approved one", () => {
    const r2 = { id: "r2", status: "changes_requested", isCurrent: false, content: { A1: { Title: "t " } } };
    expect(displayRevisionId([r2, r1])).toBe("r1");
  });
  it("changes requested with different text stays on the newest (comments to address)", () => {
    const r2 = { id: "r2", status: "changes_requested", isCurrent: false, content: { A1: { Title: "new" } } };
    expect(displayRevisionId([r2, r1])).toBe("r2");
  });
  it("no approved revision → newest; none → null", () => {
    const r2 = { id: "r2", status: "changes_requested", isCurrent: false, content: { A1: { Title: "t" } } };
    expect(displayRevisionId([r2])).toBe("r2");
    expect(displayRevisionId([])).toBeNull();
  });
});
