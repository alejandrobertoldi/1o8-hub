// Anthropic published rates (first-party API) as of 2026-11. Update when rates change.
// cache_write = 5-minute cache writes (1.25x input).
// All values in USD per 1M tokens.

export type ModelRate = {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
};

export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-fable-5-2": { input: 8, output: 40, cache_write: 10, cache_read: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cache_write: 5, cache_read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_write: 2.5, cache_read: 0.1 },
  // Haiku 5.5: prompts up to 100K tokens (longer prompts cost $0.50 / $2.50).
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_write: 0.125, cache_read: 0.01 },
  "claude-opus-4-7": { input: 5, output: 25, cache_write: 6.25, cache_read: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cache_write: 6.25, cache_read: 0.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 },
};

export type Usage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

export function computeCostUsd(model: string, usage: Usage): number {
  const rate = MODEL_RATES[model];
  if (!rate) throw new Error(`unknown model: ${model}`);
  const per = 1_000_000;
  return (
    (usage.input_tokens * rate.input) / per +
    (usage.cache_creation_input_tokens * rate.cache_write) / per +
    (usage.cache_read_input_tokens * rate.cache_read) / per +
    (usage.output_tokens * rate.output) / per
  );
}
