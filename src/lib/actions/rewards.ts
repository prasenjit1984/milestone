"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { withParentContext } from "@/db";
import { rewardSettings, rewardEvents } from "@/db/schema";
import { requireParentModeUnlocked, requireChild } from "@/lib/data/dal";
import { getRewardBalance } from "@/lib/data/dashboard";

const UpdateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  minutesPerPoint: z.number().int().min(5).max(180).optional(),
  pointsPerDollar: z.number().int().min(1).max(50).optional(),
});

/** Parent-only: adjusts the shared reward levers. Re-verifies the Parent Mode PIN gate independently, since this is a Server Action reachable by direct POST. */
export async function updateRewardSettings(input: z.infer<typeof UpdateSettingsSchema>): Promise<void> {
  const parentId = await requireParentModeUnlocked();
  const patch = UpdateSettingsSchema.parse(input);
  if (Object.keys(patch).length === 0) return;

  await withParentContext(parentId, async (tx) => {
    const existing = await tx.select().from(rewardSettings).where(eq(rewardSettings.parentId, parentId));
    if (existing[0]) {
      await tx.update(rewardSettings).set(patch).where(eq(rewardSettings.parentId, parentId));
    } else {
      await tx.insert(rewardSettings).values({ parentId, ...patch });
    }
  });
}

const RedeemSchema = z.object({ childId: z.string().uuid() });

export interface RedeemResult {
  newBalance: number;
}

/** Parent-only: marks a child's full current balance as paid out. */
export async function redeemPoints(input: z.infer<typeof RedeemSchema>): Promise<RedeemResult> {
  await requireParentModeUnlocked();
  const { childId } = RedeemSchema.parse(input);
  const child = await requireChild(childId);
  const balance = await getRewardBalance(childId);
  if (balance <= 0) return { newBalance: 0 };

  await withParentContext(child.parentId, (tx) =>
    tx.insert(rewardEvents).values({ childId, kind: "redeemed", points: balance, note: "Paid out" })
  );
  return { newBalance: 0 };
}
