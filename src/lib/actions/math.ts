"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withParentContext } from "@/db";
import { children, domainMastery, sessionLog, rewardEvents, rewardSettings } from "@/db/schema";
import { requireChild } from "@/lib/data/dal";
import { minutesToPoints } from "@/lib/rewards";

const FinishMathSessionSchema = z.object({
  childId: z.string().uuid(),
  domain: z.enum(["NR", "PAR", "MDR", "GSR"]),
  topic: z.string().min(1).max(64),
  mode: z.enum(["time", "count"]),
  target: z.number().int().positive(),
  timeLimitMin: z.number().int().positive().max(60).nullable(),
  correct: z.number().int().min(0),
  attempted: z.number().int().min(0),
  newLevel: z.number().int().min(1).max(5),
  minutesSpent: z.number().min(0),
});

export type FinishMathSessionInput = z.infer<typeof FinishMathSessionSchema>;

export interface FinishMathSessionResult {
  pointsEarned: number;
}

/**
 * Records the outcome of one completed math practice session: upserts the
 * child's mastery for that domain, logs the session (drives the parent
 * Overview time chart), converts practiced minutes into reward points, and
 * updates the child's banked leftover minutes. Everything happens in one
 * withParentContext transaction so a crash mid-way can't leave mastery
 * updated but no session logged (or vice versa).
 */
export async function finishMathSession(input: FinishMathSessionInput): Promise<FinishMathSessionResult> {
  const parsed = FinishMathSessionSchema.parse(input);
  const child = await requireChild(parsed.childId); // re-verifies ownership — this is a Server Action, reachable by direct POST

  return withParentContext(child.parentId, async (tx) => {
    const existing = await tx
      .select()
      .from(domainMastery)
      .where(and(eq(domainMastery.childId, child.id), eq(domainMastery.subject, "math"), eq(domainMastery.domain, parsed.domain)));

    if (existing[0]) {
      await tx
        .update(domainMastery)
        .set({
          level: parsed.newLevel,
          correct: existing[0].correct + parsed.correct,
          attempted: existing[0].attempted + parsed.attempted,
          updatedAt: new Date(),
        })
        .where(eq(domainMastery.id, existing[0].id));
    } else {
      await tx.insert(domainMastery).values({
        childId: child.id,
        subject: "math",
        domain: parsed.domain,
        level: parsed.newLevel,
        correct: parsed.correct,
        attempted: parsed.attempted,
      });
    }

    await tx.insert(sessionLog).values({
      childId: child.id,
      subject: "math",
      domain: parsed.domain,
      mode: parsed.mode,
      target: parsed.target,
      timeLimitMin: parsed.timeLimitMin,
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
