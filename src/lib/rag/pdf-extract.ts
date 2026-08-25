import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import Anthropic from "@anthropic-ai/sdk";

// Pinned model id — check https://docs.claude.com/en/docs/about-claude/models
// if Anthropic ships a newer Haiku and this should move forward. Same model
// tier as src/lib/ai/evaluate.ts; this is a periodic, parent-triggered call
// (not per-kid-session), so cost stays low regardless of tier.
const MODEL = "claude-haiku-4-5-20251001";

export interface ExtractedPage {
  page: number; // 1-indexed
  text: string;
}

/**
 * Extracts per-page text from a digital-text PDF (one with an actual text
 * layer — the common case for worksheets exported from Docs/Word). Free,
 * no API call. Returns empty strings for pages with no extractable text,
 * which is exactly the signal looksScanned() below uses.
 */
export async function extractDigitalText(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: false });
  return text.map((t, i) => ({ page: i + 1, text: t.trim() }));
}

/**
 * A PDF with almost no extractable text per page is very likely scanned
 * images rather than digital text — extractDigitalText() will have returned
 * near-empty strings. Threshold is deliberately low (not "is this a good
 * amount of text," just "is there basically nothing here") since a short
 * worksheet page can legitimately have little text.
 */
export function looksScanned(pages: ExtractedPage[]): boolean {
  if (pages.length === 0) return true;
  const avgLen = pages.reduce((sum, p) => sum + p.text.length, 0) / pages.length;
  return avgLen < 20;
}

const TRANSCRIBE_TOOL = {
  name: "submit_transcription",
  description: "Submit the transcribed text for every page of the PDF.",
  input_schema: {
    type: "object" as const,
    properties: {
      pages: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            page: { type: "integer" as const, description: "1-indexed page number" },
            text: { type: "string" as const, description: "All the readable text on this page, transcribed as plain text" },
          },
          required: ["page", "text"],
        },
      },
    },
    required: ["pages"],
  },
};

/**
 * Fallback for scanned/image-based PDFs: Claude reads the PDF natively (as
 * page images, via the API's document content-block support) and
 * transcribes each page's text. Ordinary API tokens, no separate OCR
 * service. Only called when extractDigitalText() came back too sparse to
 * be useful — see looksScanned() above.
 *
 * Claude's PDF support tops out around 100 pages per call; for anything
 * larger this would need to be split into page-range batches. Not needed
 * yet at this project's "moderate library" scale (worksheets are typically
 * a handful to a couple dozen pages) — revisit if that changes.
 */
export async function transcribeScannedPdf(bytes: Uint8Array, pageCountHint: number): Promise<ExtractedPage[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "This looks like a scanned PDF (no extractable text layer) — transcribing it needs an ANTHROPIC_API_KEY configured, same as the writing-evaluation feature."
    );
  }

  const client = new Anthropic({ apiKey });
  const base64 = Buffer.from(bytes).toString("base64");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      "You transcribe scanned worksheet/curriculum PDFs into plain text, page by page. Transcribe exactly what's on each page — questions, instructions, labels — without summarizing or correcting anything. You always respond by calling the submit_transcription tool.",
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: `Transcribe every page of this ${pageCountHint}-page PDF.` },
        ],
      },
    ],
    tools: [TRANSCRIBE_TOOL],
    tool_choice: { type: "tool", name: "submit_transcription" },
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block while transcribing the PDF");
  const input = toolUse.input as { pages: { page: number; text: string }[] };
  return input.pages.map((p) => ({ page: p.page, text: p.text.trim() }));
}
