/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// Document Text Extraction API
// POST /api/extract-doc
// Supports: .pdf (via Claude vision), .docx/.doc (mammoth), .txt/.md (native)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Max file size: 20MB (Anthropic PDF limit is 32MB base64 ≈ 24MB raw)
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 20MB. Try compressing or splitting the PDF.` },
        { status: 413 }
      );
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ── TXT / MD — read directly ──────────────────────────
    if (ext === "txt" || ext === "md") {
      const text = buffer.toString("utf-8");
      return NextResponse.json({ text, filename, method: "plaintext" });
    }

    // ── DOCX / DOC — mammoth ──────────────────────────────
    if (ext === "docx" || ext === "doc") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value?.trim() ?? "";
        if (!text) throw new Error("empty");
        return NextResponse.json({ text, filename, method: "mammoth" });
      } catch {
        const text = await extractDocxFallback(buffer);
        if (text) return NextResponse.json({ text, filename, method: "docx-fallback" });
        return NextResponse.json({ error: "Could not extract DOCX content." }, { status: 422 });
      }
    }

    // ── PDF — send to Claude as base64 document ───────────
    if (ext === "pdf") {
      try {
        const base64 = buffer.toString("base64");
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16384,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: base64,
                  },
                } as any,
                {
                  type: "text",
                  text: "Extract ALL text from this document exactly as written. Return only the raw text content, preserving paragraphs and structure. No commentary, no summaries, no formatting changes.",
                },
              ],
            },
          ],
        });

        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("")
          .trim();

        if (!text) {
          return NextResponse.json(
            { error: "PDF appears to be empty or image-only with no readable text." },
            { status: 422 }
          );
        }
        return NextResponse.json({ text, filename, method: "claude-pdf" });
      } catch (err: any) {
        return NextResponse.json(
          { error: `PDF extraction failed: ${err.message}` },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 415 });
  } catch (err: any) {
    console.error("extract-doc error:", err);
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}

// ── Zero-dependency DOCX fallback ─────────────────────────────
async function extractDocxFallback(buffer: Buffer): Promise<string> {
  try {
    const { inflateRawSync } = await import("zlib");
    const data = buffer;
    let offset = 0;
    while (offset < data.length - 4) {
      if (
        data[offset] === 0x50 && data[offset + 1] === 0x4b &&
        data[offset + 2] === 0x03 && data[offset + 3] === 0x04
      ) {
        const compression = data.readUInt16LE(offset + 8);
        const compressedSize = data.readUInt32LE(offset + 18);
        const filenameLen = data.readUInt16LE(offset + 26);
        const extraLen = data.readUInt16LE(offset + 28);
        const filenameStart = offset + 30;
        const entryName = data.slice(filenameStart, filenameStart + filenameLen).toString("utf-8");
        const dataStart = filenameStart + filenameLen + extraLen;
        if (entryName === "word/document.xml" && compressedSize > 0) {
          const compressed = data.slice(dataStart, dataStart + compressedSize);
          const xmlBuf = compression === 0 ? compressed : inflateRawSync(compressed);
          return xmlBuf.toString("utf-8")
            .replace(/<w:br[^>]*\/>/g, "\n")
            .replace(/<w:p[ >][^>]*>/g, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
        }
        offset = dataStart + (compressedSize || 1);
      } else {
        offset++;
      }
    }
    return "";
  } catch {
    return "";
  }
}
