import { describe, it, expect, vi } from "vitest";
import { callClaudeJson, type ClaudeCallResult } from "@/lib/seo/claude-client";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: '```json\n{"ok":true,"value":42}\n```' }],
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 5000,
            cache_read_input_tokens: 0,
            output_tokens: 200,
          },
          model: "claude-sonnet-4-6",
        }),
      };
    },
  };
});

describe("callClaudeJson", () => {
  it("returns parsed JSON + usage + cost + model", async () => {
    const r: ClaudeCallResult<{ ok: boolean; value: number }> = await callClaudeJson({
      systemPromptCached: "You are a JSON-only assistant.",
      userPrompt: "Return { ok: true, value: 42 }",
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
    });
    expect(r.parsed).toEqual({ ok: true, value: 42 });
    expect(r.usage.input_tokens).toBe(100);
    expect(r.usage.cache_creation_input_tokens).toBe(5000);
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(r.costUsd).toBeGreaterThan(0);
  });
});
