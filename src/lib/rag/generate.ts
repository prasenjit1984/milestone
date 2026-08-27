import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Same model tier as evaluate.ts and pdf-extract.ts's OCR fallback — this is
// a periodic, parent-triggered call, not per-kid-session, so cost stays low
// regardless of tier. Check https://docs.claude.com/en/docs/about-claude/models
// if Anthropic ships a newer Haiku and this should move forward.
const MODEL = "claude-haiku-4-5-20251001";

export interface GeneratedMathDraft {
  topic: string;
  difficulty: number;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface GeneratedReadingDraft {
  title: string;
  kind: "story" | "informational";
  body: string;
  mc: { prompt: string; choices: string[]; answerIndex: number }[];
  writing: { type: "summary" | "opinion"; prompt: string; starter: string; exemplar: string; keywords: string[] }[];
}

const MATH_TOOL = {
  name: "submit_math_drafts",
  description: "Submit draft multiple-choice math questions grounded strictly in the provided source text.",
  input_schema: {
    type: "object" as const,
    properties: {
      drafts: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            topic: { type: "string" as const, description: "Short kebab-case topic slug, e.g. 'add-sub-2digit' or 'fractions-measurement'." },
            difficulty: { type: "integer" as const, description: "1 (easiest) to 5 (hardest), relative to the given grade." },
            prompt: { type: "string" as const, description: "The question itself, in the source material's style." },
            choices: { type: "array" as const, items: { type: "string" as const }, description: "Exactly 4 answer choices, one correct." },
            answerIndex: { type: "integer" as const, description: "0-3, index into choices of the correct answer." },
            explanation: { type: "string" as const, description: "1-2 sentences shown to the kid after they answer, explaining the correct answer." },
          },
          required: ["topic", "difficulty", "prompt", "choices", "answerIndex", "explanation"],
        },
      },
    },
    required: ["drafts"],
  },
};

const READING_TOOL = {
  name: "submit_reading_drafts",
  description: "Submit a draft reading passage, adapted from the provided source text, with comprehension and writing questions.",
  input_schema: {
    type: "object" as const,
    properties: {
      drafts: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            kind: { type: "string" as const, enum: ["story", "informational"] },
            body: {
              type: "string" as const,
              description: "The passage itself: grade-appropriate, self-contained, adapted/condensed from the source material — not copied verbatim.",
            },
            mc: {
              type: "array" as const,
              description: "2-4 multiple-choice comprehension questions about the passage.",
              items: {
                type: "object" as const,
                properties: {
                  prompt: { type: "string" as const },
                  choices: { type: "array" as const, items: { type: "string" as const }, description: "Exactly 4 choices." },
                  answerIndex: { type: "integer" as const, description: "0-3." },
                },
                required: ["prompt", "choices", "answerIndex"],
              },
            },
            writing: {
              type: "array" as const,
              description: "1-2 short-answer writing prompts about the passage.",
              items: {
                type: "object" as const,
                properties: {
                  type: { type: "string" as const, enum: ["summary", "opinion"] },
                  prompt: { type: "string" as const },
                  starter: { type: "string" as const, description: "A sentence starter to help the kid begin writing." },
                  exemplar: { type: "string" as const, description: "A model answer at the target grade level." },
                  keywords: { type: "array" as const, items: { type: "string" as const }, description: "Words a strong answer would likely use." },
                },
                required: ["type", "prompt", "starter", "exemplar", "keywords"],
              },
            },
          },
          required: ["title", "kind", "body", "mc", "writing"],
        },
      },
    },
    required: ["drafts"],
  },
};

/**
 * Generation is a hard requirement, not a degrade-gracefully case like
 * evaluateWriting's "pending" placeholder or embedTexts' null vectors —
 * there's no honest stand-in for "a question we didn't actually generate."
 * Callers (generateDraftsFromChunks) let this bubble up as a clear error
 * instead, matching how importSourceDocument surfaces a failed Drive
 * download rather than inventing a fake result.
 */
function requireApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI content generation isn't configured yet — set ANTHROPIC_API_KEY in the deployment settings.");
  }
  return apiKey;
}

/** Generates `count` draft math questions grounded in `sourceText`, via a schema-locked Claude tool call. */
export async function generateMathDrafts(opts: { grade: number; domain: string; count: number; sourceText: string }): Promise<GeneratedMathDraft[]> {
  const client = new Anthropic({ apiKey: requireApiKey() });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      "You are an elementary-school math curriculum writer. You are given real pages from a workbook PDF and must write NEW multiple-choice practice questions grounded in that material — same skills, same style and difficulty range, but not copied verbatim (never reuse a question's exact wording or numbers from the source). Every question must have exactly 4 choices with exactly one correct answer. You always respond by calling the submit_math_drafts tool.",
    messages: [
      {
        role: "user",
        content: `Grade ${opts.grade} math, domain ${opts.domain}. Write ${opts.count} draft questions grounded in this source material:\n\n${opts.sourceText}`,
      },
    ],
    tools: [MATH_TOOL],
    tool_choice: { type: "tool", name: "submit_math_drafts" },
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block for math draft generation.");
  const input = toolUse.input as { drafts: GeneratedMathDraft[] };
  return input.drafts;
}

/** Generates `count` draft reading passages grounded in `sourceText`, via a schema-locked Claude tool call. */
export async function generateReadingDrafts(opts: { grade: number; topic?: string; count: number; sourceText: string }): Promise<GeneratedReadingDraft[]> {
  const client = new Anthropic({ apiKey: requireApiKey() });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system:
      "You are an elementary-school reading curriculum writer. You are given real pages from a source PDF and must write NEW self-contained reading passages adapted from that material — grade-appropriate length and vocabulary, not copied verbatim — plus multiple-choice comprehension questions and short writing prompts about each passage. You always respond by calling the submit_reading_drafts tool.",
    messages: [
      {
        role: "user",
        content: `Grade ${opts.grade} reading${opts.topic ? `, topic: ${opts.topic}` : ""}. Write ${opts.count} draft passage(s) adapted from this source material:\n\n${opts.sourceText}`,
      },
    ],
    tools: [READING_TOOL],
    tool_choice: { type: "tool", name: "submit_reading_drafts" },
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block for reading draft generation.");
  const input = toolUse.input as { drafts: GeneratedReadingDraft[] };
  return input.drafts;
}
