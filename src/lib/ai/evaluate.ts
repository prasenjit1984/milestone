import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { WritingTone } from "@/lib/ai/tone";

// Pinned model id — check https://docs.claude.com/en/docs/about-claude/models
// if Anthropic ships a newer Haiku and this should move forward.
const MODEL = "claude-haiku-4-5-20251001";

export interface WritingEvalResult {
  semanticNote: string;
  grammarNotes: string[];
  spellingNotes: string[];
  suggested: string;
  tone: WritingTone;
}

const EVAL_TOOL = {
  name: "submit_evaluation",
  description: "Submit the structured evaluation of a student's written response.",
  input_schema: {
    type: "object" as const,
    properties: {
      tone: {
        type: "string" as const,
        enum: ["on-target", "getting-there", "nice-try"],
        description:
          "Overall quality: on-target = clearly answers the prompt with real detail from the passage; getting-there = on-topic but thin or vague; nice-try = too short, off-topic, or missing.",
      },
      semanticNote: { type: "string" as const, description: "1-2 sentences, parent-facing, on whether the answer addresses the prompt and uses the passage as evidence." },
      grammarNotes: { type: "array" as const, items: { type: "string" as const }, description: "Short, specific grammar observations. Empty array if nothing notable." },
      spellingNotes: { type: "array" as const, items: { type: "string" as const }, description: "Specific misspelled words and the likely intended word, e.g. \\\"teh\\\" -> \\\"the\\\". Empty array if none." },
      suggested: { type: "string" as const, description: "A model answer at the student's grade level — encouraging, concrete, grounded in the passage." },
    },
    required: ["tone", "semanticNote", "grammarNotes", "spellingNotes", "suggested"],
  },
};

/**
 * Grades one written response (a reading-passage summary or opinion answer)
 * with Claude Haiku. Gracefully degrades — rather than silently faking a
 * grade — when ANTHROPIC_API_KEY isn't configured: the kid's answer is still
 * saved, but the response comes back with tone "pending" and an honest note
 * that AI evaluation isn't turned on yet. See docs/architecture/decisions.md
 * for why this shape was chosen over a mock heuristic.
 */
export async function evaluateWriting(
  answer: string,
  opts: { grade: number; type: "summary" | "opinion"; prompt: string; passageBody: string; exemplar: string; keywords: string[] }
): Promise<WritingEvalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      semanticNote: "AI evaluation isn't turned on for this account yet — a parent can add an Anthropic API key in the deployment settings to enable grading.",
      grammarNotes: [],
      spellingNotes: [],
      suggested: opts.exemplar,
      tone: "pending",
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system:
        "You are a patient, encouraging elementary-school reading teacher. You grade a student's written response to a reading passage — a short summary or an opinion piece — the same way a kind teacher would: honest about what's missing, warm about what's working, and always grounded in specific details from the passage rather than generic praise or criticism. You always respond by calling the submit_evaluation tool.",
      messages: [
        {
          role: "user",
          content: `Grade ${opts.grade} student. Prompt type: ${opts.type}.\n\nPassage:\n${opts.passageBody}\n\nQuestion/prompt given to the student:\n${opts.prompt}\n\nStudent's answer:\n${answer}\n\nEvaluate this answer.`,
        },
      ],
      tools: [EVAL_TOOL],
      tool_choice: { type: "tool", name: "submit_evaluation" },
    });

    const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUse) throw new Error("Claude did not return a tool_use block");
    const input = toolUse.input as {
      tone: "on-target" | "getting-there" | "nice-try";
      semanticNote: string;
      grammarNotes: string[];
      spellingNotes: string[];
      suggested: string;
    };
    return { ...input };
  } catch (err) {
    console.error("[ai/evaluate] Claude Haiku call failed:", err);
    return {
      semanticNote: "AI evaluation hit an error while grading this answer — it's saved, and you can try again later.",
      grammarNotes: [],
      spellingNotes: [],
      suggested: opts.exemplar,
      tone: "pending",
    };
  }
}
