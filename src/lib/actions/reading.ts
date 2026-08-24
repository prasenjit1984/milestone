"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withParentContext } from "@/db";
import { children, domainMastery, sessionLog, rewardEvents, rewardSettings, readingPassages, writingEvaluations } from "@/db/schema";
import { requireChild } from "@/lib/data/dal";
import { minutesToPoints } from "@/lib/rewards";
import { evaluateWriting, type WritingEvalResult } from "@/lib/ai/evaluate";

async function upsertMastery(
  tx: Parameters<Parameters<typeof withParentContext>[1]>[0],
  childId: string,
  domain: string,
  correct: number,
  delta: number
) {
  const existing = await tx
    .select()
    .from(domainMastery)
    .where(and(eq(domainMastery.childId, childId), eq(domainMastery.subject, "reading"), eq(domainMastery.domain, domain)));
  if (existing[0]) {
    const newLevel = Math.max(1, Math.min(5, existing[0].level + delta));
    await tx
      .update(domainMastery)
      .set({ level: newLevel, correct: existing[0].correct + correct, attempted: existing[0].attempted + 1, updatedAt: new Date() })
      .where(eq(domainMastery.id, existing[0].id));
  } else {
    const newLevel = Math.max(1, Math.min(5, 2 + delta));
    await tx.insert(domainMastery).values({ childId, subject: "reading", domain, level: newLevel, correct, attempted: 1 });
  }
}

const RecordMcSchema = z.object({
  childId: z.string().uuid(),
  isCorrect: z.boolean(),
});

/** One reading-comprehension multiple-choice question answered. Updates mastery only — the session's total time is logged once at finish. */
export async function recordMcAnswer(input: z.infer<typeof RecordMcSchema>): Promise<void> {
  const parsed = RecordMcSchema.parse(input);
  const child = await requireChild(parsed.childId);
  await withParentContext(child.parentId, (tx) => upsertMastery(tx, child.id, "comprehension", parsed.isCorrect ? 1 : 0, parsed.isCorrect ? 1 : -1));
}

const SubmitWritingSchema = z.object({
  childId: z.string().uuid(),
  passageId: z.string().uuid(),
  promptIndex: z.number().int().min(0),
  answer: z.string().min(1).max(4000),
});

export interface SubmitWritingResult extends WritingEvalResult {
  promptType: "summary" | "opinion";
}

/** Grades one written response (AI, or a graceful "not configured" state — see src/lib/ai/evaluate.ts) and records the result. */
export async function submitWriting(input: z.infer<typeof SubmitWritingSchema>): Promise<SubmitWritingResult> {
  const parsed = SubmitWritingSchema.parse(input);
  const child = await requireChild(parsed.childId);

  return withParentContext(child.parentId, async (tx) => {
    const rows = await tx.select().from(readingPassages).where(eq(readingPassages.id, parsed.passageId));
    const passage = rows[0];
    if (!passage) throw new Error("Passage not found");
    const item = passage.writing[parsed.promptIndex];
    if (!item) throw new Error("Writing prompt not found");

    const result = await evaluateWriting(parsed.answer, {
      grade: child.grade,
      type: item.type,
      prompt: item.prompt,
      passageBody: passage.body,
      exemplar: item.exemplar,
      keywords: item.keywords,
    });

    const delta = result.tone === "on-target" ? 1 : result.tone === "nice-try" ? -1 : 0;
    await upsertMastery(tx, child.id, item.type, result.tone === "on-target" ? 1 : 0, delta);

    await tx.insert(writingEvaluations).values({
      childId: child.id,
      passageId: passage.id,
      promptType: item.type,
      answer: parsed.answer,
      semanticNote: result.semanticNote,
      grammarNotes: result.grammarNotes,
      spellingNotes: result.spellingNotes,
      suggested: result.suggested,
      tone: result.tone,
    });

    return { ...result, promptType: item.type };
  });
}

const FinishReadingSessionSchema = z.object({
  childId: z.string().uuid(),
  mode: z.enum(["time", "count"]),
  target: z.number().int().positive(),
  correct: z.number().int().min(0),
  attempted: z.number().int().min(0),
  minutesSpent: z.number().min(0),
});

export interface FinishReadingSessionResult {
  pointsEarned: number;
}

/** Logs the aggregate session (drives the time chart) and converts minutes into reward points. Mastery is already updated per-item by recordMcAnswer/submitWriting above. */
export async function finishReadingSession(input: z.infer<typeof FinishReadingSessionSchema>): Promise<FinishReadingSessionResult> {
  const parsed = FinishReadingSessionSchema.parse(input);
  const child = await requireChild(parsed.childId);

  return withParentContext(child.parentId, async (tx) => {
    await tx.insert(sessionLog).values({
      childId: child.id,
      subject: "reading",
      domain: "overall",
      mode: parsed.mode,
      target: parsed.target,
      minutesSpent: parsed.minutesSpent,
      correct: parsed.correct,
      attempted: parsed.attempted,
    });

    const settingsRows = await tx.select().from(rewardSettings).where(eq(rewardSettings.parentId, child.parentId));
    const settings = settingsRows[0] ?? { minutesPerPoint: 30, pointsPerDollar: 5, enabled: true };
    const { pointsEarned, leftoverMinutes } = minutesToPoints(child.leftoverMinutes, parsed.minutesSpent, settings);

    await tx.update(children).set({ leftoverMinutes }).where(eq(children.id, child.id));
    if (pointsEarned > 0) {
      await tx.insert(rewardEvents).values({ childId: child.id, kind: "earned", points: pointsEarned, note: "Practice session" });
    }

    return { pointsEarned };
  });
}
