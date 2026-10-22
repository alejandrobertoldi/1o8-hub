import { describe, it, expect } from "vitest";
import { showBatchStack, batchCardStartsOpen } from "./s6-batch-stack";

describe("showBatchStack", () => {
  it("hides the stack on the pre-batch config step", () => {
    expect(showBatchStack("config")).toBe(false);
  });

  it("shows the stack on every batch step", () => {
    for (const s of ["batch-titles", "batch-bullets", "batch-description", "batch-backend"]) {
      expect(showBatchStack(s)).toBe(true);
    }
  });

  it("keeps the stack on the steps after the batches", () => {
    for (const s of ["audit", "aplus-qa", "final"]) {
      expect(showBatchStack(s)).toBe(true);
    }
  });
});

describe("batchCardStartsOpen", () => {
  it("opens the card for the current batch step even when approved", () => {
    expect(batchCardStartsOpen("batch-bullets", "bullets", "approved")).toBe(true);
  });

  it("opens any batch that is not approved yet", () => {
    expect(batchCardStartsOpen("audit", "description", "review")).toBe(true);
    expect(batchCardStartsOpen("audit", "backend", "pending")).toBe(true);
  });

  it("starts every approved card closed on the audit step", () => {
    for (const k of ["titles", "bullets", "description", "backend"]) {
      expect(batchCardStartsOpen("audit", k, "approved")).toBe(false);
    }
  });

  it("keeps an approved card closed when a different batch is the current step", () => {
    expect(batchCardStartsOpen("batch-description", "titles", "approved")).toBe(false);
  });
});

import { s6SectionState, s6SectionStartsOpen } from "./s6-batch-stack";

const allApproved = { titles: "approved", bullets: "approved", description: "approved", backend: "approved" };
const noneStarted = { titles: "pending", bullets: "pending", description: "pending", backend: "pending" };
const midway = { titles: "approved", bullets: "review", description: "pending", backend: "pending" };

describe("s6SectionState", () => {
  it("S6.1 is current on the config step, done once you move on", () => {
    expect(s6SectionState("config", { step: "config", batchStatuses: noneStarted, isApproved: false })).toBe("current");
    expect(s6SectionState("config", { step: "batch-titles", batchStatuses: noneStarted, isApproved: false })).toBe("done");
  });

  it("S6.6–S6.8 are locked until all four batches are approved", () => {
    for (const k of ["audit", "aplus-qa", "final"] as const) {
      expect(s6SectionState(k, { step: "batch-bullets", batchStatuses: midway, isApproved: false })).toBe("locked");
    }
  });

  it("with all batches approved: the current step is current, later ones pending, earlier ones done", () => {
    const ctx = { step: "aplus-qa", batchStatuses: allApproved, isApproved: false };
    expect(s6SectionState("audit", ctx)).toBe("done");
    expect(s6SectionState("aplus-qa", ctx)).toBe("current");
    expect(s6SectionState("final", ctx)).toBe("pending");
  });

  it("once S6 is locked (approved), audit, Q&A and final are all done", () => {
    const ctx = { step: "final", batchStatuses: allApproved, isApproved: true };
    expect(s6SectionState("audit", ctx)).toBe("done");
    expect(s6SectionState("aplus-qa", ctx)).toBe("done");
    // Locked means S6.8 is finished, even though the page sits on the final step
    expect(s6SectionState("final", ctx)).toBe("done");
    expect(s6SectionState("final", { ...ctx, step: "audit" })).toBe("done");
  });
});

describe("s6SectionStartsOpen", () => {
  it("only the current section starts open; done, pending and locked start closed", () => {
    expect(s6SectionStartsOpen("audit", "current", false)).toBe(true);
    expect(s6SectionStartsOpen("audit", "done", false)).toBe(false);
    expect(s6SectionStartsOpen("aplus-qa", "pending", false)).toBe(false);
    expect(s6SectionStartsOpen("final", "locked", false)).toBe(false);
  });

  it("S6.8 stays open once S6 is locked — it holds Export and Push", () => {
    expect(s6SectionStartsOpen("final", "done", true)).toBe(true);
  });
});

describe("S6.9 review & share", () => {
  it("is locked until S6.8 is saved and locked", () => {
    expect(s6SectionState("review", { step: "final", batchStatuses: allApproved, isApproved: false })).toBe("locked");
  });
  it("is current while the review runs (whatever the step), done once a revision is approved", () => {
    expect(s6SectionState("review", { step: "review", batchStatuses: allApproved, isApproved: true })).toBe("current");
    expect(s6SectionState("review", { step: "final", batchStatuses: allApproved, isApproved: true })).toBe("current");
    expect(s6SectionState("review", { step: "final", batchStatuses: allApproved, isApproved: true, reviewApproved: true })).toBe("done");
    expect(s6SectionStartsOpen("review", "pending", true)).toBe(true);
    expect(s6SectionStartsOpen("review", "locked", false)).toBe(false);
  });
  it("being on the review step marks audit and Q&A done", () => {
    expect(s6SectionState("audit", { step: "review", batchStatuses: allApproved, isApproved: false })).toBe("done");
  });
});

describe("S6.10 push content", () => {
  it("is locked until S6 is locked, pending until a revision is approved, then current, done after a push", () => {
    const base = { batchStatuses: allApproved, isApproved: true };
    expect(s6SectionState("push", { ...base, step: "final", isApproved: false })).toBe("locked");
    expect(s6SectionState("push", { ...base, step: "final" })).toBe("pending");
    expect(s6SectionState("push", { ...base, step: "final", reviewApproved: true })).toBe("current");
    expect(s6SectionState("push", { ...base, step: "final", reviewApproved: true, pushed: true })).toBe("done");
  });
  it("starts open once S6 is locked", () => {
    expect(s6SectionStartsOpen("push", "pending", true)).toBe(true);
    expect(s6SectionStartsOpen("push", "done", true)).toBe(true);
  });
});

import { lockState } from "./s6-batch-stack";

describe("lockState (card pills)", () => {
  it("finished = locked; everything else = unlocked", () => {
    for (const s of ["approved", "done"]) expect(lockState(s)).toBe("locked");
    for (const s of ["pending", "review", "revision", "generating", "current", "locked"]) expect(lockState(s)).toBe("unlocked");
  });
});
