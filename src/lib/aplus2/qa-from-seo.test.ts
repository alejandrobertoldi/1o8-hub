import { describe, it, expect } from "vitest";
import {
  candidateAsins,
  subsetToItems,
  pickQaRow,
  aplusQAToSubset,
  QA_QUESTION_MAX,
  QA_ANSWER_MAX,
} from "./qa-from-seo";

describe("candidateAsins", () => {
  it("dedupes and drops empties, scopeIdentifier first", () => {
    expect(
      candidateAsins({ scopeIdentifier: "B01", coveredAsins: ["B02", "B01", "", "B03"] })
    ).toEqual(["B01", "B02", "B03"]);
  });
  it("handles null coveredAsins", () => {
    expect(candidateAsins({ scopeIdentifier: "B01", coveredAsins: null })).toEqual(["B01"]);
  });
});

describe("subsetToItems", () => {
  it("maps pairs to qa item data", () => {
    const { items, truncated } = subsetToItems([{ id: "1", question: "Q?", answer: "A." }]);
    expect(items).toEqual([{ type: "qa", question: "Q?", answer: "A." }]);
    expect(truncated).toBe(false);
  });
  it("truncates overlong text and flags it", () => {
    const longQ = "x".repeat(QA_QUESTION_MAX + 5);
    const longA = "y".repeat(QA_ANSWER_MAX + 5);
    const { items, truncated } = subsetToItems([{ id: "1", question: longQ, answer: longA }]);
    expect(items[0].question).toHaveLength(QA_QUESTION_MAX);
    expect(items[0].answer).toHaveLength(QA_ANSWER_MAX);
    expect(truncated).toBe(true);
  });
});

describe("aplusQAToSubset", () => {
  it("maps S6.7 _aplusQA pairs to subset shape with synthetic ids", () => {
    expect(
      aplusQAToSubset([
        { q: "How many vials?", a: "Three vials cover a multi-pet home." },
        { q: "Picky eater?", a: "Mixes cleanly into wet food." },
      ])
    ).toEqual([
      { id: "1", question: "How many vials?", answer: "Three vials cover a multi-pet home." },
      { id: "2", question: "Picky eater?", answer: "Mixes cleanly into wet food." },
    ]);
  });
  it("trims whitespace and skips pairs missing q or a", () => {
    expect(
      aplusQAToSubset([
        { q: "  Q1?  ", a: "  A1.  " },
        { q: "", a: "orphan answer" },
        { q: "orphan question", a: "" },
      ])
    ).toEqual([{ id: "1", question: "Q1?", answer: "A1." }]);
  });
  it("returns an empty array for null/empty input", () => {
    expect(aplusQAToSubset(null)).toEqual([]);
    expect(aplusQAToSubset([])).toEqual([]);
  });
});

describe("pickQaRow", () => {
  const rows = [
    { asin: "B02", asinId: "a2", subset: [{ id: "1", question: "q", answer: "a" }] },
    { asin: "B01", asinId: "a1", subset: [{ id: "2", question: "q", answer: "a" }] },
  ];
  it("prefers the scopeIdentifier match", () => {
    expect(pickQaRow(rows, "B01")?.asinId).toBe("a1");
  });
  it("falls back to first row with a non-empty subset", () => {
    expect(pickQaRow(rows, "B99")?.asinId).toBe("a2");
  });
  it("returns null when no row has a subset", () => {
    expect(pickQaRow([{ asin: "B01", asinId: "a1", subset: [] }], "B01")).toBeNull();
  });
});
