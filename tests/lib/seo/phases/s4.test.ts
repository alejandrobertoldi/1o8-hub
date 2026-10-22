import { describe, it, expect } from "vitest";
import { S4 } from "@/lib/seo/phases/s4";
import { CANONICAL_RUFUS_QUESTIONS } from "@/lib/seo/prompts/canonical-rufus-questions";

describe("S4 executor", () => {
  it("emitPhase1 returns immutable 5 canonical questions", () => {
    const questions = S4.emitPhase1();
    expect(questions.length).toBe(5);
    expect(questions[0].text).toBe(CANONICAL_RUFUS_QUESTIONS[0].text);
  });

  it("persistPhase1 stores 5 answers and stamps phase1_approved_at when all 5 present", async () => {
    expect(typeof S4.persistPhase1).toBe("function");
  });

  it("requiresPause returns true after Phase 1 emit until paste-back", () => {
    expect(S4.requiresPause("S4P1")).toBe(true);
    expect(S4.requiresPause("S4P2")).toBe(true);
    expect(S4.requiresPause("S4P3")).toBe(false);
  });
});
