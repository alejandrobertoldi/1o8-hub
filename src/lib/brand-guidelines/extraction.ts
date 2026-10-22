// IMPORTANT: import from pdf-parse/lib/pdf-parse.js, not "pdf-parse" — the
// package's index.js does a "if (!module.parent)" debug check at load time
// that tries to read a test PDF and crashes Next.js's webpack bundler.
//
// @types/pdf-parse only declares the root entry point ("pdf-parse"); it does
// not ship a subpath declaration for "pdf-parse/lib/pdf-parse.js". Suppress
// the implicit-any on the import line and narrow the return type at call-site
// instead of changing the runtime import path.
// @ts-expect-error -- subpath has no bundled declaration; runtime types narrowed inline below.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";
import {
  BRAND_BOOK_TO_MD_PROMPT,
  BRAND_BOOK_SUMMARY_PROMPT,
  BRAND_SUMMARY_TOOL_SCHEMA,
} from "./prompts";
import { summaryAllSchema, type SummaryAll } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_MD = 16000;
const MAX_TOKENS_SUMMARY = 4000;

// Cap input to ~150k tokens worth of chars (≈ 600k chars at 4 chars/tok).
// Brand books rarely exceed this; the cap protects against runaway PDFs.
const MAX_TEXT_CHARS = 600_000;

export interface RunExtractionArgs {
  versionId: string;
  clientIdCode: string;
  pdfBuffer: Buffer;
}

async function setStage(clientIdCode: string, stage: string | null): Promise<void> {
  await db.update(clientBrandGuidelines)
    .set({ extractionStage: stage, updatedAt: new Date() })
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
}

export async function runExtraction(args: RunExtractionArgs): Promise<void> {
  const { versionId, clientIdCode, pdfBuffer } = args;
  const anthropic = new Anthropic();

  try {
    await setStage(clientIdCode, "parsing_pdf");
    const parsed = (await pdfParse(pdfBuffer)) as { text: string; numpages: number };
    const rawText = parsed.text.length > MAX_TEXT_CHARS
      ? parsed.text.slice(0, MAX_TEXT_CHARS)
      : parsed.text;
    const numpages: number = parsed.numpages;

    await setStage(clientIdCode, "extracting_md");
    const mdResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_MD,
      system: BRAND_BOOK_TO_MD_PROMPT,
      messages: [{ role: "user", content: rawText }],
    });
    const mdBlock = mdResp.content.find((b) => b.type === "text");
    const extractedMd = mdBlock && mdBlock.type === "text" ? mdBlock.text : "";

    await setStage(clientIdCode, "extracting_summary");
    const summaryResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_SUMMARY,
      system: BRAND_BOOK_SUMMARY_PROMPT,
      messages: [{ role: "user", content: extractedMd }],
      tools: [{
        name: "save_summary",
        description: "Save the extracted brand summary",
        input_schema: BRAND_SUMMARY_TOOL_SCHEMA,
      }],
      tool_choice: { type: "tool", name: "save_summary" },
    });

    const toolBlock = summaryResp.content.find(
      (b) => b.type === "tool_use" && b.name === "save_summary"
    );
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Claude did not return a save_summary tool_use block");
    }
    const summary: SummaryAll = summaryAllSchema.parse(toolBlock.input);

    await setStage(clientIdCode, "saving");
    await db.transaction(async (tx) => {
      await tx.update(clientBrandGuidelineVersions)
        .set({ extractedMd, pageCount: numpages })
        .where(eq(clientBrandGuidelineVersions.id, versionId));
      await tx.update(clientBrandGuidelines)
        .set({
          summaryLogo: summary.logo,
          summaryColors: summary.colors,
          summaryTypography: summary.typography,
          summaryVoice: summary.voice,
          extractionStatus: "idle",
          extractionStage: null,
          lastExtractedAt: new Date(),
          lastExtractionModel: MODEL,
          lastExtractionError: null,
          updatedAt: new Date(),
        })
        .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
    });
  } catch (err) {
    await db.update(clientBrandGuidelines)
      .set({
        extractionStatus: "failed",
        extractionStage: null,
        lastExtractionError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode));
    throw err;
  }
}
