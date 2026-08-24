import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { generateWeeklyReadFallback, type MasteryRow } from "@/lib/domains";

const MODEL = "claude-haiku-4-5-20251001";

export interface WeeklyRead {
  strengthText: string;
  focusText: string;
  tip: string;
  weakestAccuracy: number | null;
  /** true when this came from a real Claude Haiku call rather than the deterministic fallback. */
  aiGenerated: boolean;
}

const WEEKLY_READ_TOOL = {
  name: "submit_weekly_read",
  description: "Submit the weekly progress summary for a parent.",
  input_schema: {
    type: "object" as const,
    properties: {
      strengthText: { type: "string" as const, description: "Short phrase naming the child's current strength area(s), e.g. \\\"multiplication and reading comprehension\\\"." },
      focusText: { type: "string" as const, description: "Short phrase naming the one area most worth focused practice this week." },
      tip: { type: "string" as const, description: "One concrete, parent-actionable suggestion for helping with the focus area, in a warm, practical tone." },
    },
    required: ["strengthText", "focusText", "tip"],
  },
};

/**
 * Short weekly progress note for a parent. Falls back to a deterministic,
 * non-AI summary computed from the same mastery data when ANTHROPIC_API_KEY
 * isn't configured — see docs/architecture/decisions.md.
 */
export async function generateWeeklyRead(childName: string, grade: number, mastery: MasteryRow[]): Promise<WeeklyRead> {
  const fallback = generateWeeklyReadFallback(mastery);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ...fallback, aiGenerated: false };

  const withData = mastery.filter((m) => m.attempted > 0);
  if (withData.length === 0) return { ...fallback, aiGenerated: false };

  try {
    const client = new Anthropic({ apiKey });
    const summary = withData
      .map((m) => `${m.subject}/${m.domain}: level ${m.level}/5, ${m.correct}/${m.attempted} correct (${Math.round((m.correct / m.attempted) * 100)}%)`)
      .join("\n");
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "You are writing a short, warm weekly progress note for a parent about their child's practice on a Georgia-standards-aligned math and reading app. Be specific, encouraging, and brief. You always respond by calling the submit_weekly_read tool.",
      messages: [
        {
          role: "user",
          content: `Child: ${childName}, grade ${grade}.\n\nThis week's mastery data (subject/domain: level, accuracy):\n${summary}`,
        },
      ],
      tools: [WEEKLY_READ_TOOL],
      tool_choice: { type: "tool", name: "submit_weekly_read" },
    });
    const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUse) throw new Error("Claude did not return a tool_use block");
    const input = toolUse.input as { strengthText: string; focusText: string; tip: string };
    return { ...input, weakestAccuracy: fallback.weakestAccuracy, aiGenerated: true };
  } catch (err) {
    console.error("[ai/weekly-read] Claude Haiku call failed:", err);
    return { ...fallback, aiGenerated: false };
  }
}
