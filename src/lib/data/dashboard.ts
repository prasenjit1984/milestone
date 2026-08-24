import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { withParentContext } from "@/db";
import { sessionLog, domainMastery, rewardEvents, rewardSettings, writingEvaluations, mathItems, readingPassages, children } from "@/db/schema";
import { requireParentId, requireChild } from "@/lib/data/dal";

export type SessionLogRow = typeof sessionLog.$inferSelect;
export type RewardEventRow = typeof rewardEvents.$inferSelect;
export type RewardSettingsRow = typeof rewardSettings.$inferSelect;
export type WritingEvaluationRow = typeof writingEvaluations.$inferSelect;

/** Session log entries for one child from `since` onward (defaults to 7 days back). */
export async function getSessionLog(childId: string, days = 7): Promise<SessionLogRow[]> {
  const child = await requireChild(childId);
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return withParentContext(child.parentId, (tx) =>
    tx
      .select()
      .from(sessionLog)
      .where(and(eq(sessionLog.childId, childId), gte(sessionLog.at, since)))
      .orderBy(sessionLog.at)
  );
}

export async function getMasteryForOverview(childId: string) {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) => tx.select().from(domainMastery).where(eq(domainMastery.childId, childId)));
}

/** Ensures a reward_settings row exists for this parent, then returns it. */
export async function getRewardSettings(): Promise<RewardSettingsRow> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    const rows = await tx.select().from(rewardSettings).where(eq(rewardSettings.parentId, parentId));
    if (rows[0]) return rows[0];
    const inserted = await tx.insert(rewardSettings).values({ parentId }).returning();
    return inserted[0];
  });
}

export async function getRewardEvents(childId: string, limit = 10): Promise<RewardEventRow[]> {
  const child = await requireChild(childId);
  return withParentContext(child.parentId, (tx) =>
    tx.select().from(rewardEvents).where(eq(rewardEvents.childId, childId)).orderBy(desc(rewardEvents.at)).limit(limit)
  );
}

/** Current point balance = sum(earned) - sum(redeemed), computed in SQL. */
export async function getRewardBalance(childId: string): Promise<number> {
  const child = await requireChild(childId);
  const rows = await withParentContext(child.parentId, (tx) => tx.select().from(rewardEvents).where(eq(rewardEvents.childId, childId)));
  return rows.reduce((sum, e) => sum + (e.kind === "earned" ? e.points : -e.points), 0);
}

export async function getEvaluations(childId?: string): Promise<WritingEvaluationRow[]> {
  const parentId = await requireParentId();
  return withParentContext(parentId, async (tx) => {
    // Evaluations are child-scoped, not parent-scoped directly — join through
    // children so RLS's writing_evaluations_owner policy applies, and so a
    // childId filter (when given) can't be used to probe another family's data:
    // requireChild() below re-verifies ownership before we ever filter by it.
    if (childId) {
      await requireChild(childId);
      return tx.select().from(writingEvaluations).where(eq(writingEvaluations.childId, childId)).orderBy(desc(writingEvaluations.at));
    }
    const owned = await tx.select({ id: children.id }).from(children).where(eq(children.parentId, parentId));
    const ids = new Set(owned.map((c) => c.id));
    const all = await tx.select().from(writingEvaluations).orderBy(desc(writingEvaluations.at));
    return all.filter((e) => ids.has(e.childId));
  });
}

/** The family's own custom math questions (parentId = this parent), for the content bank list. */
export async function getOwnMathItems() {
  const parentId = await requireParentId();
  return withParentContext(parentId, (tx) => tx.select().from(mathItems).where(eq(mathItems.parentId, parentId)).orderBy(desc(mathItems.createdAt)));
}

export async function getReadingPassageTitles() {
  const parentId = await requireParentId();
  return withParentContext(parentId, (tx) => tx.select({ id: readingPassages.id, title: readingPassages.title }).from(readingPassages));
}
