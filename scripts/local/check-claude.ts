/**
 * Checks the Claude API key in .env.local (never prints it): lists models
 * (free), then sends one tiny message with the model the client report writer
 * uses and prints the reply, tokens and cost (a fraction of a cent).
 *
 *   npm run claude:check
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_DEFAULTS } from "@/lib/ai-config";
import { computeCostUsd } from "@/lib/seo/pricing";

async function main() {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing from .env.local");
  console.log(`Key: ${key.slice(0, 10)}… (${key.length} chars)`);
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });

  const models = await client.models.list({ limit: 20 });
  const ids = models.data.map((m) => m.id);
  console.log(`✓ Key accepted. Models it can use: ${ids.join(", ")}`);

  const model = AI_DEFAULTS.client_report_writer.model;
  if (!ids.includes(model)) console.log(`! ${model} is not in the first page of models; trying it anyway.`);
  const res = await client.messages.create({
    model,
    max_tokens: 200,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with one short sentence confirming you can write monthly client reports for 1o8." }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const usage = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  };
  console.log(`✓ ${res.model} answered (${res.stop_reason}): "${text}"`);
  console.log(`  ${usage.input_tokens} in / ${usage.output_tokens} out tokens ≈ $${computeCostUsd(res.model, usage).toFixed(5)}`);
}

main().catch((e) => {
  if (e instanceof Anthropic.AuthenticationError) console.error("✗ The key was rejected (invalid or revoked).");
  else if (e instanceof Anthropic.PermissionDeniedError) console.error("✗ The key has no access to this model or organization.");
  else if (e instanceof Anthropic.APIError) console.error(`✗ Anthropic answered ${e.status}: ${e.message}`);
  else console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
