// Anthropic published rates as of 2026-05. Update when rates change.
// All values in USD per 1M tokens.

export type ModelRate = {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
};

export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cache_write: 1, cache_read: 0.08 },
  "claude-opus-4-7": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
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
