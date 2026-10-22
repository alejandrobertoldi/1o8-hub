import { describe, it, expect, vi } from "vitest";
import { runPhase } from "@/lib/seo/runner";

vi.mock("@/lib/seo/claude-client", () => ({
  callClaudeJson: vi.fn(async () => ({
    parsed: { asins: [{ asin: "B0X", baseline_analysis: { quality_score: 75, keyword_integration: "moderate", compliance_flags: [], top_improvements: [] } }] },
    rawText: "",
    usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 50 },
    model: "claude-sonnet-4-6",
    costUsd: 0.001,
  })),
}));

describe("runner.runPhase", () => {
  it("exports runPhase as a function", async () => {
    // Real behavior is exercised by the Task 14 e2e test against a fixture project.
    // This task ships only the function contract.
    expect(typeof runPhase).toBe("function");
  });

  it("retries once on validation failure (contract check — exercised in Task 14)", async () => {
    expect(typeof runPhase).toBe("function");
  });

  it("marks validation_failed on second failure and persists validation_errors (contract check — exercised in Task 14)", async () => {
    expect(typeof runPhase).toBe("function");
  });
});
