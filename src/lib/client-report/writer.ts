import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { logEventAsync } from "@/lib/event-logger";
import { computeCostUsd, MODEL_RATES } from "@/lib/seo/pricing";
import { outputSchema, systemPrompt, userPrompt } from "./prompt";
import { reportRules, getStyleGuide } from "./style-guide";
import { bulletsToHtml, htmlToPlain, LIST_SECTIONS, paragraphsToHtml, textSectionsFor, type TextSection } from "./text";
import { addTexts, currentTexts } from "./texts-store";
import type { ClientReportData } from "./types";

/**
 * Claude writes (or rewrites) a report's commentary in 1o8's style guide and
 * the result is saved as new text versions. Model, token limit, on/off and
 * extra instructions come from Admin → Configuration ("Client monthly report
 * writer").
 */

export class WriterError extends Error {}

type Actor = { id: string | null; email: string | null; name: string | null };

export async function writeReportTexts(opts: {
  reportId: string;
  data: ClientReportData;
  /** Sections to write; all of the report's sections when empty. */
  keys?: TextSection[];
  instruction?: string;
  actor: Actor;
}) {
  const cfg = await getAiFeatureConfig("client_report_writer");
  if (!cfg.enabled) throw new WriterError("The report writer is switched off in Admin → Configuration.");
  if (!process.env.ANTHROPIC_API_KEY) throw new WriterError("ANTHROPIC_API_KEY is not set.");

  const available = textSectionsFor(opts.data);
  const keys = opts.keys?.length ? opts.keys.filter((k) => available.includes(k)) : available;
  if (!keys.length) throw new WriterError("Nothing to write for this report.");

  const [guide, current, [client]] = await Promise.all([
    getStyleGuide(),
    currentTexts(opts.reportId),
    db
      .select({ raw: aac.rawData })
      .from(aac)
      .where(eq(sql`upper(${aac.clientIdCode})`, opts.data.client.code.toUpperCase()))
      .limit(1),
  ]);
  const raw = (client?.raw ?? {}) as Record<string, string>;
  const context = [raw.Services && `Services 1o8 provides: ${raw.Services}`, raw.Tier && `Tier: ${raw.Tier}`].filter(Boolean).join("\n");
  const currentPlain = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, htmlToPlain(v.html)])) as Partial<Record<TextSection, string>>;

  const started = Date.now();
  const anthropic = new Anthropic({ maxRetries: 1 });
  let res: Anthropic.Message;
  try {
    res = await anthropic.messages.create(
      {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: [{ type: "text", text: systemPrompt(reportRules(guide.text), cfg.systemPrompt), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt({ data: opts.data, keys, context, current: currentPlain, instruction: opts.instruction }) }],
        output_config: { effort: "high", format: { type: "json_schema", schema: outputSchema(keys) } },
        // If the model declines, Anthropic re-runs the request on a fallback model.
        fallbacks: "default",
      } as Anthropic.MessageCreateParamsNonStreaming,
      { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } },
    );
  } catch (e) {
    await logEventAsync({
      userEmail: opts.actor.email,
      userName: opts.actor.name,
      section: "reports",
      action: "claude:client_report",
      status: "error",
      resourceType: "client_report",
      resourceId: opts.reportId,
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    });
    if (e instanceof Anthropic.AuthenticationError) throw new WriterError("Claude rejected the API key.");
    if (e instanceof Anthropic.RateLimitError) throw new WriterError("Claude is busy (rate limit). Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new WriterError(`Claude answered ${e.status}: ${e.message}`);
    throw e;
  }

  const usage = res.usage;
  await logEventAsync({
    userEmail: opts.actor.email,
    userName: opts.actor.name,
    section: "reports",
    action: "claude:client_report",
    resourceType: "client_report",
    resourceId: opts.reportId,
    resourceLabel: `${opts.data.client.code} ${opts.data.period.key}`,
    detail: {
      model: res.model,
      usage,
      keys,
      stopReason: res.stop_reason,
      costUsd: MODEL_RATES[res.model]
        ? computeCostUsd(res.model, {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          })
        : null,
    },
    durationMs: Date.now() - started,
  });

  if (res.stop_reason === "refusal") throw new WriterError("Claude declined to write this report. Try again or write it by hand.");
  if (res.stop_reason === "max_tokens") throw new WriterError("Claude ran out of room. Raise Max tokens in Admin → Configuration.");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: Record<string, { paragraphs?: string[]; items?: string[] }>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WriterError("Claude's answer couldn't be read. Try again.");
  }

  const rows = keys
    .map((k) => {
      const v = parsed[k];
      const html = LIST_SECTIONS.includes(k) ? bulletsToHtml(v?.items ?? []) : paragraphsToHtml(v?.paragraphs ?? []);
      return { section: k, html };
    })
    .filter((r) => r.html);
  if (!rows.length) throw new WriterError("Claude returned empty text. Try again.");
  await addTexts(
    opts.reportId,
    rows.map((r) => ({ ...r, source: opts.instruction?.trim() ? "ai_rewrite" : "ai", instruction: opts.instruction?.trim() || null, createdBy: opts.actor.id })),
  );
  return { written: rows.map((r) => r.section), model: res.model };
}
