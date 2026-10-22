import { describe, it, expect } from "vitest";
import {
  namesMatch,
  reviewPermissions,
  nextReviewStatus,
  reviewStatusLabel,
  isWaitingForReviewer,
  canSend,
  pipelineSteps,
  pipelineCurrentIndex,
} from "./review";

const empty = { pm: false, am: false, jake: false, override: false };

describe("namesMatch", () => {
  it("matches case and extra whitespace", () => {
    expect(namesMatch("Alex Moreno", "alex  moreno")).toBe(true);
    expect(namesMatch("Alex Moreno", "Alex Moreno")).toBe(true);
  });

  it("rejects missing or different names", () => {
    expect(namesMatch("Alex Moreno", null)).toBe(false);
    expect(namesMatch(null, "Alex Moreno")).toBe(false);
    expect(namesMatch("Alex Moreno", "Manu Lancharro")).toBe(false);
    expect(namesMatch("  ", "Alex Moreno")).toBe(false);
  });
});

describe("reviewPermissions", () => {
  it("flags PM and AM independently, plus admin override", () => {
    expect(reviewPermissions({
      userName: "Alex Moreno",
      projectManager: "Alex Moreno",
      accountManager: "Manu Lancharro",
      canOverride: false,
    })).toEqual({ pm: true, am: false, jake: false, override: false });

    expect(reviewPermissions({
      userName: "Manu Lancharro",
      projectManager: "Alex Moreno",
      accountManager: "Manu Lancharro",
      canOverride: true,
    })).toEqual({ pm: false, am: true, jake: false, override: true });
  });

  it("flags Jake by email, not by client AM/PM name", () => {
    expect(reviewPermissions({
      userName: "Jake Kosten",
      userEmail: "jake@marketfoundry.agency",
      projectManager: "Sara Khan",
      accountManager: "Aqib Abbasi",
      canOverride: false,
    }).jake).toBe(true);
    expect(reviewPermissions({
      userName: "Aqib Abbasi",
      userEmail: "aqib@marketfoundry.agency",
      projectManager: "Sara Khan",
      accountManager: "Aqib Abbasi",
      canOverride: false,
    }).jake).toBe(false);
  });
});

describe("nextReviewStatus", () => {
  const pm = { ...empty, pm: true };
  const am = { ...empty, am: true };
  const jake = { ...empty, jake: true };
  const both = { ...empty, pm: true, am: true };
  const override = { ...empty, override: true };

  it("PM approve moves generated → am_review", () => {
    expect(nextReviewStatus("generated", "approve", pm)).toEqual({ ok: true, status: "am_review" });
    expect(nextReviewStatus("pm_review", "approve", pm)).toEqual({ ok: true, status: "am_review" });
  });

  it("AM cannot approve another person's PM queue", () => {
    expect(nextReviewStatus("generated", "approve", am)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for PM review",
    });
    expect(nextReviewStatus("pm_review", "approve", am)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for PM review",
    });
  });

  it("AM approve moves am_review → jake_review", () => {
    expect(nextReviewStatus("am_review", "approve", am)).toEqual({ ok: true, status: "jake_review" });
  });

  it("CEO can only approve at jake_review, not earlier stages", () => {
    expect(nextReviewStatus("generated", "approve", jake)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for PM review",
    });
    expect(nextReviewStatus("am_review", "approve", jake)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for AM review",
    });
    expect(nextReviewStatus("jake_review", "approve", jake)).toEqual({ ok: true, status: "ready" });
  });

  it("PM cannot approve at the AM step", () => {
    const result = nextReviewStatus("am_review", "approve", pm);
    expect(result).toEqual({ ok: false, statusCode: 403, error: "Waiting for AM review" });
  });

  it("AM cannot approve at the Jake step", () => {
    const result = nextReviewStatus("jake_review", "approve", am);
    expect(result).toEqual({ ok: false, statusCode: 403, error: "Waiting for CEO review" });
  });

  it("send back from AM returns to generated; from Jake returns to AM", () => {
    expect(nextReviewStatus("generated", "send_back", pm)).toEqual({ ok: true, status: "generated" });
    expect(nextReviewStatus("am_review", "send_back", am)).toEqual({ ok: true, status: "generated" });
    expect(nextReviewStatus("jake_review", "send_back", jake)).toEqual({ ok: true, status: "am_review" });
  });

  it("the same person as PM and AM still takes two approves", () => {
    expect(nextReviewStatus("generated", "approve", both)).toEqual({ ok: true, status: "am_review" });
    expect(nextReviewStatus("am_review", "approve", both)).toEqual({ ok: true, status: "jake_review" });
  });

  it("admin override cannot approve another person's queue", () => {
    expect(nextReviewStatus("generated", "approve", override)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for PM review",
    });
    expect(nextReviewStatus("am_review", "approve", override)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for AM review",
    });
    expect(nextReviewStatus("jake_review", "approve", override)).toEqual({
      ok: false, statusCode: 403, error: "Waiting for CEO review",
    });
  });

  it("rejects review once the letter is ready or sent", () => {
    expect(nextReviewStatus("ready", "approve", override)).toMatchObject({ ok: false, statusCode: 409 });
    expect(nextReviewStatus("sent", "send_back", override)).toMatchObject({ ok: false, statusCode: 409 });
  });
});

