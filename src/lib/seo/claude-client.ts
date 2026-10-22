// Anthropic SDK wrapper with prompt caching enabled on the system prompt.
// Returns parsed JSON payload + usage + computed USD cost.

import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd, type Usage } from "@/lib/seo/pricing";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  _client = new Anthropic({ apiKey });
  return _client;
}

export type ClaudeCallOpts = {
  systemPromptCached: string;       // sent with cache_control: ephemeral
  userPrompt: string;
  model: string;                    // claude-sonnet-4-6 | claude-haiku-4-5-20251001
  maxTokens?: number;
};

export type ClaudeCallResult<T = unknown> = {
  parsed: T;
  rawText: string;
  usage: Usage;
  model: string;
  costUsd: number;
};

export async function callClaudeJson<T = unknown>(
  opts: ClaudeCallOpts
): Promise<ClaudeCallResult<T>> {
  const res = await client().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: [
      { type: "text", text: opts.systemPromptCached, cache_control: { type: "ephemeral" } },
    ] as any, // SDK accepts this; cast for older type defs
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const rawText = (res.content?.[0] as { type: string; text?: string })?.text ?? "";
  const usage: Usage = {
    input_tokens: res.usage.input_tokens ?? 0,
    cache_creation_input_tokens: (res.usage as any).cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: (res.usage as any).cache_read_input_tokens ?? 0,
    output_tokens: res.usage.output_tokens ?? 0,
  };
  const costUsd = computeCostUsd(res.model, usage);
  return {
    parsed: extractJson<T>(rawText),
    rawText,
    usage,
    model: res.model,
    costUsd,
  };
}

function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("Claude response had no JSON object");
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Claude response had no complete JSON object");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
