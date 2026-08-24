"use server";

import { z } from "zod";
import { mathItems } from "@/db/schema";
import { withParentContext } from "@/db";
import { requireParentModeUnlocked } from "@/lib/data/dal";

const AddMathQuestionSchema = z.object({
  grade: z.union([z.literal(2), z.literal(4)]),
  domain: z.enum(["NR", "PAR", "MDR", "GSR"]),
  topic: z.string().trim().min(1).max(64),
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().trim().min(1).max(500),
  choices: z.array(z.string().trim().min(1).max(120)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(500).optional(),
});

export type AddMathQuestionInput = z.infer<typeof AddMathQuestionSchema>;

/** Parent-only: adds a custom question to the family's own math bank (parentId set — never touches the shared parentId-NULL seed bank). */
export async function addMathQuestion(input: AddMathQuestionInput): Promise<void> {
  const parentId = await requireParentModeUnlocked();
  const parsed = AddMathQuestionSchema.parse(input);

  await withParentContext(parentId, (tx) =>
    tx.insert(mathItems).values({
      parentId,
      grade: parsed.grade,
      domain: parsed.domain,
      topic: parsed.topic,
      code: `${parsed.grade}.${parsed.domain}.custom-${Date.now().toString(36)}`,
      difficulty: parsed.difficulty,
      prompt: parsed.prompt,
      choices: parsed.choices,
      answerIndex: parsed.answerIndex,
      explanation: parsed.explanation?.trim() || "Nice work!",
    })
  );
}