describe("reviewStatusLabel", () => {
  it("names the waiting reviewer", () => {
    expect(reviewStatusLabel("generated")).toBe("PM review");
    expect(reviewStatusLabel("pm_review")).toBe("PM review");
    expect(reviewStatusLabel("am_review")).toBe("AM review");
    expect(reviewStatusLabel("jake_review")).toBe("CEO review");
    expect(reviewStatusLabel("ready")).toBe("Ready to send");
    expect(reviewStatusLabel("sent")).toBe("Sent");
  });
});

describe("isWaitingForReviewer", () => {
  const pm = { ...empty, pm: true };
  const am = { ...empty, am: true };
  const jake = { ...empty, jake: true };

  it("is true only for the stage that person can act on", () => {
    expect(isWaitingForReviewer("generated", pm)).toBe(true);
    expect(isWaitingForReviewer("am_review", pm)).toBe(false);
    expect(isWaitingForReviewer("am_review", am)).toBe(true);
    expect(isWaitingForReviewer("generated", am)).toBe(false);
    expect(isWaitingForReviewer("jake_review", jake)).toBe(true);
    expect(isWaitingForReviewer("generated", jake)).toBe(false);
    expect(isWaitingForReviewer("am_review", jake)).toBe(false);
    expect(isWaitingForReviewer("jake_review", am)).toBe(false);
    expect(isWaitingForReviewer("ready", jake)).toBe(false);
    expect(isWaitingForReviewer("ready", pm)).toBe(false);
    expect(isWaitingForReviewer("generated", { ...empty, override: true })).toBe(false);
    expect(isWaitingForReviewer("jake_review", { ...empty, override: true })).toBe(false);
  });
});

describe("canSend", () => {
  const pm = { ...empty, pm: true };
  const am = { ...empty, am: true };
  const jake = { ...empty, jake: true };
  const override = { ...empty, override: true };

  it("is Jake after ready, and a retry after failed", () => {
    expect(canSend("ready", jake)).toBe(true);
    expect(canSend("failed", jake)).toBe(true);
    expect(canSend("ready", override)).toBe(false);
    expect(canSend("failed", override)).toBe(false);
  });

  it("rejects AM, PM, and earlier statuses", () => {
    expect(canSend("ready", pm)).toBe(false);
    expect(canSend("ready", am)).toBe(false);
    expect(canSend("am_review", am)).toBe(false);
    expect(canSend("jake_review", jake)).toBe(false);
    expect(canSend("generated", override)).toBe(false);
    expect(canSend("sent", jake)).toBe(false);
  });
});

describe("pipelineSteps", () => {
  it("marks PM as current on a fresh generate", () => {
    expect(pipelineCurrentIndex("generated")).toBe(1);
    const steps = pipelineSteps("generated");
    expect(steps.map((s) => s.state)).toEqual([
      "complete", "current", "upcoming", "upcoming", "upcoming",
    ]);
  });

  it("walks AM then Jake then send", () => {
    expect(pipelineSteps("am_review").map((s) => s.state)).toEqual([
      "complete", "complete", "current", "upcoming", "upcoming",
    ]);
    expect(pipelineSteps("jake_review").map((s) => s.state)).toEqual([
      "complete", "complete", "complete", "current", "upcoming",
    ]);
    expect(pipelineSteps("ready").map((s) => s.state)).toEqual([
      "complete", "complete", "complete", "complete", "current",
    ]);
    expect(pipelineSteps("sent").map((s) => s.state)).toEqual([
      "complete", "complete", "complete", "complete", "complete",
    ]);
  });

  it("flags a failed send on the last step", () => {
    expect(pipelineSteps("failed").at(-1)?.state).toBe("error");
  });
});
